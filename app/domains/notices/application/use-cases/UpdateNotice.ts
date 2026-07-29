import { Notice } from "~/domains/notices/domain/Notice";
import type { INoticeRepository } from "~/domains/notices/application/ports/INoticeRepository";
import type { NoticeDto } from "~/domains/notices/application/dto/NoticeDto";
import { toNoticeDto } from "~/domains/notices/application/dto/NoticeDto";
import type { ILogger } from "~/shared/logging/ILogger";
import { fetchOwnedNotice } from "~/domains/notices/application/fetchOwnedNotice";

// publishedAt is derived, never client-supplied — see design.md Decision 8.
export interface UpdateNoticeCommand {
	id: string;
	tenantId: string;
	title?: string;
	body?: string | null;
	locale?: string;
	isPublished?: boolean;
}

/**
 * Application use-case: fetch-merge-validate-persist an existing Notice.
 * Same tenant-isolation and error-propagation contract as GetNoticeByIdUseCase.
 */
export class UpdateNoticeUseCase {
	constructor(
		private readonly logger: ILogger,
		private readonly noticeRepository: INoticeRepository,
	) {}

	async execute(command: UpdateNoticeCommand): Promise<NoticeDto> {
		const existing = await fetchOwnedNotice(
			this.noticeRepository,
			command.id,
			command.tenantId,
		);

		// Transition rule (design.md Decision 8) lives on Notice.computePublishedAt() —
		// shared with CreateNoticeUseCase, previously duplicated here (SOLID review).
		const wasPublished = existing.isPublished;
		const willBePublished = command.isPublished ?? wasPublished;
		const publishedAt = Notice.computePublishedAt({
			willBePublished,
			wasPublished,
			existingPublishedAt: existing.publishedAt,
			now: new Date(),
		});

		const merged = Notice.create({
			id: existing.id,
			tenantId: existing.tenantId,
			title: command.title ?? existing.title,
			body: command.body !== undefined ? command.body : existing.body,
			locale: command.locale ?? existing.locale,
			isPublished: willBePublished,
			audience: existing.audience,
			publishedAt,
			createdAt: existing.createdAt,
			updatedAt: new Date(),
		});

		const saved = await this.noticeRepository.save(merged);

		this.logger.info({ msg: "notice.updated", noticeId: saved.id });

		return toNoticeDto(saved);
	}
}
