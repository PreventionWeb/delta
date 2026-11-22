import { z } from "zod";
import { createZodDto } from "nestjs-zod";

export const createHazardousEventAttachmentRequestSchema = z.object({
	id: z.string().uuid().optional(),
	title: z.string().min(1),
	fileKey: z.string().min(1),
	fileName: z.string().min(1),
	fileType: z.string().min(1),
	fileSize: z.number().int().nonnegative(),
});

export class CreateHazardousEventAttachmentRequest extends createZodDto(
	createHazardousEventAttachmentRequestSchema,
) {}
