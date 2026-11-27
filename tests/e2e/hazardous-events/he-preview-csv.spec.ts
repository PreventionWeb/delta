import {
	test,
	expect,
	type APIRequestContext,
	type Page,
} from "@playwright/test";
import { randomUUID } from "crypto";
import { and, eq, inArray, isNotNull, or, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { userTable } from "~/drizzle/schema";
import { userCountryAccountsTable } from "~/drizzle/schema/userCountryAccountsTable";
import { eventTable } from "~/drizzle/schema/eventTable";
import { hazardousEventTable } from "~/drizzle/schema/hazardousEventTable";
import { eventRelationshipTable } from "~/drizzle/schema/eventRelationshipTable";
import { auditLogsTable } from "~/drizzle/schema/auditLogsTable";
import { workflowInstanceTable } from "~/domains/validation-workflow/infrastructure/workflowInstanceTable";
import { hazardousEventCausalityTable } from "~/domains/hazardous-events/infrastructure/hazardousEventCausalityTable";
import { specificHazardTable } from "~/domains/hazardous-events/infrastructure/specificHazardTable";
import { hazardClusterTable } from "~/domains/hazardous-events/infrastructure/hazardClusterTable";
import { hazardTypeTable } from "~/domains/hazardous-events/infrastructure/hazardTypeTable";
import { hipsVersionTable } from "~/domains/hazardous-events/infrastructure/hipsVersionTable";
import { textContentTable } from "~/domains/shared/infrastructure/textContentTable";
import { divisionTable } from "~/drizzle/schema/divisionTable";
import { hazardousEventSpatialObservationTable } from "~/domains/hazardous-events/infrastructure/hazardousEventSpatialObservationTable";
import { hazardousEventAttachmentTable } from "~/domains/hazardous-events/infrastructure/hazardousEventAttachmentTable";
import { dr, initDB } from "~/db.server";
import { runWcag22A11yCheck, verifyKeyboardSequence } from "../helpers/a11y";
// Plain Drizzle inserts only -- Playwright's transform can't parse NestJS decorators (he-preview.spec.ts).
import {
	seedCountryAccount,
	seedSpecificHazard,
} from "../../integration/db/models/hazardousEventTestHelpers";
import { countryAccounts } from "../../integration/db/testSchema/countryAccounts";

const suffix = Date.now();
const testEmail = `e2e_he_csv_${suffix}@test.com`;
const userId = randomUUID();
const hip = {
	hipTypeId: `e2e-type-${suffix}`,
	hipClusterId: `e2e-cluster-${suffix}`,
	hipHazardId: `e2e-hazard-${suffix}`,
};
const parentEventId = randomUUID();
const divisionName = `E2E CSV division ${suffix}`;
let countryAccountId: string;
let specificHazardId: string;
let divisionId: string;

// design.md E1 plus the appended columns (NOD-10).
const EXPORT_HEADER_LINE =
	"updatedAt,createdAt,approvalStatus,createdByUserId,updatedByUserId,submittedByUserId,submittedAt,validatedByUserId,validatedAt,publishedByUserId,publishedAt,apiImportId,hipHazardId,hipClusterId,hipTypeId,id,countryAccountsId,specificHazardId,status,nationalSpecification,startDate,endDate,description,chainsExplanation,magnitude,recordOriginator,hazardousEventStatus,dataSource,specificHazardLocalName,specificHazardNationalName,parent,spatialFootprint,attachments";

// Legacy-shaped create file: X1 data columns plus the local/national name columns; no `id`.
const LEGACY_HEADER = [
	"parent",
	"hipHazardId",
	"hipClusterId",
	"hipTypeId",
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
	"countryAccountsId",
];

type Row = Partial<Record<(typeof LEGACY_HEADER)[number], string>>;

function csvCell(value: string): string {
	return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function legacyCsv(rows: Row[]): string {
	return [
		LEGACY_HEADER.join(","),
		...rows.map((row) =>
			LEGACY_HEADER.map((column) => csvCell(row[column] ?? "")).join(","),
		),
	].join("\r\n");
}

function validRow(apiImportId: string, overrides: Row = {}): Row {
	return {
		hipHazardId: hip.hipHazardId,
		hipClusterId: hip.hipClusterId,
		hipTypeId: hip.hipTypeId,
		startDate: "2026-02-01",
		endDate: "2026-02-03",
		recordOriginator: "E2E CSV originator",
		hazardousEventStatus: "passed",
		apiImportId,
		...overrides,
	};
}

test.beforeAll(async () => {
	initDB();
	countryAccountId = await seedCountryAccount();
	specificHazardId = await seedSpecificHazard(hip);
	const [division] = await dr
		.insert(divisionTable)
		.values({ name: { en: divisionName }, countryAccountsId: countryAccountId })
		.returning({ id: divisionTable.id });
	divisionId = division.id;

	await dr.insert(userTable).values({
		id: userId,
		email: testEmail,
		password: bcrypt.hashSync("Password123!", 10),
		emailVerified: true,
	});
	await dr.insert(userCountryAccountsTable).values({
		userId,
		countryAccountsId: countryAccountId,
		role: "admin",
		isPrimaryAdmin: false,
	});

	// Cause for the legacy file's `parent`; starts before the imported effect (D14).
	await dr.insert(eventTable).values({ id: parentEventId });
	await dr.insert(hazardousEventTable).values({
		id: parentEventId,
		countryAccountsId: countryAccountId,
		specificHazardId,
		startDate: "2026-01-01",
		specificHazardLocalName: `E2E CSV parent ${suffix}`,
	});
	await dr
		.insert(workflowInstanceTable)
		.values({ entityId: parentEventId, entityType: "HE", status: "DRAFT" });
});

async function tenantEventIds(): Promise<string[]> {
	const rows = await dr
		.select({ id: hazardousEventTable.id })
		.from(hazardousEventTable)
		.where(eq(hazardousEventTable.countryAccountsId, countryAccountId));
	return rows.map((r) => r.id);
}

async function eventIdByApiImportId(apiImportId: string): Promise<string> {
	const rows = await dr
		.select({ id: hazardousEventTable.id })
		.from(hazardousEventTable)
		.where(
			and(
				eq(hazardousEventTable.countryAccountsId, countryAccountId),
				eq(hazardousEventTable.apiImportId, apiImportId),
			),
		);
	expect(rows).toHaveLength(1);
	return rows[0].id;
}

async function login(page: Page) {
	await page.goto("/en/user/login");
	await page.fill('input[name="email"]', testEmail);
	await page.fill('input[name="password"]', "Password123!");
	await Promise.all([
		page.waitForURL((url) => !url.href.includes("/user/login"), {
			timeout: 30000,
		}),
		page.getByRole("button", { name: "Sign in" }).click(),
	]);
}

// Playwright auto-dismisses native dialogs; any one is a failure to report.
function failOnNativeDialog(page: Page) {
	page.on("dialog", (dialog) => {
		throw new Error(
			`Unexpected native dialog: ${dialog.type()} ${dialog.message()}`,
		);
	});
}

async function openImportPage(page: Page, lang = "en") {
	failOnNativeDialog(page);
	await login(page);
	await page.goto(`/${lang}/he-preview/csv-import`);
	await page.waitForLoadState("networkidle");
}

async function uploadAndImport(page: Page, name: string, csv: string) {
	await page.locator('input[name="file"]').setInputFiles({
		name,
		mimeType: "text/csv",
		buffer: Buffer.from(csv, "utf-8"),
	});
	await page.getByRole("button", { name: "Import", exact: true }).click();
}

async function audit(page: Page, label: string, violations: string[]) {
	await runWcag22A11yCheck(page, { scope: "main", label }).catch((err: Error) =>
		violations.push(err.message),
	);
}

function firstLine(body: string): string {
	return body.split(/\r?\n/)[0];
}

test.describe("he-preview CSV import/export (6d-1)", () => {
	test("export downloads the tenant's events as hazardous-event.csv with the E1 header plus the appended columns", async ({
		page,
	}) => {
		await login(page);
		const response = await page.request.get("/en/he-preview/csv-export");

		expect(response.status()).toBe(200);
		expect(response.headers()["content-type"]).toMatch(/^text\/csv/);
		expect(response.headers()["content-disposition"]).toBe(
			'attachment; filename="hazardous-event.csv"',
		);
		const body = await response.text();
		expect(firstLine(body)).toBe(EXPORT_HEADER_LINE);
		expect(body).toContain(parentEventId);
	});

	test("initial page: axe clean and tab order file input, Type, Import, back link, template links", async ({
		page,
	}) => {
		await openImportPage(page);
		await expect(
			page.getByRole("heading", { name: "Hazardous events CSV import" }),
		).toBeVisible();

		const violations: string[] = [];
		await audit(page, "initial", violations);
		expect(violations).toEqual([]);

		// Start sequential focus navigation at the title; clicking the label would open the file chooser.
		await page.getByRole("heading", { level: 1 }).click();
		await verifyKeyboardSequence(
			page,
			[
				{ key: "Tab", expectedFocusedSelector: 'input[name="file"]' },
				{ key: "Tab", expectedFocusedSelector: "button.dts-select-trigger" },
				{ key: "Tab", expectedFocusedSelector: 'button[type="submit"]' },
				{ key: "Tab", expectedFocusedSelector: 'a[href="/en/he-preview"]' },
				{
					key: "Tab",
					expectedFocusedSelector:
						'a[href="/en/he-preview/csv-template?mode=create"]',
				},
				{
					key: "Tab",
					expectedFocusedSelector:
						'a[href="/en/he-preview/csv-template?mode=update"]',
				},
				{
					key: "Tab",
					expectedFocusedSelector:
						'a[href="/en/he-preview/csv-template?mode=upsert"]',
				},
			],
			"csv-import",
		);
		await expect(page.getByRole("button", { name: "Type" })).toContainText(
			"Create",
		);
	});

	test("a legacy-format file with a Point footprint, a tenant division and an https link imports and shows on the detail page (6d-2)", async ({
		page,
	}) => {
		const withParent = `e2e-csv-legacy-a-${suffix}`;
		const withLink = `e2e-csv-legacy-b-${suffix}`;
		const csv = legacyCsv([
			validRow(withParent, {
				parent: parentEventId,
				approvalStatus: "published",
				description: "Imported with a parent",
				spatialFootprint: JSON.stringify([
					{
						id: "f1",
						title: "Area",
						map_option: "Map coordinates",
						geojson: {
							type: "Feature",
							geometry: { type: "Point", coordinates: [77.2, 28.6] },
							properties: {},
						},
					},
					{
						id: "f2",
						map_option: "Geographic level",
						geojson: { properties: { division_id: divisionId } },
					},
				]),
				countryAccountsId: randomUUID(),
			}),
			validRow(withLink, {
				approvalStatus: "published",
				description: "Imported as published",
				attachments: JSON.stringify([
					{
						id: "a1",
						title: "Report",
						tag: [],
						file_option: "Link",
						url: "https://example.org/report",
					},
				]),
			}),
		]);
		await openImportPage(page);
		await uploadAndImport(page, "legacy.csv", csv);

		const status = page
			.getByRole("status")
			.filter({ hasText: "events created" });
		await expect(status).toContainText(
			"2 events created, 0 updated, 0 unchanged.",
		);
		await expect(status).not.toContainText("not imported.");
		await expect(status).toContainText(
			"Columns not imported: countryAccountsId",
		);

		const violations: string[] = [];
		await audit(page, "success", violations);
		expect(violations).toEqual([]);

		const childId = await eventIdByApiImportId(withParent);
		const linkedId = await eventIdByApiImportId(withLink);
		const causality = await dr
			.select({ cause: hazardousEventCausalityTable.causeHazardousEventId })
			.from(hazardousEventCausalityTable)
			.where(eq(hazardousEventCausalityTable.effectHazardousEventId, childId));
		expect(causality).toEqual([{ cause: parentEventId }]);

		await page.goto(`/en/he-preview/${childId}`);
		await expect(page.locator("main .dts-status--published")).toHaveAttribute(
			"title",
			"Published",
		);
		await expect(page.locator("main")).toContainText("Observation time");
		await expect(page.locator("main")).not.toContainText(
			"No spatial observation recorded",
		);
		await expect(page.locator("main")).toContainText(divisionName);

		await page.goto(`/en/he-preview/${linkedId}`);
		await expect(page.locator("main")).toContainText("Imported as published");
		await expect(
			page.locator("main").getByRole("link", {
				name: "https://example.org/report",
			}),
		).toHaveAttribute("href", "https://example.org/report");
	});

	test("a footprint or attachment that breaks the rules is a line-numbered error and nothing is created (6d-2)", async ({
		page,
	}) => {
		const before = (await tenantEventIds()).length;
		const csv = legacyCsv([
			validRow(`e2e-csv-bad-a-${suffix}`, {
				spatialFootprint: JSON.stringify([
					{ map_option: "Geographic level", division_id: randomUUID() },
				]),
			}),
			validRow(`e2e-csv-bad-b-${suffix}`, {
				attachments: JSON.stringify([
					{ title: "X", file_option: "Link", url: "javascript:alert(1)" },
				]),
			}),
		]);
		await openImportPage(page);
		await uploadAndImport(page, "bad.csv", csv);

		const alert = page.getByRole("alert");
		await expect(alert).toContainText(
			"Line 2, column spatialFootprint: This division does not exist in your country instance.",
		);
		await expect(alert).toContainText(
			"Line 3, column attachments: Attachment links must start with http:// or https://. Value: javascript:alert(1)",
		);
		const violations: string[] = [];
		await audit(page, "failure", violations);
		expect(violations).toEqual([]);
		expect((await tenantEventIds()).length).toBe(before);
	});

	test("export then re-import in update mode reports every row unchanged (6d-2 round trip)", async ({
		page,
	}) => {
		await openImportPage(page);
		const response = await page.request.get("/en/he-preview/csv-export");
		expect(response.status()).toBe(200);
		const body = await response.text();
		const rows = body.split("\r\n").filter((line) => line !== "").length - 1;
		expect(body).toContain('""map_option"":""Map coordinates""');
		expect(body).toContain("https://example.org/report");

		await page.getByRole("button", { name: /Type/ }).click();
		await page.getByRole("option", { name: "Update", exact: true }).click();
		await uploadAndImport(page, "exported.csv", body);

		await expect(
			page.getByRole("status").filter({ hasText: "events created" }),
		).toContainText(`0 events created, 0 updated, ${rows} unchanged.`);
	});

	test("a mixed file shows line-numbered errors and creates no rows", async ({
		page,
	}) => {
		const before = (await tenantEventIds()).length;
		const csv = legacyCsv([
			validRow(`e2e-csv-mixed-ok-${suffix}`),
			validRow(`e2e-csv-mixed-date-${suffix}`, { startDate: "2026-13-45" }),
			validRow(`e2e-csv-mixed-hip-${suffix}`, {
				hipHazardId: `e2e-unknown-${suffix}`,
				hipClusterId: "",
				hipTypeId: "",
			}),
		]);
		await openImportPage(page);
		await uploadAndImport(page, "mixed.csv", csv);

		const alert = page
			.getByRole("alert")
			.filter({ hasText: "The file was not imported." });
		await expect(alert).toBeVisible();
		await expect(alert).toBeFocused();
		await expect(alert).toContainText("Line 3");
		await expect(alert).toContainText(
			"Enter a date as YYYY, YYYY-MM or YYYY-MM-DD.",
		);
		await expect(alert).toContainText("Line 4");
		await expect(alert).toContainText("No matching record was found.");
		await expect(alert).not.toContainText("Line 2");

		const violations: string[] = [];
		await audit(page, "failure", violations);
		expect(violations).toEqual([]);

		expect((await tenantEventIds()).length).toBe(before);
	});

	test("the create template downloads and imports as one event", async ({
		page,
	}) => {
		await openImportPage(page);
		const response = await page.request.get(
			"/en/he-preview/csv-template?mode=create",
		);
		expect(response.status()).toBe(200);
		expect(response.headers()["content-disposition"]).toBe(
			'attachment; filename="hazardous-event-create.csv"',
		);
		const template = await response.text();
		expect(firstLine(template)).toBe(
			"parent,hipHazardId,hipClusterId,hipTypeId,specificHazardId,approvalStatus,nationalSpecification,startDate,endDate,description,chainsExplanation,magnitude,spatialFootprint,attachments,recordOriginator,hazardousEventStatus,dataSource,apiImportId",
		);

		const before = new Set(await tenantEventIds());
		await uploadAndImport(page, "hazardous-event-create.csv", template);
		await expect(
			page.getByRole("status").filter({ hasText: "event created" }),
		).toContainText("1 event created, 0 updated, 0 unchanged.");

		const added = (await tenantEventIds()).filter((id) => !before.has(id));
		expect(added).toHaveLength(1);
		const [created] = await dr
			.select({ recordOriginator: hazardousEventTable.recordOriginator })
			.from(hazardousEventTable)
			.where(eq(hazardousEventTable.id, added[0]));
		expect(created.recordOriginator).toBe("Example organization");
	});

	test("French copy: title and Import button", async ({ page }) => {
		await openImportPage(page, "fr");
		await expect(
			page.getByRole("heading", {
				name: "Importation CSV des événements dangereux",
			}),
		).toBeVisible();
		await expect(
			page.getByRole("button", { name: "Importer", exact: true }),
		).toBeVisible();

		const violations: string[] = [];
		await audit(page, "french", violations);
		expect(violations).toEqual([]);
	});

	// Last: fills the tenant with LARGE_ROWS events; timings are logged, not asserted (OD-15).
	test("a large create file imports and the export is timed", async ({
		page,
	}) => {
		const LARGE_ROWS = 2000;
		test.setTimeout(600_000);
		const rows = Array.from({ length: LARGE_ROWS }, (_, i) =>
			validRow(`e2e-csv-large-${suffix}-${i}`, {
				description: `Large row ${i}`,
			}),
		);
		const csv = legacyCsv(rows);
		await openImportPage(page);

		const started = Date.now();
		await uploadAndImport(page, "large.csv", csv);
		await expect(
			page.getByRole("status").filter({ hasText: "events created" }),
		).toContainText(`${LARGE_ROWS} events created, 0 updated, 0 unchanged.`, {
			timeout: 540_000,
		});
		const importMs = Date.now() - started;
		console.log(
			`[he-preview-csv] import of ${LARGE_ROWS} rows (${Buffer.byteLength(csv)} bytes): ${importMs} ms`,
		);

		const tenantRows = (await tenantEventIds()).length;
		const exportStarted = Date.now();
		const response = await page.request.get("/en/he-preview/csv-export");
		const body = await response.text();
		const exportMs = Date.now() - exportStarted;
		expect(response.status()).toBe(200);
		const dataLines = body.split(/\r\n/).filter((l) => l !== "").length - 1;
		console.log(
			`[he-preview-csv] export of ${tenantRows} tenant rows (${dataLines} data lines, ${Buffer.byteLength(body)} bytes): ${exportMs} ms`,
		);
		expect(dataLines).toBe(tenantRows);
	});
});

// Through the CA delete action as the list page's fetcher does; true on the success redirect.
async function deleteThroughAction(
	request: APIRequestContext,
	id: string,
): Promise<boolean> {
	const response = await request.post(`/en/he-preview/delete/${id}`, {
		maxRedirects: 0,
	});
	if (response.status() === 302) return true;
	console.log(
		`[he-preview-csv] CA delete of ${id} returned ${response.status()}: ${(await response.text()).slice(0, 300)}`,
	);
	return false;
}

test.afterAll(async ({ browser }) => {
	test.setTimeout(600_000);
	const ids = await tenantEventIds();

	// CA delete refuses either end of a cause link (causal_chain); a published effect cannot be unlinked, so those fall back.
	const context = await browser.newContext();
	const page = await context.newPage();
	let viaAction = 0;
	try {
		await login(page);
		const CONCURRENCY = 8;
		for (let i = 0; i < ids.length; i += CONCURRENCY) {
			const results = await Promise.all(
				ids
					.slice(i, i + CONCURRENCY)
					.map((id) => deleteThroughAction(page.request, id)),
			);
			viaAction += results.filter(Boolean).length;
		}
	} finally {
		await context.close();
	}

	// Fallback for anything the action could not delete.
	const left = await tenantEventIds();
	if (left.length > 0) {
		await dr.transaction(async (tx) => {
			await tx
				.delete(hazardousEventCausalityTable)
				.where(
					or(
						inArray(hazardousEventCausalityTable.causeHazardousEventId, left),
						inArray(hazardousEventCausalityTable.effectHazardousEventId, left),
					),
				);
			await tx
				.delete(eventRelationshipTable)
				.where(
					or(
						inArray(eventRelationshipTable.parentId, left),
						inArray(eventRelationshipTable.childId, left),
					),
				);
			await tx
				.delete(workflowInstanceTable)
				.where(inArray(workflowInstanceTable.entityId, left));
			await tx
				.delete(hazardousEventTable)
				.where(inArray(hazardousEventTable.id, left));
			await tx.delete(eventTable).where(inArray(eventTable.id, left));
		});
	}
	console.log(
		`[he-preview-csv] cleanup: ${ids.length} events, ${viaAction} via CA delete action, ${left.length} via direct delete`,
	);

	// Orphan checks, scoped to this spec's ids (other specs share the DB).
	if (ids.length > 0) {
		const orphanWorkflows = await dr
			.select({ id: workflowInstanceTable.id })
			.from(workflowInstanceTable)
			.where(
				and(
					eq(workflowInstanceTable.entityType, "HE"),
					inArray(workflowInstanceTable.entityId, ids),
				),
			);
		expect(orphanWorkflows).toEqual([]);
		const orphanCausality = await dr
			.select({ id: hazardousEventCausalityTable.id })
			.from(hazardousEventCausalityTable)
			.where(
				or(
					inArray(hazardousEventCausalityTable.causeHazardousEventId, ids),
					inArray(hazardousEventCausalityTable.effectHazardousEventId, ids),
				),
			);
		expect(orphanCausality).toEqual([]);
		const leftEvents = await dr
			.select({ id: eventTable.id })
			.from(eventTable)
			.where(inArray(eventTable.id, ids));
		expect(leftEvents).toEqual([]);
		const orphanObservations = await dr
			.select({ id: hazardousEventSpatialObservationTable.id })
			.from(hazardousEventSpatialObservationTable)
			.where(
				inArray(hazardousEventSpatialObservationTable.hazardousEventId, ids),
			);
		expect(orphanObservations).toEqual([]);
		const orphanAttachments = await dr
			.select({ id: hazardousEventAttachmentTable.id })
			.from(hazardousEventAttachmentTable)
			.where(inArray(hazardousEventAttachmentTable.hazardousEventId, ids));
		expect(orphanAttachments).toEqual([]);
	}
	const globalOrphans = await dr
		.select({ id: workflowInstanceTable.id })
		.from(workflowInstanceTable)
		.where(
			and(
				eq(workflowInstanceTable.entityType, "HE"),
				isNotNull(workflowInstanceTable.entityId),
				sql`not exists (select 1 from hazardous_event he where he.id = ${workflowInstanceTable.entityId})`,
			),
		);
	console.log(
		`[he-preview-csv] global HE workflow_instance rows without a hazardous_event: ${globalOrphans.length}`,
	);

	await dr.transaction(async (tx) => {
		await tx
			.delete(auditLogsTable)
			.where(
				or(
					eq(auditLogsTable.userId, userId),
					eq(auditLogsTable.countryAccountsId, countryAccountId),
				),
			);
		await tx
			.delete(userCountryAccountsTable)
			.where(eq(userCountryAccountsTable.countryAccountsId, countryAccountId));
		await tx.delete(userTable).where(eq(userTable.id, userId));
		await tx.delete(divisionTable).where(eq(divisionTable.id, divisionId));
		await tx
			.delete(countryAccounts)
			.where(eq(countryAccounts.id, countryAccountId));

		// Seeded taxonomy too: a leftover "Hazard ..." entry crowds he-preview-filters' "Z" combobox search.
		const [taxonomy] = await tx
			.select({
				hazardText: specificHazardTable.nameTextContentId,
				clusterId: hazardClusterTable.id,
				clusterText: hazardClusterTable.nameTextContentId,
				typeId: hazardTypeTable.id,
				typeText: hazardTypeTable.nameTextContentId,
				hipsVersionId: hazardTypeTable.hipsVersionId,
			})
			.from(specificHazardTable)
			.innerJoin(
				hazardClusterTable,
				eq(hazardClusterTable.id, specificHazardTable.hazardClusterId),
			)
			.innerJoin(
				hazardTypeTable,
				eq(hazardTypeTable.id, hazardClusterTable.hazardTypeId),
			)
			.where(eq(specificHazardTable.id, specificHazardId));
		await tx
			.delete(specificHazardTable)
			.where(eq(specificHazardTable.id, specificHazardId));
		await tx
			.delete(hazardClusterTable)
			.where(eq(hazardClusterTable.id, taxonomy.clusterId));
		await tx
			.delete(hazardTypeTable)
			.where(eq(hazardTypeTable.id, taxonomy.typeId));
		await tx
			.delete(hipsVersionTable)
			.where(eq(hipsVersionTable.id, taxonomy.hipsVersionId));
		// Translations cascade.
		await tx
			.delete(textContentTable)
			.where(
				inArray(textContentTable.id, [
					taxonomy.hazardText,
					taxonomy.clusterText,
					taxonomy.typeText,
				]),
			);
	});
});
