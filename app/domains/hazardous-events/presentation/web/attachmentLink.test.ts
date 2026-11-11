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

	// Theoretically impossible per the DB check() constraint -- these cover the defensive `?? ""`
	// fallback so a data-integrity gap degrades to an empty link, not a thrown error.
	it("falls back to an empty href/label for a File-type attachment with a null fileKey/fileName", () => {
		const link = attachmentLink(
			"event-A",
			makeAttachment({ type: "File", fileKey: null, fileName: null }),
			urlFn,
		);

		expect(link.href).toBe("/en/hazardous-event/file-viewer?name=event-A/");
		expect(link.label).toBe("");
	});

	it("falls back to an empty href/label for a Link-type attachment with a null url", () => {
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

		expect(link.href).toBe("");
		expect(link.label).toBe("");
	});
});
