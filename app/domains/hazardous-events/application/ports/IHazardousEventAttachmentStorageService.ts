import type { Readable } from "node:stream";

export interface StoredAttachmentFile {
	readonly fileKey: string;
	readonly fileName: string;
	readonly fileType: string;
	readonly fileSize: number;
}

export interface StoreAttachmentFileInput {
	readonly tenantId: string;
	readonly hazardousEventId: string;
	readonly originalName: string;
	readonly mimeType: string;
	readonly buffer: Buffer;
}

export interface AttachmentFileStream {
	readonly stream: Readable;
	readonly size: number;
}

export interface IHazardousEventAttachmentStorageService {
	storeAttachmentFile(
		input: StoreAttachmentFileInput,
	): Promise<StoredAttachmentFile>;

	deleteAttachmentFile(fileKey: string, tenantId: string): Promise<void>;

	getAttachmentFile(
		fileKey: string,
		tenantId: string,
	): Promise<AttachmentFileStream | null>;
}
