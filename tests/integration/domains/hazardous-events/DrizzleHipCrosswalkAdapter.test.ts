import "../../db/setup";
import { randomUUID } from "crypto";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { dr } from "~/db.server";
import { hazardousEventTable } from "~/drizzle/schema/hazardousEventTable";
import { DrizzleHipCrosswalkAdapter } from "~/domains/hazardous-events/infrastructure/DrizzleHipCrosswalkAdapter.server";
import {
	seedCountryAccount,
	seedHipChain,
	seedSpecificHazard,
	seedSpecificHazardWithHipCrosswalk,
	seedHazardousEvent,
} from "../../db/models/hazardousEventTestHelpers";

// design.md Decision 17 (task 9d.3): resolve()'s three scenarios against real
// hazard_type/hazard_cluster/specific_hazard rows joined to real hip_class/hip_cluster/hip_hazard
// rows, plus stamp()'s own two scenarios.
describe("DrizzleHipCrosswalkAdapter against PGlite", () => {
	describe("resolve()", () => {
		it("resolves all three HIP ids when every ancestor has a valid, live sourceRefId", async () => {
			const { specificHazardId, hipHazardId, hipClusterId, hipTypeId } =
				await seedSpecificHazardWithHipCrosswalk();
			const adapter = new DrizzleHipCrosswalkAdapter(dr);

			await expect(adapter.resolve(specificHazardId)).resolves.toEqual({
				hipHazardId,
				hipClusterId,
				hipTypeId,
			});
		});

		it("resolves hipClusterId as null when the cluster's own sourceRefId is null, without affecting the other two levels", async () => {
			const hip = await seedHipChain();
			const specificHazardId = await seedSpecificHazard({
				hipTypeId: hip.hipTypeId,
				hipClusterId: null,
				hipHazardId: hip.hipHazardId,
			});
			const adapter = new DrizzleHipCrosswalkAdapter(dr);

			await expect(adapter.resolve(specificHazardId)).resolves.toEqual({
				hipHazardId: hip.hipHazardId,
				hipClusterId: null,
				hipTypeId: hip.hipTypeId,
			});
		});

		it("resolves hipHazardId as null when the hazard-level sourceRefId is set but dangling (no matching hip_hazard row)", async () => {
			const hip = await seedHipChain();
			const specificHazardId = await seedSpecificHazard({
				hipTypeId: hip.hipTypeId,
				hipClusterId: hip.hipClusterId,
				// Deliberately dangling -- no hip_hazard row has this id.
				hipHazardId: `dangling-${randomUUID()}`,
			});
			const adapter = new DrizzleHipCrosswalkAdapter(dr);

			await expect(adapter.resolve(specificHazardId)).resolves.toEqual({
				hipHazardId: null,
				hipClusterId: hip.hipClusterId,
				hipTypeId: hip.hipTypeId,
			});
		});
	});

	describe("stamp()", () => {
		it("writes all three HIP columns, including an explicit null, inside the given tx", async () => {
			const tenantId = (await seedCountryAccount()) as string;
			const { id } = await seedHazardousEvent({
				countryAccountsId: tenantId,
				hipHazardId: null,
				hipClusterId: null,
				hipTypeId: null,
			});
			const { hipHazardId, hipClusterId } =
				await seedSpecificHazardWithHipCrosswalk();
			const adapter = new DrizzleHipCrosswalkAdapter(dr);

			await dr.transaction(async (tx) => {
				await adapter.stamp(
					id,
					tenantId,
					{ hipHazardId, hipClusterId, hipTypeId: null },
					tx,
				);
			});

			const [row] = await dr
				.select()
				.from(hazardousEventTable)
				.where(eq(hazardousEventTable.id, id));
			expect(row.hipHazardId).toBe(hipHazardId);
			expect(row.hipClusterId).toBe(hipClusterId);
			expect(row.hipTypeId).toBeNull();
		});

		it("is tenant-scoped -- updates zero rows when the given tenantId doesn't match the event's own", async () => {
			const tenantId = (await seedCountryAccount()) as string;
			const otherTenantId = (await seedCountryAccount()) as string;
			const { id } = await seedHazardousEvent({
				countryAccountsId: tenantId,
				hipHazardId: null,
				hipClusterId: null,
				hipTypeId: null,
			});
			const { hipHazardId, hipClusterId, hipTypeId } =
				await seedSpecificHazardWithHipCrosswalk();
			const adapter = new DrizzleHipCrosswalkAdapter(dr);

			await dr.transaction(async (tx) => {
				await adapter.stamp(
					id,
					otherTenantId,
					{ hipHazardId, hipClusterId, hipTypeId },
					tx,
				);
			});

			const [row] = await dr
				.select()
				.from(hazardousEventTable)
				.where(eq(hazardousEventTable.id, id));
			expect(row.hipHazardId).toBeNull();
			expect(row.hipClusterId).toBeNull();
			expect(row.hipTypeId).toBeNull();
		});
	});
});
