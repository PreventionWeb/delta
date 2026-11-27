import { describe, expect, it } from "vitest";
import en from "../../../../../../locales/en/hazardous-events.json";
import fr from "../../../../../../locales/fr/hazardous-events.json";
import type {
	HazardousEventCsvFileErrorCode,
	HazardousEventCsvRowErrorCode,
} from "~/domains/hazardous-events/application/dto/HazardousEventCsvImportResult";

// Exhaustive by type: adding a code without listing it here fails to compile.
const FILE_CODES: Record<HazardousEventCsvFileErrorCode, true> = {
	unknown_column: true,
	duplicate_column: true,
	missing_required_column: true,
	invalid_mode: true,
	no_data: true,
	file_too_large: true,
	invalid_encoding: true,
	malformed_csv: true,
	missing_file: true,
};
const ROW_CODES: Record<HazardousEventCsvRowErrorCode, true> = {
	required: true,
	invalid_date: true,
	invalid_enum: true,
	invalid_id: true,
	invalid_character: true,
	duplicate_key: true,
	not_found: true,
	conflict: true,
	not_editable: true,
	not_migrated: true,
	concurrent_modification: true,
	api_import_id_immutable: true,
	hip_mismatch: true,
	specific_hazard_required: true,
	status_not_permitted: true,
	status_change_not_supported: true,
	cause_after_effect: true,
	parent_multiple_causes: true,
	invalid_spatial_footprint: true,
	invalid_division: true,
	invalid_attachments: true,
	invalid_attachment_url: true,
	file_reference_not_supported: true,
	validation: true,
};

function strings(value: unknown): string[] {
	if (typeof value === "string") return [value];
	if (value !== null && typeof value === "object") {
		return Object.values(value).flatMap(strings);
	}
	return [];
}

describe("csv.* locale keys (D11, task 9.5)", () => {
	const codes = [...Object.keys(FILE_CODES), ...Object.keys(ROW_CODES)];

	it.each([
		["en", en.csv.error],
		["fr", fr.csv.error],
	] as const)(
		"%s has one non-empty csv.error.<code> per D1 code",
		(_, errors) => {
			const messages: Record<string, string> = errors;
			for (const code of codes) {
				expect(messages[code], code).toBeTruthy();
			}
			expect(Object.keys(messages).sort()).toEqual([...codes].sort());
		},
	);

	it("en and fr define the same csv keys", () => {
		const keys = (value: object, prefix = ""): string[] =>
			Object.entries(value).flatMap(([key, child]) =>
				child !== null && typeof child === "object"
					? keys(child, `${prefix}${key}.`)
					: [`${prefix}${key}`],
			);
		expect(keys(fr.csv).sort()).toEqual(keys(en.csv).sort());
	});

	it.each([
		["en", en.csv],
		["fr", fr.csv],
	] as const)(
		"%s no longer has the 6d-1 skipped-data notice keys",
		(_, block) => {
			expect(
				Object.keys(block).filter((key) =>
					key.startsWith("skipped_data_notice"),
				),
			).toEqual([]);
		},
	);

	it.each([
		["en", en.form],
		["fr", fr.form],
	] as const)(
		"%s has the form's attachment URL message, sentence case, no em dash (D12)",
		(_, form) => {
			const message: unknown = (form as Record<string, unknown>)
				.attachments_invalid_url;
			expect(typeof message).toBe("string");
			const text = message as string;
			expect(text).toContain("http://");
			expect(text).not.toContain("—");
			expect(text[0]).toBe(text[0].toUpperCase());
		},
	);

	it.each([
		["en", en.csv],
		["fr", fr.csv],
	] as const)("%s csv copy has no em dash and no empty value", (_, block) => {
		for (const text of strings(block)) {
			expect(text).not.toContain("—");
			expect(text.trim()).not.toBe("");
		}
	});
});
