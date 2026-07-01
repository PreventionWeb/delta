// reflect-metadata MUST be the very first import so that the Reflect polyfill
// is in place before any NestJS decorator metadata is evaluated.
import "reflect-metadata";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// vi.hoisted() — declare variables that are shared with vi.mock() factories.
// vi.mock() calls are hoisted to the top of the file at runtime, so any
// variables they reference must also be hoisted via vi.hoisted().
// ---------------------------------------------------------------------------

const { mockApp, mockCreateApp, mockCreateContext } = vi.hoisted(() => {
	const mockApp = {
		setGlobalPrefix: vi.fn().mockReturnThis(),
		listen: vi.fn().mockResolvedValue(undefined),
	};
	const mockCreateApp = vi.fn().mockResolvedValue(mockApp);
	const mockCreateContext = vi
		.fn()
		.mockResolvedValue({ close: vi.fn(), get: vi.fn() });
	return { mockApp, mockCreateApp, mockCreateContext };
});

// ---------------------------------------------------------------------------
// Mock @nestjs/core so that NestFactory.create returns the mock app without
// binding a real TCP port. Declared before any import so vi.mock hoisting
// places it at module evaluation time.
// ---------------------------------------------------------------------------

vi.mock("@nestjs/core", async (importOriginal) => {
	const original = await importOriginal<typeof import("@nestjs/core")>();
	return {
		...original,
		NestFactory: {
			createApplicationContext: mockCreateContext,
			create: mockCreateApp,
		},
	};
});

vi.mock("~/db.server", () => ({
	dr: undefined,
	initDB: vi.fn(),
	endDB: vi.fn(),
}));

vi.mock("~/utils/session", () => ({ initCookieStorage: vi.fn() }));
vi.mock("~/backend.server/translations", () => ({
	createTranslationGetter: vi.fn(),
}));
vi.mock("~/backend.server/services/translationDBUpdates/update", () => ({
	importTranslationsIfNeeded: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Helper — returns a fresh initServer function with uninitialised module-level
// singletons after vi.resetModules() clears the module cache.
// ---------------------------------------------------------------------------

async function getFreshInitServer() {
	vi.resetModules();
	const { initServer } = await import("~/init.server");
	return initServer;
}

// ---------------------------------------------------------------------------
// Helper — returns both initServer and getAppContext from the same fresh module
// load so they share the same singleton state (important for W2).
// ---------------------------------------------------------------------------

async function getFreshInitServerAndContext() {
	vi.resetModules();
	const mod = await import("~/init.server");
	return { initServer: mod.initServer, getAppContext: mod.getAppContext };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("HttpServerBootstrap", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Restore mock implementations after clearAllMocks resets them.
		mockCreateContext.mockResolvedValue({ close: vi.fn(), get: vi.fn() });
		mockCreateApp.mockResolvedValue(mockApp);
		mockApp.listen.mockResolvedValue(undefined);
		mockApp.setGlobalPrefix.mockReturnThis();
	});

	afterEach(() => {
		// Ensure each test starts with a clean module cache so module-level
		// singletons (bootstrapPromise, httpBootstrapPromise) are reset.
		vi.resetModules();
	});

	it("NestFactory.create is called with CoreModule when initServer() resolves", async () => {
		const initServer = await getFreshInitServer();
		// Import CoreModule AFTER resetModules so we get the fresh instance
		const { CoreModule } = await import("~/infrastructure/CoreModule.server");
		await initServer();
		expect(mockCreateApp).toHaveBeenCalledWith(
			CoreModule,
			expect.objectContaining({ logger: false }),
		);
	});

	it("setGlobalPrefix('/api/v2') is called on the HTTP app", async () => {
		const initServer = await getFreshInitServer();
		await initServer();
		expect(mockApp.setGlobalPrefix).toHaveBeenCalledWith("/api/v2");
	});

	it("app.listen is called after setGlobalPrefix", async () => {
		const initServer = await getFreshInitServer();
		await initServer();
		// Verify ordering: setGlobalPrefix must precede listen.
		const prefixOrder = mockApp.setGlobalPrefix.mock.invocationCallOrder[0];
		const listenOrder = mockApp.listen.mock.invocationCallOrder[0];
		expect(mockApp.listen).toHaveBeenCalled();
		expect(prefixOrder).toBeLessThan(listenOrder);
	});

	it("app.listen is called with the default port 3001 when API_PORT is unset", async () => {
		const original = process.env.API_PORT;
		delete process.env.API_PORT;
		try {
			const initServer = await getFreshInitServer();
			await initServer();
			expect(mockApp.listen).toHaveBeenCalledWith(3001);
		} finally {
			if (original !== undefined) process.env.API_PORT = original;
		}
	});

	it("app.listen is called with the configured port when API_PORT is set", async () => {
		const original = process.env.API_PORT;
		process.env.API_PORT = "4001";
		try {
			const initServer = await getFreshInitServer();
			await initServer();
			expect(mockApp.listen).toHaveBeenCalledWith(4001);
		} finally {
			if (original !== undefined) {
				process.env.API_PORT = original;
			} else {
				delete process.env.API_PORT;
			}
		}
	});

	it("concurrent calls to initServer() invoke NestFactory.create exactly once", async () => {
		// Two parallel callers on a cold start must share the same bootstrap Promise
		// (httpBootstrapPromise guard) and must not create two HTTP app instances.
		const initServer = await getFreshInitServer();
		await Promise.all([initServer(), initServer()]);
		expect(mockCreateApp).toHaveBeenCalledTimes(1);
	});

	it("failed HTTP bootstrap allows retry on the next initServer() call", async () => {
		// GIVEN the first initServer() call causes the HTTP bootstrap to reject
		// (e.g. port already bound), the rejected httpBootstrapPromise must be
		// reset to undefined so the next call attempts bootstrap again rather than
		// re-awaiting the permanently rejected Promise.
		mockCreateApp
			.mockRejectedValueOnce(new Error("EADDRINUSE: port already bound"))
			.mockResolvedValue(mockApp);

		const initServer = await getFreshInitServer();

		// First call should throw.
		await expect(initServer()).rejects.toThrow("EADDRINUSE");

		// Second call should succeed — httpBootstrapPromise must have been reset.
		await expect(initServer()).resolves.not.toThrow();
		expect(mockCreateApp).toHaveBeenCalledTimes(2);
	});

	// -------------------------------------------------------------------------
	// W2 — getAppContext() is accessible after initServer() resolves
	// -------------------------------------------------------------------------

	it("getAppContext() does not throw after initServer() resolves", async () => {
		// Verifies that bootstrapHttpServer() does not accidentally overwrite the
		// appContext singleton set by bootstrapAppContext(). Both helpers use
		// separate module-level variables; if one clobbered the other getAppContext()
		// would throw with "has not been initialised".
		const { initServer, getAppContext } = await getFreshInitServerAndContext();
		await initServer();
		expect(() => getAppContext()).not.toThrow();
	});

	// -------------------------------------------------------------------------
	// W3 — console.info structured-log on server start
	// -------------------------------------------------------------------------

	it("console.info is called with a structured log object containing msg and port", async () => {
		// The structured log emitted by bootstrapHttpServer() must carry both a
		// human-readable msg and the numeric port so that log-aggregation pipelines
		// can filter on either field without parsing free-form strings.
		const original = process.env.API_PORT;
		process.env.API_PORT = "3001";

		const infoSpy = vi.spyOn(console, "info");
		try {
			const initServer = await getFreshInitServer();
			await initServer();
			expect(infoSpy).toHaveBeenCalledWith(
				expect.objectContaining({
					msg: expect.any(String),
					port: 3001,
				}),
			);
		} finally {
			infoSpy.mockRestore();
			if (original !== undefined) {
				process.env.API_PORT = original;
			} else {
				delete process.env.API_PORT;
			}
		}
	});
});
