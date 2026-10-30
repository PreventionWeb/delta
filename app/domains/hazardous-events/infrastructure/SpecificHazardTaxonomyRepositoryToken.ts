import type { InjectionToken } from "@nestjs/common";

import type { ISpecificHazardTaxonomyRepository } from "~/domains/hazardous-events/application/ports/ISpecificHazardTaxonomyRepository";

// Kept out of ISpecificHazardTaxonomyRepository.ts -- domain/application types must not import @nestjs/common.
export const SPECIFIC_HAZARD_TAXONOMY_REPOSITORY: InjectionToken<ISpecificHazardTaxonomyRepository> =
	Symbol("SPECIFIC_HAZARD_TAXONOMY_REPOSITORY");
