import { z } from "zod";
import { createZodDto } from "nestjs-zod";
import { applyDecorators } from "@nestjs/common";
import { ApiParam } from "@nestjs/swagger";

export const hazardousEventIdParamSchema = z.object({
	id: z.string().uuid(),
});

export class HazardousEventIdParam extends createZodDto(
	hazardousEventIdParamSchema,
) {}

// One definition of the :id param's documented shape, reused on every handler that takes
// it (getById/update/remove/spatial-observations) — keeps the contract in one place.
export const ApiHazardousEventIdParam = () =>
	applyDecorators(ApiParam({ name: "id", type: String, format: "uuid" }));
