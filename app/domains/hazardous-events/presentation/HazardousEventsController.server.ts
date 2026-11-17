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
	UnprocessableEntityException,
	UseGuards,
} from "@nestjs/common";
import { ZodValidationPipe, createZodValidationPipe } from "nestjs-zod";
import type { z } from "zod";
import {
	ApiBadRequestResponse,
	ApiBody,
	ApiConflictResponse,
	ApiCreatedResponse,
	ApiForbiddenResponse,
	ApiNotFoundResponse,
	ApiOkResponse,
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
import { CreateHazardousEventRequest } from "./dto/CreateHazardousEventRequest";
import { UpdateHazardousEventRequest } from "./dto/UpdateHazardousEventRequest";
import { RecordSpatialObservationRequest } from "./dto/RecordSpatialObservationRequest";
import {
	HazardousEventResponseSchema,
	HazardousEventDetailResponseSchema,
	HazardousEventListResponseSchema,
	SpatialObservationResponseSchema,
} from "./dto/HazardousEventResponseDto";

import { ListHazardousEventsUseCase } from "~/domains/hazardous-events/application/use-cases/ListHazardousEvents";
import { GetHazardousEventByIdUseCase } from "~/domains/hazardous-events/application/use-cases/GetHazardousEventById";
import { CreateHazardousEventUseCase } from "~/domains/hazardous-events/application/use-cases/CreateHazardousEvent";
import { UpdateHazardousEventUseCase } from "~/domains/hazardous-events/application/use-cases/UpdateHazardousEvent";
import { DeleteHazardousEventUseCase } from "~/domains/hazardous-events/application/use-cases/DeleteHazardousEvent";
import { RecordSpatialObservationUseCase } from "~/domains/hazardous-events/application/use-cases/RecordSpatialObservation";

import { parsePagination } from "./parsePagination";
import { parseHazardousEventListFilters } from "./parseHazardousEventListFilters";

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
}
