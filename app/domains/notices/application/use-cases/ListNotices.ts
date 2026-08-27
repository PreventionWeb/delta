import type { ILogger } from "~/shared/logging/ILogger";
import type { INoticeRepository } from "~/domains/notices/application/ports/INoticeRepository";
import type { NoticeDto } from "~/domains/notices/application/dto/NoticeDto";
import { toNoticeDto } from "~/domains/notices/application/dto/NoticeDto";
import type { Pagination } from "~/shared/types";

/**
 * Input value object for ListNoticesUseCase.
 *
 * WHY no `locale` query field: notices are single-locale content (ADR-008) —
 * each notice's own `locale` field is returned as authored via `toNoticeDto()`,
 * there is no per-request resolution to parameterize here.
 */
export interface ListNoticesQuery {
	tenantId: string;
	page: number;
	pageSize: number;
}

/**
 * Application use case: retrieve a paginated list of notices for a tenant.
 *
 * Keeping listing separate satisfies SRP — this class does exactly one thing:
 * orchestrate `INoticeRepository.findAll()`, map results via `toNoticeDto()`,
 * and emit a structured log event.
 *
 * Depends on:
 * - `INoticeRepository` (port interface, never a concrete adapter)
 * - `ILogger` (port interface, injected from the composition root)
 * - `toNoticeDto` (reused mapper from the dto module — no inline mapping)
 */
export class ListNoticesUseCase {
	constructor(
		private readonly logger: ILogger,
		private readonly noticeRepository: INoticeRepository,
	) {}

	async execute(query: ListNoticesQuery): Promise<NoticeDto[]> {
		const pagination: Pagination = {
			page: query.page,
			pageSize: query.pageSize,
		};

		const notices = await this.noticeRepository.findAll(
			query.tenantId,
			pagination,
		);

		const dtos = notices.map(toNoticeDto);

		this.logger.info({
			msg: "notices.listed",
			tenantId: query.tenantId,
			count: dtos.length,
		});

		return dtos;
	}
}
