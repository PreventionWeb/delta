/** Byte count -> binary-unit string, mirroring legacy's formatFileSize (HazardousEventReviewStep.tsx:261-278). */
export function formatAttachmentFileSize(fileSize: number): string {
	if (!Number.isFinite(fileSize) || fileSize <= 0) {
		return "0 B";
	}

	const units = ["B", "KB", "MB", "GB"];
	let unitIndex = 0;
	let value = fileSize;

	while (value >= 1024 && unitIndex < units.length - 1) {
		value /= 1024;
		unitIndex += 1;
	}

	const fixed =
		value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1);
	return `${fixed} ${units[unitIndex]}`;
}
