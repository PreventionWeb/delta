import { Module } from "@nestjs/common";

import { DrizzleProvider } from "~/infrastructure/DrizzleProvider.server";
import { DrizzleAuditLogAdapter } from "./DrizzleAuditLogAdapter.server";
import { AUDIT_LOG_PORT } from "./AuditLogPortToken";

@Module({
	providers: [
		// Returns the same global dr singleton -- no new DB connection.
		DrizzleProvider,
		{
			provide: AUDIT_LOG_PORT,
			useClass: DrizzleAuditLogAdapter,
		},
	],
	// Token stays hidden -- design.md Decision 9 / SharedAttachmentStorageModule's own convention.
	exports: [AUDIT_LOG_PORT],
})
export class SharedAuditLogModule {}
