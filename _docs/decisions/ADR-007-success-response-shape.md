# ADR-007: Success Response Shape — Plain Resource, No Envelope

## Status
Proposed

## Date
2026-07-22

## Context

ADR-003 mandates a structured `{ success: false, error: {...} }` envelope for every error
response, across every surface — "every error response from every surface uses exactly this
shape. No deviations." That remains unchanged and is not revisited here. But ADR-003 never
formally mandates a shape for *success* responses — its only formal "Decision" language is
about the error envelope. Its Layer 4 section does show an illustrative loader example wrapping
the success case too (`Response.json({ success: true, data: result })`), but that was never
stated as a rule, and it turned out to be stale relative to what was actually built.

Checked directly against the shipped code: the Notices web channel's loaders
(`app/routes/$lang+/_authenticated+/notices+/_index.tsx` and `$id.tsx`) already return the use
case's result directly — `return await listNoticesUseCase.execute(...)` — no wrapper at all. On
error, `throwNoticeLoaderError()` throws a `Response.json({ success: false, error: {...} },
{ status })`, caught by `NoticeErrorBoundary`. So the actual, already-shipped convention for
Notices' web channel is: **plain resource on success, enveloped only on error** — exactly
matching current mainstream REST/API convention (Stripe, GitHub, Twilio, Shopify; Google's API
Improvement Proposals, Microsoft's REST API Guidelines, Zalando's RESTful API Guidelines all
recommend this, and it pairs with the same reasoning behind RFC 7807 "Problem Details" — the
HTTP status code already signals success/failure, so a redundant `success: true` boolean adds
nothing and forces every response schema into a generic wrapper).

The new `NoticesController` (NestJS REST API, `/api/v2/notices`) deviated from this
already-established pattern: its `list()` method wrapped its response in
`{ success: true, data: [...] }`, while `getById`/`create`/`update` returned the bare `NoticeDto`
— an inconsistency in its own right, caught in code review, that led to this question. Since
Notices is DELTA's reference domain for the Clean Architecture migration — every future domain's
REST controller and loaders will copy whatever pattern this pilot establishes — this is worth
stating explicitly as a rule rather than leaving it as an implicit, rediscoverable convention.

## Decision

**Every success response, on every presentation surface, returns the resource or collection
directly. No `{ success: true, data }` wrapper, anywhere.** The HTTP status code (or, for a
thrown React Router `Response`, the fact that it was thrown at all) is the sole success/failure
signal:
- REST API (`NoticesController`): `GET`/`PUT` return the resource directly at `200`; `POST`
  returns the created resource directly at `201`; `DELETE` returns `204` with no body; `GET`
  list endpoints return the bare array at `200`.
- React Router loaders/actions: return the use case's result directly; `useLoaderData()`/
  `useActionData()` receive it with no unwrapping step.

**Error responses are unchanged everywhere.** ADR-003's `{ success: false, error: {code,
message, details?, traceId, timestamp} }` envelope remains mandatory for every error, on every
surface — `DomainErrorFilter` for the REST API, `throwNoticeLoaderError()` (or its equivalent)
for loaders/actions. Only the success side changes.

**The already-shipped Notices loaders are the reference implementation** — no code change is
needed there. `NoticesController.list()` is corrected to match: it returns the bare
`NoticeDto[]` directly instead of `{ success: true, data: [...] }`.

**ADR-003's Layer 4 example is stale, not wrong in intent.** It correctly established the error
envelope; its success-case illustration just didn't reflect what was ultimately built. This ADR
supersedes that one illustrative detail — ADR-003 itself is not rewritten, per this project's
convention of writing a new ADR rather than editing a settled one, but future readers should
treat this ADR's rule as authoritative for success-response shape, and ADR-003's example as
historical/inaccurate on that one point.

**Pagination metadata is deferred, not silently dropped.** `ListNoticesUseCase` does not compute
a total count today. A bare array means a client can't yet tell if more pages exist beyond
comparing the returned length to the requested `pageSize`. Adding total-count/next-page metadata
(e.g. via an `X-Total-Count` header) is left for when a real consumer actually needs it.

## Consequences

**Positive:**
- Corrects a real inconsistency in the first NestJS REST controller before any external
  integrator builds against it.
- Every future domain's presentation layer — REST controller or loader — inherits one
  unambiguous convention, matching what Notices' web channel already does today.
- External integrators consume the resource's own schema directly; no `res.data` unwrapping
  step, no generic wrapper cluttering the OpenAPI document.

**Trade-offs:**
- List endpoints carry no pagination metadata in the body yet. Acceptable now; revisit once an
  integrator actually needs to page reliably through more than one page.

## References
- [ADR-003](ADR-003-error-handling-architecture.md) — error envelope (unchanged); Layer 4's
  success-case example is the stale detail this ADR corrects.
- [notices-rest-controller](../../openspec/changes/notices-rest-controller/design.md) — the
  change that surfaced this decision; Decision 13 there implements the `NoticesController` fix.
- `app/routes/$lang+/_authenticated+/notices+/_index.tsx` / `$id.tsx` — the already-shipped
  reference implementation for the loader side.
