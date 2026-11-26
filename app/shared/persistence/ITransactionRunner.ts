import type { Tx } from "~/db.server";

/** Lets a use case open a real transaction without holding infrastructure directly (design.md Decision 1). `Tx` is a type-only import (Decision 3's carve-out). */
export interface ITransactionRunner {
	/** Commits with fn's value, or rolls back and rethrows fn's error. With `outerTx`, a savepoint
	 * that commits only with the caller's transaction. */
	run<T>(fn: (tx: Tx) => Promise<T>, outerTx?: Tx): Promise<T>;
}
