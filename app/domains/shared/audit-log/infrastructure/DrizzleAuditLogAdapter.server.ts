import { Injectable, Inject } from "@nestjs/common";
import type { Dr, Tx } from "~/db.server";
import { DRIZZLE_CLIENT } from "~/infrastructure/DrizzleProvider.server";
import { auditLogsTable } from "~/drizzle/schema/auditLogsTable";
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
}
