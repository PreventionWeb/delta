export interface ValidatorCandidate {
	readonly id: string;
	readonly firstName: string;
	readonly lastName: string;
	readonly email: string;
}

export type ValidatorCandidateRole = "data-validator" | "admin";

/** Entity-type-agnostic, shared concern alongside INotificationPort. Mechanical query only --
 * no fallback policy (SOLID review, DIP finding): that's FindValidatorCandidatesUseCase's job. */
export interface IValidatorCandidateRepository {
	/** Tenant-scoped candidates with the given role, excluding excludingUserId. */
	findByRole(
		tenantId: string,
		role: ValidatorCandidateRole,
		excludingUserId: string,
	): Promise<readonly ValidatorCandidate[]>;
}
