# Hazardous Events legacy-parity components

This folder is the **Hazardous Events (HE) legacy-parity component set**. Its components
reproduce the legacy HE look on React Aria so the CA `he-preview` pages match legacy HE until
HE's UI is upgraded to the new design system.

- **Do not use these components for new screens.** New screens use the DELTA Design System
  components in [`app/design-system/ui/`](../ui/).
- **Do not add new variants here** to keep a legacy look on a new screen.
- This folder will be **removed** when HE's UI is upgraded to the new design system. Merging it
  into `app/design-system/ui/` is tracked by DEF-014
  (`_docs/refactoring-plan/deferred-items-register.md`).
