/** Resolved names for a `specific_hazard` row and its ancestor cluster/type. */
export interface SpecificHazardTaxonomyNames {
	specificHazardName: string;
	hazardClusterName: string;
	hazardTypeName: string;
	/** Not nullable -- mirrors the DB column's own notNull(). */
	specificHazardCode: string;
}

export interface HazardTypeOption {
	id: string;
	name: string;
}

export interface HazardClusterOption {
	id: string;
	typeId: string;
	name: string;
}

export interface SpecificHazardOption {
	id: string;
	clusterId: string;
	name: string;
	code: string;
}

export interface HazardTaxonomyOptions {
	types: HazardTypeOption[];
	clusters: HazardClusterOption[];
	specificHazards: SpecificHazardOption[];
}

/** Separate from `IHazardousEventRepository` -- a sibling collaborator, not a repo method (SRP). */
export interface ISpecificHazardTaxonomyRepository {
	/** Ids with no matching row are omitted from the result, not errored. */
	findNamesByIds(
		ids: readonly string[],
	): Promise<ReadonlyMap<string, SpecificHazardTaxonomyNames>>;

	/** Every type/cluster/specific-hazard row, sorted by name -- full preload for the cascading
	 * filter combobox, mirroring legacy's dataForHazardPicker. No tenant filter; taxonomy is global. */
	listAll(): Promise<HazardTaxonomyOptions>;
}
