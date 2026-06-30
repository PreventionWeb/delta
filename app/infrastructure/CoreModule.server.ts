/**
 * CoreModule — root NestJS module for the Notices Pilot Clean Architecture migration
 *
 * WHY application context, not HTTP server:
 *   This module is bootstrapped exclusively via `NestFactory.createApplicationContext()`,
 *   The NestJS container is used purely for dependency injection.
 *
 * WHY a dedicated CoreModule as composition root:
 *   CoreModule is the root module passed to `NestFactory.createApplicationContext`. It
 *   imports and re-exports feature modules (e.g. NoticesModule) so that the entire
 *   application provider graph is reachable from a single `getAppContext()` call.
 *   Feature modules like NoticesModule declare their own providers directly rather than
 *   importing CoreModule, which avoids circular module dependencies.
 *
 * WHY CoreModule imports and re-exports NoticesModule (Decision 5 in design.md):
 *   `CoreModule` is the root module bootstrapped by `initServer()` via
 *   `NestFactory.createApplicationContext(CoreModule)`. Adding `NoticesModule` to
 *   its imports and exports makes the Notices use cases resolvable from
 *   `getAppContext().get(...)` without callers needing to import `NoticesModule` directly.
 */
import { Module } from "@nestjs/common";

import { DrizzleProvider } from "./DrizzleProvider.server";
import { NoticesModule } from "~/domains/notices/infrastructure/NoticesModule.server";

@Module({
	imports: [NoticesModule],
	providers: [DrizzleProvider],
	exports: [DrizzleProvider, NoticesModule],
})
export class CoreModule {}
