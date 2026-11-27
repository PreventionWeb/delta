import fs from "fs";
import path from "path";
import ContentRepeaterFileValidator from "./FileValidator";
import { BASE_UPLOAD_PATH } from "~/utils/paths";

interface FileInfo {
	name: string;
	content_type: string;
	view?: string;
	tenantPath?: string;
}

interface Item {
	file?: FileInfo;
}

const debug = false;
const SAFE_TENANT_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

function resolveTenantRoot(
	publicPath: string,
	countryAccountsId?: string,
): string | null {
	const trimmed = String(countryAccountsId || "").trim();
	if (!trimmed || !SAFE_TENANT_ID_PATTERN.test(trimmed)) {
		return null;
	}
	const uploadsRoot = path.resolve(publicPath, BASE_UPLOAD_PATH);
	const tenantRoot = path.resolve(uploadsRoot, `tenant-${trimmed}`);
	if (!tenantRoot.startsWith(`${uploadsRoot}${path.sep}`)) {
		return null;
	}
	return tenantRoot;
}

function normalizeTenantRelativePath(inputPath: string): string | null {
	if (!inputPath || inputPath.includes("\0")) {
		return null;
	}
	const normalized = inputPath
		.replace(/\\/g, "/")
		.replace(/^\/+/, "")
		.replace(/\/+$/, "");

	let relative = normalized;
	if (normalized === BASE_UPLOAD_PATH) {
		relative = "";
	} else if (normalized.startsWith(`${BASE_UPLOAD_PATH}/`)) {
		relative = normalized.slice(BASE_UPLOAD_PATH.length + 1);
	}

	const segments = relative.split("/").filter(Boolean);
	for (const segment of segments) {
		if (segment === "." || segment === "..") {
			return null;
		}
	}

	return segments.join("/");
}

function isContainedRegularFile(filePath: string, rootDir: string): boolean {
	if (!filePath.startsWith(`${rootDir}${path.sep}`)) {
		return false;
	}
	if (!fs.existsSync(filePath)) {
		return false;
	}
	try {
		const stat = fs.lstatSync(filePath);
		if (!stat.isFile() || stat.isSymbolicLink()) {
			return false;
		}
		const realRoot = fs.realpathSync(rootDir);
		const realFile = fs.realpathSync(filePath);
		return realFile.startsWith(`${realRoot}${path.sep}`);
	} catch {
		return false;
	}
}

class ContentRepeaterUploadFile {
	private static buildDeleteCandidates(
		item: any,
		publicPath: string,
		countryAccountsId?: string,
	): string[] {
		if (!item?.file?.name || typeof item.file.name !== "string") {
			return [];
		}

		const tenantRoot = resolveTenantRoot(publicPath, countryAccountsId);
		if (!tenantRoot) {
			return [];
		}

		const rawName: string = item.file.name.trim();
		if (!rawName || rawName.includes("\0")) {
			return [];
		}

		const normalized = rawName.replace(/\\/g, "/").replace(/^\/+/, "");
		const segments = normalized.split("/").filter(Boolean);
		if (
			segments.length === 0 ||
			segments.some((segment: string) => segment === "." || segment === "..")
		) {
			return [];
		}

		const tenantId = String(countryAccountsId).trim();
		const tenantKeyPrefix = `${BASE_UPLOAD_PATH}/tenant-${tenantId}/`;
		const candidates = new Set<string>();

		if (normalized.startsWith(tenantKeyPrefix)) {
			const fullPath = path.resolve(publicPath, normalized);
			if (fullPath.startsWith(`${tenantRoot}${path.sep}`)) {
				candidates.add(fullPath);
			}
		} else {
			const withinTenantPath = path.resolve(tenantRoot, normalized);
			if (withinTenantPath.startsWith(`${tenantRoot}${path.sep}`)) {
				candidates.add(withinTenantPath);
			}
		}

		return Array.from(candidates);
	}

	static deleteEmptyParentDirectoriesForFiles(
		itemsData: any[],
		publicPath: string = path.join(process.cwd()),
		countryAccountsId?: string,
	): void {
		const tenantRoot = resolveTenantRoot(publicPath, countryAccountsId);
		if (!tenantRoot) {
			return;
		}

		const processedDirectories = new Set<string>();

		for (const item of itemsData) {
			const candidateDirectories = this.buildDeleteCandidates(
				item,
				publicPath,
				countryAccountsId,
			).map((filePath) => path.dirname(filePath));

			for (const candidateDirectory of candidateDirectories) {
				let currentDirectory = candidateDirectory;
				while (true) {
					const normalizedDirectory = path.resolve(currentDirectory);
					if (processedDirectories.has(normalizedDirectory)) {
						break;
					}

					processedDirectories.add(normalizedDirectory);

					if (!normalizedDirectory.startsWith(`${tenantRoot}${path.sep}`)) {
						break;
					}

					if (!fs.existsSync(normalizedDirectory)) {
						break;
					}

					const relativeToTenant = path
						.relative(tenantRoot, normalizedDirectory)
						.replace(/\\/g, "/");
					if (
						relativeToTenant !== "disaster-event" &&
						!relativeToTenant.startsWith("disaster-event/")
					) {
						break;
					}

					try {
						const stat = fs.lstatSync(normalizedDirectory);
						if (!stat.isDirectory() || stat.isSymbolicLink()) {
							break;
						}
						const realTenantRoot = fs.realpathSync(tenantRoot);
						const realDir = fs.realpathSync(normalizedDirectory);
						if (!realDir.startsWith(`${realTenantRoot}${path.sep}`)) {
							break;
						}
						if (fs.readdirSync(realDir).length > 0) {
							break;
						}

						fs.rmdirSync(realDir);
						currentDirectory = path.dirname(normalizedDirectory);
					} catch {
						break;
					}
				}
			}
		}
	}

	/**
	 * Delete files from disk strictly within the active tenant upload directory.
	 */
	static delete(
		itemsData: any[],
		publicPath: string = path.join(process.cwd()),
		countryAccountsId?: string,
	): Item[] {
		const items: Item[] = Array.isArray(itemsData) ? itemsData : [];
		const tenantRoot = resolveTenantRoot(publicPath, countryAccountsId);
		if (!tenantRoot) {
			return items;
		}

		items.forEach((item) => {
			if (!item?.file?.name) return;

			for (const filePath of this.buildDeleteCandidates(
				item,
				publicPath,
				countryAccountsId,
			)) {
				if (isContainedRegularFile(filePath, tenantRoot)) {
					try {
						fs.unlinkSync(fs.realpathSync(filePath));
						if (debug) console.log(`Deleted: ${filePath}`);
						break;
					} catch (err) {
						console.error(`Failed to delete: ${filePath}`, err);
					}
				}
			}
		});

		return items;
	}

	/**
	 * Save (move) files from tenant temp directory -> tenant destination directory.
	 */
	static save(
		itemsData: any[],
		tempPath: string,
		destinationPath: string,
		publicPath: string = path.join(process.cwd()),
		countryAccountsId?: string,
	): Item[] {
		const items: Item[] = Array.isArray(itemsData) ? itemsData : [];
		const tenantRoot = resolveTenantRoot(publicPath, countryAccountsId);
		if (!tenantRoot) {
			throw new Error("Valid tenant identifier is required for file uploads.");
		}

		const tenantId = String(countryAccountsId).trim();
		const cleanTempPath = normalizeTenantRelativePath(tempPath);
		const cleanDestPath = normalizeTenantRelativePath(destinationPath);
		if (!cleanTempPath || !cleanDestPath) {
			throw new Error("Invalid upload directory path.");
		}

		const tempDir = path.resolve(tenantRoot, cleanTempPath);
		const finalDestDir = path.resolve(tenantRoot, cleanDestPath);
		if (
			!tempDir.startsWith(`${tenantRoot}${path.sep}`) ||
			!finalDestDir.startsWith(`${tenantRoot}${path.sep}`)
		) {
			throw new Error("Upload directory escapes tenant boundary.");
		}

		fs.mkdirSync(finalDestDir, { recursive: true });

		const usedFiles = new Set<string>();

		const updatedItems = items.map((item) => {
			if (!item?.file?.name || typeof item.file.name !== "string") return item;

			const normalizedRaw = item.file.name.replace(/\\/g, "/");
			if (normalizedRaw.includes("\0")) {
				return item;
			}

			const originalName = path.basename(normalizedRaw);
			if (!originalName || originalName === "." || originalName === "..") {
				return item;
			}

			const cleanedName = originalName
				.replace(/^\d+_/, "")
				.replace(/^[0-9a-fA-F-]{36}__/, "");
			if (!cleanedName || cleanedName === "." || cleanedName === "..") {
				return item;
			}

			const finalFilePath = path.resolve(finalDestDir, cleanedName);
			if (!finalFilePath.startsWith(`${finalDestDir}${path.sep}`)) {
				return item;
			}
			usedFiles.add(cleanedName);

			if (!ContentRepeaterFileValidator.isValidExtension(cleanedName)) {
				console.warn(`Skipped invalid file: ${cleanedName}`);
				return item;
			}

			const tempFile = path.resolve(tempDir, originalName);
			let moved = false;
			if (isContainedRegularFile(tempFile, tempDir)) {
				try {
					fs.renameSync(fs.realpathSync(tempFile), finalFilePath);
					if (debug) console.log(`Moved: ${tempFile} → ${finalFilePath}`);
					moved = true;
				} catch (err) {
					console.error(`Move failed: ${tempFile}`, err);
				}
			}

			if (!moved) {
				console.warn(`Temp file not found for: ${originalName}`);
			}

			const relativeToPublic = path.relative(publicPath, finalFilePath);
			item.file.name = `/${relativeToPublic.replace(/\\/g, "/")}`;
			item.file.tenantPath = path.join(BASE_UPLOAD_PATH, `tenant-${tenantId}`);

			delete item.file.view;

			return item;
		});

		// Cleanup: remove files in destination not in current items
		try {
			const existingFiles = fs.readdirSync(finalDestDir);
			for (const file of existingFiles) {
				if (!usedFiles.has(file)) {
					const filePath = path.resolve(finalDestDir, file);
					if (isContainedRegularFile(filePath, finalDestDir)) {
						fs.unlinkSync(fs.realpathSync(filePath));
						if (debug) console.log(`Cleaned up old file: ${filePath}`);
					}
				}
			}
		} catch {
			// Directory might not exist or be empty
		}

		return updatedItems;
	}
}

export { ContentRepeaterUploadFile };
