import { z } from "zod";
import { createZodDto } from "nestjs-zod";
import { HAZARDOUS_EVENT_STATUS_VALUES } from "~/domains/hazardous-events/domain/HazardousEvent";
import { STATUS_VALUES } from "~/domains/validation-workflow/domain/WorkflowInstance";

export const spatialObservationResponseSchema = z.object({
	id: z.string().uuid(),
	hazardousEventId: z.string().uuid(),
	observationTime: z.string(),
	note: z.string().nullable(),
	geometries: z.array(z.unknown()),
	divisionIds: z.array(z.string().uuid()),
	createdAt: z.string(),
	updatedAt: z.string(),
});

export class SpatialObservationResponseSchema extends createZodDto(
	spatialObservationResponseSchema,
) {}

export const attachmentResponseSchema = z.object({
	id: z.string(),
	title: z.string(),
	fileKey: z.string(),
	fileName: z.string(),
	fileType: z.string(),
	fileSize: z.number(),
});

export const fieldValueResponseSchema = z.object({
	hazardTypeFieldDefinitionId: z.string().uuid(),
	value: z.string(),
});

export const customFieldValueResponseSchema = z.object({
	hazardTypeCustomFieldDefinitionId: z.string().uuid(),
	value: z.string(),
});

export const hazardousEventResponseSchema = z.object({
	id: z.string().uuid(),
	tenantId: z.string(),
	specificHazardId: z.string().uuid(),
	startDate: z.string(),
	endDate: z.string(),
	nationalSpecification: z.string(),
	description: z.string(),
	chainsExplanation: z.string(),
	magnitude: z.string(),
	recordOriginator: z.string(),
	dataSource: z.string(),
	hazardousEventStatus: z.enum(HAZARDOUS_EVENT_STATUS_VALUES).nullable(),
	specificHazardLocalName: z.string().nullable(),
	specificHazardNationalName: z.string().nullable(),
	apiImportId: z.string().nullable(),
	createdByUserId: z.string().nullable(),
	updatedByUserId: z.string().nullable(),
	submittedByUserId: z.string().nullable(),
	submittedAt: z.string().nullable(),
	createdAt: z.string(),
	updatedAt: z.string().nullable(),
	hazardDriverIds: z.array(z.string().uuid()),
	attachments: z.array(attachmentResponseSchema),
	fieldValues: z.array(fieldValueResponseSchema),
	customFieldValues: z.array(customFieldValueResponseSchema),
	workflowStatus: z.enum(STATUS_VALUES).nullable(),
});

export class HazardousEventResponseSchema extends createZodDto(
	hazardousEventResponseSchema,
) {}

export const hazardousEventDetailResponseSchema =
	hazardousEventResponseSchema.extend({
		currentSpatialObservation: spatialObservationResponseSchema.nullable(),
		specificHazardName: z.string().nullable(),
		hazardClusterName: z.string().nullable(),
		hazardTypeName: z.string().nullable(),
	});

export class HazardousEventDetailResponseSchema extends createZodDto(
	hazardousEventDetailResponseSchema,
) {}

export const hazardousEventListItemResponseSchema =
	hazardousEventResponseSchema.extend({
		specificHazardName: z.string().nullable(),
	});

export const hazardousEventListResponseSchema = z.object({
	items: z.array(hazardousEventListItemResponseSchema),
	totalCount: z.number().int(),
	unfilteredTotalCount: z.number().int(),
});

export class HazardousEventListResponseSchema extends createZodDto(
	hazardousEventListResponseSchema,
) {}

export const specificHazardOptionResponseSchema = z.object({
	id: z.string().uuid(),
	clusterId: z.string().uuid(),
	name: z.string(),
	code: z.string(),
});

export class SpecificHazardOptionResponseSchema extends createZodDto(
	specificHazardOptionResponseSchema,
) {}

export const hazardClusterOptionResponseSchema = z.object({
	id: z.string().uuid(),
	typeId: z.string().uuid(),
	name: z.string(),
});

export class HazardClusterOptionResponseSchema extends createZodDto(
	hazardClusterOptionResponseSchema,
) {}

export const hazardTypeOptionResponseSchema = z.object({
	id: z.string().uuid(),
	name: z.string(),
});

export class HazardTypeOptionResponseSchema extends createZodDto(
	hazardTypeOptionResponseSchema,
) {}

export const hazardTaxonomyResponseSchema = z.object({
	types: z.array(hazardTypeOptionResponseSchema),
	clusters: z.array(hazardClusterOptionResponseSchema),
	specificHazards: z.array(specificHazardOptionResponseSchema),
});

export class HazardTaxonomyResponseSchema extends createZodDto(
	hazardTaxonomyResponseSchema,
) {}

export const hazardousEventAttachmentResponseSchema = z.object({
	id: z.string().uuid(),
	hazardousEventId: z.string().uuid(),
	title: z.string(),
	fileKey: z.string(),
	fileName: z.string(),
	fileType: z.string(),
	fileSize: z.number(),
	createdAt: z.string(),
	updatedAt: z.string(),
});

export class HazardousEventAttachmentResponseSchema extends createZodDto(
	hazardousEventAttachmentResponseSchema,
) {}
