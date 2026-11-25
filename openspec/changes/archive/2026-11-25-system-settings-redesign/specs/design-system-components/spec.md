## ADDED Requirements

### Requirement: FormSelect optional helper description text

`FormSelect` in `app/design-system/components/SelectField.tsx` SHALL accept an optional `helpText?: string` prop. When `helpText` is provided and no `errorMessage` is active, `FormSelect` SHALL render a React Aria `<Text slot="description">` element below the trigger styled in label typography (`text-label text-fg-2`) so assistive technologies automatically associate the description with the select control via `aria-describedby`.

#### Scenario: FormSelect renders description text when helpText is provided

- **GIVEN** a `FormSelect` rendered with `helpText="The default language for everyone on this instance."` and no `errorMessage`
- **WHEN** the component mounts
- **THEN** the helper text MUST be visible below the select trigger
- **AND** it MUST be associated with the select control via React Aria's description slot

#### Scenario: FormSelect hides helper text when an errorMessage is active

- **GIVEN** a `FormSelect` rendered with both `helpText` and `errorMessage`
- **WHEN** the component renders in its invalid state
- **THEN** the inline `FieldError` message MUST be displayed in place of `helpText`
