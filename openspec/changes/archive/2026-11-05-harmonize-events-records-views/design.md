# Design: Harmonize Hazardous Events and Disaster Records Views

## Technical Architecture

Under **Option B**, dedicated presentation review components are created in the respective domains while adopting the design-system conventions established by `DisasterEventReviewStep.tsx`.

```
app/
├── frontend/
│   ├── events/
│   │   ├── hazardeventform.tsx               <-- Updates HazardousEventView to render HazardousEventReviewStep
│   │   └── HazardousEventReviewStep.tsx     <-- NEW: Dedicated PrimeReact card-based review view
│   └── disaster-record/
│       ├── form.tsx                          <-- Updates DisasterRecordsView to render DisasterRecordReviewStep
│       └── DisasterRecordReviewStep.tsx      <-- NEW: Dedicated card-based review view + KPI chips
└── routes/$lang+/
    ├── hazardous-event+/$id.tsx              <-- Configures hideTopSummary={true} & top back button
    └── disaster-record+/$id.tsx              <-- Configures hideTopSummary={true} & integrates effects cards
```

## TypeScript Types & Interfaces

### 1. `HazardousEventReviewStepProps` (`app/frontend/events/HazardousEventReviewStep.tsx`)
```typescript
export interface HazardousEventReviewStepProps {
	ctx: ViewContext;
	item: {
		id: string;
		status?: string;
		nationalSpecification?: string | null;
		startDate?: string | null;
		endDate?: string | null;
		description?: string | null;
		chainsExplanation?: string | null;
		magnitude?: string | null;
		recordOriginator?: string | null;
		hazardousEventStatus?: "forecasted" | "ongoing" | "passed" | null;
		dataSource?: string | null;
		createdAt?: string | Date | null;
		updatedAt?: string | Date | null;
		hipHazard?: { code?: string | null; name?: Record<string, string> | string | null } | null;
		hipCluster?: { name?: Record<string, string> | string | null } | null;
		hipType?: { name?: Record<string, string> | string | null } | null;
		spatialFootprint?: any[];
		attachments?: any[];
		parent?: any | null;
		children?: any[];
	};
	auditLogs?: any[];
}
```

### 2. `DisasterRecordReviewStepProps` (`app/frontend/disaster-record/DisasterRecordReviewStep.tsx`)
```typescript
export interface HumanEffectsTotals {
	deaths?: number | string | null;
	injured?: number | string | null;
	missing?: number | string | null;
	directlyAffected?: number | string | null;
	indirectlyAffected?: number | string | null;
	displaced?: number | string | null;
}

export interface DisasterRecordReviewStepProps {
	ctx: ViewContext;
	item: {
		id: string;
		disasterEventId?: string | null;
		cpDisplayName?: string | null;
		locationDesc?: string | null;
		startDate?: string | null;
		endDate?: string | null;
		localWarnInst?: string | null;
		primaryDataSource?: string | null;
		otherDataSource?: string | null;
		fieldAssessDate?: string | null;
		assessmentModes?: string | null;
		originatorRecorderInst?: string | null;
		validatedBy?: string | null;
		checkedBy?: string | null;
		dataCollector?: string | null;
		createdAt?: string | Date | null;
		updatedAt?: string | Date | null;
		hipHazard?: any;
		hipCluster?: any;
		hipType?: any;
		spatialFootprint?: any[];
		attachments?: any[];
		disasterRecord?: any[];
	};
	humanEffectsTotals?: HumanEffectsTotals;
	humanEffectsDisaggregation?: any[];
	recordsDisRecSectors?: any[];
	recordsNonecoLosses?: any[];
	auditLogs?: any[];
}
```

## Drizzle Schema Changes

**No Drizzle schema changes or DB migrations are needed.** All queries, data relationships, and database models remain untouched.

## Form-CSV-API Impact

**Zero impact on the Form-CSV-API pipeline.**
The canonical `fieldsDef`, `fieldsDefCommon`, `fieldsDefApi`, and `fieldsDefView` in both `app/frontend/events/hazardeventform.tsx` and `app/frontend/disaster-record/form.tsx` are retained. The presentation views will consume the model fields without altering the field definitions driving CSV import/export and API serialization.

## Test Approach

- **Component Unit Tests (`Vitest` + `jsdom`, `yarn test:dom`)**:
  - Test `HazardousEventReviewStep`: verify rendering of all 6 cards, labels, fallback values, and omission of the add button.
  - Test `DisasterRecordReviewStep`: verify rendering of all 8 cards, calculation/formatting of the 6 KPI metric chips, totals table, and sector/non-economic loss tables.
- **Regression Testing (`Vitest` + `PGlite`, `yarn test:run2`)**:
  - Full suite run to guarantee zero regressions across models, handlers, and existing pages.
