import { describe, expect, it } from "vitest";
import { linkedEventSubtitle } from "./linkedEventSubtitle";

const labels = {
	hipLabel: "HIP",
	uuidLabel: "UUID",
	unresolvedEventLabel: "Hazardous event",
};

describe("linkedEventSubtitle", () => {
	describe("title", () => {
		it("prefers displayName when present", () => {
			const { title } = linkedEventSubtitle({
				specificHazardCode: null,
				description: "A flood description",
				displayName: "Flood",
				id: "11111111-2222-3333-4444-555555555555",
				...labels,
			});

			expect(title).toBe("Flood");
		});

		it("falls back to description when displayName is empty", () => {
			const { title } = linkedEventSubtitle({
				specificHazardCode: null,
				description: "A flood description",
				displayName: "",
				id: "11111111-2222-3333-4444-555555555555",
				...labels,
			});

			expect(title).toBe("A flood description");
		});

		it("falls back to the unresolved-event label plus the id's first 8 chars when both displayName and description are empty", () => {
			const { title } = linkedEventSubtitle({
				specificHazardCode: null,
				description: "",
				displayName: "",
				id: "11111111-2222-3333-4444-555555555555",
				...labels,
			});

			expect(title).toBe("Hazardous event: 11111111");
		});
	});

	describe("subtitle", () => {
		it("includes the HIP part when specificHazardCode is resolved", () => {
			const { subtitle } = linkedEventSubtitle({
				specificHazardCode: "MH0103",
				description: "",
				displayName: "Flood",
				id: "11111111-2222-3333-4444-555555555555",
				...labels,
			});

			expect(subtitle).toContain("HIP: MH0103");
		});

		it.each([null, ""])(
			"omits the HIP part when specificHazardCode is %p",
			(specificHazardCode) => {
				const { subtitle } = linkedEventSubtitle({
					specificHazardCode,
					description: "",
					displayName: "Flood",
					id: "11111111-2222-3333-4444-555555555555",
					...labels,
				});

				expect(subtitle).not.toContain("HIP");
			},
		);

		it("includes the description part when displayName is present (so description did not become the title)", () => {
			const { subtitle } = linkedEventSubtitle({
				specificHazardCode: null,
				description: "A flood description",
				displayName: "Flood",
				id: "11111111-2222-3333-4444-555555555555",
				...labels,
			});

			expect(subtitle).toContain("A flood description");
		});

		it("omits the description part when displayName is empty (description became the title instead)", () => {
			const { subtitle } = linkedEventSubtitle({
				specificHazardCode: null,
				description: "A flood description",
				displayName: "",
				id: "11111111-2222-3333-4444-555555555555",
				...labels,
			});

			expect(subtitle).not.toContain("A flood description");
		});

		it("always includes the UUID part with the id's first 8 characters", () => {
			const { subtitle } = linkedEventSubtitle({
				specificHazardCode: null,
				description: "",
				displayName: "Flood",
				id: "11111111-2222-3333-4444-555555555555",
				...labels,
			});

			expect(subtitle).toContain("UUID: 11111111");
		});

		it("joins present parts with ' • ', in HIP/description/UUID order", () => {
			const { subtitle } = linkedEventSubtitle({
				specificHazardCode: "MH0103",
				description: "A flood description",
				displayName: "Flood",
				id: "11111111-2222-3333-4444-555555555555",
				...labels,
			});

			expect(subtitle).toBe(
				"HIP: MH0103 • A flood description • UUID: 11111111",
			);
		});
	});
});
