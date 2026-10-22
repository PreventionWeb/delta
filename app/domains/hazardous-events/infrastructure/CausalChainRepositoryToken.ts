import type { InjectionToken } from "@nestjs/common";

import type { ICausalChainRepository } from "~/domains/hazardous-events/application/ports/ICausalChainRepository";

// Kept out of ICausalChainRepository.ts — domain/application types must not import @nestjs/common.
export const CAUSAL_CHAIN_REPOSITORY: InjectionToken<ICausalChainRepository> =
	Symbol("CAUSAL_CHAIN_REPOSITORY");
