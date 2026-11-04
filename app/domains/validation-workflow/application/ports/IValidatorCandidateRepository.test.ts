import { describe, expect, it } from "vitest";
import type {
	IValidatorCandidateRepository,
	ValidatorCandidate,
	ValidatorCandidateRole,
} from "./IValidatorCandidateRepository";

interface SeedUser extends ValidatorCandidate {
	tenantId: string;
	role: ValidatorCandidateRole;
}

/** In-memory fake of the mechanical port only -- the admin-fallback policy moved to
 * FindValidatorCandidatesUseCase (SOLID review, DIP finding); its own test covers that. */
class FakeValidatorCandidateRepository implements IValidatorCandidateRepository {
	constructor(private readonly users: readonly SeedUser[]) {}

	async findByRole(
		tenantId: string,
		role: ValidatorCandidateRole,
		excludingUserId: string,
	): Promise<readonly ValidatorCandidate[]> {
		return this.users
			.filter(
				(u) =>
					u.tenantId === tenantId &&
					u.role === role &&
					u.id !== excludingUserId,
			)
			.map(({ id, firstName, lastName, email }) => ({
				id,
				firstName,
				lastName,
				email,
			}));
	}
}

function user(overrides: Partial<SeedUser> & { id: string }): SeedUser {
	return {
		tenantId: "tenant-1",
		role: "data-validator",
		firstName: "First",
		lastName: "Last",
		email: `${overrides.id}@example.com`,
		...overrides,
	};
}

describe("IValidatorCandidateRepository conformance", () => {
	it("resolves tenant-scoped candidates with the given role, excluding the acting user", async () => {
		const repo = new FakeValidatorCandidateRepository([
			user({ id: "v1" }),
			user({ id: "v2" }),
			user({ id: "acting-user" }),
		]);

		const result = await repo.findByRole(
			"tenant-1",
			"data-validator",
			"acting-user",
		);

		expect(result.map((c) => c.id).sort()).toEqual(["v1", "v2"]);
	});

	it("never returns a candidate from a different tenant", async () => {
		const repo = new FakeValidatorCandidateRepository([
			user({ id: "v1" }),
			user({ id: "other-tenant-validator", tenantId: "tenant-2" }),
		]);

		const result = await repo.findByRole(
			"tenant-1",
			"data-validator",
			"acting-user",
		);

		expect(result.map((c) => c.id)).toEqual(["v1"]);
	});

	it("never returns a candidate with a different role", async () => {
		const repo = new FakeValidatorCandidateRepository([
			user({ id: "v1", role: "data-validator" }),
			user({ id: "a1", role: "admin" }),
		]);

		const result = await repo.findByRole("tenant-1", "admin", "acting-user");

		expect(result.map((c) => c.id)).toEqual(["a1"]);
	});

	it("resolves an empty array, not a rejection, when no candidate matches", async () => {
		const repo = new FakeValidatorCandidateRepository([]);

		await expect(
			repo.findByRole("tenant-1", "data-validator", "acting-user"),
		).resolves.toEqual([]);
	});
});

// Tuple equality (not plain assignability) so a dropped/added param fails to compile.
type AssertEqual<A, B> = A extends B ? (B extends A ? true : never) : never;

const _findByRoleArity: AssertEqual<
	Parameters<IValidatorCandidateRepository["findByRole"]>,
	[string, ValidatorCandidateRole, string]
> = true;

void _findByRoleArity;
