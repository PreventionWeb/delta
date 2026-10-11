import { eq } from "drizzle-orm";
import { dr } from "~/db.server";
import { languageTable } from "~/domains/shared/infrastructure/languageTable";
import { textContentTable } from "~/domains/shared/infrastructure/textContentTable";
import { translationTable } from "~/domains/shared/infrastructure/translationTable";

const LANGUAGE_NAMES: Record<string, string> = { en: "English" };

// Idempotent: tests share one untruncated DB (setup.ts) and seed concurrently via Promise.all.
export async function getOrCreateLanguage(languageCd = "en"): Promise<string> {
	await dr
		.insert(languageTable)
		.values({
			languageName: LANGUAGE_NAMES[languageCd] ?? languageCd,
			languageCd,
		})
		.onConflictDoNothing();
	const [row] = await dr
		.select({ id: languageTable.id })
		.from(languageTable)
		.where(eq(languageTable.languageCd, languageCd));
	return row.id;
}

/** Enforces ADR-001's standing invariant. */
export async function seedTextContent(
	text: string,
	languageCd = "en",
): Promise<string> {
	const languageId = await getOrCreateLanguage(languageCd);
	const [row] = await dr
		.insert(textContentTable)
		.values({ originalText: text, originalLanguageId: languageId })
		.returning({ id: textContentTable.id });
	await dr.insert(translationTable).values({
		textContentId: row.id,
		languageId,
		translation: text,
	});
	return row.id;
}
