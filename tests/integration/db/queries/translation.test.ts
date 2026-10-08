import "../setup";
import { describe, it, expect, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { dr } from "~/db.server";
import { languageTable } from "~/domains/shared/infrastructure/languageTable";
import { textContentTable } from "~/domains/shared/infrastructure/textContentTable";
import { translationTable } from "~/domains/shared/infrastructure/translationTable";

describe("translationTable", () => {
	let languageId: string;
	let secondLanguageId: string;

	beforeAll(async () => {
		const [en] = await dr
			.insert(languageTable)
			.values({ languageName: "English", languageCd: "en" })
			.returning({ id: languageTable.id });
		languageId = en.id;
		const [fr] = await dr
			.insert(languageTable)
			.values({ languageName: "French", languageCd: "fr" })
			.returning({ id: languageTable.id });
		secondLanguageId = fr.id;
	});

	async function insertTextContent(): Promise<string> {
		const [row] = await dr
			.insert(textContentTable)
			.values({ originalText: "Earthquake", originalLanguageId: languageId })
			.returning({ id: textContentTable.id });
		return row.id;
	}

	it("inserts a row under an existing text_content_id and language_id", async () => {
		const textContentId = await insertTextContent();

		const [row] = await dr
			.insert(translationTable)
			.values({
				textContentId,
				languageId: secondLanguageId,
				translation: "Séisme",
			})
			.returning();

		expect(row.textContentId).toBe(textContentId);
	});

	it("rejects an insert whose text_content_id matches no text_content row", async () => {
		await expect(
			dr
				.insert(translationTable)
				.values({
					textContentId: crypto.randomUUID(),
					languageId,
					translation: "Séisme",
				})
				.returning(),
		).rejects.toThrow();
	});

	it("rejects an insert with text_content_id = NULL", async () => {
		await expect(
			dr
				.insert(translationTable)
				// @ts-expect-error textContentId is required
				.values({ languageId, translation: "Séisme" })
				.returning(),
		).rejects.toThrow();
	});

	it("rejects an insert whose language_id matches no language row", async () => {
		const textContentId = await insertTextContent();

		await expect(
			dr
				.insert(translationTable)
				.values({
					textContentId,
					languageId: crypto.randomUUID(),
					translation: "Séisme",
				})
				.returning(),
		).rejects.toThrow();
	});

	it("rejects an insert with language_id = NULL", async () => {
		const textContentId = await insertTextContent();

		await expect(
			dr
				.insert(translationTable)
				// @ts-expect-error languageId is required
				.values({ textContentId, translation: "Séisme" })
				.returning(),
		).rejects.toThrow();
	});

	it("rejects an insert with no translation text", async () => {
		const textContentId = await insertTextContent();

		await expect(
			dr
				.insert(translationTable)
				// @ts-expect-error translation is required
				.values({ textContentId, languageId: secondLanguageId })
				.returning(),
		).rejects.toThrow();
	});

	it("rejects a second insert with the same (text_content_id, language_id) pair", async () => {
		const textContentId = await insertTextContent();
		await dr.insert(translationTable).values({
			textContentId,
			languageId: secondLanguageId,
			translation: "Séisme",
		});

		await expect(
			dr.insert(translationTable).values({
				textContentId,
				languageId: secondLanguageId,
				translation: "Séisme (dup)",
			}),
		).rejects.toThrow();
	});

	it("cascades deletion of the referenced text_content row to the translation row", async () => {
		const textContentId = await insertTextContent();
		await dr.insert(translationTable).values({
			textContentId,
			languageId: secondLanguageId,
			translation: "Séisme",
		});

		await dr
			.delete(textContentTable)
			.where(eq(textContentTable.id, textContentId));

		const rows = await dr
			.select()
			.from(translationTable)
			.where(eq(translationTable.textContentId, textContentId));
		expect(rows).toHaveLength(0);
	});

	it("allows two concurrent inserts of distinct (text_content_id, language_id) pairs", async () => {
		const textContentId = await insertTextContent();

		const outcomes = await Promise.all([
			dr
				.insert(translationTable)
				.values({ textContentId, languageId, translation: "Earthquake" })
				.returning()
				.then(
					() => "fulfilled" as const,
					() => "rejected" as const,
				),
			dr
				.insert(translationTable)
				.values({
					textContentId,
					languageId: secondLanguageId,
					translation: "Séisme",
				})
				.returning()
				.then(
					() => "fulfilled" as const,
					() => "rejected" as const,
				),
		]);

		expect(outcomes).toEqual(["fulfilled", "fulfilled"]);
	});

	it("allows exactly one of two concurrent inserts of the identical pair to succeed", async () => {
		const textContentId = await insertTextContent();

		const outcomes = await Promise.all([
			dr
				.insert(translationTable)
				.values({
					textContentId,
					languageId: secondLanguageId,
					translation: "Séisme",
				})
				.returning()
				.then(
					() => "fulfilled" as const,
					() => "rejected" as const,
				),
			dr
				.insert(translationTable)
				.values({
					textContentId,
					languageId: secondLanguageId,
					translation: "Séisme 2",
				})
				.returning()
				.then(
					() => "fulfilled" as const,
					() => "rejected" as const,
				),
		]);

		expect(outcomes.filter((o) => o === "fulfilled")).toHaveLength(1);
		expect(outcomes.filter((o) => o === "rejected")).toHaveLength(1);
	});
});
