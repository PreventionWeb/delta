// Legacy `attachments` cell <-> CA attachment inputs (design.md D5, D6, D8). Pure; never emits
// `newFile`, so a CSV can never stage or promote a file.
import { sanitizeBasename } from "~/domains/shared/attachments/application/sanitizeBasename";
import type { HazardousEventAttachmentInput } from "../dto/HazardousEventAttachmentInput";
import type { HazardousEventExportAttachment } from "../dto/HazardousEventExportRow";
import {
	isAllowedAttachmentTag,
	isAllowedAttachmentUrl,
} from "../attachmentInputPolicy";

type Tag = ReadonlyArray<{ id: string; name: string }>;

/** Path segment of a staged upload (PreUploadFile.tsx); backslashes count too, unlike the form. */
const STAGED_SEGMENT = "temp";

export type CsvAttachmentItem =
	| { type: "Link"; title: string; tag: Tag | null; url: string }
	| {
			type: "File";
			title: string;
			tag: Tag | null;
			/** Basename of `file.name`; the directory part is never trusted (OWASP File Upload). */
			fileKey: string;
			/** A `temp` path segment marks a staged upload, which a CSV must never promote. */
			staged: boolean;
	  };

/** `syntax` separates unparseable JSON (always phase 1) from content errors (D10). */
export type AttachmentsParse =
	| { ok: true; items: CsvAttachmentItem[] }
	| { ok: false; syntax: boolean };

export type AttachmentInputsResult =
	| { ok: true; inputs: HazardousEventAttachmentInput[] }
	| {
			ok: false;
			code: "invalid_attachment_url" | "file_reference_not_supported";
			/** Absent for an empty URL, so the page never shows an empty "Value:". */
			value?: string;
	  };

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A non-array tag is normalised to `null`, as the form does; a malformed list is rejected. */
function readTag(value: unknown): { tag: Tag | null } | null {
	if (!Array.isArray(value)) return { tag: null };
	return isAllowedAttachmentTag(value) ? { tag: value } : null;
}

function isStagedFileName(name: string): boolean {
	return name.replace(/\\/g, "/").split("/").includes(STAGED_SEGMENT);
}

/** `sanitizeBasename` throws for an unusable name; here that is a row error, not a 500. */
function basenameOrNull(name: string): string | null {
	try {
		return sanitizeBasename(name);
	} catch {
		return null;
	}
}

function parseItem(value: unknown): CsvAttachmentItem | null {
	if (!isObject(value) || typeof value.title !== "string") return null;
	const { title } = value;
	const read = readTag(value.tag);
	if (read === null) return null;
	const { tag } = read;
	if (value.file_option === "Link") {
		// A missing url becomes "", which the URL rule then rejects.
		const url = typeof value.url === "string" ? value.url : "";
		return { type: "Link", title, tag, url };
	}
	if (value.file_option !== "File") return null;
	const name = isObject(value.file) ? value.file.name : undefined;
	if (typeof name !== "string") return null;
	const fileKey = basenameOrNull(name);
	if (fileKey === null) return null;
	return { type: "File", title, tag, fileKey, staged: isStagedFileName(name) };
}

export function parseAttachmentsCell(raw: string): AttachmentsParse {
	let json: unknown;
	try {
		json = JSON.parse(raw);
	} catch {
		return { ok: false, syntax: true };
	}
	if (!Array.isArray(json)) return { ok: false, syntax: false };
	let items: (CsvAttachmentItem | null)[];
	try {
		items = json.map(parseItem);
	} catch {
		// Hostile input must be a row error, never a 500.
		return { ok: false, syntax: false };
	}
	return items.every((item) => item !== null)
		? { ok: true, items: items as CsvAttachmentItem[] }
		: { ok: false, syntax: false };
}

/** Links must be http(s); a File item may only name a file the event already holds (D5).
 * Item ids are dropped: the repository mints row ids. */
export function toAttachmentInputs(
	items: readonly CsvAttachmentItem[],
	existingFileKeys: ReadonlySet<string>,
): AttachmentInputsResult {
	const inputs: HazardousEventAttachmentInput[] = [];
	for (const item of items) {
		const common = { id: "", title: item.title, tag: item.tag };
		if (item.type === "Link") {
			if (!isAllowedAttachmentUrl(item.url)) {
				return {
					ok: false,
					code: "invalid_attachment_url",
					...(item.url !== "" ? { value: item.url } : {}),
				};
			}
			inputs.push({ ...common, kind: "link", url: item.url });
		} else if (item.staged || !existingFileKeys.has(item.fileKey)) {
			return {
				ok: false,
				code: "file_reference_not_supported",
				value: item.fileKey,
			};
		} else {
			inputs.push({ ...common, kind: "existingFile", fileKey: item.fileKey });
		}
	}
	return { ok: true, inputs };
}

// --- Canonical form (D6) ---

function sortedKeys(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(sortedKeys);
	if (!isObject(value)) return value;
	return Object.fromEntries(
		Object.keys(value)
			.sort()
			.map((key) => [key, sortedKeys(value[key])]),
	);
}

function itemKey(item: CsvAttachmentItem): string {
	return JSON.stringify(
		sortedKeys([
			item.type,
			item.title,
			item.type === "Link" ? item.url : item.fileKey,
			item.type === "File" && item.staged,
			item.tag ?? [],
		]),
	);
}

/** Total: a cell the strict parser rejects compares as key-sorted JSON, then as text, so an
 * exported cell always equals itself (6d-1 deferred-error rule). */
function comparisonKey(raw: string): string {
	const parsed = parseAttachmentsCell(raw);
	if (parsed.ok) {
		return `items:${JSON.stringify(parsed.items.map(itemKey).sort())}`;
	}
	try {
		return `json:${JSON.stringify(sortedKeys(JSON.parse(raw)))}`;
	} catch {
		return `text:${raw}`;
	}
}

/** A multiset of (type, title, url or file key, staged, tag), ignoring ids and order (D6). */
export function attachmentsEqual(a: string, b: string): boolean {
	return comparisonKey(a) === comparisonKey(b);
}

// --- Export (D8) ---

/** `String()` throws on an object with a `toString` key, which legacy jsonb can hold. */
function textOf(value: unknown): string {
	if (typeof value === "string") return value;
	try {
		return JSON.stringify(value) ?? "";
	} catch {
		return "";
	}
}

function sortKey(item: unknown): string {
	const full = textOf(item);
	if (!isObject(item)) return JSON.stringify(["", "", full, full]);
	const fileName = isObject(item.file) ? item.file.name : undefined;
	return JSON.stringify([
		textOf(item.file_option ?? ""),
		textOf(item.title ?? ""),
		textOf(item.url ?? fileName ?? ""),
		full,
	]);
}

/** By (file_option, title, url or file name), then the whole item, so unchanged data exports
 * byte-identical even when items tie on the first three. */
function serialize(items: readonly unknown[]): string {
	return JSON.stringify(
		items
			.map((item) => ({ item, key: sortKey(item) }))
			.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
			.map(({ item }) => item),
	);
}

/** CA rows in the legacy jsonb shape, without `tenantPath` (DEF-064). */
export function formatAttachmentsCell(
	attachments: readonly HazardousEventExportAttachment[],
	ctx: { tenantId: string; eventId: string },
): string {
	return serialize(
		attachments.map((attachment) =>
			attachment.type === "Link"
				? {
						title: attachment.title,
						tag: attachment.tag,
						file_option: "Link",
						url: attachment.url ?? "",
					}
				: {
						title: attachment.title,
						tag: attachment.tag,
						file_option: "File",
						file: {
							name: `/uploads/tenant-${ctx.tenantId}/hazardous-event/${ctx.eventId}/${attachment.fileKey ?? ""}`,
							content_type: attachment.fileType ?? "",
						},
					},
		),
	);
}

/** Legacy jsonb items reduced to the export shape; other keys (`tenantPath`, `view`, `id`...)
 * are dropped (D8). Non-object items pass through, so the cell still equals itself. */
export function formatLegacyAttachmentsCell(jsonb: unknown): string {
	if (!Array.isArray(jsonb)) return "[]";
	return serialize(
		jsonb.map((value: unknown) => {
			if (!isObject(value)) return value;
			const item: Record<string, unknown> = {
				title: value.title,
				tag: value.tag,
				file_option: value.file_option,
			};
			if (value.url !== undefined) item.url = value.url;
			if (isObject(value.file)) {
				item.file = {
					name: value.file.name,
					content_type: value.file.content_type,
				};
			}
			return item;
		}),
	);
}
