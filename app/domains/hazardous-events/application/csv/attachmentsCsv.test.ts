import { describe, expect, it } from "vitest";
import {
	attachmentsEqual,
	formatAttachmentsCell,
	formatLegacyAttachmentsCell,
	parseAttachmentsCell,
	toAttachmentInputs,
	type CsvAttachmentItem,
} from "./attachmentsCsv";
import type { HazardousEventExportAttachment } from "../dto/HazardousEventExportRow";

const TENANT = "50c88fb1-0000-4000-8000-000000000001";
const EVENT = "44444444-4444-4444-8444-444444444444";
const TAG = [{ id: "t", name: "Tag" }];

function cell(items: unknown): string {
	return JSON.stringify(items);
}

function items(raw: string): CsvAttachmentItem[] {
	const result = parseAttachmentsCell(raw);
	if (!result.ok) {
		throw new Error(`expected a parse, got ${JSON.stringify(result)}`);
	}
	return result.items;
}

function link(url: string, extra: Record<string, unknown> = {}) {
	return {
		id: "1",
		title: "Report",
		tag: TAG,
		file_option: "Link",
		url,
		...extra,
	};
}

function file(name: string, extra: Record<string, unknown> = {}) {
	return {
		id: "2",
		title: "Scan",
		tag: null,
		file_option: "File",
		file: { name, content_type: "application/pdf" },
		...extra,
	};
}

describe("parseAttachmentsCell (D5, OD-3)", () => {
	it("parses a Link item and drops its id", () => {
		expect(items(cell([link("https://example.com/a")]))).toStrictEqual([
			{ type: "Link", title: "Report", tag: TAG, url: "https://example.com/a" },
		]);
	});

	it("keeps a Link with a missing url as an empty url for the URL rule to reject", () => {
		expect(items(cell([{ title: "x", file_option: "Link" }]))).toStrictEqual([
			{ type: "Link", title: "x", tag: null, url: "" },
		]);
	});

	it("takes a File item's key from the basename of file.name only", () => {
		expect(
			items(
				cell([
					file("/uploads/tenant-other/hazardous-event/E9/k.pdf", {
						file: {
							name: "/uploads/tenant-other/hazardous-event/E9/k.pdf",
							tenantPath: "uploads/tenant-other",
							content_type: "text/html",
						},
					}),
				]),
			),
		).toStrictEqual([
			{
				type: "File",
				title: "Scan",
				tag: null,
				fileKey: "k.pdf",
				staged: false,
			},
		]);
	});

	it("marks a file.name with a temp segment as staged, either separator", () => {
		expect(items(cell([file("/uploads/temp/report.pdf")]))[0]).toMatchObject({
			fileKey: "report.pdf",
			staged: true,
		});
		expect(items(cell([file("uploads\\temp\\r.pdf")]))[0]).toMatchObject({
			fileKey: "r.pdf",
			staged: true,
		});
		expect(items(cell([file("/uploads/temporary/r.pdf")]))[0]).toMatchObject({
			staged: false,
		});
	});

	it("normalises a non-array tag to null", () => {
		expect(
			items(cell([link("https://a.example", { tag: "x" })]))[0],
		).toMatchObject({
			tag: null,
		});
		expect(
			items(cell([link("https://a.example", { tag: undefined })]))[0],
		).toMatchObject({
			tag: null,
		});
	});

	it("parses [] to no items", () => {
		expect(items("[]")).toStrictEqual([]);
	});

	it("reports unparseable JSON as a syntax error", () => {
		expect(parseAttachmentsCell("{bad")).toStrictEqual({
			ok: false,
			syntax: true,
		});
	});

	it.each([
		["A4: an object", cell({ title: "x" })],
		["null", "null"],
		["a non-object item", cell(["x"])],
		["a null item", cell([null])],
		["a non-string title", cell([{ ...link("https://a.example"), title: 3 }])],
		[
			"a missing title",
			cell([{ file_option: "Link", url: "https://a.example" }]),
		],
		[
			"A7: a missing file_option",
			cell([{ title: "x", url: "https://a.example" }]),
		],
		["an unknown file_option", cell([{ title: "x", file_option: "Video" }])],
		["a File item without file", cell([{ title: "x", file_option: "File" }])],
		[
			"a File item without file.name",
			cell([{ title: "x", file_option: "File", file: {} }]),
		],
		[
			"a File item whose name is not a string",
			cell([{ title: "x", file_option: "File", file: { name: 1 } }]),
		],
		["a File item whose name is empty", cell([file("")])],
		["a File item whose basename is ..", cell([file("/uploads/..")])],
		["a File item naming a reserved device", cell([file("/uploads/NUL.txt")])],
		["a File item with a NUL byte", cell([file("a\u0000b.pdf")])],
	])("rejects %s as content", (_, raw) => {
		expect(parseAttachmentsCell(raw)).toStrictEqual({
			ok: false,
			syntax: false,
		});
	});
});

describe("toAttachmentInputs (D5, D12)", () => {
	const none = new Set<string>();

	it.each([
		"https://example.com/a",
		"http://example.com",
		"HTTPS://EXAMPLE.COM",
	])("accepts the Link %s", (url) => {
		expect(toAttachmentInputs(items(cell([link(url)])), none)).toStrictEqual({
			ok: true,
			inputs: [{ id: "", title: "Report", tag: TAG, kind: "link", url }],
		});
	});

	it.each([
		"javascript:alert(1)",
		"data:text/html,<b>x</b>",
		"ftp://example.com/f",
		"/relative",
	])("rejects the Link %j with invalid_attachment_url, echoing it", (url) => {
		expect(toAttachmentInputs(items(cell([link(url)])), none)).toStrictEqual({
			ok: false,
			code: "invalid_attachment_url",
			value: url,
		});
	});

	it("accepts a File item naming a key the event holds, as an existing file", () => {
		expect(
			toAttachmentInputs(
				items(cell([file("/uploads/tenant-x/hazardous-event/E/k.pdf")])),
				new Set(["k.pdf"]),
			),
		).toStrictEqual({
			ok: true,
			inputs: [
				{
					id: "",
					title: "Scan",
					tag: null,
					kind: "existingFile",
					fileKey: "k.pdf",
				},
			],
		});
	});

	it("rejects a File item naming a key the event does not hold", () => {
		expect(
			toAttachmentInputs(
				items(cell([file("/x/other.pdf")])),
				new Set(["k.pdf"]),
			),
		).toStrictEqual({
			ok: false,
			code: "file_reference_not_supported",
			value: "other.pdf",
		});
	});

	it("rejects every File item on the create path (no held keys)", () => {
		expect(
			toAttachmentInputs(items(cell([file("/x/k.pdf")])), none),
		).toMatchObject({
			ok: false,
			code: "file_reference_not_supported",
			value: "k.pdf",
		});
	});

	it("rejects a staged temp file even when its basename matches a held key", () => {
		expect(
			toAttachmentInputs(
				items(cell([file("/uploads/temp/k.pdf")])),
				new Set(["k.pdf"]),
			),
		).toStrictEqual({
			ok: false,
			code: "file_reference_not_supported",
			value: "k.pdf",
		});
	});

	it("ignores the directory part of file.name when matching", () => {
		expect(
			toAttachmentInputs(
				items(cell([file("/uploads/tenant-OTHER/hazardous-event/E2/k.pdf")])),
				new Set(["k.pdf"]),
			),
		).toMatchObject({ ok: true });
	});

	it("reports the first failing item and builds every input otherwise", () => {
		const mixed = items(
			cell([link("https://a.example"), file("/x/k.pdf"), link("javascript:x")]),
		);
		expect(toAttachmentInputs(mixed, new Set(["k.pdf"]))).toMatchObject({
			ok: false,
			code: "invalid_attachment_url",
		});
		expect(
			toAttachmentInputs(mixed.slice(0, 2), new Set(["k.pdf"])),
		).toMatchObject({
			ok: true,
			inputs: [{ kind: "link" }, { kind: "existingFile" }],
		});
	});

	it("never produces a newFile input", () => {
		const result = toAttachmentInputs(
			items(cell([link("https://a.example"), file("/x/k.pdf")])),
			new Set(["k.pdf"]),
		);
		expect(result.ok && result.inputs.map((i) => i.kind)).toStrictEqual([
			"link",
			"existingFile",
		]);
	});
});

describe("formatAttachmentsCell (D8)", () => {
	const linkRow: HazardousEventExportAttachment = {
		type: "Link",
		title: "Report",
		url: "https://example.com/a",
		tag: TAG,
		fileKey: null,
		fileType: null,
	};
	const fileRow: HazardousEventExportAttachment = {
		type: "File",
		title: "Scan",
		url: null,
		tag: null,
		fileKey: "k.pdf",
		fileType: "application/pdf",
	};

	it("writes the legacy item shape with no tenantPath", () => {
		expect(
			JSON.parse(
				formatAttachmentsCell([fileRow, linkRow], {
					tenantId: TENANT,
					eventId: EVENT,
				}),
			),
		).toStrictEqual([
			{
				title: "Scan",
				tag: null,
				file_option: "File",
				file: {
					name: `/uploads/tenant-${TENANT}/hazardous-event/${EVENT}/k.pdf`,
					content_type: "application/pdf",
				},
			},
			{
				title: "Report",
				tag: TAG,
				file_option: "Link",
				url: "https://example.com/a",
			},
		]);
	});

	it("writes [] when there are no attachments", () => {
		expect(
			formatAttachmentsCell([], { tenantId: TENANT, eventId: EVENT }),
		).toBe("[]");
	});

	it("orders items by file_option, title, then url or file name", () => {
		const b = { ...linkRow, title: "B" };
		const a2 = { ...linkRow, title: "A", url: "https://z.example" };
		const a1 = { ...linkRow, title: "A", url: "https://a.example" };
		const ctx = { tenantId: TENANT, eventId: EVENT };
		const formatted = formatAttachmentsCell([b, a2, fileRow, a1], ctx);
		expect(formatted).toBe(formatAttachmentsCell([a1, fileRow, a2, b], ctx));
		expect(
			(JSON.parse(formatted) as { title: string; url?: string }[]).map(
				(item) => `${item.title}:${item.url ?? ""}`,
			),
		).toStrictEqual([
			"Scan:",
			"A:https://a.example",
			"A:https://z.example",
			"B:https://example.com/a",
		]);
	});

	it("round-trips: the exported cell re-imports as the same items", () => {
		const formatted = formatAttachmentsCell([linkRow, fileRow], {
			tenantId: TENANT,
			eventId: EVENT,
		});
		expect(
			toAttachmentInputs(items(formatted), new Set(["k.pdf"])),
		).toMatchObject({
			ok: true,
			inputs: [{ kind: "existingFile", fileKey: "k.pdf" }, { kind: "link" }],
		});
	});
});

describe("formatLegacyAttachmentsCell (D8, OD-6)", () => {
	it("projects jsonb items to the export shape, dropping tenantPath, view and id", () => {
		expect(
			JSON.parse(
				formatLegacyAttachmentsCell([
					{
						id: "a",
						title: "L",
						tag: [],
						file_option: "Link",
						url: "https://a.example",
						view: 1,
					},
					{
						id: "b",
						title: "F",
						tag: TAG,
						file_option: "File",
						file: {
							name: "/uploads/tenant-x/hazardous-event/E/f.pdf",
							tenantPath: "uploads/tenant-x",
							content_type: "application/pdf",
						},
					},
				]),
			),
		).toStrictEqual([
			{
				title: "F",
				tag: TAG,
				file_option: "File",
				file: {
					name: "/uploads/tenant-x/hazardous-event/E/f.pdf",
					content_type: "application/pdf",
				},
			},
			{ title: "L", tag: [], file_option: "Link", url: "https://a.example" },
		]);
	});

	it.each([null, undefined, {}, "x"])(
		"writes [] for a non-array jsonb %j",
		(jsonb) => {
			expect(formatLegacyAttachmentsCell(jsonb)).toBe("[]");
		},
	);

	it("keeps an item with no file_option so the cell still equals itself", () => {
		const formatted = formatLegacyAttachmentsCell([
			{ title: "x", url: "https://a.example" },
		]);
		expect(JSON.parse(formatted)).toStrictEqual([
			{ title: "x", url: "https://a.example" },
		]);
		expect(attachmentsEqual(formatted, formatted)).toBe(true);
	});

	it("keeps a non-object item as written", () => {
		expect(JSON.parse(formatLegacyAttachmentsCell(["x"]))).toStrictEqual(["x"]);
	});
});

describe("attachmentsEqual (D6)", () => {
	const ab = cell([link("https://a.example"), file("/x/k.pdf")]);

	it("ignores order and ids", () => {
		const ba = cell([
			file("/other/dir/k.pdf", { id: "zz" }),
			link("https://a.example", { id: undefined }),
		]);
		expect(attachmentsEqual(ba, ab)).toBe(true);
	});

	it("treats a null tag and an empty tag as the same", () => {
		expect(
			attachmentsEqual(
				cell([link("https://a.example", { tag: null })]),
				cell([link("https://a.example", { tag: [] })]),
			),
		).toBe(true);
	});

	it("compares as a multiset", () => {
		const one = cell([link("https://a.example")]);
		const two = cell([link("https://a.example"), link("https://a.example")]);
		expect(attachmentsEqual(one, two)).toBe(false);
	});

	it.each([
		[
			"title",
			cell([link("https://a.example", { title: "Other" }), file("/x/k.pdf")]),
		],
		["url", cell([link("https://b.example"), file("/x/k.pdf")])],
		["file key", cell([link("https://a.example"), file("/x/j.pdf")])],
		[
			"tag",
			cell([
				link("https://a.example", { tag: [{ id: "u", name: "U" }] }),
				file("/x/k.pdf"),
			]),
		],
		[
			"staged flag",
			cell([link("https://a.example"), file("/uploads/temp/k.pdf")]),
		],
		[
			"type",
			cell([link("https://a.example"), link("k.pdf", { title: "Scan" })]),
		],
	])("detects a different %s", (_, other) => {
		expect(attachmentsEqual(other, ab)).toBe(false);
	});

	it("treats [] as equal only to no attachments", () => {
		expect(attachmentsEqual("[]", "[ ]")).toBe(true);
		expect(attachmentsEqual("[]", ab)).toBe(false);
	});

	it("compares unparseable content as canonical JSON, then as text", () => {
		const legacy = cell([{ url: "https://a.example", title: "x" }]);
		expect(
			attachmentsEqual(
				cell([{ title: "x", url: "https://a.example" }]),
				legacy,
			),
		).toBe(true);
		expect(attachmentsEqual(legacy, ab)).toBe(false);
		expect(attachmentsEqual("{bad", "{bad")).toBe(true);
		expect(attachmentsEqual("{bad", "[]")).toBe(false);
	});
});

// Rejection, comparison and export-order edges that the main suites above do not pin.
describe("attachmentsCsv: gaps found by mutation testing", () => {
	it.each([
		[
			"an unknown file_option with a file",
			{ title: "x", file_option: "Video", file: { name: "/x/k.pdf" } },
		],
		[
			"a missing file_option with a file",
			{ title: "x", file: { name: "/x/k.pdf" } },
		],
	])("rejects %s as content, not as a File item", (_, item) => {
		expect(parseAttachmentsCell(cell([item]))).toStrictEqual({
			ok: false,
			syntax: false,
		});
	});

	it("keeps unparseable-but-valid JSON cells with different content apart", () => {
		expect(
			attachmentsEqual(
				cell([{ title: "x", url: "a" }]),
				cell([{ title: "y", url: "a" }]),
			),
		).toBe(false);
	});

	it("keeps two different non-JSON cells apart", () => {
		expect(attachmentsEqual("{bad", "{worse")).toBe(false);
	});

	it("exports missing CA values as empty strings", () => {
		const ctx = { tenantId: TENANT, eventId: EVENT };
		expect(
			JSON.parse(
				formatAttachmentsCell(
					[
						{
							type: "Link",
							title: "L",
							url: null,
							tag: null,
							fileKey: null,
							fileType: null,
						},
						{
							type: "File",
							title: "F",
							url: null,
							tag: null,
							fileKey: null,
							fileType: null,
						},
					],
					ctx,
				),
			),
		).toStrictEqual([
			{
				title: "F",
				tag: null,
				file_option: "File",
				file: {
					name: `/uploads/tenant-${TENANT}/hazardous-event/${EVENT}/`,
					content_type: "",
				},
			},
			{ title: "L", tag: null, file_option: "Link", url: "" },
		]);
	});

	it("exports malformed legacy items in a deterministic order", () => {
		const items = [
			"b",
			{ title: "Link", file_option: "Link", url: "https://a.example" },
			{ url: "https://no-title.example", file_option: "Link" },
			{ title: "No option", url: "https://c.example" },
			{ title: "Bare" },
			"a",
		];
		const formatted = formatLegacyAttachmentsCell(items);
		expect(formatted).toBe(formatLegacyAttachmentsCell([...items].reverse()));
		expect(JSON.parse(formatted)).toStrictEqual([
			"a",
			"b",
			{ title: "Bare" },
			{ title: "No option", url: "https://c.example" },
			{ file_option: "Link", url: "https://no-title.example" },
			{ title: "Link", file_option: "Link", url: "https://a.example" },
		]);
	});
});

describe("attachmentsCsv: hostile and edge input (6d-2 review fixes)", () => {
	it.each([
		["a null element", [null]],
		["a string element", ["Tag"]],
		["a numeric id", [{ id: 1, name: "Tag" }]],
		["an object name", [{ id: "t", name: { toString: 1 } }]],
	])("rejects a tag with %s as content", (_, tag) => {
		expect(
			parseAttachmentsCell(cell([link("https://a.example", { tag })])),
		).toStrictEqual({
			ok: false,
			syntax: false,
		});
	});

	it("rejects a deeply nested tag as content without throwing", () => {
		const tag = `${"[".repeat(5000)}${"]".repeat(5000)}`;
		const raw = `[{"title":"x","file_option":"Link","url":"https://a.example","tag":${tag}}]`;
		expect(parseAttachmentsCell(raw)).toStrictEqual({
			ok: false,
			syntax: false,
		});
		expect(attachmentsEqual(raw, raw)).toBe(true);
		expect(attachmentsEqual(raw, "[]")).toBe(false);
	});

	it("does not echo an empty Link URL", () => {
		expect(
			toAttachmentInputs(items(cell([link("")])), new Set()),
		).toStrictEqual({
			ok: false,
			code: "invalid_attachment_url",
		});
	});

	it("exports a legacy item whose fields are objects with a toString key", () => {
		const formatted = formatLegacyAttachmentsCell([
			{ title: { toString: 1 }, file_option: "Link", url: { toString: 2 } },
		]);
		expect(JSON.parse(formatted)).toStrictEqual([
			{ title: { toString: 1 }, file_option: "Link", url: { toString: 2 } },
		]);
	});

	it("orders items that tie on file_option, title and url by their full content", () => {
		const a: HazardousEventExportAttachment = {
			type: "Link",
			title: "Same",
			url: "https://same.example",
			tag: [{ id: "a", name: "A" }],
			fileKey: null,
			fileType: null,
		};
		const b = { ...a, tag: [{ id: "b", name: "B" }] };
		const ctx = { tenantId: TENANT, eventId: EVENT };
		expect(formatAttachmentsCell([a, b], ctx)).toBe(
			formatAttachmentsCell([b, a], ctx),
		);
		const legacyA = {
			title: "Same",
			file_option: "Link",
			url: "u",
			tag: [{ id: "a", name: "A" }],
		};
		const legacyB = { ...legacyA, tag: [{ id: "b", name: "B" }] };
		expect(formatLegacyAttachmentsCell([legacyA, legacyB])).toBe(
			formatLegacyAttachmentsCell([legacyB, legacyA]),
		);
	});
});

describe("formatAttachmentsCell: url precedes the full-content tie-break", () => {
	it("orders same-title links by url even when their tags sort the other way", () => {
		const base: HazardousEventExportAttachment = {
			type: "Link",
			title: "Same",
			url: null,
			tag: null,
			fileKey: null,
			fileType: null,
		};
		const laterUrl = {
			...base,
			url: "https://b.example",
			tag: [{ id: "a", name: "A" }],
		};
		const earlierUrl = {
			...base,
			url: "https://a.example",
			tag: [{ id: "b", name: "B" }],
		};
		const formatted = JSON.parse(
			formatAttachmentsCell([laterUrl, earlierUrl], {
				tenantId: TENANT,
				eventId: EVENT,
			}),
		) as { url: string }[];
		expect(formatted.map((item) => item.url)).toStrictEqual([
			"https://a.example",
			"https://b.example",
		]);
	});
});
