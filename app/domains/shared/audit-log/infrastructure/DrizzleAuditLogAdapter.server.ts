import { Injectable, Inject } from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";
import type { Dr, Tx } from "~/db.server";
import { DRIZZLE_CLIENT } from "~/infrastructure/DrizzleProvider.server";
import { auditLogsTable } from "~/drizzle/schema/auditLogsTable";
import { userTable } from "~/drizzle/schema/userTable";
import type {
	AuditLogEntry,
	IAuditLogPort,
} from "~/domains/shared/audit-log/application/ports/IAuditLogPort";

@Injectable()
export class DrizzleAuditLogAdapter implements IAuditLogPort {
	constructor(@Inject(DRIZZLE_CLIENT) private readonly db: Dr) {}

	async record(entry: AuditLogEntry, tx?: Tx): Promise<void> {
		const executor = tx ?? this.db;
		await executor.insert(auditLogsTable).values({
			tableName: entry.tableName,
			recordId: entry.recordId,
			userId: entry.userId,
			action: entry.action,
			oldValues: entry.oldValues,
			newValues: entry.newValues,
			countryAccountsId: entry.countryAccountsId,
		});
	}

	async findByRecord(
		tableName: string,
		recordId: string,
		countryAccountsId: string,
	): Promise<
		{ id: string; action: string; actorName: string; timestamp: Date }[]
	> {
		const rows = await this.db
			.select({
				id: auditLogsTable.id,
				action: auditLogsTable.action,
				// Left join: a dangling user_id must still resolve, not throw.
				firstName: userTable.firstName,
				timestamp: auditLogsTable.timestamp,
			})
			.from(auditLogsTable)
			.leftJoin(userTable, eq(auditLogsTable.userId, userTable.id))
			.where(
				and(
					eq(auditLogsTable.tableName, tableName),
					eq(auditLogsTable.recordId, recordId),
					eq(auditLogsTable.countryAccountsId, countryAccountsId),
				),
			)
			.orderBy(desc(auditLogsTable.timestamp));
		return rows.map((row) => ({
			id: row.id,
			action: row.action,
			actorName: row.firstName ?? "",
			timestamp: row.timestamp,
		}));
	}
}
