import { describe, it, expect } from "vitest";
import { attachmentLink } from "./attachmentLink";
import type { HazardousEventAttachmentProps } from "~/domains/hazardous-events/domain/HazardousEvent";

const urlFn = (path: string) => `/en${path}`;

function makeAttachment(
	overrides: Partial<HazardousEventAttachmentProps> = {},
): HazardousEventAttachmentProps {
	return {
		id: "attachment-1",
		title: "Site survey photo",
		type: "File",
		url: null,
		tag: null,
		fileKey: "uuid-123__survey.jpg",
		fileName: "survey.jpg",
		fileType: "image/jpeg",
		fileSize: 100,
		...overrides,
	};
}

describe("attachmentLink", () => {
	it("builds a file-viewer href from the event id and fileKey, with fileName as the label", () => {
		const link = attachmentLink(
			"event-A",
			makeAttachment({
				type: "File",
				fileKey: "uuid-123__survey.jpg",
				fileName: "survey.jpg",
			}),
			urlFn,
		);

		expect(link.href).toBe(
			"/en/hazardous-event/file-viewer?name=event-A/uuid-123__survey.jpg",
		);
		expect(link.label).toBe("survey.jpg");
	});

	it("never uses fileName in the href or fileKey as the label (the two are not interchangeable)", () => {
		const link = attachmentLink(
			"event-A",
			makeAttachment({
				type: "File",
				fileKey: "key-only-on-disk",
				fileName: "display-name.pdf",
			}),
			urlFn,
		);

		expect(link.href).not.toContain("display-name.pdf");
		expect(link.label).not.toBe("key-only-on-disk");
	});

	it("links a Link-type attachment directly to attachment.url, using it as the label too", () => {
		const link = attachmentLink(
			"event-A",
			makeAttachment({
				type: "Link",
				url: "https://example.com/report",
				fileKey: null,
				fileName: null,
			}),
			urlFn,
		);

		expect(link.href).toBe("https://example.com/report");
		expect(link.label).toBe("https://example.com/report");
	});

	// Theoretically impossible per the DB check() constraint -- covers the defensive `?? ""` fallback so a data-integrity gap degrades gracefully, not a thrown error.
	it("falls back to an empty href/label for a File-type attachment with a null fileKey/fileName", () => {
		const link = attachmentLink(
			"event-A",
			makeAttachment({ type: "File", fileKey: null, fileName: null }),
			urlFn,
		);

		expect(link.href).toBe("/en/hazardous-event/file-viewer?name=event-A/");
		expect(link.label).toBe("");
	});

	// `new URL("")` throws like any unparseable string -- href withholds, label still shows the raw value (design.md Decision 15, Fix 6).
	it("withholds href but still renders an empty label for a Link-type attachment with a null url", () => {
		const link = attachmentLink(
			"event-A",
			makeAttachment({
				type: "Link",
				url: null,
				fileKey: null,
				fileName: null,
			}),
			urlFn,
		);

		expect(link.href).toBeUndefined();
		expect(link.label).toBe("");
	});

	// design.md Decision 15, Fix 6: defense in depth against an unsafe user-entered URL scheme.
	it.each(["https://example.com/x", "http://example.com/x"])(
		"keeps href unchanged for a safely-schemed Link-type url: %s",
		(url) => {
			const link = attachmentLink(
				"event-A",
				makeAttachment({ type: "Link", url, fileKey: null, fileName: null }),
				urlFn,
			);

			expect(link.href).toBe(url);
		},
	);

	it.each([
		"javascript:alert(1)",
		"JAVASCRIPT:alert(1)",
		"data:text/html,<script>alert(1)</script>",
		"/relative/path",
		"not a url",
	])("withholds href for an unsafe or malformed Link-type url: %s", (url) => {
		const link = attachmentLink(
			"event-A",
			makeAttachment({ type: "Link", url, fileKey: null, fileName: null }),
			urlFn,
		);

		expect(link.href).toBeUndefined();
	});

	it("leaves the File-type branch's href unaffected by the scheme allowlist", () => {
		const link = attachmentLink(
			"event-A",
			makeAttachment({
				type: "File",
				fileKey: "uuid-123__survey.jpg",
				fileName: "survey.jpg",
			}),
			urlFn,
		);

		expect(link.href).toBe(
			"/en/hazardous-event/file-viewer?name=event-A/uuid-123__survey.jpg",
		);
	});
});
