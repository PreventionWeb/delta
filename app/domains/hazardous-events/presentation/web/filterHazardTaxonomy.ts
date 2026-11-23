import type {
	HazardClusterOption,
	HazardTaxonomyOptions,
	HazardTypeOption,
	SpecificHazardOption,
} from "~/domains/hazardous-events/application/ports/ISpecificHazardTaxonomyRepository";

export interface FilteredHazardTaxonomy {
	types: readonly HazardTypeOption[];
	clusters: readonly HazardClusterOption[];
	hazards: readonly SpecificHazardOption[];
}

/** Legacy sorts unconditionally, not trusting its own data source's ordering -- matched here
 * rather than relying on `listAll()`'s "sorted by name" contract staying true forever. */
function sortByName<T extends { name: string }>(items: readonly T[]): T[] {
	return [...items].sort((a, b) => a.name.localeCompare(b.name));
}

/** Ported from legacy's hazardpicker.tsx (lines 95-120) for exact parity (design.md Decision 9,
 * gap found in live comparison) -- NOT a strict type-then-cluster-then-hazard cascade.
 * `searchTerm` matches hazard names only; surviving clusters/types are *derived* from the
 * surviving hazards, not matched by their own name. `selectedTypeId`/`selectedClusterId` then
 * AND-narrow on top of that, same order legacy applies them in. */
export function filterHazardTaxonomy(
	options: HazardTaxonomyOptions,
	searchTerm: string,
	selectedTypeId: string,
	selectedClusterId: string,
): FilteredHazardTaxonomy {
	let hazards: readonly SpecificHazardOption[] = options.specificHazards;
	let clusters: readonly HazardClusterOption[] = options.clusters;
	let types: readonly HazardTypeOption[] = options.types;

	if (searchTerm) {
		const term = searchTerm.toLowerCase();
		hazards = hazards.filter((h) => h.name.toLowerCase().includes(term));
		clusters = clusters.filter((c) =>
			hazards.some((h) => h.clusterId === c.id),
		);
		types = types.filter((t) => clusters.some((c) => c.typeId === t.id));
	}

	if (selectedTypeId) {
		clusters = clusters.filter((c) => c.typeId === selectedTypeId);
		hazards = hazards.filter((h) => clusters.some((c) => c.id === h.clusterId));
	}

	if (selectedClusterId) {
		hazards = hazards.filter((h) => h.clusterId === selectedClusterId);
	}

	return {
		types: sortByName(types),
		clusters: sortByName(clusters),
		hazards: sortByName(hazards),
	};
}
