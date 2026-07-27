import { z } from "zod";
import { createZodDto } from "nestjs-zod";

import { VALID_LANGUAGES } from "~/utils/lang.backend";

// Mirrors UpdateNoticeCommand's optional fields. No publishedAt — it is derived, never
// client-supplied. ADR-008: single-locale content, same shape as CreateNoticeRequest.
export const updateNoticeRequestSchema = z.object({
	title: z.string().min(1).optional(),
	body: z.string().nullable().optional(),
	locale: z.enum(VALID_LANGUAGES as [string, ...string[]]).optional(),
	isPublished: z.boolean().optional(),
});

export class UpdateNoticeRequest extends createZodDto(
	updateNoticeRequestSchema,
) {}
