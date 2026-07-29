import { z } from "zod";
import { createZodDto } from "nestjs-zod";
import { applyDecorators } from "@nestjs/common";
import { ApiParam } from "@nestjs/swagger";

export const noticeIdParamSchema = z.object({
	id: z.string().uuid(),
});

export class NoticeIdParam extends createZodDto(noticeIdParamSchema) {}

// One definition of the :id param's documented shape, reused on every handler that takes
// it (getById/update/remove) — keeps the contract in one place instead of three copies.
export const ApiNoticeIdParam = () =>
	applyDecorators(ApiParam({ name: "id", type: String, format: "uuid" }));
