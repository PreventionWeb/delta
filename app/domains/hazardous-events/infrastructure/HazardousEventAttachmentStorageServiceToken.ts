import type { InjectionToken } from "@nestjs/common";
import type { IHazardousEventAttachmentStorageService } from "~/domains/hazardous-events/application/ports/IHazardousEventAttachmentStorageService";

export const HAZARDOUS_EVENT_ATTACHMENT_STORAGE_SERVICE: InjectionToken<IHazardousEventAttachmentStorageService> =
	Symbol("IHazardousEventAttachmentStorageService");
