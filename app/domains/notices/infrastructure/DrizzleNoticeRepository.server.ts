/**
 * Drizzle ORM adapter for the Notices domain repository port.
 *
 * WHY this file exists:
 *   The application layer (use-cases) depends on `INoticeRepository`, not on any
 *   concrete persistence mechanism. This file bridges that port to the `notices`
 *   Drizzle table so the NestJS container can wire the dependency at runtime.
 *
 * WHY `.server.ts` suffix:
 *   This module imports `~/db.server` which is server-only. The `.server.ts`
 *   suffix prevents React Router's bundler from accidentally including it in
 *   the client bundle (Decision 1 in design.md).
 */
import { Injectable, Inject } from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";

import type { Dr } from "~/db.server";
import { noticesTable, type SelectNotice } from "~/drizzle/schema/noticesTable";
import { DRIZZLE_CLIENT } from "~/infrastructure/DrizzleProvider.server";
import type { INoticeRepository } from "~/domains/notices/application/ports/INoticeRepository";
import { Notice, type LocaleMap, type Audience } from "~/domains/notices/domain/Notice";
import type { Pagination } from "~/shared/types";
import { ConflictError, NotFoundError } from "~/shared/errors/DomainError";

@Injectable()
export class DrizzleNoticeRepository implements INoticeRepository {
	constructor(
		/**
		 * WHY typed symbol token (DRIZZLE_CLIENT) rather than a plain string:
		 *   NestJS treats a typed Symbol token and a plain string "DRIZZLE_CLIENT" as
		 *   different provider keys. The Symbol token guarantees TypeScript and the
		 *   NestJS container agree on the injected type (Decision 2 in design.md).
		 */
		@Inject(DRIZZLE_CLIENT) private readonly db: Dr,
	) {}

	/**
	 * Maps a DB row to a validated Notice entity.
	 *
	 * WHY a private helper rather than inline mapping:
	 *   Keeping the column→prop mapping in one place means a schema change only
	 *   needs updating here, not scattered across four method bodies (Decision 4).
	 *
	 * If a persisted row violates a domain invariant (e.g. publishedAt set on an
	 * unpublished notice from a bad migration), Notice.create() will throw a
	 * ValidationError — intentionally, as a guard against corrupt data reaching
	 * the application layer.
	 */
	private toEntity(row: SelectNotice): Notice {
		return Notice.create({
			id: row.id,
			// country_accounts_id → tenantId: the DB uses the infra column name;
			// the domain uses the concept name.
			tenantId: row.countryAccountsId,
			titleJson: row.titleJson as LocaleMap,
			// bodyJson is nullable jsonb; the cast is safe because upstream save()
			// always receives a domain entity whose bodyJson was already validated
			// as LocaleMap | null before persistence.
			bodyJson: row.bodyJson as LocaleMap | null,
			isPublished: row.isPublished,
			audience: row.audience as Audience,
			publishedAt: row.publishedAt,
			createdAt: row.createdAt,
			updatedAt: row.updatedAt,
		});
	}

	/**
	 * Returns the notice identified by `id` within tenant `tenantId`.
	 *
	 * WHY two-column WHERE clause:
	 *   A WHERE clause on id alone would let a caller read another tenant's notice
	 *   by guessing its UUID. The tenantId column is the cross-tenant access guard.
	 */
	async findById(id: string, tenantId: string): Promise<Notice> {
		const rows = await this.db
			.select()
			.from(noticesTable)
			.where(
				and(
					eq(noticesTable.id, id),
					eq(noticesTable.countryAccountsId, tenantId),
				),
			);

		if (rows.length === 0) {
			throw new NotFoundError("Notice", id);
		}

		return this.toEntity(rows[0]);
	}

	/**
	 * Returns all notices for `tenantId`, newest first, with offset pagination.
	 *
	 * WHY ORDER BY createdAt DESC, id ASC:
	 *   The UI list view shows the most recently created notices at the top.
	 *   The secondary sort on id (unique) makes pagination deterministic when two
	 *   notices share the same createdAt — without it, tie rows can move between
	 *   pages on repeated queries (Decision 5 in design.md).
	 */
	async findAll(tenantId: string, pagination: Pagination): Promise<Notice[]> {
		const rows = await this.db
			.select()
			.from(noticesTable)
			.where(eq(noticesTable.countryAccountsId, tenantId))
			.orderBy(desc(noticesTable.createdAt), noticesTable.id)
			.limit(pagination.pageSize)
			.offset((pagination.page - 1) * pagination.pageSize);

		return rows.map((row) => this.toEntity(row));
	}

	/**
	 * Upserts the notice entity.
	 *
	 * WHY ON CONFLICT DO UPDATE rather than SELECT-then-write:
	 *   A separate SELECT followed by INSERT or UPDATE introduces a race condition
	 *   between the check and the write. The single-statement upsert is atomic at
	 *   the DB level (Decision 3 in design.md).
	 *
	 * WHY updatedAt: new Date() in the conflict branch:
	 *   The ON CONFLICT branch must advance updatedAt so callers always observe an
	 *   accurate timestamp on the returned entity, regardless of the value stored
	 *   in the incoming Notice entity.
	 *
	 * WHY WHERE clause on onConflictDoUpdate:
	 *   Without it, a UUID collision across tenants would silently overwrite another
	 *   tenant's notice. The WHERE restricts the update to rows belonging to the
	 *   same tenant. If the condition is not met the upsert is a no-op and
	 *   RETURNING returns [], which we surface as ConflictError.
	 */
	async save(notice: Notice): Promise<Notice> {
		let rows: (typeof noticesTable.$inferSelect)[];
		try {
			rows = await this.db
				.insert(noticesTable)
				.values({
					id: notice.id,
					countryAccountsId: notice.tenantId,
					titleJson: notice.titleJson,
					bodyJson: notice.bodyJson,
					isPublished: notice.isPublished,
					audience: notice.audience,
					publishedAt: notice.publishedAt,
					createdAt: notice.createdAt,
					updatedAt: notice.updatedAt,
				})
				.onConflictDoUpdate({
					target: noticesTable.id,
					set: {
						titleJson: notice.titleJson,
						bodyJson: notice.bodyJson,
						isPublished: notice.isPublished,
						audience: notice.audience,
						publishedAt: notice.publishedAt,
						updatedAt: new Date(),
					},
					// WHY tenant-scoped WHERE: prevents a cross-tenant UUID collision from
					// overwriting another tenant's notice. If this condition is not met,
					// the upsert is a no-op and rows will be empty (handled below).
					where: eq(noticesTable.countryAccountsId, notice.tenantId),
				})
				.returning();
		} catch (err) {
			// PostgreSQL error code "23505" is a unique_violation constraint error.
			// We surface this as ConflictError so callers can handle it without
			// inspecting raw DB exceptions.
			if (
				typeof err === "object" &&
				err !== null &&
				"code" in err &&
				(err as { code: unknown }).code === "23505"
			) {
				throw new ConflictError("Notice already exists");
			}
			throw err;
		}

		// Empty rows means the WHERE clause in onConflictDoUpdate was not satisfied:
		// the id exists but belongs to a different tenant — a cross-tenant collision.
		if (rows.length === 0) {
			throw new ConflictError("Notice id already used by a different tenant");
		}

		return this.toEntity(rows[0]);
	}

	/**
	 * Deletes the notice identified by `id` within tenant `tenantId`.
	 *
	 * WHY idempotent (no error on zero affected rows):
	 *   The port contract specifies void return; callers should not need to check
	 *   existence before deleting. Drizzle's delete() does not error on zero rows,
	 *   so no extra guard is needed (Decision 6 in design.md).
	 *
	 * WHY two-column WHERE clause:
	 *   Same cross-tenant access guard as findById — prevents deleting another
	 *   tenant's notice even when the id matches.
	 */
	async delete(id: string, tenantId: string): Promise<void> {
		await this.db
			.delete(noticesTable)
			.where(
				and(
					eq(noticesTable.id, id),
					eq(noticesTable.countryAccountsId, tenantId),
				),
			);
	}
}
