import { z } from "zod";
import { createZodDto } from "nestjs-zod";
import { HAZARDOUS_EVENT_STATUS_VALUES } from "~/domains/hazardous-events/domain/HazardousEvent";
import {
	hazardousEventAttachmentRequestSchema,
	hazardousEventFieldValueRequestSchema,
	hazardousEventCustomFieldValueRequestSchema,
} from "./CreateHazardousEventRequest";

export const embeddedSpatialObservationRequestSchema = z.object({
	observationTime: z.string().optional(),
	geometries: z.array(z.unknown()),
	divisionIds: z.array(z.string().uuid()),
	note: z.string().nullable().optional(),
	confirmReplace: z.boolean().optional(),
});

export const updateHazardousEventRequestSchema = z.object({
	specificHazardId: z.string().uuid().optional(),
	startDate: z.string().min(1).optional(),
	endDate: z.string().min(1).optional(),
	nationalSpecification: z.string().optional(),
	description: z.string().optional(),
	chainsExplanation: z.string().optional(),
	magnitude: z.string().optional(),
	recordOriginator: z.string().optional(),
	dataSource: z.string().optional(),
	hazardousEventStatus: z
		.enum(HAZARDOUS_EVENT_STATUS_VALUES)
		.nullable()
		.optional(),
	specificHazardLocalName: z.string().nullable().optional(),
	specificHazardNationalName: z.string().nullable().optional(),
	hazardDriverIds: z.array(z.string().uuid()).optional(),
	attachments: z.array(hazardousEventAttachmentRequestSchema).optional(),
	fieldValues: z.array(hazardousEventFieldValueRequestSchema).optional(),
	customFieldValues: z
		.array(hazardousEventCustomFieldValueRequestSchema)
		.optional(),
	causeId: z.string().uuid().nullable().optional(),
	causalityExplanation: z.string().nullable().optional(),
	spatialObservation: embeddedSpatialObservationRequestSchema.optional(),
});

export class UpdateHazardousEventRequest extends createZodDto(
	updateHazardousEventRequestSchema,
) {}
