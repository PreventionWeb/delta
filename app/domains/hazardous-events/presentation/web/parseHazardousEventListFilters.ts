import type { HazardousEventListFilterInput } from "~/domains/hazardous-events/application/use-cases/ListHazardousEvents";
import { HAZARDOUS_EVENT_STATUS_VALUES } from "~/domains/hazardous-events/domain/HazardousEvent";
import { STATUS_VALUES } from "~/domains/validation-workflow/domain/WorkflowInstance";

const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_SHAPE_RE = /^(\d{4})(?:-(\d{1,2})(?:-(\d{1,2}))?)?$/;

function uuidOrAbsent(value: string | null): string | undefined {
	return value && UUID_RE.test(value) ? value : undefined;
}

/** Shape-valid but calendar-invalid (e.g. month 13, Feb 30) still reaches Postgres's own
 * TO_DATE() as an unhandled range error -- confirmed empirically against PGlite (code review
 * finding). Round-trips through Date.UTC to catch those too, not just the digit shape. */
function dateOrAbsent(value: string | null): string | undefined {
	if (!value) return undefined;
	const match = value.match(DATE_SHAPE_RE);
	if (!match) return undefined;
	const [, yearStr, monthStr, dayStr] = match;
	if (monthStr === undefined) return value;
	const month = Number(monthStr);
	if (month < 1 || month > 12) return undefined;
	if (dayStr === undefined) return value;
	const year = Number(yearStr);
	const day = Number(dayStr);
	const parsed = new Date(Date.UTC(year, month - 1, day));
	const isRealCalendarDate =
		parsed.getUTCFullYear() === year &&
		parsed.getUTCMonth() === month - 1 &&
		parsed.getUTCDate() === day;
	return isRealCalendarDate ? value : undefined;
}

function enumOrAbsent<T extends string>(
	value: string | null,
	allowed: readonly T[],
): T | undefined {
	return value && (allowed as readonly string[]).includes(value)
		? (value as T)
		: undefined;
}

/** Omits a key entirely rather than setting it to `undefined` -- a malformed/absent/empty-string
 * param must leave the field absent from the result, not present-with-undefined (spec: "A param
 * that is absent or an empty string SHALL resolve to that field being absent"). */
function withIfDefined<K extends string, V>(
	key: K,
	value: V | undefined,
): { [P in K]?: V } {
	return value === undefined ? {} : ({ [key]: value } as { [P in K]: V });
}

// Malformed values are dropped, not surfaced as a 400 (design.md Decision 7) -- a UUID/date/enum
// column error reaches Postgres as an unhandled 500 otherwise.
export function parseHazardousEventListFilters(
	searchParams: URLSearchParams,
): HazardousEventListFilterInput {
	return {
		...withIfDefined(
			"hazardTypeId",
			uuidOrAbsent(searchParams.get("hazardTypeId")),
		),
		...withIfDefined(
			"hazardClusterId",
			uuidOrAbsent(searchParams.get("hazardClusterId")),
		),
		...withIfDefined(
			"specificHazardId",
			uuidOrAbsent(searchParams.get("specificHazardId")),
		),
		...withIfDefined("fromDate", dateOrAbsent(searchParams.get("fromDate"))),
		...withIfDefined("toDate", dateOrAbsent(searchParams.get("toDate"))),
		...withIfDefined(
			"recordingOrganization",
			searchParams.get("recordingOrganization")?.trim() || undefined,
		),
		...withIfDefined(
			"hazardousEventStatus",
			enumOrAbsent(
				searchParams.get("hazardousEventStatus"),
				HAZARDOUS_EVENT_STATUS_VALUES,
			),
		),
		...withIfDefined(
			"recordStatus",
			enumOrAbsent(searchParams.get("recordStatus"), STATUS_VALUES),
		),
		viewMyRecords: searchParams.get("viewMyRecords") === "on",
		pendingMyAction: searchParams.get("pendingMyAction") === "on",
	};
}
