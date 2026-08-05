import { Notice } from "~/domains/notices/domain/Notice";
import type { INoticeRepository } from "~/domains/notices/application/ports/INoticeRepository";
import type { NoticeDto } from "~/domains/notices/application/dto/NoticeDto";
import { toNoticeDto } from "~/domains/notices/application/dto/NoticeDto";
import type { ILogger } from "~/shared/logging/ILogger";

/**
 * Input value object for the CreateNoticeUseCase.
 *
 * Intentionally omits `id`, `createdAt`, `updatedAt`, `audience`, and
 * `publishedAt` — these are generated or defaulted by the use-case:
 *   - `audience`: defaults to `"private"` (matches the DB column default); a
 *     future command extension or spec delta will add configurable audience.
 */
export interface CreateNoticeCommand {
	tenantId: string;
	title: string;
	body: string | null;
	locale: string;
	isPublished: boolean;
}

/**
 * Application use-case: create and persist a new Notice.
 *
 * Follows the Clean Architecture rule that use-cases depend only on port
 * interfaces (`INoticeRepository`, `ILogger`), never on concrete adapters.
 *
 * Errors from `Notice.create()` (ValidationError) and from
 * `INoticeRepository.save()` propagate unmodified to the caller.
 */
export class CreateNoticeUseCase {
	constructor(
		private readonly logger: ILogger,
		private readonly noticeRepository: INoticeRepository,
	) {}

	async execute(command: CreateNoticeCommand): Promise<NoticeDto> {
		const id = crypto.randomUUID();
		const now = new Date();

		// WHY audience defaults to "private": this matches the DB column default
		// and is the safe choice — new drafts are never accidentally exposed.
		const audience = "private";
		const publishedAt = Notice.computePublishedAt({
			willBePublished: command.isPublished,
			wasPublished: false,
			existingPublishedAt: null,
			now,
		});

		// ValidationError propagates unmodified — the presentation layer catches it.
		const notice = Notice.create({
			id,
			tenantId: command.tenantId,
			title: command.title,
			body: command.body,
			locale: command.locale,
			isPublished: command.isPublished,
			audience,
			publishedAt,
			createdAt: now,
			updatedAt: now,
		});

		// WHY use `saved`, not `notice`: the repository may enrich the entity on
		// write (e.g. DB-generated timestamps).
		const saved = await this.noticeRepository.save(notice);

		this.logger.info({ msg: "notice.created", noticeId: saved.id });

		return toNoticeDto(saved);
	}
}
