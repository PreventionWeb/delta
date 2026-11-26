# Design-system components

Since pull request 848 this folder is the single DELTA design-system component folder (the former
`app/design-system/ui/` was merged into it).

- **DELTA Design System components** are the ones exported from [`index.ts`](./index.ts)
  (`Button`, `ModalDialog`, `ToastRegion`, `SelectField`, `TextField`, …). New screens use these.
- **Hazardous Events (HE) legacy-parity components** reproduce the legacy HE look so the CA
  `he-preview` pages match legacy HE (`ui-classification: legacy-exempt`): `LegacyButton`,
  `Dialog`, `Toast`, `Card`, `Section`, `Table*`, `Link`, `Select`, `Combobox`, `Checkbox`,
  `DateRangePicker`, `MultiSelectCombobox`. Do not use them for new screens and do not add
  legacy variants to the design-system components.
- HE moves to the DELTA Design System components in the "HE UI upgrade" iteration, tracked by
  DEF-068 (`_docs/refactoring-plan/deferred-items-register.md`); the legacy-parity components
  are removed then.
