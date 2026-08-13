// Static mock fixture for the POC create route (openspec/changes/poc-react-aria-hazardous-event,
// design.md Decision 8). Replaces the combined `getUserCountryAccountsWithValidatorRole` /
// `getUserCountryAccountsWithAdminRole` fallback behavior in production `new.tsx` — no DB read.
// Backs the rebuilt `SaveSubmitDialog`'s validator multi-select (design.md Decision 3).
//
// Production falls back to admins when no validators exist for the tenant; this fixture
// represents "the resulting list" already, so that validator-then-admin-fallback branching does
// not need to be reproduced here (design.md Decision 8) — the rebuilt dialog only needs a
// plausible list of selectable people, not the data-sourcing logic behind it.
//
// Typed directly against the real query's return shape via `import type` so this fixture is
// compile-time-checked to stay in sync (no runtime import — the db/queries module is fully
// erased at build time).
import type { getUserCountryAccountsWithValidatorRole } from "~/db/queries/userCountryAccountsRepository";

export type ValidatorUser = Awaited<
	ReturnType<typeof getUserCountryAccountsWithValidatorRole>
>[number];

export const validatorUsersFixture: ValidatorUser[] = [
	{
		id: "a1b2c3d4-1111-4a2b-8c3d-100000000001",
		email: "amara.okafor@example.org",
		firstName: "Amara",
		lastName: "Okafor",
		role: "data-validator",
		isPrimaryAdmin: false,
	},
	{
		id: "a1b2c3d4-1111-4a2b-8c3d-100000000002",
		email: "diego.fernandez@example.org",
		firstName: "Diego",
		lastName: "Fernandez",
		role: "data-validator",
		isPrimaryAdmin: false,
	},
	{
		id: "a1b2c3d4-1111-4a2b-8c3d-100000000003",
		email: "mei.tanaka@example.org",
		firstName: "Mei",
		lastName: "Tanaka",
		role: "data-validator",
		isPrimaryAdmin: true,
	},
];
