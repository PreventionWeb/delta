import { Module } from "@nestjs/common";

import { DrizzleProvider } from "~/infrastructure/DrizzleProvider.server";
import { TRANSACTION_RUNNER } from "~/infrastructure/TransactionRunnerToken";
import { DrizzleTransactionRunner } from "~/infrastructure/DrizzleTransactionRunner.server";
import { getPinoLogger } from "~/infrastructure/logging/PinoLogger.server";
import type { ITransactionRunner } from "~/shared/persistence/ITransactionRunner";

import { ValidationWorkflowModule } from "~/domains/validation-workflow/infrastructure/ValidationWorkflowModule.server";
import { InitializeWorkflowInstanceUseCase } from "~/domains/validation-workflow/application/use-cases/InitializeWorkflowInstance";
import { DeleteWorkflowInstanceUseCase } from "~/domains/validation-workflow/application/use-cases/DeleteWorkflowInstance";
import { GetWorkflowInstanceByEntityUseCase } from "~/domains/validation-workflow/application/use-cases/GetWorkflowInstanceByEntity";
import { ListWorkflowInstancesByEntityIdsUseCase } from "~/domains/validation-workflow/application/use-cases/ListWorkflowInstancesByEntityIds";

import { EventCausalityModule } from "~/domains/event-causality/infrastructure/EventCausalityModule.server";
import { EVENT_CAUSALITY_REPOSITORY } from "~/domains/event-causality/infrastructure/EventCausalityRepositoryToken";
import type { IEventCausalityRepository } from "~/domains/event-causality/application/ports/IEventCausalityRepository";

import { GetHazardousEventByIdUseCase } from "~/domains/hazardous-events/application/use-cases/GetHazardousEventById";
import { ListHazardousEventsUseCase } from "~/domains/hazardous-events/application/use-cases/ListHazardousEvents";
import { RecordSpatialObservationUseCase } from "~/domains/hazardous-events/application/use-cases/RecordSpatialObservation";
import { CreateHazardousEventUseCase } from "~/domains/hazardous-events/application/use-cases/CreateHazardousEvent";
import { DeleteHazardousEventUseCase } from "~/domains/hazardous-events/application/use-cases/DeleteHazardousEvent";
import { UpdateHazardousEventUseCase } from "~/domains/hazardous-events/application/use-cases/UpdateHazardousEvent";
import type { IHazardousEventRepository } from "~/domains/hazardous-events/application/ports/IHazardousEventRepository";
import type { IDivisionRepository } from "~/domains/hazardous-events/application/ports/IDivisionRepository";
import type { ICausalChainRepository } from "~/domains/hazardous-events/application/ports/ICausalChainRepository";
import type { IHazardTaxonomyRepository } from "~/domains/hazardous-events/application/ports/IHazardTaxonomyRepository";

import { DrizzleHazardousEventRepository } from "./DrizzleHazardousEventRepository.server";
import { DrizzleCausalChainRepository } from "./DrizzleCausalChainRepository.server";
import { DrizzleHazardTaxonomyRepository } from "./DrizzleHazardTaxonomyRepository.server";
import { DrizzleDivisionRepository } from "./DrizzleDivisionRepository.server";
import { HAZARDOUS_EVENT_REPOSITORY } from "./HazardousEventRepositoryToken";
import { CAUSAL_CHAIN_REPOSITORY } from "./CausalChainRepositoryToken";
import { HAZARD_TAXONOMY_REPOSITORY } from "./HazardTaxonomyRepositoryToken";
import { DIVISION_REPOSITORY } from "./DivisionRepositoryToken";

@Module({
	imports: [
		// For the four validation-workflow use cases this module's own use cases depend on —
		// never WORKFLOW_REPOSITORY directly (design.md Decision 4, ca-hazardous-events-module).
		ValidationWorkflowModule,
		// For IEventCausalityRepository — DeleteHazardousEventUseCase's own dependency.
		EventCausalityModule,
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
			provide: DIVISION_REPOSITORY,
			useClass: DrizzleDivisionRepository,
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
			) =>
				new GetHazardousEventByIdUseCase(
					getPinoLogger(),
					hazardousEventRepository,
					getWorkflowInstanceByEntityUseCase,
				),
			inject: [HAZARDOUS_EVENT_REPOSITORY, GetWorkflowInstanceByEntityUseCase],
		},
		{
			provide: ListHazardousEventsUseCase,
			useFactory: (
				hazardousEventRepository: IHazardousEventRepository,
				listWorkflowInstancesByEntityIdsUseCase: Pick<
					ListWorkflowInstancesByEntityIdsUseCase,
					"execute"
				>,
			) =>
				new ListHazardousEventsUseCase(
					getPinoLogger(),
					hazardousEventRepository,
					listWorkflowInstancesByEntityIdsUseCase,
				),
			inject: [
				HAZARDOUS_EVENT_REPOSITORY,
				ListWorkflowInstancesByEntityIdsUseCase,
			],
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
			// Inject order mirrors the constructor's own declared order exactly (design.md's
			// constructor table) — positional and untyped at this call site (design.md Risks).
			useFactory: (
				taxonomyRepository: IHazardTaxonomyRepository,
				hazardousEventRepository: IHazardousEventRepository,
				initializeWorkflowInstanceUseCase: Pick<
					InitializeWorkflowInstanceUseCase,
					"execute"
				>,
				causalChainRepository: ICausalChainRepository,
				transactionRunner: ITransactionRunner,
			) =>
				new CreateHazardousEventUseCase(
					getPinoLogger(),
					taxonomyRepository,
					hazardousEventRepository,
					initializeWorkflowInstanceUseCase,
					causalChainRepository,
					transactionRunner,
				),
			inject: [
				HAZARD_TAXONOMY_REPOSITORY,
				HAZARDOUS_EVENT_REPOSITORY,
				InitializeWorkflowInstanceUseCase,
				CAUSAL_CHAIN_REPOSITORY,
				TRANSACTION_RUNNER,
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
			) =>
				new DeleteHazardousEventUseCase(
					getPinoLogger(),
					hazardousEventRepository,
					eventCausalityRepository,
					causalChainRepository,
					deleteWorkflowInstanceUseCase,
					transactionRunner,
				),
			inject: [
				HAZARDOUS_EVENT_REPOSITORY,
				EVENT_CAUSALITY_REPOSITORY,
				CAUSAL_CHAIN_REPOSITORY,
				DeleteWorkflowInstanceUseCase,
				TRANSACTION_RUNNER,
			],
		},
		{
			provide: UpdateHazardousEventUseCase,
			// recordSpatialObservationUseCase is injected via its own provider token (above), not a
			// repository token — it's a same-module use-case dependency.
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
			) =>
				new UpdateHazardousEventUseCase(
					getPinoLogger(),
					taxonomyRepository,
					hazardousEventRepository,
					getWorkflowInstanceByEntityUseCase,
					causalChainRepository,
					recordSpatialObservationUseCase,
					transactionRunner,
				),
			inject: [
				HAZARD_TAXONOMY_REPOSITORY,
				HAZARDOUS_EVENT_REPOSITORY,
				GetWorkflowInstanceByEntityUseCase,
				CAUSAL_CHAIN_REPOSITORY,
				RecordSpatialObservationUseCase,
				TRANSACTION_RUNNER,
			],
		},
	],
	// RecordSpatialObservationUseCase is exported despite being same-module-only today —
	// design.md Risks/Trade-offs.
	exports: [
		GetHazardousEventByIdUseCase,
		ListHazardousEventsUseCase,
		RecordSpatialObservationUseCase,
		CreateHazardousEventUseCase,
		DeleteHazardousEventUseCase,
		UpdateHazardousEventUseCase,
	],
})
export class HazardousEventsModule {}
