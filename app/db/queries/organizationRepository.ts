import { and, asc, desc, eq, ilike, sql } from "drizzle-orm";
import { dr, Tx } from "~/db.server";
import {
	organizationTable,
	InsertOrganization,
	SelectOrganization,
} from "~/drizzle/schema/organizationTable";
import { userCountryAccountsTable } from "~/drizzle/schema/userCountryAccountsTable";
import { isValidUUID } from "~/utils/id";

type OrganizationCountryAccountsId = NonNullable<
	SelectOrganization["countryAccountsId"]
>;

export type OrganizationSortColumn = "name" | "users";
export type OrganizationSortDirection = "asc" | "desc";

export interface ListByCountryAccountsIdArgs {
	countryAccountsId: OrganizationCountryAccountsId;
	search?: string;
	sort?: OrganizationSortColumn;
	dir?: OrganizationSortDirection;
	pagination: {
		page: number;
		pageSize: number;
	};
}

export type OrganizationListItem = Pick<SelectOrganization, "id" | "name"> & {
	users: number;
};

function escapeIlikePattern(value: string): string {
	return value
		.replaceAll("\\", "\\\\")
		.replaceAll("%", "\\%")
		.replaceAll("_", "\\_");
}

function getOrderBy(
	sort: OrganizationSortColumn,
	dir: OrganizationSortDirection,
) {
	const dirFn = dir === "desc" ? desc : asc;
	if (sort === "users") {
		return [
			dirFn(sql`count(${userCountryAccountsTable.id})`),
			asc(sql`lower(${organizationTable.name})`),
			dirFn(organizationTable.id),
		];
	}
	return [
		dirFn(sql`lower(${organizationTable.name})`),
		dirFn(organizationTable.id),
	];
}

export const OrganizationRepository = {
	create: async (
		data: Omit<InsertOrganization, "id" | "createdAt">,
		tx?: Tx,
	): Promise<SelectOrganization | null> => {
		const db = tx ?? dr;
		const rows = await db.insert(organizationTable).values(data).returning();

		return rows[0] ?? null;
	},
	createMany: async (
		data: InsertOrganization[],
		tx?: Tx,
	): Promise<SelectOrganization[]> => {
		if (data.length === 0) {
			return [];
		}
		const db = tx ?? dr;
		return db.insert(organizationTable).values(data).returning();
	},
	getByNameAndCountryAccountsId: async (
		name: string,
		countryAccountsId: OrganizationCountryAccountsId,
		tx?: Tx,
	): Promise<SelectOrganization | undefined> => {
		const db = tx ?? dr;
		const rows = await db
			.select()
			.from(organizationTable)
			.where(
				and(
					eq(organizationTable.countryAccountsId, countryAccountsId),
					sql`lower(trim(${organizationTable.name})) = lower(trim(${name}))`,
				),
			)
			.limit(1);
		return rows[0];
	},
	getById: async (
		id: SelectOrganization["id"],
		tx?: Tx,
	): Promise<SelectOrganization | undefined> => {
		if (!isValidUUID(id)) {
			return undefined;
		}
		const db = tx ?? dr;
		return db.query.organizationTable.findFirst({
			where: eq(organizationTable.id, id),
		});
	},
	updateById: async (
		id: string,
		data: Partial<Omit<InsertOrganization, "id" | "createdAt" | "updatedAt">>,
		tx?: Tx,
	): Promise<SelectOrganization | null> => {
		const db = tx ?? dr;
		const rows = await db
			.update(organizationTable)
			.set(data)
			.where(eq(organizationTable.id, id))
			.returning();

		return rows[0] ?? null;
	},
	deleteById: async (
		id: SelectOrganization["id"],
		tx?: Tx,
	): Promise<SelectOrganization | null> => {
		const db = tx ?? dr;
		const rows = await db
			.delete(organizationTable)
			.where(eq(organizationTable.id, id))
			.returning();

		return rows[0] ?? null;
	},
	deleteByCountryAccountId: (countryAccountsId: string, tx?: Tx) => {
		return (tx ?? dr)
			.delete(organizationTable)
			.where(eq(organizationTable.countryAccountsId, countryAccountsId));
	},
	listByCountryAccountsId: async (args: ListByCountryAccountsIdArgs) => {
		const { countryAccountsId, pagination } = args;
		const search = (args.search ?? "").trim();
		const sort: OrganizationSortColumn =
			args.sort === "users" ? "users" : "name";
		const dir: OrganizationSortDirection = args.dir === "desc" ? "desc" : "asc";

		if (!isValidUUID(countryAccountsId)) {
			throw new Error(`Invalid UUID: ${countryAccountsId}`);
		}

		const requestedPage = Number.isFinite(pagination.page)
			? Math.max(1, Math.trunc(pagination.page))
			: 1;
		const pageSize = Number.isFinite(pagination.pageSize)
			? Math.max(1, Math.trunc(pagination.pageSize))
			: 25;

		const conditions = [
			eq(organizationTable.countryAccountsId, countryAccountsId),
		];
		if (search) {
			const searchIlike = `%${escapeIlikePattern(search)}%`;
			conditions.push(ilike(organizationTable.name, searchIlike));
		}
		const where = and(...conditions);

		const [totalItems, nameRows] = await Promise.all([
			dr.$count(organizationTable, where),
			dr
				.select({ name: organizationTable.name })
				.from(organizationTable)
				.where(eq(organizationTable.countryAccountsId, countryAccountsId)),
		]);

		const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
		const page = Math.min(requestedPage, totalPages);
		const offset = (page - 1) * pageSize;

		const rows = await dr
			.select({
				id: organizationTable.id,
				name: organizationTable.name,
				users: sql<number>`count(${userCountryAccountsTable.id})::int`,
			})
			.from(organizationTable)
			.leftJoin(
				userCountryAccountsTable,
				and(
					eq(userCountryAccountsTable.organizationId, organizationTable.id),
					eq(
						userCountryAccountsTable.countryAccountsId,
						organizationTable.countryAccountsId,
					),
				),
			)
			.where(where)
			.groupBy(organizationTable.id)
			.orderBy(...getOrderBy(sort, dir))
			.limit(pageSize)
			.offset(offset);

		const items: OrganizationListItem[] = rows.map((row) => ({
			id: row.id,
			name: row.name,
			users: Number(row.users) || 0,
		}));

		return {
			items,
			existingNames: nameRows.map((r) => r.name),
			pagination: {
				totalItems,
				itemsOnThisPage: items.length,
				page,
				pageSize,
				extraParams: search ? { search: [search] } : {},
			},
		};
	},
	getByCountryAccountsId: (
		countryAccountsId: OrganizationCountryAccountsId,
		tx?: Tx,
	): Promise<SelectOrganization[]> => {
		if (!isValidUUID(countryAccountsId)) {
			throw new Error(`Invalid UUID: ${countryAccountsId}`);
		}
		return (tx ?? dr)
			.select()
			.from(organizationTable)
			.where(eq(organizationTable.countryAccountsId, countryAccountsId))
			.execute();
	},
};
