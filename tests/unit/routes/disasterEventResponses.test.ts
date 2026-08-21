import { describe, expect, it } from "vitest";
import {
	normalizeResponsePayload,
	normalizeResponseAttachmentPayload,
} from "~/routes/$lang+/api+/disaster-event+/responses+/response_api.server";

describe("normalizeResponsePayload", () => {
	it("accepts a response type id or name and trims the payload", () => {
		expect(
			normalizeResponsePayload({
				responseTypeId: " abc ",
				responseType: " Relief ",
				coverage: " 50% ",
				description: "  Flood response  ",
			}),
		).toMatchObject({
			responseTypeId: "abc",
			responseType: "Relief",
			coverage: "50%",
			description: "Flood response",
		});
	});

	it("rejects a payload without a response type reference", () => {
		expect(() =>
			normalizeResponsePayload({
				coverage: "50%",
			}),
		).toThrow(/responseTypeId or responseType is required/i);
	});
});

describe("normalizeResponseAttachmentPayload", () => {
	it("accepts a valid attachment payload", () => {
		expect(
			normalizeResponseAttachmentPayload({
				title: " report ",
				fileKey: "/uploads/tenant-1/report.pdf",
				fileName: "report.pdf",
				fileType: "application/pdf",
				fileSize: 123,
			}),
		).toMatchObject({
			title: "report",
			fileKey: "/uploads/tenant-1/report.pdf",
			fileName: "report.pdf",
			fileType: "application/pdf",
			fileSize: 123,
		});
	});

	it("rejects attachments that are missing required metadata", () => {
		expect(() =>
			normalizeResponseAttachmentPayload({
				title: "report",
				fileKey: "",
				fileName: "",
			}),
		).toThrow(/title, fileKey and fileName are required/i);
	});
});
