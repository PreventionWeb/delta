# hazardous-event-causality-schema Specification

## Purpose
Defines the persisted shape of the `hazardous_event_causality` table, which links a cause
`hazardous_event` to an effect `hazardous_event` with an optional explanation. This spec covers
schema-level observable behaviour only: what a direct insert/query against this table must
accept or reject.

## Requirements

### Requirement: `hazardous_event_causality` table shape and constraints

The `hazardous_event_causality` table MUST persist one row per cause/effect link between two
`hazardous_event` rows, with columns `id` (UUID primary key), `cause_hazardous_event_id` (UUID,
not null, FK to `hazardous_event.id`, cascade on delete), `effect_hazardous_event_id` (UUID, not
null, FK to `hazardous_event.id`, cascade on delete), `causality_explanation` (text, nullable),
`created_at` (timestamptz, not null), and `updated_at` (timestamptz, not null). A row MUST NOT
have the same value in `cause_hazardous_event_id` and `effect_hazardous_event_id`.

#### Scenario: Insert a causality link between two existing, distinct events

- **WHEN** a row is inserted with `cause_hazardous_event_id` and `effect_hazardous_event_id`
  matching two different existing `hazardous_event` rows
- **THEN** the insert succeeds

#### Scenario: `causality_explanation` is optional

- **WHEN** a row is inserted with `causality_explanation = NULL` and otherwise valid
  cause/effect FKs
- **THEN** the insert succeeds

#### Scenario: `cause_hazardous_event_id` is required

- **WHEN** a row is inserted with `cause_hazardous_event_id = NULL`
- **THEN** the insert is rejected by a database-level not-null constraint

#### Scenario: `effect_hazardous_event_id` is required

- **WHEN** a row is inserted with `effect_hazardous_event_id = NULL`
- **THEN** the insert is rejected by a database-level not-null constraint

#### Scenario: `cause_hazardous_event_id` must reference an existing hazardous event

- **WHEN** a row is inserted with a `cause_hazardous_event_id` that matches no row in
  `hazardous_event`
- **THEN** the insert is rejected by the foreign key constraint

#### Scenario: `effect_hazardous_event_id` must reference an existing hazardous event

- **WHEN** a row is inserted with an `effect_hazardous_event_id` that matches no row in
  `hazardous_event`
- **THEN** the insert is rejected by the foreign key constraint

#### Scenario: An event cannot be recorded as causing itself

- **WHEN** a row is inserted with `cause_hazardous_event_id` and `effect_hazardous_event_id` set
  to the same existing `hazardous_event` row's `id`
- **THEN** the insert is rejected by a database-level CHECK constraint

#### Scenario: A multi-event cycle is not blocked at the database level

- **WHEN** rows are inserted forming a cycle longer than one hop (event A causes event B, event B
  causes event A), each row using a different, valid cause/effect pair
- **THEN** every individual insert succeeds — this table's CHECK constraint only rejects the
  1-length degenerate case (an event causing itself); general cycle prevention is an app-layer
  concern (a later domain-layer intent), not a substitute this schema provides

#### Scenario: Deleting the referenced cause event cascades

- **WHEN** a `hazardous_event` row is deleted while a `hazardous_event_causality` row still
  references its `id` as `cause_hazardous_event_id`
- **THEN** the dependent `hazardous_event_causality` row is deleted along with it, per the
  `onDelete: "cascade"` constraint on `cause_hazardous_event_id`

#### Scenario: Deleting the referenced effect event cascades

- **WHEN** a `hazardous_event` row is deleted while a `hazardous_event_causality` row still
  references its `id` as `effect_hazardous_event_id`
- **THEN** the dependent `hazardous_event_causality` row is deleted along with it, per the
  `onDelete: "cascade"` constraint on `effect_hazardous_event_id`

#### Scenario: A hazardous event can be the cause of multiple effect events

- **WHEN** two rows are inserted with the same `cause_hazardous_event_id` but different,
  distinct `effect_hazardous_event_id` values, all referencing existing events
- **THEN** both inserts succeed — no uniqueness constraint prevents one event from causing
  multiple others

#### Scenario: A hazardous event can be the effect of multiple cause events

- **WHEN** two rows are inserted with the same `effect_hazardous_event_id` but different,
  distinct `cause_hazardous_event_id` values, all referencing existing events
- **THEN** both inserts succeed — no uniqueness constraint prevents one event from having
  multiple causes

#### Scenario: Concurrent inserts of different causality links both succeed

- **WHEN** two callers concurrently insert two `hazardous_event_causality` rows with different
  `effect_hazardous_event_id` values that both reference the same existing
  `cause_hazardous_event_id`, before either transaction commits
- **THEN** both inserts succeed — each FK and CHECK constraint validates its own row
  independently and does not serialize unrelated inserts against the same parent
