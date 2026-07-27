import type { ILogger } from "~/shared/logging/ILogger";
import type { INoticeRepository } from "~/domains/notices/application/ports/INoticeRepository";
import {
	toNoticeDto,
	type NoticeDto,
} from "~/domains/notices/application/dto/NoticeDto";
import { fetchOwnedNotice } from "~/domains/notices/application/fetchOwnedNotice";

/**
 * Input value object for GetNoticeByIdUseCase.
 */
export interface GetNoticeByIdQuery {
	id: string;
	tenantId: string;
}

/**
 * Application use case: retrieve a single Notice by ID within a tenant.
 * Tenant isolation and not-found mapping are handled by fetchOwnedNotice().
 */
export class GetNoticeByIdUseCase {
	constructor(
		private readonly logger: ILogger,
		private readonly noticeRepository: INoticeRepository,
	) {}

	async execute(query: GetNoticeByIdQuery): Promise<NoticeDto> {
		// Non-NotFoundError errors propagate unmodified per design.md Decision 4.
		const notice = await fetchOwnedNotice(
			this.noticeRepository,
			query.id,
			query.tenantId,
		);

		this.logger.info({
			msg: "notice.fetched",
			noticeId: notice.id,
			tenantId: notice.tenantId,
		});

		return toNoticeDto(notice);
	}
}
