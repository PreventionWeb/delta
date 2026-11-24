import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import { dr, Tx } from "../../db.server";
import { apiKeyTable, InsertApiKey } from "~/drizzle/schema/apiKeyTable";
import { userTable } from "~/drizzle/schema/userTable";
import { randomBytes } from "crypto";

export type ApiKeySortColumn = "name" | "managedBy" | "created";
export type ApiKeySortDirection = "asc" | "desc";

export interface ApiKeyListOptions {
	page: number;
	pageSize: number;
	sort: ApiKeySortColumn;
	dir: ApiKeySortDirection;
}

export interface ApiKeyListRow {
	id: string;
	name: string;
	secret: string;
	createdAt: Date;
	managedByUserId: string;
	managedByUser: {
		email: string;
	};
}

export interface ApiKeyListResult {
	items: ApiKeyListRow[];
	total: number;
	page: number;
	existingNames: string[];
}

const UUID_REGEX =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function generateSecret(): string {
	return randomBytes(32).toString("hex");
}

function getOrderBy(sort: ApiKeySortColumn, dir: ApiKeySortDirection) {
	const dirFn = dir === "asc" ? asc : desc;
	switch (sort) {
		case "name":
			return [dirFn(sql`lower(${apiKeyTable.name})`), dirFn(apiKeyTable.id)];
		case "managedBy":
			return [dirFn(sql`lower(${userTable.email})`), dirFn(apiKeyTable.id)];
		case "created":
		default:
			return [dirFn(apiKeyTable.createdAt), dirFn(apiKeyTable.id)];
	}
}

export const ApiKeyRepository = {
	getById: (id: string) => {
		if (!UUID_REGEX.test(id)) {
			return Promise.resolve(undefined);
		}
		return dr.query.apiKeyTable.findFirst({
			where: eq(apiKeyTable.id, id),
			with: { managedByUser: true },
		});
	},

	getByCountryAccountsIdWithUser: (countryAccountsId: string) => {
		return dr.query.apiKeyTable.findMany({
			where: eq(apiKeyTable.countryAccountsId, countryAccountsId),
			orderBy: [desc(apiKeyTable.name)],
			with: { managedByUser: true },
		});
	},

	listByCountryAccountsId: async (
		countryAccountsId: string,
		options: ApiKeyListOptions,
		tx?: Tx,
	): Promise<ApiKeyListResult> => {
		const db = tx ?? dr;
		const safePageSize = Math.max(1, options.pageSize);

		const nameRows = await db
			.select({ name: apiKeyTable.name })
			.from(apiKeyTable)
			.where(eq(apiKeyTable.countryAccountsId, countryAccountsId));

		const total = nameRows.length;
		const totalPages = Math.max(1, Math.ceil(total / safePageSize));
		const safePage = Math.min(Math.max(1, options.page), totalPages);
		const offset = (safePage - 1) * safePageSize;

		const rows = await db
			.select({
				id: apiKeyTable.id,
				name: apiKeyTable.name,
				secret: apiKeyTable.secret,
				createdAt: apiKeyTable.createdAt,
				managedByUserId: apiKeyTable.managedByUserId,
				managedByUserEmail: userTable.email,
			})
			.from(apiKeyTable)
			.innerJoin(userTable, eq(apiKeyTable.managedByUserId, userTable.id))
			.where(eq(apiKeyTable.countryAccountsId, countryAccountsId))
			.orderBy(...getOrderBy(options.sort, options.dir))
			.limit(safePageSize)
			.offset(offset);

		return {
			items: rows.map((row) => ({
				id: row.id,
				name: row.name,
				secret: row.secret,
				createdAt: row.createdAt,
				managedByUserId: row.managedByUserId,
				managedByUser: { email: row.managedByUserEmail },
			})),
			total,
			page: safePage,
			existingNames: nameRows.map((r) => r.name),
		};
	},

	existsByNameInTenant: async (
		countryAccountsId: string,
		name: string,
		excludeId?: string,
		tx?: Tx,
	): Promise<boolean> => {
		const db = tx ?? dr;
		const conditions = [
			eq(apiKeyTable.countryAccountsId, countryAccountsId),
			sql`lower(trim(${apiKeyTable.name})) = lower(trim(${name}))`,
		];
		if (excludeId) {
			conditions.push(ne(apiKeyTable.id, excludeId));
		}

		const rows = await db
			.select({ id: apiKeyTable.id })
			.from(apiKeyTable)
			.where(and(...conditions))
			.limit(1);

		return rows.length > 0;
	},

	create: (
		data: {
			name: string;
			managedByUserId?: string | null;
			countryAccountsId?: string | null;
		},
		tx?: Tx,
	) => {
		return (tx ?? dr)
			.insert(apiKeyTable)
			.values({
				createdAt: sql`CURRENT_TIMESTAMP`,
				name: data.name,
				managedByUserId: data.managedByUserId!,
				secret: generateSecret(),
				countryAccountsId: data.countryAccountsId ?? null,
			})
			.returning({
				id: apiKeyTable.id,
				name: apiKeyTable.name,
				secret: apiKeyTable.secret,
			})
			.execute();
	},

	update: (id: string, name: string, tx?: Tx) => {
		return (tx ?? dr)
			.update(apiKeyTable)
			.set({ updatedAt: sql`CURRENT_TIMESTAMP`, name })
			.where(eq(apiKeyTable.id, id))
			.execute();
	},

	delete: (id: string, tx?: Tx) => {
		return (tx ?? dr).delete(apiKeyTable).where(eq(apiKeyTable.id, id));
	},

	deleteByCountryAccountId: (countryAccountsId: string, tx?: Tx) => {
		return (tx ?? dr)
			.delete(apiKeyTable)
			.where(eq(apiKeyTable.countryAccountsId, countryAccountsId));
	},

	getByCountryAccountsId: (countryAccountsId: string, tx?: Tx) => {
		return (tx ?? dr)
			.select()
			.from(apiKeyTable)
			.where(eq(apiKeyTable.countryAccountsId, countryAccountsId));
	},

	getBySecret: (secret: string, tx?: Tx) => {
		return (tx ?? dr)
			.select()
			.from(apiKeyTable)
			.where(eq(apiKeyTable.secret, secret));
	},

	createMany: (data: InsertApiKey[], tx?: Tx) => {
		return (tx ?? dr).insert(apiKeyTable).values(data).returning().execute();
	},
};
