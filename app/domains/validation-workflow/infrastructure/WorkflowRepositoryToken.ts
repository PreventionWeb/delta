import type { InjectionToken } from "@nestjs/common";

import type { IWorkflowRepository } from "~/domains/validation-workflow/application/ports/IWorkflowRepository";

// Kept out of IWorkflowRepository.ts — domain types must not import @nestjs/common.
// Symbol-based, same rationale as NOTICE_REPOSITORY (design.md Decision 1).
export const WORKFLOW_REPOSITORY: InjectionToken<IWorkflowRepository> = Symbol(
	"WORKFLOW_REPOSITORY",
);
