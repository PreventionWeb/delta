import { test, expect } from "@playwright/test";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { userTable } from "~/drizzle/schema";
import { userCountryAccountsTable } from "~/drizzle/schema/userCountryAccountsTable";
import { eventTable } from "~/drizzle/schema/eventTable";
import { hazardousEventTable } from "~/drizzle/schema/hazardousEventTable";
import { workflowInstanceTable } from "~/domains/validation-workflow/infrastructure/workflowInstanceTable";
import { dr, initDB } from "~/db.server";
// Plain Drizzle table inserts, not any application/infrastructure class -- Playwright's esbuild
// transform can't parse NestJS parameter decorators (notices.spec.ts's own precedent).
import {
	seedCountryAccount,
	seedSpecificHazard,
} from "../../integration/db/models/hazardousEventTestHelpers";

const testEmail = `e2e_he_preview_${Date.now()}@test.com`;
const userId = randomUUID();
let countryAccountId: string;
let specificHazardId: string;
const eventWithWorkflowId = randomUUID();
const eventWithoutWorkflowId = randomUUID();

test.beforeAll(async () => {
	initDB();
	const passwordHash = bcrypt.hashSync("Password123!", 10);

	countryAccountId = await seedCountryAccount();
	specificHazardId = await seedSpecificHazard();

	await dr.insert(userTable).values({
		id: userId,
		email: testEmail,
		password: passwordHash,
		emailVerified: true,
	});
	await dr.insert(userCountryAccountsTable).values({
		userId,
		countryAccountsId: countryAccountId,
		role: "data-viewer",
		isPrimaryAdmin: false,
	});

	// Event WITH a WorkflowInstance -- the normal, post-Phase-M state.
	await dr.insert(eventTable).values({ id: eventWithWorkflowId });
	await dr.insert(hazardousEventTable).values({
		id: eventWithWorkflowId,
		countryAccountsId: countryAccountId,
		specificHazardId,
		startDate: "2026-01-01",
		description: "E2E event with workflow",
		specificHazardLocalName: "E2E hazard with workflow",
	});
	await dr.insert(workflowInstanceTable).values({
		entityId: eventWithWorkflowId,
		entityType: "HE",
		status: "APPROVED",
	});

	// Event WITHOUT a WorkflowInstance -- DEF-031's degraded state.
	await dr.insert(eventTable).values({ id: eventWithoutWorkflowId });
	await dr.insert(hazardousEventTable).values({
		id: eventWithoutWorkflowId,
		countryAccountsId: countryAccountId,
		specificHazardId,
		startDate: "2026-01-01",
		description: "E2E seeded event",
		specificHazardLocalName: "E2E hazard",
	});
});

test.afterAll(async () => {
	await dr.transaction(async (tx) => {
		await tx
			.delete(workflowInstanceTable)
			.where(eq(workflowInstanceTable.entityId, eventWithWorkflowId));
		await tx
			.delete(hazardousEventTable)
			.where(eq(hazardousEventTable.countryAccountsId, countryAccountId));
		await tx.delete(eventTable).where(eq(eventTable.id, eventWithWorkflowId));
		await tx
			.delete(eventTable)
			.where(eq(eventTable.id, eventWithoutWorkflowId));
		await tx
			.delete(userCountryAccountsTable)
			.where(eq(userCountryAccountsTable.countryAccountsId, countryAccountId));
		await tx.delete(userTable).where(eq(userTable.id, userId));
	});
});

async function login(page: import("@playwright/test").Page) {
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

test.describe("Hazardous event preview routes (6a)", () => {
	test("list page renders the seeded events for an authenticated user with ViewData", async ({
		page,
	}) => {
		await login(page);
		await page.goto("/en/he-preview");

		// role="grid", not "table" -- React Aria's own pattern, see Table.tsx's comment.
		await expect(page.getByRole("grid")).toBeVisible();
		await expect(page.getByText("E2E hazard with workflow")).toBeVisible();
		await expect(page.getByText("E2E hazard", { exact: true })).toBeVisible();
	});

	test("detail page renders a known event id with a WorkflowInstance", async ({
		page,
	}) => {
		await login(page);
		await page.goto(`/en/he-preview/${eventWithWorkflowId}`);

		await expect(page.getByText("E2E event with workflow")).toBeVisible();
	});

	test("detail page renders a known event id with no WorkflowInstance, showing the DEF-031 missing-status indicator rather than failing", async ({
		page,
	}) => {
		await login(page);
		await page.goto(`/en/he-preview/${eventWithoutWorkflowId}`);

		await expect(page.getByText("E2E seeded event")).toBeVisible();
		await expect(page.getByText("Not yet determined")).toBeVisible();
	});

	test("unauthenticated request to the list route redirects to login", async ({
		page,
	}) => {
		await page.goto("/en/he-preview");

		await expect(page).toHaveURL(/\/en\/user\/login/);
	});

	test("list→detail link actually navigates to the correct event", async ({
		page,
	}) => {
		await login(page);
		await page.goto("/en/he-preview");
		await page.waitForLoadState("networkidle");

		await page.getByRole("link", { name: "View" }).first().click();

		await expect(page).toHaveURL(/\/en\/he-preview\/[0-9a-f-]+$/);
	});

	// Confirmed by observation (design.md Risk): Tab reaches the row, not the link directly;
	// ArrowRight moves cell-by-cell from there -- same cause as the accepted role="grid" finding.
	test("the row action link is reachable via the grid's own ArrowRight cell navigation and Enter-activatable", async ({
		page,
	}) => {
		await login(page);
		await page.goto("/en/he-preview");
		await page.waitForLoadState("networkidle");

		const viewLinks = page.getByRole("link", { name: "View" });
		expect(await viewLinks.count()).toBeGreaterThan(0);

		// Tab until the grid row itself gets focus (header nav has several stops first), then
		// ArrowRight cell-by-cell until the actions cell's own link is reached -- bounded by the
		// real column count rather than a hardcoded number, so a future column change doesn't
		// silently desync this test (11.2's own column-count change broke the previous hardcode).
		for (let i = 0; i < 20; i++) {
			await page.keyboard.press("Tab");
			if (
				(await page.evaluate(() =>
					document.activeElement?.getAttribute("role"),
				)) === "row"
			) {
				break;
			}
		}
		for (let i = 0; i < 10; i++) {
			if (
				await viewLinks.first().evaluate((el) => el === document.activeElement)
			) {
				break;
			}
			await page.keyboard.press("ArrowRight");
		}
		await expect(viewLinks.first()).toBeFocused();

		await Promise.all([
			page.waitForURL(/\/en\/he-preview\/[0-9a-f-]+$/),
			page.keyboard.press("Enter"),
		]);
	});
});
