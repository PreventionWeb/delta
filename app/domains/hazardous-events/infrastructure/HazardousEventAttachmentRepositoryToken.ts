import type { InjectionToken } from "@nestjs/common";
import type { IHazardousEventAttachmentRepository } from "~/domains/hazardous-events/application/ports/IHazardousEventAttachmentRepository";

export const HAZARDOUS_EVENT_ATTACHMENT_REPOSITORY: InjectionToken<IHazardousEventAttachmentRepository> =
	Symbol("IHazardousEventAttachmentRepository");
