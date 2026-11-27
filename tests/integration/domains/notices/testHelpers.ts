import { dr } from "~/db.server";
import { userTable } from "~/drizzle/schema/userTable";
import { sessionCookie } from "~/utils/session";
import { countriesTable } from "../../db/testSchema/countriesTable";
import { countryAccounts } from "../../db/testSchema/countryAccounts";
import { sessionTable } from "../../db/testSchema/sessionTable";
import { userCountryAccounts } from "../../db/testSchema/userCountryAccounts";

export async function insertTenant(): Promise<string> {
	const [country] = await dr
		.insert(countriesTable)
		.values({ name: `Test Country ${crypto.randomUUID().slice(0, 8)}` })
		.returning({ id: countriesTable.id });
	const [account] = await dr
		.insert(countryAccounts)
		.values({ shortDescription: "TST", countryId: country.id })
		.returning({ id: countryAccounts.id });
	return account.id;
}

export async function insertUser(options?: {
	totpEnabled?: boolean;
}): Promise<string> {
	const [user] = await dr
		.insert(userTable)
		.values({
			email: `test-${crypto.randomUUID()}@example.com`,
			totpEnabled: options?.totpEnabled ?? false,
		})
		.returning({ id: userTable.id });
	return user.id;
}

export async function insertTenantMembership(options: {
	userId: string;
	tenantId: string;
	role?: string;
}): Promise<void> {
	await dr.insert(userCountryAccounts).values({
		userId: options.userId,
		countryAccountsId: options.tenantId,
		role: options.role ?? "admin",
	});
}

/** Inserts a session row and returns a Cookie header string carrying it. */
export async function buildSessionCookie(options: {
	userId: string;
	tenantId?: string;
	lastActiveAt?: Date;
	role?: string;
	skipMembership?: boolean;
	totpAuthed?: boolean;
}): Promise<string> {
	if (options.tenantId && !options.skipMembership) {
		await insertTenantMembership({
			userId: options.userId,
			tenantId: options.tenantId,
			role: options.role ?? "admin",
		});
	}

	const [sessionRow] = await dr
		.insert(sessionTable)
		.values({
			userId: options.userId,
			lastActiveAt: options.lastActiveAt ?? new Date(),
			totpAuthed: options.totpAuthed ?? false,
		})
		.returning({ id: sessionTable.id });

	const session = await sessionCookie().getSession();
	session.set("sessionId", sessionRow.id);
	if (options.tenantId) {
		session.set("countryAccountsId", options.tenantId);
	}
	const setCookie = await sessionCookie().commitSession(session);
	return setCookie.split(";")[0]; // Cookie header only needs "name=value".
}
