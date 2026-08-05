import { dr } from "~/db.server";
import { userTable } from "~/drizzle/schema/userTable";
import { sessionCookie } from "~/utils/session";
import { countriesTable } from "../../db/testSchema/countriesTable";
import { countryAccounts } from "../../db/testSchema/countryAccounts";
import { sessionTable } from "../../db/testSchema/sessionTable";

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

export async function insertUser(): Promise<string> {
	const [user] = await dr
		.insert(userTable)
		.values({ email: `test-${crypto.randomUUID()}@example.com` })
		.returning({ id: userTable.id });
	return user.id;
}

/** Inserts a session row and returns a Cookie header string carrying it. */
export async function buildSessionCookie(options: {
	userId: string;
	tenantId?: string;
	lastActiveAt?: Date;
}): Promise<string> {
	const [sessionRow] = await dr
		.insert(sessionTable)
		.values({
			userId: options.userId,
			lastActiveAt: options.lastActiveAt ?? new Date(),
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
