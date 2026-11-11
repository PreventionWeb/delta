import { describe, expect, it } from "vitest";
import { ValidationError } from "~/shared/errors";
import type { HazardousEventAttachmentInput } from "../../application/dto/HazardousEventAttachmentInput";
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

	describe("attachments -- widget's real item shape (ca-shared-attachments-module)", () => {
		it("parses a File-type item whose file.name contains a /temp/ segment into a newFile attachment with its basename and content type", () => {
			const parsed = parseHazardousEventFormData(
				makeFormData({
					attachments: JSON.stringify([
						{
							id: "1700000000001",
							title: "Site photo",
							tag: null,
							file_option: "File",
							file: {
								name: "uploads/tenant-1/temp/11111111-1111-1111-1111-111111111111__photo.png",
								tenantPath: "tenant-1",
								content_type: "image/png",
							},
						},
					]),
				}),
			);

			expect(parsed.attachments).toEqual([
				{
					kind: "newFile",
					id: "1700000000001",
					title: "Site photo",
					tag: null,
					stagedFileName: "11111111-1111-1111-1111-111111111111__photo.png",
					contentType: "image/png",
				},
			] satisfies readonly HazardousEventAttachmentInput[]);
		});

		it("parses a File-type item whose file.name has no /temp/ segment into an existingFile attachment keyed by its basename", () => {
			const parsed = parseHazardousEventFormData(
				makeFormData({
					attachments: JSON.stringify([
						{
							id: "existing-1",
							title: "Report",
							tag: null,
							file_option: "File",
							file: {
								name: "uploads/tenant-1/hazardous-event/event-1/report.pdf",
								tenantPath: "tenant-1",
								content_type: "application/pdf",
							},
						},
					]),
				}),
			);

			expect(parsed.attachments).toEqual([
				{
					kind: "existingFile",
					id: "existing-1",
					title: "Report",
					tag: null,
					fileKey: "report.pdf",
				},
			] satisfies readonly HazardousEventAttachmentInput[]);
		});

		it("parses a Link-type item into a link attachment", () => {
			const parsed = parseHazardousEventFormData(
				makeFormData({
					attachments: JSON.stringify([
						{
							id: "link-1",
							title: "External reference",
							tag: null,
							file_option: "Link",
							url: "https://example.com/report",
						},
					]),
				}),
			);

			expect(parsed.attachments).toEqual([
				{
					kind: "link",
					id: "link-1",
					title: "External reference",
					tag: null,
					url: "https://example.com/report",
				},
			] satisfies readonly HazardousEventAttachmentInput[]);
		});

		it("parses a Link-type item with a stale leftover file value as a link attachment, with no leftover file data", () => {
			const parsed = parseHazardousEventFormData(
				makeFormData({
					attachments: JSON.stringify([
						{
							id: "link-2",
							title: "Switched from File",
							tag: null,
							file_option: "Link",
							url: "https://example.com/stale-switch",
							file: {
								name: "uploads/tenant-1/temp/22222222-2222-2222-2222-222222222222__stale.png",
								tenantPath: "tenant-1",
								content_type: "image/png",
							},
						},
					]),
				}),
			);

			expect(parsed.attachments).toEqual([
				{
					kind: "link",
					id: "link-2",
					title: "Switched from File",
					tag: null,
					url: "https://example.com/stale-switch",
				},
			] satisfies readonly HazardousEventAttachmentInput[]);
			expect(parsed.attachments[0]).not.toHaveProperty("stagedFileName");
			expect(parsed.attachments[0]).not.toHaveProperty("fileKey");
		});

		it("parses a File-type staged item with a stale leftover url value as a newFile attachment, with no url anywhere in the result", () => {
			const parsed = parseHazardousEventFormData(
				makeFormData({
					attachments: JSON.stringify([
						{
							id: "file-stale-url",
							title: "Switched from Link",
							tag: null,
							file_option: "File",
							url: "https://example.com/stale",
							file: {
								name: "uploads/tenant-1/temp/33333333-3333-3333-3333-333333333333__doc.pdf",
								tenantPath: "tenant-1",
								content_type: "application/pdf",
							},
						},
					]),
				}),
			);

			expect(parsed.attachments).toEqual([
				{
					kind: "newFile",
					id: "file-stale-url",
					title: "Switched from Link",
					tag: null,
					stagedFileName: "33333333-3333-3333-3333-333333333333__doc.pdf",
					contentType: "application/pdf",
				},
			] satisfies readonly HazardousEventAttachmentInput[]);
			expect(parsed.attachments[0]).not.toHaveProperty("url");
		});

		it("passes a populated tag array through unchanged, for both a Link item and a File item", () => {
			const tag = [
				{ id: "tag-1", name: "Flood" },
				{ id: "tag-2", name: "Urban" },
			];
			const parsed = parseHazardousEventFormData(
				makeFormData({
					attachments: JSON.stringify([
						{
							id: "link-tag",
							title: "Link with tags",
							tag,
							file_option: "Link",
							url: "https://example.com/tagged",
						},
						{
							id: "file-tag",
							title: "File with tags",
							tag,
							file_option: "File",
							file: {
								name: "uploads/tenant-1/temp/44444444-4444-4444-4444-444444444444__tagged.png",
								tenantPath: "tenant-1",
								content_type: "image/png",
							},
						},
					]),
				}),
			);

			expect(parsed.attachments[0]).toMatchObject({ tag });
			expect(parsed.attachments[1]).toMatchObject({ tag });
		});

		it("parses an absent or null tag as null", () => {
			const parsed = parseHazardousEventFormData(
				makeFormData({
					attachments: JSON.stringify([
						{
							id: "no-tag",
							title: "No tag field",
							file_option: "Link",
							url: "https://example.com/no-tag",
						},
						{
							id: "null-tag",
							title: "Null tag",
							tag: null,
							file_option: "Link",
							url: "https://example.com/null-tag",
						},
					]),
				}),
			);

			expect(parsed.attachments[0]?.tag).toBeNull();
			expect(parsed.attachments[1]?.tag).toBeNull();
		});

		it("parses and includes an item with a non-UUID client-supplied id (e.g. a millisecond timestamp)", () => {
			const parsed = parseHazardousEventFormData(
				makeFormData({
					attachments: JSON.stringify([
						{
							id: "1730000000000",
							title: "Timestamp id",
							tag: null,
							file_option: "Link",
							url: "https://example.com/timestamp-id",
						},
					]),
				}),
			);

			expect(parsed.attachments[0]?.id).toBe("1730000000000");
		});

		it("parses an empty-string attachments field to [], without throwing (matches today's existing absent-field short-circuit)", () => {
			const parsed = parseHazardousEventFormData(
				makeFormData({ attachments: "" }),
			);

			expect(parsed.attachments).toEqual([]);
		});

		it("throws ValidationError when the attachments field is not valid JSON (a dropped item now silently deletes that attachment's on-disk file on Update, so malformed input must fail loudly instead)", () => {
			expect(() =>
				parseHazardousEventFormData(makeFormData({ attachments: "not json" })),
			).toThrow(ValidationError);
		});

		it("throws ValidationError when the attachments field parses to a non-array value", () => {
			expect(() =>
				parseHazardousEventFormData(
					makeFormData({ attachments: JSON.stringify({ not: "an array" }) }),
				),
			).toThrow(ValidationError);
		});

		it("throws ValidationError when an item's file_option is neither File nor Link", () => {
			expect(() =>
				parseHazardousEventFormData(
					makeFormData({
						attachments: JSON.stringify([
							{
								id: "bad-option",
								title: "Bad option",
								tag: null,
								file_option: "Bogus",
							},
						]),
					}),
				),
			).toThrow(ValidationError);
		});

		it("throws ValidationError when a File-type item has no file object at all", () => {
			expect(() =>
				parseHazardousEventFormData(
					makeFormData({
						attachments: JSON.stringify([
							{
								id: "no-file",
								title: "Missing file",
								tag: null,
								file_option: "File",
							},
						]),
					}),
				),
			).toThrow(ValidationError);
		});

		it.each([
			["a number", { title: 123 }],
			["missing", {}],
		])(
			"throws ValidationError when title is %s instead of a string",
			(_label, titleOverride: Record<string, unknown>) => {
				expect(() =>
					parseHazardousEventFormData(
						makeFormData({
							attachments: JSON.stringify([
								{
									id: "bad-title",
									tag: null,
									file_option: "Link",
									url: "https://example.com/bad-title",
									...titleOverride,
								},
							]),
						}),
					),
				).toThrow(ValidationError);
			},
		);

		it("parses multiple valid items (Link, newFile, existingFile) together, each keeping its own id/title distinct (no key-swap, matching this file's own key-swap convention above)", () => {
			const parsed = parseHazardousEventFormData(
				makeFormData({
					attachments: JSON.stringify([
						{
							id: "multi-link",
							title: "v-multi-link-title",
							tag: null,
							file_option: "Link",
							url: "https://example.com/multi-link",
						},
						{
							id: "multi-new-file",
							title: "v-multi-new-file-title",
							tag: null,
							file_option: "File",
							file: {
								name: "uploads/tenant-1/temp/55555555-5555-5555-5555-555555555555__new.png",
								tenantPath: "tenant-1",
								content_type: "image/png",
							},
						},
						{
							id: "multi-existing-file",
							title: "v-multi-existing-file-title",
							tag: null,
							file_option: "File",
							file: {
								name: "uploads/tenant-1/hazardous-event/event-1/existing.pdf",
								tenantPath: "tenant-1",
								content_type: "application/pdf",
							},
						},
					]),
				}),
			);

			expect(parsed.attachments).toEqual([
				{
					kind: "link",
					id: "multi-link",
					title: "v-multi-link-title",
					tag: null,
					url: "https://example.com/multi-link",
				},
				{
					kind: "newFile",
					id: "multi-new-file",
					title: "v-multi-new-file-title",
					tag: null,
					stagedFileName: "55555555-5555-5555-5555-555555555555__new.png",
					contentType: "image/png",
				},
				{
					kind: "existingFile",
					id: "multi-existing-file",
					title: "v-multi-existing-file-title",
					tag: null,
					fileKey: "existing.pdf",
				},
			] satisfies readonly HazardousEventAttachmentInput[]);
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
