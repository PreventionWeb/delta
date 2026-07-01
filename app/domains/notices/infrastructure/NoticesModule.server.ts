/**
 * NoticesModule — NestJS module that wires the Notices domain providers.
 *
 * WHY `.server.ts` suffix (Decision 1b in design.md):
 *   This file imports `DrizzleNoticeRepository.server.ts`, which contains Node.js-only
 *   dependencies (`pg`, Drizzle ORM). React Router v7's bundler excludes any file
 *   ending in `.server.ts` from the client bundle. Without this suffix an accidental
 *   import from a route component would either cause a build-time error or silently
 *   bundle server-only code into the browser.
 *
 * WHY DrizzleProvider is declared here rather than importing CoreModule (Decision 2):
 *   CoreModule imports NoticesModule (Decision 5). If NoticesModule also imported
 *   CoreModule, the result would be a circular NestJS module dependency
 *   (CoreModule → NoticesModule → CoreModule) that NestJS rejects at compile time.
 *   DrizzleProvider's factory returns the same global `dr` singleton regardless of
 *   which module declares it — no second database connection is created.
 *   Composition roots import feature modules; feature modules must not import the
 *   composition root.
 *
 * WHY use cases use useFactory rather than @Injectable() (Decision 4):
 *   The use cases (`CreateNoticeUseCase`, `ListNoticesUseCase`, `GetNoticeByIdUseCase`)
 *   are plain TypeScript classes with no NestJS decorators — they must stay
 *   framework-agnostic. Each is wired explicitly via `useFactory`.
 *
 * WHY NOTICE_REPOSITORY is NOT exported from this module:
 *   Callers must depend on the use case interface, not on the repository adapter
 *   directly. Exporting the repository token would expose the infrastructure layer
 *   and encourage bypassing the use cases.
 */
import { Module } from "@nestjs/common";

import { DrizzleProvider } from "~/infrastructure/DrizzleProvider.server";
import { NoOpLogger } from "~/shared/logging/NoOpLogger";
import { CreateNoticeUseCase } from "~/domains/notices/application/use-cases/CreateNotice";
import { ListNoticesUseCase } from "~/domains/notices/application/use-cases/ListNotices";
import { GetNoticeByIdUseCase } from "~/domains/notices/application/use-cases/GetNoticeById";
import { DrizzleNoticeRepository } from "./DrizzleNoticeRepository.server";
import { NOTICE_REPOSITORY } from "./NoticeRepositoryToken";
import type { INoticeRepository } from "~/domains/notices/application/ports/INoticeRepository";

@Module({
	providers: [
		// DrizzleProvider registers DRIZZLE_CLIENT within this module's DI scope.
		// The factory returns the same global dr singleton — no new DB connection.
		DrizzleProvider,
		// Repository adapter registered under the typed NOTICE_REPOSITORY port token.
		// Consumers inject via the token, not via DrizzleNoticeRepository directly.
		{
			provide: NOTICE_REPOSITORY,
			useClass: DrizzleNoticeRepository,
		},
		// WHY useFactory for each use case (Decision 3 in design.md):
		//   No NestJS-managed ILogger provider exists yet. Rather than making the logger
		//   parameter optional (which would weaken the constructor contract), each use case
		//   factory constructs `new NoOpLogger()` inline. When a production Pino adapter
		//   is introduced the factories can be replaced with a shared LoggerModule provider.
		{
			provide: CreateNoticeUseCase,
			useFactory: (repo: INoticeRepository) =>
				new CreateNoticeUseCase(new NoOpLogger(), repo),
			inject: [NOTICE_REPOSITORY],
		},
		{
			provide: ListNoticesUseCase,
			useFactory: (repo: INoticeRepository) =>
				new ListNoticesUseCase(new NoOpLogger(), repo),
			inject: [NOTICE_REPOSITORY],
		},
		{
			provide: GetNoticeByIdUseCase,
			useFactory: (repo: INoticeRepository) =>
				new GetNoticeByIdUseCase(new NoOpLogger(), repo),
			inject: [NOTICE_REPOSITORY],
		},
	],
	// Export the use cases so they are resolvable from consuming modules (e.g. CoreModule).
	// NOTICE_REPOSITORY is intentionally NOT exported — callers must use the use cases,
	// not bypass them by depending on the repository adapter directly.
	exports: [CreateNoticeUseCase, ListNoticesUseCase, GetNoticeByIdUseCase],
})
export class NoticesModule {}
