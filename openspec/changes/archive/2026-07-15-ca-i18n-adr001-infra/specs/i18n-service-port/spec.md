## ADDED Requirements

### Requirement: Generic `I18nServicePort` interface in the shared layer

`app/shared/i18n/I18nServicePort.ts` SHALL define an `I18nServicePort` interface with a `translate` method
that accepts `key: string`, `locale: string` (an explicit parameter — the interface SHALL NOT read locale
from HTTP/session/request context internally), and an optional `params` map for interpolation, returning
`Promise<string>`. This interface SHALL NOT be tied to any specific domain and SHALL NOT include a concrete
implementation.

#### Scenario: Interface shape is domain-agnostic

- **WHEN** any domain's application layer wants to depend on server-side translation
- **THEN** it MAY implement or extend `I18nServicePort` in its own
  `application/ports/II18nService.ts` (per ADR-001's per-domain port convention), without
  `I18nServicePort` importing anything from that domain

#### Scenario: `translate` receives locale explicitly

- **WHEN** a hypothetical caller invokes `translate("validation.required", "fr")`
- **THEN** the interface signature SHALL require `locale` as an explicit argument
- **AND** no method on the interface SHALL have an implicit or ambient way to determine locale

### Requirement: No domain-specific implementation ships with this change

This change SHALL NOT add a concrete class implementing `I18nServicePort`, and SHALL NOT add or modify any
file under `app/domains/*/application/ports/`.

#### Scenario: Notices domain is unaffected

- **WHEN** this change is merged
- **THEN** `app/domains/notices/application/ports/` SHALL contain no `I18nService`-related file added by
  this change
