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

/** Legacy HIP ids to resolve (D13), plus CA ids whose ancestors the import must check. */
export interface SourceRefQuery {
	hazardRefs: readonly string[];
	clusterRefs: readonly string[];
	typeRefs: readonly string[];
	specificHazardIds?: readonly string[];
}

export interface TaxonomyAncestors {
	hazardClusterId: string;
	hazardTypeId: string;
}

/** Unknown refs are absent from each map, never an error. */
export interface SourceRefResolution {
	hazards: ReadonlyMap<
		string,
		TaxonomyAncestors & { specificHazardId: string }
	>;
	clusters: ReadonlyMap<string, TaxonomyAncestors>;
	types: ReadonlyMap<string, { hazardTypeId: string }>;
	/** Keyed by CA `specific_hazard.id`. */
	specificHazards: ReadonlyMap<string, TaxonomyAncestors>;
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

	/** Any one specific hazard id, or `null` when the taxonomy is empty (template example row). */
	findAnySpecificHazardId(): Promise<string | null>;

	/** One query, whatever the number of refs; `source_ref_id` is UNIQUE per table (D13). */
	findBySourceRefIds(refs: SourceRefQuery): Promise<SourceRefResolution>;
}
