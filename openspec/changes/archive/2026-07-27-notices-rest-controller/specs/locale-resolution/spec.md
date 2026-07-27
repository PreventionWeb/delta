## ADDED Requirements

> **Repurposed (ADR-008, Decision 19)**: `resolveLocale()` no longer resolves Notices *content*
> (content is single-locale, see `notices-controller` spec) — it now feeds `nestjs-i18n`'s
> custom resolver for API error-message strings. Its own behavior below is unchanged.

### Requirement: resolveLocale resolves Accept-Language against the ADR-001 fallback chain
`resolveLocale()` (`app/shared/i18n/resolveLocale.ts`) SHALL return the first defined value in
this order: (1) a syntactically valid `acceptLanguageHeader` that is also in
`supportedLocales`; (2) `userPreferredLocale`, if non-null and in `supportedLocales`; (3)
`tenantDefaultLocale`, if non-null and in `supportedLocales`; (4) `"en"`.

#### Scenario: Supported Accept-Language tag wins
- **WHEN** `resolveLocale()` is called with `acceptLanguageHeader: "fr"` and `"fr"` is in
  `supportedLocales`
- **THEN** the function returns `"fr"`

#### Scenario: Absent Accept-Language falls through to userPreferredLocale
- **WHEN** `acceptLanguageHeader` is `null` and `userPreferredLocale` is a supported locale
- **THEN** the function returns `userPreferredLocale`

#### Scenario: Absent Accept-Language and no userPreferredLocale falls through to tenantDefaultLocale
- **WHEN** `acceptLanguageHeader` is `null`, `userPreferredLocale` is `null`, and
  `tenantDefaultLocale` is a supported locale
- **THEN** the function returns `tenantDefaultLocale`

#### Scenario: All chain steps absent falls back to "en"
- **WHEN** `acceptLanguageHeader`, `userPreferredLocale`, and `tenantDefaultLocale` are all
  `null`
- **THEN** the function returns `"en"`

### Requirement: A syntactically invalid Accept-Language tag throws, an unsupported valid tag does not
`resolveLocale()` SHALL throw an `InvalidLocaleTagError` (a framework-agnostic `Error` subtype
defined alongside `resolveLocale()`, not a NestJS `HttpException`) when `acceptLanguageHeader`
is syntactically invalid per BCP 47 (e.g. contains characters outside `[A-Za-z-]` or empty
subtags). `resolveLocale()` SHALL NOT throw when `acceptLanguageHeader` is syntactically valid
but not present in `supportedLocales` — this case silently falls through to the next step in
the chain per RFC 7231 / industry convention. The presentation layer's `DomainErrorFilter`
SHALL map `InvalidLocaleTagError` to HTTP 400.

#### Scenario: Syntactically invalid tag throws 400
- **WHEN** `resolveLocale()` is called with `acceptLanguageHeader: "xx_yy!!"`
- **THEN** it throws `InvalidLocaleTagError`
- **AND** the error's `supportedLocales` field lists every entry in `VALID_LANGUAGES`
- **AND** `DomainErrorFilter` maps it to HTTP 400 with `error.details.supportedLocales` set to
  the same list

#### Scenario: Valid but unsupported tag falls through silently
- **WHEN** `resolveLocale()` is called with `acceptLanguageHeader: "de"` (syntactically valid,
  not in `supportedLocales`), and `userPreferredLocale` is a supported locale
- **THEN** no exception is thrown
- **AND** the function returns `userPreferredLocale`

### Requirement: resolveLocale parses Accept-Language as a real HTTP list, with primary-subtag folding
`resolveLocale()` SHALL treat `acceptLanguageHeader` as a comma-separated list of language
ranges, each optionally carrying a `;q=` weight parameter (RFC 7231 §5.3.5) — not a single bare
tag. It SHALL strip each entry's `;q=...` suffix and surrounding whitespace before validating or
matching. A literal `*` entry SHALL be treated as a skippable wildcard, never as invalid. It
SHALL consider entries in header order (no `q`-weight sorting), returning the first entry that
either exactly matches `supportedLocales` or whose primary subtag (the portion before the first
`-`) matches `supportedLocales`. It SHALL throw `InvalidLocaleTagError` if any non-wildcard entry
in the list fails BCP-47 syntax validation, even when other entries in the same list are valid.

#### Scenario: A realistic multi-value, q-weighted header is accepted, not rejected
- **WHEN** `resolveLocale()` is called with `acceptLanguageHeader: "en-US,en;q=0.9,fr;q=0.8"`
  and `"en"` is in `supportedLocales`
- **THEN** no exception is thrown
- **AND** the function returns `"en"` (via primary-subtag folding of `"en-US"`, the first entry)

#### Scenario: A tag with a region subtag folds to its supported primary subtag
- **WHEN** `resolveLocale()` is called with `acceptLanguageHeader: "en-US"` and `"en"` (not
  `"en-US"`) is in `supportedLocales`
- **THEN** the function returns `"en"`

#### Scenario: A wildcard entry is skipped, not rejected
- **WHEN** `resolveLocale()` is called with `acceptLanguageHeader: "*"` and no other chain step
  resolves
- **THEN** no exception is thrown
- **AND** the function returns `"en"`

#### Scenario: One malformed entry among otherwise-valid entries still throws
- **WHEN** `resolveLocale()` is called with `acceptLanguageHeader: "en,xx_yy!!,fr"`
- **THEN** it throws `InvalidLocaleTagError`

### Requirement: resolveLocale never queries the database or reads request/session state directly
`resolveLocale()` SHALL be a pure function of its `LocaleResolutionInput` argument — it MUST
NOT accept a `Request` object, a DB client, or any session/context object. Callers are
responsible for resolving each chain input themselves before calling it.

#### Scenario: Same input always produces the same output
- **WHEN** `resolveLocale()` is called twice with an identical `LocaleResolutionInput`
- **THEN** both calls return the same result with no observable side effect (no DB call, no
  logging call)
