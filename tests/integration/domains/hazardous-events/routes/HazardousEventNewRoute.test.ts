import "../../../db/setup";
import "reflect-metadata";

import { randomUUID } from "crypto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Test, type TestingModule } from "@nestjs/testing";
import { RouterContextProvider } from "react-router";

import { HazardousEventsModule } from "~/domains/hazardous-events/infrastructure/HazardousEventsModule.server";
import { HAZARDOUS_EVENT_REPOSITORY } from "~/domains/hazardous-events/infrastructure/HazardousEventRepositoryToken";
import type { IHazardousEventRepository } from "~/domains/hazardous-events/application/ports/IHazardousEventRepository";
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
} from "~/routes/$lang+/_authenticated+/he-preview+/new";

const mockGetCountryAccountsIdFromSession = vi.mocked(
	getCountryAccountsIdFromSession,
);
const mockGetUserRoleFromSession = vi.mocked(getUserRoleFromSession);
const mockRequireUser = vi.mocked(requireUser);

const TEST_USER_ID = randomUUID();

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
	url: string,
	tenantIdForSession: string | null,
	role: string | null = "data-collector",
	init?: RequestInit,
) {
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
		params: { lang: "en" },
		context,
	} as unknown as Parameters<typeof loader>[0];
}

function makeCreateBody(
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

describe("Hazardous event create route", () => {
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

	describe("loader", () => {
		it("rejects a session without EditData with a 403 FORBIDDEN", async () => {
			let thrown: unknown;
			try {
				await loader(
					await makeArgs(
						"http://localhost/en/he-preview/new",
						tenantId,
						"data-viewer",
					),
				);
			} catch (err) {
				thrown = err;
			}

			expect(thrown).toBeInstanceOf(Response);
			const response = thrown as Response;
			expect(response.status).toBe(403);
			const body = (await response.json()) as ErrorResponse;
			expect(body.error.code).toBe("FORBIDDEN");
		});

		it("redirects to /{lang}/user/select-instance when no tenant can be resolved", async () => {
			let thrown: unknown;
			try {
				await loader(
					await makeArgs(
						"http://localhost/en/he-preview/new",
						null,
						"data-collector",
					),
				);
			} catch (err) {
				thrown = err;
			}

			expect(thrown).toBeInstanceOf(Response);
			const response = thrown as Response;
			expect(response.status).toBeGreaterThanOrEqual(300);
			expect(response.status).toBeLessThan(400);
			expect(response.headers.get("Location")).toBe("/en/user/select-instance");
		});

		it("returns the resolved session role, not always null (test-quality-auditor finding)", async () => {
			const result = await loader(
				await makeArgs("http://localhost/en/he-preview/new", tenantId, "admin"),
			);

			expect(result?.role).toBe("admin");
		});

		describe("?parent= prefill (test-quality-auditor finding -- previously 0% covered)", () => {
			it("resolves no parent when the query param is absent, without looking up any event", async () => {
				const { GetHazardousEventByIdUseCase } =
					await import("~/domains/hazardous-events/application/use-cases/GetHazardousEventById");
				const executeSpy = vi.spyOn(
					testingModule.get(GetHazardousEventByIdUseCase),
					"execute",
				);

				const result = await loader(
					await makeArgs(
						"http://localhost/en/he-preview/new",
						tenantId,
						"data-collector",
					),
				);

				expect(result?.parent).toBeNull();
				expect(executeSpy).not.toHaveBeenCalled();
			});

			it("resolves parent's id/displayName (falling back through specificHazardName -> hazardClusterName -> hazardTypeName) when ?parent= names an existing tenant event", async () => {
				const { CreateHazardousEventUseCase } =
					await import("~/domains/hazardous-events/application/use-cases/CreateHazardousEvent");
				const parentDto = await testingModule
					.get(CreateHazardousEventUseCase)
					.execute({
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
						actingUserId: randomUUID(),
						hazardDriverIds: [],
						attachments: [],
						fieldValues: [],
						customFieldValues: [],
					});

				const result = await loader(
					await makeArgs(
						`http://localhost/en/he-preview/new?parent=${parentDto.id}`,
						tenantId,
						"data-collector",
					),
				);

				expect(result?.parent).not.toBeNull();
				expect(result?.parent?.id).toBe(parentDto.id);
				expect(typeof result?.parent?.displayName).toBe("string");
			});

			it("404s (via throwHazardousEventLoaderError) rather than prefilling, when ?parent= names an event in a different tenant", async () => {
				const otherTenantId = await seedCountryAccount();
				const otherSpecificHazardId = await seedSpecificHazard();
				const { CreateHazardousEventUseCase } =
					await import("~/domains/hazardous-events/application/use-cases/CreateHazardousEvent");
				const otherTenantDto = await testingModule
					.get(CreateHazardousEventUseCase)
					.execute({
						tenantId: otherTenantId,
						specificHazardId: otherSpecificHazardId,
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
						actingUserId: randomUUID(),
						hazardDriverIds: [],
						attachments: [],
						fieldValues: [],
						customFieldValues: [],
					});

				let thrown: unknown;
				try {
					await loader(
						await makeArgs(
							`http://localhost/en/he-preview/new?parent=${otherTenantDto.id}`,
							tenantId,
							"data-collector",
						),
					);
				} catch (err) {
					thrown = err;
				}

				expect(thrown).toBeInstanceOf(Response);
				expect((thrown as Response).status).toBe(404);
			});
		});
	});

	describe("action", () => {
		it("rejects a session without EditData with a 403 FORBIDDEN, without calling CreateHazardousEventUseCase.execute", async () => {
			const { CreateHazardousEventUseCase } =
				await import("~/domains/hazardous-events/application/use-cases/CreateHazardousEvent");
			const executeSpy = vi.spyOn(
				testingModule.get(CreateHazardousEventUseCase),
				"execute",
			);

			let thrown: unknown;
			try {
				await action(
					await makeArgs(
						"http://localhost/en/he-preview/new",
						tenantId,
						"data-viewer",
						{ method: "POST", body: new URLSearchParams() },
					),
				);
			} catch (err) {
				thrown = err;
			}

			expect(thrown).toBeInstanceOf(Response);
			const response = thrown as Response;
			expect(response.status).toBe(403);
			const body = (await response.json()) as ErrorResponse;
			expect(body.error.code).toBe("FORBIDDEN");
			expect(executeSpy).not.toHaveBeenCalled();

			executeSpy.mockRestore();
		});

		it("redirects to /{lang}/user/select-instance when no tenant can be resolved, without calling CreateHazardousEventUseCase.execute", async () => {
			const { CreateHazardousEventUseCase } =
				await import("~/domains/hazardous-events/application/use-cases/CreateHazardousEvent");
			const executeSpy = vi.spyOn(
				testingModule.get(CreateHazardousEventUseCase),
				"execute",
			);

			let thrown: unknown;
			try {
				await action(
					await makeArgs(
						"http://localhost/en/he-preview/new",
						null,
						"data-collector",
						{ method: "POST", body: new URLSearchParams() },
					),
				);
			} catch (err) {
				thrown = err;
			}

			expect(thrown).toBeInstanceOf(Response);
			const response = thrown as Response;
			expect(response.status).toBeGreaterThanOrEqual(300);
			expect(response.status).toBeLessThan(400);
			expect(response.headers.get("Location")).toBe("/en/user/select-instance");
			expect(executeSpy).not.toHaveBeenCalled();

			executeSpy.mockRestore();
		});
	});

	describe("action composition (Section 6)", () => {
		it("a plain draft submission (no tempAction) calls only CreateHazardousEventUseCase.execute", async () => {
			const { CreateHazardousEventUseCase } =
				await import("~/domains/hazardous-events/application/use-cases/CreateHazardousEvent");
			const { ProcessWorkflowActionUseCase } =
				await import("~/domains/validation-workflow/application/use-cases/ProcessWorkflowAction");
			const createSpy = vi.spyOn(
				testingModule.get(CreateHazardousEventUseCase),
				"execute",
			);
			const processSpy = vi.spyOn(
				testingModule.get(ProcessWorkflowActionUseCase),
				"execute",
			);

			const response = await action(
				await makeArgs(
					"http://localhost/en/he-preview/new",
					tenantId,
					"data-collector",
					makeCreateBody({}, specificHazardId),
				),
			);

			expect(createSpy).toHaveBeenCalledOnce();
			expect(processSpy).not.toHaveBeenCalled();
			expect(response).toBeInstanceOf(Response);
			expect((response as Response).status).toBeGreaterThanOrEqual(300);
			expect((response as Response).status).toBeLessThan(400);
			// Exact redirect destination, not just "it's a redirect" (test-quality-auditor finding).
			const created = await createSpy.mock.results[0].value;
			expect((response as Response).headers.get("Location")).toBe(
				`/en/he-preview/${created.id}`,
			);

			createSpy.mockRestore();
			processSpy.mockRestore();
		});

		it("submit-validation with a non-empty validator list composes both use cases in order, deriving recordDisplayName/recordDate", async () => {
			const { CreateHazardousEventUseCase } =
				await import("~/domains/hazardous-events/application/use-cases/CreateHazardousEvent");
			const { ProcessWorkflowActionUseCase } =
				await import("~/domains/validation-workflow/application/use-cases/ProcessWorkflowAction");
			const createSpy = vi.spyOn(
				testingModule.get(CreateHazardousEventUseCase),
				"execute",
			);
			const processSpy = vi.spyOn(
				testingModule.get(ProcessWorkflowActionUseCase),
				"execute",
			);
			const validatorId = await seedValidator(tenantId);

			await action(
				await makeArgs(
					"http://localhost/en/he-preview/new",
					tenantId,
					"data-collector",
					makeCreateBody(
						{
							startDate: "2026-01-01",
							endDate: "2026-01-05",
							tempAction: "submit-validation",
							tempValidatorUserIds: validatorId,
						},
						specificHazardId,
					),
				),
			);

			expect(createSpy).toHaveBeenCalledOnce();
			expect(processSpy).toHaveBeenCalledOnce();
			const createdId = (await createSpy.mock.results[0].value).id;
			const processArgs = processSpy.mock.calls[0][0];
			expect(processArgs).toMatchObject({
				action: "submit-validation",
				entityId: createdId,
				entityType: "HE",
				validatorUserIds: [validatorId],
				recordDate: "2026-01-01 to 2026-01-05",
			});

			createSpy.mockRestore();
			processSpy.mockRestore();
		});

		it("an admin direct-publish request (tempAction: submit-publish) composes both use cases with action: direct-publish", async () => {
			const { CreateHazardousEventUseCase } =
				await import("~/domains/hazardous-events/application/use-cases/CreateHazardousEvent");
			const { ProcessWorkflowActionUseCase } =
				await import("~/domains/validation-workflow/application/use-cases/ProcessWorkflowAction");
			const createSpy = vi.spyOn(
				testingModule.get(CreateHazardousEventUseCase),
				"execute",
			);
			const processSpy = vi.spyOn(
				testingModule.get(ProcessWorkflowActionUseCase),
				"execute",
			);

			await action(
				await makeArgs(
					"http://localhost/en/he-preview/new",
					tenantId,
					"admin",
					makeCreateBody({ tempAction: "submit-publish" }, specificHazardId),
				),
			);

			expect(processSpy).toHaveBeenCalledOnce();
			expect(processSpy.mock.calls[0][0]).toMatchObject({
				action: "direct-publish",
			});

			createSpy.mockRestore();
			processSpy.mockRestore();
		});

		it.each(["submit-validate", "submit-publish"] as const)(
			"a non-admin session requesting %s (direct-validate/direct-publish) is rejected with 403 BEFORE CreateHazardousEventUseCase.execute ever runs -- no event is persisted, so a retry cannot create a duplicate (design.md Decision 2)",
			async (tempAction) => {
				const { CreateHazardousEventUseCase } =
					await import("~/domains/hazardous-events/application/use-cases/CreateHazardousEvent");
				const { ProcessWorkflowActionUseCase } =
					await import("~/domains/validation-workflow/application/use-cases/ProcessWorkflowAction");
				const createSpy = vi.spyOn(
					testingModule.get(CreateHazardousEventUseCase),
					"execute",
				);
				const processSpy = vi.spyOn(
					testingModule.get(ProcessWorkflowActionUseCase),
					"execute",
				);
				const repository = testingModule.get<IHazardousEventRepository>(
					HAZARDOUS_EVENT_REPOSITORY,
				);
				const countBefore = await repository.countAll(tenantId);

				let thrown: unknown;
				try {
					await action(
						await makeArgs(
							"http://localhost/en/he-preview/new",
							tenantId,
							"data-collector",
							makeCreateBody({ tempAction }, specificHazardId),
						),
					);
				} catch (err) {
					thrown = err;
				}

				expect(thrown).toBeInstanceOf(Response);
				expect((thrown as Response).status).toBe(403);
				expect(createSpy).not.toHaveBeenCalled();
				expect(processSpy).not.toHaveBeenCalled();
				expect(await repository.countAll(tenantId)).toBe(countBefore);

				createSpy.mockRestore();
				processSpy.mockRestore();
			},
		);

		it("submit-validation with an empty validator list is rejected with 422 BEFORE CreateHazardousEventUseCase.execute ever runs -- no event is persisted (design.md Decision 2/3)", async () => {
			const { CreateHazardousEventUseCase } =
				await import("~/domains/hazardous-events/application/use-cases/CreateHazardousEvent");
			const { ProcessWorkflowActionUseCase } =
				await import("~/domains/validation-workflow/application/use-cases/ProcessWorkflowAction");
			const createSpy = vi.spyOn(
				testingModule.get(CreateHazardousEventUseCase),
				"execute",
			);
			const processSpy = vi.spyOn(
				testingModule.get(ProcessWorkflowActionUseCase),
				"execute",
			);
			const repository = testingModule.get<IHazardousEventRepository>(
				HAZARDOUS_EVENT_REPOSITORY,
			);
			const countBefore = await repository.countAll(tenantId);

			let thrown: unknown;
			try {
				await action(
					await makeArgs(
						"http://localhost/en/he-preview/new",
						tenantId,
						"data-collector",
						makeCreateBody(
							{ tempAction: "submit-validation", tempValidatorUserIds: "" },
							specificHazardId,
						),
					),
				);
			} catch (err) {
				thrown = err;
			}

			expect(thrown).toBeInstanceOf(Response);
			expect((thrown as Response).status).toBe(422);
			expect(createSpy).not.toHaveBeenCalled();
			expect(processSpy).not.toHaveBeenCalled();
			expect(await repository.countAll(tenantId)).toBe(countBefore);

			createSpy.mockRestore();
			processSpy.mockRestore();
		});

		it("submit-validation with only stale/invalid validator ids is rejected with 422 BEFORE CreateHazardousEventUseCase.execute ever runs -- no event is persisted (design.md Decision 25, resolved)", async () => {
			const { CreateHazardousEventUseCase } =
				await import("~/domains/hazardous-events/application/use-cases/CreateHazardousEvent");
			const staleId = await seedUser();
			const createSpy = vi.spyOn(
				testingModule.get(CreateHazardousEventUseCase),
				"execute",
			);
			const repository = testingModule.get<IHazardousEventRepository>(
				HAZARDOUS_EVENT_REPOSITORY,
			);
			const countBefore = await repository.countAll(tenantId);

			let thrown: unknown;
			try {
				await action(
					await makeArgs(
						"http://localhost/en/he-preview/new",
						tenantId,
						"data-collector",
						makeCreateBody(
							{
								tempAction: "submit-validation",
								tempValidatorUserIds: staleId,
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
			expect(createSpy).not.toHaveBeenCalled();
			expect(await repository.countAll(tenantId)).toBe(countBefore);

			createSpy.mockRestore();
		});

		it("submit-validation with a mixed valid/invalid validator-id list filters out the invalid id and still succeeds (test-quality-auditor finding -- only the all-invalid case was previously tested)", async () => {
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
					"http://localhost/en/he-preview/new",
					tenantId,
					"data-collector",
					makeCreateBody(
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

		it("a follow-up ProcessWorkflowActionUseCase failure after a successful create returns a partial-success redirect, not a 500, and the event stays queryable at DRAFT", async () => {
			const { ProcessWorkflowActionUseCase } =
				await import("~/domains/validation-workflow/application/use-cases/ProcessWorkflowAction");
			const { GetHazardousEventByIdUseCase } =
				await import("~/domains/hazardous-events/application/use-cases/GetHazardousEventById");
			const validatorId = await seedValidator(tenantId);
			const processSpy = vi
				.spyOn(testingModule.get(ProcessWorkflowActionUseCase), "execute")
				.mockRejectedValue(new Error("boom-transition-failed"));

			const response = await action(
				await makeArgs(
					"http://localhost/en/he-preview/new",
					tenantId,
					"data-collector",
					makeCreateBody(
						{
							tempAction: "submit-validation",
							tempValidatorUserIds: validatorId,
						},
						specificHazardId,
					),
				),
			);

			expect(response).toBeInstanceOf(Response);
			expect((response as Response).status).toBeGreaterThanOrEqual(300);
			expect((response as Response).status).toBeLessThan(400);
			const location = (response as Response).headers.get("Location") ?? "";
			const createdId = location.match(/edit\/([^/?]+)/)?.[1];
			expect(createdId).toBeTruthy();

			const getByIdUseCase = testingModule.get(GetHazardousEventByIdUseCase);
			const detail = await getByIdUseCase.execute({
				id: createdId as string,
				tenantId,
			});
			expect(detail.workflowStatus).toBe("DRAFT");

			processSpy.mockRestore();
		});
	});

	describe("field-mappable ValidationError (task 9.10)", () => {
		it("returns fieldErrors for startDate when it is later than endDate, rather than throwing", async () => {
			const result = await action(
				await makeArgs(
					"http://localhost/en/he-preview/new",
					tenantId,
					"data-collector",
					makeCreateBody(
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
		it("returns fieldErrors for causeId when the picked parent starts later than the new event, rather than throwing", async () => {
			const { CreateHazardousEventUseCase } =
				await import("~/domains/hazardous-events/application/use-cases/CreateHazardousEvent");
			const parent = await testingModule
				.get(CreateHazardousEventUseCase)
				.execute({
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
					actingUserId: randomUUID(),
					hazardDriverIds: [],
					attachments: [],
					fieldValues: [],
					customFieldValues: [],
				});

			const result = await action(
				await makeArgs(
					"http://localhost/en/he-preview/new",
					tenantId,
					"data-collector",
					makeCreateBody(
						{ startDate: "2026-01-01", causeId: parent.id },
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

	describe("non-field-mappable error from CreateHazardousEventUseCase (test-quality-auditor finding -- the generic catch-all was 0% covered)", () => {
		it("rethrows via the generic error envelope (not a fieldErrors response) when the use case rejects with an error extractFieldError can't map", async () => {
			const { CreateHazardousEventUseCase } =
				await import("~/domains/hazardous-events/application/use-cases/CreateHazardousEvent");
			const { NotFoundError } = await import("~/shared/errors");
			const createSpy = vi
				.spyOn(testingModule.get(CreateHazardousEventUseCase), "execute")
				.mockRejectedValue(new NotFoundError("HazardousEvent", "missing-id"));

			let thrown: unknown;
			try {
				await action(
					await makeArgs(
						"http://localhost/en/he-preview/new",
						tenantId,
						"data-collector",
						makeCreateBody({}, specificHazardId),
					),
				);
			} catch (err) {
				thrown = err;
			}

			expect(thrown).toBeInstanceOf(Response);
			expect((thrown as Response).status).toBe(404);

			createSpy.mockRestore();
		});
	});

	describe("spatialObservation conditional presence (test-quality-auditor finding)", () => {
		it("includes spatialObservation in the create command when the hidden field is set", async () => {
			const { CreateHazardousEventUseCase } =
				await import("~/domains/hazardous-events/application/use-cases/CreateHazardousEvent");
			const createSpy = vi.spyOn(
				testingModule.get(CreateHazardousEventUseCase),
				"execute",
			);

			const geometry = { type: "Point", coordinates: [0, 0] };
			await action(
				await makeArgs(
					"http://localhost/en/he-preview/new",
					tenantId,
					"data-collector",
					makeCreateBody(
						{
							spatialObservation: JSON.stringify({
								geometries: [geometry],
								divisionIds: [],
							}),
						},
						specificHazardId,
					),
				),
			);

			const command = createSpy.mock.calls[0][0];
			expect("spatialObservation" in command).toBe(true);
			expect(command.spatialObservation).toEqual({
				geometries: [geometry],
				divisionIds: [],
			});
			createSpy.mockRestore();
		});

		it("omits spatialObservation from the create command entirely when the hidden field is absent", async () => {
			const { CreateHazardousEventUseCase } =
				await import("~/domains/hazardous-events/application/use-cases/CreateHazardousEvent");
			const createSpy = vi.spyOn(
				testingModule.get(CreateHazardousEventUseCase),
				"execute",
			);

			await action(
				await makeArgs(
					"http://localhost/en/he-preview/new",
					tenantId,
					"data-collector",
					makeCreateBody({}, specificHazardId),
				),
			);

			const command = createSpy.mock.calls[0][0];
			expect("spatialObservation" in command).toBe(false);
			createSpy.mockRestore();
		});
	});

	describe("attachments (design.md Decision 9 row 13)", () => {
		it("persists the attachments metadata submitted in the hidden JSON field", async () => {
			const { CreateHazardousEventUseCase } =
				await import("~/domains/hazardous-events/application/use-cases/CreateHazardousEvent");
			const createSpy = vi.spyOn(
				testingModule.get(CreateHazardousEventUseCase),
				"execute",
			);
			const attachment = {
				id: crypto.randomUUID(),
				title: "Photo",
				fileKey: "key-1",
				fileName: "photo.png",
				fileType: "image/png",
				fileSize: 1024,
			};

			await action(
				await makeArgs(
					"http://localhost/en/he-preview/new",
					tenantId,
					"data-collector",
					makeCreateBody(
						{ attachments: JSON.stringify([attachment]) },
						specificHazardId,
					),
				),
			);

			expect(createSpy.mock.calls[0][0].attachments).toEqual([attachment]);
			createSpy.mockRestore();
		});
	});
});
