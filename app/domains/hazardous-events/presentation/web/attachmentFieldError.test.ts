import { describe, expect, it } from "vitest";
import type { HazardousEventAttachmentInput } from "../../application/dto/HazardousEventAttachmentInput";
import { attachmentFieldError } from "./attachmentFieldError";

const t = (key: string) => `t(${key})`;
const URL_ERROR = "t(hazardous-events:form.attachments_invalid_url)";
const TAG_ERROR = "t(hazardous-events:form.attachments_invalid_tag)";

type Tag = ReadonlyArray<{ id: string; name: string }> | null;

function link(url: string, tag: Tag = null): HazardousEventAttachmentInput {
	return { kind: "link", id: "1", title: "L", tag, url };
}

const existingFile: HazardousEventAttachmentInput = {
	kind: "existingFile",
	id: "2",
	title: "F",
	tag: null,
	fileKey: "javascript:alert(1)",
};

const newFile: HazardousEventAttachmentInput = {
	kind: "newFile",
	id: "3",
	title: "N",
	tag: [{ id: "t", name: "T" }],
	stagedFileName: "data:x",
	contentType: "text/plain",
};

function badTag(value: unknown): Tag {
	return value as Tag;
}

describe("attachmentFieldError (D12)", () => {
	it("returns null for no attachments", () => {
		expect(attachmentFieldError([], t)).toBeNull();
	});

	it("returns null for http and https links with valid tags", () => {
		expect(
			attachmentFieldError(
				[
					link("https://example.com/report", [{ id: "t", name: "T" }]),
					link("http://example.com"),
				],
				t,
			),
		).toBeNull();
	});

	it("ignores File item names, whatever they are", () => {
		expect(attachmentFieldError([existingFile, newFile], t)).toBeNull();
	});

	it.each([
		"javascript:alert(1)",
		"data:text/html,x",
		"ftp://example.com/f",
		"",
	])(
		"names the attachments field with the translated URL message for %j",
		(url) => {
			expect(
				attachmentFieldError([link("https://ok.example"), link(url)], t),
			).toStrictEqual({ attachments: [URL_ERROR] });
		},
	);

	it("reports one message however many links fail", () => {
		expect(
			attachmentFieldError([link("javascript:a"), link("data:b")], t),
		).toStrictEqual({ attachments: [URL_ERROR] });
	});

	it.each([
		["a null element", [null]],
		["a string element", ["Tag"]],
		["an object name", [{ id: "t", name: { en: "T" } }]],
	])(
		"names the attachments field with the translated tag message for %s, on any item kind",
		(_, tag) => {
			expect(
				attachmentFieldError([{ ...existingFile, tag: badTag(tag) }], t),
			).toStrictEqual({ attachments: [TAG_ERROR] });
		},
	);
});
