import { expect, test } from "@playwright/test";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { dr, initDB } from "~/db.server";
import { apiKeyTable, userTable } from "~/drizzle/schema";
import { userCountryAccountsTable } from "~/drizzle/schema/userCountryAccountsTable";
import { seedCountryAccount } from "../integration/db/models/hazardousEventTestHelpers";
import {
	assertFocusNotObscured,
	assertTargetSizesAndLabels,
	runWcag22A11yCheck,
} from "./helpers/a11y";
import { capturePrototypeStateScreenshots } from "./helpers/prototype-evidence";

const adminEmail = `e2e_apikeys_admin_${Date.now()}@test.com`;
const adminUserId = randomUUID();
let countryAccountId: string;

test.beforeAll(async () => {
	if (process.env.PLAYWRIGHT_DATABASE_URL) {
		process.env.DATABASE_URL = process.env.PLAYWRIGHT_DATABASE_URL;
	}
	initDB();
	const passwordHash = bcrypt.hashSync("Password123!", 10);
	countryAccountId = await seedCountryAccount();

	await dr.insert(userTable).values({
		id: adminUserId,
		firstName: "Anna",
		lastName: "Charles",
		email: adminEmail,
		password: passwordHash,
		emailVerified: true,
	});

	await dr.insert(userCountryAccountsTable).values({
		userId: adminUserId,
		countryAccountsId: countryAccountId,
		role: "admin",
		isPrimaryAdmin: true,
		organizationId: null,
	});

	await dr.insert(apiKeyTable).values({
		name: "National statistics sync",
		secret: `dk_7f3a9c2e41b84d06a5e2c97b10f3d8aa_${Date.now()}`,
		managedByUserId: adminUserId,
		countryAccountsId: countryAccountId,
	});
});

test.afterAll(async () => {
	await dr
		.delete(apiKeyTable)
		.where(eq(apiKeyTable.countryAccountsId, countryAccountId));
	await dr.delete(userTable).where(eq(userTable.id, adminUserId));
});

async function loginAsAdmin(page: import("@playwright/test").Page) {
	await page.goto("/en/user/login");
	await page.fill('input[name="email"]', adminEmail);
	await page.fill('input[name="password"]', "Password123!");
	await page.click('button[type="submit"]');
	await page.waitForURL((url) => !url.pathname.includes("/user/login"));
}

test.describe("API keys v0.7.2 E2E & WCAG 2.2 AA (Gate 9b/9c)", () => {
	test("passes axe-core WCAG 2.2 AA, keyboard/modal rules, full CRUD + reveal flow, and captures viewport screenshots", async ({
		page,
	}) => {
		await loginAsAdmin(page);
		await page.goto("/en/settings/api-key/");

		const main = page.locator("main");
		await expect(
			main.getByRole("heading", { level: 1, name: "API keys" }),
		).toBeVisible();
		await expect(main.getByText("National statistics sync")).toBeVisible();
		await expect(main.getByText("dk_7f…")).toBeVisible();

		// Gate 9b: Automated WCAG 2.0/2.1/2.2 A & AA axe-core check on <main>
		await runWcag22A11yCheck(page, { scope: "main" });
		await assertTargetSizesAndLabels(page, { scope: "main" });
		await assertFocusNotObscured(page, "main");

		// Add API key dialog: non-backdrop dismiss + duplicate validation + create + reveal
		await main.getByRole("button", { name: "Add API key" }).click();
		const addDialog = page.getByRole("dialog", { name: "Add API key" });
		await expect(addDialog).toBeVisible();
		await runWcag22A11yCheck(page, { scope: '[role="dialog"]' });

		// Clicking outside must NOT dismiss
		await page.mouse.click(5, 5);
		await expect(addDialog).toBeVisible();

		// Duplicate validation
		await addDialog.getByLabel(/Name/).fill("national statistics sync");
		await addDialog.getByRole("button", { name: "Create key" }).click();
		await expect(
			addDialog.getByText("A key with this name already exists."),
		).toBeVisible();

		// Create unique key -> opens reveal dialog
		await addDialog.getByLabel(/Name/).fill("Red Cross field app");
		await addDialog.getByRole("button", { name: "Create key" }).click();

		const revealDialog = page.getByRole("dialog", { name: "API key created" });
		await expect(revealDialog).toBeVisible();
		await expect(
			revealDialog.getByText("Red Cross field app is ready to use"),
		).toBeVisible();
		await runWcag22A11yCheck(page, { scope: '[role="dialog"]' });
		await revealDialog.getByRole("button", { name: "Done" }).click();
		await expect(revealDialog).toBeHidden();

		// Rename the new key
		await main
			.getByRole("button", { name: "Rename Red Cross field app" })
			.click();
		const renameDialog = page.getByRole("dialog", { name: "Rename API key" });
		await expect(renameDialog).toBeVisible();
		await renameDialog.getByLabel(/Name/).fill("IHSI field app");
		await renameDialog.getByRole("button", { name: "Save changes" }).click();
		await expect(renameDialog).toBeHidden();
		await expect(page.getByText("Changes saved.")).toBeVisible();

		// Delete the renamed key
		await main.getByRole("button", { name: "Delete IHSI field app" }).click();
		const deleteDialog = page.getByRole("alertdialog", {
			name: "Delete API key",
		});
		await expect(deleteDialog).toBeVisible();
		await deleteDialog.getByRole("button", { name: "Delete key" }).click();
		await expect(deleteDialog).toBeHidden();
		await expect(page.getByText("IHSI field app was deleted.")).toBeVisible();

		// Gate 9c: Capture responsive screenshots (375, 768, 1280)
		await capturePrototypeStateScreenshots(page, {
			changeName: "api-keys-redesign",
			routeUrl: "/en/settings/api-key/",
			routeLabel: "api-keys",
			state: "default",
		});
	});
});
