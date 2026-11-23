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
import { and, eq } from "drizzle-orm";

import { HazardousEventsModule } from "~/domains/hazardous-events/infrastructure/HazardousEventsModule.server";
import { HAZARDOUS_EVENT_REPOSITORY } from "~/domains/hazardous-events/infrastructure/HazardousEventRepositoryToken";
import type { IHazardousEventRepository } from "~/domains/hazardous-events/application/ports/IHazardousEventRepository";
import { HazardousEvent } from "~/domains/hazardous-events/domain/HazardousEvent";
import { CreateHazardousEventUseCase } from "~/domains/hazardous-events/application/use-cases/CreateHazardousEvent";
import { GetHazardousEventByIdUseCase } from "~/domains/hazardous-events/application/use-cases/GetHazardousEventById";
import { DeleteHazardousEventUseCase } from "~/domains/hazardous-events/application/use-cases/DeleteHazardousEvent";
import { ProcessWorkflowActionUseCase } from "~/domains/validation-workflow/application/use-cases/ProcessWorkflowAction";
import { workflowInstanceTable } from "~/domains/validation-workflow/infrastructure/workflowInstanceTable";
import { hazardousEventCausalityTable } from "~/domains/hazardous-events/infrastructure/hazardousEventCausalityTable";
import {
	seedCountryAccount,
	seedSpecificHazard,
	seedUser,
} from "../../../db/models/hazardousEventTestHelpers";
import { i18nextMiddleware } from "~/middleware/i18next.server";
import { dr } from "~/db.server";
import { userTable } from "~/drizzle/schema/userTable";
import { eventTable } from "~/drizzle/schema/eventTable";
import { hazardousEventTable } from "~/drizzle/schema/hazardousEventTable";
import { disasterEventTable } from "~/drizzle/schema/disasterEventTable";
import { eventCausalityTable } from "~/drizzle/schema/eventCausalityTable";
import { eventRelationshipTable } from "~/drizzle/schema/eventRelationshipTable";
import { auditLogsTable } from "~/drizzle/schema/auditLogsTable";

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
	sessionCookie,
} from "~/utils/session";
import { requireUser } from "~/utils/auth";
import { action } from "~/routes/$lang+/_authenticated+/he-preview+/delete.$id";

const mockGetCountryAccountsIdFromSession = vi.mocked(
	getCountryAccountsIdFromSession,
);
const mockGetUserRoleFromSession = vi.mocked(getUserRoleFromSession);
const mockRequireUser = vi.mocked(requireUser);

const TEST_USER_ID = randomUUID();

beforeAll(async () => {
	// redirectWithMessage signs the flash cookie; the test env may not load .env.
	if (!process.env.SESSION_SECRET) {
		vi.stubEnv("SESSION_SECRET", "test-session-secret");
	}
	// audit_logs.user_id is an enforced FK, so the mocked session's user must exist.
	await dr
		.insert(userTable)
		.values({ id: TEST_USER_ID, email: `test-user-${TEST_USER_ID}@test.com` });
	// Warm the route module's cold import graph once, outside any per-test timeout.
	await import("~/routes/$lang+/_authenticated+/he-preview+/delete.$id");
}, 60000);

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
	tenantIdForSession: string,
	role: string | null = "admin",
) {
	const url = `http://localhost/en/he-preview/delete/${id ?? ""}`;
	mockGetCountryAccountsIdFromSession.mockResolvedValue(tenantIdForSession);
	mockGetUserRoleFromSession.mockResolvedValue((role ?? undefined) as never);
	mockRequireUser.mockResolvedValue({
		user: { id: TEST_USER_ID },
		session: {},
	} as never);
	const request = new Request(url, { method: "POST" });
	const context = await makeI18nContext(url);
	return {
		request,
		params: { lang: "en", id },
		context,
	} as unknown as Parameters<typeof action>[0];
}

/** Thrown Responses are captured, not rethrown, so each test can assert on them. */
async function runAction(
	args: Parameters<typeof action>[0],
): Promise<{ returned?: unknown; thrown?: unknown }> {
	try {
		return { returned: await action(args) };
	} catch (thrown) {
		return { thrown };
	}
}

/** Unwraps react-router's `data()` (a DataWithResponseInit) into its body and status. */
function failureOf(returned: unknown): { body: unknown; status?: number } {
	expect(returned).toBeTypeOf("object");
	expect(returned).not.toBeInstanceOf(Response);
	const value = returned as {
		type?: string;
		data?: unknown;
		init?: { status?: number } | null;
	};
	if (value.type === "DataWithResponseInit") {
		return { body: value.data, status: value.init?.status ?? undefined };
	}
	return { body: value };
}

function expectFailure(
	returned: unknown,
	messageKeys: string[],
	expectedStatus: number,
): void {
	const { body, status } = failureOf(returned);
	expect(body).toEqual({ ok: false, messageKeys });
	expect(status).toBe(expectedStatus);
}

/** Refused as returned data (a toast), never a thrown Response that hits the error boundary. */
function expectForbidden(result: { returned?: unknown; thrown?: unknown }): void {
	expect(result.thrown).toBeUndefined();
	expectFailure(result.returned, ["delete.forbidden"], 403);
}

async function hazardousEventExists(id: string): Promise<boolean> {
	const rows = await dr
		.select({ id: hazardousEventTable.id })
		.from(hazardousEventTable)
		.where(eq(hazardousEventTable.id, id));
	return rows.length === 1;
}

async function deleteAuditRowCount(id: string): Promise<number> {
	const rows = await dr
		.select({ id: auditLogsTable.id })
		.from(auditLogsTable)
		.where(
			and(eq(auditLogsTable.recordId, id), eq(auditLogsTable.action, "delete")),
		);
	return rows.length;
}

describe("Hazardous event delete route action", () => {
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

	/** Created through the real use case, so it has a DRAFT workflow_instance row. */
	async function seedDraftEvent(forTenantId = tenantId): Promise<string> {
		const dto = await testingModule.get(CreateHazardousEventUseCase).execute({
			tenantId: forTenantId,
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
		return dto.id;
	}

	async function seedPublishedEvent(): Promise<string> {
		const id = await seedDraftEvent();
		await testingModule.get(ProcessWorkflowActionUseCase).execute({
			action: "direct-publish",
			entityId: id,
			entityType: "HE",
			tenantId,
			actingUserId: await seedUser(),
			actingUserRole: "admin",
		});
		return id;
	}

	/** REJECTED has no transition method yet, so it is set directly. */
	async function seedRejectedEvent(): Promise<string> {
		const id = await seedDraftEvent();
		await dr
			.update(workflowInstanceTable)
			.set({ status: "REJECTED" })
			.where(eq(workflowInstanceTable.entityId, id));
		return id;
	}

	/** A legacy-style row with no workflow_instance (DEF-031). */
	async function seedEventWithoutWorkflow(): Promise<string> {
		const id = randomUUID();
		await testingModule
			.get<IHazardousEventRepository>(HAZARDOUS_EVENT_REPOSITORY)
			.insert(
				HazardousEvent.create(
					{
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
					},
					new Set(),
					new Set(),
				),
			);
		return id;
	}

	async function seedDisasterEvent(
		forTenantId: string,
		hazardousEventId: string | null,
	): Promise<string> {
		const [event] = await dr
			.insert(eventTable)
			.values({})
			.returning({ id: eventTable.id });
		await dr.insert(disasterEventTable).values({
			id: event.id,
			hazardousEventId,
			countryAccountsId: forTenantId,
		});
		return event.id;
	}

	describe("success", () => {
		it("redirects to the bare list with a translated flash cookie, and removes the event, its event row and its workflow_instance, writing one delete audit row", async () => {
			const id = await seedDraftEvent();

			const { returned, thrown } = await runAction(
				await makeArgs(id, tenantId),
			);

			expect(thrown).toBeUndefined();
			expect(returned).toBeInstanceOf(Response);
			const response = returned as Response;
			expect(response.status).toBe(302);
			expect(response.headers.get("Location")).toBe("/en/he-preview");

			const setCookie = response.headers.get("Set-Cookie");
			expect(setCookie).toBeTruthy();
			const session = await sessionCookie().getSession(setCookie);
			expect(session.get("flashMessageText")).toBe("Record deleted");
			expect(session.get("flashMessageType")).toBe("info");

			expect(await hazardousEventExists(id)).toBe(false);
			const eventRows = await dr
				.select({ id: eventTable.id })
				.from(eventTable)
				.where(eq(eventTable.id, id));
			expect(eventRows).toHaveLength(0);
			const workflowRows = await dr
				.select({ id: workflowInstanceTable.id })
				.from(workflowInstanceTable)
				.where(eq(workflowInstanceTable.entityId, id));
			expect(workflowRows).toHaveLength(0);
			expect(await deleteAuditRowCount(id)).toBe(1);
		});

		it("passes the session user as actingUserId and the session tenant to the use case", async () => {
			const id = await seedDraftEvent();
			const executeSpy = vi.spyOn(
				testingModule.get(DeleteHazardousEventUseCase),
				"execute",
			);

			await runAction(await makeArgs(id, tenantId));

			expect(executeSpy).toHaveBeenCalledWith({
				id,
				tenantId,
				actingUserId: TEST_USER_ID,
			});
			executeSpy.mockRestore();
		});
	});

	describe("not found", () => {
		it("returns the not-found key with a 404 (not a thrown Response) for a missing id, deleting nothing", async () => {
			const keep = await seedDraftEvent();

			const { returned, thrown } = await runAction(
				await makeArgs(randomUUID(), tenantId),
			);

			expect(thrown).toBeUndefined();
			expectFailure(returned, ["delete.not_found"], 404);
			expect(await hazardousEventExists(keep)).toBe(true);
		});

		it("treats a foreign-tenant id exactly like a missing one, leaving that row untouched", async () => {
			const otherTenantId = await seedCountryAccount();
			const foreignId = await seedDraftEvent(otherTenantId);

			const { returned, thrown } = await runAction(
				await makeArgs(foreignId, tenantId),
			);

			expect(thrown).toBeUndefined();
			expectFailure(returned, ["delete.not_found"], 404);
			expect(await hazardousEventExists(foreignId)).toBe(true);
		});

		it("does not disclose a foreign-tenant event's dependents", async () => {
			const otherTenantId = await seedCountryAccount();
			const foreignId = await seedDraftEvent(otherTenantId);
			await seedDisasterEvent(otherTenantId, foreignId);

			const { returned } = await runAction(await makeArgs(foreignId, tenantId));

			expectFailure(returned, ["delete.not_found"], 404);
		});
	});

	describe("blocked by dependents", () => {
		it("returns the DISASTER_EVENT key with a 409 when a disaster_event references it, leaving the row intact", async () => {
			const id = await seedDraftEvent();
			await seedDisasterEvent(tenantId, id);

			const { returned, thrown } = await runAction(
				await makeArgs(id, tenantId),
			);

			expect(thrown).toBeUndefined();
			expectFailure(returned, ["delete.blocked.disaster_event"], 409);
			expect(await hazardousEventExists(id)).toBe(true);
			expect(await deleteAuditRowCount(id)).toBe(0);
		});

		it("returns the EVENT_CAUSALITY key, with no cross-tenant count anywhere in the response, for a link to another tenant's disaster event", async () => {
			const id = await seedDraftEvent();
			const otherTenantId = await seedCountryAccount();
			const foreignDisasterEventId = await seedDisasterEvent(
				otherTenantId,
				null,
			);
			await dr.insert(eventCausalityTable).values({
				triggeringEntityType: "HE",
				triggeringHazardousEventId: id,
				triggeredEntityType: "DE",
				triggeredDisasterEventId: foreignDisasterEventId,
			});

			const { returned } = await runAction(await makeArgs(id, tenantId));

			expectFailure(returned, ["delete.blocked.event_causality"], 409);
			const serialized = JSON.stringify(failureOf(returned).body);
			expect(serialized).not.toMatch(/count|\d/i);
			expect(serialized).not.toContain(foreignDisasterEventId);
			expect(await hazardousEventExists(id)).toBe(true);
		});

		it.each(["cause", "effect"] as const)(
			"returns the CAUSAL_CHAIN key when the event is the %s side of a hazardous_event_causality edge, leaving the edge intact",
			async (side) => {
				const causeId = await seedDraftEvent();
				const effectId = await seedDraftEvent();
				await dr.insert(hazardousEventCausalityTable).values({
					causeHazardousEventId: causeId,
					effectHazardousEventId: effectId,
				});
				const id = side === "cause" ? causeId : effectId;

				const { returned } = await runAction(await makeArgs(id, tenantId));

				expectFailure(returned, ["delete.blocked.causal_chain"], 409);
				expect(await hazardousEventExists(id)).toBe(true);
				const edges = await dr
					.select({ id: hazardousEventCausalityTable.id })
					.from(hazardousEventCausalityTable)
					.where(
						eq(hazardousEventCausalityTable.causeHazardousEventId, causeId),
					);
				expect(edges).toHaveLength(1);
			},
		);

		it("returns every blocking reason, in order, when several apply at once", async () => {
			const id = await seedDraftEvent();
			const effectId = await seedDraftEvent();
			await seedDisasterEvent(tenantId, id);
			await dr.insert(hazardousEventCausalityTable).values({
				causeHazardousEventId: id,
				effectHazardousEventId: effectId,
			});

			const { returned } = await runAction(await makeArgs(id, tenantId));

			expectFailure(
				returned,
				["delete.blocked.disaster_event", "delete.blocked.causal_chain"],
				409,
			);
		});

		it("returns the caused-by key (DEF-044) for an outgoing legacy event_relationship, rolling everything back", async () => {
			const id = await seedDraftEvent();
			const childId = await seedDraftEvent();
			await dr
				.insert(eventRelationshipTable)
				.values({ parentId: id, childId, type: "caused_by" });

			const { returned, thrown } = await runAction(
				await makeArgs(id, tenantId),
			);

			expect(thrown).toBeUndefined();
			expectFailure(returned, ["delete.blocked.caused_by"], 409);
			expect(await hazardousEventExists(id)).toBe(true);
			const workflowRows = await dr
				.select({ id: workflowInstanceTable.id })
				.from(workflowInstanceTable)
				.where(eq(workflowInstanceTable.entityId, id));
			expect(workflowRows).toHaveLength(1);
			const relationships = await dr
				.select({ parentId: eventRelationshipTable.parentId })
				.from(eventRelationshipTable)
				.where(eq(eventRelationshipTable.parentId, id));
			expect(relationships).toHaveLength(1);
			expect(await deleteAuditRowCount(id)).toBe(0);
		});
	});

	describe("authorization", () => {
		it.each(["data-viewer", null])(
			"returns the forbidden key with a 403 for role %s (no EditData), without looking the event up or deleting",
			async (role) => {
				const id = await seedDraftEvent();
				const executeSpy = vi.spyOn(
					testingModule.get(DeleteHazardousEventUseCase),
					"execute",
				);
				const lookupSpy = vi.spyOn(
					testingModule.get(GetHazardousEventByIdUseCase),
					"execute",
				);

				expectForbidden(await runAction(await makeArgs(id, tenantId, role)));
				expect(executeSpy).not.toHaveBeenCalled();
				expect(lookupSpy).not.toHaveBeenCalled();
				expect(await hazardousEventExists(id)).toBe(true);
				executeSpy.mockRestore();
				lookupSpy.mockRestore();
			},
		);

		it("returns forbidden, not not-found, to a data-viewer posting a missing id", async () => {
			expectForbidden(
				await runAction(await makeArgs(randomUUID(), tenantId, "data-viewer")),
			);
		});

		it("returns the forbidden key with a 403 for a data-collector on a PUBLISHED event and deletes nothing", async () => {
			const id = await seedPublishedEvent();

			expectForbidden(
				await runAction(await makeArgs(id, tenantId, "data-collector")),
			);
			expect(await hazardousEventExists(id)).toBe(true);
		});

		it("returns the forbidden key with a 403 for a data-collector on an event with no workflow_instance row (fail closed)", async () => {
			const id = await seedEventWithoutWorkflow();

			expectForbidden(
				await runAction(await makeArgs(id, tenantId, "data-collector")),
			);
			expect(await hazardousEventExists(id)).toBe(true);
		});

		it("lets an admin delete an event with no workflow_instance row", async () => {
			const id = await seedEventWithoutWorkflow();

			const { returned, thrown } = await runAction(
				await makeArgs(id, tenantId, "admin"),
			);

			expect(thrown).toBeUndefined();
			expect((returned as Response).status).toBe(302);
			expect(await hazardousEventExists(id)).toBe(false);
		});

		it("lets a data-collector delete a REJECTED event", async () => {
			const id = await seedRejectedEvent();

			const { returned, thrown } = await runAction(
				await makeArgs(id, tenantId, "data-collector"),
			);

			expect(thrown).toBeUndefined();
			expect((returned as Response).status).toBe(302);
			expect(await hazardousEventExists(id)).toBe(false);
		});

		it("lets a data-validator delete a PUBLISHED event", async () => {
			const id = await seedPublishedEvent();

			const { returned, thrown } = await runAction(
				await makeArgs(id, tenantId, "data-validator"),
			);

			expect(thrown).toBeUndefined();
			expect((returned as Response).status).toBe(302);
			expect(await hazardousEventExists(id)).toBe(false);
		});

		it("lets a data-collector delete a DRAFT event", async () => {
			const id = await seedDraftEvent();

			const { returned } = await runAction(
				await makeArgs(id, tenantId, "data-collector"),
			);

			expect((returned as Response).status).toBe(302);
			expect(await hazardousEventExists(id)).toBe(false);
		});
	});

	// PGlite serialises connections, so true lock-wait interleaving is covered in DeleteHazardousEvent.test.ts.
	describe("concurrent and repeated attempts", () => {
		it("two concurrent calls for the same zero-dependent event delete once, audit once, and neither throws", async () => {
			const id = await seedDraftEvent();
			const argsA = await makeArgs(id, tenantId);
			const argsB = await makeArgs(id, tenantId);

			const outcomes = await Promise.all([runAction(argsA), runAction(argsB)]);

			for (const { returned, thrown } of outcomes) {
				expect(thrown).toBeUndefined();
				if (returned instanceof Response) {
					expect(returned.headers.get("Location")).toBe("/en/he-preview");
				} else {
					expectFailure(returned, ["delete.not_found"], 404);
				}
			}
			expect(await hazardousEventExists(id)).toBe(false);
			expect(await deleteAuditRowCount(id)).toBe(1);
		});

		it("a second call after the first completed returns the not-found key", async () => {
			const id = await seedDraftEvent();
			const first = await runAction(await makeArgs(id, tenantId));
			expect(first.returned).toBeInstanceOf(Response);

			const second = await runAction(await makeArgs(id, tenantId));

			expect(second.thrown).toBeUndefined();
			expectFailure(second.returned, ["delete.not_found"], 404);
			expect(await deleteAuditRowCount(id)).toBe(1);
		});
	});

	describe("unexpected errors", () => {
		it("rethrows an unknown error instead of returning a message", async () => {
			const id = await seedDraftEvent();
			const boom = new Error("boom");
			const executeSpy = vi
				.spyOn(testingModule.get(DeleteHazardousEventUseCase), "execute")
				.mockRejectedValueOnce(boom);

			const { thrown, returned } = await runAction(
				await makeArgs(id, tenantId),
			);

			expect(returned).toBeUndefined();
			expect(thrown).toBe(boom);
			executeSpy.mockRestore();
		});
	});
});
