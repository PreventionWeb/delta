import type { InjectionToken } from "@nestjs/common";

import type { IHazardTaxonomyRepository } from "~/domains/hazardous-events/application/ports/IHazardTaxonomyRepository";

// Kept out of IHazardTaxonomyRepository.ts — domain/application types must not import @nestjs/common.
export const HAZARD_TAXONOMY_REPOSITORY: InjectionToken<IHazardTaxonomyRepository> =
	Symbol("HAZARD_TAXONOMY_REPOSITORY");
