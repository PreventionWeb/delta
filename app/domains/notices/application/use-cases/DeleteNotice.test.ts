import { describe, it, expect, vi } from "vitest";
import { NoOpLogger } from "~/shared/logging/NoOpLogger";
import { NotFoundError } from "~/shared/errors";
import { NoticeNotFoundError } from "~/domains/notices/application/errors/NoticeErrors";
import type { INoticeRepository } from "~/domains/notices/application/ports/INoticeRepository";
import {
	Notice as NoticeCls,
	type Notice,
} from "~/domains/notices/domain/Notice";
import { DeleteNoticeUseCase } from "./DeleteNotice";
import type { DeleteNoticeCommand } from "./DeleteNotice";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildNotice(
	overrides: { id?: string; tenantId?: string } = {},
): Notice {
	const now = new Date("2024-01-15T10:00:00.000Z");
	return NoticeCls.create({
		id: overrides.id ?? "abc",
		tenantId: overrides.tenantId ?? "t1",
		title: "Test Notice",
		body: null,
		locale: "en",
		isPublished: false,
		audience: "private",
		publishedAt: null,
		createdAt: now,
		updatedAt: now,
	});
}

function makeRepository(
	overrides: {
		findByIdImpl?: (id: string, tenantId: string) => Promise<Notice>;
		deleteImpl?: (id: string, tenantId: string) => Promise<void>;
	} = {},
): INoticeRepository {
	return {
		findAll: vi.fn().mockResolvedValue([]),
		findById: overrides.findByIdImpl
			? vi.fn().mockImplementation(overrides.findByIdImpl)
			: vi.fn(),
		save: vi.fn(),
		delete: overrides.deleteImpl
			? vi.fn().mockImplementation(overrides.deleteImpl)
			: vi.fn().mockResolvedValue(undefined),
	};
}

function buildCommand(
	overrides: Partial<DeleteNoticeCommand> = {},
): DeleteNoticeCommand {
	return {
		id: "abc",
		tenantId: "t1",
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DeleteNoticeUseCase", () => {
	// -------------------------------------------------------------------------
	// Successful delete
	// -------------------------------------------------------------------------

	it("calls repository.delete() with the right id and tenantId and resolves with no value", async () => {
		const existing = buildNotice({ id: "abc", tenantId: "t1" });
		const repo = makeRepository({
			findByIdImpl: () => Promise.resolve(existing),
		});
		const useCase = new DeleteNoticeUseCase(new NoOpLogger(), repo);

		const result = await useCase.execute(
			buildCommand({ id: "abc", tenantId: "t1" }),
		);

		expect(repo.delete).toHaveBeenCalledWith("abc", "t1");
		expect(result).toBeUndefined();
	});

	// -------------------------------------------------------------------------
	// Tenant isolation
	// -------------------------------------------------------------------------

	it("throws NoticeNotFoundError without calling delete() for a notice in a different tenant", async () => {
		const existing = buildNotice({ id: "abc", tenantId: "t2" });
		const repo = makeRepository({
			findByIdImpl: () => Promise.resolve(existing),
		});
		const useCase = new DeleteNoticeUseCase(new NoOpLogger(), repo);

		await expect(
			useCase.execute(buildCommand({ id: "abc", tenantId: "t1" })),
		).rejects.toThrow(NoticeNotFoundError);
		expect(repo.delete).not.toHaveBeenCalled();
	});

	it("throws NoticeNotFoundError without calling delete() for a nonexistent id", async () => {
		const repo = makeRepository({
			findByIdImpl: () =>
				Promise.reject(new NotFoundError("Notice", "missing")),
		});
		const useCase = new DeleteNoticeUseCase(new NoOpLogger(), repo);

		await expect(
			useCase.execute(buildCommand({ id: "missing" })),
		).rejects.toThrow(NoticeNotFoundError);
		expect(repo.delete).not.toHaveBeenCalled();
	});

	// -------------------------------------------------------------------------
	// Non-DomainError propagation
	// -------------------------------------------------------------------------

	it("propagates a non-DomainError error from delete() unmodified", async () => {
		const existing = buildNotice({ id: "abc", tenantId: "t1" });
		const dbError = new Error("DB connection lost");
		const repo = makeRepository({
			findByIdImpl: () => Promise.resolve(existing),
			deleteImpl: () => Promise.reject(dbError),
		});
		const useCase = new DeleteNoticeUseCase(new NoOpLogger(), repo);

		await expect(useCase.execute(buildCommand())).rejects.toBe(dbError);
	});
});
