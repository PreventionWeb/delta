import type { INoticeRepository } from "~/domains/notices/application/ports/INoticeRepository";
import type { Notice } from "~/domains/notices/domain/Notice";
import { NotFoundError } from "~/shared/errors/DomainError";
import { NoticeNotFoundError } from "~/domains/notices/application/errors/NoticeErrors";

/**
 * Shared fetch-then-tenant-recheck used by GetNoticeById/UpdateNotice/DeleteNotice (previously
 * duplicated identically in all three — SOLID review). The tenant recheck is defence-in-depth:
 * the repository already scopes by tenantId, this guards against a misconfigured adapter.
 */
export async function fetchOwnedNotice(
	repository: INoticeRepository,
	id: string,
	tenantId: string,
): Promise<Notice> {
	let notice: Notice;
	try {
		notice = await repository.findById(id, tenantId);
	} catch (err) {
		if (err instanceof NotFoundError) {
			throw new NoticeNotFoundError(id);
		}
		throw err;
	}

	if (notice.tenantId !== tenantId) {
		throw new NoticeNotFoundError(id);
	}

	return notice;
}
