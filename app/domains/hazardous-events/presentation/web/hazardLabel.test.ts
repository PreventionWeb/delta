import { describe, expect, it } from "vitest";
import { hazardLabel } from "./hazardLabel";

describe("hazardLabel", () => {
	it("prefers specificHazardLocalName when present, not flagged as a fallback", () => {
		expect(
			hazardLabel({
				specificHazardLocalName: "Local",
				specificHazardNationalName: "National",
				specificHazardName: "Drought",
				specificHazardId: "raw-id",
			}),
		).toEqual({ text: "Local", isFallback: false });
	});

	it("falls back to specificHazardNationalName when local is null, not flagged as a fallback", () => {
		expect(
			hazardLabel({
				specificHazardLocalName: null,
				specificHazardNationalName: "National",
				specificHazardName: "Drought",
				specificHazardId: "raw-id",
			}),
		).toEqual({ text: "National", isFallback: false });
	});

	it("falls back to the resolved taxonomy name when both override names are null, not flagged as a fallback", () => {
		expect(
			hazardLabel({
				specificHazardLocalName: null,
				specificHazardNationalName: null,
				specificHazardName: "Drought",
				specificHazardId: "raw-id",
			}),
		).toEqual({ text: "Drought", isFallback: false });
	});

	it("falls back to the raw specificHazardId only when no name resolves at all, flagged as a fallback", () => {
		expect(
			hazardLabel({
				specificHazardLocalName: null,
				specificHazardNationalName: null,
				specificHazardName: null,
				specificHazardId: "raw-id",
			}),
		).toEqual({ text: "raw-id", isFallback: true });
	});
});
