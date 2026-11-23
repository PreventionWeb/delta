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

const adminEmail = `e2e_access_admin_${Date.now()}@test.com`;
const pendingEmail = `e2e_access_pending_${Date.now()}@test.com`;
const adminUserId = randomUUID();
const pendingUserId = randomUUID();
const orgId = randomUUID();
let countryAccountId: string;

test.beforeAll(async () => {
	if (process.env.PLAYWRIGHT_DATABASE_URL) {
		process.env.DATABASE_URL = process.env.PLAYWRIGHT_DATABASE_URL;
	}
	initDB();
	const passwordHash = bcrypt.hashSync("Password123!", 10);
	countryAccountId = await seedCountryAccount();

	await dr.insert(organizationTable).values({
		id: orgId,
		name: "DGPC Haiti",
		countryAccountsId: countryAccountId,
	});

	await dr.insert(userTable).values([
		{
			id: adminUserId,
			firstName: "Marie",
			lastName: "Joseph",
			email: adminEmail,
			password: passwordHash,
			emailVerified: true,
		},
		{
			id: pendingUserId,
			firstName: "",
			lastName: "",
			email: pendingEmail,
			inviteCode: "e2e-invite-code",
			emailVerified: false,
		},
	]);

	await dr.insert(userCountryAccountsTable).values([
		{
			userId: adminUserId,
			countryAccountsId: countryAccountId,
			role: "admin",
			isPrimaryAdmin: true,
			organizationId: orgId,
		},
		{
			userId: pendingUserId,
			countryAccountsId: countryAccountId,
			role: "data-collector",
			isPrimaryAdmin: false,
			organizationId: null,
		},
	]);
});

test.afterAll(async () => {
	await dr.delete(userTable).where(eq(userTable.id, adminUserId));
	await dr.delete(userTable).where(eq(userTable.id, pendingUserId));
	await dr.delete(organizationTable).where(eq(organizationTable.id, orgId));
});

async function loginAsAdmin(page: import("@playwright/test").Page) {
	await page.goto("/en/user/login");
	await page.fill('input[name="email"]', adminEmail);
	await page.fill('input[name="password"]', "Password123!");
	await page.click('button[type="submit"]');
	await page.waitForURL((url) => !url.pathname.includes("/user/login"));
}

test.describe("Access management v0.7.2 E2E & WCAG 2.2 AA (Gate 9b/9c)", () => {
	test("passes axe-core WCAG 2.2 AA, target sizes, keyboard modal rules, and captures viewport screenshots", async ({
		page,
	}) => {
		await loginAsAdmin(page);
		await page.goto("/en/settings/access-mgmnt/");

		const main = page.locator("main");
		await expect(
			main.getByRole("heading", { level: 1, name: "Access management" }),
		).toBeVisible();
		await expect(main.getByText("Marie Joseph")).toBeVisible();
		await expect(main.getByText(pendingEmail).first()).toBeVisible();

		// Gate 9b: Automated WCAG 2.0/2.1/2.2 A & AA axe-core check on <main>
		await runWcag22A11yCheck(page, { scope: "main" });
		await assertTargetSizesAndLabels(page, { scope: "main" });
		await assertFocusNotObscured(page, "main");

		// Modal keyboard & non-backdrop dismiss check
		await main.getByRole("button", { name: "Invite user" }).click();
		const dialog = page.getByRole("dialog", { name: "Invite user" });
		await expect(dialog).toBeVisible();
		await runWcag22A11yCheck(page, { scope: '[role="dialog"]' });

		// Clicking outside dialog must NOT close it
		await page.mouse.click(5, 5);
		await expect(dialog).toBeVisible();

		// Escape closes dialog
		await page.keyboard.press("Escape");
		await expect(dialog).toBeHidden();

		// Gate 9c: Capture responsive screenshots (375, 768, 1280)
		await capturePrototypeStateScreenshots(page, {
			changeName: "access-management-redesign",
			routeUrl: "/en/settings/access-mgmnt/",
			routeLabel: "access-management",
			state: "default",
		});
	});
});
