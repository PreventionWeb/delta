import { describe, expect, it } from "vitest";
import { hazardousEventLabel } from "~/frontend/events/hazardeventform";

describe("hazardousEventLabel", () => {
	it("uses the hazard code instead of the UUID fragment when available", () => {
		const label = hazardousEventLabel({
			id: "8b9faef8-6ef4-43c2-bac0-873946a21e41",
			description: "",
			hazard: {
				name: "Flood",
				code: "CH0201",
			},
		});

		expect(label).toBe("Flood CH0201");
		expect(label).not.toContain("8b9fa");
	});

	it("falls back to the UUID fragment when no hazard code, cluster name, or type name is available", () => {
		const label = hazardousEventLabel({
			id: "8b9faef8-6ef4-43c2-bac0-873946a21e41",
			description: "",
			hazard: {
				name: "Flood",
			},
		});

		expect(label).toBe("Flood 8b9fa");
	});

	it("uses the cluster name before the type name when hazard code is missing", () => {
		const clusterLabel = hazardousEventLabel({
			id: "8b9faef8-6ef4-43c2-bac0-873946a21e41",
			description: "",
			hipHazard: {
				name: "Flood",
			},
			clusterName: "Tropical cyclone",
			typeName: "Weather-related",
		});

		expect(clusterLabel).toBe("Flood Tropical cyclone");
		expect(clusterLabel).not.toContain("Weather-related");
	});

	it("uses the type name when cluster name is missing", () => {
		const typeLabel = hazardousEventLabel({
			id: "8b9faef8-6ef4-43c2-bac0-873946a21e41",
			description: "",
			hipHazard: {
				name: "Flood",
			},
			typeName: "Geophysical",
		});

		expect(typeLabel).toBe("Flood Geophysical");
	});

	it("uses raw hip cluster and type names from the edit form payload", () => {
		const label = hazardousEventLabel({
			id: "8b9faef8-6ef4-43c2-bac0-873946a21e41",
			description: "",
			hipHazard: {
				name: "Flood",
			},
			hipCluster: {
				name: "Hydrometeorological",
			},
			hipType: {
				name: "Weather-related",
			},
		});

		expect(label).toBe("Flood Hydrometeorological");
		expect(label).not.toContain("8b9fa");
		expect(label).not.toContain("Weather-related");
	});
});
