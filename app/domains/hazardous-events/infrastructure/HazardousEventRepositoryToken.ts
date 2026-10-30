import type { InjectionToken } from "@nestjs/common";

import type { IHazardousEventRepository } from "~/domains/hazardous-events/application/ports/IHazardousEventRepository";

// Kept out of IHazardousEventRepository.ts — domain/application types must not import @nestjs/common.
export const HAZARDOUS_EVENT_REPOSITORY: InjectionToken<IHazardousEventRepository> =
	Symbol("HAZARDOUS_EVENT_REPOSITORY");
