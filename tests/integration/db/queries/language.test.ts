import "../setup";
import { describe, it, expect } from "vitest";
import { dr } from "~/db.server";
import { languageTable } from "~/domains/shared/infrastructure/languageTable";

describe("languageTable", () => {
	it("inserts a row with language_name and language_cd", async () => {
		const [row] = await dr
			.insert(languageTable)
			.values({ languageName: "English", languageCd: "en" })
			.returning();

		expect(row.languageCd).toBe("en");
	});

	it("rejects an insert with language_name omitted", async () => {
		await expect(
			dr
				.insert(languageTable)
				// @ts-expect-error languageName is required
				.values({ languageCd: "fr" })
				.returning(),
		).rejects.toThrow();
	});

	it("rejects an insert with language_cd omitted", async () => {
		await expect(
			dr
				.insert(languageTable)
				// @ts-expect-error languageCd is required
				.values({ languageName: "French" })
				.returning(),
		).rejects.toThrow();
	});

	it("accepts a language_cd with a script subtag (sr-Latn)", async () => {
		const [row] = await dr
			.insert(languageTable)
			.values({ languageName: "Serbian (Latin)", languageCd: "sr-Latn" })
			.returning();

		expect(row.languageCd).toBe("sr-Latn");
	});

	it("accepts a language_cd with a region subtag (es-419)", async () => {
		const [row] = await dr
			.insert(languageTable)
			.values({ languageName: "Spanish (Latin America)", languageCd: "es-419" })
			.returning();

		expect(row.languageCd).toBe("es-419");
	});

	it("accepts a language_cd at the exact 35-char width boundary", async () => {
		const languageCd = "sr-Latn-RS-1994-x-private-subtag123";
		expect(languageCd).toHaveLength(35);

		const [row] = await dr
			.insert(languageTable)
			.values({ languageName: "Boundary Test", languageCd })
			.returning();

		expect(row.languageCd).toBe(languageCd);
		expect(row.languageCd).toHaveLength(35);
	});

	it("rejects a zero-length language_cd via the check constraint (23514)", async () => {
		const error = await dr
			.insert(languageTable)
			.values({ languageName: "Empty Code", languageCd: "" })
			.returning()
			.catch((e: unknown) => e);

		expect((error as { cause?: { code?: string } }).cause?.code).toBe("23514");
	});

	it("rejects a language_cd longer than 35 chars as a string-too-long error (22001), not the check constraint (23514)", async () => {
		const error = await dr
			.insert(languageTable)
			.values({ languageName: "French", languageCd: "a".repeat(36) })
			.returning()
			.catch((e: unknown) => e);

		expect((error as { cause?: { code?: string } }).cause?.code).toBe("22001");
	});

	// Option A (design.md Decision Q3) accepts a single-character code — a known,
	// accepted regression relative to the prior exact-2-character constraint.
	it("accepts a single-character language_cd (accepted gap, design.md Decision Q3)", async () => {
		const [row] = await dr
			.insert(languageTable)
			.values({ languageName: "F-language", languageCd: "f" })
			.returning();

		expect(row.languageCd).toBe("f");
	});

	// Option A accepts stacked subtags that aren't real BCP-47 (accepted gap).
	it('accepts "en-fil" even though it is not a real BCP-47 construction (accepted gap, design.md Decision Q3)', async () => {
		const [row] = await dr
			.insert(languageTable)
			.values({ languageName: "English-Filipino-ish", languageCd: "en-fil" })
			.returning();

		expect(row.languageCd).toBe("en-fil");
	});

	it("rejects a language_cd that does not match the alphanumeric-hyphen shape, via the check constraint (23514)", async () => {
		const error = await dr
			.insert(languageTable)
			.values({ languageName: "Bad Shape", languageCd: "sr_Latn" })
			.returning()
			.catch((e: unknown) => e);

		expect((error as { cause?: { code?: string } }).cause?.code).toBe("23514");
	});

	it("rejects an insert with a duplicate language_cd", async () => {
		await dr
			.insert(languageTable)
			.values({ languageName: "Russian", languageCd: "ru" });

		await expect(
			dr
				.insert(languageTable)
				.values({ languageName: "Russian (dup)", languageCd: "ru" }),
		).rejects.toThrow();
	});

	it("rejects an insert with a duplicate language_name", async () => {
		await dr
			.insert(languageTable)
			.values({ languageName: "Spanish", languageCd: "es" });

		await expect(
			dr
				.insert(languageTable)
				.values({ languageName: "Spanish", languageCd: "sp" }),
		).rejects.toThrow();
	});
});
