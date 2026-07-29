// reflect-metadata must be imported before any NestJS module is evaluated so that
// the Reflect polyfill is available in environments where entry.server.tsx has not
// been loaded first (e.g. integration test runners).
import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import {
	type INestApplication,
	type INestApplicationContext,
} from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { cleanupOpenApiDoc } from "nestjs-zod";

import { initDB, endDB } from "./db.server";
import { initCookieStorage } from "./utils/session";
import { createTranslationGetter } from "~/backend.server/translations";
import { importTranslationsIfNeeded } from "./backend.server/services/translationDBUpdates/update";
import type {} from "~/types/createTranslationGetter.d";
import { CoreModule } from "~/infrastructure/CoreModule.server";
import {
	API_GLOBAL_PREFIX,
	OPENAPI_DOCS_SUBPATH,
} from "~/shared/openApiDocsPath";

// Interactive Swagger UI at /api/v2/docs, raw document at the default /api/v2/docs-json
// sibling path — useGlobalPrefix must be passed explicitly (SwaggerModule doesn't apply it
// by default).
export function mountOpenApiDocs(app: INestApplication): void {
	const document = SwaggerModule.createDocument(
		app,
		new DocumentBuilder()
			.setTitle("DELTA Notices API")
			.setVersion("2.0")
			// Pairs with @ApiCookieAuth() on NoticesController (design.md Decision 14).
			.addCookieAuth("__session", {
				type: "apiKey",
				in: "cookie",
				name: "__session",
			})
			.build(),
	);
	SwaggerModule.setup(OPENAPI_DOCS_SUBPATH, app, cleanupOpenApiDoc(document), {
		useGlobalPrefix: true,
	});
}

// The NestJS application context created by bootstrapAppContext().
let appContext: INestApplicationContext | undefined;

// The NestJS HTTP application created by bootstrapHttpServer().
// Stored so endServer() can close the listener on shutdown.
let httpApp: INestApplication | undefined;

// Survives module reload; __deltaHttpBootstrap lets overlapping reloads share one bind attempt.
const globalForHttpApp = globalThis as unknown as {
	__deltaHttpApp?: INestApplication;
	__deltaHttpBootstrap?: Promise<INestApplication>;
};

// Stored before awaiting so concurrent initServer() calls share one bootstrap, not two.
let bootstrapPromise: Promise<INestApplicationContext> | undefined;

// Same concurrent-caller rationale as bootstrapPromise, for the HTTP listener.
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

// Bootstraps the NestJS HTTP server on API_PORT (default 3001).
async function bootstrapHttpServer(): Promise<void> {
	if (!httpBootstrapPromise) {
		// An overlapping reload's bind is already in flight — await it instead of racing it.
		if (globalForHttpApp.__deltaHttpBootstrap) {
			httpBootstrapPromise = globalForHttpApp.__deltaHttpBootstrap;
		} else {
			const parsed = parseInt(process.env.API_PORT ?? "", 10);
			// Guard against NaN (invalid env string) and out-of-range values so that
			// app.listen() never receives an invalid port number.
			const apiPort =
				Number.isFinite(parsed) && parsed > 0 && parsed <= 65535 ? parsed : 3001;
			httpBootstrapPromise = (async () => {
				if (globalForHttpApp.__deltaHttpApp) {
					await globalForHttpApp.__deltaHttpApp.close().catch((err) => {
						console.error({ msg: "Failed to close orphaned HTTP listener", err });
					});
				}
				const app = await NestFactory.create(CoreModule, { logger: false });
				app.setGlobalPrefix(API_GLOBAL_PREFIX);
				mountOpenApiDocs(app);
				await app.listen(apiPort);
				httpApp = app;
				globalForHttpApp.__deltaHttpApp = app;
				console.info({ msg: "NestJS HTTP server started", port: apiPort });
				return app;
			})();
			globalForHttpApp.__deltaHttpBootstrap = httpBootstrapPromise;
		}
	}
	try {
		await httpBootstrapPromise;
	} catch (err) {
		// Reset so a subsequent call can retry (e.g. port already bound on first attempt).
		httpBootstrapPromise = undefined;
		globalForHttpApp.__deltaHttpBootstrap = undefined;
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
// Memoized so any caller (entry.server.tsx's fire-and-forget kickoff, or a per-request
// caller like requestContextMiddleware) awaits the same promise instead of re-bootstrapping.
let readyPromise: Promise<void> | undefined;

export function initServer(): Promise<void> {
	if (!readyPromise) {
		readyPromise = (async () => {
			console.log("init.serve.tsx:init");

			await bootstrapAppContext();
			if (process.env.API_HTTP_SERVER_ENABLED !== "false") {
				await bootstrapHttpServer();
			}

			console.log("Initing cookie storage...");
			initCookieStorage();

			console.log("Setting up translator...");
			globalThis.createTranslationGetter = createTranslationGetter;

			importTranslationsIfNeeded();
		})();
	}
	return readyPromise.catch((err) => {
		// Reset so a subsequent call can retry rather than re-awaiting a permanently
		// rejected Promise.
		readyPromise = undefined;
		throw err;
	});
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
		globalForHttpApp.__deltaHttpApp = undefined;
		globalForHttpApp.__deltaHttpBootstrap = undefined;
	}
	console.log("Ending DB...");
	await endDB();
}
