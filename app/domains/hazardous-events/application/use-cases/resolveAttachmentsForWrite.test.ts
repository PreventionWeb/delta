import { describe, expect, it, vi } from "vitest";
import { ValidationError } from "~/shared/errors";
import type { IAttachmentStoragePort } from "~/domains/shared/attachments/application/ports/IAttachmentStoragePort";
import type { HazardousEventAttachmentProps } from "../../domain/HazardousEvent";
import type { HazardousEventAttachmentInput } from "../dto/HazardousEventAttachmentInput";
import { resolveAttachmentsForWrite } from "./resolveAttachmentsForWrite";

function makeFakePort(
	overrides: Partial<IAttachmentStoragePort> = {},
): IAttachmentStoragePort {
	return {
		stage: vi.fn(),
		promote: vi.fn().mockResolvedValue({
			fileKey: "new-key",
			fileSize: 42,
			fileName: "new-key",
		}),
		delete: vi.fn(),
		retrieve: vi.fn(),
		...overrides,
	};
}

const existingFile: HazardousEventAttachmentProps = {
	id: "existing-1",
	title: "Existing file",
	type: "File",
	url: null,
	tag: null,
	fileKey: "existing-key.pdf",
	fileName: "original.pdf",
	fileType: "application/pdf",
	fileSize: 1024,
};

describe("resolveAttachmentsForWrite", () => {
	it("resolves a link input with no storage-port call", async () => {
		const port = makeFakePort();
		const input: HazardousEventAttachmentInput = {
			kind: "link",
			id: "a1",
			title: "A link",
			tag: null,
			url: "https://example.com",
		};

		const result = await resolveAttachmentsForWrite([input], [], port, {
			tenantId: "tenant-1",
			ownerId: "event-1",
		});

		expect(result.attachments).toEqual([
			{
				id: "a1",
				title: "A link",
				type: "Link",
				url: "https://example.com",
				tag: null,
				fileKey: null,
				fileName: null,
				fileType: null,
				fileSize: null,
			},
		]);
		expect(result.fileKeysToDelete).toEqual([]);
		expect(port.promote).not.toHaveBeenCalled();
	});

	it("promotes a new File input and uses the resulting fileKey/fileSize", async () => {
		const stagedFileName = "8e3b2b2a-1a2b-4c3d-9e4f-5a6b7c8d9e0f__report.pdf";
		const port = makeFakePort({
			promote: vi.fn().mockResolvedValue({
				fileKey: stagedFileName,
				fileSize: 555,
				// The adapter derives this from its own staging convention now (Gate 5/SOLID
				// finding) -- resolveAttachmentsForWrite just trusts whatever the port returns.
				fileName: "report.pdf",
			}),
		});
		const input: HazardousEventAttachmentInput = {
			kind: "newFile",
			id: "a2",
			title: "New report",
			tag: [{ id: "t1", name: "Flood" }],
			stagedFileName,
			contentType: "application/pdf",
		};

		const result = await resolveAttachmentsForWrite([input], [], port, {
			tenantId: "tenant-1",
			ownerId: "event-1",
		});

		expect(port.promote).toHaveBeenCalledWith(
			{
				tenantId: "tenant-1",
				ownerType: "hazardous-event",
				ownerId: "event-1",
			},
			{ name: stagedFileName },
		);
		expect(result.attachments).toEqual([
			{
				id: "a2",
				title: "New report",
				type: "File",
				url: null,
				tag: [{ id: "t1", name: "Flood" }],
				fileKey: stagedFileName,
				fileName: "report.pdf",
				fileType: "application/pdf",
				fileSize: 555,
			},
		]);
	});

	it("carries forward an existing File attachment's metadata when matched by fileKey, applying the new title/tag", async () => {
		const port = makeFakePort();
		const input: HazardousEventAttachmentInput = {
			kind: "existingFile",
			id: "resubmitted-id",
			title: "Renamed",
			tag: [{ id: "t2", name: "Urgent" }],
			fileKey: existingFile.fileKey as string,
		};

		const result = await resolveAttachmentsForWrite(
			[input],
			[existingFile],
			port,
			{ tenantId: "tenant-1", ownerId: "event-1" },
		);

		expect(result.attachments).toEqual([
			{
				...existingFile,
				id: "resubmitted-id",
				title: "Renamed",
				tag: [{ id: "t2", name: "Urgent" }],
			},
		]);
		expect(result.fileKeysToDelete).toEqual([]);
		expect(port.promote).not.toHaveBeenCalled();
	});

	it("throws ValidationError when an existingFile input's fileKey matches no existing attachment", async () => {
		const port = makeFakePort();
		const input: HazardousEventAttachmentInput = {
			kind: "existingFile",
			id: "a3",
			title: "Mismatched",
			tag: null,
			fileKey: "does-not-exist.pdf",
		};

		await expect(
			resolveAttachmentsForWrite([input], [existingFile], port, {
				tenantId: "tenant-1",
				ownerId: "event-1",
			}),
		).rejects.toThrow(ValidationError);
	});

	it("lists an existing File attachment's fileKey for deletion when it is absent from the new inputs", async () => {
		const port = makeFakePort();

		const result = await resolveAttachmentsForWrite([], [existingFile], port, {
			tenantId: "tenant-1",
			ownerId: "event-1",
		});

		expect(result.fileKeysToDelete).toEqual([existingFile.fileKey]);
		expect(result.attachments).toEqual([]);
	});

	it("does not list a Link-type existing attachment for deletion (no fileKey to begin with)", async () => {
		const port = makeFakePort();
		const existingLink: HazardousEventAttachmentProps = {
			id: "existing-link",
			title: "Existing link",
			type: "Link",
			url: "https://example.com",
			tag: null,
			fileKey: null,
			fileName: null,
			fileType: null,
			fileSize: null,
		};

		const result = await resolveAttachmentsForWrite([], [existingLink], port, {
			tenantId: "tenant-1",
			ownerId: "event-1",
		});

		expect(result.fileKeysToDelete).toEqual([]);
	});
});
