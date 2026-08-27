/**
 * CoreModule — root NestJS module for Clean Architecture migration
 *
 * WHY this module is used for both application context and HTTP server:
 *   Both the DI-only context (NestFactory.createApplicationContext) and the HTTP app
 *   (NestFactory.create) boot from the same CoreModule so they share the same provider
 *   graph.
 *
 * WHY a dedicated CoreModule as composition root:
 *   CoreModule is the root module passed to `NestFactory.createApplicationContext`. It
 *   imports and re-exports feature modules (e.g. NoticesModule) so that the entire
 *   application provider graph is reachable from a single `getAppContext()` call.
 *   Feature modules like NoticesModule declare their own providers directly rather than
 *   importing CoreModule, which avoids circular module dependencies.
 *
 * WHY APP_FILTER instead of app.useGlobalFilters:
 *   Registering DomainErrorFilter via the APP_FILTER DI token keeps the filter
 *   within the NestJS DI graph, making it injectable and extensible
 */
import { join } from "node:path";
import { Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { I18nModule } from "nestjs-i18n";

import { DrizzleProvider } from "./DrizzleProvider.server";
import { DomainErrorFilter } from "./DomainErrorFilter.server";
import { NoticesModule } from "~/domains/notices/infrastructure/NoticesModule.server";
import { AcceptLanguageI18nResolver } from "~/shared/i18n/AcceptLanguageI18nResolver.server";
import { DEFAULT_LANGUAGE } from "~/utils/lang.backend";

// ADR-001's deferred nestjs-i18n clause, activated now that NestJS exposes external HTTP
// endpoints (design.md Decision 19). @Global(), so I18nService is injectable from NoticesModule
// without a separate import there.
@Module({
	imports: [
		NoticesModule,
		I18nModule.forRoot({
			fallbackLanguage: DEFAULT_LANGUAGE,
			loaderOptions: { path: join(process.cwd(), "locales"), watch: false },
			resolvers: [AcceptLanguageI18nResolver],
		}),
	],
	providers: [
		DrizzleProvider,
		{ provide: APP_FILTER, useClass: DomainErrorFilter },
	],
	exports: [DrizzleProvider, NoticesModule],
})
export class CoreModule {}
