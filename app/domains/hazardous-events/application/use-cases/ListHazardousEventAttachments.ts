import type { IHazardousEventRepository } from "../ports/IHazardousEventRepository";
import type { IHazardousEventAttachmentRepository } from "../ports/IHazardousEventAttachmentRepository";
import type { HazardousEventAttachmentDto } from "./AddHazardousEventAttachment";
import { assertNonEmptyString } from "../assertNonEmptyString";

export interface ListHazardousEventAttachmentsQuery {
	tenantId: string;
	hazardousEventId: string;
}

export class ListHazardousEventAttachmentsUseCase {
	constructor(
		private readonly hazardousEventRepository: Pick<
			IHazardousEventRepository,
			"findById"
		>,
		private readonly attachmentRepository: IHazardousEventAttachmentRepository,
	) {}

	async execute(
		query: ListHazardousEventAttachmentsQuery,
	): Promise<HazardousEventAttachmentDto[]> {
		assertNonEmptyString(query.tenantId, "tenantId");
		assertNonEmptyString(query.hazardousEventId, "hazardousEventId");

		// Verifies the event exists and belongs to the caller's tenant; throws NotFoundError if not.
		await this.hazardousEventRepository.findById(
			query.hazardousEventId,
			query.tenantId,
		);

		const records = await this.attachmentRepository.findByHazardousEventId(
			query.hazardousEventId,
		);

		return records.map((record) => ({
			id: record.id,
			hazardousEventId: record.hazardousEventId,
			title: record.title,
			fileKey: record.fileKey,
			fileName: record.fileName,
			fileType: record.fileType,
			fileSize: record.fileSize,
			createdAt: record.createdAt.toISOString(),
			updatedAt: record.updatedAt.toISOString(),
		}));
	}
}
