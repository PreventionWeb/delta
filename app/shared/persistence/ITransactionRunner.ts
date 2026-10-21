import type { Tx } from "~/db.server";

/** Lets a use case open a real transaction without holding infrastructure directly (design.md Decision 1). `Tx` is a type-only import (Decision 3's carve-out). */
export interface ITransactionRunner {
	/** Commits and resolves with fn's value on success; rolls back and rejects with fn's own error on failure. */
	run<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
}
