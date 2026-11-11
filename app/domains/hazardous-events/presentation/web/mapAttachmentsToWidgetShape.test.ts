import { describe, expect, it } from "vitest";
import type { HazardousEventAttachmentProps } from "~/domains/hazardous-events/domain/HazardousEvent";
import { mapAttachmentsToWidgetShape } from "./mapAttachmentsToWidgetShape";

describe("mapAttachmentsToWidgetShape", () => {
	it("maps a File-type attachment to the widget's native File shape", () => {
		const attachment: HazardousEventAttachmentProps = {
			id: "att-1",
			title: "Photo",
			type: "File",
			url: null,
			tag: [{ id: "t1", name: "Flood" }],
			fileKey: "uuid-1__photo.jpg",
			fileName: "photo.jpg",
			fileType: "image/jpeg",
			fileSize: 1024,
		};

		const [result] = mapAttachmentsToWidgetShape([attachment], {
			tenantId: "tenant-1",
			hazardousEventId: "event-1",
		});

		expect(result).toEqual({
			id: "att-1",
			title: "Photo",
			tag: [{ id: "t1", name: "Flood" }],
			file_option: "File",
			file: {
				name: "uploads/tenant-tenant-1/hazardous-event/event-1/uuid-1__photo.jpg",
				tenantPath: "uploads/tenant-tenant-1",
				content_type: "image/jpeg",
			},
		});
	});

	it("produces a file.name with no /temp/ segment -- the parser's own staged-vs-existing signal", () => {
		const attachment: HazardousEventAttachmentProps = {
			id: "att-1",
			title: "Photo",
			type: "File",
			url: null,
			tag: null,
			fileKey: "uuid-1__photo.jpg",
			fileName: "photo.jpg",
			fileType: "image/jpeg",
			fileSize: 1024,
		};

		const [result] = mapAttachmentsToWidgetShape([attachment], {
			tenantId: "tenant-1",
			hazardousEventId: "event-1",
		});

		expect(result.file?.name).not.toContain("/temp/");
	});

	it("maps a Link-type attachment to the widget's native Link shape", () => {
		const attachment: HazardousEventAttachmentProps = {
			id: "att-2",
			title: "Reference",
			type: "Link",
			url: "https://example.com",
			tag: null,
			fileKey: null,
			fileName: null,
			fileType: null,
			fileSize: null,
		};

		const [result] = mapAttachmentsToWidgetShape([attachment], {
			tenantId: "tenant-1",
			hazardousEventId: "event-1",
		});

		expect(result).toEqual({
			id: "att-2",
			title: "Reference",
			tag: null,
			file_option: "Link",
			url: "https://example.com",
		});
	});

	it("maps an empty collection to an empty array", () => {
		expect(
			mapAttachmentsToWidgetShape([], {
				tenantId: "tenant-1",
				hazardousEventId: "event-1",
			}),
		).toEqual([]);
	});
});
