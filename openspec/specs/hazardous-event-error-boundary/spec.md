# hazardous-event-error-boundary Specification

## Purpose

Defines what a user sees when a CA Hazardous Events page (`/{lang}/he-preview/...`) fails: a
localised, accessible error state rendered inside the application layout, with a copyable error
reference and no internal detail, replacing the root error page.

## Requirements

### Requirement: Every UI-rendering he-preview route renders the Hazardous Events error state on failure

The `he-preview` list (`_index`), detail (`$id`), create (`new`), edit (`edit.$id`) and picker
(`picker`) route modules SHALL export the Hazardous Events error boundary as their `ErrorBoundary`.
When any of their loaders, actions or components throws, the user SHALL see the Hazardous Events
error state inside the authenticated application layout (site header and navigation still
present), under a page header reading the Hazardous Events page title, and SHALL NOT see the root
error page.

#### Scenario: Missing event on the detail page

- **GIVEN** a signed-in user with ViewData permission in tenant T
- **WHEN** they open `/en/he-preview/<uuid>` for a UUID with no hazardous event in T
- **THEN** the response status SHALL be 404
- **AND** the page SHALL show the site header, the page header "Hazardous events", the title
  "Hazardous event not found" and the body "The record does not exist or you do not have access to it."
- **AND** the page SHALL NOT show the root error page's "Return to Home" button

#### Scenario: Missing event on the edit page

- **GIVEN** a signed-in user with EditData permission
- **WHEN** they open `/en/he-preview/edit/<uuid>` for a UUID with no hazardous event in their tenant
- **THEN** the response status SHALL be 404 and the not-found error state SHALL render

#### Scenario: Unknown parent on the create page

- **WHEN** a user with EditData permission opens `/en/he-preview/new?parent=<uuid>` for a UUID with
  no hazardous event in their tenant
- **THEN** the response status SHALL be 404 and the not-found error state SHALL render

#### Scenario: Event in another tenant is indistinguishable from a missing event

- **GIVEN** a hazardous event E that exists only in tenant U
- **WHEN** a user of tenant T opens `/en/he-preview/<E.id>` or `/en/he-preview/edit/<E.id>`
- **THEN** the response status SHALL be 404 and the not-found error state SHALL render
- **AND** nothing on the page SHALL reveal that E exists

#### Scenario: Permission failure

- **GIVEN** a signed-in user whose role lacks ViewData
- **WHEN** they open `/en/he-preview` or `/en/he-preview/<uuid>`
- **THEN** the response status SHALL be 403
- **AND** the page SHALL show the title "Access denied" and the body "You do not have permission to do this."

#### Scenario: Unexpected failure in a delete issued from the list page

- **GIVEN** the list page is open
- **WHEN** a Delete confirmation is submitted and the delete action fails with an error that is not
  an expected delete outcome
- **THEN** the list page area SHALL be replaced by the "Something went wrong" error state inside the
  application layout
- **AND** expected delete outcomes (not found, forbidden, blocked) SHALL still be shown as toast
  messages, never as the error state

### Requirement: The error state is chosen from the HTTP status, never from server error text

The error boundary SHALL select its title and body from the failed response's HTTP status:
404 → not found; 403 → access denied; 400 or 422 → request could not be processed; 409 → record
could not be saved; any other status → something went wrong. A thrown value that is not a route
error response (an `Error`, a string, or anything else) SHALL show "Something went wrong". The
page SHALL NOT render the server-provided `error.message`, `error.details`, an error's `message`
or `stack`, SQL text, entity type names, or record ids.

#### Scenario: Validation failure surfaced as an error page

- **WHEN** a route throws a 422 error response whose `error.message` is "At least one validator must be selected for submit-validation"
- **THEN** the page SHALL show the title "The request could not be processed" and the body "Check the information you entered and try again."
- **AND** the text "At least one validator must be selected for submit-validation" SHALL NOT appear on the page

#### Scenario: Conflict surfaced as an error page

- **WHEN** a route throws a 409 error response
- **THEN** the page SHALL show the title "The record could not be saved" and the body "It changed or is linked to other records. Reload the page and try again."

#### Scenario: Non-Response error

- **WHEN** the boundary receives `new Error("Failed query: select ...")`
- **THEN** the page SHALL show the title "Something went wrong" and the body "An unexpected error occurred. Please try again later."
- **AND** the text "Failed query" SHALL NOT appear on the page
- **AND** no error reference SHALL be shown

#### Scenario: Error response with an unexpected body shape

- **WHEN** a route throws a 404 error response whose body is a plain string or lacks `error.traceId`
- **THEN** the not-found error state SHALL render
- **AND** no error reference SHALL be shown
- **AND** the page SHALL NOT show "[object Object]"

#### Scenario: Details are never rendered

- **WHEN** a route throws a 404 error response whose `error.details` is `{ "entity": "HazardousEvent", "id": "abc" }`
- **THEN** neither "HazardousEvent" nor "abc" SHALL appear on the page

### Requirement: A malformed event id is treated as not found on every he-preview route

An id that identifies a hazardous event (the route path id of the detail, edit and delete
routes, the create page's `parent` query parameter, and the cause id in a create or edit
submission) that is not a well-formed UUID SHALL be handled exactly like a well-formed id that
matches no hazardous event in the user's tenant. No he-preview request SHALL return 500 because
such an id is malformed. List and picker filter parameters are out of this requirement: they
keep their existing behaviour of ignoring a malformed id.

#### Scenario: Malformed id on the detail page

- **WHEN** a user with ViewData permission opens `/en/he-preview/not-a-uuid`
- **THEN** the response status SHALL be 404 and the not-found error state SHALL render
- **AND** no SQL text SHALL appear in the response body

#### Scenario: Malformed id on the edit page and edit submit

- **WHEN** a user with EditData permission opens `/en/he-preview/edit/not-a-uuid`, or submits the edit form to that URL
- **THEN** the response status SHALL be 404 and the not-found error state SHALL render

#### Scenario: Malformed parent on the create page

- **WHEN** a user with EditData permission opens `/en/he-preview/new?parent=not-a-uuid`
- **THEN** the response status SHALL be 404 and the not-found error state SHALL render

#### Scenario: Malformed cause id in a create or edit submission

- **WHEN** a create or edit submission carries a cause (parent) id of `not-a-uuid`
- **THEN** the outcome SHALL be identical to a submission whose cause id is a well-formed UUID that matches no event in the tenant
- **AND** no event SHALL be created or changed

#### Scenario: Malformed id on delete

- **WHEN** the delete action is called for `/en/he-preview/delete/not-a-uuid` by a user with EditData permission
- **THEN** it SHALL respond with status 404 and the not-found delete message key, shown as a toast
- **AND** nothing SHALL be deleted

#### Scenario: Concurrent requests with malformed ids

- **WHEN** two requests for `/en/he-preview/not-a-uuid` and `/en/he-preview/edit/also-bad` are served at the same time
- **THEN** each SHALL independently respond 404 with the not-found error state and its own error reference
- **AND** neither SHALL affect the other's response

#### Scenario: Malformed id in a list filter is still ignored

- **WHEN** a user with ViewData permission opens `/en/he-preview?hazardTypeId=not-a-uuid`
- **THEN** the list SHALL render with status 200 as if the filter were absent

### Requirement: The error state shows a copyable error reference when one exists

When the failed response carries an ADR-003 error envelope with a non-empty `traceId`, the error
state SHALL show the label "Error reference", the trace id as selectable text, and a button whose
accessible name is "Copy error reference". Activating the button SHALL copy exactly the trace id
to the clipboard and SHALL announce "Error reference copied" through a polite live region. If
the clipboard is unavailable or rejects, the page SHALL NOT crash, SHALL NOT announce success,
and the trace id SHALL remain visible and selectable.

#### Scenario: Copy succeeds

- **GIVEN** a not-found error state whose envelope `traceId` is "trace-123"
- **WHEN** the user activates "Copy error reference"
- **THEN** the clipboard SHALL contain exactly "trace-123"
- **AND** the live region SHALL contain "Error reference copied"

#### Scenario: Clipboard unavailable

- **GIVEN** a not-found error state with a trace id and no clipboard API (or a rejecting one)
- **WHEN** the user activates "Copy error reference"
- **THEN** the error state SHALL remain rendered with the trace id visible
- **AND** the live region SHALL NOT contain "Error reference copied"

#### Scenario: Trace reference matches the server log

- **WHEN** a he-preview loader or action fails with a domain error or an unexpected error from a use case or one of the steps routed through the route error helper (the taxonomy/validator-candidate loads, the validator-id check of a submit, the workflow-action step, form-data parsing and the country-settings lookup)
- **THEN** the shown error reference SHALL equal the `traceId` of that request's context, the same value written on the request's server log lines
- **AND** an unexpected failure of the authentication, session, tenant or permission lookups that run before those steps is out of this scenario: it reaches the boundary as a generic error without an error reference

### Requirement: The error state offers a way back to the list

Every error state SHALL show a link "Back to Hazardous events" that navigates to
`/{lang}/he-preview` in the current language.

#### Scenario: Back from a not-found page in French

- **WHEN** the not-found error state renders at `/fr/he-preview/<uuid>`
- **THEN** a link "Retour aux événements dangereux" SHALL point to `/fr/he-preview`

### Requirement: The error state is localised in English and French

All error-state copy SHALL come from the `hazardous-events` translation namespace, in the request
language, and SHALL never render a raw translation key, including on 403 and 404 paths that fail
before the page's own data is loaded. English and French SHALL be complete:

| Key                           | English                                                                  | French                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `error.not_found.title`       | Hazardous event not found                                                | Événement dangereux introuvable                                                         |
| `error.not_found.body`        | The record does not exist or you do not have access to it.               | L'enregistrement n'existe pas ou vous n'y avez pas accès.                               |
| `error.forbidden.title`       | Access denied                                                            | Accès refusé                                                                            |
| `error.forbidden.body`        | You do not have permission to do this.                                   | Vous n'avez pas l'autorisation d'effectuer cette action.                                |
| `error.invalid_request.title` | The request could not be processed                                       | La demande n'a pas pu être traitée                                                      |
| `error.invalid_request.body`  | Check the information you entered and try again.                         | Vérifiez les informations saisies et réessayez.                                         |
| `error.conflict.title`        | The record could not be saved                                            | L'enregistrement n'a pas pu être enregistré                                             |
| `error.conflict.body`         | It changed or is linked to other records. Reload the page and try again. | Il a été modifié ou est lié à d'autres enregistrements. Rechargez la page et réessayez. |
| `error.unexpected.title`      | Something went wrong                                                     | Une erreur s'est produite                                                               |
| `error.unexpected.body`       | An unexpected error occurred. Please try again later.                    | Une erreur inattendue s'est produite. Veuillez réessayer plus tard.                     |
| `error.trace.label`           | Error reference                                                          | Référence de l'erreur                                                                   |
| `error.trace.copy`            | Copy error reference                                                     | Copier la référence de l'erreur                                                         |
| `error.trace.copied`          | Error reference copied                                                   | Référence de l'erreur copiée                                                            |

#### Scenario: French not-found page

- **WHEN** a user opens `/fr/he-preview/<uuid>` for a missing event
- **THEN** the page SHALL show "Événement dangereux introuvable"

#### Scenario: French permission failure renders translated text, not keys

- **GIVEN** a user whose role lacks ViewData
- **WHEN** they open `/fr/he-preview/<uuid>`
- **THEN** the page SHALL show "Accès refusé"
- **AND** no text matching `error.` followed by a key segment SHALL appear on the page

#### Scenario: Server-rendered and hydrated text agree

- **WHEN** a not-found error page is server-rendered and then hydrated in the browser
- **THEN** the visible copy SHALL be identical before and after hydration and no hydration warning SHALL be logged for the error state

### Requirement: The error state meets WCAG 2.2 AA

The error state SHALL pass axe-core with tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`,
`wcag22aa`. The error title SHALL be a heading one level below the page title. The decorative
icon SHALL be hidden from assistive technology. The error content SHALL be exposed with
`role="alert"`. Interactive targets SHALL be at least 24 x 24 CSS pixels with a visible focus
indicator that is not obscured. Keyboard order SHALL be copy button (when shown) then back link.
The layout SHALL not scroll horizontally at a 320 CSS pixel viewport; a long trace id SHALL wrap.

#### Scenario: Keyboard operation

- **GIVEN** a not-found error state with a trace id
- **WHEN** the user presses Tab from the start of the main content
- **THEN** focus SHALL move to "Copy error reference", then on the next Tab to "Back to Hazardous events"
- **AND** pressing Enter or Space on the copy button SHALL copy and announce, and pressing Enter on the link SHALL navigate to the list

#### Scenario: Automated accessibility check

- **WHEN** axe-core runs on the not-found (EN and FR) and unexpected error states
- **THEN** there SHALL be zero unapproved violations

#### Scenario: Narrow viewport

- **WHEN** the not-found error state with a trace id renders at 320 CSS pixels wide
- **THEN** the page SHALL NOT scroll horizontally and every control SHALL remain fully visible
