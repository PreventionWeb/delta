import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
	createTestIds,
	setupSessionMocks,
	createTestUser,
	cleanupTestUser,
	mockSessionValues,
	TEST_BASE_URL,
	createOtherTenant,
	cleanupOtherTenant,
} from "../../test-helpers";
import {
	createTestDisasterEventWithOptions,
	createTestHazardousEvent,
} from "./test-helpers";
import { randomUUID } from "crypto";
import { RouterContextProvider } from "react-router";
import { eq } from "drizzle-orm";
import { dr } from "~/db.server";
import { eventCausalityTable } from "~/drizzle/schema/eventCausalityTable";
import { disasterEventTable } from "~/drizzle/schema/disasterEventTable";
import { getCountryAccountsIdFromSession } from "~/utils/session";
import {
	loader as editLoader,
	action as editAction,
} from "~/routes/$lang+/disaster-event+/edit.$id";

const testIds = createTestIds();
testIds.userEmail = testIds.userEmail.replace("@", "-de-edit@");

setupSessionMocks();

async function callLoader(params: { id: string }) {
	const url = new URL(`${TEST_BASE_URL}/en/disaster-event/edit/${params.id}`);
	const request = new Request(url.toString());
	return await editLoader({
		request,
		params: { lang: "en", id: params.id },
		context: {},
		userSession: {
			user: {
				id: testIds.userId,
				emailVerified: true,
				totpEnabled: false,
				firstName: "Test",
				lastName: "User",
			},
			sessionId: "test-session-id",
			session: { totpAuthed: true },
		},
	} as any);
}

describe("edit.$id.tsx loader", () => {
	let testData: Awaited<ReturnType<typeof createTestDisasterEventWithOptions>>;

	beforeEach(async () => {
		vi.clearAllMocks();
		await mockSessionValues(testIds);
		await createTestUser(testIds);

		testData = await createTestDisasterEventWithOptions(
			testIds.countryAccountId,
		);
	});

	afterEach(async () => {
		await cleanupTestUser(testIds);
	});

	it("should return new record form when id is 'new'", async () => {
		const data = await callLoader({ id: "new" });

		expect(data.item).toBeNull();
		expect(data.hip).toBeDefined();
		expect(data.treeData).toBeDefined();
	});

	it("should return existing disaster event", async () => {
		const data = await callLoader({ id: testData.disasterEventId });

		expect(data.item).toBeDefined();
		expect(data.item!.id).toBe(testData.disasterEventId);
	});

	it("should return 401 for missing country accounts id", async () => {
		vi.mocked(getCountryAccountsIdFromSession).mockResolvedValueOnce(
			null as any,
		);

		await expect(
			callLoader({ id: testData.disasterEventId }),
		).rejects.toMatchObject({ status: 401 });
	});

	it("should throw error for non-existent event", async () => {
		await expect(callLoader({ id: randomUUID() })).rejects.toThrow();
	});

	it("should return 401 for event from different tenant", async () => {
		const otherTenantId = await createOtherTenant();
		const otherData = await createTestDisasterEventWithOptions(otherTenantId);

		await expect(
			callLoader({ id: otherData.disasterEventId }),
		).rejects.toMatchObject({ status: 401 });

		await cleanupOtherTenant();
	});

	it("should return hip data for hazard picker", async () => {
		const data = await callLoader({ id: testData.disasterEventId });

		expect(data.hip).toBeDefined();
	});

	it("should return treeData for divisions", async () => {
		const data = await callLoader({ id: testData.disasterEventId });

		expect(data.treeData).toBeDefined();
	});

	it("should return ctryIso3", async () => {
		const data = await callLoader({ id: testData.disasterEventId });

		expect(data.ctryIso3).toBeDefined();
	});

	it("should return user data", async () => {
		const data = await callLoader({ id: testData.disasterEventId });

		expect(data.user).toBeDefined();
	});
});

async function callAction(params: {
	id: string;
	formData: Record<string, string>;
}) {
	const form = new URLSearchParams(params.formData);
	const url = `${TEST_BASE_URL}/en/disaster-event/edit/${params.id}`;
	const request = new Request(url, {
		method: "POST",
		body: form,
		headers: {
			"Content-Type": "application/x-www-form-urlencoded",
		},
	});
	return await editAction({
		request,
		params: { lang: "en", id: params.id },
		context: new RouterContextProvider(),
		url: new URL(request.url),
		pattern: "/:lang/disaster-event/edit/:id",
	});
}

describe("edit.$id.tsx action — event_causality tenant check (DEF-004)", () => {
	let testData: Awaited<ReturnType<typeof createTestDisasterEventWithOptions>>;

	beforeEach(async () => {
		vi.clearAllMocks();
		await mockSessionValues(testIds);
		await createTestUser(testIds);

		testData = await createTestDisasterEventWithOptions(
			testIds.countryAccountId,
		);
	});

	afterEach(async () => {
		await cleanupTestUser(testIds);
		await cleanupOtherTenant();
	});

	it("rejects a foreign-tenant id in linkedTriggeringHazardousEventIds and writes no event_causality row", async () => {
		const otherTenantId = await createOtherTenant();
		const foreignHe = await createTestHazardousEvent(otherTenantId);

		const response = await callAction({
			id: testData.disasterEventId,
			formData: {
				approvalStatus: "draft",
				linkedTriggeringHazardousEventIds: JSON.stringify([
					foreignHe.hazardousEventId,
				]),
			},
		});

		if (response instanceof Response) {
			throw new Error("expected a form response, got a redirect Response");
		}
		if (response.ok) {
			throw new Error("expected a rejection, got ok:true");
		}
		// Test session mock's translation getter returns the error `code` as `msg` (see
		// tests/integration-realdb/setup.ts), not the English copy.
		expect(response.errors.form).toContain(
			"hazardous_event.cannot_reference_other_tenant",
		);

		const causalityRows = await dr
			.select()
			.from(eventCausalityTable)
			.where(
				eq(
					eventCausalityTable.triggeringHazardousEventId,
					foreignHe.hazardousEventId,
				),
			);
		expect(causalityRows).toHaveLength(0);
	});

	it("rejects a foreign-tenant id in linkedTriggeredHazardousEventIds and writes no event_causality row", async () => {
		const otherTenantId = await createOtherTenant();
		const foreignHe = await createTestHazardousEvent(otherTenantId);

		const response = await callAction({
			id: testData.disasterEventId,
			formData: {
				approvalStatus: "draft",
				linkedTriggeredHazardousEventIds: JSON.stringify([
					foreignHe.hazardousEventId,
				]),
			},
		});

		if (response instanceof Response) {
			throw new Error("expected a form response, got a redirect Response");
		}
		if (response.ok) {
			throw new Error("expected a rejection, got ok:true");
		}
		expect(response.errors.form).toContain(
			"hazardous_event.cannot_reference_other_tenant",
		);

		const causalityRows = await dr
			.select()
			.from(eventCausalityTable)
			.where(
				eq(
					eventCausalityTable.triggeredHazardousEventId,
					foreignHe.hazardousEventId,
				),
			);
		expect(causalityRows).toHaveLength(0);
	});

	it("accepts a same-tenant id in linkedTriggeringHazardousEventIds", async () => {
		const ownHe = await createTestHazardousEvent(testIds.countryAccountId);

		const response = await callAction({
			id: testData.disasterEventId,
			formData: {
				approvalStatus: "draft",
				linkedTriggeringHazardousEventIds: JSON.stringify([
					ownHe.hazardousEventId,
				]),
			},
		});

		expect(response).toBeInstanceOf(Response);
		expect((response as Response).status).toBe(302);

		const causalityRows = await dr
			.select()
			.from(eventCausalityTable)
			.where(
				eq(
					eventCausalityTable.triggeringHazardousEventId,
					ownHe.hazardousEventId,
				),
			);
		expect(causalityRows).toHaveLength(1);
	});

	it("accepts a same-tenant id in linkedTriggeredHazardousEventIds", async () => {
		const ownHe = await createTestHazardousEvent(testIds.countryAccountId);

		const response = await callAction({
			id: testData.disasterEventId,
			formData: {
				approvalStatus: "draft",
				linkedTriggeredHazardousEventIds: JSON.stringify([
					ownHe.hazardousEventId,
				]),
			},
		});

		expect(response).toBeInstanceOf(Response);
		expect((response as Response).status).toBe(302);

		const causalityRows = await dr
			.select()
			.from(eventCausalityTable)
			.where(
				eq(
					eventCausalityTable.triggeredHazardousEventId,
					ownHe.hazardousEventId,
				),
			);
		expect(causalityRows).toHaveLength(1);
	});

	it("rejects a mixed array with one same-tenant and one foreign-tenant id, writing no event_causality rows at all", async () => {
		const ownHe = await createTestHazardousEvent(testIds.countryAccountId);
		const otherTenantId = await createOtherTenant();
		const foreignHe = await createTestHazardousEvent(otherTenantId);

		const response = await callAction({
			id: testData.disasterEventId,
			formData: {
				approvalStatus: "draft",
				linkedTriggeringHazardousEventIds: JSON.stringify([
					ownHe.hazardousEventId,
					foreignHe.hazardousEventId,
				]),
			},
		});

		if (response instanceof Response) {
			throw new Error("expected a form response, got a redirect Response");
		}
		if (response.ok) {
			throw new Error("expected a rejection, got ok:true");
		}
		expect(response.errors.form).toContain(
			"hazardous_event.cannot_reference_other_tenant",
		);

		const causalityRows = await dr
			.select()
			.from(eventCausalityTable)
			.where(
				eq(
					eventCausalityTable.triggeredDisasterEventId,
					testData.disasterEventId,
				),
			);
		expect(causalityRows).toHaveLength(0);
	});

	// Guard-ordering regression; reason documented at the DEF-004 guard in
	// edit.$id.tsx's `save` (applies to this test and the "on create" one below).
	it("rejects a foreign-tenant id on update without committing other field changes from the same submission", async () => {
		const otherTenantId = await createOtherTenant();
		const foreignHe = await createTestHazardousEvent(otherTenantId);

		const response = await callAction({
			id: testData.disasterEventId,
			formData: {
				approvalStatus: "draft",
				nameNational: "should-not-persist",
				linkedTriggeringHazardousEventIds: JSON.stringify([
					foreignHe.hazardousEventId,
				]),
			},
		});

		if (response instanceof Response) {
			throw new Error("expected a form response, got a redirect Response");
		}
		expect(response.ok).toBe(false);

		const [reloaded] = await dr
			.select({ nameNational: disasterEventTable.nameNational })
			.from(disasterEventTable)
			.where(eq(disasterEventTable.id, testData.disasterEventId));
		expect(reloaded.nameNational).toBe("Test Disaster Event");
	});

	it("rejects a foreign-tenant id on create without creating an orphan disaster_event row", async () => {
		const otherTenantId = await createOtherTenant();
		const foreignHe = await createTestHazardousEvent(otherTenantId);
		const uniqueName = "should-not-be-created-" + randomUUID();

		const response = await callAction({
			id: "new",
			formData: {
				approvalStatus: "draft",
				nameNational: uniqueName,
				linkedTriggeringHazardousEventIds: JSON.stringify([
					foreignHe.hazardousEventId,
				]),
			},
		});

		if (response instanceof Response) {
			throw new Error("expected a form response, got a redirect Response");
		}
		expect(response.ok).toBe(false);

		const createdRows = await dr
			.select({ id: disasterEventTable.id })
			.from(disasterEventTable)
			.where(eq(disasterEventTable.nameNational, uniqueName));
		expect(createdRows).toHaveLength(0);
	});

	// Guard also covers the legacy linkedHazardousEventIds fallback (~542-551).
	it("rejects a foreign-tenant id submitted only via the legacy linkedHazardousEventIds field", async () => {
		const otherTenantId = await createOtherTenant();
		const foreignHe = await createTestHazardousEvent(otherTenantId);

		const response = await callAction({
			id: testData.disasterEventId,
			formData: {
				approvalStatus: "draft",
				linkedHazardousEventIds: JSON.stringify([foreignHe.hazardousEventId]),
			},
		});

		if (response instanceof Response) {
			throw new Error("expected a form response, got a redirect Response");
		}
		if (response.ok) {
			throw new Error("expected a rejection, got ok:true");
		}
		expect(response.errors.form).toContain(
			"hazardous_event.cannot_reference_other_tenant",
		);

		const causalityRows = await dr
			.select()
			.from(eventCausalityTable)
			.where(
				eq(
					eventCausalityTable.triggeredHazardousEventId,
					foreignHe.hazardousEventId,
				),
			);
		expect(causalityRows).toHaveLength(0);
	});
});
