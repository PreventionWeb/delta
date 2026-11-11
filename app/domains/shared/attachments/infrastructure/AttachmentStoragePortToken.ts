import type { InjectionToken } from "@nestjs/common";

import type { IAttachmentStoragePort } from "~/domains/shared/attachments/application/ports/IAttachmentStoragePort";

// Same hidden-token convention as NotificationPortToken.ts (design.md Decision 2).
export const ATTACHMENT_STORAGE_PORT: InjectionToken<IAttachmentStoragePort> =
	Symbol("ATTACHMENT_STORAGE_PORT");
