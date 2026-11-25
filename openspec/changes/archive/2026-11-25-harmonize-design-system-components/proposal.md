# Proposal

## Why

Reusable React Aria primitives are currently split across two sibling directories: `app/design-system/components/` (transitional Phase 6a/6h primitives) and `app/design-system/ui/` (DELTA Design System `v0.7.2` primitives). Maintaining two directories creates import ambiguity, leaves `app/design-system/ui/` outside `tests/unit/design-system/components/imports.test.ts`, and causes future specs to perpetuate the split. Harmonizing both directories into a single canonical `app/design-system/components/` directory simplifies imports, unifies static guard enforcement, and aligns OpenSpec and agent workflows.

**UI classification**: `non-visual`

**Security-sensitive change**: No — pure structural file move, barrel/import path harmonization, and workflow documentation update with zero runtime auth, query, or behavior changes.

**Database migration required**: No.

## What Changes

- Move all 11 DELTA Design System `v0.7.2` files from `app/design-system/ui/` (`Button.tsx`, `Callout.tsx`, `ModalDialog.tsx`, `Pagination.tsx`, `SelectField.tsx`, `SortableTable.tsx`, `StatusIndicator.tsx`, `TextField.tsx`, `ToastRegion.tsx`, `Tooltip.tsx`, `index.ts`) into `app/design-system/components/` and delete `app/design-system/ui/`.
- Resolve the sole filename collision (`Button.tsx`) by renaming the transitional Phase 6a/6h button to `app/design-system/components/LegacyButton.tsx` (and `LegacyButton.test.tsx`) and updating its 6 Hazardous Events callers to import `LegacyButton`, keeping `Button.tsx` as the canonical `v0.7.2` button.
- Update all application and test imports from `~/design-system/ui` to `~/design-system/components`.
- Update `openspec/specs/design-system-components/spec.md`, `openspec/config.yaml`, `.github/copilot-instructions.md`, `.github/skills/design-system-check/SKILL.md`, and `.github/agents/spec-writer.agent.md` to designate `app/design-system/components/` as the sole canonical directory for reusable design-system primitives.

## Capabilities

### New Capabilities
<!-- None -->

### Modified Capabilities
- `design-system-components`: Consolidate all `v0.7.2` reusable primitive paths from `app/design-system/ui/` into `app/design-system/components/`.

## Impact

### Files expected to change

| File | Reason |
|---|---|
| `app/design-system/components/LegacyButton.tsx` | Renamed from `Button.tsx` (Phase 6a/6h transitional button) |
| `app/design-system/components/LegacyButton.test.tsx` | Renamed from `Button.test.tsx` and updated to test `LegacyButton` |
| `app/design-system/components/{Button,Callout,ModalDialog,Pagination,SelectField,SortableTable,StatusIndicator,TextField,ToastRegion,Tooltip,index}.ts(x)` | Moved from `app/design-system/ui/` (deleting `app/design-system/ui/`) |
| `app/pages/{AccessManagementPage,ApiKeysPage,OrganizationManagementPage}.tsx` | Update import from `~/design-system/ui` to `~/design-system/components` |
| `app/domains/hazardous-events/presentation/web/HazardousEvent{DiscardModal,DivisionListDialog,SaveSubmitModal,SpatialFootprintEntryDialog,SpatialFootprintMap,SpatialFootprintPicker}.tsx` | Import `LegacyButton as Button` from `~/design-system/components/LegacyButton` |
| `tests/dom/{design-system-ui,api-keys-ui-primitives}.dom.test.tsx` | Update import from `~/design-system/ui` to `~/design-system/components` |
| `openspec/specs/design-system-components/spec.md` | Update primitive paths from `app/design-system/ui/` to `app/design-system/components/` |
| `openspec/config.yaml` | Document `app/design-system/components/` as the single canonical primitive directory |
| `.github/copilot-instructions.md` | Document `app/design-system/components/` (`~/design-system/components`) as canonical |
| `.github/skills/design-system-check/SKILL.md` | Document `app/design-system/components/` as sole primitive directory |
| `.github/agents/spec-writer.agent.md` | Document `app/design-system/components/` as sole primitive directory |

### Test approach

- **Unit + DOM (`yarn test:run2`)**: Run `app/design-system/`, `tests/unit/design-system/` (including `imports.test.ts` now covering all moved `v0.7.2` primitives), `tests/dom/`, and `app/domains/hazardous-events/presentation/web/` tests.
- **Static checks**: `yarn tsc`, `yarn check:design-system --verify-spec --change harmonize-design-system-components`, `yarn check:design-system --change harmonize-design-system-components`, `npx prettier --check`, and `git grep "design-system/ui" -- ":!openspec/changes/archive/"`.
