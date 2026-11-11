import { describe, expect, it, vi } from "vitest";
import type { IAttachmentStoragePort } from "~/domains/shared/attachments/application/ports/IAttachmentStoragePort";
import type { ILogger } from "~/shared/logging/ILogger";
import {
	deleteAttachmentFiles,
	HAZARDOUS_EVENT_ATTACHMENT_OWNER_TYPE,
} from "./deleteAttachmentFiles";

describe("deleteAttachmentFiles", () => {
	it("deletes every fileKey via the port, scoped to the owner descriptor", async () => {
		const deleteMock = vi.fn().mockResolvedValue(undefined);
		const port: Pick<IAttachmentStoragePort, "delete"> = { delete: deleteMock };
		const logger: Pick<ILogger, "error"> = { error: vi.fn() };

		await deleteAttachmentFiles(port, logger, "tenant-1", "event-1", [
			"key-a.pdf",
			"key-b.pdf",
		]);

		expect(deleteMock).toHaveBeenCalledTimes(2);
		expect(deleteMock).toHaveBeenNthCalledWith(
			1,
			{
				tenantId: "tenant-1",
				ownerType: HAZARDOUS_EVENT_ATTACHMENT_OWNER_TYPE,
				ownerId: "event-1",
			},
			"key-a.pdf",
		);
		expect(deleteMock).toHaveBeenNthCalledWith(
			2,
			{
				tenantId: "tenant-1",
				ownerType: HAZARDOUS_EVENT_ATTACHMENT_OWNER_TYPE,
				ownerId: "event-1",
			},
			"key-b.pdf",
		);
		expect(logger.error).not.toHaveBeenCalled();
	});

	// Gate 8 finding / design.md Decision 7 addendum: a delete() failure here must never
	// propagate -- this function runs inside the write transaction, after every other step that
	// can still throw, so letting one escape would roll back the just-committed row change while
	// the first file's already-successful delete can't be undone.
	it("logs and swallows a delete() failure on one fileKey, still attempting every other fileKey, never throwing", async () => {
		const nonEnoentError = Object.assign(new Error("EPERM: locked"), {
			code: "EPERM",
		});
		const deleteMock = vi
			.fn()
			.mockResolvedValueOnce(undefined) // key-a.pdf succeeds
			.mockRejectedValueOnce(nonEnoentError) // key-b.pdf fails
			.mockResolvedValueOnce(undefined); // key-c.pdf still attempted afterward
		const port: Pick<IAttachmentStoragePort, "delete"> = { delete: deleteMock };
		const errorMock = vi.fn();
		const logger: Pick<ILogger, "error"> = { error: errorMock };

		await expect(
			deleteAttachmentFiles(port, logger, "tenant-1", "event-1", [
				"key-a.pdf",
				"key-b.pdf",
				"key-c.pdf",
			]),
		).resolves.toBeUndefined();

		expect(deleteMock).toHaveBeenCalledTimes(3);
		expect(errorMock).toHaveBeenCalledTimes(1);
		expect(errorMock).toHaveBeenCalledWith(
			expect.objectContaining({
				msg: "hazardous_event_attachment.delete_failed",
				tenantId: "tenant-1",
				ownerId: "event-1",
				fileKey: "key-b.pdf",
				err: nonEnoentError,
			}),
		);
	});
});
