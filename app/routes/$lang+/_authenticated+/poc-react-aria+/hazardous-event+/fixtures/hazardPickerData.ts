// Static mock fixture for the POC create route (openspec/changes/poc-react-aria-hazardous-event,
// design.md Decision 8). Replaces the live `dataForHazardPicker` DB call — no DB read. Backs the
// stubbed inline hazard-classification picker (design.md Decision 3, `HazardPicker` row).
//
// Typed against the real `HipDataForHazardPicker` shape via `import type` so this fixture is
// compile-time-checked to stay in sync. The type→cluster→hazard parent-id linkage is preserved
// (each cluster's `typeId` and each hazard's `clusterId` point at a real id in this same fixture)
// so cascade-filtering UI built against it behaves correctly.
//
// Intentionally duplicated (not shared/imported) from the list route's identical fixture — each
// isolated route's fixtures/ folder is self-contained so the whole POC route tree stays deletable
// as one unit (design.md Decision 8's "co-located under the POC's own isolated route tree").
import type { HipDataForHazardPicker } from "~/backend.server/models/hip_hazard_picker";

export const hazardPickerDataFixture: HipDataForHazardPicker = {
	types: [
		{ id: "type-hydro", name: "Hydrological" },
		{ id: "type-meteo", name: "Meteorological" },
		{ id: "type-geo", name: "Geophysical" },
	],
	clusters: [
		{ id: "cluster-flood", typeId: "type-hydro", name: "Flood" },
		{ id: "cluster-drought", typeId: "type-hydro", name: "Drought" },
		{ id: "cluster-storm", typeId: "type-meteo", name: "Storm" },
		{
			id: "cluster-extreme-temp",
			typeId: "type-meteo",
			name: "Extreme temperature",
		},
		{ id: "cluster-earthquake", typeId: "type-geo", name: "Earthquake" },
	],
	hazards: [
		{
			id: "hazard-riverine-flood",
			clusterId: "cluster-flood",
			name: "Riverine flood",
		},
		{
			id: "hazard-flash-flood",
			clusterId: "cluster-flood",
			name: "Flash flood",
		},
		{
			id: "hazard-coastal-flood",
			clusterId: "cluster-flood",
			name: "Coastal flood",
		},
		{
			id: "hazard-agricultural-drought",
			clusterId: "cluster-drought",
			name: "Agricultural drought",
		},
		{
			id: "hazard-tropical-cyclone",
			clusterId: "cluster-storm",
			name: "Tropical cyclone",
		},
		{
			id: "hazard-severe-thunderstorm",
			clusterId: "cluster-storm",
			name: "Severe thunderstorm",
		},
		{
			id: "hazard-heatwave",
			clusterId: "cluster-extreme-temp",
			name: "Heatwave",
		},
		{
			id: "hazard-ground-shaking",
			clusterId: "cluster-earthquake",
			name: "Ground shaking",
		},
	],
};
