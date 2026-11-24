import { test, expect } from "@playwright/test";
import { randomUUID } from "crypto";
import { eq, inArray } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { userTable } from "~/drizzle/schema";
import { userCountryAccountsTable } from "~/drizzle/schema/userCountryAccountsTable";
import { eventTable } from "~/drizzle/schema/eventTable";
import { hazardousEventTable } from "~/drizzle/schema/hazardousEventTable";
import { divisionTable } from "~/drizzle/schema/divisionTable";
import { workflowInstanceTable } from "~/domains/validation-workflow/infrastructure/workflowInstanceTable";
import { dr, initDB } from "~/db.server";
import {
	seedCountryAccount,
	seedSpecificHazard,
} from "../../integration/db/models/hazardousEventTestHelpers";

// ca-he-spatial-footprint-picker (task group 9) -- the real interactive picker's end-to-end
// flows, extending he-preview-form.spec.ts's own fixture/login pattern as a sibling spec rather
// than growing that already-large file further.

const password = "Password123!";
const dataCollectorEmail = `e2e_he_footprint_${Date.now()}@test.com`;
const dataCollectorId = randomUUID();
let countryAccountId: string;
let divisionId: string;
const DIVISION_NAME = "E2E Test Division";

test.beforeAll(async () => {
	initDB();
	const passwordHash = bcrypt.hashSync(password, 10);

	countryAccountId = await seedCountryAccount();
	// Seeds real taxonomy rows the form's Hazard type/cluster/specific hazard selects need --
	// the id itself isn't referenced directly, the dropdowns are driven by index.
	await seedSpecificHazard();

	await dr.insert(userTable).values({
		id: dataCollectorId,
		email: dataCollectorEmail,
		password: passwordHash,
		emailVerified: true,
	});
	await dr.insert(userCountryAccountsTable).values({
		userId: dataCollectorId,
		countryAccountsId: countryAccountId,
		role: "data-collector",
	});

	const [division] = await dr
		.insert(divisionTable)
		.values({
			countryAccountsId: countryAccountId,
			name: { en: DIVISION_NAME },
		})
		.returning();
	divisionId = division.id;
});

test.afterAll(async () => {
	await dr.transaction(async (tx) => {
		const tenantEvents = await tx
			.select({ id: hazardousEventTable.id })
			.from(hazardousEventTable)
			.where(eq(hazardousEventTable.countryAccountsId, countryAccountId));
		const tenantEventIds = tenantEvents.map((e) => e.id);
		if (tenantEventIds.length > 0) {
			await tx
				.delete(workflowInstanceTable)
				.where(inArray(workflowInstanceTable.entityId, tenantEventIds));
		}
		await tx
			.delete(hazardousEventTable)
			.where(eq(hazardousEventTable.countryAccountsId, countryAccountId));
		if (tenantEventIds.length > 0) {
			await tx.delete(eventTable).where(inArray(eventTable.id, tenantEventIds));
		}
		await tx
			.delete(divisionTable)
			.where(eq(divisionTable.countryAccountsId, countryAccountId));
		await tx
			.delete(userCountryAccountsTable)
			.where(eq(userCountryAccountsTable.countryAccountsId, countryAccountId));
		await tx.delete(userTable).where(eq(userTable.id, dataCollectorId));
	});
});

async function login(page: import("@playwright/test").Page) {
	await page.goto("/en/user/login");
	await page.fill('input[name="email"]', dataCollectorEmail);
	await page.fill('input[name="password"]', password);
	await Promise.all([
		page.waitForURL((url) => !url.href.includes("/user/login"), {
			timeout: 30000,
		}),
		page.getByRole("button", { name: "Sign in" }).click(),
	]);
}

async function fillRequiredFields(page: import("@playwright/test").Page) {
	await page.getByLabel("Hazard type").selectOption({ index: 1 });
	await page.getByLabel("Hazard cluster").selectOption({ index: 1 });
	await page.selectOption("#specificHazardId", { index: 1 });
	await page.fill("#startDate", "2026-01-01");
	await page.fill("#endDate", "2026-01-02");
	await page.fill("#recordOriginator", "E2E originator");
}

async function saveAsDraft(page: import("@playwright/test").Page) {
	await page.getByRole("button", { name: "Save or submit" }).click();
	await page.getByRole("radio", { name: "Save as draft" }).click();
	await Promise.all([
		page.waitForURL(/\/en\/he-preview\/[0-9a-f-]+$/),
		page.getByRole("button", { name: "Save as draft" }).click(),
	]);
}

// Add -> item-type radio -> inline-revealed trigger -> the nested tool opens.
async function startAddMap(page: import("@playwright/test").Page) {
	await page.getByRole("button", { name: "Add" }).click();
	await page.getByRole("radio", { name: "Map coordinates" }).click();
	await page.getByRole("button", { name: "Open map" }).click();
}

// Ticks the division's checkbox (a row click toggles it) and commits via the tree's own Apply.
async function pickDivision(page: import("@playwright/test").Page) {
	const tree = page.getByRole("dialog", { name: "Select geographic level" });
	await tree.getByRole("row", { name: DIVISION_NAME }).click();
	await tree.getByRole("button", { name: "Apply" }).click();
	await expect(tree).toHaveCount(0);
}

async function startAddDivision(page: import("@playwright/test").Page) {
	await page.getByRole("button", { name: "Add" }).click();
	await page.getByRole("radio", { name: "Geographic level" }).click();
	await page.getByRole("button", { name: "Select" }).click();
}

async function drawRectangle(
	page: import("@playwright/test").Page,
	mapRegion: ReturnType<import("@playwright/test").Page["getByRole"]>,
) {
	// Legacy Mapper: the drawing-mode dropdown, not an on-map toolbar.
	await page
		.getByRole("combobox", { name: "Drawing mode" })
		.selectOption("rectangle");
	const box = await mapRegion.boundingBox();
	expect(box).not.toBeNull();
	if (!box) throw new Error("mapRegion has no bounding box");
	await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.6, {
		steps: 5,
	});
	await page.mouse.up();
	return box;
}

test.describe("Hazardous event spatial-footprint picker (task group 9)", () => {
	test("drawing a shape, saving, and applying adds a row; submitting shows that geometry on the detail page", async ({
		page,
	}) => {
		// First test in the suite -- same cold-start margin he-preview-form.spec.ts's own
		// "parent-picker flow" test needs, confirmed flaky here under the same load pattern.
		test.slow();
		await login(page);
		await page.goto("/en/he-preview/new");
		await fillRequiredFields(page);
		await startAddMap(page);

		const mapRegion = page.getByRole("region", {
			name: "Spatial footprint map",
		});
		await expect(mapRegion).toBeVisible();
		const box = await drawRectangle(page, mapRegion);

		// The draw ends back on "Move map", and "Edit shape" only enables once a shape exists --
		// the real proof the drawn rectangle landed in the shapes group.
		const modeSelect = page.getByRole("combobox", { name: "Drawing mode" });
		await expect(modeSelect).toHaveValue("move");
		await expect(modeSelect.locator('option[value="edit"]')).not.toBeDisabled();
		expect(box.height).toBeGreaterThan(0);

		// Save Coordinates closes the Mapper, returning to the Add dialog's own summary field.
		await page.getByRole("button", { name: "Save Coordinates" }).click();
		await expect(page.getByText(/^Shape: Polygon/)).toBeVisible();
		await page.getByRole("button", { name: "Apply" }).click();

		await expect(
			page.getByRole("row", { name: /^Shape: Polygon/ }),
		).toBeVisible();

		await saveAsDraft(page);

		await expect(
			page.getByRole("region", { name: "Spatial footprint map" }),
		).toBeVisible();
	});

	test("a geometry row's Edit action reopens the map directly, and Delete removes the row without reopening anything", async ({
		page,
	}) => {
		await login(page);
		await page.goto("/en/he-preview/new");
		await fillRequiredFields(page);
		await startAddMap(page);

		const mapRegion = page.getByRole("region", {
			name: "Spatial footprint map",
		});
		await drawRectangle(page, mapRegion);
		await page.getByRole("button", { name: "Save Coordinates" }).click();
		await page.getByRole("button", { name: "Apply" }).click();

		const row = page.getByRole("row", { name: /^Shape: Polygon/ });
		await expect(row).toBeVisible();

		// Edit opens the map tool directly -- no item-type radio, no Add-dialog chrome.
		await row.getByRole("button", { name: /^Edit Shape:/ }).click();
		await expect(
			page.getByRole("radio", { name: "Map coordinates" }),
		).toHaveCount(0);
		await expect(mapRegion).toBeVisible();
		await page.getByRole("button", { name: "Save Coordinates" }).click();
		await expect(row).toBeVisible();

		await row.getByRole("button", { name: /^Delete Shape:/ }).click();
		await expect(page.getByRole("row", { name: /^Shape:/ })).toHaveCount(0);

		await saveAsDraft(page);
		await expect(
			page.getByText("No spatial observation recorded"),
		).toBeVisible();
	});

	test("a plain submission with the picker untouched records no spatial observation", async ({
		page,
	}) => {
		await login(page);
		await page.goto("/en/he-preview/new");
		await fillRequiredFields(page);

		await saveAsDraft(page);

		await expect(
			page.getByText("No spatial observation recorded"),
		).toBeVisible();
		await expect(
			page.getByRole("region", { name: "Spatial footprint map" }),
		).toHaveCount(0);
	});

	test("selecting a division, applying, and submitting records its id, visible on the detail page", async ({
		page,
	}) => {
		await login(page);
		await page.goto("/en/he-preview/new");
		await fillRequiredFields(page);

		await startAddDivision(page);
		await pickDivision(page);
		await expect(
			page.getByRole("dialog", { name: "Add new item" }),
		).toBeVisible();
		await page.getByRole("button", { name: "Apply" }).click();

		await expect(page.getByRole("row", { name: DIVISION_NAME })).toBeVisible();

		await saveAsDraft(page);

		// The detail page names the division (its breadcrumb path), never the raw id.
		const divisions = page.getByRole("list", { name: "Divisions" });
		await expect(divisions.getByText(DIVISION_NAME)).toBeVisible();
		await expect(page.getByText(divisionId)).toHaveCount(0);
	});

	test("a division row's Delete action removes it directly, without opening the division dialog", async ({
		page,
	}) => {
		await login(page);
		await page.goto("/en/he-preview/new");
		await fillRequiredFields(page);

		await startAddDivision(page);
		await pickDivision(page);
		await page.getByRole("button", { name: "Apply" }).click();

		const row = page.getByRole("row", { name: DIVISION_NAME });
		await expect(row).toBeVisible();
		await row.getByRole("button", { name: `Delete ${DIVISION_NAME}` }).click();

		await expect(page.getByRole("row", { name: DIVISION_NAME })).toHaveCount(0);
	});

	test("Preview map shows a combined view of a drawn shape and a selected division's boundary", async ({
		page,
	}) => {
		await login(page);
		await page.goto("/en/he-preview/new");
		await fillRequiredFields(page);

		await startAddMap(page);
		const mapRegion = page.getByRole("region", {
			name: "Spatial footprint map",
		});
		await drawRectangle(page, mapRegion);
		await page.getByRole("button", { name: "Save Coordinates" }).click();
		await page.getByRole("button", { name: "Apply" }).click();

		await startAddDivision(page);
		await pickDivision(page);
		await page.getByRole("button", { name: "Apply" }).click();

		await page.getByRole("button", { name: "Preview map" }).click();
		await expect(
			page.getByRole("region", { name: "Spatial footprint map" }),
		).toBeVisible();
	});

	test("editing an event with a recorded observation prefills the picker into real rows and leaves it unchanged when untouched", async ({
		page,
	}) => {
		await login(page);
		await page.goto("/en/he-preview/new");
		await fillRequiredFields(page);

		await startAddDivision(page);
		await pickDivision(page);
		await page.getByRole("button", { name: "Apply" }).click();

		await saveAsDraft(page);
		const eventUrl = page.url();
		const eventId = eventUrl.match(/he-preview\/([0-9a-f-]+)$/)?.[1];
		expect(eventId).toBeTruthy();

		await page.goto(`/en/he-preview/edit/${eventId}`);
		// The row renders immediately -- no dialog needs opening to see the prefilled division.
		await expect(page.getByRole("row", { name: DIVISION_NAME })).toBeVisible();

		await fillRequiredFields(page);
		await saveAsDraft(page);

		await page.goto(`/en/he-preview/${eventId}`);
		await expect(
			page.getByRole("list", { name: "Divisions" }).getByText(DIVISION_NAME),
		).toBeVisible();
	});
});
