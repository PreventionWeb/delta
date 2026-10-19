## ADDED Requirements

### Requirement: CoreModule compiles without error after importing ValidationWorkflowModule

`CoreModule` SHALL compile into a valid NestJS `TestingModule`. No error MUST be thrown
during `compile()`. Adding `ValidationWorkflowModule` to `CoreModule`'s imports must not
break existing compilation or existing `NoticesModule`-derived resolution.

#### Scenario: CoreModule still compiles after importing ValidationWorkflowModule

- **WHEN** `Test.createTestingModule({ imports: [CoreModule] }).compile()` is called
  after `ValidationWorkflowModule` has been added to `CoreModule`'s imports
- **THEN** the returned module is defined and no exception is thrown

### Requirement: ProcessWorkflowActionUseCase is resolvable via CoreModule

After `ValidationWorkflowModule` is added to `CoreModule`'s imports, calling
`module.get(ProcessWorkflowActionUseCase)` on a `CoreModule`-based test container MUST
resolve to a defined instance.

#### Scenario: ProcessWorkflowActionUseCase resolves from CoreModule context

- **WHEN** `Test.createTestingModule({ imports: [CoreModule] }).compile()` is called
  and `module.get(ProcessWorkflowActionUseCase)` is invoked on the result
- **THEN** the returned value is defined and not null

### Requirement: ValidationWorkflowModule is not re-exported from CoreModule

`CoreModule`'s `exports` array SHALL NOT contain `ValidationWorkflowModule`. A future
module that needs `ProcessWorkflowActionUseCase` (e.g. `HazardousEventsModule`) MUST
import `ValidationWorkflowModule` directly rather than reaching it through `CoreModule`,
matching the same circular-dependency-avoidance rationale already documented for
`NoticesModule`.

#### Scenario: CoreModule's exports array excludes ValidationWorkflowModule

- **WHEN** `CoreModule`'s `@Module()` metadata is inspected
- **THEN** `exports` contains `DrizzleProvider` and `NoticesModule` as before, and does
  NOT contain `ValidationWorkflowModule`

### Requirement: Existing CoreModule wiring is unaffected by this addition

Adding `ValidationWorkflowModule` to `CoreModule`'s imports SHALL NOT change the
existing behaviour verified in `tests/integration/domains/notices/NoticesModule.test.ts`'s
`CoreModule`-resolution block: `CreateNoticeUseCase`, `ListNoticesUseCase`, and
`GetNoticeByIdUseCase` still resolve exactly as before.

#### Scenario: Pre-existing NoticesModule use cases still resolve via CoreModule after this change

- **WHEN** `CoreModule` is compiled after this change
- **THEN** `CreateNoticeUseCase`, `ListNoticesUseCase`, and `GetNoticeByIdUseCase` all
  resolve exactly as they did before this change
