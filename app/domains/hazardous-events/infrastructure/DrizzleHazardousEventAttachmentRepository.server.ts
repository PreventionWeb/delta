import { Injectable, Inject } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import type { Dr, Tx } from "~/db.server";
import { DRIZZLE_CLIENT } from "~/infrastructure/DrizzleProvider.server";
import { pgErrorCode } from "~/infrastructure/pgErrorCode.server";
import { ConflictError, NotFoundError } from "~/shared/errors";
import {
	hazardousEventAttachmentTable,
	type SelectHazardousEventAttachment,
} from "./hazardousEventAttachmentTable";
import type {
	IHazardousEventAttachmentRepository,
	HazardousEventAttachmentRecord,
} from "../application/ports/IHazardousEventAttachmentRepository";

const PG_UNIQUE_VIOLATION = "23505";
const PG_FOREIGN_KEY_VIOLATION = "23503";

@Injectable()
export class DrizzleHazardousEventAttachmentRepository implements IHazardousEventAttachmentRepository {
	constructor(@Inject(DRIZZLE_CLIENT) private readonly db: Dr) {}

	private toRecord(
		row: SelectHazardousEventAttachment,
	): HazardousEventAttachmentRecord {
		return {
			id: row.id,
			hazardousEventId: row.hazardousEventId,
			title: row.title,
			fileKey: row.fileKey,
			fileName: row.fileName,
			fileType: row.fileType,
			fileSize: Number(row.fileSize),
			createdAt: row.createdAt,
			updatedAt: row.updatedAt,
		};
	}

	async insert(
		attachment: Omit<HazardousEventAttachmentRecord, "createdAt" | "updatedAt">,
		tx?: Tx,
	): Promise<HazardousEventAttachmentRecord> {
		const executor = tx ?? this.db;
		try {
			const [row] = await executor
				.insert(hazardousEventAttachmentTable)
				.values({
					id: attachment.id,
					hazardousEventId: attachment.hazardousEventId,
					title: attachment.title,
					fileKey: attachment.fileKey,
					fileName: attachment.fileName,
					fileType: attachment.fileType,
					fileSize: attachment.fileSize,
				})
				.returning();

			return this.toRecord(row);
		} catch (err) {
			const code = pgErrorCode(err);
			if (code === PG_UNIQUE_VIOLATION) {
				throw new ConflictError("HazardousEventAttachment already exists", {
					id: attachment.id,
				});
			}
			if (code === PG_FOREIGN_KEY_VIOLATION) {
				throw new NotFoundError("HazardousEvent", attachment.hazardousEventId);
			}
			throw err;
		}
	}

	async findByHazardousEventId(
		hazardousEventId: string,
		tx?: Tx,
	): Promise<readonly HazardousEventAttachmentRecord[]> {
		const executor = tx ?? this.db;
		const rows = await executor
			.select()
			.from(hazardousEventAttachmentTable)
			.where(
				eq(hazardousEventAttachmentTable.hazardousEventId, hazardousEventId),
			);

		return rows.map((row) => this.toRecord(row));
	}

	async findById(
		hazardousEventId: string,
		attachmentId: string,
		tx?: Tx,
	): Promise<HazardousEventAttachmentRecord | null> {
		const executor = tx ?? this.db;
		const [row] = await executor
			.select()
			.from(hazardousEventAttachmentTable)
			.where(
				and(
					eq(hazardousEventAttachmentTable.id, attachmentId),
					eq(hazardousEventAttachmentTable.hazardousEventId, hazardousEventId),
				),
			);

		return row ? this.toRecord(row) : null;
	}

	async delete(
		hazardousEventId: string,
		attachmentId: string,
		tx?: Tx,
	): Promise<HazardousEventAttachmentRecord | null> {
		const executor = tx ?? this.db;
		const [row] = await executor
			.delete(hazardousEventAttachmentTable)
			.where(
				and(
					eq(hazardousEventAttachmentTable.id, attachmentId),
					eq(hazardousEventAttachmentTable.hazardousEventId, hazardousEventId),
				),
			)
			.returning();

		return row ? this.toRecord(row) : null;
	}
}
