// Static mock fixture for the POC create route (openspec/changes/poc-react-aria-hazardous-event,
// design.md Decision 8). Replaces the inline top-level-divisions-with-geojson query in production
// `new.tsx` (`divisionTable` filtered by `parentId IS NULL`, `geojson IS NOT NULL`, tenant
// `countryAccountsId`) — no DB read. Consumed by `SpatialFootprintFormView` (reused unchanged,
// design.md Decision 3).
//
// Typed via `Pick<SelectDivision, ...>` against the real `divisionTable` schema so this fixture
// stays shaped like the real query's selected columns. Exact geographic accuracy doesn't matter
// for this spike — a small number of real-shaped polygons is enough for the map widget to render
// something visually plausible.
import type { SelectDivision } from "~/drizzle/schema/divisionTable";

export type DivisionGeoJsonRow = Pick<
	SelectDivision,
	"id" | "name" | "geojson"
>;

export const divisionGeoJsonFixture: DivisionGeoJsonRow[] = [
	{
		id: "c0a1b2d3-2222-4e5f-9a1b-200000000001",
		name: { en: "Northern Province", fr: "Province du Nord" },
		geojson: {
			type: "Feature",
			properties: { name: "Northern Province" },
			geometry: {
				type: "Polygon",
				coordinates: [
					[
						[34.0, 1.0],
						[35.0, 1.0],
						[35.0, 2.0],
						[34.0, 2.0],
						[34.0, 1.0],
					],
				],
			},
		},
	},
	{
		id: "c0a1b2d3-2222-4e5f-9a1b-200000000002",
		name: { en: "Coastal Province", fr: "Province côtière" },
		geojson: {
			type: "Feature",
			properties: { name: "Coastal Province" },
			geometry: {
				type: "Polygon",
				coordinates: [
					[
						[35.0, -1.0],
						[36.2, -1.0],
						[36.2, 0.2],
						[35.0, 0.2],
						[35.0, -1.0],
					],
				],
			},
		},
	},
	{
		id: "c0a1b2d3-2222-4e5f-9a1b-200000000003",
		name: { en: "Central Province", fr: "Province centrale" },
		geojson: {
			type: "Feature",
			properties: { name: "Central Province" },
			geometry: {
				type: "Polygon",
				coordinates: [
					[
						[34.6, -0.4],
						[35.4, -0.4],
						[35.4, 0.4],
						[34.6, 0.4],
						[34.6, -0.4],
					],
				],
			},
		},
	},
];
