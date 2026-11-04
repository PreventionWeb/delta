import { test, expect } from "@playwright/test";
import { randomUUID } from "crypto";
import { eq, inArray } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { userTable } from "~/drizzle/schema";
import { userCountryAccountsTable } from "~/drizzle/schema/userCountryAccountsTable";
import { eventTable } from "~/drizzle/schema/eventTable";
import { hazardousEventTable } from "~/drizzle/schema/hazardousEventTable";
import { workflowInstanceTable } from "~/domains/validation-workflow/infrastructure/workflowInstanceTable";
import { dr, initDB } from "~/db.server";
import {
	seedCountryAccount,
	seedSpecificHazard,
} from "../../integration/db/models/hazardousEventTestHelpers";

const password = "Password123!";
const dataCollectorEmail = `e2e_he_form_collector_${Date.now()}@test.com`;
const adminEmail = `e2e_he_form_admin_${Date.now()}@test.com`;
const validatorEmail = `e2e_he_form_validator_${Date.now()}@test.com`;
const dataCollectorId = randomUUID();
const adminId = randomUUID();
const validatorId = randomUUID();
let countryAccountId: string;
let specificHazardId: string;
const parentEventId = randomUUID();

test.beforeAll(async () => {
	initDB();
	const passwordHash = bcrypt.hashSync(password, 10);

	countryAccountId = await seedCountryAccount();
	specificHazardId = await seedSpecificHazard();

	await dr.insert(userTable).values([
		{
			id: dataCollectorId,
			email: dataCollectorEmail,
			password: passwordHash,
			emailVerified: true,
		},
		{
			id: adminId,
			email: adminEmail,
			password: passwordHash,
			emailVerified: true,
		},
		{
			id: validatorId,
			email: validatorEmail,
			password: passwordHash,
			emailVerified: true,
			// MultiSelect's own optionLabel is "firstName" (matches legacy's "name" field) -- a
			// blank firstName renders no visible option text to select against.
			firstName: "E2E Validator",
		},
	]);
	await dr.insert(userCountryAccountsTable).values([
		{
			userId: dataCollectorId,
			countryAccountsId: countryAccountId,
			role: "data-collector",
		},
		{ userId: adminId, countryAccountsId: countryAccountId, role: "admin" },
		{
			userId: validatorId,
			countryAccountsId: countryAccountId,
			role: "data-validator",
		},
	]);

	await dr.insert(eventTable).values({ id: parentEventId });
	await dr.insert(hazardousEventTable).values({
		id: parentEventId,
		countryAccountsId: countryAccountId,
		specificHazardId,
		startDate: "2025-01-01",
		description: "E2E parent event",
		specificHazardLocalName: "E2E parent hazard",
	});
	await dr.insert(workflowInstanceTable).values({
		entityId: parentEventId,
		entityType: "HE",
		status: "DRAFT",
	});
});

test.afterAll(async () => {
	await dr.transaction(async (tx) => {
		// Delete all tenant workflow instances, not just the parent's -- tests create their
		// own HE records too, and their instances FK to the users deleted below.
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
			.delete(userCountryAccountsTable)
			.where(eq(userCountryAccountsTable.countryAccountsId, countryAccountId));
		await tx.delete(userTable).where(eq(userTable.id, dataCollectorId));
		await tx.delete(userTable).where(eq(userTable.id, adminId));
		await tx.delete(userTable).where(eq(userTable.id, validatorId));
	});
});

async function login(page: import("@playwright/test").Page, email: string) {
	await page.goto("/en/user/login");
	await page.fill('input[name="email"]', email);
	await page.fill('input[name="password"]', password);
	await Promise.all([
		page.waitForURL((url) => !url.href.includes("/user/login"), {
			timeout: 30000,
		}),
		page.getByRole("button", { name: "Sign in" }).click(),
	]);
}

test.describe("Hazardous event create/edit form (6c)", () => {
	test("a plain draft save redirects to the detail page", async ({ page }) => {
		await login(page, dataCollectorEmail);
		await page.goto("/en/he-preview/new");

		await page.getByLabel("Hazard type").selectOption({ index: 1 });
		await page.getByLabel("Hazard cluster").selectOption({ index: 1 });
		await page.selectOption("#specificHazardId", { index: 1 });
		await page.fill("#startDate", "2026-01-01");
		await page.fill("#endDate", "2026-01-02");
		await page.fill("#recordOriginator", "E2E originator");

		await page.getByRole("button", { name: "Save or submit" }).click();
		await page.getByRole("radio", { name: "Save as draft" }).click();
		await Promise.all([
			page.waitForURL(/\/en\/he-preview\/[0-9a-f-]+$/),
			page.getByRole("button", { name: "Save as draft" }).click(),
		]);

		await expect(page).toHaveURL(/\/en\/he-preview\/[0-9a-f-]+$/);
	});

	test("the 'Save or submit' button stays disabled for an empty form, blocking submission client-side without navigating away (design.md Decision 18 -- supersedes this test's own former modal-click flow, which the disabled button now preempts entirely)", async ({
		page,
	}) => {
		await login(page, dataCollectorEmail);
		await page.goto("/en/he-preview/new");

		// Every required field (specificHazardId, startDate, endDate, recordOriginator) is empty
		// -- the button is disabled on load, so it can't even be clicked to open the modal
		// (Playwright's own actionability check would time out on a disabled element).
		await expect(
			page.getByRole("button", { name: "Save or submit" }),
		).toBeDisabled();

		await expect(page).toHaveURL(/\/en\/he-preview\/new$/);
		const isValid = await page
			.locator("#recordOriginator")
			.evaluate((el: HTMLInputElement) => el.validity.valid);
		expect(isValid).toBe(false);
	});

	test("the 'Save or submit' button tracks live form validity as required fields are filled in and cleared, with no page reload (design.md Decision 18)", async ({
		page,
	}) => {
		await login(page, dataCollectorEmail);
		await page.goto("/en/he-preview/new");

		const saveOrSubmit = page.getByRole("button", { name: "Save or submit" });
		await expect(saveOrSubmit).toBeDisabled();

		await page.getByLabel("Hazard type").selectOption({ index: 1 });
		await page.getByLabel("Hazard cluster").selectOption({ index: 1 });
		await page.selectOption("#specificHazardId", { index: 1 });
		await expect(saveOrSubmit).toBeDisabled();

		await page.fill("#startDate", "2026-01-01");
		await expect(saveOrSubmit).toBeDisabled();

		// Authoritative real-browser proof for the type="date" control specifically -- design.md
		// Decision 18 flags jsdom's own constraint-validation support for type="date" as
		// historically inconsistent across versions.
		await page.fill("#endDate", "2026-01-02");
		await expect(saveOrSubmit).toBeDisabled();

		// Last required field -- the button only becomes enabled once this one lands too.
		await page.fill("#recordOriginator", "E2E originator");
		await expect(saveOrSubmit).toBeEnabled();

		// Clearing a required field again disables it live, no reload.
		await page.fill("#endDate", "");
		await expect(saveOrSubmit).toBeDisabled();
	});

	test("selecting a specific hazard after filling other fields first still works (design.md Decision 20 -- confirmed live-browser bug: an un-memoized HazardousEventHazardPicker re-rendered on every unrelated keystroke, corrupting the native <select>'s own click/keyboard state while 'Specific hazard' sat unselected)", async ({
		page,
	}) => {
		await login(page, dataCollectorEmail);
		await page.goto("/en/he-preview/new");

		const saveOrSubmit = page.getByRole("button", { name: "Save or submit" });

		// Exact repro order from design.md Decision 20: type -> cluster -> leave "Specific
		// hazard" unselected -> fill the other required fields -> only then return to it.
		await page.getByLabel("Hazard type").selectOption({ index: 1 });
		await page.getByLabel("Hazard cluster").selectOption({ index: 1 });
		await page.fill("#startDate", "2026-01-01");
		await page.fill("#endDate", "2026-01-02");
		await page.fill("#recordOriginator", "E2E originator");
		await expect(saveOrSubmit).toBeDisabled();

		// Real keyboard-driven native-select navigation, not Playwright's selectOption() --
		// selectOption() sets the DOM value via a script + dispatched change event, the one
		// interaction method design.md Decision 20 already confirmed was unaffected by the bug.
		// A focused, real ArrowDown keypress exercises the browser's own native type-ahead/
		// arrow-key selection bookkeeping -- the mechanism the bug actually corrupted.
		const specificHazard = page.locator("#specificHazardId");
		await specificHazard.focus();
		await specificHazard.press("ArrowDown");

		await expect(specificHazard).not.toHaveValue("");
		await expect(saveOrSubmit).toBeEnabled();
	});

	test("submit-validation with a validator selected composes both use cases (admin session, parity with design.md Decision 9)", async ({
		page,
	}) => {
		await login(page, adminEmail);
		await page.goto("/en/he-preview/new");

		await page.getByLabel("Hazard type").selectOption({ index: 1 });
		await page.getByLabel("Hazard cluster").selectOption({ index: 1 });
		await page.selectOption("#specificHazardId", { index: 1 });
		await page.fill("#startDate", "2026-01-01");
		await page.fill("#endDate", "2026-01-02");
		await page.fill("#recordOriginator", "E2E originator");

		const modal = page.getByRole("radiogroup", { name: "Save or submit" });
		await page.getByRole("button", { name: "Save or submit" }).click();
		await modal.getByRole("radio", { name: "Submit for validation" }).click();
		// PrimeReact's MultiSelect renders a visible label div over its own hidden combobox input
		// -- click the visible label instead of the input it occludes.
		await modal.locator(".p-multiselect-label").click();
		await page.getByText("E2E Validator", { exact: false }).first().click();
		// Multi-select panel stays open after picking and covers the footer button -- click
		// inert dialog text outside the panel instead (Escape would dismiss the whole dialog).
		await page
			.getByText("Decide what you'd like to do", { exact: false })
			.click();

		await Promise.all([
			page.waitForURL(/\/en\/he-preview\/[0-9a-f-]+$/),
			page.getByRole("button", { name: "Submit for validation" }).click(),
		]);
	});

	test("an admin direct-publish save composes direct-validate and direct-publish (admin-only card, design.md Decision 9)", async ({
		page,
	}) => {
		await login(page, adminEmail);
		await page.goto("/en/he-preview/new");

		await page.getByLabel("Hazard type").selectOption({ index: 1 });
		await page.getByLabel("Hazard cluster").selectOption({ index: 1 });
		await page.selectOption("#specificHazardId", { index: 1 });
		await page.fill("#startDate", "2026-01-01");
		await page.fill("#endDate", "2026-01-02");
		await page.fill("#recordOriginator", "E2E originator");

		const modal = page.getByRole("radiogroup", { name: "Save or submit" });
		await page.getByRole("button", { name: "Save or submit" }).click();
		await modal.getByRole("radio", { name: "Validate" }).click();
		// PrimeReact's Checkbox doesn't expose an accessible name for its own label text -- its id
		// (set in the component) is the reliable handle.
		await page.locator("#publish-checkbox").click();

		await Promise.all([
			page.waitForURL(/\/en\/he-preview\/[0-9a-f-]+$/),
			page.getByRole("button", { name: "Validate and publish record" }).click(),
		]);
	});

	test("the parent-picker flow updates the form's parent field end to end", async ({
		page,
		context,
	}) => {
		// Flaky as the last of 5 sequential tests in one worker (popup window.open() timing
		// degrades under cumulative load) though reliable in isolation -- tripled timeout, not a
		// logic fix.
		test.slow();
		await login(page, dataCollectorEmail);
		await page.goto("/en/he-preview/new");

		const [popup] = await Promise.all([
			context.waitForEvent("page"),
			page.getByRole("button", { name: "Change" }).click(),
		]);
		await popup.waitForLoadState("networkidle");
		// Keyboard activation, not a pointer click -- the Table's gridcell focus-management
		// intercepts a plain click. Tab-counting to the row was flaky (filter bar adds an
		// unpredictable tab-stop count); .focus() targets the row directly instead, then the
		// bounded ArrowRight cell-walk (he-preview.spec.ts's precedent) reaches the button.
		const selectButtons = popup.getByRole("button", { name: "Select" });
		await expect(selectButtons.first()).toBeVisible();
		// Derived from the button's own row ancestor, not getByRole("row").first() -- the
		// TableHeader row also carries role="row", so that would sometimes grab the header
		// instead of a data row (root cause of this test's earlier intermittent failures).
		await selectButtons
			.first()
			.locator("xpath=ancestor::*[@role='row']")
			.first()
			.focus();
		for (let i = 0; i < 10; i++) {
			if (
				await selectButtons
					.first()
					.evaluate((el) => el === document.activeElement)
			) {
				break;
			}
			await popup.keyboard.press("ArrowRight");
		}
		// Auto-retrying guard -- without it, Enter can fire before focus has actually settled.
		await expect(selectButtons.first()).toBeFocused();
		await popup.keyboard.press("Enter");
		// Hardcoded, not the default timeout -- test.slow()'s 3x multiplier doesn't apply to an
		// explicit per-call timeout, so this needs its own margin under load.
		await popup.waitForEvent("close", { timeout: 20000 });

		// The "-" placeholder is replaced by a real link once the postMessage round-trip lands
		// (taxonomy name is randomly seeded per run, so this checks the mechanism, not a string).
		const parentField = page.locator("#causeId").locator("..");
		await expect(parentField.getByRole("link")).toBeVisible();
		await expect(parentField.getByText("-", { exact: true })).toHaveCount(0);
	});
});
