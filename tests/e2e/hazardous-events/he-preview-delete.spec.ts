import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "crypto";
import { eq, inArray } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { userTable } from "~/drizzle/schema";
import { userCountryAccountsTable } from "~/drizzle/schema/userCountryAccountsTable";
import { eventTable } from "~/drizzle/schema/eventTable";
import { hazardousEventTable } from "~/drizzle/schema/hazardousEventTable";
import { disasterEventTable } from "~/drizzle/schema/disasterEventTable";
import { eventRelationshipTable } from "~/drizzle/schema/eventRelationshipTable";
import { auditLogsTable } from "~/drizzle/schema/auditLogsTable";
import { workflowInstanceTable } from "~/domains/validation-workflow/infrastructure/workflowInstanceTable";
import { specificHazardTable } from "~/domains/hazardous-events/infrastructure/specificHazardTable";
import { hazardClusterTable } from "~/domains/hazardous-events/infrastructure/hazardClusterTable";
import { hazardTypeTable } from "~/domains/hazardous-events/infrastructure/hazardTypeTable";
import { hipsVersionTable } from "~/domains/hazardous-events/infrastructure/hipsVersionTable";
import { textContentTable } from "~/domains/shared/infrastructure/textContentTable";
import { dr, initDB } from "~/db.server";
// Plain Drizzle inserts only -- Playwright's transform can't parse NestJS decorators (he-preview.spec.ts).
import {
	seedCountryAccount,
	seedSpecificHazard,
} from "../../integration/db/models/hazardousEventTestHelpers";

const suffix = Date.now();
const testEmail = `e2e_he_delete_${suffix}@test.com`;
const userId = randomUUID();
let countryAccountId: string;
let specificHazardId: string;

// Each event is named by its own hazard-column label, so rows are found by text, not position.
const events = {
	deletable: { id: randomUUID(), name: `E2E delete me ${suffix}` },
	cancelled: { id: randomUUID(), name: `E2E keep on cancel ${suffix}` },
	disasterLinked: { id: randomUUID(), name: `E2E disaster linked ${suffix}` },
	legacyParent: { id: randomUUID(), name: `E2E legacy parent ${suffix}` },
	legacyChild: { id: randomUUID(), name: `E2E legacy child ${suffix}` },
	vanishing: { id: randomUUID(), name: `E2E deleted elsewhere ${suffix}` },
	roleFlipped: { id: randomUUID(), name: `E2E role flipped ${suffix}` },
};
const eventIds = Object.values(events).map((e) => e.id);
const disasterEventId = randomUUID();

const DISASTER_EVENT_MESSAGE =
	"Cannot delete hazard event because it is linked to one or more disaster events. Please delete the associated disaster events first.";
const CAUSED_BY_MESSAGE = "Delete events that are caused by this event first";
const NOT_FOUND_MESSAGE = "Record not found or access denied";
const FORBIDDEN_MESSAGE = "You do not have permission to delete this record.";

async function seedEvent(id: string, name: string): Promise<void> {
	await dr.insert(eventTable).values({ id });
	await dr.insert(hazardousEventTable).values({
		id,
		countryAccountsId: countryAccountId,
		specificHazardId,
		startDate: "2026-01-01",
		specificHazardLocalName: name,
	});
	await dr
		.insert(workflowInstanceTable)
		.values({ entityId: id, entityType: "HE", status: "DRAFT" });
}

test.beforeAll(async () => {
	initDB();
	countryAccountId = await seedCountryAccount();
	specificHazardId = await seedSpecificHazard();

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

	for (const { id, name } of Object.values(events)) {
		await seedEvent(id, name);
	}

	await dr.insert(eventTable).values({ id: disasterEventId });
	await dr.insert(disasterEventTable).values({
		id: disasterEventId,
		hazardousEventId: events.disasterLinked.id,
		countryAccountsId: countryAccountId,
	});

	// DEF-044: an outgoing legacy parent link blocks the parent's delete.
	await dr.insert(eventRelationshipTable).values({
		parentId: events.legacyParent.id,
		childId: events.legacyChild.id,
		type: "caused_by",
	});
});

test.afterAll(async () => {
	await dr.transaction(async (tx) => {
		await tx
			.delete(eventRelationshipTable)
			.where(inArray(eventRelationshipTable.parentId, eventIds));
		await tx
			.delete(disasterEventTable)
			.where(eq(disasterEventTable.id, disasterEventId));
		await tx.delete(eventTable).where(eq(eventTable.id, disasterEventId));
		await tx
			.delete(workflowInstanceTable)
			.where(inArray(workflowInstanceTable.entityId, eventIds));
		await tx
			.delete(hazardousEventTable)
			.where(inArray(hazardousEventTable.id, eventIds));
		await tx.delete(eventTable).where(inArray(eventTable.id, eventIds));
		await tx.delete(auditLogsTable).where(eq(auditLogsTable.userId, userId));
		await tx
			.delete(userCountryAccountsTable)
			.where(eq(userCountryAccountsTable.countryAccountsId, countryAccountId));
		await tx.delete(userTable).where(eq(userTable.id, userId));
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

async function openList(page: Page) {
	await login(page);
	await page.goto("/en/he-preview?pageSize=50");
	await page.waitForLoadState("networkidle");
}

function rowFor(page: Page, name: string) {
	return page.getByRole("row").filter({ hasText: name });
}

// Retried: on a cold dev server a click can land before hydration attaches the handler.
async function openDeleteDialog(page: Page, name: string) {
	const heading = page.getByRole("dialog").getByRole("heading", {
		name: "Are you sure you want to delete this record?",
	});
	await expect(async () => {
		await rowFor(page, name)
			.getByRole("button", { name: "Delete" })
			.click({ timeout: 2000 });
		await expect(heading).toBeVisible({ timeout: 2000 });
	}).toPass({ timeout: 30000 });
}

async function confirmDelete(page: Page, name: string) {
	await openDeleteDialog(page, name);
	await page
		.getByRole("dialog")
		.getByRole("button", { name: "Delete permanently" })
		.click();
}

async function hazardousEventExists(id: string): Promise<boolean> {
	const rows = await dr
		.select({ id: hazardousEventTable.id })
		.from(hazardousEventTable)
		.where(eq(hazardousEventTable.id, id));
	return rows.length === 1;
}

test.describe("he-preview list Delete row action (6l)", () => {
	test("an admin deletes a zero-dependent event: confirm, Record deleted toast, row gone", async ({
		page,
	}) => {
		await openList(page);
		await expect(rowFor(page, events.deletable.name)).toBeVisible();

		await confirmDelete(page, events.deletable.name);

		await expect(page.getByText("Record deleted")).toBeVisible();
		await expect(page).toHaveURL(/\/en\/he-preview$/);
		await expect(rowFor(page, events.deletable.name)).toHaveCount(0);
		expect(await hazardousEventExists(events.deletable.id)).toBe(false);
	});

	test("Do not delete closes the dialog and keeps the row", async ({
		page,
	}) => {
		await openList(page);

		await openDeleteDialog(page, events.cancelled.name);
		await page.getByRole("button", { name: "Do not delete" }).click();

		await expect(page.getByRole("dialog")).toHaveCount(0);
		await expect(rowFor(page, events.cancelled.name)).toBeVisible();
		expect(await hazardousEventExists(events.cancelled.id)).toBe(true);
	});

	// Same grid cell navigation as he-preview.spec.ts: Tab reaches the row, ArrowRight walks cells/children.
	test("the Delete trigger is keyboard-reachable in the grid and Enter opens the dialog; Escape closes it", async ({
		page,
	}) => {
		await openList(page);
		const trigger = rowFor(page, events.cancelled.name).getByRole("button", {
			name: "Delete",
		});
		await expect(async () => {
			await rowFor(page, events.cancelled.name).click({
				position: { x: 5, y: 5 },
				timeout: 2000,
			});
			// ArrowRight reaches the actions cell's first child (focusChild); Tab then walks its children.
			for (let i = 0; i < 12; i++) {
				if (await trigger.evaluate((el) => el === document.activeElement)) {
					break;
				}
				const inActionsCell = await page.evaluate(
					() => document.activeElement?.closest(".dts-table__actions") !== null,
				);
				await page.keyboard.press(inActionsCell ? "Tab" : "ArrowRight");
			}
			await expect(trigger).toBeFocused({ timeout: 1000 });
		}).toPass({ timeout: 30000 });

		await page.keyboard.press("Enter");
		await expect(page.getByRole("dialog")).toBeVisible();
		await page.keyboard.press("Escape");
		await expect(page.getByRole("dialog")).toHaveCount(0);
		await expect(rowFor(page, events.cancelled.name)).toBeVisible();
	});

	test("a disaster-event-referenced delete shows the DISASTER_EVENT error toast and keeps the row (DEF-003 delete-guard)", async ({
		page,
	}) => {
		await openList(page);

		await confirmDelete(page, events.disasterLinked.name);

		const toast = page.getByRole("alertdialog");
		await expect(toast).toContainText(DISASTER_EVENT_MESSAGE);
		await expect(rowFor(page, events.disasterLinked.name)).toBeVisible();
		// Pending state, not disabled: focus returns to the trigger and stays (design.md D3).
		await expect(
			rowFor(page, events.disasterLinked.name).getByRole("button", {
				name: "Delete",
			}),
		).toBeFocused();
		await expect(page).toHaveURL(/\/en\/he-preview\?pageSize=50$/);
		expect(await hazardousEventExists(events.disasterLinked.id)).toBe(true);
	});

	test("a DEF-044 outgoing legacy parent link shows the caused-by message, not an error page", async ({
		page,
	}) => {
		await openList(page);

		await confirmDelete(page, events.legacyParent.name);

		await expect(page.getByRole("alertdialog")).toContainText(
			CAUSED_BY_MESSAGE,
		);
		await expect(page.getByRole("grid")).toBeVisible();
		await expect(rowFor(page, events.legacyParent.name)).toBeVisible();
		expect(await hazardousEventExists(events.legacyParent.id)).toBe(true);
	});

	test("an event deleted elsewhere after the list loaded shows not-found and its stale row disappears", async ({
		page,
	}) => {
		await openList(page);
		await expect(rowFor(page, events.vanishing.name)).toBeVisible();
		await dr.transaction(async (tx) => {
			await tx
				.delete(workflowInstanceTable)
				.where(eq(workflowInstanceTable.entityId, events.vanishing.id));
			await tx
				.delete(hazardousEventTable)
				.where(eq(hazardousEventTable.id, events.vanishing.id));
			await tx.delete(eventTable).where(eq(eventTable.id, events.vanishing.id));
		});

		await confirmDelete(page, events.vanishing.name);

		await expect(page.getByRole("alertdialog")).toContainText(
			NOT_FOUND_MESSAGE,
		);
		await expect(rowFor(page, events.vanishing.name)).toHaveCount(0);
		await expect(page.getByRole("grid")).toBeVisible();
	});

	// Last: it changes the shared test user's role, restored in finally.
	test("a role lost after the list loaded shows the permission toast, not the error boundary, and the row's Delete control refreshes away", async ({
		page,
	}) => {
		await openList(page);
		await expect(rowFor(page, events.roleFlipped.name)).toBeVisible();
		await dr
			.update(userCountryAccountsTable)
			.set({ role: "data-viewer" })
			.where(eq(userCountryAccountsTable.userId, userId));
		try {
			await confirmDelete(page, events.roleFlipped.name);

			await expect(page.getByRole("alertdialog")).toContainText(
				FORBIDDEN_MESSAGE,
			);
			await expect(page.getByRole("grid")).toBeVisible();
			await expect(
				rowFor(page, events.roleFlipped.name).getByRole("button", {
					name: "Delete",
				}),
			).toHaveCount(0);
			expect(await hazardousEventExists(events.roleFlipped.id)).toBe(true);
		} finally {
			await dr
				.update(userCountryAccountsTable)
				.set({ role: "admin" })
				.where(eq(userCountryAccountsTable.userId, userId));
		}
	});
});
