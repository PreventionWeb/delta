import { describe, expect, it } from "vitest";
import type { Tx } from "~/db.server";
import type { HipCrosswalkIds, IHipCrosswalkPort } from "./IHipCrosswalkPort";

interface SeedTaxonomyEntry {
	specificHazardId: string;
	specificHazardSourceRefId: string | null;
	clusterSourceRefId: string | null;
	typeSourceRefId: string | null;
}

/** In-memory fake exercising the port's own contract (design.md Decision 17): each level
 * resolves to null when its own sourceRefId is null, OR when that sourceRefId has no matching
 * row in the live HIP table set -- same "null when we can't honestly resolve it" rule the real
 * adapter's existence-join implements. */
class FakeHipCrosswalkPort implements IHipCrosswalkPort {
	readonly stampCalls: {
		eventId: string;
		tenantId: string;
		ids: HipCrosswalkIds;
		tx: Tx;
	}[] = [];

	constructor(
		private readonly taxonomy: readonly SeedTaxonomyEntry[],
		private readonly liveHipIds: ReadonlySet<string>,
	) {}

	private resolveLevel(sourceRefId: string | null): string | null {
		return sourceRefId !== null && this.liveHipIds.has(sourceRefId)
			? sourceRefId
			: null;
	}

	async resolve(specificHazardId: string): Promise<HipCrosswalkIds> {
		const entry = this.taxonomy.find(
			(t) => t.specificHazardId === specificHazardId,
		);
		if (!entry) {
			return { hipHazardId: null, hipClusterId: null, hipTypeId: null };
		}
		return {
			hipHazardId: this.resolveLevel(entry.specificHazardSourceRefId),
			hipClusterId: this.resolveLevel(entry.clusterSourceRefId),
			hipTypeId: this.resolveLevel(entry.typeSourceRefId),
		};
	}

	async stamp(
		eventId: string,
		tenantId: string,
		ids: HipCrosswalkIds,
		tx: Tx,
	): Promise<void> {
		this.stampCalls.push({ eventId, tenantId, ids, tx });
	}
}

describe("IHipCrosswalkPort conformance", () => {
	it("resolves all three levels when every ancestor has a valid, live sourceRefId", async () => {
		const port = new FakeHipCrosswalkPort(
			[
				{
					specificHazardId: "sh-1",
					specificHazardSourceRefId: "hip-hazard-1",
					clusterSourceRefId: "hip-cluster-1",
					typeSourceRefId: "hip-type-1",
				},
			],
			new Set(["hip-hazard-1", "hip-cluster-1", "hip-type-1"]),
		);

		await expect(port.resolve("sh-1")).resolves.toEqual({
			hipHazardId: "hip-hazard-1",
			hipClusterId: "hip-cluster-1",
			hipTypeId: "hip-type-1",
		});
	});

	it("resolves null for a level whose own sourceRefId is null, without affecting the other levels", async () => {
		const port = new FakeHipCrosswalkPort(
			[
				{
					specificHazardId: "sh-1",
					specificHazardSourceRefId: "hip-hazard-1",
					clusterSourceRefId: null,
					typeSourceRefId: "hip-type-1",
				},
			],
			new Set(["hip-hazard-1", "hip-type-1"]),
		);

		await expect(port.resolve("sh-1")).resolves.toEqual({
			hipHazardId: "hip-hazard-1",
			hipClusterId: null,
			hipTypeId: "hip-type-1",
		});
	});

	it("resolves null for a level whose sourceRefId is set but dangling (no matching live HIP row)", async () => {
		const port = new FakeHipCrosswalkPort(
			[
				{
					specificHazardId: "sh-1",
					specificHazardSourceRefId: "hip-hazard-stale",
					clusterSourceRefId: "hip-cluster-1",
					typeSourceRefId: "hip-type-1",
				},
			],
			// hip-hazard-stale is deliberately absent -- simulates HIP taxonomy data edited after migration.
			new Set(["hip-cluster-1", "hip-type-1"]),
		);

		await expect(port.resolve("sh-1")).resolves.toEqual({
			hipHazardId: null,
			hipClusterId: "hip-cluster-1",
			hipTypeId: "hip-type-1",
		});
	});

	it("stamp() receives the resolved ids, the event id, the tenant id, and the given tx", async () => {
		const port = new FakeHipCrosswalkPort([], new Set());
		const ids: HipCrosswalkIds = {
			hipHazardId: "h1",
			hipClusterId: "c1",
			hipTypeId: "t1",
		};
		const tx = {} as Tx;

		await port.stamp("event-1", "tenant-1", ids, tx);

		expect(port.stampCalls).toEqual([
			{ eventId: "event-1", tenantId: "tenant-1", ids, tx },
		]);
	});
});

// Tuple equality (not plain assignability) so a dropped/added param fails to compile.
type AssertEqual<A, B> = A extends B ? (B extends A ? true : never) : never;

const _resolveArity: AssertEqual<
	Parameters<IHipCrosswalkPort["resolve"]>,
	[string]
> = true;

const _stampArity: AssertEqual<
	Parameters<IHipCrosswalkPort["stamp"]>,
	[string, string, HipCrosswalkIds, Tx]
> = true;

void _resolveArity;
void _stampArity;
