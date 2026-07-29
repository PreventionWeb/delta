import type { INoticeRepository } from "~/domains/notices/application/ports/INoticeRepository";
import type { ILogger } from "~/shared/logging/ILogger";
import { fetchOwnedNotice } from "~/domains/notices/application/fetchOwnedNotice";

export interface DeleteNoticeCommand {
	id: string;
	tenantId: string;
}

/**
 * Application use-case: tenant-scoped existence check then delete.
 * Re-fetches before deleting rather than trusting the repository's own
 * tenant-scoped WHERE — same defence-in-depth rationale as fetchOwnedNotice().
 */
export class DeleteNoticeUseCase {
	constructor(
		private readonly logger: ILogger,
		private readonly noticeRepository: INoticeRepository,
	) {}

	async execute(command: DeleteNoticeCommand): Promise<void> {
		await fetchOwnedNotice(this.noticeRepository, command.id, command.tenantId);

		await this.noticeRepository.delete(command.id, command.tenantId);

		this.logger.info({ msg: "notice.deleted", noticeId: command.id });
	}
}
