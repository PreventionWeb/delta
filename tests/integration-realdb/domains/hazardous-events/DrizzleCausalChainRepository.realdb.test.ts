import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { dr } from "~/db.server";
import { hazardousEventCausalityTable } from "~/domains/hazardous-events/infrastructure/hazardousEventCausalityTable";
import { DrizzleCausalChainRepository } from "~/domains/hazardous-events/infrastructure/DrizzleCausalChainRepository.server";
import { ConflictError } from "~/shared/errors";
import {
	createTestIds,
	createTestUser,
	cleanupTestUser,
} from "../../test-helpers";
import { createTestHazardousEvent } from "../../routes/hazardous-event/test-helpers";

/**
 * Real-Postgres duplicates of DrizzleCausalChainRepository.test.ts's two mandatory
 * concurrent-callers scenarios (DEF-030 Races 1 and 2). PGlite cannot prove these: PGlite's own
 * `db.transaction()` holds a single instance-wide mutex for the whole callback, so two concurrent
 * transactions can never interleave regardless of whether `acquireSortedLocks`'s
 * `pg_advisory_xact_lock` calls are present — confirmed by manually deleting those calls and
 * observing the PGlite tests still pass. Real Postgres gives each concurrent call its own
 * connection, so here the advisory lock is the only thing serializing them — this is the actual
 * proof the locking mechanism, not just transaction-wrapping, is load-bearing.
 */
/**
 * Forces the pool to have at least 2 idle connections established *before* the real race fires.
 * Without this, the two concurrent transactions below don't actually overlap: establishing a
 * second physical connection (TCP + auth) is slower than this adapter's own few-millisecond
 * transaction, so the second call's BEGIN doesn't even start until the first has already
 * committed — confirmed by temporary timing instrumentation during this test's own development,
 * not assumed. Pre-warming removes connection setup from the timing picture, so what's actually
 * being raced is the two transactions' SQL, not pool connection latency.
 */
async function warmUpPool(): Promise<void> {
	await Promise.all([dr.execute(sql`SELECT 1`), dr.execute(sql`SELECT 1`)]);
}

describe("DrizzleCausalChainRepository against real Postgres (DEF-030 lock proof)", () => {
	const ids = createTestIds();

	beforeAll(async () => {
		await createTestUser(ids);
	});

	afterAll(async () => {
		// Cascades to any hazardous_event_causality rows these tests created (FK ON DELETE
		// CASCADE) — no separate cleanup needed; scoped only to this test's own country account,
		// never a broad delete.
		await cleanupTestUser(ids);
	});

	it("Race 1: two concurrent saveEdge calls that would jointly close a two-node cycle do not both succeed", async () => {
		const { hazardousEventId: a } = await createTestHazardousEvent(
			ids.countryAccountId,
		);
		const { hazardousEventId: b } = await createTestHazardousEvent(
			ids.countryAccountId,
		);
		const repo = new DrizzleCausalChainRepository(dr);
		await warmUpPool();

		const outcomes = await Promise.allSettled([
			repo.saveEdge({ causeId: a, effectId: b }, null),
			repo.saveEdge({ causeId: b, effectId: a }, null),
		]);

		const fulfilled = outcomes.filter((o) => o.status === "fulfilled");
		const rejected = outcomes.filter((o) => o.status === "rejected");
		expect(fulfilled).toHaveLength(1);
		expect(rejected).toHaveLength(1);
		expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
			ConflictError,
		);
	});

	it("Race 2: two concurrent replaceCauseEdge calls for the same effect leave exactly one cause edge, never two", async () => {
		const { hazardousEventId: causeX } = await createTestHazardousEvent(
			ids.countryAccountId,
		);
		const { hazardousEventId: causeY } = await createTestHazardousEvent(
			ids.countryAccountId,
		);
		const { hazardousEventId: effect } = await createTestHazardousEvent(
			ids.countryAccountId,
		);
		const repo = new DrizzleCausalChainRepository(dr);
		await warmUpPool();

		await Promise.all([
			repo.replaceCauseEdge(effect, {
				causeId: causeX,
				causalityExplanation: null,
			}),
			repo.replaceCauseEdge(effect, {
				causeId: causeY,
				causalityExplanation: null,
			}),
		]);

		const rows = await dr
			.select()
			.from(hazardousEventCausalityTable)
			.where(eq(hazardousEventCausalityTable.effectHazardousEventId, effect));
		expect(rows).toHaveLength(1);
	});
});
