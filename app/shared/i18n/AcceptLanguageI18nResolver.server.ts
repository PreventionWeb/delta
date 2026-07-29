import { Injectable, type ExecutionContext } from "@nestjs/common";
import type { I18nResolver } from "nestjs-i18n";

import {
	resolveLocale,
	InvalidLocaleTagError,
} from "~/shared/i18n/resolveLocale";
import { VALID_LANGUAGES } from "~/utils/lang.backend";

// Structural, not `import { Request } from "express"` — @types/express isn't installed.
interface StructuredRequest {
	headers: { "accept-language"?: string };
}

// nestjs-i18n custom resolver (design.md Decision 19): reuses resolveLocale()'s chain instead
// of a second one. Swallows InvalidLocaleTagError — this runs on every request via
// I18nMiddleware with no try/catch upstream (verified in the installed package), so a
// malformed header must degrade, not 500 the whole request.
@Injectable()
export class AcceptLanguageI18nResolver implements I18nResolver {
	resolve(context: ExecutionContext): string | undefined {
		const req = context.switchToHttp().getRequest<StructuredRequest>();
		try {
			return resolveLocale({
				acceptLanguageHeader: req.headers["accept-language"] ?? null,
				userPreferredLocale: null,
				tenantDefaultLocale: null,
				supportedLocales: VALID_LANGUAGES,
			});
		} catch (err) {
			if (err instanceof InvalidLocaleTagError) return undefined;
			throw err;
		}
	}
}
