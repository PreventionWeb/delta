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

	it("rejects an insert with language_cd longer than 2 chars", async () => {
		await expect(
			dr
				.insert(languageTable)
				.values({ languageName: "French", languageCd: "fra" })
				.returning(),
		).rejects.toThrow();
	});

	it("rejects an insert with language_cd shorter than 2 chars", async () => {
		await expect(
			dr
				.insert(languageTable)
				.values({ languageName: "French", languageCd: "f" })
				.returning(),
		).rejects.toThrow();
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
