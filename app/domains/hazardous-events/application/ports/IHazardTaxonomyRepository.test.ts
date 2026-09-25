import { describe, expect, it } from "vitest";
import type { IHazardTaxonomyRepository } from "./IHazardTaxonomyRepository";

interface TaxonomyRow {
	readonly id: string;
	readonly tenantId: string;
}

/** Fake conformance implementation (matches IHazardousEventRepository.test.ts's pattern). Both
 * methods share one row-filtering shape, mirroring the port's own two-methods-one-scan design. */
class FakeHazardTaxonomyRepository implements IHazardTaxonomyRepository {
	constructor(
		private readonly hazardDrivers: readonly TaxonomyRow[],
		private readonly customFieldDefinitions: readonly TaxonomyRow[],
	) {}

	private resolveValidIds(
		rows: readonly TaxonomyRow[],
		ids: readonly string[],
		tenantId: string,
	): ReadonlySet<string> {
		const sameTenantIds = new Set(
			rows.filter((row) => row.tenantId === tenantId).map((row) => row.id),
		);
		return new Set(ids.filter((id) => sameTenantIds.has(id)));
	}

	async findValidHazardDriverIds(
		ids: readonly string[],
		tenantId: string,
	): Promise<ReadonlySet<string>> {
		return this.resolveValidIds(this.hazardDrivers, ids, tenantId);
	}

	async findValidCustomFieldDefinitionIds(
		ids: readonly string[],
		tenantId: string,
	): Promise<ReadonlySet<string>> {
		return this.resolveValidIds(this.customFieldDefinitions, ids, tenantId);
	}
}

describe("IHazardTaxonomyRepository conformance", () => {
	describe("findValidHazardDriverIds", () => {
		it("includes only same-tenant ids", async () => {
			const repo = new FakeHazardTaxonomyRepository(
				[
					{ id: "d1", tenantId: "tenant-1" },
					{ id: "d2", tenantId: "tenant-2" },
				],
				[],
			);

			const result = await repo.findValidHazardDriverIds(
				["d1", "d2"],
				"tenant-1",
			);

			expect(result.has("d1")).toBe(true);
			expect(result.has("d2")).toBe(false);
		});

		it("excludes a non-existent id without throwing", async () => {
			const repo = new FakeHazardTaxonomyRepository([], []);

			await expect(
				repo.findValidHazardDriverIds(["d-missing"], "tenant-1"),
			).resolves.toEqual(new Set());
		});

		it("resolves an empty set for an empty ids array", async () => {
			const repo = new FakeHazardTaxonomyRepository(
				[{ id: "d1", tenantId: "tenant-1" }],
				[],
			);

			await expect(
				repo.findValidHazardDriverIds([], "tenant-1"),
			).resolves.toEqual(new Set());
		});
	});

	describe("findValidCustomFieldDefinitionIds", () => {
		it("includes only same-tenant custom field definition ids", async () => {
			const repo = new FakeHazardTaxonomyRepository(
				[],
				[
					{ id: "f1", tenantId: "tenant-1" },
					{ id: "f2", tenantId: "tenant-2" },
				],
			);

			const result = await repo.findValidCustomFieldDefinitionIds(
				["f1", "f2"],
				"tenant-1",
			);

			expect(result.has("f1")).toBe(true);
			expect(result.has("f2")).toBe(false);
		});

		it("excludes a non-existent custom field definition id without throwing", async () => {
			const repo = new FakeHazardTaxonomyRepository([], []);

			await expect(
				repo.findValidCustomFieldDefinitionIds(["f-missing"], "tenant-1"),
			).resolves.toEqual(new Set());
		});
	});
});

// Tuple equality (not plain assignability), so a dropped/added param fails to compile (matches IHazardousEventRepository.test.ts).
type AssertEqual<A, B> = A extends B ? (B extends A ? true : never) : never;

const _findValidHazardDriverIdsArity: AssertEqual<
	Parameters<IHazardTaxonomyRepository["findValidHazardDriverIds"]>,
	[readonly string[], string]
> = true;
const _findValidCustomFieldDefinitionIdsArity: AssertEqual<
	Parameters<IHazardTaxonomyRepository["findValidCustomFieldDefinitionIds"]>,
	[readonly string[], string]
> = true;

void _findValidHazardDriverIdsArity;
void _findValidCustomFieldDefinitionIdsArity;
