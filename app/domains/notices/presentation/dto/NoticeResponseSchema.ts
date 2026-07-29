import { z } from "zod";
import { createZodDto } from "nestjs-zod";

// Single source of truth for the response shape (design.md Decision 14) — NoticesController
// uses NoticeResponseDto (z.infer of this) as its return type. ADR-008: plain title/body/locale,
// no per-request locale resolution.
export const noticeResponseSchema = z.object({
	id: z.string().uuid(),
	tenantId: z.string(),
	title: z.string(),
	body: z.string().nullable(),
	locale: z.string(),
	isPublished: z.boolean(),
	publishedAt: z.string().nullable(),
	audience: z.enum(["public", "private", "all"]),
	createdAt: z.string(),
	updatedAt: z.string(),
});

export type NoticeResponseDto = z.infer<typeof noticeResponseSchema>;

export class NoticeResponseSchema extends createZodDto(noticeResponseSchema) {}
