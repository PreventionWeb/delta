# sectors-settings Specification

## Purpose
TBD - created by archiving change sectors-redesign. Update Purpose after archive.

## Requirements

### Requirement: Admin permission enforcement on Settings Sectors
The `/:lang/settings/sectors` route loader (`app/routes/$lang+/settings+/sectors.tsx`) MUST enforce the `ManageSectorSettings` permission using `authLoaderWithPerm("ManageSectorSettings", ...)`. The `ManageSectorSettings` permission SHALL be defined in `app/frontend/user/roles.ts` and granted to the `admin` role.

#### Scenario: Admin accesses Settings Sectors
- **WHEN** an authenticated user with the `admin` role requests `/:lang/settings/sectors`
- **THEN** the loader MUST grant access and return the localized sector list for the active language

#### Scenario: Non-admin user attempts to access Settings Sectors
- **WHEN** an authenticated user without the `ManageSectorSettings` permission (such as `data-viewer`, `data-collector`, or `data-validator`) requests `/:lang/settings/sectors`
- **THEN** the loader MUST deny access with a forbidden/unauthorized response according to `authLoaderWithPerm`

#### Scenario: Unauthenticated visitor attempts to access Settings Sectors
- **WHEN** an unauthenticated visitor requests `/:lang/settings/sectors`
- **THEN** the loader MUST redirect to the login page according to `authLoaderWithPerm`

---

### Requirement: Single read-only hierarchical Sectors view without NavSettings
The Settings Sectors page (`/:lang/settings/sectors`) SHALL render a single read-only hierarchical tree view without `NavSettings` and without Tree/Table tabs. Each row MUST display the sector's localized name, its hierarchy level label (`Type`, `Sector`, `Sub-sector`, or `Category`), and on large viewports its localized description.

#### Scenario: Page renders header, toolbar, tree, and footer without NavSettings
- **WHEN** an authorized user loads `/:lang/settings/sectors` with populated sectors
- **THEN** the page MUST display the heading "Sectors" and subtitle explaining that the list is shared across countries and read-only
- **AND** the page MUST NOT render `NavSettings` or Tree/Table view tabs
- **AND** the tree MUST display top-level (level 1) sectors expanded by default, with deeper levels collapsed
- **AND** the footer MUST display the total visible sector count (singular "1 sector" or plural "{count} sectors")

#### Scenario: Localized alphabetical sibling ordering
- **WHEN** the loader fetches sectors for the active language (`ctx.lang`)
- **THEN** root sectors and each parent's child sectors MUST be ordered alphabetically by their localized name

#### Scenario: Empty sector catalog in database
- **WHEN** the database returns zero sectors
- **THEN** the tree MUST render an empty state message and the footer MUST display "0 sectors" without throwing an error

---

### Requirement: Expand and collapse tree branches
Users MUST be able to expand and collapse individual branch rows via mouse click or keyboard navigation, and expand or collapse the entire tree using the toolbar actions.

#### Scenario: User toggles a branch node
- **WHEN** the user activates the chevron button or activates a branch row
- **THEN** that branch MUST toggle between expanded and collapsed states and reveal or hide its immediate children

#### Scenario: User activates Expand all and Collapse all
- **WHEN** the search input is empty and the user activates "Expand all"
- **THEN** every branch node in the tree MUST become expanded
- **WHEN** the search input is empty and the user activates "Collapse all"
- **THEN** every branch node in the tree MUST become collapsed

---

### Requirement: Case-insensitive name-only sector search
The toolbar MUST provide a search input that filters the sector tree client-side by case-insensitive substring match against sector names only.

#### Scenario: Search matches a descendant sector
- **WHEN** the user enters a non-empty query matching one or more descendant sector names
- **THEN** the tree MUST display only matching sectors and their ancestor branches
- **AND** all visible branch nodes MUST be automatically expanded
- **AND** the "Expand all" and "Collapse all" buttons MUST be disabled
- **AND** the footer MUST display "{count} sector matches your search" / "{count} sectors match your search"

#### Scenario: Search matches a parent sector whose children do not match
- **WHEN** the user enters a query that matches a parent sector's name and matches none of its descendants
- **THEN** the tree MUST retain and display all children under that matching parent sector

#### Scenario: Search matches only description text and not sector names
- **WHEN** the user enters a query that appears in a sector's description but not in any sector's name
- **THEN** the tree MUST display the empty search state `No sectors match "{query}".` and a footer count of `0 sectors match your search`

#### Scenario: User clears the search input
- **WHEN** the user clears the search input back to empty
- **THEN** the full sector tree MUST be restored with the user's pre-search expanded/collapsed state
- **AND** the "Expand all" and "Collapse all" buttons MUST become enabled again
