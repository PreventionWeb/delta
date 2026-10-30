import type { InjectionToken } from "@nestjs/common";

import type { ITransactionRunner } from "~/shared/persistence/ITransactionRunner";

// Kept out of ITransactionRunner.ts — domain/shared types must not import @nestjs/common.
export const TRANSACTION_RUNNER: InjectionToken<ITransactionRunner> =
	Symbol("TRANSACTION_RUNNER");
