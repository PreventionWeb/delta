import { describe, expect, it } from "vitest";
import { ValidationError } from "~/shared/errors";
import { Notice, type NoticeProps } from "./Notice";

const baseProps: NoticeProps = {
	id: "notice-1",
	tenantId: "tenant-1",
	title: "My Notice",
	body: null,
	locale: "en",
	isPublished: false,
	audience: "public",
	publishedAt: null,
	createdAt: new Date("2024-01-01T00:00:00Z"),
	updatedAt: new Date("2024-01-01T00:00:00Z"),
};

describe("Notice.create()", () => {
	describe("Happy paths", () => {
		it("returns a Notice instance when title is non-empty, isPublished is false, publishedAt is null", () => {
			const notice = Notice.create(baseProps);

			expect(notice).toBeInstanceOf(Notice);
			expect(notice.title).toBe("My Notice");
			expect(notice.locale).toBe("en");
			expect(notice.isPublished).toBe(false);
			expect(notice.publishedAt).toBeNull();
		});

		it("returns a Notice instance without throwing when body is set", () => {
			const props: NoticeProps = {
				...baseProps,
				body: "Some body text",
			};

			expect(() => Notice.create(props)).not.toThrow();
		});

		it("returns a Notice instance without throwing when isPublished is true and publishedAt is set", () => {
			const props: NoticeProps = {
				...baseProps,
				title: "Published",
				isPublished: true,
				publishedAt: new Date("2024-06-01T00:00:00Z"),
			};

			expect(() => Notice.create(props)).not.toThrow();
		});

		it("returns a Notice instance without throwing when isPublished is true and publishedAt is null (pre-tracking data is valid)", () => {
			// A published notice with no publishedAt is intentionally allowed —
			// it represents notices written before timestamp tracking was introduced.
			// Only the reverse is an invariant: a DRAFT must never carry a publishedAt.
			const props: NoticeProps = {
				...baseProps,
				title: "Published without timestamp",
				isPublished: true,
				publishedAt: null,
			};

			expect(() => Notice.create(props)).not.toThrow();
		});
	});

	describe("Failure paths", () => {
		it("throws ValidationError when title is an empty string", () => {
			const props: NoticeProps = {
				...baseProps,
				title: "",
			};

			expect(() => Notice.create(props)).toThrow(ValidationError);
		});

		it("throws ValidationError with a message referencing title when title is empty", () => {
			const props: NoticeProps = {
				...baseProps,
				title: "",
			};

			expect(() => Notice.create(props)).toThrow(/title/);
		});

		it("throws ValidationError when title is whitespace-only", () => {
			const props: NoticeProps = {
				...baseProps,
				title: "   ",
			};

			expect(() => Notice.create(props)).toThrow(ValidationError);
		});

		it("throws ValidationError when publishedAt is non-null but isPublished is false", () => {
			const props: NoticeProps = {
				...baseProps,
				title: "Draft",
				isPublished: false,
				publishedAt: new Date("2024-06-01T00:00:00Z"),
			};

			expect(() => Notice.create(props)).toThrow(ValidationError);
		});

		it("throws ValidationError with a message referencing publishedAt/isPublished when publishedAt is set on an unpublished notice", () => {
			const props: NoticeProps = {
				...baseProps,
				title: "Draft",
				isPublished: false,
				publishedAt: new Date("2024-06-01T00:00:00Z"),
			};

			expect(() => Notice.create(props)).toThrow(/publishedAt/);
		});
	});

	describe("No shared mutable state", () => {
		it("two sequential calls with valid props return independent instances (no module-level shared state)", () => {
			const a = Notice.create(baseProps);
			const b = Notice.create(baseProps);

			expect(a).toBeInstanceOf(Notice);
			expect(b).toBeInstanceOf(Notice);
			// Each call returns its own object — not the same reference
			expect(a).not.toBe(b);
			// Both reflect the input props correctly
			expect(a.title).toEqual(baseProps.title);
			expect(b.title).toEqual(baseProps.title);
		});

		it("two sequential calls with invalid props each throw their own independent ValidationError", () => {
			const invalidProps: NoticeProps = {
				...baseProps,
				title: "",
			};

			const call = () => Notice.create(invalidProps);

			// Each call throws independently
			expect(call).toThrow(ValidationError);
			expect(call).toThrow(ValidationError);
		});
	});

	describe("All properties are accessible after construction", () => {
		it("exposes every NoticeProps field via a getter that returns the value passed in props", () => {
			const props: NoticeProps = {
				id: "notice-42",
				tenantId: "tenant-99",
				title: "Title",
				body: "Body text",
				locale: "fr",
				isPublished: true,
				audience: "private",
				publishedAt: new Date("2024-06-15T12:00:00Z"),
				createdAt: new Date("2024-06-01T00:00:00Z"),
				updatedAt: new Date("2024-06-15T12:00:00Z"),
			};

			const notice = Notice.create(props);

			expect(notice.id).toBe(props.id);
			expect(notice.tenantId).toBe(props.tenantId);
			expect(notice.title).toBe(props.title);
			expect(notice.body).toBe(props.body);
			expect(notice.locale).toBe(props.locale);
			expect(notice.isPublished).toBe(props.isPublished);
			expect(notice.audience).toBe(props.audience);
			expect(notice.publishedAt).toEqual(props.publishedAt);
			expect(notice.createdAt).toEqual(props.createdAt);
			expect(notice.updatedAt).toEqual(props.updatedAt);
		});
	});
});

// Consolidates the publishedAt transition rule previously duplicated between
// CreateNoticeUseCase and UpdateNoticeUseCase (SOLID review finding).
describe("Notice.computePublishedAt()", () => {
	const now = new Date("2026-02-01T12:00:00.000Z");

	it("stamps now on first publish (was not published, will be published)", () => {
		const result = Notice.computePublishedAt({
			willBePublished: true,
			wasPublished: false,
			existingPublishedAt: null,
			now,
		});

		expect(result).toEqual(now);
	});

	it("keeps the existing publishedAt when already published and staying published", () => {
		const originalPublishedAt = new Date("2024-01-01T00:00:00.000Z");

		const result = Notice.computePublishedAt({
			willBePublished: true,
			wasPublished: true,
			existingPublishedAt: originalPublishedAt,
			now,
		});

		expect(result).toBe(originalPublishedAt);
	});

	it("returns null when unpublishing", () => {
		const result = Notice.computePublishedAt({
			willBePublished: false,
			wasPublished: true,
			existingPublishedAt: new Date("2024-01-01T00:00:00.000Z"),
			now,
		});

		expect(result).toBeNull();
	});

	it("returns null for a brand-new, never-published notice", () => {
		const result = Notice.computePublishedAt({
			willBePublished: false,
			wasPublished: false,
			existingPublishedAt: null,
			now,
		});

		expect(result).toBeNull();
	});
});
