## Context

`DrizzleHazardousEventRepository.server.ts` (`5d`) already implements `findById`,
`findAll`, `insert`, `update`, `delete` against `hazardous_event`/`event`, all using
Drizzle's query-builder style (`.select().from().where()` with `eq`/`and`), tenant-scoped
via `countryAccountsId`, with write errors mapped through
`app/infrastructure/pgErrorCode.server.ts`. `countReferencingDisasterEvents` is the only
remaining stub needed by the delete path (line ~540), throwing unconditionally — the
class's three `5e` spatial-observation stubs are separate, later-intent concerns (see
Not in scope in proposal.md), unaffected by this change.

`disaster_event` (`app/drizzle/schema/disasterEventTable.ts`) already has
`hazardousEventId` (uuid, nullable FK to `hazardous_event.id`, indexed via
`disaster_event_hazardous_event_id_idx`) and `countryAccountsId` (uuid, nullable FK to
`country_accounts`). No schema change needed.

**Resolved design question — what does `tenantId` actually do in this method's query?**
The port's requirement text (`openspec/specs/hazardous-event-repository-port/spec.md`)
says `tenantId` "scopes the `HazardousEvent` side only" and "MUST NOT" filter the
counted `disaster_event` rows by their own tenant — but that text alone doesn't say
whether the real adapter re-verifies the `HazardousEvent`'s own tenant (e.g. via a join
or an `EXISTS` against `hazardous_event`) before counting, or ignores `tenantId`
entirely. Three readings were possible going in; this was settled by direct evidence,
not inferred:

- `IHazardousEventRepository.test.ts`'s `FakeHazardousEventRepository.
  countReferencingDisasterEvents` (lines 170-176) already implements this exact method
  for the port's conformance test, with the parameter named `_tenantId` and the comment
  "Intentionally unused: scopes the HE side only, never filters the counted
  disaster_event rows." The fake performs no HE-tenant check of any kind.
- `DeleteHazardousEventUseCase.execute()` (`app/domains/hazardous-events/application/
  use-cases/DeleteHazardousEvent.ts:67`) already calls
  `hazardousEventRepository.findById(command.id, command.tenantId)` — which throws
  `NotFoundError` for a cross-tenant id — **before** the `Promise.all` that calls
  `countReferencingDisasterEvents`. By the time this method runs, the caller has
  already confirmed `hazardousEventId` belongs to `tenantId`.

Conclusion: the real adapter's query needs no join back to `hazardous_event` and no use
of `tenantId` at all — a plain `COUNT(*)` filtered only by
`disaster_event.hazardous_event_id = hazardousEventId`. `tenantId` is kept as a
parameter purely for interface conformance (the port signature requires it, and arity
is enforced by the port's own compile-time `AssertEqual` check), matching the fake's own
established shape exactly, not inventing a new one. `tsconfig.json`'s
`noUnusedParameters: true` requires this parameter be named `_tenantId` in the real
implementation too (same convention the fake already uses), or `yarn tsc` fails.

**Query-builder vs. raw-`sql` convention — resolved in favor of this file's own
precedent, not the nearest cross-file one.** `DrizzleCausalChainRepository.server.ts`'s
`countEdgesTouching` (`5i`, the closest cross-file precedent for a simple `COUNT`) uses
a whole raw `sql` tagged template via `this.db.execute(sql\`...\`)`. But
`DrizzleHazardousEventRepository.server.ts`'s own five existing methods never use
`db.execute()` for a `SELECT` — they consistently use the query builder
(`.select().from().where()`), reserving raw `sql` only for an embedded expression
inside a builder clause (`update()`'s `date_trunc` comparison). Per this intent's own
instruction to prefer same-file consistency when the two precedents disagree, this
method uses the query builder:

```ts
const [row] = await this.db
	.select({ count: sql<number>`count(*)::int` })
	.from(disasterEventTable)
	.where(eq(disasterEventTable.hazardousEventId, hazardousEventId));
return row.count;
```

The `::int` cast (or `.mapWith(Number)`) is required, not cosmetic — a bare
`COUNT(*)` is Postgres `bigint`, which `node-postgres` returns as a `string` at
runtime against real Postgres. Confirmed empirically: PGlite returns a bare
`count(*)` as a plain JS `number` already, so this diff's PGlite tests would NOT
catch the cast's removal (`toBe(n)` would still pass) — the cast is required for
real-Postgres correctness, not provable by this test tier.

**No error mapping needed.** This is a read with no write; `pgErrorCode.server.ts`
exists to classify constraint-violation errors from writes (`23505`, `23503`,
`22P02` in this file's `mapWriteError`), none of which a `SELECT COUNT(*)` can trigger.
Wiring it in here would be dead code, not defense in depth.

**No concurrent-callers scenario.** The port's spec-quality rule requires one for
shared mutable state accessed by async operations (caches, counters, stores, queues).
This method is a stateless read with no shared mutable state of its own to race on —
same reasoning already applied to `IHazardTaxonomyRepository`'s plain tenant+id queries
(`5i` design.md Decision 3: "stateless reads with no shared mutable state between
callers... don't over-design this one"). The actual TOCTOU concern in this area — a
`disaster_event` row inserted after this count resolves but before the use case's
later `delete()` commits — is `DEF-033`'s documented gap, owned by `5k`'s
transaction/locking work across all three dependent-check counts, not something a
single count method can or should close on its own.

**`DEF-032` is unaffected by this change.** Its text is about *where* this method
lives (interim placement on `IHazardousEventRepository` rather than a future
`IDisasterEventRepository`), not whether it has a real implementation. Implementing the
method here neither closes nor narrows that concern — it remains exactly as recorded,
to be picked up only when Disaster Events gets its own Clean Architecture migration.

## Goals / Non-Goals

**Goals:**

- Replace the throwing stub with a real, PGlite-tested implementation matching the
  port's existing, unmodified contract.

**Non-Goals:**

- Any port or use-case change (both already correct against this method's existing
  contract).
- Closing `DEF-032` (location) or `DEF-033` (transactional atomicity) — explicitly out
  of scope, owned by future intents.
- A real-Postgres (`yarn test:run3`) tier — no concurrency claim is made by this method,
  unlike `5i`'s advisory-lock-based `saveEdge`/`replaceCauseEdge`.

## Decisions

See Context above for the two substantive decisions (tenantId is accepted-but-unused;
query-builder style, not raw `sql`, for same-file consistency) — both resolved by direct
evidence, not left open.

## Risks / Trade-offs

- **[Risk] A reviewer unfamiliar with the resolved tenantId semantics could read the
  unused `_tenantId` parameter as a missed tenant-scoping bug.** → Mitigated by the
  inline comment on the `_tenantId` parameter itself (matching the fake's own comment
  verbatim) and this design doc's explicit trace to the port's fake-conformance test
  and the use case's prior `findById` call.
- **[Risk] `DEF-041` (Stryker/Babel crash on any class with an `implements` clause)
  applies to this file, as it already does to every other adapter class in this
  domain.** → Expected, not a new finding — no register action needed here (per this
  project's standing note not to register near-duplicate findings for the same root
  cause). The test-quality gate for this change is structural review only, same as
  every prior adapter change in this domain since `DEF-041` was logged.

## Migration Plan

No DB migration (`yarn dbsync` not needed — no schema change). Deployment is additive:
this method can land independently of any route or DI wiring (`5g`), so there is no
partial-rollout concern. Rollback is a plain revert; no persisted data shape changes.

## Open Questions

None. The one substantive design question this intent carried in (tenantId semantics)
is resolved above by direct evidence, not deferred.
