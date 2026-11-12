import type { Tx } from "~/db.server";

/** One audit_logs row, domain/entity-agnostic (design.md Decision 2). */
export interface AuditLogEntry {
	readonly tableName: string;
	readonly recordId: string;
	readonly userId: string;
	readonly action: string;
	readonly oldValues: unknown;
	readonly newValues: unknown;
	readonly countryAccountsId: string | null;
}

export interface IAuditLogPort {
	/** With `tx`, joins the caller's transaction; without it, writes immediately via the
	 * adapter's own client (Decision 2). */
	record(entry: AuditLogEntry, tx?: Tx): Promise<void>;
}
