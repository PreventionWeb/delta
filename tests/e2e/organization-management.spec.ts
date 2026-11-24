import { expect, test } from "@playwright/test";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { dr, initDB } from "~/db.server";
import { organizationTable, userTable } from "~/drizzle/schema";
import { userCountryAccountsTable } from "~/drizzle/schema/userCountryAccountsTable";
import { seedCountryAccount } from "../integration/db/models/hazardousEventTestHelpers";
import {
	assertFocusNotObscured,
	assertTargetSizesAndLabels,
	runWcag22A11yCheck,
} from "./helpers/a11y";
import { capturePrototypeStateScreenshots } from "./helpers/prototype-evidence";

const adminEmail = `e2e_orgs_admin_${Date.now()}@test.com`;
const adminUserId = randomUUID();
const inUseOrgId = randomUUID();
const unusedOrgId = randomUUID();
let countryAccountId: string;

test.beforeAll(async () => {
	if (process.env.PLAYWRIGHT_DATABASE_URL) {
		process.env.DATABASE_URL = process.env.PLAYWRIGHT_DATABASE_URL;
	}
	initDB();
	const passwordHash = bcrypt.hashSync("Password123!", 10);
	countryAccountId = await seedCountryAccount();

	await dr.insert(organizationTable).values([
		{
			id: inUseOrgId,
			name: "DGPC Haiti",
			countryAccountsId: countryAccountId,
		},
		{
			id: unusedOrgId,
			name: "Statistics Office",
			countryAccountsId: countryAccountId,
		},
	]);

	await dr.insert(userTable).values({
		id: adminUserId,
		firstName: "Marie",
		lastName: "Joseph",
		email: adminEmail,
		password: passwordHash,
		emailVerified: true,
	});

	await dr.insert(userCountryAccountsTable).values({
		userId: adminUserId,
		countryAccountsId: countryAccountId,
		role: "admin",
		isPrimaryAdmin: true,
		organizationId: inUseOrgId,
	});
});

test.afterAll(async () => {
	await dr.delete(userTable).where(eq(userTable.id, adminUserId));
	await dr
		.delete(organizationTable)
		.where(eq(organizationTable.countryAccountsId, countryAccountId));
});

async function loginAsAdmin(page: import("@playwright/test").Page) {
	await page.goto("/en/user/login");
	await page.fill('input[name="email"]', adminEmail);
	await page.fill('input[name="password"]', "Password123!");
	await page.click('button[type="submit"]');
	await page.waitForURL((url) => !url.pathname.includes("/user/login"));
}

test.describe("Organization management v0.7.2 E2E & WCAG 2.2 AA (Gate 9b/9c)", () => {
	test("passes axe-core WCAG 2.2 AA, keyboard/modal rules, CRUD + in-use delete block, and captures viewport screenshots", async ({
		page,
	}) => {
		await loginAsAdmin(page);
		await page.goto("/en/settings/organizations/");

		const main = page.locator("main");
		await expect(
			main.getByRole("heading", { level: 1, name: "Organizations" }),
		).toBeVisible();
		await expect(main.getByText("DGPC Haiti")).toBeVisible();
		await expect(main.getByText("Statistics Office")).toBeVisible();

		// Gate 9b: Automated WCAG 2.0/2.1/2.2 A & AA axe-core check on <main>
		await runWcag22A11yCheck(page, { scope: "main" });
		await assertTargetSizesAndLabels(page, { scope: "main" });
		await assertFocusNotObscured(page, "main");

		// Add organization dialog: non-backdrop dismiss + duplicate validation + create
		await main.getByRole("button", { name: "Add organization" }).click();
		const addDialog = page.getByRole("dialog", { name: "Add organization" });
		await expect(addDialog).toBeVisible();
		await runWcag22A11yCheck(page, { scope: '[role="dialog"]' });

		// Clicking outside must NOT close
		await page.mouse.click(5, 5);
		await expect(addDialog).toBeVisible();

		// Duplicate validation
		await addDialog.getByLabel(/Name/).fill("dgpc haiti");
		await addDialog.getByRole("button", { name: "Add organization" }).click();
		await expect(
			addDialog.getByText("An organization with this name already exists."),
		).toBeVisible();

		// Create unique org
		await addDialog.getByLabel(/Name/).fill("Red Cross Haiti");
		await addDialog.getByRole("button", { name: "Add organization" }).click();
		await expect(addDialog).toBeHidden();
		await expect(page.getByText("Red Cross Haiti was added.")).toBeVisible();

		// Edit org
		await main.getByRole("button", { name: "Edit Red Cross Haiti" }).click();
		const editDialog = page.getByRole("dialog", { name: "Edit organization" });
		await expect(editDialog).toBeVisible();
		await editDialog.getByLabel(/Name/).fill("Red Cross National");
		await editDialog.getByRole("button", { name: "Save changes" }).click();
		await expect(editDialog).toBeHidden();
		await expect(page.getByText("Changes saved.")).toBeVisible();

		// In-use org (1 user) -> blocked alertdialog
		await main.getByRole("button", { name: "Delete DGPC Haiti" }).click();
		const inUseDialog = page.getByRole("alertdialog", {
			name: "This organization is in use",
		});
		await expect(inUseDialog).toBeVisible();
		await expect(inUseDialog.getByText(/has 1 user\./)).toBeVisible();
		await runWcag22A11yCheck(page, { scope: '[role="alertdialog"]' });
		await inUseDialog.getByRole("button", { name: "Close" }).first().click();
		await expect(inUseDialog).toBeHidden();

		// Delete unused org
		await main
			.getByRole("button", { name: "Delete Red Cross National" })
			.click();
		const deleteDialog = page.getByRole("alertdialog", {
			name: "Delete organization",
		});
		await expect(deleteDialog).toBeVisible();
		await deleteDialog
			.getByRole("button", { name: "Delete organization" })
			.click();
		await expect(deleteDialog).toBeHidden();
		await expect(
			page.getByText("Red Cross National was deleted."),
		).toBeVisible();

		// Gate 9c: Capture responsive screenshots (375, 768, 1280)
		await capturePrototypeStateScreenshots(page, {
			changeName: "organization-management-redesign",
			routeUrl: "/en/settings/organizations/",
			routeLabel: "organization-management",
			state: "default",
		});
	});
});
