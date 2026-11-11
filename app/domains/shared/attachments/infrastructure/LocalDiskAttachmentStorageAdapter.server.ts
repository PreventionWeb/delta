import * as fs from "fs/promises";
import * as path from "path";
import { randomUUID } from "crypto";

import { ValidationError, NotFoundError } from "~/shared/errors";
import { sanitizeBasename } from "../application/sanitizeBasename";
import type {
	AttachmentDescriptor,
	IAttachmentStoragePort,
	PromoteResult,
	StagedFileReference,
} from "../application/ports/IAttachmentStoragePort";

// Rejects a bare Windows drive letter ("C:") too -- path.resolve() on win32 treats that as
// "current directory of that drive," not a literal segment (Gate 8 finding: this port is
// reused by future DE/DR callers that may not share HE's own "always a real UUID" guarantee).
const DRIVE_LETTER_PATTERN = /^[a-zA-Z]:$/;

/** ownerType/ownerId are server-controlled by this port's own contract, never raw client
 * input -- this is defense-in-depth, not the primary traversal guard (that's
 * sanitizeBasename + resolveWithin below). */
function assertSafeSegment(segment: string, label: string): void {
	if (
		segment === "" ||
		segment === "." ||
		segment.includes("/") ||
		segment.includes("\\") ||
		segment.includes("..") ||
		DRIVE_LETTER_PATTERN.test(segment)
	) {
		throw new ValidationError(`Invalid ${label}`);
	}
}

/** Resolves `segments` under `base` and asserts the result cannot have escaped it -- the final,
 * unconditional guard regardless of what sanitizeBasename/assertSafeSegment already caught. */
function resolveWithin(base: string, ...segments: string[]): string {
	const resolvedBase = path.resolve(base);
	const target = path.resolve(resolvedBase, ...segments);
	if (
		target !== resolvedBase &&
		!target.startsWith(`${resolvedBase}${path.sep}`)
	) {
		throw new ValidationError(
			"Resolved attachment path escapes its base directory",
		);
	}
	return target;
}

function hasErrorCode(err: unknown, code: string): boolean {
	return err instanceof Error && (err as NodeJS.ErrnoException).code === code;
}

// Reverses stage()'s own `{uuid}__{basename}` prefix -- kept next to the code that mints it
// (Gate 5/SOLID finding: an application-layer caller decoding this format was a DIP violation).
const STAGED_NAME_PATTERN = /^[0-9a-f-]{36}__(.+)$/i;

function deriveDisplayName(stagedFileName: string): string {
	const match = STAGED_NAME_PATTERN.exec(stagedFileName);
	return match ? match[1] : stagedFileName;
}

/**
 * From-scratch local-disk implementation of `IAttachmentStoragePort` -- deliberately not a
 * wrapper around legacy's `ContentRepeaterUploadFile.save()`/`.delete()`, which trusts a
 * client-supplied path segment and races concurrent callers via directory-wide cleanup
 * (design.md Decision 1). This adapter's `promote()`/`delete()` only ever touch the one file
 * they were asked to touch.
 *
 * Writes to and reads from the same `{uploadRoot}/tenant-{id}/{ownerType}/{ownerId}/` layout
 * legacy's unchanged upload/view routes already serve; `uploadRoot` is the caller-supplied
 * equivalent of `~/utils/paths.ts`'s `BASE_UPLOAD_PATH`.
 */
export class LocalDiskAttachmentStorageAdapter implements IAttachmentStoragePort {
	constructor(private readonly uploadRoot: string) {}

	private tenantDir(tenantId: string): string {
		assertSafeSegment(tenantId, "tenantId");
		return resolveWithin(this.uploadRoot, `tenant-${tenantId}`);
	}

	private tempDir(tenantId: string): string {
		return resolveWithin(this.tenantDir(tenantId), "temp");
	}

	private ownerDir(descriptor: AttachmentDescriptor): string {
		assertSafeSegment(descriptor.ownerType, "ownerType");
		assertSafeSegment(descriptor.ownerId, "ownerId");
		return resolveWithin(
			this.tenantDir(descriptor.tenantId),
			descriptor.ownerType,
			descriptor.ownerId,
		);
	}

	async stage(
		tenantId: string,
		file: { name: string; content: Buffer },
	): Promise<StagedFileReference> {
		const base = sanitizeBasename(file.name);
		// uuid-prefixed, unlike legacy's own save() (which strips this prefix and lets two
		// same-named uploads collide) -- keeps every staged/promoted file's on-disk name unique.
		const stagedName = `${randomUUID()}__${base}`;
		const dir = this.tempDir(tenantId);
		await fs.mkdir(dir, { recursive: true });
		await fs.writeFile(resolveWithin(dir, stagedName), file.content);
		return { name: stagedName };
	}

	async promote(
		descriptor: AttachmentDescriptor,
		staged: StagedFileReference,
	): Promise<PromoteResult> {
		const stagedBase = sanitizeBasename(staged.name);
		const sourcePath = resolveWithin(
			this.tempDir(descriptor.tenantId),
			stagedBase,
		);
		const destDir = this.ownerDir(descriptor);
		await fs.mkdir(destDir, { recursive: true });
		const destPath = resolveWithin(destDir, stagedBase);

		try {
			await this.moveFile(sourcePath, destPath);
		} catch (err) {
			// A friendly, catchable error instead of a raw 500 -- reachable either from a
			// genuinely expired/already-promoted staged file, or from a losing concurrent
			// update's rolled-back transaction leaving the file already moved on a naive retry
			// (Gate 10 finding).
			if (hasErrorCode(err, "ENOENT")) {
				throw new ValidationError(
					"Staged attachment file was not found -- it may have already been saved or its upload expired; please re-upload it",
					{ stagedFileName: stagedBase },
				);
			}
			throw err;
		}
		const stat = await fs.stat(destPath);
		return {
			fileKey: stagedBase,
			fileSize: stat.size,
			fileName: deriveDisplayName(stagedBase),
		};
	}

	async delete(
		descriptor: AttachmentDescriptor,
		fileKey: string,
	): Promise<void> {
		const target = resolveWithin(
			this.ownerDir(descriptor),
			sanitizeBasename(fileKey),
		);
		try {
			await fs.unlink(target);
		} catch (err) {
			if (hasErrorCode(err, "ENOENT")) {
				return; // already-deleted is success, not an error (spec: idempotent).
			}
			throw err;
		}
	}

	async retrieve(
		descriptor: AttachmentDescriptor,
		fileKey: string,
	): Promise<Buffer> {
		const target = resolveWithin(
			this.ownerDir(descriptor),
			sanitizeBasename(fileKey),
		);
		try {
			return await fs.readFile(target);
		} catch (err) {
			if (hasErrorCode(err, "ENOENT")) {
				throw new NotFoundError("AttachmentFile", fileKey);
			}
			throw err;
		}
	}

	/** `rename` only fails across filesystem boundaries (EXDEV) -- temp and permanent storage
	 * share the same tenant root today, but the fallback keeps this correct if that ever changes. */
	private async moveFile(source: string, dest: string): Promise<void> {
		try {
			await fs.rename(source, dest);
		} catch (err) {
			if (hasErrorCode(err, "EXDEV")) {
				await fs.copyFile(source, dest);
				await fs.unlink(source);
				return;
			}
			throw err;
		}
	}
}
