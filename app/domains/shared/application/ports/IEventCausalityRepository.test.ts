import { describe, expect, it } from "vitest";
import type {
	EventCausalityReferenceCounts,
	IEventCausalityRepository,
} from "./IEventCausalityRepository";

interface StoredRow {
	hazardousEventId: string;
	/** The tenant owning whichever side of the row isn't hazardousEventId. */
	otherSideTenantId: string;
}

class FakeEventCausalityRepository implements IEventCausalityRepository {
	private readonly rows: StoredRow[] = [];

	seedRow(hazardousEventId: string, otherSideTenantId: string): void {
		this.rows.push({ hazardousEventId, otherSideTenantId });
	}

	async countReferences(
		hazardousEventId: string,
		tenantId: string,
	): Promise<EventCausalityReferenceCounts> {
		const matching = this.rows.filter(
			(row) => row.hazardousEventId === hazardousEventId,
		);
		const sameTenantCount = matching.filter(
			(row) => row.otherSideTenantId === tenantId,
		).length;
		return {
			sameTenantCount,
			crossTenantCount: matching.length - sameTenantCount,
		};
	}
}

describe("IEventCausalityRepository conformance", () => {
	it("resolves zero for both counts when no event_causality row references the hazardous event", async () => {
		const repo = new FakeEventCausalityRepository();

		await expect(repo.countReferences("he-1", "tenant-1")).resolves.toEqual({
			sameTenantCount: 0,
			crossTenantCount: 0,
		});
	});

	// The fake stores one row per reference, regardless of which column (triggering/triggered)
	// the real schema's CHECK constraint would populate — the port's own count is symmetric.
	it("counts a same-tenant reference as the triggering party in sameTenantCount", async () => {
		const repo = new FakeEventCausalityRepository();
		repo.seedRow("he-1", "tenant-1");

		await expect(repo.countReferences("he-1", "tenant-1")).resolves.toEqual({
			sameTenantCount: 1,
			crossTenantCount: 0,
		});
	});

	it("counts a same-tenant reference as the triggered party in sameTenantCount", async () => {
		const repo = new FakeEventCausalityRepository();
		repo.seedRow("he-1", "tenant-1");

		await expect(repo.countReferences("he-1", "tenant-1")).resolves.toEqual({
			sameTenantCount: 1,
			crossTenantCount: 0,
		});
	});

	it("counts a cross-tenant reference in crossTenantCount, not sameTenantCount", async () => {
		const repo = new FakeEventCausalityRepository();
		repo.seedRow("he-1", "tenant-2");

		await expect(repo.countReferences("he-1", "tenant-1")).resolves.toEqual({
			sameTenantCount: 0,
			crossTenantCount: 1,
		});
	});

	it("counts same-tenant and cross-tenant rows independently when both are present", async () => {
		const repo = new FakeEventCausalityRepository();
		repo.seedRow("he-1", "tenant-1");
		repo.seedRow("he-1", "tenant-2");

		await expect(repo.countReferences("he-1", "tenant-1")).resolves.toEqual({
			sameTenantCount: 1,
			crossTenantCount: 1,
		});
	});
});

// Tuple equality (not plain assignability), so a dropped/added param fails to compile.
type AssertEqual<A, B> = A extends B ? (B extends A ? true : never) : never;

const _countReferencesArity: AssertEqual<
	Parameters<IEventCausalityRepository["countReferences"]>,
	[string, string]
> = true;

void _countReferencesArity;
