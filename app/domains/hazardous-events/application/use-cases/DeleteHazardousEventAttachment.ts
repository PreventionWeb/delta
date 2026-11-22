import type { IHazardousEventRepository } from "../ports/IHazardousEventRepository";
import type { IHazardousEventAttachmentRepository } from "../ports/IHazardousEventAttachmentRepository";
import type { IHazardousEventAttachmentStorageService } from "../ports/IHazardousEventAttachmentStorageService";
import { assertNonEmptyString } from "../assertNonEmptyString";
import { NotFoundError } from "~/shared/errors";

export interface DeleteHazardousEventAttachmentCommand {
	tenantId: string;
	hazardousEventId: string;
	attachmentId: string;
}

export class DeleteHazardousEventAttachmentUseCase {
	constructor(
		private readonly hazardousEventRepository: Pick<
			IHazardousEventRepository,
			"findById"
		>,
		private readonly attachmentRepository: Pick<
			IHazardousEventAttachmentRepository,
			"delete"
		>,
		private readonly storageService?: Pick<
			IHazardousEventAttachmentStorageService,
			"deleteAttachmentFile"
		>,
	) {}

	async execute(command: DeleteHazardousEventAttachmentCommand): Promise<void> {
		assertNonEmptyString(command.tenantId, "tenantId");
		assertNonEmptyString(command.hazardousEventId, "hazardousEventId");
		assertNonEmptyString(command.attachmentId, "attachmentId");

		// Verifies the parent event exists and belongs to the caller's tenant; throws NotFoundError if not.
		await this.hazardousEventRepository.findById(
			command.hazardousEventId,
			command.tenantId,
		);

		const deleted = await this.attachmentRepository.delete(
			command.hazardousEventId,
			command.attachmentId,
		);

		if (!deleted) {
			throw new NotFoundError("HazardousEventAttachment", command.attachmentId);
		}

		if (this.storageService && deleted.fileKey) {
			await this.storageService.deleteAttachmentFile(
				deleted.fileKey,
				command.tenantId,
			);
		}
	}
}
