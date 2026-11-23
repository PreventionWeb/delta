import { describe, expect, it } from "vitest";
import type {
	IValidatorCandidateRepository,
	ValidatorCandidate,
	ValidatorCandidateRole,
} from "../ports/IValidatorCandidateRepository";
import { FindValidatorCandidatesUseCase } from "./FindValidatorCandidates";

class FakeValidatorCandidateRepository implements IValidatorCandidateRepository {
	readonly findByRoleCalls: {
		tenantId: string;
		role: ValidatorCandidateRole;
		excludingUserId: string;
	}[] = [];

	constructor(
		private readonly byRole: Partial<
			Record<ValidatorCandidateRole, readonly ValidatorCandidate[]>
		> = {},
	) {}

	async findByRole(
		tenantId: string,
		role: ValidatorCandidateRole,
		excludingUserId: string,
	): Promise<readonly ValidatorCandidate[]> {
		this.findByRoleCalls.push({ tenantId, role, excludingUserId });
		return this.byRole[role] ?? [];
	}
}

const validator: ValidatorCandidate = {
	id: "v1",
	firstName: "A",
	lastName: "B",
	email: "a@b.com",
};
const admin: ValidatorCandidate = {
	id: "a1",
	firstName: "C",
	lastName: "D",
	email: "c@d.com",
};

describe("FindValidatorCandidatesUseCase", () => {
	it("returns data-validators and never queries admins when at least one validator exists", async () => {
		const repository = new FakeValidatorCandidateRepository({
			"data-validator": [validator],
		});
		const useCase = new FindValidatorCandidatesUseCase(repository);

		const result = await useCase.execute({
			tenantId: "tenant-1",
			excludingUserId: "user-1",
		});

		expect(result).toEqual([validator]);
		expect(repository.findByRoleCalls).toEqual([
			{
				tenantId: "tenant-1",
				role: "data-validator",
				excludingUserId: "user-1",
			},
		]);
	});

	it("falls back to admins when no data-validators exist (SOLID review, DIP finding)", async () => {
		const repository = new FakeValidatorCandidateRepository({
			"data-validator": [],
			admin: [admin],
		});
		const useCase = new FindValidatorCandidatesUseCase(repository);

		const result = await useCase.execute({
			tenantId: "tenant-1",
			excludingUserId: "user-1",
		});

		expect(result).toEqual([admin]);
		expect(repository.findByRoleCalls).toEqual([
			{
				tenantId: "tenant-1",
				role: "data-validator",
				excludingUserId: "user-1",
			},
			{ tenantId: "tenant-1", role: "admin", excludingUserId: "user-1" },
		]);
	});

	it("resolves an empty array, not a rejection, when both validators and admins are empty", async () => {
		const repository = new FakeValidatorCandidateRepository();
		const useCase = new FindValidatorCandidatesUseCase(repository);

		await expect(
			useCase.execute({ tenantId: "tenant-1", excludingUserId: "user-1" }),
		).resolves.toEqual([]);
	});
});
