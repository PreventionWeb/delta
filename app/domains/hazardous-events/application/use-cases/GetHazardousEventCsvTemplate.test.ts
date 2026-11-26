import { describe, expect, it, vi } from "vitest";
import {
	checkHeader,
	type CsvImportMode,
} from "../csv/hazardousEventCsvColumns";
import {
	GetHazardousEventCsvTemplateUseCase,
	templateHeader,
} from "./GetHazardousEventCsvTemplate";

const SH_ID = "11111111-1111-4111-8111-111111111111";
const PLACEHOLDER_ID = "00000000-0000-0000-0000-000000000000";
const EXAMPLE_API_IMPORT_ID =
	/^example-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const BASE_HEADER = [
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

// Example cells in BASE_HEADER order, apiImportId last.
function exampleCells(specificHazardId: string, apiImportId: unknown) {
	return [
		"",
		"",
		"",
		"",
		specificHazardId,
		"draft",
		"",
		"2025-01-01",
		"2025-01-02",
		"Example hazardous event",
		"",
		"",
		"",
		"",
		"Example organization",
		"passed",
		"",
		apiImportId,
	];
}

function useCase(specificHazardId: string | null) {
	const findAnySpecificHazardId = vi.fn(async () => specificHazardId);
	return {
		findAnySpecificHazardId,
		sut: new GetHazardousEventCsvTemplateUseCase({ findAnySpecificHazardId }),
	};
}

describe("GetHazardousEventCsvTemplateUseCase", () => {
	it("returns the create header, example row and filename", async () => {
		const { sut, findAnySpecificHazardId } = useCase(SH_ID);
		expect(await sut.execute({ mode: "create" })).toStrictEqual({
			header: BASE_HEADER,
			row: exampleCells(SH_ID, ""),
			filename: "hazardous-event-create.csv",
		});
		expect(findAnySpecificHazardId).toHaveBeenCalledTimes(1);
	});

	it("leads the update header and row with id and the placeholder", async () => {
		const { sut } = useCase(SH_ID);
		expect(await sut.execute({ mode: "update" })).toStrictEqual({
			header: ["id", ...BASE_HEADER],
			row: [PLACEHOLDER_ID, ...exampleCells(SH_ID, "")],
			filename: "hazardous-event-update.csv",
		});
	});

	it("fills a generated apiImportId only in upsert mode", async () => {
		const { sut } = useCase(SH_ID);
		expect(await sut.execute({ mode: "upsert" })).toStrictEqual({
			header: BASE_HEADER,
			row: exampleCells(SH_ID, expect.stringMatching(EXAMPLE_API_IMPORT_ID)),
			filename: "hazardous-event-upsert.csv",
		});
	});

	it("generates a different upsert apiImportId on each call", async () => {
		const { sut } = useCase(SH_ID);
		const first = await sut.execute({ mode: "upsert" });
		const second = await sut.execute({ mode: "upsert" });
		const index = BASE_HEADER.indexOf("apiImportId");
		expect(first.row[index]).not.toBe(second.row[index]);
	});

	it.each(["create", "update", "upsert"] as const)(
		"aligns the %s example row with its header",
		async (mode) => {
			const { sut } = useCase(SH_ID);
			const template = await sut.execute({ mode });
			expect(template.row).toHaveLength(template.header.length);
			expect(template.row[template.header.indexOf("specificHazardId")]).toBe(
				SH_ID,
			);
		},
	);

	it.each(["create", "update", "upsert"] as const)(
		"leaves specificHazardId empty in %s mode when the taxonomy is empty",
		async (mode) => {
			const { sut } = useCase(null);
			const template = await sut.execute({ mode });
			expect(template.row[template.header.indexOf("specificHazardId")]).toBe(
				"",
			);
		},
	);
});

// design.md X1 plus `apiImportId`, which the legacy create template omits.
const X1 =
	"parent,hipHazardId,hipClusterId,hipTypeId,approvalStatus,nationalSpecification,startDate,endDate,description,chainsExplanation,magnitude,spatialFootprint,attachments,recordOriginator,hazardousEventStatus,dataSource,apiImportId,countryAccountsId".split(
		",",
	);

const MODES: CsvImportMode[] = ["create", "update", "upsert"];

describe("templateHeader", () => {
	it.each(MODES)(
		"returns a header that passes checkHeader in %s mode",
		(mode) => {
			expect(checkHeader(templateHeader(mode), mode).ok).toBe(true);
		},
	);

	it("includes id in update mode only", () => {
		expect(templateHeader("update")).toContain("id");
		expect(templateHeader("create")).not.toContain("id");
		expect(templateHeader("upsert")).not.toContain("id");
	});

	it("includes apiImportId in upsert mode", () => {
		expect(templateHeader("upsert")).toContain("apiImportId");
	});

	it.each(MODES)(
		"contains the legacy data columns of X1 in %s mode",
		(mode) => {
			const header = templateHeader(mode);
			for (const column of X1.filter((c) => c !== "countryAccountsId")) {
				expect(header, column).toContain(column);
			}
		},
	);
});
