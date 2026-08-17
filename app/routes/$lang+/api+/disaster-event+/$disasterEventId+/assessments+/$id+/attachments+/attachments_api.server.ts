import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import ContentRepeaterFileValidator from "~/components/ContentRepeater/FileValidator";
import { DisasterEventAssessmentAttachmentRepository } from "~/db/queries/disasterEventAssessmentAttachmentRepository";
import { getAssessmentForTenantById } from "~/routes/$lang+/api+/disaster-event+/assessments+/assessment_api.server";
import { BASE_UPLOAD_PATH } from "~/utils/paths";

export interface AssessmentAttachmentPayload {
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
		// Best-effort cleanup for attachment replacement/deletion.
	}
}

function buildAssessmentAttachmentDir(args: {
	countryAccountsId: string;
	disasterEventId: string;
	assessmentId: string;
}) {
	return path.resolve(
		process.cwd(),
		BASE_UPLOAD_PATH,
		`tenant-${args.countryAccountsId}`,
		"disaster-event",
		args.disasterEventId,
		"assessments",
		args.assessmentId,
	);
}

export async function uploadAssessmentAttachmentFile(args: {
	countryAccountsId: string;
	disasterEventId: string;
	assessmentId: string;
	uploadedFile: File;
	title?: string | null;
}): Promise<AssessmentAttachmentPayload> {
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
	const destDir = buildAssessmentAttachmentDir(args);
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
			"assessments",
			args.assessmentId,
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

function normalizePayload(payload: AssessmentAttachmentPayload) {
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

	return {
		title,
		fileKey,
		fileName,
		fileType,
		fileSize,
	};
}

async function ensureAssessmentScope(args: {
	countryAccountsId: string;
	disasterEventId: string;
	assessmentId: string;
}) {
	const assessment = await getAssessmentForTenantById({
		countryAccountsId: args.countryAccountsId,
		id: args.assessmentId,
	});
	if (!assessment || assessment.disasterEventId !== args.disasterEventId) {
		throw new Response("Assessment not found", { status: 404 });
	}
	return assessment;
}

export async function listAssessmentAttachments(args: {
	countryAccountsId: string;
	disasterEventId: string;
	assessmentId: string;
}) {
	await ensureAssessmentScope(args);
	return DisasterEventAssessmentAttachmentRepository.listByDisasterEventAssessmentId(
		args.assessmentId,
	);
}

export async function getAssessmentAttachmentById(args: {
	countryAccountsId: string;
	disasterEventId: string;
	assessmentId: string;
	attachmentId: string;
}) {
	await ensureAssessmentScope(args);
	const attachment =
		await DisasterEventAssessmentAttachmentRepository.getByIdAndDisasterEventAssessmentId(
			args.attachmentId,
			args.assessmentId,
		);
	return attachment ?? null;
}

export async function createAssessmentAttachment(args: {
	countryAccountsId: string;
	disasterEventId: string;
	assessmentId: string;
	payload: AssessmentAttachmentPayload;
}) {
	await ensureAssessmentScope(args);
	const normalized = normalizePayload(args.payload);
	return DisasterEventAssessmentAttachmentRepository.createOne({
		disasterEventAssessmentId: args.assessmentId,
		...normalized,
	});
}

export async function updateAssessmentAttachment(args: {
	countryAccountsId: string;
	disasterEventId: string;
	assessmentId: string;
	attachmentId: string;
	payload: AssessmentAttachmentPayload;
}) {
	const existing = await getAssessmentAttachmentById(args);
	if (!existing) {
		throw new Response("Attachment not found", { status: 404 });
	}
	const normalized = normalizePayload(args.payload);

	const updated = await DisasterEventAssessmentAttachmentRepository.updateById(
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

export async function deleteAssessmentAttachment(args: {
	countryAccountsId: string;
	disasterEventId: string;
	assessmentId: string;
	attachmentId: string;
}) {
	const existing = await getAssessmentAttachmentById(args);
	if (!existing) {
		throw new Response("Attachment not found", { status: 404 });
	}

	deletePhysicalFileByKey(existing.fileKey);
	await DisasterEventAssessmentAttachmentRepository.deleteById(
		args.attachmentId,
	);
}
