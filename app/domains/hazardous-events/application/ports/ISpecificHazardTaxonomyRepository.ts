/** Resolved names for a `specific_hazard` row and its ancestor cluster/type. */
export interface SpecificHazardTaxonomyNames {
	specificHazardName: string;
	hazardClusterName: string;
	hazardTypeName: string;
}

/** Separate from `IHazardousEventRepository` -- a sibling collaborator, not a repo method (SRP). */
export interface ISpecificHazardTaxonomyRepository {
	/** Ids with no matching row are omitted from the result, not errored. */
	findNamesByIds(
		ids: readonly string[],
	): Promise<ReadonlyMap<string, SpecificHazardTaxonomyNames>>;
}
