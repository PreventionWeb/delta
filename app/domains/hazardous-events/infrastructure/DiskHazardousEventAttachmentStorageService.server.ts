import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { Injectable } from "@nestjs/common";
import ContentRepeaterFileValidator from "~/components/ContentRepeater/FileValidator";
import { BASE_UPLOAD_PATH } from "~/utils/paths";
import { ValidationError } from "~/shared/errors";
import type {
	AttachmentFileStream,
	IHazardousEventAttachmentStorageService,
	StoreAttachmentFileInput,
	StoredAttachmentFile,
} from "../application/ports/IHazardousEventAttachmentStorageService";

function isEnoent(err: unknown): boolean {
	return (
		typeof err === "object" &&
		err !== null &&
		"code" in err &&
		err.code === "ENOENT"
	);
}

@Injectable()
export class DiskHazardousEventAttachmentStorageService implements IHazardousEventAttachmentStorageService {
	private resolveTenantRoot(tenantId: string): string {
		const trimmedTenantId = String(tenantId || "").trim();
		if (!trimmedTenantId) {
			throw new ValidationError("tenantId is required");
		}
		const uploadsRoot = path.resolve(process.cwd(), BASE_UPLOAD_PATH);
		const tenantRoot = path.resolve(uploadsRoot, `tenant-${trimmedTenantId}`);
		if (!tenantRoot.startsWith(uploadsRoot + path.sep)) {
			throw new ValidationError("Invalid tenantId");
		}
		return tenantRoot;
	}

	private resolveTenantFilePath(
		fileKey: string,
		tenantId: string,
	): string | null {
		const trimmed = String(fileKey || "").trim();
		if (!trimmed) {
			return null;
		}

		const normalized = trimmed.replace(/\\/g, "/").replace(/^\/+/, "");
		const absolute = path.resolve(process.cwd(), normalized);
		const tenantRoot = this.resolveTenantRoot(tenantId);

		// Enforce strict tenant-directory containment (with trailing path.sep) to
		// prevent sibling-prefix bypasses and cross-tenant file access.
		if (!absolute.startsWith(tenantRoot + path.sep)) {
			return null;
		}

		return absolute;
	}

	async storeAttachmentFile(
		input: StoreAttachmentFileInput,
	): Promise<StoredAttachmentFile> {
		const safeOriginalName = path.basename(input.originalName || "").trim();
		if (!safeOriginalName) {
			throw new ValidationError("File name is required");
		}

		if (!ContentRepeaterFileValidator.isValidExtension(safeOriginalName)) {
			throw new ValidationError("Invalid file type");
		}

		if (!ContentRepeaterFileValidator.isValidSize(input.buffer.length)) {
			throw new ValidationError("File exceeds max size (10MB)");
		}

		const ext = path.extname(safeOriginalName).toLowerCase();
		const baseName = path
			.basename(safeOriginalName, ext)
			.replace(/[^A-Za-z0-9._-]/g, "_");
		const storedName = `${crypto.randomUUID()}__${baseName}${ext}`;

		const tenantRoot = this.resolveTenantRoot(input.tenantId);
		const destDir = path.resolve(
			tenantRoot,
			"hazardous-event",
			input.hazardousEventId,
		);
		if (!destDir.startsWith(tenantRoot + path.sep)) {
			throw new ValidationError("Invalid hazardousEventId");
		}

		const destAbsPath = path.resolve(destDir, storedName);
		if (!destAbsPath.startsWith(destDir + path.sep)) {
			throw new ValidationError("Invalid file name");
		}

		await fsPromises.mkdir(destDir, { recursive: true });
		await fsPromises.writeFile(destAbsPath, input.buffer);

		const fileKey = `/${path
			.join(
				BASE_UPLOAD_PATH,
				`tenant-${input.tenantId}`,
				"hazardous-event",
				input.hazardousEventId,
				storedName,
			)
			.replace(/\\/g, "/")}`;

		return {
			fileKey,
			fileName: safeOriginalName,
			fileType: input.mimeType || "application/octet-stream",
			fileSize: input.buffer.length,
		};
	}

	async deleteAttachmentFile(fileKey: string, tenantId: string): Promise<void> {
		const absolute = this.resolveTenantFilePath(fileKey, tenantId);
		if (!absolute) {
			return;
		}

		try {
			const stat = await fsPromises.stat(absolute);
			if (stat.isFile()) {
				await fsPromises.unlink(absolute);
			}
		} catch (err) {
			if (isEnoent(err)) {
				return;
			}
			throw err;
		}
	}

	async getAttachmentFile(
		fileKey: string,
		tenantId: string,
	): Promise<AttachmentFileStream | null> {
		const absolute = this.resolveTenantFilePath(fileKey, tenantId);
		if (!absolute) {
			return null;
		}

		try {
			const stat = await fsPromises.stat(absolute);
			if (!stat.isFile()) {
				return null;
			}

			return {
				stream: fs.createReadStream(absolute),
				size: stat.size,
			};
		} catch (err) {
			if (isEnoent(err)) {
				return null;
			}
			throw err;
		}
	}
}
