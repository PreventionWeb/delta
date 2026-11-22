import type { Readable } from "node:stream";
import type { IHazardousEventRepository } from "../ports/IHazardousEventRepository";
import type { IHazardousEventAttachmentRepository } from "../ports/IHazardousEventAttachmentRepository";
import type { IHazardousEventAttachmentStorageService } from "../ports/IHazardousEventAttachmentStorageService";
import { assertNonEmptyString } from "../assertNonEmptyString";
import { NotFoundError } from "~/shared/errors";

export interface DownloadHazardousEventAttachmentCommand {
	tenantId: string;
	hazardousEventId: string;
	attachmentId: string;
}

export interface DownloadHazardousEventAttachmentResult {
	fileName: string;
	fileType: string;
	fileSize: number;
	stream: Readable;
}

export class DownloadHazardousEventAttachmentUseCase {
	constructor(
		private readonly hazardousEventRepository: Pick<
			IHazardousEventRepository,
			"findById"
		>,
		private readonly attachmentRepository: Pick<
			IHazardousEventAttachmentRepository,
			"findById"
		>,
		private readonly storageService: Pick<
			IHazardousEventAttachmentStorageService,
			"getAttachmentFile"
		>,
	) {}

	async execute(
		command: DownloadHazardousEventAttachmentCommand,
	): Promise<DownloadHazardousEventAttachmentResult> {
		assertNonEmptyString(command.tenantId, "tenantId");
		assertNonEmptyString(command.hazardousEventId, "hazardousEventId");
		assertNonEmptyString(command.attachmentId, "attachmentId");

		// 1. Verifies the parent event exists and belongs to the caller's tenant; throws NotFoundError if not.
		await this.hazardousEventRepository.findById(
			command.hazardousEventId,
			command.tenantId,
		);

		// 2. Looks up attachment record; throws NotFoundError if not found under this event.
		const attachment = await this.attachmentRepository.findById(
			command.hazardousEventId,
			command.attachmentId,
		);

		if (!attachment) {
			throw new NotFoundError("HazardousEventAttachment", command.attachmentId);
		}

		// 3. Retrieves physical file stream from storage (scoped to caller's tenant).
		const file = await this.storageService.getAttachmentFile(
			attachment.fileKey,
			command.tenantId,
		);

		if (!file) {
			throw new NotFoundError(
				"HazardousEventAttachmentFile",
				command.attachmentId,
			);
		}

		return {
			fileName: attachment.fileName,
			fileType: attachment.fileType,
			fileSize: file.size,
			stream: file.stream,
		};
	}
}
