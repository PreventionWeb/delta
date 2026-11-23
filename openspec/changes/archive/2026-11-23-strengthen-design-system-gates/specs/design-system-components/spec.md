## ADDED Requirements

### Requirement: Components enforce Lucide-only icons, semantic tokens, and copy rules

Every `.ts`/`.tsx` file under `app/design-system/components/` SHALL use `lucide-react` exclusively for icons (forbidding `react-icons`, `primeicons`, `@heroicons`, `@fortawesome`), forbid hardcoded hex color literals and `tokens.css` primitive `--color-*` variables, and forbid em-dashes (`—`) in visible UI copy outside comments.

#### Scenario: No non-Lucide icon library imports

- **WHEN** any `.ts` or `.tsx` file under `app/design-system/components/` is inspected
- **THEN** it MUST NOT import from `react-icons`, `primeicons`, `@heroicons`, or `@fortawesome`

#### Scenario: No hardcoded hex colors or tokens.css primitives

- **WHEN** any `.ts` or `.tsx` file under `app/design-system/components/` is inspected
- **THEN** it MUST NOT contain hex color literals (`#[0-9a-fA-F]{3,8}`)
- **AND** it MUST NOT reference `--color-(neutral|warm|accent|green|amber|red)-` CSS custom properties

#### Scenario: No em-dashes in visible JSX UI copy

- **WHEN** any `.ts` or `.tsx` file under `app/design-system/components/` is inspected outside comments
- **THEN** string literals and JSX text MUST NOT contain the em-dash character (`—`)
