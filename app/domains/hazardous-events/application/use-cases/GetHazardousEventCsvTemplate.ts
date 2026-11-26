import type { ISpecificHazardTaxonomyRepository } from "../ports/ISpecificHazardTaxonomyRepository";
import type { CsvImportMode } from "../csv/hazardousEventCsvColumns";

/** Legacy template columns (X1) minus the never-honoured tenant column, plus `specificHazardId`
 * (the example names a real hazard) and `apiImportId` (upsert's key). */
const TEMPLATE_COLUMNS: readonly string[] = [
	"parent",
	"hipHazardId",
	"hipClusterId",
	"hipTypeId",
	"specificHazardId",
	"approvalStatus",
	"nationalSpecification",
	"startDate",
	"endDate",
	"description",
	"chainsExplanation",
	"magnitude",
	"spatialFootprint",
	"attachments",
	"recordOriginator",
	"hazardousEventStatus",
	"dataSource",
	"apiImportId",
];

/** Header for the `csv-template` route (OD-17); update mode leads with `id`. */
export function templateHeader(mode: CsvImportMode): readonly string[] {
	return mode === "update" ? ["id", ...TEMPLATE_COLUMNS] : TEMPLATE_COLUMNS;
}

/** Placeholder `id` for the update example: update needs an event the template cannot know. */
export const TEMPLATE_UPDATE_ID_PLACEHOLDER =
	"00000000-0000-0000-0000-000000000000";

/** One example row in `templateHeader(mode)` order (OD-17). Create and upsert import as-is;
 * update needs a real `id` in place of the placeholder. */
export function templateExampleRow(
	mode: CsvImportMode,
	example: { specificHazardId: string; apiImportId: string },
): string[] {
	const cells: Readonly<Record<string, string>> = {
		id: TEMPLATE_UPDATE_ID_PLACEHOLDER,
		specificHazardId: example.specificHazardId,
		approvalStatus: "draft",
		startDate: "2025-01-01",
		endDate: "2025-01-02",
		description: "Example hazardous event",
		recordOriginator: "Example organization",
		hazardousEventStatus: "passed",
		apiImportId: mode === "upsert" ? example.apiImportId : "",
	};
	return templateHeader(mode).map((column) => cells[column] ?? "");
}

export interface HazardousEventCsvTemplate {
	header: readonly string[];
	row: string[];
	filename: string;
}

/** Header plus one example row per mode (OD-17), naming a hazard of this instance. */
export class GetHazardousEventCsvTemplateUseCase {
	constructor(
		private readonly taxonomyRepository: Pick<
			ISpecificHazardTaxonomyRepository,
			"findAnySpecificHazardId"
		>,
	) {}

	async execute(query: {
		mode: CsvImportMode;
	}): Promise<HazardousEventCsvTemplate> {
		const specificHazardId =
			(await this.taxonomyRepository.findAnySpecificHazardId()) ?? "";
		return {
			header: templateHeader(query.mode),
			row: templateExampleRow(query.mode, {
				specificHazardId,
				// Fresh per download, so an upsert example always creates rather than matches.
				apiImportId: `example-${crypto.randomUUID()}`,
			}),
			filename: `hazardous-event-${query.mode}.csv`,
		};
	}
}
