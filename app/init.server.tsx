// reflect-metadata must be imported before any NestJS module is evaluated so that
// the Reflect polyfill is available in environments where entry.server.tsx has not
// been loaded first (e.g. integration test runners).
import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import {
	type INestApplication,
	type INestApplicationContext,
} from "@nestjs/common";

import { initDB, endDB } from "./db.server";
import { initCookieStorage } from "./utils/session";
import { createTranslationGetter } from "~/backend.server/translations";
import { importTranslationsIfNeeded } from "./backend.server/services/translationDBUpdates/update";
import type {} from "~/types/createTranslationGetter.d";
import { CoreModule } from "~/infrastructure/CoreModule.server";

// The NestJS application context created by bootstrapAppContext().
let appContext: INestApplicationContext | undefined;

// The NestJS HTTP application created by bootstrapHttpServer().
// Stored so endServer() can close the listener on shutdown.
let httpApp: INestApplication | undefined;

// In-flight bootstrap Promise stored before it is awaited so that concurrent calls to
// initServer() (e.g. two parallel requests on a cold start) share the same Promise
let bootstrapPromise: Promise<INestApplicationContext> | undefined;

// In-flight HTTP bootstrap Promise — mirrors the bootstrapPromise pattern so that
// concurrent callers share the same HTTP app instance rather than binding two servers on the same port.
let httpBootstrapPromise: Promise<INestApplication> | undefined;

/**
 * Bootstrap the NestJS DI-only application context (no HTTP listener).
 * Assigns the Promise before awaiting it so that concurrent callers share the same bootstrap
 */
async function bootstrapAppContext(): Promise<void> {
	if (!bootstrapPromise) {
		console.log("Initing DB...");
		// initDB() must run before NestFactory so that the `dr` singleton is set
		// before DrizzleProvider's useFactory reads it at provider-resolution time.
		initDB();
		bootstrapPromise = NestFactory.createApplicationContext(CoreModule, {
			// Suppress NestJS startup banner — this is a DI-only context, not an HTTP app.
			logger: false,
		});
	}
	try {
		appContext = await bootstrapPromise;
	} catch (err) {
		// Reset so a subsequent call can retry rather than re-awaiting a permanently
		// rejected Promise.
		bootstrapPromise = undefined;
		throw err;
	}
}

/**
 * Bootstrap the NestJS HTTP server on API_PORT (default 3001).
 *
 * Assigns the Promise before awaiting it — same concurrent-caller rationale as
 * bootstrapAppContext: two simultaneous cold-start requests must not bind two
 * separate HTTP servers on the same port.
 */
async function bootstrapHttpServer(): Promise<void> {
	if (!httpBootstrapPromise) {
		const parsed = parseInt(process.env.API_PORT ?? "", 10);
		// Guard against NaN (invalid env string) and out-of-range values so that
		// app.listen() never receives an invalid port number.
		const apiPort =
			Number.isFinite(parsed) && parsed > 0 && parsed <= 65535 ? parsed : 3001;
		httpBootstrapPromise = (async () => {
			const app = await NestFactory.create(CoreModule, { logger: false });
			app.setGlobalPrefix("/api/v2");
			await app.listen(apiPort);
			httpApp = app;
			console.info({ msg: "NestJS HTTP server started", port: apiPort });
			return app;
		})();
	}
	try {
		await httpBootstrapPromise;
	} catch (err) {
		// Reset so a subsequent call can retry (e.g. port already bound on first attempt).
		httpBootstrapPromise = undefined;
		throw err;
	}
}

/**
 * Bootstrap the server: initialise the database, create the NestJS application context
 * (DI container only — for use by Remix loaders), and then start the NestJS HTTP server
 * on API_PORT for REST controller requests.
 *
 * Two bootstrap paths, each guarded by a module-level Promise:
 *   1. appContext (INestApplicationContext) — DI container only, no HTTP listener.
 *      Used by getAppContext() in Remix loaders and actions.
 *   2. httpApp (INestApplication) — full HTTP server on API_PORT (default 3001).
 *      Used by REST controllers decorated with @Controller.
 */
export async function initServer() {
	console.log("init.serve.tsx:init");

	await bootstrapAppContext();
	await bootstrapHttpServer();

	console.log("Initing cookie storage...");
	initCookieStorage();

	console.log("Setting up translator...");
	globalThis.createTranslationGetter = createTranslationGetter;

	importTranslationsIfNeeded();
}

/**
 * Returns the bootstrapped NestJS application context.
 *
 * Call sites must be inside async loaders or actions where initServer() has already
 * resolved before the first request is handled.
 */
export function getAppContext(): INestApplicationContext {
	if (!appContext) {
		throw new Error(
			"NestJS application context has not been initialised. Call initServer() first.",
		);
	}
	return appContext;
}

/**
 * Tear down the server. MUST be awaited — closes the HTTP listener before
 * tearing down the DB pool.
 */
export async function endServer() {
	console.log("init.serve.tsx:end");
	// Wait for any in-flight bootstrap to settle before reading httpApp 
	if (httpBootstrapPromise) {
		try {
			await httpBootstrapPromise;
		} catch {
			// Bootstrap failed; nothing to close.
		}
	}
	// Close the HTTP listener before ending the DB so that in-flight requests
	if (httpApp) {
		await httpApp.close();
	}
	console.log("Ending DB...");
	await endDB();
}
