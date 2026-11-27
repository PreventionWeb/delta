import { describe, expect, it } from "vitest";
import {
	isAllowedAttachmentTag,
	isAllowedAttachmentUrl,
} from "./attachmentInputPolicy";

describe("isAllowedAttachmentUrl (D12)", () => {
	it.each([
		"http://example.com",
		"https://example.com/a?b=c#d",
		"HTTPS://EXAMPLE.COM/A",
		"Http://example.com",
		"  https://example.com  ",
	])("accepts %s", (url) => {
		expect(isAllowedAttachmentUrl(url)).toBe(true);
	});

	it.each([
		"javascript:alert(1)",
		"JavaScript:alert(1)",
		"data:text/html,<b>x</b>",
		"ftp://example.com/f",
		"mailto:a@example.com",
		"file:///etc/passwd",
		"/relative/path",
		"example.com",
		"//example.com",
		"",
		"   ",
		"http://",
		"https://exa mple.com",
	])("rejects %j", (url) => {
		expect(isAllowedAttachmentUrl(url)).toBe(false);
	});
});

describe("isAllowedAttachmentTag", () => {
	it.each([
		["null", null],
		["an empty list", []],
		[
			"id/name string pairs",
			[
				{ id: "t", name: "Tag" },
				{ id: "", name: "" },
			],
		],
		["pairs with extra keys", [{ id: "t", name: "Tag", extra: 1 }]],
	])("accepts %s", (_, tag) => {
		expect(isAllowedAttachmentTag(tag)).toBe(true);
	});

	it.each([
		["undefined", undefined],
		["a string", "Tag"],
		["an object", { id: "t", name: "Tag" }],
		["a null element", [null]],
		["a string element", ["Tag"]],
		["a nested list", [[{ id: "t", name: "Tag" }]]],
		["a numeric id", [{ id: 1, name: "Tag" }]],
		["an object name", [{ id: "t", name: { en: "Tag" } }]],
		["a missing name", [{ id: "t" }]],
	])("rejects %s", (_, tag) => {
		expect(isAllowedAttachmentTag(tag)).toBe(false);
	});
});
