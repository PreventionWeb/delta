import type {
	IValidatorCandidateRepository,
	ValidatorCandidate,
} from "../ports/IValidatorCandidateRepository";

export interface FindValidatorCandidatesQuery {
	tenantId: string;
	excludingUserId: string;
}

/** Owns the validator-then-admin-fallback policy (SOLID review, DIP finding); the port is a
 * mechanical findByRole() query. Repository tokens stay module-internal (design.md Decision 4). */
export class FindValidatorCandidatesUseCase {
	constructor(
		private readonly validatorCandidateRepository: IValidatorCandidateRepository,
	) {}

	async execute(
		query: FindValidatorCandidatesQuery,
	): Promise<readonly ValidatorCandidate[]> {
		const validators = await this.validatorCandidateRepository.findByRole(
			query.tenantId,
			"data-validator",
			query.excludingUserId,
		);
		return validators.length > 0
			? validators
			: this.validatorCandidateRepository.findByRole(
					query.tenantId,
					"admin",
					query.excludingUserId,
				);
	}
}
