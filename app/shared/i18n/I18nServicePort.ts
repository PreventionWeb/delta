/**
 * Generic per-domain translation port shape, per ADR-001. Domains implement
 * their own `application/ports/II18nService.ts` extending this (see
 * openspec/changes/ca-i18n-adr001-infra/design.md Decision 5).
 */
export interface I18nServicePort {
	// locale is explicit, not read from request/session context, so callers
	// (e.g. background jobs) control which locale is used.
	translate(
		key: string,
		locale: string,
		params?: Record<string, string | number>,
	): Promise<string>;
}
