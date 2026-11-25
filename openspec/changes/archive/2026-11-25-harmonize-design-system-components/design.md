# Design

## UI Design Governance Metadata

```yaml
ui-classification: non-visual

design-system:
  repository: https://github.com/unisdr/delta-design
  version-or-tag: v0.7.2
  commit: a86cc3a62378871e93cbfa14aa69740201b8c556

feature-prototype:
  repository: https://github.com/unisdr/delta-feature-prototypes
  status: not-required
  exception-reason: Non-visual structural refactor consolidating app/design-system/ui/ into app/design-system/components/ with zero rendered markup, styling, or interaction changes.
```

## Context

See `proposal.md` for motivation and scope. `app/design-system/ui/` holds 11 files (`Button`, `Callout`, `ModalDialog`, `Pagination`, `SelectField`, `SortableTable`, `StatusIndicator`, `TextField`, `ToastRegion`, `Tooltip`, and `index.ts`), while `app/design-system/components/` holds transitional Phase 6a/6h primitives. Only `Button.tsx` collides by filename.

## Goals / Non-Goals

**Goals:**
- Consolidate all reusable design-system primitives into `app/design-system/components/` and remove `app/design-system/ui/`.
- Keep `app/design-system/components/Button.tsx` as the canonical `v0.7.2` button (exported from `index.ts`) and rename the transitional Phase 6a/6h button to `LegacyButton.tsx`.
- Update all non-archived code, test, OpenSpec, and agent workflow references to `app/design-system/components/`.

**Non-Goals:**
- Visually redesigning or migrating Hazardous Events screens from `LegacyButton` to `v0.7.2` `Button`.
- Mutating immutable historical files under `openspec/changes/archive/`.
- Database or backend changes.

## Decisions

### 1. Resolving the `Button.tsx` Filename Collision

Rename `app/design-system/components/Button.tsx` (and `Button.test.tsx`) to `LegacyButton.tsx` (`LegacyButton`, `LegacyButtonProps`) and update its 6 Hazardous Events callers to `import { LegacyButton as Button } from "~/design-system/components/LegacyButton"`. Move `app/design-system/ui/Button.tsx` to `app/design-system/components/Button.tsx` and export it from `app/design-system/components/index.ts`.

- **Rationale**: Keeps `Button` unambiguously on `v0.7.2` semantic tokens for all new and migrated screens while preserving 100% visual parity on unmigrated Hazardous Events screens.
- **Alternatives considered**: Renaming the `v0.7.2` button to `ActionButton` (rejected — breaks naming parity with `unisdr/delta-design`); merging both buttons via a `legacy` prop (rejected — mixes legacy `dts-*` classes into the canonical `v0.7.2` component).

### 2. TypeScript Types & Interfaces Added / Changed

- `app/design-system/components/LegacyButton.tsx`: renamed `ButtonProps` → `LegacyButtonProps`, `Button` → `LegacyButton`.
- `app/design-system/components/index.ts`: canonical barrel re-exporting all `v0.7.2` primitives and prop types moved from `app/design-system/ui/index.ts`.

### 3. Database Schema, Form-CSV-API & Test Infrastructure

- **Drizzle schema / Form-CSV-API `fieldsDef` impact**: None.
- **Test infrastructure**: Vitest (`yarn test:run2`, node + dom projects) — no real DB or Playwright E2E needed since this is a non-visual structural move with zero DOM/CSS changes.

## Risks / Trade-offs

- **`tests/unit/design-system/components/imports.test.ts` now scans all moved `v0.7.2` files** -> Verified that all 11 moved files pass every static invariant (no PrimeReact, no `app/domains/*`, Lucide-only, no hex/`--color-*`, no em dashes).
