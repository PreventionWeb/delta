import "../setup";
import { eq } from "drizzle-orm";
import { describe, it, expect } from "vitest";
import { dr } from "~/db.server";
import { hipsVersionTable } from "~/domains/hazardous-events/infrastructure/hipsVersionTable";
import { hazardTypeTable } from "~/domains/hazardous-events/infrastructure/hazardTypeTable";
import { hazardClusterTable } from "~/domains/hazardous-events/infrastructure/hazardClusterTable";
import { specificHazardTable } from "~/domains/hazardous-events/infrastructure/specificHazardTable";
import { languageTable } from "~/domains/shared/infrastructure/languageTable";
import { textContentTable } from "~/domains/shared/infrastructure/textContentTable";
import { translationTable } from "~/domains/shared/infrastructure/translationTable";
import {
	seedTextContent,
	getOrCreateLanguage,
} from "../models/textContentTestHelpers";

async function insertHazardCluster(): Promise<string> {
	const [version] = await dr
		.insert(hipsVersionTable)
		.values({ versionNo: "HIPs 2025" })
		.returning({ id: hipsVersionTable.id });
	const [type] = await dr
		.insert(hazardTypeTable)
		.values({
			nameTextContentId: await seedTextContent("Geohazards"),
			hipsVersionId: version.id,
		})
		.returning({ id: hazardTypeTable.id });
	const [cluster] = await dr
		.insert(hazardClusterTable)
		.values({
			nameTextContentId: await seedTextContent("Seismogenic (Earthquakes)"),
			hazardTypeId: type.id,
		})
		.returning({ id: hazardClusterTable.id });
	return cluster.id;
}

describe("hip hierarchy chain integrity", () => {
	it("rejects deleting a hazard_cluster referenced by a specific_hazard row", async () => {
		const hazardClusterId = await insertHazardCluster();
		await dr.insert(specificHazardTable).values({
			nameTextContentId: await seedTextContent("Earthquake"),
			code: "GH0001",
			hazardClusterId,
		});

		await expect(
			dr
				.delete(hazardClusterTable)
				.where(eq(hazardClusterTable.id, hazardClusterId)),
		).rejects.toThrow();
	});

	it("allows two concurrent specific_hazard inserts against the same hazard_cluster_id", async () => {
		const hazardClusterId = await insertHazardCluster();
		const [earthquakeName, tsunamiName] = await Promise.all([
			seedTextContent("Earthquake"),
			seedTextContent("Tsunami"),
		]);

		const outcomes = await Promise.all([
			dr
				.insert(specificHazardTable)
				.values({
					nameTextContentId: earthquakeName,
					code: "GH0001",
					hazardClusterId,
				})
				.returning()
				.then(
					() => "fulfilled" as const,
					() => "rejected" as const,
				),
			dr
				.insert(specificHazardTable)
				.values({
					nameTextContentId: tsunamiName,
					code: "GH0002",
					hazardClusterId,
				})
				.returning()
				.then(
					() => "fulfilled" as const,
					() => "rejected" as const,
				),
		]);

		expect(outcomes).toEqual(["fulfilled", "fulfilled"]);
	});
});

describe("shared translation schema FK delete-protection (non-cascade FKs)", () => {
	async function assertTextContentDeleteRejectedAndTranslationSurvives(
		nameTextContentId: string,
	) {
		await expect(
			dr
				.delete(textContentTable)
				.where(eq(textContentTable.id, nameTextContentId)),
		).rejects.toThrow();

		const [stillThere] = await dr
			.select({ id: translationTable.id })
			.from(translationTable)
			.where(eq(translationTable.textContentId, nameTextContentId));
		expect(stillThere).toBeDefined();
	}

	it("rejects deleting a text_content row still named by a hazard_type row", async () => {
		const [version] = await dr
			.insert(hipsVersionTable)
			.values({ versionNo: "HIPs 2025" })
			.returning({ id: hipsVersionTable.id });
		const nameTextContentId = await seedTextContent("Geohazards");
		await dr.insert(hazardTypeTable).values({
			nameTextContentId,
			hipsVersionId: version.id,
		});

		await assertTextContentDeleteRejectedAndTranslationSurvives(
			nameTextContentId,
		);
	});

	it("rejects deleting a text_content row still named by a hazard_cluster row", async () => {
		const [version] = await dr
			.insert(hipsVersionTable)
			.values({ versionNo: "HIPs 2025" })
			.returning({ id: hipsVersionTable.id });
		const [type] = await dr
			.insert(hazardTypeTable)
			.values({
				nameTextContentId: await seedTextContent("Geohazards"),
				hipsVersionId: version.id,
			})
			.returning({ id: hazardTypeTable.id });
		const nameTextContentId = await seedTextContent(
			"Seismogenic (Earthquakes)",
		);
		await dr.insert(hazardClusterTable).values({
			nameTextContentId,
			hazardTypeId: type.id,
		});

		await assertTextContentDeleteRejectedAndTranslationSurvives(
			nameTextContentId,
		);
	});

	it("rejects deleting a text_content row still named by a specific_hazard row", async () => {
		const hazardClusterId = await insertHazardCluster();
		const nameTextContentId = await seedTextContent("Earthquake");
		await dr.insert(specificHazardTable).values({
			nameTextContentId,
			code: "GH0001",
			hazardClusterId,
		});

		await assertTextContentDeleteRejectedAndTranslationSurvives(
			nameTextContentId,
		);
	});

	it("rejects deleting a text_content row still described by a specific_hazard row", async () => {
		const hazardClusterId = await insertHazardCluster();
		const descriptionTextContentId = await seedTextContent(
			"Sudden ground shaking caused by tectonic movement",
		);
		await dr.insert(specificHazardTable).values({
			nameTextContentId: await seedTextContent("Earthquake"),
			code: "GH0001",
			hazardClusterId,
			descriptionTextContentId,
		});

		await assertTextContentDeleteRejectedAndTranslationSurvives(
			descriptionTextContentId,
		);
	});

	it("rejects deleting a language row still referenced by text_content.original_language_id", async () => {
		const languageId = await getOrCreateLanguage("ar");
		// No translation row on purpose — isolates original_language_id's FK from translation.language_id's.
		await dr
			.insert(textContentTable)
			.values({ originalText: "Earthquake", originalLanguageId: languageId });

		await expect(
			dr.delete(languageTable).where(eq(languageTable.id, languageId)),
		).rejects.toThrow();
	});

	it("rejects deleting a language row still referenced by translation.language_id", async () => {
		const languageId = await getOrCreateLanguage("fr");
		const textContentId = await seedTextContent("Tsunami");
		await dr.insert(translationTable).values({
			textContentId,
			languageId,
			translation: "Tsunami (fr)",
		});

		await expect(
			dr.delete(languageTable).where(eq(languageTable.id, languageId)),
		).rejects.toThrow();
	});
});
