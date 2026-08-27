import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import ContentRepeaterFileValidator from "~/components/ContentRepeater/FileValidator";
import { DisasterEventResponseAttachmentRepository } from "~/db/queries/disasterEventResponseAttachmentRepository";
import { getResponseForTenantById } from "~/routes/$lang+/api+/disaster-event+/responses+/response_api.server";
import { BASE_UPLOAD_PATH } from "~/utils/paths";

export interface ResponseAttachmentPayload {
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

function buildResponseAttachmentDir(args: {
	countryAccountsId: string;
	disasterEventId: string;
	responseId: string;
}) {
	return path.resolve(
		process.cwd(),
		BASE_UPLOAD_PATH,
		`tenant-${args.countryAccountsId}`,
		"disaster-event",
		args.disasterEventId,
		"responses",
		args.responseId,
	);
}

export async function uploadResponseAttachmentFile(args: {
	countryAccountsId: string;
	disasterEventId: string;
	responseId: string;
	uploadedFile: File;
	title?: string | null;
}): Promise<ResponseAttachmentPayload> {
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
	const destDir = buildResponseAttachmentDir(args);
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
			"responses",
			args.responseId,
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

function normalizePayload(payload: ResponseAttachmentPayload) {
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

async function ensureResponseScope(args: {
	countryAccountsId: string;
	disasterEventId: string;
	responseId: string;
}) {
	const response = await getResponseForTenantById({
		countryAccountsId: args.countryAccountsId,
		id: args.responseId,
	});
	if (!response || response.disasterEventId !== args.disasterEventId) {
		throw new Response("Response not found", { status: 404 });
	}
	return response;
}

export async function listResponseAttachments(args: {
	countryAccountsId: string;
	disasterEventId: string;
	responseId: string;
}) {
	await ensureResponseScope(args);
	return DisasterEventResponseAttachmentRepository.listByDisasterEventResponseId(
		args.responseId,
	);
}

export async function getResponseAttachmentById(args: {
	countryAccountsId: string;
	disasterEventId: string;
	responseId: string;
	attachmentId: string;
}) {
	await ensureResponseScope(args);
	return DisasterEventResponseAttachmentRepository.getByIdAndDisasterEventResponseId(
		args.attachmentId,
		args.responseId,
	);
}

export async function createResponseAttachment(args: {
	countryAccountsId: string;
	disasterEventId: string;
	responseId: string;
	payload: ResponseAttachmentPayload;
}) {
	await ensureResponseScope(args);
	const normalized = normalizePayload(args.payload);
	return DisasterEventResponseAttachmentRepository.createOne({
		disasterEventResponseId: args.responseId,
		...normalized,
	});
}

export async function updateResponseAttachment(args: {
	countryAccountsId: string;
	disasterEventId: string;
	responseId: string;
	attachmentId: string;
	payload: ResponseAttachmentPayload;
}) {
	const existing = await getResponseAttachmentById(args);
	if (!existing) {
		throw new Response("Attachment not found", { status: 404 });
	}
	const normalized = normalizePayload(args.payload);
	const updated = await DisasterEventResponseAttachmentRepository.updateById(
		args.attachmentId,
		{ ...normalized, updatedAt: new Date() },
	);

	if (existing.fileKey !== normalized.fileKey) {
		deletePhysicalFileByKey(existing.fileKey);
	}

	return updated ?? existing;
}

export async function deleteResponseAttachment(args: {
	countryAccountsId: string;
	disasterEventId: string;
	responseId: string;
	attachmentId: string;
}) {
	const existing = await getResponseAttachmentById(args);
	if (!existing) {
		throw new Response("Attachment not found", { status: 404 });
	}

	deletePhysicalFileByKey(existing.fileKey);
	await DisasterEventResponseAttachmentRepository.deleteById(args.attachmentId);
}
