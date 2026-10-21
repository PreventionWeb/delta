import { describe, expect, it } from "vitest";
import type { Tx } from "~/db.server";
import type { ITransactionRunner } from "~/shared/persistence/ITransactionRunner";

/**
 * Fake conformance implementation (matches IHazardousEventRepository.test.ts's pattern) — no real
 * transaction semantics, just invokes fn with a placeholder tx and relays its outcome.
 */
class FakeTransactionRunner implements ITransactionRunner {
	async run<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
		return fn({} as Tx);
	}
}

describe("ITransactionRunner conformance", () => {
	it("invokes fn with a tx handle and resolves with fn's own return value", async () => {
		const runner = new FakeTransactionRunner();

		const result = await runner.run(async (tx) => {
			expect(tx).toBeDefined();
			return "resolved-value";
		});

		expect(result).toBe("resolved-value");
	});

	it("propagates fn's rejection unmodified", async () => {
		const runner = new FakeTransactionRunner();
		const failure = new Error("boom");

		await expect(
			runner.run(async () => {
				throw failure;
			}),
		).rejects.toBe(failure);
	});

	// PGlite fully serializes concurrent db.transaction() calls (confirmed elsewhere in this
	// change, e.g. DrizzleHazardousEventRepository.test.ts's RaceBarrier comment) -- a second
	// call's transaction can never open while a first is still in progress on the same instance,
	// so two genuinely-simultaneously-open transactions can't be driven against the real
	// DrizzleTransactionRunner/PGlite pairing to test this. This fake, with its own staged/commit
	// model, can be driven with precise manual interleaving instead, to prove the port's own
	// documented isolation contract is checkable at all.
	it("isolation: a read via one call's own tx never observes the other call's own uncommitted write while both are still open", async () => {
		class StagedKeyValueTransactionRunner implements ITransactionRunner {
			private readonly committed = new Map<string, string>();

			async run<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
				const staged = new Map(this.committed);
				const tx = {
					write: (key: string, value: string) => staged.set(key, value),
					read: (key: string) => staged.get(key),
				} as unknown as Tx;
				const result = await fn(tx);
				for (const [key, value] of staged) this.committed.set(key, value);
				return result;
			}
		}
		const runner = new StagedKeyValueTransactionRunner();
		let resolveAWritten: () => void = () => {};
		const aHasWritten = new Promise<void>((resolve) => {
			resolveAWritten = resolve;
		});
		let resolveACanFinish: () => void = () => {};
		const aCanFinish = new Promise<void>((resolve) => {
			resolveACanFinish = resolve;
		});
		let observedByB: string | undefined;

		const runA = runner.run(async (tx) => {
			(tx as unknown as { write(k: string, v: string): void }).write(
				"key",
				"A-value",
			);
			resolveAWritten();
			await aCanFinish; // A's own tx stays open (uncommitted) until the test lets it finish.
			return "A-done";
		});

		await aHasWritten; // B's run() starts only once A has written but before A commits.

		const runB = runner.run(async (tx) => {
			observedByB = (
				tx as unknown as { read(k: string): string | undefined }
			).read("key");
			return "B-done";
		});

		await runB;
		resolveACanFinish();
		await runA;

		expect(observedByB).toBeUndefined();
	});
});

// Tuple equality (not plain assignability), so a dropped/added param fails to compile (matches
// IHazardousEventRepository.test.ts's own arity-assertion pattern).
type AssertEqual<A, B> = A extends B ? (B extends A ? true : never) : never;

const _runArity: AssertEqual<
	Parameters<ITransactionRunner["run"]>,
	[(tx: Tx) => Promise<unknown>]
> = true;
void _runArity;

// Exactly one method declared on the interface — a second method added later fails this check.
const _onlyRunMethod: AssertEqual<keyof ITransactionRunner, "run"> = true;
void _onlyRunMethod;
