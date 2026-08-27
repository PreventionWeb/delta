import type { InjectionToken } from "@nestjs/common";

import type { INoticeRepository } from "~/domains/notices/application/ports/INoticeRepository";

/**
 * Typed injection token for the Notices repository port.
 *
 * WHY a separate file (not embedded in INoticeRepository or DrizzleNoticeRepository):
 *   Injection tokens are an infrastructure concern — mixing one into the domain port
 *   (`INoticeRepository.ts`) would violate the rule that domain types must not import
 *   from `@nestjs/common`. Placing the token here lets both `NoticesModule` (which
 *   registers the provider) and future test overrides import it without pulling in
 *   the full repository implementation (Decision 1 in design.md).
 *
 * WHY Symbol-based (not a plain string):
 *   NestJS treats a Symbol token and a plain string "NOTICE_REPOSITORY" as different
 *   provider keys. The typed Symbol guarantees that TypeScript and the NestJS container
 *   agree on the injected type and prevents accidental injection via a string literal.
 *   This pattern mirrors `DRIZZLE_CLIENT` in `DrizzleProvider.server.ts`.
 */
export const NOTICE_REPOSITORY: InjectionToken<INoticeRepository> =
	Symbol("NOTICE_REPOSITORY");
