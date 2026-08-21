import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import ContentRepeaterFileValidator from "~/components/ContentRepeater/FileValidator";
import { DisasterEventDeclarationAttachmentRepository } from "~/db/queries/disasterEventDeclarationAttachmentRepository";
import { getDeclarationForTenantById } from "~/routes/$lang+/api+/disaster-event+/declarations+/declaration_api.server";
import { BASE_UPLOAD_PATH } from "~/utils/paths";

export interface DeclarationAttachmentPayload {
	title?: string | null;
	fileKey?: string | null;
	fileName?: string | null;
	fileType?: string | null;
	fileSize?: number | string | null;
}

export function isMultipartRequest(request: Request): boolean {
	const contentType = request.headers.get("content-type") || "";
	return contentType.toLowerCase().includes("multipart/form-data");
}

export function getMultipartFiles(formData: FormData): File[] {
	const fileFields = ["file", "files", "files[]"];
	const uploadedFiles: File[] = [];

	for (const fieldName of fileFields) {
		for (const value of formData.getAll(fieldName)) {
			if (value instanceof File) {
				uploadedFiles.push(value);
			}
		}
	}

	return uploadedFiles;
}

function absoluteUploadPathFromKey(fileKey: string): string | null {
	const trimmed = String(fileKey || "").trim();
	if (!trimmed) {
		return null;
	}

	const normalized = trimmed.replace(/\\/g, "/").replace(/^\/+/, "");
	const absolute = path.resolve(process.cwd(), normalized);
	const uploadsRoot = path.resolve(process.cwd(), BASE_UPLOAD_PATH);
	if (!absolute.startsWith(uploadsRoot)) {
		return null;
	}

	return absolute;
}

function deletePhysicalFileByKey(fileKey: string) {
	const absolutePath = absoluteUploadPathFromKey(fileKey);
	if (!absolutePath || !fs.existsSync(absolutePath)) {
		return;
	}

	try {
		if (fs.statSync(absolutePath).isFile()) {
			fs.unlinkSync(absolutePath);
		}
	} catch {
		// Best effort cleanup.
	}
}

function buildDeclarationAttachmentDir(args: {
	countryAccountsId: string;
	disasterEventId: string;
	declarationId: string;
}) {
	return path.resolve(
		process.cwd(),
		BASE_UPLOAD_PATH,
		`tenant-${args.countryAccountsId}`,
		"disaster-event",
		args.disasterEventId,
		"declarations",
		args.declarationId,
	);
}

export async function uploadDeclarationAttachmentFile(args: {
	countryAccountsId: string;
	disasterEventId: string;
	declarationId: string;
	uploadedFile: File;
	title?: string | null;
}): Promise<DeclarationAttachmentPayload> {
	const safeOriginalName = path.basename(args.uploadedFile.name || "").trim();
	if (!safeOriginalName) {
		throw new Response("file is required", { status: 400 });
	}

	if (!ContentRepeaterFileValidator.isValidExtension(safeOriginalName)) {
		throw new Response("Invalid file type", { status: 400 });
	}

	if (!ContentRepeaterFileValidator.isValidSize(args.uploadedFile.size)) {
		throw new Response("File exceeds max size (10MB)", { status: 400 });
	}

	const ext = path.extname(safeOriginalName).toLowerCase();
	const baseName = path
		.basename(safeOriginalName, ext)
		.replace(/[^A-Za-z0-9._-]/g, "_");
	const storedName = `${randomUUID()}__${baseName}${ext}`;
	const destDir = buildDeclarationAttachmentDir(args);
	fs.mkdirSync(destDir, { recursive: true });

	const destAbsPath = path.resolve(destDir, storedName);
	const buffer = Buffer.from(await args.uploadedFile.arrayBuffer());
	fs.writeFileSync(destAbsPath, buffer);

	const fileKey = `/${path
		.join(
			BASE_UPLOAD_PATH,
			`tenant-${args.countryAccountsId}`,
			"disaster-event",
			args.disasterEventId,
			"declarations",
			args.declarationId,
			storedName,
		)
		.replace(/\\/g, "/")}`;

	return {
		title: String(args.title ?? baseName).trim() || baseName,
		fileKey,
		fileName: safeOriginalName,
		fileType: args.uploadedFile.type || "application/octet-stream",
		fileSize: args.uploadedFile.size,
	};
}

function normalizePayload(payload: DeclarationAttachmentPayload) {
	const title = String(payload?.title ?? payload?.fileName ?? "").trim();
	const fileKey = String(payload?.fileKey ?? "").trim();
	const fileName = String(payload?.fileName ?? "").trim();
	const fileType = String(payload?.fileType ?? "").trim();
	const fileSize = Number(payload?.fileSize ?? 0);

	if (!title || !fileKey || !fileName) {
		throw new Response("title, fileKey and fileName are required", {
			status: 400,
		});
	}

	return { title, fileKey, fileName, fileType, fileSize };
}

async function ensureDeclarationScope(args: {
	countryAccountsId: string;
	disasterEventId: string;
	declarationId: string;
}) {
	const declaration = await getDeclarationForTenantById({
		countryAccountsId: args.countryAccountsId,
		id: args.declarationId,
	});
	if (!declaration || declaration.disasterEventId !== args.disasterEventId) {
		throw new Response("Declaration not found", { status: 404 });
	}
	return declaration;
}

export async function listDeclarationAttachments(args: {
	countryAccountsId: string;
	disasterEventId: string;
	declarationId: string;
}) {
	await ensureDeclarationScope(args);
	return DisasterEventDeclarationAttachmentRepository.listByDisasterEventDeclarationId(
		args.declarationId,
	);
}

export async function getDeclarationAttachmentById(args: {
	countryAccountsId: string;
	disasterEventId: string;
	declarationId: string;
	attachmentId: string;
}) {
	await ensureDeclarationScope(args);
	return DisasterEventDeclarationAttachmentRepository.getByIdAndDisasterEventDeclarationId(
		args.attachmentId,
		args.declarationId,
	);
}

export async function createDeclarationAttachment(args: {
	countryAccountsId: string;
	disasterEventId: string;
	declarationId: string;
	payload: DeclarationAttachmentPayload;
}) {
	await ensureDeclarationScope(args);
	const normalized = normalizePayload(args.payload);
	return DisasterEventDeclarationAttachmentRepository.createOne({
		disasterEventDeclarationId: args.declarationId,
		...normalized,
	});
}

export async function updateDeclarationAttachment(args: {
	countryAccountsId: string;
	disasterEventId: string;
	declarationId: string;
	attachmentId: string;
	payload: DeclarationAttachmentPayload;
}) {
	const existing = await getDeclarationAttachmentById(args);
	if (!existing) {
		throw new Response("Attachment not found", { status: 404 });
	}
	const normalized = normalizePayload(args.payload);
	const updated = await DisasterEventDeclarationAttachmentRepository.updateById(
		args.attachmentId,
		{ ...normalized, updatedAt: new Date() },
	);

	if (existing.fileKey !== normalized.fileKey) {
		deletePhysicalFileByKey(existing.fileKey);
	}

	return updated ?? existing;
}

export async function deleteDeclarationAttachment(args: {
	countryAccountsId: string;
	disasterEventId: string;
	declarationId: string;
	attachmentId: string;
}) {
	const existing = await getDeclarationAttachmentById(args);
	if (!existing) {
		throw new Response("Attachment not found", { status: 404 });
	}

	deletePhysicalFileByKey(existing.fileKey);
	await DisasterEventDeclarationAttachmentRepository.deleteById(
		args.attachmentId,
	);
}
