import { describe, expect, it } from "vitest";
import type { IDivisionRepository } from "./IDivisionRepository";

interface DivisionRow {
	readonly id: string;
	readonly tenantId: string | null;
}

/** Fake conformance implementation (matches IHazardTaxonomyRepository.test.ts's
 * FakeHazardTaxonomyRepository pattern), plus the one scenario that port didn't need:
 * a null-tenant row excluded for every queried tenant. */
class FakeDivisionRepository implements IDivisionRepository {
	constructor(private readonly divisions: readonly DivisionRow[]) {}

	async findValidDivisionIds(
		ids: readonly string[],
		tenantId: string,
	): Promise<ReadonlySet<string>> {
		const sameTenantIds = new Set(
			this.divisions
				.filter((row) => row.tenantId === tenantId)
				.map((row) => row.id),
		);
		return new Set(ids.filter((id) => sameTenantIds.has(id)));
	}
}

describe("IDivisionRepository conformance", () => {
	describe("findValidDivisionIds", () => {
		it("includes only same-tenant division ids", async () => {
			const repo = new FakeDivisionRepository([
				{ id: "div-1", tenantId: "tenant-1" },
				{ id: "div-2", tenantId: "tenant-2" },
			]);

			const result = await repo.findValidDivisionIds(
				["div-1", "div-2"],
				"tenant-1",
			);

			expect(result.has("div-1")).toBe(true);
			expect(result.has("div-2")).toBe(false);
		});

		it("excludes a non-existent id without throwing", async () => {
			const repo = new FakeDivisionRepository([]);

			await expect(
				repo.findValidDivisionIds(["div-missing"], "tenant-1"),
			).resolves.toEqual(new Set());
		});

		it("resolves an empty set for an empty ids array", async () => {
			const repo = new FakeDivisionRepository([
				{ id: "div-1", tenantId: "tenant-1" },
			]);

			await expect(repo.findValidDivisionIds([], "tenant-1")).resolves.toEqual(
				new Set(),
			);
		});

		it("excludes a null-countryAccountsId row even when every other row in the store belongs to the queried tenant", async () => {
			const repo = new FakeDivisionRepository([
				{ id: "div-global", tenantId: null },
				{ id: "div-1", tenantId: "tenant-1" },
				{ id: "div-2", tenantId: "tenant-1" },
			]);

			const result = await repo.findValidDivisionIds(
				["div-global", "div-1", "div-2"],
				"tenant-1",
			);

			expect(result.has("div-global")).toBe(false);
			expect(result.has("div-1")).toBe(true);
			expect(result.has("div-2")).toBe(true);
		});

		it("excludes the same null-countryAccountsId row for a second, different queried tenant", async () => {
			const repo = new FakeDivisionRepository([
				{ id: "div-global", tenantId: null },
				{ id: "div-3", tenantId: "tenant-2" },
			]);

			const result = await repo.findValidDivisionIds(
				["div-global", "div-3"],
				"tenant-2",
			);

			expect(result.has("div-global")).toBe(false);
			expect(result.has("div-3")).toBe(true);
		});
	});
});

// Tuple equality (not plain assignability), so a dropped/added param fails to compile
// (matches IHazardTaxonomyRepository.test.ts).
type AssertEqual<A, B> = A extends B ? (B extends A ? true : never) : never;

const _findValidDivisionIdsArity: AssertEqual<
	Parameters<IDivisionRepository["findValidDivisionIds"]>,
	[readonly string[], string]
> = true;

void _findValidDivisionIdsArity;
