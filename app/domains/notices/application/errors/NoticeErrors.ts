import { NotFoundError } from "~/shared/errors/DomainError";

// Shared by every Notices use case that fetches by id — see design.md Decision 9.
export class NoticeNotFoundError extends NotFoundError {
	constructor(id: string) {
		super("Notice", id);
	}
}
