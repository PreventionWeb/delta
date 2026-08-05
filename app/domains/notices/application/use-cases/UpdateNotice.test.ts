import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NoOpLogger } from "~/shared/logging/NoOpLogger";
import { ValidationError, NotFoundError } from "~/shared/errors";
import { NoticeNotFoundError } from "~/domains/notices/application/errors/NoticeErrors";
import type { INoticeRepository } from "~/domains/notices/application/ports/INoticeRepository";
import {
	Notice as NoticeCls,
	type Notice,
} from "~/domains/notices/domain/Notice";
import { UpdateNoticeUseCase } from "./UpdateNotice";
import type { UpdateNoticeCommand } from "./UpdateNotice";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildNotice(
	overrides: {
		id?: string;
		tenantId?: string;
		title?: string;
		body?: string | null;
		locale?: string;
		isPublished?: boolean;
		publishedAt?: Date | null;
		createdAt?: Date;
		updatedAt?: Date;
	} = {},
): Notice {
	const now = new Date("2024-01-15T10:00:00.000Z");
	return NoticeCls.create({
		id: overrides.id ?? "abc",
		tenantId: overrides.tenantId ?? "t1",
		title: overrides.title ?? "Test Notice",
		body: overrides.body ?? null,
		locale: overrides.locale ?? "en",
		isPublished: overrides.isPublished ?? false,
		audience: "private",
		publishedAt: overrides.publishedAt ?? null,
		createdAt: overrides.createdAt ?? now,
		updatedAt: overrides.updatedAt ?? now,
	});
}

function makeRepository(
	overrides: {
		findByIdImpl?: (id: string, tenantId: string) => Promise<Notice>;
		saveImpl?: (notice: Notice) => Promise<Notice>;
	} = {},
): INoticeRepository {
	return {
		findAll: vi.fn().mockResolvedValue([]),
		findById: overrides.findByIdImpl
			? vi.fn().mockImplementation(overrides.findByIdImpl)
			: vi.fn(),
		save: overrides.saveImpl
			? vi.fn().mockImplementation(overrides.saveImpl)
			: vi.fn().mockImplementation((notice: Notice) => Promise.resolve(notice)),
		delete: vi.fn(),
	};
}

function buildCommand(
	overrides: Partial<UpdateNoticeCommand> = {},
): UpdateNoticeCommand {
	return {
		id: "abc",
		tenantId: "t1",
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("UpdateNoticeUseCase", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2024-02-01T12:00:00.000Z"));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	// -------------------------------------------------------------------------
	// Partial-field merge
	// -------------------------------------------------------------------------

	it("changes only the supplied fields, leaving the rest unchanged", async () => {
		const existing = buildNotice({
			title: "Old title",
			body: "Existing body",
			locale: "en",
			isPublished: true,
			publishedAt: new Date("2024-01-01T00:00:00.000Z"),
		});
		const repo = makeRepository({
			findByIdImpl: () => Promise.resolve(existing),
		});
		const useCase = new UpdateNoticeUseCase(new NoOpLogger(), repo);

		const dto = await useCase.execute(buildCommand({ title: "New title" }));

		expect(dto.title).toBe("New title");
		expect(dto.body).toBe("Existing body");
		expect(dto.locale).toBe("en");
		expect(dto.isPublished).toBe(true);
	});

	// -------------------------------------------------------------------------
	// locale is independently updatable
	// -------------------------------------------------------------------------

	it("updates locale alone, leaving title/body unchanged", async () => {
		const existing = buildNotice({
			title: "Title",
			body: "Body",
			locale: "en",
		});
		const repo = makeRepository({
			findByIdImpl: () => Promise.resolve(existing),
		});
		const useCase = new UpdateNoticeUseCase(new NoOpLogger(), repo);

		const dto = await useCase.execute(buildCommand({ locale: "fr" }));

		expect(dto.locale).toBe("fr");
		expect(dto.title).toBe("Title");
		expect(dto.body).toBe("Body");
	});

	// -------------------------------------------------------------------------
	// updatedAt refresh
	// -------------------------------------------------------------------------

	it("refreshes updatedAt to a timestamp later than the previous one", async () => {
		const existing = buildNotice({
			updatedAt: new Date("2024-01-01T00:00:00.000Z"),
		});
		const repo = makeRepository({
			findByIdImpl: () => Promise.resolve(existing),
		});
		const useCase = new UpdateNoticeUseCase(new NoOpLogger(), repo);

		const dto = await useCase.execute(buildCommand({ title: "x" }));

		expect(new Date(dto.updatedAt).getTime()).toBeGreaterThan(
			existing.updatedAt.getTime(),
		);
	});

	// -------------------------------------------------------------------------
	// publishedAt transitions
	// -------------------------------------------------------------------------

	it("stamps publishedAt with the current time on the first publish", async () => {
		const existing = buildNotice({ isPublished: false, publishedAt: null });
		const repo = makeRepository({
			findByIdImpl: () => Promise.resolve(existing),
		});
		const useCase = new UpdateNoticeUseCase(new NoOpLogger(), repo);

		const dto = await useCase.execute(buildCommand({ isPublished: true }));

		expect(dto.isPublished).toBe(true);
		expect(dto.publishedAt).toBe(
			new Date("2024-02-01T12:00:00.000Z").toISOString(),
		);
	});

	it("clears publishedAt to null when unpublishing", async () => {
		const existing = buildNotice({
			isPublished: true,
			publishedAt: new Date("2024-01-01T00:00:00.000Z"),
		});
		const repo = makeRepository({
			findByIdImpl: () => Promise.resolve(existing),
		});
		const useCase = new UpdateNoticeUseCase(new NoOpLogger(), repo);

		const dto = await useCase.execute(buildCommand({ isPublished: false }));

		expect(dto.isPublished).toBe(false);
		expect(dto.publishedAt).toBeNull();
	});

	it("leaves publishedAt unchanged when an already-published notice stays published", async () => {
		const originalPublishedAt = new Date("2024-01-01T00:00:00.000Z");
		const existing = buildNotice({
			isPublished: true,
			publishedAt: originalPublishedAt,
		});
		const repo = makeRepository({
			findByIdImpl: () => Promise.resolve(existing),
		});
		const useCase = new UpdateNoticeUseCase(new NoOpLogger(), repo);

		const dto = await useCase.execute(buildCommand({ title: "New title" }));

		expect(dto.publishedAt).toBe(originalPublishedAt.toISOString());
	});

	// -------------------------------------------------------------------------
	// Tenant isolation
	// -------------------------------------------------------------------------

	it("throws NoticeNotFoundError when the notice belongs to a different tenant", async () => {
		const existing = buildNotice({ tenantId: "t2" });
		const repo = makeRepository({
			findByIdImpl: () => Promise.resolve(existing),
		});
		const useCase = new UpdateNoticeUseCase(new NoOpLogger(), repo);

		await expect(
			useCase.execute(buildCommand({ id: "abc", tenantId: "t1" })),
		).rejects.toThrow(NoticeNotFoundError);
		expect(repo.save).not.toHaveBeenCalled();
	});

	it("throws NoticeNotFoundError for a nonexistent id", async () => {
		const repo = makeRepository({
			findByIdImpl: () =>
				Promise.reject(new NotFoundError("Notice", "missing")),
		});
		const useCase = new UpdateNoticeUseCase(new NoOpLogger(), repo);

		await expect(
			useCase.execute(buildCommand({ id: "missing" })),
		).rejects.toThrow(NoticeNotFoundError);
	});

	// -------------------------------------------------------------------------
	// Invariant re-validation
	// -------------------------------------------------------------------------

	it("rejects an update that would clear the title", async () => {
		const existing = buildNotice();
		const repo = makeRepository({
			findByIdImpl: () => Promise.resolve(existing),
		});
		const useCase = new UpdateNoticeUseCase(new NoOpLogger(), repo);

		await expect(
			useCase.execute(buildCommand({ title: "" })),
		).rejects.toBeInstanceOf(ValidationError);
		expect(repo.save).not.toHaveBeenCalled();
	});

	// -------------------------------------------------------------------------
	// Non-DomainError propagation
	// -------------------------------------------------------------------------

	it("propagates non-DomainError repository errors from save() unmodified", async () => {
		const existing = buildNotice();
		const dbError = new Error("DB connection lost");
		const repo = makeRepository({
			findByIdImpl: () => Promise.resolve(existing),
			saveImpl: () => Promise.reject(dbError),
		});
		const useCase = new UpdateNoticeUseCase(new NoOpLogger(), repo);

		await expect(useCase.execute(buildCommand())).rejects.toBe(dbError);
	});
});
