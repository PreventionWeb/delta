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
	ApiCookieAuth,
	ApiCreatedResponse,
	ApiNotFoundResponse,
	ApiOkResponse,
	ApiQuery,
	ApiUnauthorizedResponse,
	ApiUnprocessableEntityResponse,
} from "@nestjs/swagger";

import { CreateNoticeUseCase } from "~/domains/notices/application/use-cases/CreateNotice";
import { ListNoticesUseCase } from "~/domains/notices/application/use-cases/ListNotices";
import { GetNoticeByIdUseCase } from "~/domains/notices/application/use-cases/GetNoticeById";
import { UpdateNoticeUseCase } from "~/domains/notices/application/use-cases/UpdateNotice";
import { DeleteNoticeUseCase } from "~/domains/notices/application/use-cases/DeleteNotice";
import {
	SessionAuthGuard,
	type AuthenticatedRequest,
} from "~/domains/notices/presentation/guards/SessionAuthGuard.server";
import {
	NoticeIdParam,
	ApiNoticeIdParam,
} from "~/domains/notices/presentation/dto/NoticeIdParam";
import { CreateNoticeRequest } from "~/domains/notices/presentation/dto/CreateNoticeRequest";
import { UpdateNoticeRequest } from "~/domains/notices/presentation/dto/UpdateNoticeRequest";
import { NoticeResponseSchema } from "~/domains/notices/presentation/dto/NoticeResponseSchema";
import { parsePagination } from "~/domains/notices/presentation/parsePagination";

// 422 for bodies vs. ZodValidationPipe's 400 default for :id (design.md Decision 5).
// DTO passed explicitly per instance — inferred param metatype isn't reliable under this project's build.
const ZodBodyValidationPipe = createZodValidationPipe({
	createValidationException: (error) =>
		new UnprocessableEntityException({
			message: "Validation failed",
			details: (error as z.ZodError).issues,
		}),
});

@Controller("notices")
@UseGuards(SessionAuthGuard)
@ApiCookieAuth()
@ApiUnauthorizedResponse({ description: "Authentication required." })
export class NoticesController {
	constructor(
		@Inject(CreateNoticeUseCase)
		private readonly createNoticeUseCase: CreateNoticeUseCase,
		@Inject(ListNoticesUseCase)
		private readonly listNoticesUseCase: ListNoticesUseCase,
		@Inject(GetNoticeByIdUseCase)
		private readonly getNoticeByIdUseCase: GetNoticeByIdUseCase,
		@Inject(UpdateNoticeUseCase)
		private readonly updateNoticeUseCase: UpdateNoticeUseCase,
		@Inject(DeleteNoticeUseCase)
		private readonly deleteNoticeUseCase: DeleteNoticeUseCase,
	) {}

	@Get()
	@ApiQuery({ name: "page", required: false, type: Number })
	@ApiQuery({ name: "pageSize", required: false, type: Number })
	@ApiOkResponse({ type: NoticeResponseSchema, isArray: true })
	async list(@Req() req: AuthenticatedRequest) {
		// Placeholder base only — URL() requires one to parse a relative path; only .searchParams is ever read.
		const { page, pageSize } = parsePagination(
			new URL(req.url, "http://placeholder.invalid"),
		);
		return this.listNoticesUseCase.execute({
			tenantId: req.tenantId,
			page,
			pageSize,
		});
	}

	@Get(":id")
	@ApiNoticeIdParam()
	@ApiOkResponse({ type: NoticeResponseSchema })
	@ApiBadRequestResponse({ description: "`id` is not a UUID." })
	@ApiNotFoundResponse({
		description: "No notice with this id in the caller's tenant.",
	})
	async getById(
		@Req() req: AuthenticatedRequest,
		@Param(new ZodValidationPipe(NoticeIdParam)) params: NoticeIdParam,
	) {
		return this.getNoticeByIdUseCase.execute({
			id: params.id,
			tenantId: req.tenantId,
		});
	}

	@Post()
	@ApiBody({
		type: CreateNoticeRequest,
		examples: {
			example: {
				summary: "Notice authored in French",
				value: {
					title: "Nouvel avis",
					body: "Corps de l'avis",
					locale: "fr",
					isPublished: false,
				},
			},
		},
	})
	@ApiCreatedResponse({ type: NoticeResponseSchema })
	@ApiUnprocessableEntityResponse({
		description: "Request body failed validation.",
	})
	async create(
		@Req() req: AuthenticatedRequest,
		@Body(new ZodBodyValidationPipe(CreateNoticeRequest))
		body: CreateNoticeRequest,
	) {
		return this.createNoticeUseCase.execute({
			tenantId: req.tenantId,
			title: body.title,
			body: body.body,
			locale: body.locale,
			isPublished: body.isPublished,
		});
	}

	@Put(":id")
	@ApiNoticeIdParam()
	@ApiBody({
		type: UpdateNoticeRequest,
		examples: {
			example: {
				summary: "Partial update: title and body",
				value: {
					title: "Avis mis à jour",
					body: "Corps mis à jour",
					isPublished: true,
				},
			},
		},
	})
	@ApiOkResponse({ type: NoticeResponseSchema })
	@ApiBadRequestResponse({ description: "`id` is not a UUID." })
	@ApiNotFoundResponse({
		description: "No notice with this id in the caller's tenant.",
	})
	@ApiUnprocessableEntityResponse({
		description: "Request body failed validation.",
	})
	async update(
		@Req() req: AuthenticatedRequest,
		@Param(new ZodValidationPipe(NoticeIdParam)) params: NoticeIdParam,
		@Body(new ZodBodyValidationPipe(UpdateNoticeRequest))
		body: UpdateNoticeRequest,
	) {
		return this.updateNoticeUseCase.execute({
			id: params.id,
			tenantId: req.tenantId,
			...body,
		});
	}

	@Delete(":id")
	@HttpCode(204)
	@ApiNoticeIdParam()
	@ApiBadRequestResponse({ description: "`id` is not a UUID." })
	@ApiNotFoundResponse({
		description: "No notice with this id in the caller's tenant.",
	})
	async remove(
		@Req() req: AuthenticatedRequest,
		@Param(new ZodValidationPipe(NoticeIdParam)) params: NoticeIdParam,
	): Promise<void> {
		await this.deleteNoticeUseCase.execute({
			id: params.id,
			tenantId: req.tenantId,
		});
	}
}
