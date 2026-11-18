/** Extension -> PrimeIcon class, mirroring legacy's getFileIconClass (HazardousEventReviewStep.tsx:280-292); returns e.g. "pi pi-file-pdf". */
export function attachmentFileIconClass(fileName: string): string {
	const segments = fileName.split(".");
	const extension =
		segments.length < 2 ? "" : segments[segments.length - 1].toLowerCase();

	if (extension === "pdf") return "pi pi-file-pdf";
	if (extension === "doc" || extension === "docx") return "pi pi-file-word";
	if (extension === "xls" || extension === "xlsx") return "pi pi-file-excel";
	if (extension === "ppt" || extension === "pptx") return "pi pi-file";
	if (["jpg", "png", "gif", "webp"].includes(extension)) return "pi pi-image";
	if (["mp3", "wav", "m4a"].includes(extension)) return "pi pi-volume-up";
	if (extension === "mp4" || extension === "mov") return "pi pi-video";

	return "pi pi-file";
}
