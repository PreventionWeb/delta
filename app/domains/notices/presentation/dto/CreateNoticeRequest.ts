import { z } from "zod";
import { createZodDto } from "nestjs-zod";

import { VALID_LANGUAGES } from "~/utils/lang.backend";

// ADR-008: single-locale content — plain title/body strings plus the locale they're
// authored in. No more locale-map key restriction (design.md Decision 17 is moot).
export const createNoticeRequestSchema = z.object({
	title: z.string().min(1),
	body: z.string().nullable(),
	locale: z.enum(VALID_LANGUAGES as [string, ...string[]]),
	isPublished: z.boolean(),
});

export class CreateNoticeRequest extends createZodDto(
	createNoticeRequestSchema,
) {}
