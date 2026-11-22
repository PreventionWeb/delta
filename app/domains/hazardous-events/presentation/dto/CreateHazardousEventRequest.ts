import { z } from "zod";
import { createZodDto } from "nestjs-zod";
import { HAZARDOUS_EVENT_STATUS_VALUES } from "~/domains/hazardous-events/domain/HazardousEvent";
import {
	isValidFlexibleDateFormat,
	normalizeFlexibleDateCeiling,
	normalizeFlexibleDateFloor,
} from "~/domains/shared/domain/flexibleDateFormat";

export const flexibleDateSchema = z
	.string()
	.min(1)
	.refine(isValidFlexibleDateFormat, {
		message:
			"Invalid date format: must be YYYY, YYYY-MM, or YYYY-MM-DD (zero-padded, valid calendar date)",
	});

export const hazardousEventAttachmentRequestSchema = z.object({
	id: z
		.string()
		.uuid()
		.default(() => crypto.randomUUID()),
	title: z.string().min(1),
	fileKey: z.string().min(1),
	fileName: z.string().min(1),
	fileType: z.string().min(1),
	fileSize: z.number().int().nonnegative(),
});

export const hazardousEventFieldValueRequestSchema = z.object({
	hazardTypeFieldDefinitionId: z.string().uuid(),
	value: z.string(),
});

export const hazardousEventCustomFieldValueRequestSchema = z.object({
	hazardTypeCustomFieldDefinitionId: z.string().uuid(),
	value: z.string(),
});

export const createHazardousEventRequestSchema = z
	.object({
		specificHazardId: z.string().uuid(),
		startDate: flexibleDateSchema,
		endDate: flexibleDateSchema,
		nationalSpecification: z.string().default(""),
		description: z.string().default(""),
		chainsExplanation: z.string().default(""),
		magnitude: z.string().default(""),
		recordOriginator: z.string().default(""),
		dataSource: z.string().default(""),
		hazardousEventStatus: z
			.enum(HAZARDOUS_EVENT_STATUS_VALUES)
			.nullable()
			.optional()
			.default(null),
		specificHazardLocalName: z.string().nullable().optional().default(null),
		specificHazardNationalName: z.string().nullable().optional().default(null),
		apiImportId: z.string().nullable().optional().default(null),
		hazardDriverIds: z.array(z.string().uuid()).default([]),
		attachments: z.array(hazardousEventAttachmentRequestSchema).default([]),
		fieldValues: z.array(hazardousEventFieldValueRequestSchema).default([]),
		customFieldValues: z
			.array(hazardousEventCustomFieldValueRequestSchema)
			.default([]),
		causeId: z.string().uuid().optional(),
		causalityExplanation: z.string().nullable().optional().default(null),
	})
	.refine(
		(data) => {
			if (
				isValidFlexibleDateFormat(data.startDate) &&
				isValidFlexibleDateFormat(data.endDate)
			) {
				return (
					normalizeFlexibleDateFloor(data.startDate) <=
					normalizeFlexibleDateCeiling(data.endDate)
				);
			}
			return true;
		},
		{
			message: "startDate must not be later than endDate",
			path: ["endDate"],
		},
	);

export class CreateHazardousEventRequest extends createZodDto(
	createHazardousEventRequestSchema,
) {}
