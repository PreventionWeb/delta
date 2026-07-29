import { describe, it, expect, vi } from "vitest";
import { NotFoundError } from "~/shared/errors";
import { NoticeNotFoundError } from "~/domains/notices/application/errors/NoticeErrors";
import type { INoticeRepository } from "~/domains/notices/application/ports/INoticeRepository";
import {
	Notice as NoticeCls,
	type Notice,
} from "~/domains/notices/domain/Notice";
import { fetchOwnedNotice } from "./fetchOwnedNotice";

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
	findByIdImpl?: (id: string, tenantId: string) => Promise<Notice>,
): INoticeRepository {
	return {
		findAll: vi.fn().mockResolvedValue([]),
		findById: findByIdImpl ? vi.fn().mockImplementation(findByIdImpl) : vi.fn(),
		save: vi.fn(),
		delete: vi.fn(),
	};
}

describe("fetchOwnedNotice()", () => {
	// Consolidates the fetch-then-tenant-recheck pattern previously duplicated across
	// GetNoticeById/UpdateNotice/DeleteNotice (SOLID review finding).

	it("returns the notice when it exists and belongs to the given tenant", async () => {
		const notice = buildNotice({ id: "abc", tenantId: "t1" });
		const repo = makeRepository(() => Promise.resolve(notice));

		const result = await fetchOwnedNotice(repo, "abc", "t1");

		expect(result).toBe(notice);
	});

	it("throws NoticeNotFoundError when the repository throws NotFoundError", async () => {
		const repo = makeRepository(() =>
			Promise.reject(new NotFoundError("Notice", "missing")),
		);

		await expect(fetchOwnedNotice(repo, "missing", "t1")).rejects.toThrow(
			NoticeNotFoundError,
		);
	});

	it("throws NoticeNotFoundError when the notice belongs to a different tenant (defence-in-depth)", async () => {
		const notice = buildNotice({ id: "abc", tenantId: "t2" });
		const repo = makeRepository(() => Promise.resolve(notice));

		await expect(fetchOwnedNotice(repo, "abc", "t1")).rejects.toThrow(
			NoticeNotFoundError,
		);
	});

	it("propagates non-NotFoundError errors unmodified", async () => {
		const dbError = new Error("DB unavailable");
		const repo = makeRepository(() => Promise.reject(dbError));

		await expect(fetchOwnedNotice(repo, "abc", "t1")).rejects.toBe(dbError);
	});
});
