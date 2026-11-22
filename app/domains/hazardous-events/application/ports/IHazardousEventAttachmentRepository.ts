import type { Tx } from "~/db.server";

export interface HazardousEventAttachmentRecord {
	readonly id: string;
	readonly hazardousEventId: string;
	readonly title: string;
	readonly fileKey: string;
	readonly fileName: string;
	readonly fileType: string;
	readonly fileSize: number;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

export interface IHazardousEventAttachmentRepository {
	insert(
		attachment: Omit<HazardousEventAttachmentRecord, "createdAt" | "updatedAt">,
		tx?: Tx,
	): Promise<HazardousEventAttachmentRecord>;

	findByHazardousEventId(
		hazardousEventId: string,
		tx?: Tx,
	): Promise<readonly HazardousEventAttachmentRecord[]>;

	findById(
		hazardousEventId: string,
		attachmentId: string,
		tx?: Tx,
	): Promise<HazardousEventAttachmentRecord | null>;

	delete(
		hazardousEventId: string,
		attachmentId: string,
		tx?: Tx,
	): Promise<HazardousEventAttachmentRecord | null>;
}
