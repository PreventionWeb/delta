import "../../../db/setup";
import "reflect-metadata";

import { randomUUID } from "crypto";
import {
	describe,
	it,
	expect,
	vi,
	beforeAll,
	beforeEach,
	afterEach,
} from "vitest";
import { Test, type TestingModule } from "@nestjs/testing";
import { RouterContextProvider } from "react-router";

import { HazardousEventsModule } from "~/domains/hazardous-events/infrastructure/HazardousEventsModule.server";
import { HAZARDOUS_EVENT_REPOSITORY } from "~/domains/hazardous-events/infrastructure/HazardousEventRepositoryToken";
import type { IHazardousEventRepository } from "~/domains/hazardous-events/application/ports/IHazardousEventRepository";
import { HazardousEvent } from "~/domains/hazardous-events/domain/HazardousEvent";
import { CreateHazardousEventUseCase } from "~/domains/hazardous-events/application/use-cases/CreateHazardousEvent";
import { ProcessWorkflowActionUseCase } from "~/domains/validation-workflow/application/use-cases/ProcessWorkflowAction";
import type { Status } from "~/domains/validation-workflow/domain/WorkflowInstance";
import {
	seedCountryAccount,
	seedSpecificHazard,
	seedUser,
} from "../../../db/models/hazardousEventTestHelpers";
import type { ErrorResponse } from "~/shared/errors/ErrorResponse";
import { i18nextMiddleware } from "~/middleware/i18next.server";
import { dr } from "~/db.server";
import { userTable } from "~/drizzle/schema/userTable";
import { userCountryAccountsTable } from "~/drizzle/schema/userCountryAccountsTable";
import { SPECIFIC_HAZARD_TAXONOMY_REPOSITORY } from "~/domains/hazardous-events/infrastructure/SpecificHazardTaxonomyRepositoryToken";
import type { ISpecificHazardTaxonomyRepository } from "~/domains/hazardous-events/application/ports/ISpecificHazardTaxonomyRepository";

// A real candidate: composeWorkflowAction's own membership filter (code review finding) now
// rejects any id FindValidatorCandidatesUseCase wouldn't also resolve -- plain seedUser() has
// no role/tenant link and is no longer sufficient here.
async function seedValidator(tenantId: string): Promise<string> {
	const [user] = await dr
		.insert(userTable)
		.values({
			email: `validator-${randomUUID()}@test.com`,
			emailVerified: true,
		})
		.returning();
	await dr.insert(userCountryAccountsTable).values({
		userId: user.id,
		countryAccountsId: tenantId,
		role: "data-validator",
	});
	return user.id;
}

let testingModule: TestingModule;

vi.mock("~/init.server", () => ({
	getAppContext: () => ({
		get: (token: Parameters<TestingModule["get"]>[0]) =>
			testingModule.get(token),
	}),
}));

vi.mock("~/utils/session", async (importOriginal) => {
	const original = await importOriginal<Record<string, unknown>>();
	return {
		...original,
		getCountryAccountsIdFromSession: vi.fn(),
		getUserRoleFromSession: vi.fn(),
	};
});

vi.mock("~/utils/auth", async (importOriginal) => {
	const original = await importOriginal<Record<string, unknown>>();
	return { ...original, requireUser: vi.fn() };
});

import {
	getCountryAccountsIdFromSession,
	getUserRoleFromSession,
} from "~/utils/session";
import { requireUser } from "~/utils/auth";
import {
	loader,
	action,
} from "~/routes/$lang+/_authenticated+/he-preview+/edit.$id";

const mockGetCountryAccountsIdFromSession = vi.mocked(
	getCountryAccountsIdFromSession,
);
const mockGetUserRoleFromSession = vi.mocked(getUserRoleFromSession);
const mockRequireUser = vi.mocked(requireUser);

const TEST_USER_ID = randomUUID();

// ca-shared-audit-log: audit_logs.user_id is now an enforced FK to userTable, so the mocked session's actingUserId must be a real row (harmless before, since nothing wrote to audit_logs).
beforeAll(async () => {
	await dr
		.insert(userTable)
		.values({ id: TEST_USER_ID, email: `test-user-${TEST_USER_ID}@test.com` });
});

function baseEventProps(
	id: string,
	tenantId: string,
	specificHazardId: string,
) {
	return {
		id,
		tenantId,
		specificHazardId,
		startDate: "2026-01-01",
		endDate: "",
		nationalSpecification: "",
		description: "",
		chainsExplanation: "",
		magnitude: "",
		recordOriginator: "",
		dataSource: "",
		hazardousEventStatus: null,
		specificHazardLocalName: null,
		specificHazardNationalName: null,
		apiImportId: null,
		createdByUserId: null,
		updatedByUserId: null,
		submittedByUserId: null,
		submittedAt: null,
		createdAt: new Date("2026-01-01T00:00:00.000Z"),
		updatedAt: null,
		hazardDriverIds: [],
		attachments: [],
		fieldValues: [],
		customFieldValues: [],
	};
}

async function seedEventWithoutWorkflow(
	tenantId: string,
	specificHazardId: string,
): Promise<string> {
	const id = randomUUID();
	const repository = testingModule.get<IHazardousEventRepository>(
		HAZARDOUS_EVENT_REPOSITORY,
	);
	const entity = HazardousEvent.create(
		baseEventProps(id, tenantId, specificHazardId),
		new Set(),
		new Set(),
	);
	await repository.insert(entity);
	return id;
}

/** DRAFT by default; transitions further via ProcessWorkflowActionUseCase's own real actions to
 * reach the other statuses this route's status-aware gate cares about. */
async function seedEventAtStatus(
	tenantId: string,
	specificHazardId: string,
	status: Status,
): Promise<string> {
	const createUseCase = testingModule.get(CreateHazardousEventUseCase);
	const dto = await createUseCase.execute({
		tenantId,
		specificHazardId,
		startDate: "2026-01-01",
		endDate: "",
		nationalSpecification: "",
		description: "",
		chainsExplanation: "",
		magnitude: "",
		recordOriginator: "",
		dataSource: "",
		hazardousEventStatus: null,
		specificHazardLocalName: null,
		specificHazardNationalName: null,
		apiImportId: null,
		actingUserId: await seedUser(),
		hazardDriverIds: [],
		attachments: [],
		fieldValues: [],
		customFieldValues: [],
	});

	if (status === "DRAFT") {
		return dto.id;
	}

	const processUseCase = testingModule.get(ProcessWorkflowActionUseCase);
	const actingUserId = await seedUser();
	if (status === "SUBMITTED") {
		await processUseCase.execute({
			action: "submit-validation",
			entityId: dto.id,
			entityType: "HE",
			tenantId,
			actingUserId,
			validatorUserIds: [await seedUser()],
			recordDisplayName: "Flood",
			recordDate: "2026-01-01",
		});
		return dto.id;
	}
	if (status === "REVISION_REQUESTED") {
		await processUseCase.execute({
			action: "submit-validation",
			entityId: dto.id,
			entityType: "HE",
			tenantId,
			actingUserId,
			validatorUserIds: [await seedUser()],
			recordDisplayName: "Flood",
			recordDate: "2026-01-01",
		});
		await processUseCase.execute({
			action: "return",
			entityId: dto.id,
			entityType: "HE",
			tenantId,
			actingUserId,
			rejectionComments: "Please revise",
		});
		return dto.id;
	}
	if (status === "APPROVED") {
		await processUseCase.execute({
			action: "direct-validate",
			entityId: dto.id,
			entityType: "HE",
			tenantId,
			actingUserId,
			actingUserRole: "admin",
		});
		return dto.id;
	}
	if (status === "PUBLISHED") {
		await processUseCase.execute({
			action: "direct-publish",
			entityId: dto.id,
			entityType: "HE",
			tenantId,
			actingUserId,
			actingUserRole: "admin",
		});
		return dto.id;
	}
	throw new Error(`seedEventAtStatus: unsupported status ${status}`);
}

async function makeI18nContext(url: string): Promise<RouterContextProvider> {
	const context = new RouterContextProvider();
	await i18nextMiddleware(
		{ request: new Request(url), params: {}, context } as unknown as Parameters<
			typeof i18nextMiddleware
		>[0],
		async () => new Response(),
	);
	return context;
}

async function makeArgs(
	id: string | undefined,
	tenantIdForSession: string | null,
	role: string | null = "data-collector",
	init?: RequestInit,
) {
	const url = `http://localhost/en/he-preview/edit/${id ?? ""}`;
	mockGetCountryAccountsIdFromSession.mockResolvedValue(
		tenantIdForSession ?? undefined,
	);
	mockGetUserRoleFromSession.mockResolvedValue((role ?? undefined) as never);
	mockRequireUser.mockResolvedValue({
		user: { id: TEST_USER_ID },
		session: {},
	} as never);
	const request = new Request(url, init);
	const context = await makeI18nContext(url);
	return {
		request,
		params: { lang: "en", id },
		context,
	} as unknown as Parameters<typeof loader>[0];
}

function expectForbidden(thrown: unknown): void {
	expect(thrown).toBeInstanceOf(Response);
	const response = thrown as Response;
	expect(response.status).toBe(403);
}

function makeEditBody(
	fields: Record<string, string> = {},
	specificHazardId = "",
): RequestInit {
	const body = new URLSearchParams({
		specificHazardId,
		startDate: "2026-01-01",
		endDate: "",
		nationalSpecification: "",
		description: "",
		chainsExplanation: "",
		magnitude: "",
		recordOriginator: "originator",
		dataSource: "",
		...fields,
	});
	return { method: "POST", body };
}

describe("Hazardous event edit route", () => {
	let tenantId: string;
	let specificHazardId: string;

	beforeEach(async () => {
		testingModule = await Test.createTestingModule({
			imports: [HazardousEventsModule],
		}).compile();

		mockGetCountryAccountsIdFromSession.mockReset();
		mockGetUserRoleFromSession.mockReset();
		mockRequireUser.mockReset();
		tenantId = await seedCountryAccount();
		specificHazardId = await seedSpecificHazard();
	});

	afterEach(async () => {
		await testingModule.close();
	});

	describe("flat EditData gate", () => {
		it("rejects a session without EditData with a 403 FORBIDDEN on the loader", async () => {
			const id = await seedEventAtStatus(tenantId, specificHazardId, "DRAFT");

			let thrown: unknown;
			try {
				await loader(await makeArgs(id, tenantId, "data-viewer"));
			} catch (err) {
				thrown = err;
			}

			expectForbidden(thrown);
			const body = (await (thrown as Response).json()) as ErrorResponse;
			expect(body.error.code).toBe("FORBIDDEN");
		});

		it("rejects a session without EditData on the action, without calling UpdateHazardousEventUseCase.execute", async () => {
			const id = await seedEventAtStatus(tenantId, specificHazardId, "DRAFT");
			const { UpdateHazardousEventUseCase } =
				await import("~/domains/hazardous-events/application/use-cases/UpdateHazardousEvent");
			const executeSpy = vi.spyOn(
				testingModule.get(UpdateHazardousEventUseCase),
				"execute",
			);

			let thrown: unknown;
			try {
				await action(
					await makeArgs(id, tenantId, "data-viewer", {
						method: "POST",
						body: new URLSearchParams(),
					}),
				);
			} catch (err) {
				thrown = err;
			}

			expectForbidden(thrown);
			expect(executeSpy).not.toHaveBeenCalled();
			executeSpy.mockRestore();
		});
	});

	describe("no tenant resolvable", () => {
		it("redirects to /{lang}/user/select-instance on the loader", async () => {
			const id = await seedEventAtStatus(tenantId, specificHazardId, "DRAFT");

			let thrown: unknown;
			try {
				await loader(await makeArgs(id, null, "data-collector"));
			} catch (err) {
				thrown = err;
			}

			expect(thrown).toBeInstanceOf(Response);
			const response = thrown as Response;
			expect(response.headers.get("Location")).toBe("/en/user/select-instance");
		});
	});

	describe("loader (test-quality-auditor finding)", () => {
		it("returns the resolved session role, not always null", async () => {
			const id = await seedEventAtStatus(tenantId, specificHazardId, "DRAFT");

			const result = await loader(await makeArgs(id, tenantId, "admin"));

			expect(result?.role).toBe("admin");
		});

		it("sets partial: false when ?partial= is absent", async () => {
			const id = await seedEventAtStatus(tenantId, specificHazardId, "DRAFT");

			const result = await loader(
				await makeArgs(id, tenantId, "data-collector"),
			);

			expect(result?.partial).toBe(false);
		});

		it("sets partial: true when ?partial=transition-failed is present", async () => {
			const id = await seedEventAtStatus(tenantId, specificHazardId, "DRAFT");
			const args = await makeArgs(id, tenantId, "data-collector");
			const urlWithPartial = new Request(
				`${args.request.url}?partial=transition-failed`,
			);

			const result = await loader({ ...args, request: urlWithPartial });

			expect(result?.partial).toBe(true);
		});
	});

	describe("status-aware edit gate (design.md Decision 2)", () => {
		it("blocks data-viewer regardless of status (DRAFT)", async () => {
			const id = await seedEventAtStatus(tenantId, specificHazardId, "DRAFT");

			let thrown: unknown;
			try {
				await loader(await makeArgs(id, tenantId, "data-viewer"));
			} catch (err) {
				thrown = err;
			}

			expectForbidden(thrown);
		});

		it.each(["SUBMITTED", "APPROVED", "PUBLISHED"] as const)(
			"blocks a non-data-viewer role when workflowStatus is %s",
			async (status) => {
				const id = await seedEventAtStatus(tenantId, specificHazardId, status);

				let thrown: unknown;
				try {
					await loader(await makeArgs(id, tenantId, "data-collector"));
				} catch (err) {
					thrown = err;
				}

				expectForbidden(thrown);
			},
		);

		it("blocks the action, without calling UpdateHazardousEventUseCase.execute, when workflowStatus is SUBMITTED", async () => {
			const id = await seedEventAtStatus(
				tenantId,
				specificHazardId,
				"SUBMITTED",
			);
			const { UpdateHazardousEventUseCase } =
				await import("~/domains/hazardous-events/application/use-cases/UpdateHazardousEvent");
			const executeSpy = vi.spyOn(
				testingModule.get(UpdateHazardousEventUseCase),
				"execute",
			);

			let thrown: unknown;
			try {
				await action(
					await makeArgs(id, tenantId, "admin", {
						method: "POST",
						body: new URLSearchParams(),
					}),
				);
			} catch (err) {
				thrown = err;
			}

			expectForbidden(thrown);
			expect(executeSpy).not.toHaveBeenCalled();
			executeSpy.mockRestore();
		});

		it.each(["DRAFT", "REVISION_REQUESTED"] as const)(
			"allows a non-data-viewer role to proceed when workflowStatus is %s",
			async (status) => {
				const id = await seedEventAtStatus(tenantId, specificHazardId, status);

				const result = await loader(
					await makeArgs(id, tenantId, "data-collector"),
				);

				expect(result).toBeDefined();
			},
		);

		it("allows a non-data-viewer role to proceed when the event has no WorkflowInstance (null workflowStatus, DEF-031)", async () => {
			const id = await seedEventWithoutWorkflow(tenantId, specificHazardId);

			const result = await loader(
				await makeArgs(id, tenantId, "data-collector"),
			);

			expect(result).toBeDefined();
		});
	});

	describe("action composition (Section 7)", () => {
		it("a plain edit save with no tempAction calls only UpdateHazardousEventUseCase.execute", async () => {
			const id = await seedEventAtStatus(tenantId, specificHazardId, "DRAFT");
			const { UpdateHazardousEventUseCase } =
				await import("~/domains/hazardous-events/application/use-cases/UpdateHazardousEvent");
			const updateSpy = vi.spyOn(
				testingModule.get(UpdateHazardousEventUseCase),
				"execute",
			);
			const processSpy = vi.spyOn(
				testingModule.get(ProcessWorkflowActionUseCase),
				"execute",
			);

			const response = await action(
				await makeArgs(
					id,
					tenantId,
					"data-collector",
					makeEditBody({}, specificHazardId),
				),
			);

			expect(updateSpy).toHaveBeenCalledOnce();
			expect(processSpy).not.toHaveBeenCalled();
			expect(response).toBeInstanceOf(Response);
			expect((response as Response).status).toBeGreaterThanOrEqual(300);
			expect((response as Response).status).toBeLessThan(400);

			updateSpy.mockRestore();
			processSpy.mockRestore();
		});

		it("submit-draft composes both use cases, UpdateHazardousEventUseCase before ProcessWorkflowActionUseCase", async () => {
			const id = await seedEventAtStatus(
				tenantId,
				specificHazardId,
				"REVISION_REQUESTED",
			);
			const { UpdateHazardousEventUseCase } =
				await import("~/domains/hazardous-events/application/use-cases/UpdateHazardousEvent");
			// Plain spyOn (no mockImplementation) still calls through to the real method.
			const updateSpy = vi.spyOn(
				testingModule.get(UpdateHazardousEventUseCase),
				"execute",
			);
			const processSpy = vi.spyOn(
				testingModule.get(ProcessWorkflowActionUseCase),
				"execute",
			);

			await action(
				await makeArgs(
					id,
					tenantId,
					"data-collector",
					makeEditBody({ tempAction: "submit-draft" }, specificHazardId),
				),
			);

			expect(updateSpy.mock.invocationCallOrder[0]).toBeLessThan(
				processSpy.mock.invocationCallOrder[0],
			);
			expect(processSpy.mock.calls[0][0]).toMatchObject({
				action: "submit-draft",
				entityId: id,
			});

			updateSpy.mockRestore();
			processSpy.mockRestore();
		});

		it.each(["submit-validate", "submit-publish"] as const)(
			"a non-admin %s (direct-validate/direct-publish) request is rejected with 403 BEFORE UpdateHazardousEventUseCase.execute ever runs -- the event's content is left unchanged (design.md Decision 2)",
			async (tempAction) => {
				const id = await seedEventAtStatus(tenantId, specificHazardId, "DRAFT");
				const { UpdateHazardousEventUseCase } =
					await import("~/domains/hazardous-events/application/use-cases/UpdateHazardousEvent");
				const { GetHazardousEventByIdUseCase } =
					await import("~/domains/hazardous-events/application/use-cases/GetHazardousEventById");
				const updateSpy = vi.spyOn(
					testingModule.get(UpdateHazardousEventUseCase),
					"execute",
				);
				const processSpy = vi.spyOn(
					testingModule.get(ProcessWorkflowActionUseCase),
					"execute",
				);
				const before = await testingModule
					.get(GetHazardousEventByIdUseCase)
					.execute({ id, tenantId });

				let thrown: unknown;
				try {
					await action(
						await makeArgs(
							id,
							tenantId,
							"data-collector",
							makeEditBody(
								{ tempAction, description: "tampered-via-bypassed-gate" },
								specificHazardId,
							),
						),
					);
				} catch (err) {
					thrown = err;
				}

				expectForbidden(thrown);
				expect(updateSpy).not.toHaveBeenCalled();
				expect(processSpy).not.toHaveBeenCalled();
				const after = await testingModule
					.get(GetHazardousEventByIdUseCase)
					.execute({ id, tenantId });
				expect(after.description).toBe(before.description);
				expect(after.updatedAt).toEqual(before.updatedAt);

				updateSpy.mockRestore();
				processSpy.mockRestore();
			},
		);

		it("an admin direct-validate request proceeds", async () => {
			const id = await seedEventAtStatus(tenantId, specificHazardId, "DRAFT");
			const processSpy = vi.spyOn(
				testingModule.get(ProcessWorkflowActionUseCase),
				"execute",
			);

			await action(
				await makeArgs(
					id,
					tenantId,
					"admin",
					makeEditBody({ tempAction: "submit-validate" }, specificHazardId),
				),
			);

			expect(processSpy).toHaveBeenCalledOnce();
			expect(processSpy.mock.calls[0][0]).toMatchObject({
				action: "direct-validate",
			});
			processSpy.mockRestore();
		});

		it("submit-validation with an empty validator list is rejected with 422 BEFORE UpdateHazardousEventUseCase.execute ever runs -- the event's content is left unchanged (design.md Decision 2/3)", async () => {
			const id = await seedEventAtStatus(tenantId, specificHazardId, "DRAFT");
			const { UpdateHazardousEventUseCase } =
				await import("~/domains/hazardous-events/application/use-cases/UpdateHazardousEvent");
			const { GetHazardousEventByIdUseCase } =
				await import("~/domains/hazardous-events/application/use-cases/GetHazardousEventById");
			const updateSpy = vi.spyOn(
				testingModule.get(UpdateHazardousEventUseCase),
				"execute",
			);
			const processSpy = vi.spyOn(
				testingModule.get(ProcessWorkflowActionUseCase),
				"execute",
			);
			const before = await testingModule
				.get(GetHazardousEventByIdUseCase)
				.execute({ id, tenantId });

			let thrown: unknown;
			try {
				await action(
					await makeArgs(
						id,
						tenantId,
						"data-collector",
						makeEditBody(
							{
								tempAction: "submit-validation",
								tempValidatorUserIds: "",
								description: "tampered-via-bypassed-gate",
							},
							specificHazardId,
						),
					),
				);
			} catch (err) {
				thrown = err;
			}

			expect(thrown).toBeInstanceOf(Response);
			expect((thrown as Response).status).toBe(422);
			expect(updateSpy).not.toHaveBeenCalled();
			expect(processSpy).not.toHaveBeenCalled();
			const after = await testingModule
				.get(GetHazardousEventByIdUseCase)
				.execute({ id, tenantId });
			expect(after.description).toBe(before.description);
			expect(after.updatedAt).toEqual(before.updatedAt);

			updateSpy.mockRestore();
			processSpy.mockRestore();
		});

		it("submit-validation with only stale/invalid validator ids is rejected with 422 BEFORE UpdateHazardousEventUseCase.execute ever runs -- the event's content is left unchanged (design.md Decision 25, resolved)", async () => {
			const id = await seedEventAtStatus(tenantId, specificHazardId, "DRAFT");
			const { UpdateHazardousEventUseCase } =
				await import("~/domains/hazardous-events/application/use-cases/UpdateHazardousEvent");
			const { GetHazardousEventByIdUseCase } =
				await import("~/domains/hazardous-events/application/use-cases/GetHazardousEventById");
			const staleId = await seedUser();
			const updateSpy = vi.spyOn(
				testingModule.get(UpdateHazardousEventUseCase),
				"execute",
			);
			const before = await testingModule
				.get(GetHazardousEventByIdUseCase)
				.execute({ id, tenantId });

			let thrown: unknown;
			try {
				await action(
					await makeArgs(
						id,
						tenantId,
						"data-collector",
						makeEditBody(
							{
								tempAction: "submit-validation",
								tempValidatorUserIds: staleId,
								description: "tampered-via-bypassed-gate",
							},
							specificHazardId,
						),
					),
				);
			} catch (err) {
				thrown = err;
			}

			expect(thrown).toBeInstanceOf(Response);
			expect((thrown as Response).status).toBe(422);
			expect(updateSpy).not.toHaveBeenCalled();
			const after = await testingModule
				.get(GetHazardousEventByIdUseCase)
				.execute({ id, tenantId });
			expect(after.description).toBe(before.description);
			expect(after.updatedAt).toEqual(before.updatedAt);

			updateSpy.mockRestore();
		});

		it("submit-validation with a mixed valid/invalid validator-id list filters out the invalid id and still succeeds (test-quality-auditor finding -- only the all-invalid case was previously tested)", async () => {
			const id = await seedEventAtStatus(tenantId, specificHazardId, "DRAFT");
			const { ProcessWorkflowActionUseCase } =
				await import("~/domains/validation-workflow/application/use-cases/ProcessWorkflowAction");
			const validatorId = await seedValidator(tenantId);
			const staleId = await seedUser();
			const processSpy = vi.spyOn(
				testingModule.get(ProcessWorkflowActionUseCase),
				"execute",
			);

			const response = await action(
				await makeArgs(
					id,
					tenantId,
					"data-collector",
					makeEditBody(
						{
							tempAction: "submit-validation",
							tempValidatorUserIds: `${validatorId},${staleId}`,
						},
						specificHazardId,
					),
				),
			);

			expect(response).toBeInstanceOf(Response);
			expect((response as Response).status).toBeGreaterThanOrEqual(300);
			expect((response as Response).status).toBeLessThan(400);
			expect(processSpy).toHaveBeenCalledOnce();
			expect(processSpy.mock.calls[0][0]).toMatchObject({
				validatorUserIds: [validatorId],
			});

			processSpy.mockRestore();
		});

		it("a follow-up transition failure after a successful update returns a partial-success redirect, and workflowStatus remains what it was before this submission", async () => {
			const id = await seedEventAtStatus(tenantId, specificHazardId, "DRAFT");
			const { GetHazardousEventByIdUseCase } =
				await import("~/domains/hazardous-events/application/use-cases/GetHazardousEventById");
			const processSpy = vi
				.spyOn(testingModule.get(ProcessWorkflowActionUseCase), "execute")
				.mockRejectedValue(new Error("boom-transition-failed"));

			const response = await action(
				await makeArgs(
					id,
					tenantId,
					"data-collector",
					makeEditBody({ tempAction: "submit-draft" }, specificHazardId),
				),
			);

			expect(response).toBeInstanceOf(Response);
			expect((response as Response).status).toBeGreaterThanOrEqual(300);
			expect((response as Response).status).toBeLessThan(400);
			// Exact redirect destination, not just a side-effect (test-quality-auditor finding --
			// this test's own name promised "partial-success redirect" but never checked it).
			expect((response as Response).headers.get("Location")).toBe(
				`/en/he-preview/edit/${id}?partial=transition-failed`,
			);

			const detail = await testingModule
				.get(GetHazardousEventByIdUseCase)
				.execute({ id, tenantId });
			expect(detail.workflowStatus).toBe("DRAFT");

			processSpy.mockRestore();
		});

		it("redirects to the plain detail page (no ?partial=) on an ordinary successful save (test-quality-auditor finding)", async () => {
			const id = await seedEventAtStatus(tenantId, specificHazardId, "DRAFT");

			const response = await action(
				await makeArgs(
					id,
					tenantId,
					"data-collector",
					makeEditBody({}, specificHazardId),
				),
			);

			expect(response).toBeInstanceOf(Response);
			expect((response as Response).headers.get("Location")).toBe(
				`/en/he-preview/${id}`,
			);
		});
	});

	describe("field-mappable ValidationError (task 9.10)", () => {
		it("returns fieldErrors for startDate when it is later than endDate, rather than throwing", async () => {
			const id = await seedEventAtStatus(tenantId, specificHazardId, "DRAFT");

			const result = await action(
				await makeArgs(
					id,
					tenantId,
					"data-collector",
					makeEditBody(
						{ startDate: "2026-06-01", endDate: "2026-01-01" },
						specificHazardId,
					),
				),
			);

			expect(result).toEqual({
				success: false,
				fieldErrors: {
					startDate: ["startDate must not be later than endDate"],
				},
			});
		});
	});

	describe("field-mappable ConflictError from the causal chain (code review finding)", () => {
		it("returns fieldErrors for causeId when the picked parent starts later than this event, rather than throwing", async () => {
			const id = await seedEventAtStatus(tenantId, specificHazardId, "DRAFT");
			const createUseCase = testingModule.get(CreateHazardousEventUseCase);
			const parent = await createUseCase.execute({
				tenantId,
				specificHazardId,
				startDate: "2026-06-01",
				endDate: "",
				nationalSpecification: "",
				description: "",
				chainsExplanation: "",
				magnitude: "",
				recordOriginator: "parent",
				dataSource: "",
				hazardousEventStatus: null,
				specificHazardLocalName: null,
				specificHazardNationalName: null,
				apiImportId: null,
				actingUserId: await seedUser(),
				hazardDriverIds: [],
				attachments: [],
				fieldValues: [],
				customFieldValues: [],
			});

			const result = await action(
				await makeArgs(
					id,
					tenantId,
					"data-collector",
					makeEditBody(
						{
							startDate: "2026-01-01",
							causeId: parent.id,
							causeIdChanged: "1",
						},
						specificHazardId,
					),
				),
			);

			expect(result).toEqual({
				success: false,
				fieldErrors: {
					causeId: [
						"The cause event must not start later than the effect event",
					],
				},
			});
		});
	});

	describe("non-field-mappable error from UpdateHazardousEventUseCase (test-quality-auditor finding -- the generic catch-all was 0% covered)", () => {
		it("rethrows via the generic error envelope when the use case rejects with an error extractFieldError can't map", async () => {
			const id = await seedEventAtStatus(tenantId, specificHazardId, "DRAFT");
			const { UpdateHazardousEventUseCase } =
				await import("~/domains/hazardous-events/application/use-cases/UpdateHazardousEvent");
			const { NotFoundError } = await import("~/shared/errors");
			const updateSpy = vi
				.spyOn(testingModule.get(UpdateHazardousEventUseCase), "execute")
				.mockRejectedValue(new NotFoundError("HazardousEvent", "missing-id"));

			let thrown: unknown;
			try {
				await action(
					await makeArgs(
						id,
						tenantId,
						"data-collector",
						makeEditBody({}, specificHazardId),
					),
				);
			} catch (err) {
				thrown = err;
			}

			expect(thrown).toBeInstanceOf(Response);
			expect((thrown as Response).status).toBe(404);

			updateSpy.mockRestore();
		});
	});

	describe("spatialObservation conditional presence -- changed-flag AND present-value both required (test-quality-auditor finding)", () => {
		it("includes spatialObservation in the update command when both spatialObservationChanged='1' and the field is present", async () => {
			const id = await seedEventAtStatus(tenantId, specificHazardId, "DRAFT");
			const { UpdateHazardousEventUseCase } =
				await import("~/domains/hazardous-events/application/use-cases/UpdateHazardousEvent");
			const updateSpy = vi.spyOn(
				testingModule.get(UpdateHazardousEventUseCase),
				"execute",
			);
			const geometry = { type: "Point", coordinates: [0, 0] };

			await action(
				await makeArgs(
					id,
					tenantId,
					"data-collector",
					makeEditBody(
						{
							spatialObservationChanged: "1",
							spatialObservation: JSON.stringify({
								geometries: [geometry],
								divisionIds: [],
							}),
						},
						specificHazardId,
					),
				),
			);

			const command = updateSpy.mock.calls[0][0];
			expect("spatialObservation" in command).toBe(true);
			updateSpy.mockRestore();
		});

		it("omits spatialObservation when spatialObservationChanged is '0', even though the field is present", async () => {
			const id = await seedEventAtStatus(tenantId, specificHazardId, "DRAFT");
			const { UpdateHazardousEventUseCase } =
				await import("~/domains/hazardous-events/application/use-cases/UpdateHazardousEvent");
			const updateSpy = vi.spyOn(
				testingModule.get(UpdateHazardousEventUseCase),
				"execute",
			);
			const geometry = { type: "Point", coordinates: [0, 0] };

			await action(
				await makeArgs(
					id,
					tenantId,
					"data-collector",
					makeEditBody(
						{
							spatialObservationChanged: "0",
							spatialObservation: JSON.stringify({
								geometries: [geometry],
								divisionIds: [],
							}),
						},
						specificHazardId,
					),
				),
			);

			const command = updateSpy.mock.calls[0][0];
			expect("spatialObservation" in command).toBe(false);
			updateSpy.mockRestore();
		});

		it("omits spatialObservation when spatialObservationChanged is '1' but the field itself is absent/malformed", async () => {
			const id = await seedEventAtStatus(tenantId, specificHazardId, "DRAFT");
			const { UpdateHazardousEventUseCase } =
				await import("~/domains/hazardous-events/application/use-cases/UpdateHazardousEvent");
			const updateSpy = vi.spyOn(
				testingModule.get(UpdateHazardousEventUseCase),
				"execute",
			);

			await action(
				await makeArgs(
					id,
					tenantId,
					"data-collector",
					makeEditBody({ spatialObservationChanged: "1" }, specificHazardId),
				),
			);

			const command = updateSpy.mock.calls[0][0];
			expect("spatialObservation" in command).toBe(false);
			updateSpy.mockRestore();
		});
	});

	describe("specificHazardLocalName/specificHazardNationalName (not part of this form)", () => {
		it("preserves an existing specificHazardLocalName across a plain edit save that never renders the field", async () => {
			const createUseCase = testingModule.get(CreateHazardousEventUseCase);
			const dto = await createUseCase.execute({
				tenantId,
				specificHazardId,
				startDate: "2026-01-01",
				endDate: "",
				nationalSpecification: "",
				description: "",
				chainsExplanation: "",
				magnitude: "",
				recordOriginator: "",
				dataSource: "",
				hazardousEventStatus: null,
				specificHazardLocalName: "Local name kept from legacy import",
				specificHazardNationalName: null,
				apiImportId: null,
				actingUserId: await seedUser(),
				hazardDriverIds: [],
				attachments: [],
				fieldValues: [],
				customFieldValues: [],
			});

			await action(
				await makeArgs(
					dto.id,
					tenantId,
					"data-collector",
					makeEditBody({}, specificHazardId),
				),
			);

			const { GetHazardousEventByIdUseCase } =
				await import("~/domains/hazardous-events/application/use-cases/GetHazardousEventById");
			const detail = await testingModule
				.get(GetHazardousEventByIdUseCase)
				.execute({ id: dto.id, tenantId });
			expect(detail.specificHazardLocalName).toBe(
				"Local name kept from legacy import",
			);
		});
	});

	describe("attachments (design.md Decision 9 row 13)", () => {
		it("persists the attachments metadata submitted in the hidden JSON field", async () => {
			const id = await seedEventAtStatus(tenantId, specificHazardId, "DRAFT");
			const { UpdateHazardousEventUseCase } =
				await import("~/domains/hazardous-events/application/use-cases/UpdateHazardousEvent");
			const updateSpy = vi.spyOn(
				testingModule.get(UpdateHazardousEventUseCase),
				"execute",
			);
			// Real ContentRepeater-shaped item, not a hand-constructed already-correct fixture
			// (DEF-054's own finding about the previous version of this test's blind spot).
			const widgetItem = {
				id: crypto.randomUUID().replace(/-/g, "").slice(0, 13),
				title: "Photo",
				tag: null,
				file_option: "Link",
				url: "https://example.com/photo.png",
			};

			await action(
				await makeArgs(
					id,
					tenantId,
					"data-collector",
					makeEditBody(
						{ attachments: JSON.stringify([widgetItem]) },
						specificHazardId,
					),
				),
			);

			expect(updateSpy.mock.calls[0][0].attachments).toEqual([
				{
					kind: "link",
					id: widgetItem.id,
					title: "Photo",
					tag: null,
					url: "https://example.com/photo.png",
				},
			]);
			updateSpy.mockRestore();
		});

		// Gate 10 finding: a malformed attachments payload now throws ValidationError from the
		// parser (a dropped item would otherwise read as "removed," deleting a real file) -- must
		// surface as a structured 422, not escape uncaught to the generic error boundary.
		it("rejects a malformed attachments payload with a 422 before UpdateHazardousEventUseCase.execute ever runs", async () => {
			const id = await seedEventAtStatus(tenantId, specificHazardId, "DRAFT");
			const { UpdateHazardousEventUseCase } =
				await import("~/domains/hazardous-events/application/use-cases/UpdateHazardousEvent");
			const updateSpy = vi.spyOn(
				testingModule.get(UpdateHazardousEventUseCase),
				"execute",
			);

			let thrown: unknown;
			try {
				await action(
					await makeArgs(
						id,
						tenantId,
						"data-collector",
						makeEditBody({ attachments: "not valid json" }, specificHazardId),
					),
				);
			} catch (err) {
				thrown = err;
			}

			expect(thrown).toBeInstanceOf(Response);
			expect((thrown as Response).status).toBe(422);
			expect(updateSpy).not.toHaveBeenCalled();

			updateSpy.mockRestore();
		});
	});

	describe("causeId changed-flag gating (code review finding -- design.md's riskiest part)", () => {
		it("omits causeId/causalityExplanation from the update command when causeIdChanged is absent", async () => {
			const id = await seedEventAtStatus(tenantId, specificHazardId, "DRAFT");
			const { UpdateHazardousEventUseCase } =
				await import("~/domains/hazardous-events/application/use-cases/UpdateHazardousEvent");
			const updateSpy = vi.spyOn(
				testingModule.get(UpdateHazardousEventUseCase),
				"execute",
			);

			await action(
				await makeArgs(
					id,
					tenantId,
					"data-collector",
					makeEditBody({}, specificHazardId),
				),
			);

			const command = updateSpy.mock.calls[0][0];
			expect("causeId" in command).toBe(false);
			expect("causalityExplanation" in command).toBe(false);
			updateSpy.mockRestore();
		});

		it("forwards causeId/causalityExplanation to the update command when causeIdChanged is set", async () => {
			const id = await seedEventAtStatus(tenantId, specificHazardId, "DRAFT");
			const newParentId = await seedEventAtStatus(
				tenantId,
				specificHazardId,
				"DRAFT",
			);
			const { UpdateHazardousEventUseCase } =
				await import("~/domains/hazardous-events/application/use-cases/UpdateHazardousEvent");
			const updateSpy = vi.spyOn(
				testingModule.get(UpdateHazardousEventUseCase),
				"execute",
			);

			await action(
				await makeArgs(
					id,
					tenantId,
					"data-collector",
					makeEditBody(
						{
							causeId: newParentId,
							causalityExplanation: "root cause",
							causeIdChanged: "1",
						},
						specificHazardId,
					),
				),
			);

			const command = updateSpy.mock.calls[0][0];
			expect(command.causeId).toBe(newParentId);
			expect(command.causalityExplanation).toBe("root cause");
			updateSpy.mockRestore();
		});
	});

	describe("recordDisplayName reflects the post-update event, not the pre-edit snapshot (code review finding)", () => {
		it("submit-validation after changing the hazard classification notifies with the new hazard's name, not the old one", async () => {
			const id = await seedEventAtStatus(tenantId, specificHazardId, "DRAFT");
			const newSpecificHazardId = await seedSpecificHazard();
			const validatorId = await seedValidator(tenantId);
			const processSpy = vi.spyOn(
				testingModule.get(ProcessWorkflowActionUseCase),
				"execute",
			);
			const taxonomyRepo = testingModule.get<ISpecificHazardTaxonomyRepository>(
				SPECIFIC_HAZARD_TAXONOMY_REPOSITORY,
			);
			const names = await taxonomyRepo.findNamesByIds([newSpecificHazardId]);
			const expectedName = names.get(newSpecificHazardId)?.specificHazardName;

			await action(
				await makeArgs(
					id,
					tenantId,
					"data-collector",
					makeEditBody(
						{
							tempAction: "submit-validation",
							tempValidatorUserIds: validatorId,
						},
						newSpecificHazardId,
					),
				),
			);

			expect(processSpy.mock.calls[0][0]).toMatchObject({
				recordDisplayName: expectedName,
			});
			processSpy.mockRestore();
		});
	});
});
