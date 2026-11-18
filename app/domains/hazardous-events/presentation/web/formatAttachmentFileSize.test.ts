import { describe, expect, it } from "vitest";
import { formatAttachmentFileSize } from "./formatAttachmentFileSize";

describe("formatAttachmentFileSize", () => {
	it("renders a byte count under 1024 as whole bytes", () => {
		expect(formatAttachmentFileSize(512)).toBe("512 B");
	});

	it("renders a KB-range value under 10 units with one decimal place", () => {
		expect(formatAttachmentFileSize(1536)).toBe("1.5 KB");
	});

	it("renders a KB-range value at 10 units or above as a whole number", () => {
		expect(formatAttachmentFileSize(10240)).toBe("10 KB");
	});

	it("renders an MB-range value with one decimal place under 10 units", () => {
		expect(formatAttachmentFileSize(1024 * 1024 * 2.5)).toBe("2.5 MB");
	});

	it("renders a GB-range value, capping unit progression at GB", () => {
		expect(formatAttachmentFileSize(1024 * 1024 * 1024 * 2)).toBe("2.0 GB");
	});

	it("renders '0 B' for a non-positive byte count", () => {
		expect(formatAttachmentFileSize(0)).toBe("0 B");
		expect(formatAttachmentFileSize(-5)).toBe("0 B");
	});
});
