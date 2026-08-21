import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import ContentRepeaterFileValidator from "~/components/ContentRepeater/FileValidator";
import { DisasterEventAttachmentRepository } from "~/db/queries/disasterEventAttachmentRepository";
import { DisasterEventRepository } from "~/db/queries/disasterEventRepository";
import { BASE_UPLOAD_PATH } from "~/utils/paths";

const MAX_TOTAL_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export interface DisasterEventAttachmentPayload {
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

function buildDisasterEventAttachmentDir(args: {
	countryAccountsId: string;
	disasterEventId: string;
}) {
	return path.resolve(
		process.cwd(),
		BASE_UPLOAD_PATH,
		`tenant-${args.countryAccountsId}`,
		"disaster-event",
		args.disasterEventId,
	);
}

export async function uploadDisasterEventAttachmentFile(args: {
	countryAccountsId: string;
	disasterEventId: string;
	uploadedFile: File;
}): Promise<DisasterEventAttachmentPayload> {
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
	const destDir = buildDisasterEventAttachmentDir(args);
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
			storedName,
		)
		.replace(/\\/g, "/")}`;

	return {
		fileKey,
		fileName: safeOriginalName,
		fileType: args.uploadedFile.type || "application/octet-stream",
		fileSize: args.uploadedFile.size,
	};
}

function normalizePayload(payload: DisasterEventAttachmentPayload) {
	const fileKey = String(payload?.fileKey ?? "").trim();
	const fileName = String(payload?.fileName ?? "").trim();
	const fileType = String(payload?.fileType ?? "").trim();
	const fileSize = Number(payload?.fileSize ?? 0);

	if (!fileKey || !fileName) {
		throw new Response("fileKey and fileName are required", {
			status: 400,
		});
	}

	return { fileKey, fileName, fileType, fileSize };
}

async function ensureDisasterEventScope(args: {
	countryAccountsId: string;
	disasterEventId: string;
}) {
	const exists = await DisasterEventRepository.existsByIdAndCountryAccountsId(
		args.disasterEventId,
		args.countryAccountsId,
	);
	if (!exists) {
		throw new Response("Disaster event not found", { status: 404 });
	}
}

function sumAttachmentBytes(
	attachments: Array<{ fileSize: number | null | undefined }>,
) {
	return attachments.reduce(
		(total, attachment) => total + Number(attachment.fileSize ?? 0),
		0,
	);
}

async function assertTotalAttachmentLimit(args: {
	countryAccountsId: string;
	disasterEventId: string;
	incomingBytes: number;
	excludeAttachmentId?: string;
}) {
	const existing = await listDisasterEventAttachments({
		countryAccountsId: args.countryAccountsId,
		disasterEventId: args.disasterEventId,
	});

	const scopedExisting = args.excludeAttachmentId
		? existing.filter(
				(attachment) => attachment.id !== args.excludeAttachmentId,
			)
		: existing;

	const existingBytes = sumAttachmentBytes(scopedExisting);
	if (existingBytes + args.incomingBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
		throw new Response(
			"Total attachments size exceeds max allowed size (10MB) for this disaster event",
			{ status: 400 },
		);
	}
}

export async function listDisasterEventAttachments(args: {
	countryAccountsId: string;
	disasterEventId: string;
}) {
	await ensureDisasterEventScope(args);
	return DisasterEventAttachmentRepository.getByDisasterEventId(
		args.disasterEventId,
	);
}

export async function getDisasterEventAttachmentById(args: {
	countryAccountsId: string;
	disasterEventId: string;
	attachmentId: string;
}) {
	await ensureDisasterEventScope(args);
	return DisasterEventAttachmentRepository.getByIdAndDisasterEventId(
		args.attachmentId,
		args.disasterEventId,
	);
}

export async function createDisasterEventAttachment(args: {
	countryAccountsId: string;
	disasterEventId: string;
	payload: DisasterEventAttachmentPayload;
}) {
	await ensureDisasterEventScope(args);
	const normalized = normalizePayload(args.payload);
	await assertTotalAttachmentLimit({
		countryAccountsId: args.countryAccountsId,
		disasterEventId: args.disasterEventId,
		incomingBytes: normalized.fileSize,
	});
	return DisasterEventAttachmentRepository.createOne({
		disasterEventId: args.disasterEventId,
		...normalized,
	});
}

export async function updateDisasterEventAttachment(args: {
	countryAccountsId: string;
	disasterEventId: string;
	attachmentId: string;
	payload: DisasterEventAttachmentPayload;
}) {
	const existing = await getDisasterEventAttachmentById(args);
	if (!existing) {
		throw new Response("Attachment not found", { status: 404 });
	}
	const normalized = normalizePayload(args.payload);
	await assertTotalAttachmentLimit({
		countryAccountsId: args.countryAccountsId,
		disasterEventId: args.disasterEventId,
		incomingBytes: normalized.fileSize,
		excludeAttachmentId: args.attachmentId,
	});
	const updated = await DisasterEventAttachmentRepository.updateById(
		args.attachmentId,
		{
			...normalized,
			updatedAt: new Date(),
		},
	);

	if (existing.fileKey !== normalized.fileKey) {
		deletePhysicalFileByKey(existing.fileKey);
	}

	return updated ?? existing;
}

export async function deleteDisasterEventAttachment(args: {
	countryAccountsId: string;
	disasterEventId: string;
	attachmentId: string;
}) {
	const existing = await getDisasterEventAttachmentById(args);
	if (!existing) {
		throw new Response("Attachment not found", { status: 404 });
	}

	deletePhysicalFileByKey(existing.fileKey);
	await DisasterEventAttachmentRepository.deleteById(args.attachmentId);
}
