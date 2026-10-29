import { describe, expect, it } from "vitest";
import type {
	HazardTaxonomyOptions,
	ISpecificHazardTaxonomyRepository,
} from "../ports/ISpecificHazardTaxonomyRepository";
import { GetHazardTaxonomyOptionsUseCase } from "./GetHazardTaxonomyOptionsUseCase";

class FakeSpecificHazardTaxonomyRepository implements Pick<
	ISpecificHazardTaxonomyRepository,
	"listAll"
> {
	readonly listAllCalls: true[] = [];

	constructor(
		private readonly impl: () => Promise<HazardTaxonomyOptions> = () =>
			Promise.resolve({ types: [], clusters: [], specificHazards: [] }),
	) {}

	async listAll(): Promise<HazardTaxonomyOptions> {
		this.listAllCalls.push(true);
		return this.impl();
	}
}

describe("GetHazardTaxonomyOptionsUseCase", () => {
	it("calls listAll on the injected repository exactly once", async () => {
		const repository = new FakeSpecificHazardTaxonomyRepository();
		const useCase = new GetHazardTaxonomyOptionsUseCase(repository);

		await useCase.execute();

		expect(repository.listAllCalls).toHaveLength(1);
	});

	it("returns the repository's result completely unchanged", async () => {
		const seededResult: HazardTaxonomyOptions = {
			types: [{ id: "type-1", name: "Biological" }],
			clusters: [
				{ id: "cluster-1", typeId: "type-1", name: "Infectious disease" },
			],
			specificHazards: [
				{
					id: "hazard-1",
					clusterId: "cluster-1",
					name: "Cholera",
					code: "code-1",
				},
			],
		};
		const repository = new FakeSpecificHazardTaxonomyRepository(() =>
			Promise.resolve(seededResult),
		);
		const useCase = new GetHazardTaxonomyOptionsUseCase(repository);

		const result = await useCase.execute();

		expect(result).toEqual(seededResult);
	});
});
