## MODIFIED Requirements

### Requirement: CoreModule compiles without error
`CoreModule` SHALL compile into a valid NestJS `TestingModule`. No error MUST be thrown
during `compile()`. This requirement is unchanged from the existing `CoreModule` spec;
it is restated here to confirm that adding `NoticesModule` to `CoreModule`'s imports does
not break existing compilation.

#### Scenario: CoreModule still compiles after importing NoticesModule
- **WHEN** `Test.createTestingModule({ imports: [CoreModule] }).compile()` is called
  after `NoticesModule` has been added to `CoreModule`'s imports
- **THEN** the returned module is defined and no exception is thrown

### Requirement: CreateNoticeUseCase is resolvable via CoreModule
After `NoticesModule` is added to `CoreModule`'s imports and exports, calling
`module.get(CreateNoticeUseCase)` on a `CoreModule`-based test container MUST resolve
to a defined instance.

#### Scenario: CreateNoticeUseCase resolves from CoreModule context
- **WHEN** `Test.createTestingModule({ imports: [CoreModule] }).compile()` is called
  and `module.get(CreateNoticeUseCase)` is invoked on the result
- **THEN** the returned value is defined and not null

### Requirement: ListNoticesUseCase is resolvable via CoreModule
After `NoticesModule` is added to `CoreModule`'s imports and exports, calling
`module.get(ListNoticesUseCase)` on a `CoreModule`-based test container MUST resolve
to a defined instance.

#### Scenario: ListNoticesUseCase resolves from CoreModule context
- **WHEN** `Test.createTestingModule({ imports: [CoreModule] }).compile()` is called
  and `module.get(ListNoticesUseCase)` is invoked on the result
- **THEN** the returned value is defined and not null

### Requirement: GetNoticeByIdUseCase is resolvable via CoreModule
After `NoticesModule` is added to `CoreModule`'s imports and exports, calling
`module.get(GetNoticeByIdUseCase)` on a `CoreModule`-based test container MUST resolve
to a defined instance.

#### Scenario: GetNoticeByIdUseCase resolves from CoreModule context
- **WHEN** `Test.createTestingModule({ imports: [CoreModule] }).compile()` is called
  and `module.get(GetNoticeByIdUseCase)` is invoked on the result
- **THEN** the returned value is defined and not null
