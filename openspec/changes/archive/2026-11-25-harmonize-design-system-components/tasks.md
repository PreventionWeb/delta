# Tasks

## 1. Consolidate `app/design-system/ui/` into `app/design-system/components/`

- [x] 1.1 Rename `app/design-system/components/Button.tsx` and `Button.test.tsx` to `LegacyButton.tsx` and `LegacyButton.test.tsx` (`LegacyButton`, `LegacyButtonProps`) and update the 6 Hazardous Events callers to import `LegacyButton as Button` from `~/design-system/components/LegacyButton`; verify `yarn vitest run app/design-system/components/LegacyButton.test.tsx` passes
- [x] 1.2 Move all 11 files from `app/design-system/ui/` into `app/design-system/components/` and remove `app/design-system/ui/`; update imports in `app/pages/{AccessManagementPage,ApiKeysPage,OrganizationManagementPage}.tsx` and `tests/dom/{design-system-ui,api-keys-ui-primitives}.dom.test.tsx` from `~/design-system/ui` to `~/design-system/components`; verify `yarn vitest run tests/unit/design-system/ tests/dom/design-system-ui.dom.test.tsx tests/dom/api-keys-ui-primitives.dom.test.tsx` passes

## 2. Update OpenSpec & Agent Design Workflows

- [x] 2.1 Update `openspec/config.yaml`, `.github/copilot-instructions.md`, `.github/skills/design-system-check/SKILL.md`, and `.github/agents/spec-writer.agent.md` to specify `app/design-system/components/` (`~/design-system/components`) as the single canonical directory for reusable design-system primitives; verify `git grep "design-system/ui" -- ":!openspec/changes/archive/" ":!openspec/changes/harmonize-design-system-components/"` returns zero matches

## 3. Quality Gates & Verification

- [x] 3.1 Run `yarn vitest run app/design-system/ tests/unit/design-system/ tests/dom/design-system-ui.dom.test.tsx tests/dom/api-keys-ui-primitives.dom.test.tsx tests/dom/access-management.dom.test.tsx tests/dom/api-keys.dom.test.tsx tests/dom/organization-management.dom.test.tsx app/domains/hazardous-events/presentation/web/` and confirm all pass
- [x] 3.2 Run `yarn tsc` and confirm zero TypeScript errors
- [x] 3.3 Run `npx prettier --check` on all modified/moved files
- [x] 3.4 Run `yarn check:design-system --verify-spec --change harmonize-design-system-components` and `yarn check:design-system --change harmonize-design-system-components` (Gate 9a) and confirm PASS

## Workflow follow-up

- Sync `specs/design-system-components/spec.md` into `openspec/specs/design-system-components/spec.md` and archive `harmonize-design-system-components` to `openspec/changes/archive/2026-11-25-harmonize-design-system-components/`.
