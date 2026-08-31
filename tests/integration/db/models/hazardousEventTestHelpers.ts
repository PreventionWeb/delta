// Shared seed helpers for the Hazardous Events Phase 0 characterization test suites
// (0a hazardousEventCoreCrud.test.ts, 0b hazardousEventCausalChain.test.ts, ...).
// See _docs/refactoring-plan/hazardous-events-refactoring-roadmap.md.
import { randomUUID } from "crypto";
import { dr } from "~/db.server";
import { countriesTable } from "../testSchema/countriesTable";
import { countryAccounts } from "../testSchema/countryAccounts";
import { hipTypeTable } from "../testSchema/hipTypeTable";
import { hipClusterTable } from "../testSchema/hipClusterTable";
import { hipHazardTable } from "../testSchema/hipHazardTable";
import { userTable } from "../testSchema/userTable";
import { userCountryAccounts } from "../testSchema/userCountryAccounts";
import { eventTable } from "../testSchema/eventTable";
import { hazardousEventTable } from "../testSchema/hazardousEventTable";
import { HazardousEventFields } from "~/backend.server/models/event";
import { createTestBackendContext } from "~/backend.server/context";

// The real BackendContext needs globalThis.createTranslationGetter wired up (app bootstrap
// does this at startup); tests don't have that, so use the same lightweight ctx.t double
// established in tests/unit/services/approvalStatusWorkflowService.test.ts instead of
// createTestBackendContext().
export const ctx = {
	t: ({ msg }: { msg: string }) => msg,
	lang: "en",
} as unknown as ReturnType<typeof createTestBackendContext>;

export async function seedCountryAccount() {
	const [country] = await dr
		.insert(countriesTable)
		.values({ name: `Country ${randomUUID()}` })
		.returning();
	const [account] = await dr
		.insert(countryAccounts)
		.values({ shortDescription: "Test", countryId: country.id })
		.returning();
	return account.id;
}

export async function seedHipChain() {
	const suffix = randomUUID();
	const [type] = await dr
		.insert(hipTypeTable)
		.values({ id: `type-${suffix}`, name: { en: "Test Type" } })
		.returning();
	const [cluster] = await dr
		.insert(hipClusterTable)
		.values({
			id: `cluster-${suffix}`,
			typeId: type.id,
			name: { en: "Test Cluster" },
		})
		.returning();
	const [hazard] = await dr
		.insert(hipHazardTable)
		.values({
			id: `hazard-${suffix}`,
			clusterId: cluster.id,
			name: { en: "Test Hazard" },
		})
		.returning();
	return {
		hipTypeId: type.id,
		hipClusterId: cluster.id,
		hipHazardId: hazard.id,
	};
}

export async function seedUser() {
	const [user] = await dr
		.insert(userTable)
		.values({ email: `user-${randomUUID()}@test.com` })
		.returning();
	return user.id;
}

/** Seeds a user and links them to a country account with the given role — required for
 * handleApprovalWorkflowService, which looks this up before dispatching any action. */
export async function seedUserWithCountryAccountRole(
	countryAccountsId: string,
	role: string = "data-collector",
) {
	const userId = await seedUser();
	await dr
		.insert(userCountryAccounts)
		.values({ userId, countryAccountsId, role });
	return userId;
}

export async function baseFields(
	overrides: Partial<HazardousEventFields> = {},
): Promise<HazardousEventFields> {
	const countryAccountsId =
		overrides.countryAccountsId ?? (await seedCountryAccount());
	const hip = await seedHipChain();

	return {
		name: "Test Hazardous Event",
		description: "Test Hazardous Event Description",
		countryAccountsId,
		hipHazardId: hip.hipHazardId,
		hipClusterId: hip.hipClusterId,
		hipTypeId: hip.hipTypeId,
		recordOriginator: "Field survey",
		attachments: [],
		parent: "",
		// "" instead of null here crashes with a raw Postgres UUID error — see audit findings doc.
		createdByUserId: null as any,
		updatedByUserId: null as any,
		submittedByUserId: null,
		validatedByUserId: null,
		publishedByUserId: null,
		...overrides,
	} as HazardousEventFields;
}

/** Directly seeds a hazardous_event row bypassing hazardousEventCreate, for tests that
 * only need a pre-existing record (e.g. update/delete scenarios). */
export async function seedHazardousEvent(
	overrides: Partial<HazardousEventFields> = {},
) {
	const fields = await baseFields(overrides);
	const [ev] = await dr
		.insert(eventTable)
		.values({ name: fields.name, description: fields.description })
		.returning({ id: eventTable.id });
	await dr.insert(hazardousEventTable).values({
		id: ev.id,
		countryAccountsId: fields.countryAccountsId,
		hipHazardId: fields.hipHazardId,
		hipClusterId: fields.hipClusterId,
		hipTypeId: fields.hipTypeId,
		recordOriginator: fields.recordOriginator,
		description: fields.description,
		attachments: [],
	});
	return { id: ev.id, countryAccountsId: fields.countryAccountsId as string };
}
