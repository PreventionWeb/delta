## ADDED Requirements

### Requirement: CoreModule compiles without error after importing HazardousEventsModule

`CoreModule` SHALL compile into a valid NestJS `TestingModule`. No error MUST be
thrown during `compile()`. Adding `HazardousEventsModule` to `CoreModule`'s imports
must not break existing compilation or existing `NoticesModule`/`ValidationWorkflowModule`-derived
resolution.

#### Scenario: CoreModule still compiles after importing HazardousEventsModule

- **WHEN** `Test.createTestingModule({ imports: [CoreModule] }).compile()` is
  called after `HazardousEventsModule` has been added to `CoreModule`'s imports
- **THEN** the returned module is defined and no exception is thrown

### Requirement: All six Phase 4 hazardous-events use cases are resolvable via CoreModule

After `HazardousEventsModule` is added to `CoreModule`'s imports, calling
`module.get(...)` for each of `CreateHazardousEventUseCase`,
`UpdateHazardousEventUseCase`, `GetHazardousEventByIdUseCase`,
`ListHazardousEventsUseCase`, `DeleteHazardousEventUseCase`, and
`RecordSpatialObservationUseCase` on a `CoreModule`-based test container MUST
resolve to a defined instance.

#### Scenario: Each hazardous-events use case resolves from CoreModule context

- **WHEN** `Test.createTestingModule({ imports: [CoreModule] }).compile()` is
  called
- **THEN** `module.get(...)` for each of the six Phase 4 use cases returns a
  defined, non-null instance

### Requirement: HazardousEventsModule is not re-exported from CoreModule

`CoreModule`'s `exports` array SHALL NOT contain `HazardousEventsModule`. A future
consumer needing any of the six use cases MUST import `HazardousEventsModule`
directly rather than reaching it through `CoreModule`, matching the same
circular-dependency-avoidance rationale already documented for `NoticesModule` and
`ValidationWorkflowModule`.

#### Scenario: CoreModule's exports array excludes HazardousEventsModule

- **WHEN** `CoreModule`'s `@Module()` metadata is inspected
- **THEN** `exports` contains `DrizzleProvider` and `NoticesModule` as before, and
  does NOT contain `HazardousEventsModule`

### Requirement: Existing CoreModule wiring is unaffected by HazardousEventsModule's addition

Adding `HazardousEventsModule` to `CoreModule`'s imports SHALL NOT change the
existing behaviour verified for `NoticesModule` and `ValidationWorkflowModule`:
`CreateNoticeUseCase`, `ListNoticesUseCase`, `GetNoticeByIdUseCase`, and
`ProcessWorkflowActionUseCase` all still resolve exactly as before.

#### Scenario: Pre-existing Notices and ValidationWorkflow use cases still resolve via CoreModule after this change

- **WHEN** `CoreModule` is compiled after this change
- **THEN** `CreateNoticeUseCase`, `ListNoticesUseCase`, `GetNoticeByIdUseCase`, and
  `ProcessWorkflowActionUseCase` all resolve exactly as they did before this change
