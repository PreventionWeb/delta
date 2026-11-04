import { describe, expect, it } from "vitest";
import { parseHazardousEventFormData } from "./parseHazardousEventFormData.server";

function makeFormData(fields: Record<string, string>): FormData {
	const formData = new FormData();
	for (const [key, value] of Object.entries(fields)) {
		formData.set(key, value);
	}
	return formData;
}

describe("parseHazardousEventFormData", () => {
	it("defaults every string field to '' and every nullable field to null when absent", () => {
		const parsed = parseHazardousEventFormData(makeFormData({}));

		expect(parsed.specificHazardId).toBe("");
		expect(parsed.startDate).toBe("");
		expect(parsed.hazardousEventStatus).toBeNull();
		expect(parsed.specificHazardLocalName).toBeNull();
		expect(parsed.causeId).toBeUndefined();
		expect(parsed.causeIdChanged).toBe(false);
		expect(parsed.spatialObservation).toBeUndefined();
		expect(parsed.spatialObservationChanged).toBe(false);
		expect(parsed.attachments).toEqual([]);
		expect(parsed.tempAction).toBeNull();
		expect(parsed.validatorUserIds).toEqual([]);
	});

	it("parses every simple string/nullable field to its own distinct value, not a neighbor's (test-quality-auditor finding -- proves no key-swap bug)", () => {
		const parsed = parseHazardousEventFormData(
			makeFormData({
				specificHazardId: "v-specificHazardId",
				startDate: "v-startDate",
				endDate: "v-endDate",
				nationalSpecification: "v-nationalSpecification",
				description: "v-description",
				chainsExplanation: "v-chainsExplanation",
				magnitude: "v-magnitude",
				recordOriginator: "v-recordOriginator",
				dataSource: "v-dataSource",
				specificHazardLocalName: "v-specificHazardLocalName",
				specificHazardNationalName: "v-specificHazardNationalName",
				causeId: "v-causeId",
				causalityExplanation: "v-causalityExplanation",
			}),
		);

		expect(parsed.specificHazardId).toBe("v-specificHazardId");
		expect(parsed.startDate).toBe("v-startDate");
		expect(parsed.endDate).toBe("v-endDate");
		expect(parsed.nationalSpecification).toBe("v-nationalSpecification");
		expect(parsed.description).toBe("v-description");
		expect(parsed.chainsExplanation).toBe("v-chainsExplanation");
		expect(parsed.magnitude).toBe("v-magnitude");
		expect(parsed.recordOriginator).toBe("v-recordOriginator");
		expect(parsed.dataSource).toBe("v-dataSource");
		expect(parsed.specificHazardLocalName).toBe("v-specificHazardLocalName");
		expect(parsed.specificHazardNationalName).toBe(
			"v-specificHazardNationalName",
		);
		expect(parsed.causeId).toBe("v-causeId");
		expect(parsed.causalityExplanation).toBe("v-causalityExplanation");
	});

	it("spatialObservationChanged is true only when its own hidden field is exactly '1' (test-quality-auditor finding -- same key-name risk as causeIdChanged)", () => {
		expect(
			parseHazardousEventFormData(
				makeFormData({ spatialObservationChanged: "1" }),
			).spatialObservationChanged,
		).toBe(true);
		expect(
			parseHazardousEventFormData(
				makeFormData({ spatialObservationChanged: "true" }),
			).spatialObservationChanged,
		).toBe(false);
	});

	it("parses tempValidatorUserIds as a comma-separated, trimmed, non-empty-filtered list", () => {
		const parsed = parseHazardousEventFormData(
			makeFormData({ tempValidatorUserIds: " v1, v2 ,,v3 " }),
		);

		expect(parsed.validatorUserIds).toEqual(["v1", "v2", "v3"]);
	});

	it("causeIdChanged is true only when the hidden field is exactly '1'", () => {
		expect(
			parseHazardousEventFormData(makeFormData({ causeIdChanged: "1" }))
				.causeIdChanged,
		).toBe(true);
		expect(
			parseHazardousEventFormData(makeFormData({ causeIdChanged: "true" }))
				.causeIdChanged,
		).toBe(false);
	});

	it("parses a well-formed spatialObservation JSON payload", () => {
		const parsed = parseHazardousEventFormData(
			makeFormData({
				spatialObservation: JSON.stringify({
					geometries: [{ type: "Point" }],
					divisionIds: ["div-1", 42, "div-2"],
				}),
			}),
		);

		expect(parsed.spatialObservation).toEqual({
			geometries: [{ type: "Point" }],
			divisionIds: ["div-1", "div-2"],
		});
	});

	it("falls back to undefined for malformed spatialObservation JSON, without throwing", () => {
		const parsed = parseHazardousEventFormData(
			makeFormData({ spatialObservation: "{not json" }),
		);

		expect(parsed.spatialObservation).toBeUndefined();
	});

	it("parses a well-formed attachments JSON payload, filtering out malformed entries", () => {
		const validAttachment = {
			id: "a1",
			title: "Photo",
			fileKey: "key-1",
			fileName: "photo.png",
			fileType: "image/png",
			fileSize: 1024,
		};
		const parsed = parseHazardousEventFormData(
			makeFormData({
				attachments: JSON.stringify([validAttachment, { id: "bad" }, null]),
			}),
		);

		expect(parsed.attachments).toEqual([validAttachment]);
	});

	it("defaults attachments to [] for malformed JSON, without throwing", () => {
		const parsed = parseHazardousEventFormData(
			makeFormData({ attachments: "not json" }),
		);

		expect(parsed.attachments).toEqual([]);
	});

	describe("isAttachmentProps rejects an entry invalid in exactly one field (test-quality-auditor finding -- the prior single fixture only exercised the last check in the chain)", () => {
		const validAttachment = {
			id: "a1",
			title: "Photo",
			fileKey: "key-1",
			fileName: "photo.png",
			fileType: "image/png",
			fileSize: 1024,
		};

		it.each([
			["id", { ...validAttachment, id: 123 }],
			["title", { ...validAttachment, title: 123 }],
			["fileKey", { ...validAttachment, fileKey: 123 }],
			["fileName", { ...validAttachment, fileName: 123 }],
			["fileType", { ...validAttachment, fileType: 123 }],
			["fileSize", { ...validAttachment, fileSize: "1024" }],
		])("rejects when %s has the wrong type", (_field, malformed) => {
			const parsed = parseHazardousEventFormData(
				makeFormData({ attachments: JSON.stringify([malformed]) }),
			);

			expect(parsed.attachments).toEqual([]);
		});

		it("rejects a non-object array entry (e.g. a bare string)", () => {
			const parsed = parseHazardousEventFormData(
				makeFormData({ attachments: JSON.stringify(["not-an-object"]) }),
			);

			expect(parsed.attachments).toEqual([]);
		});
	});

	it("falls back to empty arrays when spatialObservation parses but geometries/divisionIds aren't arrays (test-quality-auditor finding)", () => {
		const parsed = parseHazardousEventFormData(
			makeFormData({
				spatialObservation: JSON.stringify({
					geometries: "oops",
					divisionIds: "also-not-array",
				}),
			}),
		);

		expect(parsed.spatialObservation).toEqual({
			geometries: [],
			divisionIds: [],
		});
	});
});
