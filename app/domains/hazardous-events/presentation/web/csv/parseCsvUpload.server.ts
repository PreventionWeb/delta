import {
	FormDataParseError,
	MaxFileSizeExceededError,
	MultipartParseError,
	parseFormData,
} from "@mjackson/form-data-parser";
import { CsvError, parse, type Info } from "csv-parse/sync";
import type { HazardousEventCsvFileError } from "~/domains/hazardous-events/application/dto/HazardousEventCsvImportResult";

/** OD-15 single-file limit, the same as legacy (`csv_import.ts:76`). */
export const MAX_CSV_UPLOAD_BYTES = 10_000_000;

export type ParsedCsvUpload =
	| {
			ok: true;
			/** Raw `import_type` value; the use case validates it (`invalid_mode`). */
			mode: string;
			header: string[];
			rows: string[][];
			/** Physical line of `rows[0]` (D1). */
			firstDataLine: number;
			/** Physical start line of each row, exact past blank lines and multi-line cells. */
			lineNumbers: number[];
	  }
	| { ok: false; mode: string; fileError: HazardousEventCsvFileError };

interface ParsedRecord {
	record: string[];
	info: Info;
	raw: string;
}

/** `info.lines` is where a record ends; subtract the line breaks inside it. */
function startLine({ info, raw }: ParsedRecord): number {
	const body = raw.replace(/^[\r\n]+/, "").replace(/(\r\n|\r|\n)$/, "");
	return info.lines - (body.match(/\r\n|\r|\n/g)?.length ?? 0);
}

function failure(
	mode: string,
	fileError: HazardousEventCsvFileError,
): ParsedCsvUpload {
	return { ok: false, mode, fileError };
}

/** Room for multipart boundaries, part headers and the `import_type` field. */
const MAX_REQUEST_BYTES = MAX_CSV_UPLOAD_BYTES + 64 * 1024;

class RequestTooLargeError extends Error {}

/** Errors the stream once more than `MAX_REQUEST_BYTES` arrive, whatever Content-Length said. */
function limitBody(request: Request): Request {
	let received = 0;
	const limiter = new TransformStream<Uint8Array, Uint8Array>({
		transform(chunk, controller) {
			received += chunk.byteLength;
			if (received > MAX_REQUEST_BYTES) {
				controller.error(new RequestTooLargeError());
				return;
			}
			controller.enqueue(chunk);
		},
	});
	const init: RequestInit & { duplex: "half" } = {
		method: request.method,
		headers: request.headers,
		body: request.body?.pipeThrough(limiter) ?? null,
		duplex: "half",
	};
	return new Request(request.url, init);
}

async function readForm(
	request: Request,
): Promise<FormData | HazardousEventCsvFileError> {
	// Case-sensitive like the parser's own check, so it never falls back to native formData().
	const contentType = request.headers.get("Content-Type") ?? "";
	if (!contentType.startsWith("multipart/form-data")) {
		return { code: "missing_file" };
	}
	const declaredLength = Number(request.headers.get("Content-Length"));
	if (declaredLength > MAX_REQUEST_BYTES) {
		return { code: "file_too_large" };
	}
	try {
		return await parseFormData(limitBody(request), {
			maxFiles: 1,
			maxFileSize: MAX_CSV_UPLOAD_BYTES,
		});
	} catch (err) {
		if (
			err instanceof MaxFileSizeExceededError ||
			err instanceof RequestTooLargeError
		) {
			return { code: "file_too_large" };
		}
		if (
			err instanceof FormDataParseError ||
			err instanceof MultipartParseError ||
			isInvalidUtf8Error(err)
		) {
			return { code: "missing_file" };
		}
		throw err;
	}
}

/** The parser decodes part headers and text fields with a fatal UTF-8 decoder. */
function isInvalidUtf8Error(err: unknown): boolean {
	return (
		err instanceof TypeError &&
		"code" in err &&
		err.code === "ERR_ENCODING_INVALID_ENCODED_DATA"
	);
}

function decodeUtf8(bytes: ArrayBuffer): string | null {
	try {
		// fatal: invalid UTF-8 is rejected, not silently replaced with U+FFFD (legacy I15).
		return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
	} catch (err) {
		if (err instanceof TypeError) return null;
		throw err;
	}
}

function parseRecords(
	text: string,
): ParsedRecord[] | HazardousEventCsvFileError {
	try {
		// With `info`/`raw` csv-parse returns { record, info, raw }; its typings don't model that.
		return parse(text, {
			bom: true,
			relax_column_count: false,
			trim: true,
			info: true,
			raw: true,
			skip_empty_lines: true,
		}) as unknown as ParsedRecord[];
	} catch (err) {
		if (err instanceof CsvError) {
			const line: unknown = err.lines;
			return {
				code: "malformed_csv",
				...(typeof line === "number" ? { line } : {}),
			};
		}
		throw err;
	}
}

/** Transport and file-format concerns of the import (D7): multipart, size, strict UTF-8, RFC
 * 4180. Neither the file name nor its Content-Type is used for any decision. */
export async function parseCsvUpload(
	request: Request,
): Promise<ParsedCsvUpload> {
	const form = await readForm(request);
	if (!(form instanceof FormData)) {
		return failure("", form);
	}
	const modeValue = form.get("import_type");
	const mode = typeof modeValue === "string" ? modeValue : "";

	const file = form.get("file");
	if (!(file instanceof File) || file.size === 0) {
		return failure(mode, { code: "missing_file" });
	}
	if (file.size > MAX_CSV_UPLOAD_BYTES) {
		return failure(mode, { code: "file_too_large" });
	}

	const text = decodeUtf8(await file.arrayBuffer());
	if (text === null) {
		return failure(mode, { code: "invalid_encoding" });
	}

	const records = parseRecords(text);
	if (!Array.isArray(records)) {
		return failure(mode, records);
	}
	const [headerRecord, ...dataRecords] = records;
	if (headerRecord === undefined || dataRecords.length === 0) {
		return failure(mode, { code: "no_data" });
	}
	const lineNumbers = dataRecords.map(startLine);
	return {
		ok: true,
		mode,
		header: headerRecord.record,
		rows: dataRecords.map((entry) => entry.record),
		firstDataLine: lineNumbers[0],
		lineNumbers,
	};
}
