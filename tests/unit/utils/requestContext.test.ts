import { describe, expect, it } from "vitest";
import {
	withRequestContext,
	getRequestContext,
} from "~/utils/requestContext.server";

describe("requestContext", () => {
	// Task 1.1 — store is initialised with sessionCache === undefined inside a scope
	it("getRequestContext() inside withRequestContext scope returns a store with sessionCache undefined", async () => {
		let capturedStore: ReturnType<typeof getRequestContext>;

		await withRequestContext(async () => {
			capturedStore = getRequestContext();
		});

		expect(capturedStore).not.toBeUndefined();
		expect(capturedStore!.sessionCache).toBeUndefined();
	});

	// Task 1.2 — no store active outside a scope
	it("getRequestContext() outside any withRequestContext scope returns undefined", () => {
		const result = getRequestContext();
		expect(result).toBeUndefined();
	});

	// Task 1.3 — mutation in one withRequestContext call is NOT visible in the next
	it("stores from separate withRequestContext calls do not bleed", async () => {
		// First scope: mutate sessionCache to a sentinel value
		await withRequestContext(async () => {
			const ctx = getRequestContext()!;
			// Use null to represent "fetched but no session" — one of the valid stored states
			ctx.sessionCache = null;
		});

		// Second scope: the mutation from the first scope MUST NOT be visible
		let secondStore: ReturnType<typeof getRequestContext>;
		await withRequestContext(async () => {
			secondStore = getRequestContext();
		});

		expect(secondStore).not.toBeUndefined();
		expect(secondStore!.sessionCache).toBeUndefined();
	});

	// Task 1.4 — mutation made inside a scope persists within that same scope
	it("mutation persists within the same withRequestContext scope", async () => {
		const sentinelValue = null; // null = fetched, unauthenticated
		let secondRead: ReturnType<typeof getRequestContext>;

		await withRequestContext(async () => {
			const ctx = getRequestContext()!;
			ctx.sessionCache = sentinelValue;

			// Read again later in the same async chain
			secondRead = getRequestContext();
		});

		expect(secondRead).not.toBeUndefined();
		expect(secondRead!.sessionCache).toBe(sentinelValue);
	});

	// Task 1.1 — new store fields default correctly when no seed is given
	it("store includes traceId (auto-generated), tenantId null, userId null by default", async () => {
		let capturedStore: ReturnType<typeof getRequestContext>;

		await withRequestContext(async () => {
			capturedStore = getRequestContext();
		});

		expect(capturedStore).not.toBeUndefined();
		expect(typeof capturedStore!.traceId).toBe("string");
		expect(capturedStore!.traceId.length).toBeGreaterThan(0);
		expect(capturedStore!.tenantId).toBeNull();
		expect(capturedStore!.userId).toBeNull();
	});

	// Task 1.1 — seed.traceId is honoured exactly, present from the first statement
	it("withRequestContext(fn, { traceId }) seeds that exact traceId", async () => {
		let capturedTraceId: string | undefined;

		await withRequestContext(
			async () => {
				capturedTraceId = getRequestContext()!.traceId;
			},
			{ traceId: "abc-123" },
		);

		expect(capturedTraceId).toBe("abc-123");
	});

	// Task 1.1 — traceId/tenantId/userId do not bleed between sequential scopes
	it("traceId/tenantId/userId do not bleed between separate withRequestContext calls", async () => {
		await withRequestContext(
			async () => {
				const ctx = getRequestContext()!;
				ctx.tenantId = "tenant-1";
				ctx.userId = "user-1";
			},
			{ traceId: "first-trace" },
		);

		let secondStore: ReturnType<typeof getRequestContext>;
		await withRequestContext(async () => {
			secondStore = getRequestContext();
		});

		expect(secondStore).not.toBeUndefined();
		expect(secondStore!.tenantId).toBeNull();
		expect(secondStore!.userId).toBeNull();
		expect(secondStore!.traceId).not.toBe("first-trace");
	});

	// This test runs two scopes via Promise.all with a setTimeout yield inside each,
	// forcing genuine event-loop interleaving, to prove AsyncLocalStorage keeps
	// them isolated even when their async work overlaps in time.
	it("truly concurrent withRequestContext scopes do not bleed into each other", async () => {
		async function runScope(traceId: string, tenantId: string, userId: string) {
			return withRequestContext(
				async () => {
					const ctx = getRequestContext()!;
					ctx.tenantId = tenantId;
					ctx.userId = userId;

					// Yield to the event loop so the two concurrent scopes' work
					// genuinely interleaves rather than running back-to-back.
					await new Promise((resolve) => setTimeout(resolve, 0));

					return getRequestContext();
				},
				{ traceId },
			);
		}

		const [resultA, resultB] = await Promise.all([
			runScope("trace-a", "tenant-a", "user-a"),
			runScope("trace-b", "tenant-b", "user-b"),
		]);

		expect(resultA).not.toBeUndefined();
		expect(resultA!.traceId).toBe("trace-a");
		expect(resultA!.tenantId).toBe("tenant-a");
		expect(resultA!.userId).toBe("user-a");

		expect(resultB).not.toBeUndefined();
		expect(resultB!.traceId).toBe("trace-b");
		expect(resultB!.tenantId).toBe("tenant-b");
		expect(resultB!.userId).toBe("user-b");
	});

	// Task 1.1 — tenantId/userId mutations persist across nested async calls within the same scope
	it("mutating tenantId/userId inside a scope persists across nested calls within that same scope", async () => {
		async function nestedRead() {
			return getRequestContext();
		}

		let nestedResult: ReturnType<typeof getRequestContext>;
		await withRequestContext(async () => {
			const ctx = getRequestContext()!;
			ctx.tenantId = "tenant-42";
			ctx.userId = "user-42";

			nestedResult = await nestedRead();
		});

		expect(nestedResult).not.toBeUndefined();
		expect(nestedResult!.tenantId).toBe("tenant-42");
		expect(nestedResult!.userId).toBe("user-42");
	});
});
