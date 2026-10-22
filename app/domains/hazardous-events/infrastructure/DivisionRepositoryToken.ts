import type { InjectionToken } from "@nestjs/common";

import type { IDivisionRepository } from "~/domains/hazardous-events/application/ports/IDivisionRepository";

// Kept out of IDivisionRepository.ts — domain/application types must not import @nestjs/common.
export const DIVISION_REPOSITORY: InjectionToken<IDivisionRepository> = Symbol(
	"DIVISION_REPOSITORY",
);
