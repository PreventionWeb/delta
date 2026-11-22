import { z } from "zod";
import { createZodDto } from "nestjs-zod";
import { applyDecorators } from "@nestjs/common";
import { ApiParam } from "@nestjs/swagger";

export const hazardousEventAttachmentIdParamSchema = z.object({
	id: z.string().uuid(),
	attachmentId: z.string().uuid(),
});

export class HazardousEventAttachmentIdParam extends createZodDto(
	hazardousEventAttachmentIdParamSchema,
) {}

export const ApiHazardousEventAttachmentIdParam = () =>
	applyDecorators(
		ApiParam({ name: "id", type: String, format: "uuid" }),
		ApiParam({ name: "attachmentId", type: String, format: "uuid" }),
	);
