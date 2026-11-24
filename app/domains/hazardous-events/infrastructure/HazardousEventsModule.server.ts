import {
	Module,
	type MiddlewareConsumer,
	type NestModule,
} from "@nestjs/common";

import { DrizzleProvider } from "~/infrastructure/DrizzleProvider.server";
import { TRANSACTION_RUNNER } from "~/infrastructure/TransactionRunnerToken";
import { DrizzleTransactionRunner } from "~/infrastructure/DrizzleTransactionRunner.server";
import { getPinoLogger } from "~/infrastructure/logging/PinoLogger.server";
import type { ITransactionRunner } from "~/shared/persistence/ITransactionRunner";
import { RequestContextMiddleware } from "~/infrastructure/RequestContextMiddleware.server";

import { ValidationWorkflowModule } from "~/domains/validation-workflow/infrastructure/ValidationWorkflowModule.server";
import { InitializeWorkflowInstanceUseCase } from "~/domains/validation-workflow/application/use-cases/InitializeWorkflowInstance";
import { DeleteWorkflowInstanceUseCase } from "~/domains/validation-workflow/application/use-cases/DeleteWorkflowInstance";
import { GetWorkflowInstanceByEntityUseCase } from "~/domains/validation-workflow/application/use-cases/GetWorkflowInstanceByEntity";
import { ListWorkflowInstancesByEntityIdsUseCase } from "~/domains/validation-workflow/application/use-cases/ListWorkflowInstancesByEntityIds";

import { EventCausalityModule } from "~/domains/event-causality/infrastructure/EventCausalityModule.server";
import { EVENT_CAUSALITY_REPOSITORY } from "~/domains/event-causality/infrastructure/EventCausalityRepositoryToken";
import type { IEventCausalityRepository } from "~/domains/event-causality/application/ports/IEventCausalityRepository";

import { SharedAttachmentStorageModule } from "~/domains/shared/attachments/infrastructure/SharedAttachmentStorageModule.server";
import { ATTACHMENT_STORAGE_PORT } from "~/domains/shared/attachments/infrastructure/AttachmentStoragePortToken";
import type { IAttachmentStoragePort } from "~/domains/shared/attachments/application/ports/IAttachmentStoragePort";

import { SharedAuditLogModule } from "~/domains/shared/audit-log/infrastructure/SharedAuditLogModule.server";
import { AUDIT_LOG_PORT } from "~/domains/shared/audit-log/infrastructure/AuditLogPortToken";
import type { IAuditLogPort } from "~/domains/shared/audit-log/application/ports/IAuditLogPort";

import { GetHazardousEventByIdUseCase } from "~/domains/hazardous-events/application/use-cases/GetHazardousEventById";
import { ListHazardousEventsUseCase } from "~/domains/hazardous-events/application/use-cases/ListHazardousEvents";
import { GetHazardTaxonomyOptionsUseCase } from "~/domains/hazardous-events/application/use-cases/GetHazardTaxonomyOptionsUseCase";
import { RecordSpatialObservationUseCase } from "~/domains/hazardous-events/application/use-cases/RecordSpatialObservation";
import { CreateHazardousEventUseCase } from "~/domains/hazardous-events/application/use-cases/CreateHazardousEvent";
import { DeleteHazardousEventUseCase } from "~/domains/hazardous-events/application/use-cases/DeleteHazardousEvent";
import { UpdateHazardousEventUseCase } from "~/domains/hazardous-events/application/use-cases/UpdateHazardousEvent";
import { AddHazardousEventAttachmentUseCase } from "~/domains/hazardous-events/application/use-cases/AddHazardousEventAttachment";
import { ListHazardousEventAttachmentsUseCase } from "~/domains/hazardous-events/application/use-cases/ListHazardousEventAttachments";
import { DeleteHazardousEventAttachmentUseCase } from "~/domains/hazardous-events/application/use-cases/DeleteHazardousEventAttachment";
import { DownloadHazardousEventAttachmentUseCase } from "~/domains/hazardous-events/application/use-cases/DownloadHazardousEventAttachment";
import type { IHazardousEventRepository } from "~/domains/hazardous-events/application/ports/IHazardousEventRepository";
import type { IDivisionRepository } from "~/domains/hazardous-events/application/ports/IDivisionRepository";
import type { ICausalChainRepository } from "~/domains/hazardous-events/application/ports/ICausalChainRepository";
import type { IHazardTaxonomyRepository } from "~/domains/hazardous-events/application/ports/IHazardTaxonomyRepository";
import type { ISpecificHazardTaxonomyRepository } from "~/domains/hazardous-events/application/ports/ISpecificHazardTaxonomyRepository";
import type { IHazardousEventAttachmentRepository } from "~/domains/hazardous-events/application/ports/IHazardousEventAttachmentRepository";
import type { IHazardousEventAttachmentStorageService } from "~/domains/hazardous-events/application/ports/IHazardousEventAttachmentStorageService";
import type { IHipCrosswalkPort } from "~/domains/hazardous-events/application/ports/IHipCrosswalkPort";

import { HazardousEventsController } from "~/domains/hazardous-events/presentation/HazardousEventsController.server";
import {
	ApiKeyAuthGuard,
	SessionAuthGuard,
	ApiKeyOrSessionAuthGuard,
	PermissionsGuard,
} from "~/domains/hazardous-events/presentation/guards";

import { DrizzleHazardousEventRepository } from "./DrizzleHazardousEventRepository.server";
import { DrizzleCausalChainRepository } from "./DrizzleCausalChainRepository.server";
import { DrizzleHazardTaxonomyRepository } from "./DrizzleHazardTaxonomyRepository.server";
import { DrizzleSpecificHazardTaxonomyRepository } from "./DrizzleSpecificHazardTaxonomyRepository.server";
import { DrizzleDivisionRepository } from "./DrizzleDivisionRepository.server";
import { DrizzleHazardousEventAttachmentRepository } from "./DrizzleHazardousEventAttachmentRepository.server";
import { DiskHazardousEventAttachmentStorageService } from "./DiskHazardousEventAttachmentStorageService.server";
import { DrizzleHipCrosswalkAdapter } from "./DrizzleHipCrosswalkAdapter.server";
import { HAZARDOUS_EVENT_REPOSITORY } from "./HazardousEventRepositoryToken";
import { CAUSAL_CHAIN_REPOSITORY } from "./CausalChainRepositoryToken";
import { HAZARD_TAXONOMY_REPOSITORY } from "./HazardTaxonomyRepositoryToken";
import { SPECIFIC_HAZARD_TAXONOMY_REPOSITORY } from "./SpecificHazardTaxonomyRepositoryToken";
import { DIVISION_REPOSITORY } from "./DivisionRepositoryToken";
import { HAZARDOUS_EVENT_ATTACHMENT_REPOSITORY } from "./HazardousEventAttachmentRepositoryToken";
import { HAZARDOUS_EVENT_ATTACHMENT_STORAGE_SERVICE } from "./HazardousEventAttachmentStorageServiceToken";
import { HIP_CROSSWALK_PORT } from "./HipCrosswalkPortToken";

@Module({
	controllers: [HazardousEventsController],
	imports: [
		// For the four validation-workflow use cases this module's own use cases depend on —
		// never WORKFLOW_REPOSITORY directly (design.md Decision 4, ca-hazardous-events-module).
		ValidationWorkflowModule,
		// For IEventCausalityRepository — DeleteHazardousEventUseCase's own dependency.
		EventCausalityModule,
		// For ATTACHMENT_STORAGE_PORT — Create/Update/DeleteHazardousEventUseCase's own dependency.
		SharedAttachmentStorageModule,
		// For AUDIT_LOG_PORT — Create/Update/DeleteHazardousEventUseCase's own dependency.
		SharedAuditLogModule,
	],
	providers: [
		// Returns the same global dr singleton — no new DB connection.
		DrizzleProvider,
		{
			provide: HAZARDOUS_EVENT_REPOSITORY,
			useClass: DrizzleHazardousEventRepository,
		},
		{
			provide: CAUSAL_CHAIN_REPOSITORY,
			useClass: DrizzleCausalChainRepository,
		},
		{
			provide: HAZARD_TAXONOMY_REPOSITORY,
			useClass: DrizzleHazardTaxonomyRepository,
		},
		{
			provide: SPECIFIC_HAZARD_TAXONOMY_REPOSITORY,
			useClass: DrizzleSpecificHazardTaxonomyRepository,
		},
		{
			provide: DIVISION_REPOSITORY,
			useClass: DrizzleDivisionRepository,
		},
		{
			provide: HAZARDOUS_EVENT_ATTACHMENT_REPOSITORY,
			useClass: DrizzleHazardousEventAttachmentRepository,
		},
		{
			provide: HAZARDOUS_EVENT_ATTACHMENT_STORAGE_SERVICE,
			useClass: DiskHazardousEventAttachmentStorageService,
		},
		// TEMPORARY (DEF-055, design.md Decision 17) -- delete once no dependent domain reads hip_hazard_id/hip_cluster_id/hip_type_id off hazardous_event.
		{
			provide: HIP_CROSSWALK_PORT,
			useClass: DrizzleHipCrosswalkAdapter,
		},
		// First real consumer of TRANSACTION_RUNNER in this codebase — design.md Decision 2.
		{
			provide: TRANSACTION_RUNNER,
			useClass: DrizzleTransactionRunner,
		},
		{
			provide: GetHazardousEventByIdUseCase,
			useFactory: (
				hazardousEventRepository: IHazardousEventRepository,
				getWorkflowInstanceByEntityUseCase: Pick<
					GetWorkflowInstanceByEntityUseCase,
					"execute"
				>,
				specificHazardTaxonomyRepository: ISpecificHazardTaxonomyRepository,
				causalChainRepository: ICausalChainRepository,
				auditLogPort: IAuditLogPort,
			) =>
				new GetHazardousEventByIdUseCase(
					getPinoLogger(),
					hazardousEventRepository,
					getWorkflowInstanceByEntityUseCase,
					specificHazardTaxonomyRepository,
					causalChainRepository,
					auditLogPort,
				),
			inject: [
				HAZARDOUS_EVENT_REPOSITORY,
				GetWorkflowInstanceByEntityUseCase,
				SPECIFIC_HAZARD_TAXONOMY_REPOSITORY,
				CAUSAL_CHAIN_REPOSITORY,
				AUDIT_LOG_PORT,
			],
		},
		{
			provide: ListHazardousEventsUseCase,
			useFactory: (
				hazardousEventRepository: IHazardousEventRepository,
				listWorkflowInstancesByEntityIdsUseCase: Pick<
					ListWorkflowInstancesByEntityIdsUseCase,
					"execute"
				>,
				specificHazardTaxonomyRepository: ISpecificHazardTaxonomyRepository,
			) =>
				new ListHazardousEventsUseCase(
					getPinoLogger(),
					hazardousEventRepository,
					listWorkflowInstancesByEntityIdsUseCase,
					specificHazardTaxonomyRepository,
				),
			inject: [
				HAZARDOUS_EVENT_REPOSITORY,
				ListWorkflowInstancesByEntityIdsUseCase,
				SPECIFIC_HAZARD_TAXONOMY_REPOSITORY,
			],
		},
		{
			provide: GetHazardTaxonomyOptionsUseCase,
			useFactory: (
				specificHazardTaxonomyRepository: ISpecificHazardTaxonomyRepository,
			) =>
				new GetHazardTaxonomyOptionsUseCase(specificHazardTaxonomyRepository),
			inject: [SPECIFIC_HAZARD_TAXONOMY_REPOSITORY],
		},
		{
			provide: RecordSpatialObservationUseCase,
			useFactory: (
				hazardousEventRepository: IHazardousEventRepository,
				divisionRepository: IDivisionRepository,
			) =>
				new RecordSpatialObservationUseCase(
					hazardousEventRepository,
					divisionRepository,
				),
			inject: [HAZARDOUS_EVENT_REPOSITORY, DIVISION_REPOSITORY],
		},
		{
			provide: CreateHazardousEventUseCase,
			// Inject order mirrors the constructor's own declared order exactly (standard NestJS useFactory wiring).
			// recordSpatialObservationUseCase: own provider token (above), not a repository token.
			useFactory: (
				taxonomyRepository: IHazardTaxonomyRepository,
				hazardousEventRepository: IHazardousEventRepository,
				initializeWorkflowInstanceUseCase: Pick<
					InitializeWorkflowInstanceUseCase,
					"execute"
				>,
				causalChainRepository: ICausalChainRepository,
				recordSpatialObservationUseCase: Pick<
					RecordSpatialObservationUseCase,
					"execute"
				>,
				transactionRunner: ITransactionRunner,
				hipCrosswalkPort: IHipCrosswalkPort,
				attachmentStoragePort: IAttachmentStoragePort,
				auditLogPort: IAuditLogPort,
			) =>
				new CreateHazardousEventUseCase(
					getPinoLogger(),
					taxonomyRepository,
					hazardousEventRepository,
					initializeWorkflowInstanceUseCase,
					causalChainRepository,
					recordSpatialObservationUseCase,
					transactionRunner,
					hipCrosswalkPort,
					attachmentStoragePort,
					auditLogPort,
				),
			inject: [
				HAZARD_TAXONOMY_REPOSITORY,
				HAZARDOUS_EVENT_REPOSITORY,
				InitializeWorkflowInstanceUseCase,
				CAUSAL_CHAIN_REPOSITORY,
				RecordSpatialObservationUseCase,
				TRANSACTION_RUNNER,
				HIP_CROSSWALK_PORT,
				ATTACHMENT_STORAGE_PORT,
				AUDIT_LOG_PORT,
			],
		},
		{
			provide: DeleteHazardousEventUseCase,
			useFactory: (
				hazardousEventRepository: IHazardousEventRepository,
				eventCausalityRepository: IEventCausalityRepository,
				causalChainRepository: ICausalChainRepository,
				deleteWorkflowInstanceUseCase: Pick<
					DeleteWorkflowInstanceUseCase,
					"execute"
				>,
				transactionRunner: ITransactionRunner,
				attachmentStoragePort: IAttachmentStoragePort,
				auditLogPort: IAuditLogPort,
			) =>
				new DeleteHazardousEventUseCase(
					getPinoLogger(),
					hazardousEventRepository,
					eventCausalityRepository,
					causalChainRepository,
					deleteWorkflowInstanceUseCase,
					transactionRunner,
					attachmentStoragePort,
					auditLogPort,
				),
			inject: [
				HAZARDOUS_EVENT_REPOSITORY,
				EVENT_CAUSALITY_REPOSITORY,
				CAUSAL_CHAIN_REPOSITORY,
				DeleteWorkflowInstanceUseCase,
				TRANSACTION_RUNNER,
				ATTACHMENT_STORAGE_PORT,
				AUDIT_LOG_PORT,
			],
		},
		{
			provide: UpdateHazardousEventUseCase,
			// recordSpatialObservationUseCase is injected via its own provider token (above), not a repository token.
			useFactory: (
				taxonomyRepository: IHazardTaxonomyRepository,
				hazardousEventRepository: IHazardousEventRepository,
				getWorkflowInstanceByEntityUseCase: Pick<
					GetWorkflowInstanceByEntityUseCase,
					"execute"
				>,
				causalChainRepository: ICausalChainRepository,
				recordSpatialObservationUseCase: Pick<
					RecordSpatialObservationUseCase,
					"execute"
				>,
				transactionRunner: ITransactionRunner,
				hipCrosswalkPort: IHipCrosswalkPort,
				attachmentStoragePort: IAttachmentStoragePort,
				auditLogPort: IAuditLogPort,
			) =>
				new UpdateHazardousEventUseCase(
					getPinoLogger(),
					taxonomyRepository,
					hazardousEventRepository,
					getWorkflowInstanceByEntityUseCase,
					causalChainRepository,
					recordSpatialObservationUseCase,
					transactionRunner,
					hipCrosswalkPort,
					attachmentStoragePort,
					auditLogPort,
				),
			inject: [
				HAZARD_TAXONOMY_REPOSITORY,
				HAZARDOUS_EVENT_REPOSITORY,
				GetWorkflowInstanceByEntityUseCase,
				CAUSAL_CHAIN_REPOSITORY,
				RecordSpatialObservationUseCase,
				TRANSACTION_RUNNER,
				HIP_CROSSWALK_PORT,
				ATTACHMENT_STORAGE_PORT,
				AUDIT_LOG_PORT,
			],
		},
		{
			provide: AddHazardousEventAttachmentUseCase,
			useFactory: (
				hazardousEventRepository: IHazardousEventRepository,
				attachmentRepository: IHazardousEventAttachmentRepository,
				storageService: IHazardousEventAttachmentStorageService,
			) =>
				new AddHazardousEventAttachmentUseCase(
					hazardousEventRepository,
					attachmentRepository,
					storageService,
				),
			inject: [
				HAZARDOUS_EVENT_REPOSITORY,
				HAZARDOUS_EVENT_ATTACHMENT_REPOSITORY,
				HAZARDOUS_EVENT_ATTACHMENT_STORAGE_SERVICE,
			],
		},
		{
			provide: ListHazardousEventAttachmentsUseCase,
			useFactory: (
				hazardousEventRepository: IHazardousEventRepository,
				attachmentRepository: IHazardousEventAttachmentRepository,
			) =>
				new ListHazardousEventAttachmentsUseCase(
					hazardousEventRepository,
					attachmentRepository,
				),
			inject: [
				HAZARDOUS_EVENT_REPOSITORY,
				HAZARDOUS_EVENT_ATTACHMENT_REPOSITORY,
			],
		},
		{
			provide: DeleteHazardousEventAttachmentUseCase,
			useFactory: (
				hazardousEventRepository: IHazardousEventRepository,
				attachmentRepository: IHazardousEventAttachmentRepository,
				storageService: IHazardousEventAttachmentStorageService,
			) =>
				new DeleteHazardousEventAttachmentUseCase(
					hazardousEventRepository,
					attachmentRepository,
					storageService,
				),
			inject: [
				HAZARDOUS_EVENT_REPOSITORY,
				HAZARDOUS_EVENT_ATTACHMENT_REPOSITORY,
				HAZARDOUS_EVENT_ATTACHMENT_STORAGE_SERVICE,
			],
		},
		{
			provide: DownloadHazardousEventAttachmentUseCase,
			useFactory: (
				hazardousEventRepository: IHazardousEventRepository,
				attachmentRepository: IHazardousEventAttachmentRepository,
				storageService: IHazardousEventAttachmentStorageService,
			) =>
				new DownloadHazardousEventAttachmentUseCase(
					hazardousEventRepository,
					attachmentRepository,
					storageService,
				),
			inject: [
				HAZARDOUS_EVENT_REPOSITORY,
				HAZARDOUS_EVENT_ATTACHMENT_REPOSITORY,
				HAZARDOUS_EVENT_ATTACHMENT_STORAGE_SERVICE,
			],
		},
		ApiKeyAuthGuard,
		SessionAuthGuard,
		ApiKeyOrSessionAuthGuard,
		PermissionsGuard,
		RequestContextMiddleware,
	],
	// RecordSpatialObservationUseCase is exported despite being same-module-only today.
	exports: [
		GetHazardousEventByIdUseCase,
		ListHazardousEventsUseCase,
		GetHazardTaxonomyOptionsUseCase,
		RecordSpatialObservationUseCase,
		CreateHazardousEventUseCase,
		DeleteHazardousEventUseCase,
		UpdateHazardousEventUseCase,
		AddHazardousEventAttachmentUseCase,
		ListHazardousEventAttachmentsUseCase,
		DeleteHazardousEventAttachmentUseCase,
		DownloadHazardousEventAttachmentUseCase,
	],
})
export class HazardousEventsModule implements NestModule {
	configure(consumer: MiddlewareConsumer) {
		consumer
			.apply(RequestContextMiddleware)
			.forRoutes(HazardousEventsController);
	}
}
