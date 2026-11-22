import type { IHazardousEventRepository } from "../ports/IHazardousEventRepository";
import type {
	HazardousEventAttachmentRecord,
	IHazardousEventAttachmentRepository,
} from "../ports/IHazardousEventAttachmentRepository";
import type { IHazardousEventAttachmentStorageService } from "../ports/IHazardousEventAttachmentStorageService";
import { assertNonEmptyString } from "../assertNonEmptyString";
import { ValidationError } from "~/shared/errors";

export interface AddHazardousEventAttachmentCommand {
	tenantId: string;
	hazardousEventId: string;
	title?: string;
	fileKey?: string;
	fileName?: string;
	fileType?: string;
	fileSize?: number;
	id?: string;
	file?: {
		originalName: string;
		mimeType: string;
		buffer: Buffer;
	};
}

export interface HazardousEventAttachmentDto {
	id: string;
	hazardousEventId: string;
	title: string;
	fileKey: string;
	fileName: string;
	fileType: string;
	fileSize: number;
	createdAt: string;
	updatedAt: string;
}

function requireNonEmptyString(value: unknown, field: string): string {
	if (typeof value !== "string" || value.trim().length === 0) {
		throw new ValidationError(`${field} must be a non-empty string`);
	}
	return value;
}

function assertSafeClientFileKey(fileKey: string, tenantId: string): void {
	const normalized = fileKey.replace(/\\/g, "/");
	if (normalized.split("/").includes("..")) {
		throw new ValidationError(
			"fileKey must not contain path traversal segments",
		);
	}
	const tenantSegmentMatch = /(?:^|\/)tenant-([^/]+)(?:\/|$)/.exec(normalized);
	if (tenantSegmentMatch && tenantSegmentMatch[1] !== tenantId) {
		throw new ValidationError("fileKey cannot reference another tenant");
	}
}

export class AddHazardousEventAttachmentUseCase {
	constructor(
		private readonly hazardousEventRepository: Pick<
			IHazardousEventRepository,
			"findById"
		>,
		private readonly attachmentRepository: IHazardousEventAttachmentRepository,
		private readonly storageService?: Pick<
			IHazardousEventAttachmentStorageService,
			"storeAttachmentFile" | "deleteAttachmentFile"
		>,
	) {}

	async execute(
		command: AddHazardousEventAttachmentCommand,
	): Promise<HazardousEventAttachmentDto> {
		assertNonEmptyString(command.tenantId, "tenantId");
		assertNonEmptyString(command.hazardousEventId, "hazardousEventId");

		// Verifies the event exists and belongs to the caller's tenant; throws NotFoundError if not.
		await this.hazardousEventRepository.findById(
			command.hazardousEventId,
			command.tenantId,
		);

		let storedFileKey: string | undefined;
		let attachmentToInsert: Omit<
			HazardousEventAttachmentRecord,
			"createdAt" | "updatedAt"
		>;

		if (command.file) {
			if (!this.storageService) {
				throw new Error("Attachment storage service is not configured");
			}

			const stored = await this.storageService.storeAttachmentFile({
				tenantId: command.tenantId,
				hazardousEventId: command.hazardousEventId,
				originalName: command.file.originalName,
				mimeType: command.file.mimeType,
				buffer: command.file.buffer,
			});

			storedFileKey = stored.fileKey;
			attachmentToInsert = {
				id: command.id ?? crypto.randomUUID(),
				hazardousEventId: command.hazardousEventId,
				title: command.title?.trim() ? command.title.trim() : stored.fileName,
				fileKey: stored.fileKey,
				fileName: stored.fileName,
				fileType: stored.fileType,
				fileSize: stored.fileSize,
			};
		} else {
			const title = requireNonEmptyString(command.title, "title");
			const fileKey = requireNonEmptyString(command.fileKey, "fileKey");
			const fileName = requireNonEmptyString(command.fileName, "fileName");
			const fileType = requireNonEmptyString(command.fileType, "fileType");

			if (
				typeof command.fileSize !== "number" ||
				!Number.isInteger(command.fileSize) ||
				command.fileSize < 0
			) {
				throw new ValidationError("fileSize must be a non-negative integer");
			}

			assertSafeClientFileKey(fileKey, command.tenantId);

			attachmentToInsert = {
				id: command.id ?? crypto.randomUUID(),
				hazardousEventId: command.hazardousEventId,
				title,
				fileKey,
				fileName,
				fileType,
				fileSize: command.fileSize,
			};
		}

		let record: HazardousEventAttachmentRecord;
		try {
			record = await this.attachmentRepository.insert(attachmentToInsert);
		} catch (err) {
			if (storedFileKey && this.storageService) {
				try {
					await this.storageService.deleteAttachmentFile(
						storedFileKey,
						command.tenantId,
					);
				} catch {
					// Preserve the original repository error if rollback cleanup fails.
				}
			}
			throw err;
		}

		return {
			id: record.id,
			hazardousEventId: record.hazardousEventId,
			title: record.title,
			fileKey: record.fileKey,
			fileName: record.fileName,
			fileType: record.fileType,
			fileSize: record.fileSize,
			createdAt: record.createdAt.toISOString(),
			updatedAt: record.updatedAt.toISOString(),
		};
	}
}
