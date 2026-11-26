import { describe, expect, it } from "vitest";
import { parseCsvUpload } from "./parseCsvUpload.server";

const encoder = new TextEncoder();

function bytesOf(...parts: (string | number[])[]): Uint8Array<ArrayBuffer> {
	const chunks = parts.map((part) =>
		typeof part === "string" ? encoder.encode(part) : Uint8Array.from(part),
	);
	const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
	let offset = 0;
	for (const chunk of chunks) {
		out.set(chunk, offset);
		offset += chunk.length;
	}
	return out;
}

function uploadRequest(
	file: Uint8Array<ArrayBuffer> | string | null,
	importType: string | null = "create",
): Request {
	const form = new FormData();
	if (file !== null) {
		const bytes = typeof file === "string" ? encoder.encode(file) : file;
		form.append("file", new File([bytes], "x.csv", { type: "text/csv" }));
	}
	if (importType !== null) form.append("import_type", importType);
	return new Request("http://localhost/he-preview/csv-import", {
		method: "POST",
		body: form,
	});
}

describe("parseCsvUpload: size limit", () => {
	it("rejects a 10,500,000-byte file with file_too_large", async () => {
		const result = await parseCsvUpload(
			uploadRequest(new Uint8Array(10_500_000).fill(0x61)),
		);
		expect(result).toMatchObject({
			ok: false,
			fileError: { code: "file_too_large" },
		});
	});

	it("rejects a file one byte over 10,000,000 with file_too_large", async () => {
		const result = await parseCsvUpload(
			uploadRequest(new Uint8Array(10_000_001).fill(0x61)),
		);
		expect(result).toMatchObject({
			ok: false,
			fileError: { code: "file_too_large" },
		});
	});

	it("parses a file just under the limit", async () => {
		const result = await parseCsvUpload(
			uploadRequest(`h\r\n${"x".repeat(9_999_000)}\r\n`),
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.rows).toHaveLength(1);
	});
});

describe("parseCsvUpload: form fields", () => {
	it("reports missing_file when no file field is posted", async () => {
		const result = await parseCsvUpload(uploadRequest(null));
		expect(result).toMatchObject({
			ok: false,
			fileError: { code: "missing_file" },
		});
	});

	it.each(["create", "update", "upsert", "bogus"])(
		"echoes import_type %j as mode",
		async (mode) => {
			const result = await parseCsvUpload(uploadRequest("a\n1\n", mode));
			expect(result.mode).toBe(mode);
		},
	);
});

describe("parseCsvUpload: encoding", () => {
	it("rejects a Latin-1 0xE9 byte with invalid_encoding", async () => {
		const result = await parseCsvUpload(
			uploadRequest(bytesOf("recordOriginator\ncaf", [0xe9], "\n")),
		);
		expect(result).toMatchObject({
			ok: false,
			fileError: { code: "invalid_encoding" },
		});
	});

	it("strips a UTF-8 BOM so the first header cell is exact", async () => {
		const result = await parseCsvUpload(
			uploadRequest(
				bytesOf([0xef, 0xbb, 0xbf], "startDate,endDate\n2025,2025\n"),
			),
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.header[0]).toBe("startDate");
		expect(result.header).toEqual(["startDate", "endDate"]);
	});

	it("decodes non-ASCII UTF-8 text", async () => {
		const result = await parseCsvUpload(
			uploadRequest("recordOriginator\nMétéo-France\n"),
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.rows).toEqual([["Météo-France"]]);
	});
});

describe("parseCsvUpload: RFC 4180 parsing", () => {
	it("reports a ragged row on line 2 as malformed_csv with line 2", async () => {
		const result = await parseCsvUpload(uploadRequest("a,b,c\n1,2\n"));
		expect(result).toMatchObject({
			ok: false,
			fileError: { code: "malformed_csv", line: 2 },
		});
	});

	it("reports a ragged row after a multi-line cell with its physical line", async () => {
		const result = await parseCsvUpload(uploadRequest('a,b\n"x\ny",z\n1\n'));
		expect(result).toMatchObject({
			ok: false,
			fileError: { code: "malformed_csv", line: 4 },
		});
	});

	it("reports an unterminated quote as malformed_csv with a line", async () => {
		const result = await parseCsvUpload(uploadRequest('a,b\n"1,2\n'));
		expect(result).toMatchObject({
			ok: false,
			fileError: { code: "malformed_csv" },
		});
		if (result.ok) return;
		expect(typeof result.fileError.line).toBe("number");
	});

	it("parses CRLF and LF files to the same records", async () => {
		const lf = await parseCsvUpload(uploadRequest("a,b\n1,2\n3,4\n"));
		const crlf = await parseCsvUpload(uploadRequest("a,b\r\n1,2\r\n3,4\r\n"));
		expect(lf.ok && crlf.ok).toBe(true);
		if (!lf.ok || !crlf.ok) return;
		expect(crlf.header).toEqual(["a", "b"]);
		expect(crlf.rows).toEqual([
			["1", "2"],
			["3", "4"],
		]);
		expect(lf.header).toEqual(crlf.header);
		expect(lf.rows).toEqual(crlf.rows);
	});

	it("parses a quoted cell spanning lines as one cell", async () => {
		const result = await parseCsvUpload(
			uploadRequest('a,b\r\n"x, ""y""\r\nz",w\r\n'),
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.rows).toEqual([['x, "y"\r\nz', "w"]]);
	});

	it("trims every cell, header included", async () => {
		const result = await parseCsvUpload(uploadRequest(" a , b \n 1 ,\t2 \n"));
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.header).toEqual(["a", "b"]);
		expect(result.rows).toEqual([["1", "2"]]);
	});

	it.each(["a,b\n", "a,b", "a,b\r\n"])(
		"reports a header-only file %j as no_data",
		async (text) => {
			const result = await parseCsvUpload(uploadRequest(text));
			expect(result).toMatchObject({
				ok: false,
				fileError: { code: "no_data" },
			});
		},
	);

	it("reports firstDataLine 2 for a normal file", async () => {
		const result = await parseCsvUpload(uploadRequest("a,b\n1,2\n"));
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.firstDataLine).toBe(2);
	});

	it("does not use the file name or Content-Type", async () => {
		const form = new FormData();
		form.append(
			"file",
			new File([encoder.encode("a\n1\n")], "evil.exe", {
				type: "application/octet-stream",
			}),
		);
		form.append("import_type", "create");
		const result = await parseCsvUpload(
			new Request("http://localhost/x", { method: "POST", body: form }),
		);
		expect(result.ok).toBe(true);
	});
});

describe("parseCsvUpload: per-row line numbers (review m5)", () => {
	it("gives each row its physical start line, past blank lines and multi-line cells", async () => {
		const parsed = await parseCsvUpload(
			uploadRequest('h1,h2\n\n\na,b\n"x\ny",z\nc,d\n'),
		);
		if (!parsed.ok) throw new Error("expected a parsed upload");
		expect(parsed.rows).toEqual([
			["a", "b"],
			["x\ny", "z"],
			["c", "d"],
		]);
		expect(parsed.lineNumbers).toEqual([4, 5, 7]);
	});
});

/** A multipart body built by the platform, re-sent with caller-chosen headers. */
async function rawMultipart(
	form: FormData,
	headers: (contentType: string, length: number) => Record<string, string>,
): Promise<Request> {
	const encoded = new Response(form);
	const contentType = encoded.headers.get("Content-Type") ?? "";
	const body = new Uint8Array(await encoded.arrayBuffer());
	return new Request("http://localhost/he-preview/csv-import", {
		method: "POST",
		headers: headers(contentType, body.length),
		body,
	});
}

function csvForm(file: string | Uint8Array<ArrayBuffer>): FormData {
	const form = new FormData();
	const bytes = typeof file === "string" ? encoder.encode(file) : file;
	form.append("file", new File([bytes], "x.csv", { type: "text/csv" }));
	form.append("import_type", "create");
	return form;
}

describe("parseCsvUpload: request size is bounded (gate 10, finding 1)", () => {
	it("rejects a mixed-case Multipart/form-data header instead of falling back to native parsing", async () => {
		const request = await rawMultipart(csvForm("h\r\nv\r\n"), (type) => ({
			"Content-Type": type.replace("multipart/", "Multipart/"),
		}));

		await expect(parseCsvUpload(request)).resolves.toMatchObject({
			ok: false,
			fileError: { code: "missing_file" },
		});
	});

	it("rejects an oversized mixed-case body without parsing the file", async () => {
		const request = await rawMultipart(
			csvForm(new Uint8Array(10_500_000).fill(0x61)),
			(type) => ({ "Content-Type": type.replace("multipart/", "Multipart/") }),
		);

		await expect(parseCsvUpload(request)).resolves.toMatchObject({
			ok: false,
			fileError: { code: "missing_file" },
		});
	});

	it("rejects a declared Content-Length over the limit before reading the body", async () => {
		const request = await rawMultipart(csvForm("h\r\nv\r\n"), (type) => ({
			"Content-Type": type,
			"Content-Length": String(20_000_000),
		}));

		await expect(parseCsvUpload(request)).resolves.toMatchObject({
			ok: false,
			fileError: { code: "file_too_large" },
		});
	});

	it("rejects a body whose extra text fields push it over the limit", async () => {
		const form = csvForm("h\r\nv\r\n");
		for (let i = 0; i < 3; i += 1) {
			form.append(`extra${i}`, "x".repeat(4_000_000));
		}
		const request = await rawMultipart(form, (type) => ({
			"Content-Type": type,
		}));

		await expect(parseCsvUpload(request)).resolves.toMatchObject({
			ok: false,
			fileError: { code: "file_too_large" },
		});
	});
});

describe("parseCsvUpload: multipart edge cases (gate 10 re-review)", () => {
	function rawRequest(body: BodyInit | null): Request {
		return new Request("http://localhost/he-preview/csv-import", {
			method: "POST",
			headers: { "Content-Type": "multipart/form-data; boundary=abc" },
			body,
		});
	}

	it("reports invalid UTF-8 in a part header as missing_file, not a server error (m3)", async () => {
		const body = bytesOf(
			'--abc\r\nContent-Disposition: form-data; name="file"; filename="caf',
			[0xe9],
			'.csv"\r\n\r\nh\r\nv\r\n--abc--\r\n',
		);

		await expect(parseCsvUpload(rawRequest(body))).resolves.toMatchObject({
			ok: false,
			fileError: { code: "missing_file" },
		});
	});

	it("reports invalid UTF-8 in the import_type value as missing_file (m3)", async () => {
		const body = bytesOf(
			'--abc\r\nContent-Disposition: form-data; name="import_type"\r\n\r\ncr',
			[0xe9],
			"ate\r\n--abc--\r\n",
		);

		await expect(parseCsvUpload(rawRequest(body))).resolves.toMatchObject({
			ok: false,
			fileError: { code: "missing_file" },
		});
	});

	it("reports a multipart request with no body as missing_file (m6c)", async () => {
		await expect(parseCsvUpload(rawRequest(null))).resolves.toMatchObject({
			ok: false,
			fileError: { code: "missing_file" },
		});
	});

	it("accepts a file of exactly 10,000,000 bytes (m6b)", async () => {
		const header = "h\r\n";
		const result = await parseCsvUpload(
			uploadRequest(
				`${header}${"x".repeat(10_000_000 - header.length - 2)}\r\n`,
			),
		);

		expect(result.ok).toBe(true);
	});
});

describe("parseCsvUpload: malformed multipart (review m4)", () => {
	it("reports a body with a broken multipart boundary as a file error, not a throw", async () => {
		const request = new Request("http://localhost/he-preview/csv-import", {
			method: "POST",
			headers: { "Content-Type": "multipart/form-data; boundary=abc" },
			body: '--abc\r\nContent-Disposition: form-data; name="file"; filename="x.csv"\r\n\r\nh\r\n--wrong--',
		});
		const parsed = await parseCsvUpload(request);
		expect(parsed).toMatchObject({
			ok: false,
			fileError: { code: "missing_file" },
		});
	});

	it.each([
		["text/csv", "h,i\na,b"],
		["application/json", "{}"],
	])(
		"reports a %s body as missing_file instead of throwing (gate 8 N2)",
		async (contentType, body) => {
			const request = new Request("http://localhost/he-preview/csv-import", {
				method: "POST",
				headers: { "Content-Type": contentType },
				body,
			});
			await expect(parseCsvUpload(request)).resolves.toMatchObject({
				ok: false,
				fileError: { code: "missing_file" },
			});
		},
	);
});
