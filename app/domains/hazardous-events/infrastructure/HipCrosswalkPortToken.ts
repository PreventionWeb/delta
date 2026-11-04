import type { InjectionToken } from "@nestjs/common";

import type { IHipCrosswalkPort } from "~/domains/hazardous-events/application/ports/IHipCrosswalkPort";

// Kept out of IHipCrosswalkPort.ts -- domain/application types must not import @nestjs/common.
export const HIP_CROSSWALK_PORT: InjectionToken<IHipCrosswalkPort> =
	Symbol("HIP_CROSSWALK_PORT");
