import { z } from "zod";
import { createZodDto } from "nestjs-zod";

export const recordSpatialObservationRequestSchema = z.object({
	observationTime: z.string().optional(),
	geometries: z.array(z.unknown()).default([]),
	divisionIds: z.array(z.string().uuid()).default([]),
	note: z.string().nullable().optional().default(null),
	confirmReplace: z.boolean().optional().default(false),
});

export class RecordSpatialObservationRequest extends createZodDto(
	recordSpatialObservationRequestSchema,
) {}
