# Tasks: Harmonize Hazardous Events and Disaster Records Views

## Phase 1: Hazardous Events View Harmonization (TDD)

- [x] **Task 1.1: Write failing component tests for `HazardousEventReviewStep`**
  - Create `tests/unit/components/HazardousEventReviewStep.test.tsx`
  - Test rendering of the 6 cards with exact titles (`Basic information`, `Hazard details`, `Location`, `Attachments`, `Linked events`, `Audit log history`)
  - Test formatting of dates, status badge, magnitude, and hip taxonomy
  - Test omission of the "Add hazardous event caused by this event" button in `Linked events`
  - Verify test fails: `yarn vitest run tests/unit/components/HazardousEventReviewStep.test.tsx`

- [x] **Task 1.2: Implement `HazardousEventReviewStep` component**
  - Create `app/frontend/events/HazardousEventReviewStep.tsx`
  - Implement cards using PrimeReact `Card` with `rounded-2xl border border-slate-200 shadow-none`
  - Render two-column grid items with uppercase tracked labels
  - Render Leaflet `ReviewLocationMap` for spatial footprint and divisions
  - Render parent and child cards in `Linked events`
  - Verify test passes: `yarn vitest run tests/unit/components/HazardousEventReviewStep.test.tsx`

- [x] **Task 1.3: Wire `HazardousEventReviewStep` into `HazardousEventView` and route `$id.tsx`**
  - Update `HazardousEventView` in `app/frontend/events/hazardeventform.tsx` to render `HazardousEventReviewStep`
  - Update `app/routes/$lang+/hazardous-event+/$id.tsx` with `hideTopSummary={true}` and outlined back button in `extraInfo`
  - Run component tests: `yarn vitest run tests/unit/components/HazardousEventReviewStep.test.tsx`

## Phase 2: Disaster Records View Harmonization (TDD)

- [x] **Task 2.1: Write failing component tests for `DisasterRecordReviewStep`**
  - Create `tests/unit/components/DisasterRecordReviewStep.test.tsx`
  - Test rendering of all cards with exact titles (`Basic information`, `Hazard details`, `Location`, `Human effects`, `Sector effects`, `Non-economic losses`, `Attachments`, `Audit log history`)
  - Test rendering of 6 KPI metric chips (`Deaths`, `Injured`, `Missing`, `Directly Affected`, `Indirectly Affected`, `Displaced`)
  - Test rendering of totals breakdown table and disaggregation tables
  - Verify test fails: `yarn vitest run tests/unit/components/DisasterRecordReviewStep.test.tsx`

- [x] **Task 2.2: Implement `DisasterRecordReviewStep` component**
  - Create `app/frontend/disaster-record/DisasterRecordReviewStep.tsx`
  - Implement KPI chips layout at the top of the `Human effects` card
  - Integrate totals breakdown table and disaggregation breakdown inside `Human effects`
  - Integrate `SectorEffectsTable` inside `Sector effects` card
  - Integrate non-economic losses table inside `Non-economic losses` card
  - Verify test passes: `yarn vitest run tests/unit/components/DisasterRecordReviewStep.test.tsx`

- [x] **Task 2.3: Wire `DisasterRecordReviewStep` into `DisasterRecordsView` and route `$id.tsx`**
  - Update `DisasterRecordsView` in `app/frontend/disaster-record/form.tsx`
  - Update `app/routes/$lang+/disaster-record+/$id.tsx` to set `hideTopSummary={true}`, render outlined back button, and pass effects/losses to the harmonized review step
  - Run component tests: `yarn vitest run tests/unit/components/DisasterRecordReviewStep.test.tsx`

## Phase 3: Quality Gates

- [x] **Task 3.1: Quality gate 1 of 10 — Component tests green**
  - Run `yarn vitest run tests/unit/components/HazardousEventReviewStep.test.tsx`
  - Run `yarn vitest run tests/unit/components/DisasterRecordReviewStep.test.tsx`

- [x] **Task 3.2: Quality gate 2 of 10 — TypeScript check**
  - Run `yarn tsc` (zero errors)

- [x] **Task 3.3: Quality gate 3 of 10 — Prettier check**
  - Run `yarn format:check` (scoped Prettier check)

- [x] **Task 3.4: Quality gate 4 of 10 — Anti-pattern review**
  - Verify no anti-patterns from `.github/skills/anti-pattern-check/SKILL.md`

- [x] **Task 3.5: Quality gate 5 of 10 — SOLID review**
  - Review component responsibilities and separation of presentation from data fetching

- [x] **Task 3.6: Quality gate 6 of 10 — Documentation review**
  - Verify comments explain WHY not WHAT and are properly maintained

- [x] **Task 3.7: Quality gate 7 of 10 — Project conventions review**
  - Review against `.github/copilot-instructions.md`

- [x] **Task 3.8: Quality gate 8 of 10 — Code review**
  - Run code review inspection

- [x] **Task 3.9: Quality gate 9 of 10 — Visual/UX parity review**
  - Verify visual alignment across all three views (Disaster Event, Hazardous Event, Disaster Record)

- [x] **Task 3.10: Quality gate 10 of 10 — Independent second-opinion review**
  - Complete second-opinion inspection

- [x] **Task 3.11: Mandatory regression gate**
  - Run `yarn test:run2` (full PGlite suite must pass with zero new failures)

## Phase 4: Finalize & Archive

- [x] **Task 4.1: Sync capability specs to main specs directory**
  - Sync `hazardous-event-view` spec to `openspec/specs/hazardous-event-view/spec.md`
  - Sync `disaster-record-view` spec to `openspec/specs/disaster-record-view/spec.md`

- [x] **Task 4.2: Archive completed change proposal**
  - Move change directory to `openspec/changes/archive/2026-11-05-harmonize-events-records-views/`
