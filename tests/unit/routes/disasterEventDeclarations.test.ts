import { describe, expect, it } from "vitest";
import {
	normalizeDeclarationAttachmentPayload,
	normalizeDeclarationPayload,
} from "~/routes/$lang+/api+/disaster-event+/declarations+/declaration_api.server";

describe("normalizeDeclarationPayload", () => {
	it("trims declaration fields and keeps valid declarationDate", () => {
		expect(
			normalizeDeclarationPayload({
				type: " Emergency ",
				effects: " Flood impact ",
				declarationDate: "2026-01-15",
				issuingOrganization: " Civil Protection ",
				coverage: " National ",
				declarationStatusId: " abc ",
				declarationStatus: " Active ",
			}),
		).toMatchObject({
			type: "Emergency",
			effects: "Flood impact",
			issuingOrganization: "Civil Protection",
			coverage: "National",
			declarationStatusId: "abc",
			declarationStatus: "Active",
		});
	});

	it("normalizes invalid declarationDate to null", () => {
		expect(
			normalizeDeclarationPayload({
				declarationDate: "invalid-date",
			}),
		).toMatchObject({
			declarationDate: null,
		});
	});
});

describe("normalizeDeclarationAttachmentPayload", () => {
	it("accepts a valid declaration attachment payload", () => {
		expect(
			normalizeDeclarationAttachmentPayload({
				title: " declaration ",
				fileKey: "/uploads/tenant-1/declaration.pdf",
				fileName: "declaration.pdf",
				fileType: "application/pdf",
				fileSize: 123,
			}),
		).toMatchObject({
			title: "declaration",
			fileKey: "/uploads/tenant-1/declaration.pdf",
			fileName: "declaration.pdf",
			fileType: "application/pdf",
			fileSize: 123,
		});
	});

	it("rejects attachments that are missing required metadata", () => {
		expect(() =>
			normalizeDeclarationAttachmentPayload({
				title: "declaration",
				fileKey: "",
				fileName: "",
			}),
		).toThrow(/title, fileKey and fileName are required/i);
	});
});
