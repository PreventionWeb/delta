import type { InjectionToken } from "@nestjs/common";

import type { IValidatorCandidateRepository } from "~/domains/validation-workflow/application/ports/IValidatorCandidateRepository";

// Kept out of IValidatorCandidateRepository.ts -- domain/application types must not import @nestjs/common.
export const VALIDATOR_CANDIDATE_REPOSITORY: InjectionToken<IValidatorCandidateRepository> =
	Symbol("VALIDATOR_CANDIDATE_REPOSITORY");
