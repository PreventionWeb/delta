import { expect, test } from "@playwright/test";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { dr, initDB } from "~/db.server";
import { userTable } from "~/drizzle/schema";
import { userCountryAccountsTable } from "~/drizzle/schema/userCountryAccountsTable";
import { seedCountryAccount } from "../integration/db/models/hazardousEventTestHelpers";
import {
	assertFocusNotObscured,
	assertTargetSizesAndLabels,
	runWcag22A11yCheck,
	verifyKeyboardSequence,
} from "./helpers/a11y";
import { capturePrototypeStateScreenshots } from "./helpers/prototype-evidence";

const adminEmail = `e2e_sectors_admin_${Date.now()}@test.com`;
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
		firstName: "Sectors",
		lastName: "Admin",
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

test.describe("Sectors v0.7.3 E2E & WCAG 2.2 AA (Gate 9b/9c)", () => {
	test("passes axe-core WCAG 2.2 AA, keyboard/search/expand-collapse rules, and captures viewport screenshots", async ({
		page,
	}) => {
		await loginAsAdmin(page);
		await page.goto("/en/settings/sectors");

		const main = page.locator("main");
		await expect(
			main.getByRole("heading", { level: 1, name: "Sectors" }),
		).toBeVisible();
		await expect(main.getByRole("tablist")).toHaveCount(0);

		// Gate 9b: Automated WCAG 2.0/2.1/2.2 A & AA axe-core check on <main>
		await runWcag22A11yCheck(page, { scope: "main" });
		await assertTargetSizesAndLabels(page, { scope: "main" });
		await assertFocusNotObscured(page, "main");

		// Toolbar interactions: keyboard navigation, Expand all, Collapse all, Search
		const expandAll = main.getByRole("button", { name: "Expand all" });
		const collapseAll = main.getByRole("button", { name: "Collapse all" });
		const searchBox = main.getByRole("searchbox", { name: "Search sectors" });

		await searchBox.focus();
		await verifyKeyboardSequence(
			page,
			[
				{ key: "Tab", description: "focus Expand all" },
				{ key: "Tab", description: "focus Collapse all" },
				{ key: "Tab", description: "focus Sectors tree" },
				{ key: "ArrowDown", description: "move to next sector row" },
				{ key: "ArrowLeft", description: "collapse or move to parent" },
				{ key: "ArrowRight", description: "expand or move to child" },
			],
			"sectors",
		);

		await expandAll.click();
		await collapseAll.click();
		await searchBox.fill("zzz_no_sector_match");
		await expect(expandAll).toBeDisabled();
		await expect(collapseAll).toBeDisabled();
		await expect(
			main.getByText('No sectors match "zzz_no_sector_match".'),
		).toBeVisible();
		await searchBox.fill("");
		await expect(expandAll).toBeEnabled();

		// Gate 9c: Capture responsive screenshots (375, 768, 1280)
		await capturePrototypeStateScreenshots(page, {
			changeName: "sectors-redesign",
			routeUrl: "/en/settings/sectors",
			routeLabel: "sectors",
			state: "default",
		});
	});
});
