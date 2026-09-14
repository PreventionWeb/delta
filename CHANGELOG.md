# Changelog

All notable changes to this project will be documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## v0.3.0 - 2026-08-27

### Added
- DeepL-backed translations and new language support (Serbian, plus expanded Arabic/Spanish/French/Chinese/Russian/Serbian translations via Weblate) with an ADR-001 i18n SSR stack (react-i18next/remix-i18next, React Router 8 compat).
- Notices module: table schema/migration, create/list/get use cases, multilingual API with swagger, web channel (list + detail routes), and Drizzle data-layer adapter.
- NestJS backend foundation: HTTP server (Express platform + supertest), CoreModule bootstrap, domain errors, request-scoped session memoization via AsyncLocalStorage, and pino logging with logged i18n/ilogger abstraction.
- Nested disaster-event REST APIs for attachments (with cumulative 10MB limit), declarations (multipart attachment support), and responses (multipart attachment support); pluralized data endpoints for assessment, declaration, and response types; reference API docs.
- Normalized data model: spatial footprint refactored into relation/geometry tables (12 new schema tables) with backfill migration; disaster-event assessments/declarations/responses normalized to dedicated tables; `disaster_event.recording_institution` moved to ref-resolving table `orgs`; attachments migrated to `disaster_event_attachment` table with `disaster_event_link` for links.
- Disaster event links management (add/manage links, view on Step 4 and view page).
- Administrative levels and spatial footprint displayed on disaster event view page; Step 4 repurposed as the Disaster Event View.
- User-friendly error when removing a geography level with foreign-key associations.
- Advanced filters, search by name/organization, pagination, and "View my records"/"Pending my actions" filtering on disaster event listings; records vs. discrete filtering for users without EditDisasterEvent permission.
- OpenSpec changes/ADRs for i18n, API response/auth management, and system architecture blueprint (ARCHITECTURE.md).
- Clean Architecture directory structure scaffold; PageProps<T> props-down refactor contract with HazardousEventListPage reference implementation.
### Changed
- Upgraded React Router 7.12 → 7.16 → 7.18 (then 8) and Node to 24 (container 24.18.0); aligned app with `match.loaderData` and v8 trailing-slash-aware data requests.
- Refactored main DB code for linked disaster records into repository files; UI alignment with PrimeReact and stepper flow.
- Disaster event form reworked onto a multi-step stepper (steps 1–4) wired to backend data, links, geospatial location, and the approval workflow; sector names shown instead of UUIDs across steps.
- Disaster creation/editing moved to a modal-based linked-record flow with approval status shown in modal search.
- Disaggregation totals now computed for damages, losses, disruption; HIPS names shown rather than UUIDs.
- Spatial footprint dialog redesigned with PrimeReact components (incl. Safari fixes), scrollbar, auto-zoom, geometry upload on edit, and division add/remove; geometry saves normalized to FeatureCollection inputs.
- Validation workflow modal restyled with the new UI; record deletes clean up validation assignment/rejection and unlink records before disaster event deletion; publisher/validator guard rails and cyclic checks on disaster events.
- Update timestamp now uses current time; default sort order updated for disaster events.
- Ops/deployment updates: GHCR lowercase fixes, prod Docker Compose/scripts, container prod deployment fixes, and UNOG auto-deployment prep for the training server.
- Dependency security: cleared ~40 npm/yarn audit vulnerabilities and 6 package vulnerabilities.
### Fixed
- Hydration/browser-runtime warnings (Meta hook order, root hydration mismatches from browser-extension attributes).
- Validation/publish rules: requires at least one validated/published disaster record, prevents deleting/returning the sole record of a published/validated event.
- Date-precision preservation on drafts, end-date validation, save-order/migration conflicts, and missing required fields when creating new records.
- Attachments upload/save/delete consistency (upload on save, add+delete simultaneously, deletion alongside record deletion, list in review step), file type restrictions, and attachment dialog radio-button/confirm-modal issues (incl. Safari).
- Mobile RTL appearance, button alignment/placement, and responsive layouts across listings.
- Hazard analysis and Analysis dashboard rendering errors for disaster events/hazards.

## v0.2.2 - 2026-05-06

### Added
- Data collection validation workflow enhancements, including submitted-at/by tracking, returned-state handling, save-and-submit modal UX, validator assignment flow improvements, and expanded role-based route guards.
- Provision for new Serbian (`sr`) language support.
- Deployment and operations additions for dev environments, including GHCR-backed dev image refresh workflow/scripts, webhook-based dev deploy improvements, and supporting compose/template updates.
- OpenSpec AI development workflow integrated into the repo (skills, prompts, commands, specs, and documentation) to support structured proposal/explore/apply/archive workflows.
### Changed
- Refactored large backend/frontend modules into smaller units (notably event models, form/editable table rendering, and human effects tests) to improve maintainability and testability.
- Reworked data-collection and approval-related UI/logic across hazardous events and disaster records, including list/filter behavior, action links, analytics gating, and publish/validate visibility rules.
- Updated super-admin and system settings flows: moved currency setup into country account creation, simplified/hid selected system settings fields, and renamed instance labeling from website-oriented wording.
- Modernized settings management pages (assets, geography, sectors, access/settings UX) with PrimeReact-focused layout and interaction updates.
- Content update alignment and related page consistency updates.
### Fixed
- Corrected disaster event/disaster record form behavior and validation edge cases (missing declaration/assessment fields, approval status regressions, direct submit flow issues, and required-field handling).
- Fixed multiple P0 reliability/security defects: dead/no-op checks and APIs removed, secret logging eliminated, session-destroy edge cases handled gracefully, SMTP transport hardening, and HTTP status code consistency improvements.
- Resolved data-model/schema issues, including circular/type export problems, removal of obsolete columns/tables, and migration/upgrade script corrections for the 0.2.2 line.
- Fixed country/account and settings UX defects (icon alignment, hidden irrelevant options/placeholders, action label cleanup, and minor accessibility/form warning issues).
- Addressed assorted test/build/dev tooling issues, including translation export path fixes, fatal build failure handling, and updated test command support.

## v0.2.1 - 2026-04-20

### Added
- Language-scoped routing expansion under /$lang+/... across UI and API routes.
- MCP support, including API implementation, docs, and example prompt/resource content.
- New and expanded management flows for super admin: country accounts, fictitious country management, clone/reset-related flows, and related navigation.
- Organization management capabilities and linked data model updates.
- User profile and TOTP flows/pages (enable, disable, login), plus improved session-handling UX.
- FAQ and related about-page content/routes.
- Broader automated test coverage (assets, disaster records, disruptions, losses, human effects, handlers, and Playwright config updates).
### Changed
- Major UI refresh across auth/settings/admin areas using PrimeReact + Tailwind (login, API keys, access management, settings/system, dialogs, menu structures).
- Service/repository/data-layer refactoring across multiple domains (country accounts, profile, select-instance logic, human effects, and related backend modules).
- Human effects module refactored into smaller model files, with behavior improvements (validation, keyboard save support, cleanup).
- Route/file organization updates and structural cleanup (moved/simplified route modules, removed obsolete components/files, doc structure improvements).
- Dependency and tooling updates (including Vite updates, lint-staged, build/dev script improvements, and production prep for v0.2.1).
### Fixed
- Tenant-isolation and country-account scoping issues in damages/losses/disruptions and related view/edit flows.
- Session and menu separation bugs when using super-admin and user pages in parallel tabs.
- Auth and redirect issues (SSO role routing, authenticated super-admin redirects, select-instance/login redirect edge cases).
- Invitation/email flow defects (resend visibility rules, expired invite handling, invite duration/eligibility behavior, forgot-password email checks).
- Upload and file-size handling issues (attachment size validation/errors, upload path fixes, max file size alignment).
- Multiple UX/layout defects (menu alignment, responsive behavior, dialog/button alignment, icon/text consistency, FAQ/landing page polish).
- Test/build reliability issues (broken tests, Playwright DB init/config, sequential upgrade script fixes, command/documentation correctness).

## v0.2.0 - 2026-02-19

### Added

- Multi-language support for Arabic and Russian

### Changed

- Major upgrade: React Router 7.12 and React from 18 to 19 upgrade
- Refactored data access and database code to data layer
- Reorganized project structure (locales, utilities, schema files)
- Code cleanup: removed unused functions, binary folders, and unnecessary variables

### Fixed

- Security vulnerabilities update and bug fixes
- Custom disaggregation - deletion of first aggregation grouping (#430)

## v0.1.3 - 2025-12-23

### Added

- Integrated PrimeReact UI component into the DELTA project (#322).
- Implemented pagination controls for the Hazardous Event List (#296).
- Added RTL styling support (#317).
- Conducted tech assessment for systematic Google Analytics management (#316).

### Changed

- [#370] Upgraded support to Hazard Information Profiles (HIPs) from version 2021 to 2025
  - Hip type name changed from Geohazards to Geological.
  - List of newly added clusters
    - Ground Failure
    - Other Biological Hazards
    - Space Weather
    - Asphyxiant Gases
    - Specific Infectious Diseases of Public Health Concern
  - List of removed clusters. (we set them as null if used.)
    - Fisheries and Aquaculture
    - Invasive Species
    - Human Animal Interaction
    - CBRNE (Chemical, Biological, Radiological, Nuclear and Explosive)
    - Mental Health
    - Food Safety
    - Infectious Diseases (Aquaculture)
    - Pesticides
    - CBRNE (Chemical, Biological, Radiological, Nuclear and Explosive)
    - Fisheries and Aquaculture
    - Environmental Degradation (Forestry)
    - Pressure Related
    - CBRNE (Chemical, Biological, Radiological, Nuclear and Explosive)
    - Infrastructure Failure
    - Marine
    - Flood
  - List of newly added specific hazards
    - Opioids and Other Psychoactive Substances
    - Gravitational Mass Movement (‘Landslide’)
    - Heavy Metals and Other Trace Elements
    - Toxic Gases
    - Asphyxiant ​​Gases
    - Persistent Organic Pollutants
    - Perfluoroalkyl and Polyfluoroalkyl Substances
    - Corrosive Substances
    - Ammonium Nitr​​ate
    - Debris and earth (mud)flows and rock avalanches
    - Rock, debris and earth (mud) slide
    - Rock, debris and earth topples
    - Rain
    - Flooding
    - Marine Heatwave
    - Space Debris
    - Advanced Persistent Threat
    - Denial of Service
    - Supply Chain Attack
    - Social Engineering - Phishing
    - Tunnel Failure
    - Marburg virus disease
  - List of removed specific hazards. (we set them as null if used.)
    - Invasive Weeds
    - Foodborne Microbial Hazards (including human enteric virus and foodborne parasite)
    - Antimicrobial Resistant Microorganisms
    - Vector-borne diseases (VBD) (Animals)
    - Trypanosomosis (Animal)
    - Phosphine
    - Residue of Pesticides
    - Insecticides
    - Fungicides
    - Hazardous Pesticide Contamination in Soils
    - Oil Pollution
    - Ground Shaking (Earthquake)
    - Liquefaction (Earthquake Trigger)
    - Earthquake Surface Rupture, Fissures, and Tectonic Uplift/Subsidence
    - Subsidence and Uplift, Including Shoreline Change (Earthquake Trigger)
    - Tsunami (Earthquake Trigger)
    - Landslide or Debris Flow (Earthquake Trigger)
    - Ground Gases (Seismogenic)
    - Ballistics (Volcanic)
    - Landslide (Volcanic Trigger)
    - Ground Shaking (Volcanic Earthquake)
    - Tsunami (Volcanic Trigger)
    - Lightning (Volcanic Trigger)
    - Urban Fire (During/Following Volcanic Eruption)
    - Subsidence and Uplift, Including Shoreline Change (Magmatic/Volcanic Trigger)
    - Ground Shaking (induced earthquake, reservoir fill, dams, cavity collapse, underground explosion, impact, hydrocarbon fields, shale exploration, etc.)
    - Aquifer Recharge (Systems Failure/Outages)
    - Sediment Rock Avalanche
    - Tsunami (Submarine Landslide Trigger)
    - Polluted Air
    - Ice Storm
    - Mud Flow
    - Rock slide
    - Subtropical Storm
    - Tropical Storm
    - Radiation Agents
    - Misconfiguration of Software and Hardware
    - Non-Conformity and Interoperability
    - Data Security-Related Hazards
    - Outage
    - Personally Identifiable Information (PII) Breach
    - Internet of Things (IOT)-Related Hazards
    - Disrupt

### Fixed

- [#368] Corrected tenant file storage path.  
  Tenant-specific folders (e.g., `tenant-1e0eac8f...`) are now properly placed inside the `uploads/` directory (`uploads/tenant-1e0eac8f...`) instead of being created at the application root.

  **Action (Systems Administrator):**
  - Move any existing tenant folders from the application root into the `uploads/` directory.
  - Verify permissions and ownership on the new `uploads/tenant-*` paths to ensure application access.

* Multiple bug fixes across application modules (#384, #375, #371, #367, #365, #364, #360, #354, #344, #341, #339).

---
