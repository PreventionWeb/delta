## MODIFIED Requirements

### Requirement: resolveLocale parses Accept-Language as a real HTTP list, with primary-subtag folding

`resolveLocale()` SHALL treat `acceptLanguageHeader` as a comma-separated list of language
ranges, each optionally carrying a `;q=` weight parameter (RFC 7231 §5.3.5) — not a single bare
tag. It SHALL strip each entry's `;q=...` suffix and surrounding whitespace before validating or
matching. A literal `*` entry SHALL be treated as a skippable wildcard, never as invalid. It
SHALL consider entries in header order (no `q`-weight sorting), returning the first entry that
matches `supportedLocales`, trying the entry's full tag first and then **progressively
truncating the rightmost hyphen-delimited subtag** until either a match is found in
`supportedLocales` or only the bare primary subtag remains and still does not match (at which
point the entry is abandoned and the next entry, if any, is tried). This generalizes the
previous single-step fold-to-primary-subtag behavior: for a `supportedLocales` list containing
only bare primary-subtag codes (as `VALID_LANGUAGES` does today), the outcome is unchanged —
the only subtag any entry can ever match is the primary one. The generalization only becomes
observable once `supportedLocales` contains a tag with a script or region subtag (e.g.
`"sr-Latn"`). `resolveLocale()` SHALL NOT match a shorter, less-specific requested tag (e.g.
bare `"sr"`) to a more specific supported entry (e.g. `"sr-Latn"`) — truncation only ever
removes subtags from the requested entry, it never adds subtags to broaden a match. It SHALL
throw `InvalidLocaleTagError` if any non-wildcard entry in the list fails BCP-47 syntax
validation, even when other entries in the same list are valid.

#### Scenario: A realistic multi-value, q-weighted header is accepted, not rejected

- **WHEN** `resolveLocale()` is called with `acceptLanguageHeader: "en-US,en;q=0.9,fr;q=0.8"`
  and `"en"` is in `supportedLocales`
- **THEN** no exception is thrown
- **AND** the function returns `"en"` (via truncation of `"en-US"`, the first entry, down to
  its primary subtag)

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

#### Scenario: A fully-specified tag matches an equally-specific supported variant before truncating further

- **WHEN** `resolveLocale()` is called with `acceptLanguageHeader: "sr-Latn-RS"` and
  `supportedLocales` contains both `"sr"` and `"sr-Latn"`
- **THEN** the function returns `"sr-Latn"` — the entry is truncated from `"sr-Latn-RS"` to
  `"sr-Latn"`, which matches, before ever being truncated further to `"sr"`

#### Scenario: A less-specific requested tag does not match a more-specific supported variant

- **WHEN** `resolveLocale()` is called with `acceptLanguageHeader: "sr"` and `supportedLocales`
  contains `"sr-Latn"` but not bare `"sr"`
- **THEN** the entry does not match (truncation only removes subtags from the requested tag; it
  never adds the `"Latn"` subtag to broaden `"sr"` into a match)
- **AND** resolution falls through to the next chain step
