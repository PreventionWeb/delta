import { Module } from "@nestjs/common";
import * as path from "path";

import { BASE_UPLOAD_PATH } from "~/utils/paths";
import { LocalDiskAttachmentStorageAdapter } from "./LocalDiskAttachmentStorageAdapter.server";
import { ATTACHMENT_STORAGE_PORT } from "./AttachmentStoragePortToken";

@Module({
	providers: [
		// useFactory, not useClass -- the adapter's constructor takes the upload root path, not
		// a zero-arg construction NestJS's useClass would call (same rationale as
		// ValidationWorkflowModule's NOTIFICATION_PORT provider, design.md Decision 2).
		{
			provide: ATTACHMENT_STORAGE_PORT,
			useFactory: () =>
				new LocalDiskAttachmentStorageAdapter(
					path.resolve(process.cwd(), BASE_UPLOAD_PATH),
				),
		},
	],
	// Token stays hidden -- design.md Decision 2 / ValidationWorkflowModule's own convention.
	exports: [ATTACHMENT_STORAGE_PORT],
})
export class SharedAttachmentStorageModule {}
