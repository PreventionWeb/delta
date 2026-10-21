import { Injectable, Inject } from "@nestjs/common";
import type { Dr, Tx } from "~/db.server";
import { DRIZZLE_CLIENT } from "~/infrastructure/DrizzleProvider.server";
import type { ITransactionRunner } from "~/shared/persistence/ITransactionRunner";

@Injectable()
export class DrizzleTransactionRunner implements ITransactionRunner {
	constructor(@Inject(DRIZZLE_CLIENT) private readonly db: Dr) {}

	run<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
		return this.db.transaction(fn);
	}
}
