import { describe, expect, it } from "vitest";
import { attachmentFileIconClass } from "./attachmentFileIconClass";

describe("attachmentFileIconClass", () => {
	it("returns the pdf icon class for a .pdf file", () => {
		expect(attachmentFileIconClass("report.pdf")).toBe("pi pi-file-pdf");
	});

	it.each(["doc", "docx"])(
		"returns the word icon class for a .%s file",
		(ext) => {
			expect(attachmentFileIconClass(`report.${ext}`)).toBe("pi pi-file-word");
		},
	);

	it.each(["xls", "xlsx"])(
		"returns the excel icon class for a .%s file",
		(ext) => {
			expect(attachmentFileIconClass(`report.${ext}`)).toBe("pi pi-file-excel");
		},
	);

	it.each(["ppt", "pptx"])(
		"returns the default file icon class for a .%s file (same as legacy)",
		(ext) => {
			expect(attachmentFileIconClass(`report.${ext}`)).toBe("pi pi-file");
		},
	);

	it.each(["jpg", "png", "gif", "webp"])(
		"returns the image icon class for a .%s file",
		(ext) => {
			expect(attachmentFileIconClass(`photo.${ext}`)).toBe("pi pi-image");
		},
	);

	it.each(["mp3", "wav", "m4a"])(
		"returns the audio icon class for a .%s file",
		(ext) => {
			expect(attachmentFileIconClass(`clip.${ext}`)).toBe("pi pi-volume-up");
		},
	);

	it.each(["mp4", "mov"])(
		"returns the video icon class for a .%s file",
		(ext) => {
			expect(attachmentFileIconClass(`clip.${ext}`)).toBe("pi pi-video");
		},
	);

	it("returns the default file icon class for an unrecognised extension", () => {
		expect(attachmentFileIconClass("archive.zip")).toBe("pi pi-file");
	});

	it("returns the default file icon class for a file with no extension", () => {
		expect(attachmentFileIconClass("README")).toBe("pi pi-file");
	});

	it("is case-insensitive about the extension", () => {
		expect(attachmentFileIconClass("REPORT.PDF")).toBe("pi pi-file-pdf");
	});
});
