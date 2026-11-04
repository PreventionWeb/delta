import { Module } from "@nestjs/common";

import { DrizzleProvider } from "~/infrastructure/DrizzleProvider.server";
import { getPinoLogger } from "~/infrastructure/logging/PinoLogger.server";
import { ProcessWorkflowActionUseCase } from "~/domains/validation-workflow/application/use-cases/ProcessWorkflowAction";
import { InitializeWorkflowInstanceUseCase } from "~/domains/validation-workflow/application/use-cases/InitializeWorkflowInstance";
import { DeleteWorkflowInstanceUseCase } from "~/domains/validation-workflow/application/use-cases/DeleteWorkflowInstance";
import { GetWorkflowInstanceByEntityUseCase } from "~/domains/validation-workflow/application/use-cases/GetWorkflowInstanceByEntity";
import { ListWorkflowInstancesByEntityIdsUseCase } from "~/domains/validation-workflow/application/use-cases/ListWorkflowInstancesByEntityIds";
import { FindValidatorCandidatesUseCase } from "~/domains/validation-workflow/application/use-cases/FindValidatorCandidates";
import type { IWorkflowRepository } from "~/domains/validation-workflow/application/ports/IWorkflowRepository";
import type { INotificationPort } from "~/domains/validation-workflow/application/ports/INotificationPort";
import type { IValidatorCandidateRepository } from "~/domains/validation-workflow/application/ports/IValidatorCandidateRepository";
import { DrizzleWorkflowRepository } from "./DrizzleWorkflowRepository.server";
import { EmailNotificationAdapter } from "./EmailNotificationAdapter.server";
import { DrizzleValidatorCandidateRepository } from "./DrizzleValidatorCandidateRepository.server";
import { WORKFLOW_REPOSITORY } from "./WorkflowRepositoryToken";
import { NOTIFICATION_PORT } from "./NotificationPortToken";
import { VALIDATOR_CANDIDATE_REPOSITORY } from "./ValidatorCandidateRepositoryToken";

@Module({
	providers: [
		// Returns the same global dr singleton — no new DB connection.
		DrizzleProvider,
		{
			provide: WORKFLOW_REPOSITORY,
			useClass: DrizzleWorkflowRepository,
		},
		{
			provide: VALIDATOR_CANDIDATE_REPOSITORY,
			useClass: DrizzleValidatorCandidateRepository,
		},
		// useFactory, not useClass — design.md Decision 2.
		{
			provide: NOTIFICATION_PORT,
			useFactory: () => new EmailNotificationAdapter(),
		},
		{
			provide: ProcessWorkflowActionUseCase,
			useFactory: (repo: IWorkflowRepository, port: INotificationPort) =>
				new ProcessWorkflowActionUseCase(getPinoLogger(), repo, port),
			inject: [WORKFLOW_REPOSITORY, NOTIFICATION_PORT],
		},
		{
			provide: InitializeWorkflowInstanceUseCase,
			useFactory: (repo: IWorkflowRepository) =>
				new InitializeWorkflowInstanceUseCase(repo),
			inject: [WORKFLOW_REPOSITORY],
		},
		{
			provide: DeleteWorkflowInstanceUseCase,
			useFactory: (repo: IWorkflowRepository) =>
				new DeleteWorkflowInstanceUseCase(repo),
			inject: [WORKFLOW_REPOSITORY],
		},
		{
			provide: GetWorkflowInstanceByEntityUseCase,
			useFactory: (repo: IWorkflowRepository) =>
				new GetWorkflowInstanceByEntityUseCase(repo),
			inject: [WORKFLOW_REPOSITORY],
		},
		{
			provide: ListWorkflowInstancesByEntityIdsUseCase,
			useFactory: (repo: IWorkflowRepository) =>
				new ListWorkflowInstancesByEntityIdsUseCase(repo),
			inject: [WORKFLOW_REPOSITORY],
		},
		{
			provide: FindValidatorCandidatesUseCase,
			useFactory: (repo: IValidatorCandidateRepository) =>
				new FindValidatorCandidatesUseCase(repo),
			inject: [VALIDATOR_CANDIDATE_REPOSITORY],
		},
	],
	// Tokens stay hidden — design.md Decision 4.
	exports: [
		ProcessWorkflowActionUseCase,
		InitializeWorkflowInstanceUseCase,
		DeleteWorkflowInstanceUseCase,
		GetWorkflowInstanceByEntityUseCase,
		ListWorkflowInstancesByEntityIdsUseCase,
		FindValidatorCandidatesUseCase,
	],
})
export class ValidationWorkflowModule {}
