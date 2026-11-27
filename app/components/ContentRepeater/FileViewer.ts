import fs from "fs";
import path from "path";
import ContentRepeaterFileValidator from "./FileValidator";
import { BASE_UPLOAD_PATH } from "~/utils/paths";

interface UserSession {
	id?: string;
	countryAccountsId?: string;
	role?: string;
}

const SAFE_TENANT_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

function normalizePathInsideTenant(inputPath: string): string {
	const normalized = inputPath
		.replace(/\\/g, "/")
		.replace(/^\/+/, "")
		.replace(/\/+$/, "");

	if (normalized === BASE_UPLOAD_PATH) {
		return "";
	}

	if (normalized.startsWith(`${BASE_UPLOAD_PATH}/`)) {
		return normalized.slice(BASE_UPLOAD_PATH.length + 1);
	}

	return normalized;
}

function stripVerifiedTenantUploadPrefix(
	rawFileName: string,
	tenantId: string,
	tenantScopedUploadPath: string,
): string {
	const normalized = rawFileName.replace(/\\/g, "/").trim();
	const prefixSegments = [BASE_UPLOAD_PATH, `tenant-${tenantId}`];
	if (tenantScopedUploadPath) {
		prefixSegments.push(tenantScopedUploadPath);
	}
	const exactPrefix = `${prefixSegments.join("/")}/`;
	const slashPrefixed = `/${exactPrefix}`;

	if (normalized.startsWith(slashPrefixed)) {
		return normalized.slice(slashPrefixed.length);
	}
	if (normalized.startsWith(exactPrefix)) {
		return normalized.slice(exactPrefix.length);
	}
	return rawFileName;
}

function validateRelativeFileName(rawFileName: string): string | null {
	if (!rawFileName || rawFileName.includes("\0")) {
		return null;
	}

	const normalizedSlashes = rawFileName.replace(/\\/g, "/").trim();
	if (
		!normalizedSlashes ||
		normalizedSlashes.startsWith("/") ||
		/^[a-zA-Z]:/.test(normalizedSlashes)
	) {
		return null;
	}

	const segments = normalizedSlashes.split("/").filter(Boolean);
	if (segments.length === 0) {
		return null;
	}

	for (const segment of segments) {
		if (segment === "." || segment === "..") {
			return null;
		}
	}

	return segments.join(path.sep);
}

export async function handleFileRequest(
	request: Request,
	upload_path: string,
	download?: boolean,
	userSession?: UserSession,
): Promise<Response> {
	const url = new URL(request.url);
	const fileName = url.searchParams.get("name");

	if (!fileName) {
		return new Response("File name is required", { status: 400 });
	}

	if (!userSession?.countryAccountsId) {
		return new Response(null, {
			status: 302,
			headers: { Location: "/error/unauthorized?reason=no-tenant" },
		});
	}

	const tenantId = userSession.countryAccountsId;
	if (!SAFE_TENANT_ID_PATTERN.test(tenantId)) {
		return new Response("Invalid tenant identifier", { status: 400 });
	}

	const tenantScopedUploadPath = normalizePathInsideTenant(upload_path);
	const normalizedNameCandidate = stripVerifiedTenantUploadPrefix(
		fileName,
		tenantId,
		tenantScopedUploadPath,
	);
	const safeRelativeFileName = validateRelativeFileName(
		normalizedNameCandidate,
	);
	if (!safeRelativeFileName) {
		return new Response("Invalid file path", { status: 400 });
	}

	const publicRoot = process.cwd();

	const uploadsRoot = path.resolve(publicRoot, BASE_UPLOAD_PATH);
	const tenantBaseDir = path.resolve(uploadsRoot, `tenant-${tenantId}`);
	const allowedDir = path.resolve(tenantBaseDir, tenantScopedUploadPath);

	if (
		!tenantBaseDir.startsWith(`${uploadsRoot}${path.sep}`) ||
		!(
			allowedDir === tenantBaseDir ||
			allowedDir.startsWith(`${tenantBaseDir}${path.sep}`)
		)
	) {
		return new Response("Invalid upload directory", { status: 400 });
	}

	const candidatePath = path.resolve(allowedDir, safeRelativeFileName);
	if (!candidatePath.startsWith(`${allowedDir}${path.sep}`)) {
		return new Response("Invalid file path", { status: 400 });
	}

	if (!fs.existsSync(candidatePath)) {
		return new Response("File not found", { status: 404 });
	}

	try {
		const realAllowedDir = fs.realpathSync(allowedDir);
		const realCandidatePath = fs.realpathSync(candidatePath);
		if (
			!realCandidatePath.startsWith(`${realAllowedDir}${path.sep}`) ||
			!fs.statSync(realCandidatePath).isFile()
		) {
			return new Response("File not found", { status: 404 });
		}

		return serveFile(realCandidatePath, safeRelativeFileName, download);
	} catch {
		return new Response("File not found", { status: 404 });
	}
}

function serveFile(
	filePath: string,
	fileName: string,
	download?: boolean,
): Response {
	const ext = path.extname(fileName).slice(1).toLowerCase();
	if (!ContentRepeaterFileValidator.allowedExtensions.includes(ext)) {
		return new Response("Invalid file type", { status: 400 });
	}

	const mimeTypes: Record<string, string> = {
		png: "image/png",
		jpg: "image/jpeg",
		jpeg: "image/jpeg",
		gif: "image/gif",
		webp: "image/webp",
		pdf: "application/pdf",
		doc: "application/msword",
		docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		xls: "application/vnd.ms-excel",
		xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		ppt: "application/vnd.ms-powerpoint",
		pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
		mp3: "audio/mpeg",
		wav: "audio/wav",
		m4a: "audio/mp4",
		mp4: "video/mp4",
		mov: "video/quicktime",
	};

	const contentType = mimeTypes[ext] || "application/octet-stream";
	const safeDownloadName = path
		.basename(fileName)
		.replace(/["\\\r\n]/g, "_");

	try {
		const buffer = fs.readFileSync(filePath);
		const disposition = download ? "attachment" : "inline";
		return new Response(buffer, {
			status: 200,
			headers: {
				"Content-Type": contentType,
				"Content-Disposition": `${disposition}; filename="${safeDownloadName}"`,
				"Content-Length": buffer.length.toString(),
				"X-Content-Type-Options": "nosniff",
				"Cache-Control": "private, no-store",
			},
		});
	} catch (err) {
		console.error("Error serving file:", err);
		return new Response("Internal server error", { status: 500 });
	}
}
