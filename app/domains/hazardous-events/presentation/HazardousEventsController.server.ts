import {
	Body,
	Controller,
	Delete,
	Get,
	HttpCode,
	Inject,
	Param,
	Post,
	Put,
	Req,
	StreamableFile,
	UnprocessableEntityException,
	UploadedFile,
	UseGuards,
	UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ZodValidationPipe, createZodValidationPipe } from "nestjs-zod";
import { z } from "zod";
import {
	ApiBadRequestResponse,
	ApiBody,
	ApiConflictResponse,
	ApiConsumes,
	ApiCreatedResponse,
	ApiForbiddenResponse,
	ApiNotFoundResponse,
	ApiOkResponse,
	ApiNoContentResponse,
	ApiPayloadTooLargeResponse,
	ApiQuery,
	ApiSecurity,
	ApiUnauthorizedResponse,
	ApiUnprocessableEntityResponse,
} from "@nestjs/swagger";

import {
	ApiKeyOrSessionAuthGuard,
	PermissionsGuard,
	RequirePermission,
	type AuthenticatedRequest,
} from "./guards";
import {
	HazardousEventIdParam,
	ApiHazardousEventIdParam,
} from "./dto/HazardousEventIdParam";
import {
	HazardousEventAttachmentIdParam,
	ApiHazardousEventAttachmentIdParam,
} from "./dto/HazardousEventAttachmentIdParam";
import { CreateHazardousEventRequest } from "./dto/CreateHazardousEventRequest";
import { UpdateHazardousEventRequest } from "./dto/UpdateHazardousEventRequest";
import { RecordSpatialObservationRequest } from "./dto/RecordSpatialObservationRequest";
import { createHazardousEventAttachmentRequestSchema } from "./dto/CreateHazardousEventAttachmentRequest";
import { ValidationError } from "~/shared/errors";
import {
	HazardousEventResponseSchema,
	HazardousEventDetailResponseSchema,
	HazardousEventListResponseSchema,
	SpatialObservationResponseSchema,
	SpecificHazardOptionResponseSchema,
	HazardTaxonomyResponseSchema,
	HazardousEventAttachmentResponseSchema,
} from "./dto/HazardousEventResponseDto";

import { ListHazardousEventsUseCase } from "~/domains/hazardous-events/application/use-cases/ListHazardousEvents";
import { GetHazardousEventByIdUseCase } from "~/domains/hazardous-events/application/use-cases/GetHazardousEventById";
import { CreateHazardousEventUseCase } from "~/domains/hazardous-events/application/use-cases/CreateHazardousEvent";
import { UpdateHazardousEventUseCase } from "~/domains/hazardous-events/application/use-cases/UpdateHazardousEvent";
import { DeleteHazardousEventUseCase } from "~/domains/hazardous-events/application/use-cases/DeleteHazardousEvent";
import { RecordSpatialObservationUseCase } from "~/domains/hazardous-events/application/use-cases/RecordSpatialObservation";
import { GetHazardTaxonomyOptionsUseCase } from "~/domains/hazardous-events/application/use-cases/GetHazardTaxonomyOptionsUseCase";
import { AddHazardousEventAttachmentUseCase } from "~/domains/hazardous-events/application/use-cases/AddHazardousEventAttachment";
import { ListHazardousEventAttachmentsUseCase } from "~/domains/hazardous-events/application/use-cases/ListHazardousEventAttachments";
import { DeleteHazardousEventAttachmentUseCase } from "~/domains/hazardous-events/application/use-cases/DeleteHazardousEventAttachment";
import { DownloadHazardousEventAttachmentUseCase } from "~/domains/hazardous-events/application/use-cases/DownloadHazardousEventAttachment";

import { parsePagination } from "./parsePagination";
import { parseHazardousEventListFilters } from "./parseHazardousEventListFilters";
import ContentRepeaterFileValidator from "~/components/ContentRepeater/FileValidator";

// 422 for bodies vs. ZodValidationPipe's 400 default for :id (design.md Decision 4).
// DTO passed explicitly per instance — inferred param metatype isn't reliable under this project's build.
const ZodBodyValidationPipe = createZodValidationPipe({
	createValidationException: (error) =>
		new UnprocessableEntityException({
			message: "Validation failed",
			details: (error as z.ZodError).issues,
		}),
});

@Controller("hazardous-events")
@UseGuards(ApiKeyOrSessionAuthGuard, PermissionsGuard)
@ApiSecurity("x-auth")
@ApiUnauthorizedResponse({ description: "Authentication required." })
@ApiForbiddenResponse({ description: "Insufficient permissions." })
export class HazardousEventsController {
	constructor(
		@Inject(ListHazardousEventsUseCase)
		private readonly listHazardousEventsUseCase: ListHazardousEventsUseCase,
		@Inject(GetHazardousEventByIdUseCase)
		private readonly getHazardousEventByIdUseCase: GetHazardousEventByIdUseCase,
		@Inject(CreateHazardousEventUseCase)
		private readonly createHazardousEventUseCase: CreateHazardousEventUseCase,
		@Inject(UpdateHazardousEventUseCase)
		private readonly updateHazardousEventUseCase: UpdateHazardousEventUseCase,
		@Inject(DeleteHazardousEventUseCase)
		private readonly deleteHazardousEventUseCase: DeleteHazardousEventUseCase,
		@Inject(RecordSpatialObservationUseCase)
		private readonly recordSpatialObservationUseCase: RecordSpatialObservationUseCase,
		@Inject(GetHazardTaxonomyOptionsUseCase)
		private readonly getHazardTaxonomyOptionsUseCase: GetHazardTaxonomyOptionsUseCase,
		@Inject(AddHazardousEventAttachmentUseCase)
		private readonly addHazardousEventAttachmentUseCase: AddHazardousEventAttachmentUseCase,
		@Inject(ListHazardousEventAttachmentsUseCase)
		private readonly listHazardousEventAttachmentsUseCase: ListHazardousEventAttachmentsUseCase,
		@Inject(DeleteHazardousEventAttachmentUseCase)
		private readonly deleteHazardousEventAttachmentUseCase: DeleteHazardousEventAttachmentUseCase,
		@Inject(DownloadHazardousEventAttachmentUseCase)
		private readonly downloadHazardousEventAttachmentUseCase: DownloadHazardousEventAttachmentUseCase,
	) {}

	@Get()
	@RequirePermission("ViewData")
	@ApiQuery({ name: "page", required: false, type: Number })
	@ApiQuery({ name: "pageSize", required: false, type: Number })
	@ApiOkResponse({ type: HazardousEventListResponseSchema })
	async list(@Req() req: AuthenticatedRequest) {
		const searchParams = new URL(req.url, "http://placeholder.invalid")
			.searchParams;
		const { page, pageSize } = parsePagination(searchParams);
		const filters = parseHazardousEventListFilters(searchParams);
		return this.listHazardousEventsUseCase.execute({
			tenantId: req.tenantId,
			userId: req.userId,
			role: req.role ?? null,
			page,
			pageSize,
			filters,
		});
	}

	@Get("specific-hazards")
	@RequirePermission("ViewData")
	@ApiOkResponse({
		type: [SpecificHazardOptionResponseSchema],
		description: "List of all specific hazards available for selection.",
	})
	async listSpecificHazards() {
		const options = await this.getHazardTaxonomyOptionsUseCase.execute();
		return options.specificHazards;
	}

	@Get("taxonomy")
	@RequirePermission("ViewData")
	@ApiOkResponse({
		type: HazardTaxonomyResponseSchema,
		description:
			"Complete hazard taxonomy hierarchy (types, clusters, specific hazards).",
	})
	async getTaxonomy() {
		return this.getHazardTaxonomyOptionsUseCase.execute();
	}

	@Get(":id")
	@RequirePermission("ViewData")
	@ApiHazardousEventIdParam()
	@ApiOkResponse({ type: HazardousEventDetailResponseSchema })
	@ApiBadRequestResponse({ description: "`id` is not a UUID." })
	@ApiNotFoundResponse({
		description: "No hazardous event with this id in caller's tenant.",
	})
	async getById(
		@Req() req: AuthenticatedRequest,
		@Param(new ZodValidationPipe(HazardousEventIdParam))
		params: HazardousEventIdParam,
	) {
		return this.getHazardousEventByIdUseCase.execute({
			id: params.id,
			tenantId: req.tenantId,
		});
	}

	@Post()
	@RequirePermission("EditData")
	@ApiBody({ type: CreateHazardousEventRequest })
	@ApiCreatedResponse({ type: HazardousEventResponseSchema })
	@ApiUnprocessableEntityResponse({
		description: "Request body failed validation.",
	})
	async create(
		@Req() req: AuthenticatedRequest,
		@Body(new ZodBodyValidationPipe(CreateHazardousEventRequest))
		body: CreateHazardousEventRequest,
	) {
		return this.createHazardousEventUseCase.execute({
			tenantId: req.tenantId,
			actingUserId: req.userId,
			specificHazardId: body.specificHazardId,
			startDate: body.startDate,
			endDate: body.endDate,
			nationalSpecification: body.nationalSpecification,
			description: body.description,
			chainsExplanation: body.chainsExplanation,
			magnitude: body.magnitude,
			recordOriginator: body.recordOriginator,
			dataSource: body.dataSource,
			hazardousEventStatus: body.hazardousEventStatus,
			specificHazardLocalName: body.specificHazardLocalName,
			specificHazardNationalName: body.specificHazardNationalName,
			apiImportId: body.apiImportId,
			hazardDriverIds: body.hazardDriverIds,
			attachments: body.attachments,
			fieldValues: body.fieldValues,
			customFieldValues: body.customFieldValues,
			causeId: body.causeId,
			causalityExplanation: body.causalityExplanation,
		});
	}

	@Put(":id")
	@RequirePermission("EditData")
	@ApiHazardousEventIdParam()
	@ApiBody({ type: UpdateHazardousEventRequest })
	@ApiOkResponse({ type: HazardousEventResponseSchema })
	@ApiBadRequestResponse({ description: "`id` is not a UUID." })
	@ApiNotFoundResponse({
		description: "No hazardous event with this id in caller's tenant.",
	})
	@ApiUnprocessableEntityResponse({
		description: "Request body failed validation.",
	})
	async update(
		@Req() req: AuthenticatedRequest,
		@Param(new ZodValidationPipe(HazardousEventIdParam))
		params: HazardousEventIdParam,
		@Body(new ZodBodyValidationPipe(UpdateHazardousEventRequest))
		body: UpdateHazardousEventRequest,
	) {
		const spatialObservation = body.spatialObservation
			? {
					...body.spatialObservation,
					observationTime: body.spatialObservation.observationTime
						? new Date(body.spatialObservation.observationTime)
						: undefined,
				}
			: undefined;

		return this.updateHazardousEventUseCase.execute({
			id: params.id,
			tenantId: req.tenantId,
			actingUserId: req.userId,
			specificHazardId: body.specificHazardId,
			startDate: body.startDate,
			endDate: body.endDate,
			nationalSpecification: body.nationalSpecification,
			description: body.description,
			chainsExplanation: body.chainsExplanation,
			magnitude: body.magnitude,
			recordOriginator: body.recordOriginator,
			dataSource: body.dataSource,
			hazardousEventStatus: body.hazardousEventStatus,
			specificHazardLocalName: body.specificHazardLocalName,
			specificHazardNationalName: body.specificHazardNationalName,
			hazardDriverIds: body.hazardDriverIds,
			attachments: body.attachments,
			fieldValues: body.fieldValues,
			customFieldValues: body.customFieldValues,
			causeId: body.causeId,
			causalityExplanation: body.causalityExplanation,
			spatialObservation,
		});
	}

	@Delete(":id")
	@HttpCode(204)
	@RequirePermission("EditData")
	@ApiHazardousEventIdParam()
	@ApiBadRequestResponse({ description: "`id` is not a UUID." })
	@ApiNotFoundResponse({
		description: "No hazardous event with this id in caller's tenant.",
	})
	@ApiConflictResponse({
		description: "Cannot delete an event that has dependents.",
	})
	async remove(
		@Req() req: AuthenticatedRequest,
		@Param(new ZodValidationPipe(HazardousEventIdParam))
		params: HazardousEventIdParam,
	): Promise<void> {
		await this.deleteHazardousEventUseCase.execute({
			id: params.id,
			tenantId: req.tenantId,
			actingUserId: req.userId,
		});
	}

	@Post(":id/spatial-observations")
	@RequirePermission("EditData")
	@ApiHazardousEventIdParam()
	@ApiBody({ type: RecordSpatialObservationRequest })
	@ApiCreatedResponse({ type: SpatialObservationResponseSchema })
	@ApiBadRequestResponse({
		description: "`id` is not a UUID or invalid observationTime.",
	})
	@ApiNotFoundResponse({
		description: "No hazardous event with this id in caller's tenant.",
	})
	@ApiConflictResponse({
		description: "Duplicate observation timestamp without confirmReplace.",
	})
	@ApiUnprocessableEntityResponse({
		description: "Request body failed validation.",
	})
	async recordSpatialObservation(
		@Req() req: AuthenticatedRequest,
		@Param(new ZodValidationPipe(HazardousEventIdParam))
		params: HazardousEventIdParam,
		@Body(new ZodBodyValidationPipe(RecordSpatialObservationRequest))
		body: RecordSpatialObservationRequest,
	) {
		const observationTime = body.observationTime
			? new Date(body.observationTime)
			: undefined;

		return this.recordSpatialObservationUseCase.execute({
			tenantId: req.tenantId,
			hazardousEventId: params.id,
			observationTime,
			geometries: body.geometries,
			divisionIds: body.divisionIds,
			note: body.note,
			confirmReplace: body.confirmReplace,
		});
	}

	@Get(":id/attachments")
	@RequirePermission("ViewData")
	@ApiHazardousEventIdParam()
	@ApiOkResponse({
		type: [HazardousEventAttachmentResponseSchema],
		description: "List all attachments for the specified hazardous event.",
	})
	@ApiBadRequestResponse({ description: "`id` is not a UUID." })
	@ApiNotFoundResponse({
		description: "No hazardous event with this id in caller's tenant.",
	})
	async listAttachments(
		@Req() req: AuthenticatedRequest,
		@Param(new ZodValidationPipe(HazardousEventIdParam))
		params: HazardousEventIdParam,
	) {
		return this.listHazardousEventAttachmentsUseCase.execute({
			tenantId: req.tenantId,
			hazardousEventId: params.id,
		});
	}

	@Post(":id/attachments")
	@RequirePermission("EditData")
	@UseInterceptors(
		FileInterceptor("file", {
			limits: { fileSize: ContentRepeaterFileValidator.maxFileSize },
		}),
	)
	@ApiConsumes("multipart/form-data", "application/json")
	@ApiHazardousEventIdParam()
	@ApiBody({
		schema: {
			type: "object",
			properties: {
				file: {
					type: "string",
					format: "binary",
					description: "Physical file to upload (multipart/form-data)",
				},
				title: {
					type: "string",
					description:
						"Attachment title (defaults to file name if omitted in multipart upload)",
				},
				fileKey: {
					type: "string",
					description:
						"Storage key/path of pre-uploaded file (required for application/json)",
				},
				fileName: {
					type: "string",
					description: "Original file name (required for application/json)",
				},
				fileType: {
					type: "string",
					description: "MIME type (required for application/json)",
				},
				fileSize: {
					type: "integer",
					minimum: 0,
					description: "File size in bytes (required for application/json)",
				},
			},
		},
	})
	@ApiCreatedResponse({
		type: HazardousEventAttachmentResponseSchema,
		description: "Attachment successfully saved to hazardous event.",
	})
	@ApiBadRequestResponse({
		description: "`id` is not a UUID.",
	})
	@ApiNotFoundResponse({
		description: "No hazardous event with this id in caller's tenant.",
	})
	@ApiConflictResponse({
		description: "An attachment with the specified `id` already exists.",
	})
	@ApiPayloadTooLargeResponse({
		description: "Uploaded file exceeds the 10MB maximum size.",
	})
	@ApiUnprocessableEntityResponse({
		description:
			"Request body failed validation, missing file field, or invalid file type.",
	})
	async addAttachment(
		@Req() req: AuthenticatedRequest,
		@Param(new ZodValidationPipe(HazardousEventIdParam))
		params: HazardousEventIdParam,
		@UploadedFile()
		file?: {
			fieldname: string;
			originalname: string;
			mimetype: string;
			size: number;
			buffer: Buffer;
		},
		@Body()
		body?: Record<string, unknown>,
	) {
		const isMultipart = (req.headers["content-type"] || "")
			.toLowerCase()
			.includes("multipart/form-data");

		if (isMultipart && !file) {
			throw new ValidationError("file is required");
		}

		if (file) {
			const title =
				typeof body?.title === "string" && body.title.trim().length > 0
					? body.title.trim()
					: file.originalname;

			let id: string | undefined = undefined;
			if (typeof body?.id === "string" && body.id.trim().length > 0) {
				const uuidResult = z.string().uuid().safeParse(body.id.trim());
				if (!uuidResult.success) {
					throw new ValidationError("id must be a valid UUID");
				}
				id = uuidResult.data;
			}

			return this.addHazardousEventAttachmentUseCase.execute({
				tenantId: req.tenantId,
				hazardousEventId: params.id,
				title,
				id,
				file: {
					originalName: file.originalname,
					mimeType: file.mimetype || "application/octet-stream",
					buffer: file.buffer,
				},
			});
		}

		const parsed = createHazardousEventAttachmentRequestSchema.safeParse(body);
		if (!parsed.success) {
			throw new UnprocessableEntityException({
				message: "Validation failed",
				details: parsed.error.issues,
			});
		}

		return this.addHazardousEventAttachmentUseCase.execute({
			tenantId: req.tenantId,
			hazardousEventId: params.id,
			id: parsed.data.id,
			title: parsed.data.title,
			fileKey: parsed.data.fileKey,
			fileName: parsed.data.fileName,
			fileType: parsed.data.fileType,
			fileSize: parsed.data.fileSize,
		});
	}

	@Get(":id/attachments/:attachmentId/download")
	@RequirePermission("ViewData")
	@ApiHazardousEventAttachmentIdParam()
	@ApiOkResponse({
		description: "Binary stream of the attachment file.",
	})
	@ApiBadRequestResponse({
		description: "`id` or `attachmentId` is not a UUID.",
	})
	@ApiNotFoundResponse({
		description:
			"No hazardous event with this id in caller's tenant, attachment not found on this event, or file missing from storage.",
	})
	async downloadAttachment(
		@Req() req: AuthenticatedRequest,
		@Param(new ZodValidationPipe(HazardousEventAttachmentIdParam))
		params: HazardousEventAttachmentIdParam,
	): Promise<StreamableFile> {
		const result = await this.downloadHazardousEventAttachmentUseCase.execute({
			tenantId: req.tenantId,
			hazardousEventId: params.id,
			attachmentId: params.attachmentId,
		});

		const asciiFallback = result.fileName.replace(/[^\x20-\x7E]|["\\]/g, "_");
		const encodedFileName = encodeURIComponent(result.fileName);

		return new StreamableFile(result.stream, {
			type: result.fileType,
			disposition: `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodedFileName}`,
			length: result.fileSize,
		});
	}

	@Delete(":id/attachments/:attachmentId")
	@HttpCode(204)
	@RequirePermission("EditData")
	@ApiHazardousEventAttachmentIdParam()
	@ApiNoContentResponse({
		description: "Attachment successfully deleted from hazardous event.",
	})
	@ApiBadRequestResponse({
		description: "`id` or `attachmentId` is not a UUID.",
	})
	@ApiNotFoundResponse({
		description:
			"No hazardous event with this id in caller's tenant, or attachment not found on this event.",
	})
	async deleteAttachment(
		@Req() req: AuthenticatedRequest,
		@Param(new ZodValidationPipe(HazardousEventAttachmentIdParam))
		params: HazardousEventAttachmentIdParam,
	): Promise<void> {
		await this.deleteHazardousEventAttachmentUseCase.execute({
			tenantId: req.tenantId,
			hazardousEventId: params.id,
			attachmentId: params.attachmentId,
		});
	}
}
