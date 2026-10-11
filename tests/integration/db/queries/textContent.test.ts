import "../setup";
import { describe, it, expect, beforeAll } from "vitest";
import { dr } from "~/db.server";
import { languageTable } from "~/domains/shared/infrastructure/languageTable";
import { textContentTable } from "~/domains/shared/infrastructure/textContentTable";

describe("textContentTable", () => {
	let languageId: string;

	beforeAll(async () => {
		const [row] = await dr
			.insert(languageTable)
			.values({ languageName: "English", languageCd: "en" })
			.returning({ id: languageTable.id });
		languageId = row.id;
	});

	it("inserts a row under an existing original_language_id", async () => {
		const [row] = await dr
			.insert(textContentTable)
			.values({ originalText: "Earthquake", originalLanguageId: languageId })
			.returning();

		expect(row.originalLanguageId).toBe(languageId);
	});

	it("rejects an insert whose original_language_id matches no language row", async () => {
		await expect(
			dr
				.insert(textContentTable)
				.values({
					originalText: "Earthquake",
					originalLanguageId: crypto.randomUUID(),
				})
				.returning(),
		).rejects.toThrow();
	});

	it("rejects an insert with original_language_id = NULL", async () => {
		await expect(
			dr
				.insert(textContentTable)
				// @ts-expect-error originalLanguageId is required
				.values({ originalText: "Earthquake" })
				.returning(),
		).rejects.toThrow();
	});

	it("rejects an insert with no original_text", async () => {
		await expect(
			dr
				.insert(textContentTable)
				// @ts-expect-error originalText is required
				.values({ originalLanguageId: languageId })
				.returning(),
		).rejects.toThrow();
	});
});
