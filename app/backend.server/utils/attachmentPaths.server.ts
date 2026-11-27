import fs from "fs";
import path from "path";
import { BASE_UPLOAD_PATH } from "~/utils/paths";

const SAFE_TENANT_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

/**
 * Resolves a stored attachment fileKey to an absolute path strictly contained
 * inside the caller's tenant upload directory (`uploads/tenant-<countryAccountsId>/`).
 * Returns null if the key is empty, malformed, escapes the tenant directory,
 * or references another tenant's files.
 */
export function resolveTenantUploadPath(
	fileKey: string,
	countryAccountsId: string,
): string | null {
	const trimmedKey = String(fileKey || "").trim();
	const trimmedTenant = String(countryAccountsId || "").trim();

	if (
		!trimmedKey ||
		!trimmedTenant ||
		!SAFE_TENANT_ID_PATTERN.test(trimmedTenant) ||
		trimmedKey.includes("\0")
	) {
		return null;
	}

	const normalized = trimmedKey.replace(/\\/g, "/").replace(/^\/+/, "");
	if (!normalized) {
		return null;
	}

	const uploadsRoot = path.resolve(process.cwd(), BASE_UPLOAD_PATH);
	const tenantRoot = path.resolve(uploadsRoot, `tenant-${trimmedTenant}`);
	if (!tenantRoot.startsWith(`${uploadsRoot}${path.sep}`)) {
		return null;
	}

	const absolute = path.resolve(process.cwd(), normalized);
	if (!absolute.startsWith(`${tenantRoot}${path.sep}`)) {
		return null;
	}

	return absolute;
}

/**
 * Validates that a client-supplied fileKey belongs to the caller's tenant upload directory.
 * Throws a 400 HTTP Response otherwise.
 */
export function assertTenantFileKey(
	fileKey: string,
	countryAccountsId: string,
): string {
	const resolved = resolveTenantUploadPath(fileKey, countryAccountsId);
	if (!resolved) {
		throw new Response("Invalid fileKey for tenant", { status: 400 });
	}
	return String(fileKey).trim();
}

/**
 * Deletes a physical attachment file only if it resolves strictly within the caller's
 * tenant upload directory and is a regular file (never following symlinks outside).
 */
export function deleteTenantPhysicalFileByKey(
	fileKey: string,
	countryAccountsId: string,
): void {
	const absolutePath = resolveTenantUploadPath(fileKey, countryAccountsId);
	if (!absolutePath || !fs.existsSync(absolutePath)) {
		return;
	}

	try {
		const stat = fs.lstatSync(absolutePath);
		if (!stat.isFile() || stat.isSymbolicLink()) {
			return;
		}
		const uploadsRoot = path.resolve(process.cwd(), BASE_UPLOAD_PATH);
		const tenantRoot = path.resolve(
			uploadsRoot,
			`tenant-${countryAccountsId.trim()}`,
		);
		const realTenantRoot = fs.realpathSync(tenantRoot);
		const realTarget = fs.realpathSync(absolutePath);
		if (!realTarget.startsWith(`${realTenantRoot}${path.sep}`)) {
			return;
		}
		fs.unlinkSync(realTarget);
	} catch {
		// Best-effort cleanup.
	}
}
