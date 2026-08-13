// Static mock fixture for the POC list route (openspec/changes/poc-react-aria-hazardous-event,
// design.md Decision 8). Replaces the live `hazardousEventsLoader` call — no DB read.
//
// Typed directly against the real loader's return shape via `import type` so this fixture is
// compile-time-checked to stay in sync with `hazardousEventsLoader` (no runtime import — the
// backend.server module is fully erased at build time).
import type { hazardousEventsLoader } from "~/backend.server/handlers/events/hazardevent";

export type HazardousEventsLoaderResult = Awaited<
	ReturnType<typeof hazardousEventsLoader>
>;

const baseFilters: HazardousEventsLoaderResult["filters"] = {
	hipHazardId: "",
	hipClusterId: "",
	hipTypeId: "",
	approvalStatus: "published",
	search: "",
	fromDate: "",
	toDate: "",
	recordingOrganization: "",
	hazardousEventStatus: "",
	recordStatus: "",
	viewMyRecords: false,
	pendingMyAction: false,
	userId: "fixture-user-id",
};

const hip: HazardousEventsLoaderResult["hip"] = {
	types: [
		{ id: "type-hydro", name: "Hydrological" },
		{ id: "type-meteo", name: "Meteorological" },
	],
	clusters: [
		{ id: "cluster-flood", typeId: "type-hydro", name: "Flood" },
		{ id: "cluster-storm", typeId: "type-meteo", name: "Storm" },
	],
	hazards: [
		{
			id: "hazard-riverine-flood",
			clusterId: "cluster-flood",
			name: "Riverine flood",
		},
		{
			id: "hazard-tropical-cyclone",
			clusterId: "cluster-storm",
			name: "Tropical cyclone",
		},
	],
};

const organizations: HazardousEventsLoaderResult["organizations"] = [
	{ id: "government", name: "Government Agency" },
	{ id: "ngo", name: "Non-Governmental Organization" },
	{ id: "private", name: "Private Sector" },
	{ id: "academic", name: "Academic Institution" },
	{ id: "international", name: "International Organization" },
	{ id: "other", name: "Other" },
];

type HazardousEventRow = HazardousEventsLoaderResult["data"]["items"][number];

const rows: HazardousEventRow[] = [
	{
		id: "3f6a1e2c-1a2b-4c3d-9e8f-1234567890ab",
		hipHazardId: "hazard-riverine-flood",
		hipClusterId: "cluster-flood",
		hipTypeId: "type-hydro",
		startDate: "2025-03-12",
		endDate: "2025-03-20",
		description:
			"Riverine flooding affecting low-lying districts along the main river basin.",
		approvalStatus: "published",
		createdAt: new Date("2025-03-13T09:15:00.000Z"),
		updatedAt: new Date("2025-03-22T14:30:00.000Z"),
		hipHazard: { name: "Riverine flood" },
		hipCluster: { name: "Flood" },
		hipType: { name: "Hydrological" },
	},
	{
		id: "5b8c2d4e-3f4a-4b5c-8d7e-2345678901bc",
		hipHazardId: "hazard-tropical-cyclone",
		hipClusterId: "cluster-storm",
		hipTypeId: "type-meteo",
		startDate: "2025-01-05",
		endDate: "2025-01-08",
		description:
			"Category 3 tropical cyclone making landfall near the eastern coastline.",
		approvalStatus: "validated",
		createdAt: new Date("2025-01-06T07:00:00.000Z"),
		updatedAt: new Date("2025-01-09T11:45:00.000Z"),
		hipHazard: { name: "Tropical cyclone" },
		hipCluster: { name: "Storm" },
		hipType: { name: "Meteorological" },
	},
	{
		id: "7c9d3e5f-4a5b-4c6d-9e8f-3456789012cd",
		hipHazardId: null,
		hipClusterId: "cluster-flood",
		hipTypeId: "type-hydro",
		startDate: "2024-11-18",
		endDate: "",
		description:
			"Flash flood warning issued for mountainous districts after heavy rainfall.",
		approvalStatus: "waiting-for-validation",
		createdAt: new Date("2024-11-18T18:20:00.000Z"),
		updatedAt: new Date("2024-11-19T08:10:00.000Z"),
		hipHazard: null,
		hipCluster: { name: "Flood" },
		hipType: { name: "Hydrological" },
	},
	{
		id: "9e1f4a6b-5c6d-4e7f-8a9b-4567890123de",
		hipHazardId: null,
		hipClusterId: null,
		hipTypeId: "type-meteo",
		startDate: "2024-09-02",
		endDate: "2024-09-04",
		description:
			"Severe thunderstorm system with damaging winds recorded in the capital region.",
		approvalStatus: "draft",
		createdAt: new Date("2024-09-02T12:00:00.000Z"),
		updatedAt: new Date("2024-09-02T12:00:00.000Z"),
		hipHazard: null,
		hipCluster: null,
		hipType: { name: "Meteorological" },
	},
	{
		id: "b2a5c7d9-6e7f-4a8b-9c0d-5678901234ef",
		hipHazardId: "hazard-riverine-flood",
		hipClusterId: "cluster-flood",
		hipTypeId: "type-hydro",
		startDate: "2024-06-10",
		endDate: "2024-06-15",
		description:
			"Prolonged riverine flooding following seasonal monsoon rains.",
		approvalStatus: "published",
		createdAt: new Date("2024-06-11T10:30:00.000Z"),
		updatedAt: new Date("2024-06-16T09:00:00.000Z"),
		hipHazard: { name: "Riverine flood" },
		hipCluster: { name: "Flood" },
		hipType: { name: "Hydrological" },
	},
	{
		id: "d4c7e9f1-7a8b-4c9d-9e0f-6789012345fa",
		hipHazardId: "hazard-tropical-cyclone",
		hipClusterId: "cluster-storm",
		hipTypeId: "type-meteo",
		startDate: "2024-02-22",
		endDate: "2024-02-25",
		description:
			"Tropical storm causing coastal erosion and localized power outages.",
		approvalStatus: "needs-revision",
		createdAt: new Date("2024-02-23T06:45:00.000Z"),
		updatedAt: new Date("2024-02-26T15:20:00.000Z"),
		hipHazard: { name: "Tropical cyclone" },
		hipCluster: { name: "Storm" },
		hipType: { name: "Meteorological" },
	},
];

/**
 * Additional hand-authored rows (task 2.7, design.md Decision 8 revised) bringing the populated
 * fixture to 25 rows total, so that a `pageSize` of 10 (see `listRowsFixture.data.pagination`
 * below) produces 3 real pages against `Pagination`'s fixed `[10, 20, 30, 40, 50]` size options —
 * enough to exercise real page-to-page navigation, not just a structurally-present control.
 * Cycles through the same hazard/cluster/type combinations and approval statuses as the 6
 * hand-authored rows above so the type→cluster→hazard linkage stays valid against the `hip`
 * fixture without inventing new, unlinked ids.
 */
const hazardCombinations: Array<
	Pick<
		HazardousEventRow,
		| "hipHazardId"
		| "hipClusterId"
		| "hipTypeId"
		| "hipHazard"
		| "hipCluster"
		| "hipType"
	>
> = [
	{
		hipHazardId: "hazard-riverine-flood",
		hipClusterId: "cluster-flood",
		hipTypeId: "type-hydro",
		hipHazard: { name: "Riverine flood" },
		hipCluster: { name: "Flood" },
		hipType: { name: "Hydrological" },
	},
	{
		hipHazardId: "hazard-tropical-cyclone",
		hipClusterId: "cluster-storm",
		hipTypeId: "type-meteo",
		hipHazard: { name: "Tropical cyclone" },
		hipCluster: { name: "Storm" },
		hipType: { name: "Meteorological" },
	},
	{
		hipHazardId: null,
		hipClusterId: "cluster-flood",
		hipTypeId: "type-hydro",
		hipHazard: null,
		hipCluster: { name: "Flood" },
		hipType: { name: "Hydrological" },
	},
	{
		hipHazardId: null,
		hipClusterId: null,
		hipTypeId: "type-meteo",
		hipHazard: null,
		hipCluster: null,
		hipType: { name: "Meteorological" },
	},
];

const approvalStatusCycle = [
	"published",
	"validated",
	"waiting-for-validation",
	"draft",
	"needs-revision",
] as const;

/**
 * Deterministic uuid-shaped id, unique per row. The table's UUID column (`_index.tsx`) only ever
 * displays `id.slice(0, 5)` (matching production's identical truncation) — a naive incrementing
 * suffix (e.g. `...-000000000007`) would make every generated row look identical in that column
 * ("a0000"), which would make the pagination click-through (task 2.11) visually unconvincing even
 * though the underlying rows differ. A multiplicative hash spreads `n` across the leading hex
 * digits instead, so each row's truncated UUID is visibly distinct.
 */
function fixtureId(n: number): string {
	const hex = ((n * 2654435761) >>> 0).toString(16).padStart(8, "0");
	return `${hex}-0000-4000-8000-${n.toString().padStart(12, "0")}`;
}

const additionalRows: HazardousEventRow[] = Array.from(
	{ length: 19 },
	(_, i) => {
		const n = i + 7; // continues numbering after the 6 hand-authored rows above
		const combo = hazardCombinations[i % hazardCombinations.length];
		const status = approvalStatusCycle[i % approvalStatusCycle.length];
		// Walk dates backwards from the earliest hand-authored row so the fixture reads as a
		// plausible historical list (newest first isn't required — sort order isn't a feature under
		// test here).
		const created = new Date(
			Date.UTC(2023, 11 - (n % 12), 1 + (n % 27), 8, 0, 0),
		);
		const updated = new Date(created.getTime() + 2 * 24 * 60 * 60 * 1000);

		return {
			id: fixtureId(n),
			...combo,
			startDate: created.toISOString().slice(0, 10),
			endDate: updated.toISOString().slice(0, 10),
			description: `Fixture hazardous event #${n}, generated for pagination testing.`,
			approvalStatus: status,
			createdAt: created,
			updatedAt: updated,
		};
	},
);

/**
 * Populated fixture — 25 rows total (6 hand-authored above + 19 generated), enough to exercise
 * pagination and multi-hazard rendering. `pagination.pageSize: 10` (task 2.7's recommended
 * option) gives 3 real pages against `Pagination`'s fixed size options; the loader (`_index.tsx`)
 * recomputes `totalItems`/`itemsOnThisPage`/`page`/`pageSize` per request from `data.items` below
 * rather than trusting these pagination values verbatim — they only serve as the no-query-params
 * default (page 1, pageSize 10).
 */
export const listRowsFixture: HazardousEventsLoaderResult = {
	isPublic: true,
	filters: baseFilters,
	hip,
	data: {
		items: [...rows, ...additionalRows],
		pagination: {
			totalItems: rows.length + additionalRows.length,
			itemsOnThisPage: rows.length + additionalRows.length,
			page: 1,
			pageSize: 10,
			extraParams: {},
		},
	},
	countryAccountsId: "fixture-country-accounts-id",
	organizations,
};

/** Empty-result variant — exercises the "No records found" path in HazardousEventListPage. */
export const listRowsEmptyFixture: HazardousEventsLoaderResult = {
	isPublic: true,
	filters: baseFilters,
	hip,
	data: {
		items: [],
		pagination: {
			totalItems: 0,
			itemsOnThisPage: 0,
			page: 1,
			pageSize: 50,
			extraParams: {},
		},
	},
	countryAccountsId: "fixture-country-accounts-id",
	organizations,
};
