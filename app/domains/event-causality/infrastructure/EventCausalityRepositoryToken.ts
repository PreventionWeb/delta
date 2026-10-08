import type { InjectionToken } from "@nestjs/common";

import type { IEventCausalityRepository } from "~/domains/event-causality/application/ports/IEventCausalityRepository";

export const EVENT_CAUSALITY_REPOSITORY: InjectionToken<IEventCausalityRepository> =
	Symbol("EVENT_CAUSALITY_REPOSITORY");
