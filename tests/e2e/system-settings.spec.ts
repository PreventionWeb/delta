import { expect, test } from "@playwright/test";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { dr, initDB } from "~/db.server";
import {
	instanceSystemSettingsTable,
	userCountryAccountsTable,
	userTable,
} from "~/drizzle/schema";
import { seedCountryAccount } from "../integration/db/models/hazardousEventTestHelpers";
import {
	assertFocusNotObscured,
	assertTargetSizesAndLabels,
	runWcag22A11yCheck,
} from "./helpers/a11y";
import { capturePrototypeStateScreenshots } from "./helpers/prototype-evidence";

const adminEmail = `e2e_system_admin_${Date.now()}@test.com`;
const adminUserId = randomUUID();
let countryAccountId: string;

test.beforeAll(async () => {
	if (process.env.PLAYWRIGHT_DATABASE_URL) {
		process.env.DATABASE_URL = process.env.PLAYWRIGHT_DATABASE_URL;
	}
	initDB();
	const passwordHash = bcrypt.hashSync("Password123!", 10);
	countryAccountId = await seedCountryAccount();

	await dr
		.update(instanceSystemSettingsTable)
		.set({
			websiteName: "DGPC Haiti",
			language: "en",
			currencyCode: "HTG",
			totpIssuer: "DELTA Resilience Haiti",
		})
		.where(eq(instanceSystemSettingsTable.countryAccountsId, countryAccountId));

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
	});
});

test.afterAll(async () => {
	await dr.delete(userTable).where(eq(userTable.id, adminUserId));
});

async function loginAsAdmin(page: import("@playwright/test").Page) {
	await page.goto("/en/user/login");
	await page.fill('input[name="email"]', adminEmail);
	await page.fill('input[name="password"]', "Password123!");
	await page.click('button[type="submit"]');
	await page.waitForURL((url) => !url.pathname.includes("/user/login"));
}

test.describe("System settings v0.7.3 E2E & WCAG 2.2 AA (Gate 9b/9c)", () => {
	test("passes axe-core WCAG 2.2 AA, keyboard/modal rules, edit + validation + toast flow, and captures viewport screenshots", async ({
		page,
	}) => {
		await loginAsAdmin(page);
		await page.goto("/en/settings/system");

		const main = page.locator("main");
		await expect(
			main.getByRole("heading", { level: 1, name: "System settings" }),
		).toBeVisible();
		await expect(
			main.getByRole("heading", { level: 2, name: "Instance" }),
		).toBeVisible();
		await expect(
			main.getByRole("heading", { level: 2, name: "Country" }),
		).toBeVisible();
		await expect(
			main.getByRole("heading", { level: 2, name: "Email" }),
		).toBeVisible();
		await expect(
			main.getByRole("heading", { level: 2, name: "Software" }),
		).toBeVisible();

		// Gate 9b: Automated WCAG 2.0/2.1/2.2 A & AA axe-core check on <main>
		await runWcag22A11yCheck(page, { scope: "main" });
		await assertTargetSizesAndLabels(page, { scope: "main" });
		await assertFocusNotObscured(page, "main");

		// Open Edit instance settings dialog
		await main.getByRole("button", { name: "Edit" }).click();
		const dialog = page.getByRole("dialog", {
			name: "Edit instance settings",
		});
		await expect(dialog).toBeVisible();
		await runWcag22A11yCheck(page, { scope: '[role="dialog"]' });

		// Clicking backdrop must NOT close
		await page.mouse.click(5, 5);
		await expect(dialog).toBeVisible();

		// Empty validation & clear on edit
		const nameInput = dialog.getByLabel("Instance name");
		await nameInput.fill("");
		await dialog.getByRole("button", { name: "Save changes" }).click();
		await expect(dialog.getByText("Enter an instance name.")).toBeVisible();

		await nameInput.fill("DGPC Haiti Updated");
		await expect(dialog.getByText("Enter an instance name.")).toBeHidden();

		// Save changes -> closes modal, updates card, shows toast
		await dialog.getByRole("button", { name: "Save changes" }).click();
		await expect(dialog).toBeHidden();
		await expect(
			page.getByText("Settings saved. They apply the next time you sign in."),
		).toBeVisible();
		await expect(main.getByText("DGPC Haiti Updated")).toBeVisible();

		// Escape closes dialog and restores focus
		await main.getByRole("button", { name: "Edit" }).click();
		await expect(dialog).toBeVisible();
		await page.keyboard.press("Escape");
		await expect(dialog).toBeHidden();
		await expect(main.getByRole("button", { name: "Edit" })).toBeFocused();

		// Gate 9c: Capture responsive screenshots (375, 768, 1280)
		await capturePrototypeStateScreenshots(page, {
			changeName: "system-settings-redesign",
			routeUrl: "/en/settings/system",
			routeLabel: "system-settings",
			state: "default",
		});
	});
});
