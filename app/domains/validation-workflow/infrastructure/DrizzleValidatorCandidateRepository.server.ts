import { Injectable, Inject } from "@nestjs/common";
import { and, eq, ne } from "drizzle-orm";

import type { Dr } from "~/db.server";
import { DRIZZLE_CLIENT } from "~/infrastructure/DrizzleProvider.server";
import { userTable } from "~/drizzle/schema/userTable";
import { userCountryAccountsTable } from "~/drizzle/schema/userCountryAccountsTable";
import type {
	IValidatorCandidateRepository,
	ValidatorCandidate,
	ValidatorCandidateRole,
} from "~/domains/validation-workflow/application/ports/IValidatorCandidateRepository";

/** Reproduces legacy's getUserCountryAccountsWithValidatorRole/WithAdminRole exactly
 * (userCountryAccountsRepository.ts:149-201) -- same role/emailVerified filter, tenant-scoped,
 * acting user excluded. No fallback policy here (that's FindValidatorCandidatesUseCase's job). */
@Injectable()
export class DrizzleValidatorCandidateRepository implements IValidatorCandidateRepository {
	constructor(@Inject(DRIZZLE_CLIENT) private readonly db: Dr) {}

	async findByRole(
		tenantId: string,
		role: ValidatorCandidateRole,
		excludingUserId: string,
	): Promise<readonly ValidatorCandidate[]> {
		return this.db
			.select({
				id: userTable.id,
				firstName: userTable.firstName,
				lastName: userTable.lastName,
				email: userTable.email,
			})
			.from(userCountryAccountsTable)
			.innerJoin(userTable, eq(userTable.id, userCountryAccountsTable.userId))
			.where(
				and(
					eq(userCountryAccountsTable.countryAccountsId, tenantId),
					eq(userCountryAccountsTable.role, role),
					eq(userTable.emailVerified, true),
					ne(userTable.id, excludingUserId),
				),
			)
			.orderBy(userTable.firstName, userTable.lastName);
	}
}
