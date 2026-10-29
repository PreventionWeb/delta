import type {
	HazardTaxonomyOptions,
	ISpecificHazardTaxonomyRepository,
} from "../ports/ISpecificHazardTaxonomyRepository";

// Re-exported from here, not the repository port -- same layering as HazardousEventListFilterInput
// (design.md Decision 3).
export type { HazardTaxonomyOptions };

// Thin pass-through for the loader, no tenant/auth logic of its own (design.md Decision 1).
export class GetHazardTaxonomyOptionsUseCase {
	constructor(
		private readonly specificHazardTaxonomyRepository: Pick<
			ISpecificHazardTaxonomyRepository,
			"listAll"
		>,
	) {}

	async execute(): Promise<HazardTaxonomyOptions> {
		return this.specificHazardTaxonomyRepository.listAll();
	}
}
