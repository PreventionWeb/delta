import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { userTable } from "~/drizzle/schema";
import { userCountryAccountsTable } from "~/drizzle/schema/userCountryAccountsTable";
import { dr, initDB } from "~/db.server";
import { seedCountryAccount } from "../../integration/db/models/hazardousEventTestHelpers";
import { countryAccounts } from "../../integration/db/testSchema/countryAccounts";
import { countriesTable } from "../../integration/db/testSchema/countriesTable";
import {
	assertTargetSizesAndLabels,
	runWcag22A11yCheck,
	verifyKeyboardSequence,
} from "../helpers/a11y";
import {
	BREAKPOINTS,
	assertNoHorizontalOverflow,
	attachErrorCollector,
} from "../helpers/designSystemChecks";
import { capturePrototypeStateScreenshots } from "../helpers/prototype-evidence";

// Seeds a tenant, a user and their link (no hazardous events); afterAll removes all of them.
const suffix = Date.now();
const testEmail = `e2e_he_error_${suffix}@test.com`;
const userId = randomUUID();
let countryAccountId: string;

const MISSING_ID = randomUUID();
const CHANGE_NAME = "ca-he-error-boundary";
const NOT_FOUND_TITLE = "Hazardous event not found";
const UNEXPECTED_TITLE = "Something went wrong";
const COPY_BUTTON = "Copy error reference";
const BACK_LINK = "Back to Hazardous events";

test.beforeAll(async () => {
	initDB();
	countryAccountId = await seedCountryAccount();
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
});

test.afterAll(async () => {
	await dr
		.delete(userCountryAccountsTable)
		.where(eq(userCountryAccountsTable.userId, userId));
	await dr.delete(userTable).where(eq(userTable.id, userId));
	const [account] = await dr
		.delete(countryAccounts)
		.where(eq(countryAccounts.id, countryAccountId))
		.returning({ countryId: countryAccounts.countryId });
	if (account) {
		await dr
			.delete(countriesTable)
			.where(eq(countriesTable.id, account.countryId));
	}
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

/** A text/plain document POST makes the create action's request.formData() reject (D4 path). */
async function submitNonFormPost(page: Page, beforeSubmit?: () => void) {
	const lang = "en";
	await page.goto(`/${lang}/he-preview`);
	// Settles the list page so its own background fetches aren't aborted mid-flight.
	await page.waitForLoadState("networkidle");
	beforeSubmit?.();
	await Promise.all([
		page.waitForLoadState("load"),
		page.evaluate((action) => {
			const form = document.createElement("form");
			form.method = "post";
			form.enctype = "text/plain";
			form.action = action;
			const input = document.createElement("input");
			input.name = "x";
			input.value = "y";
			form.append(input);
			document.body.append(form);
			form.submit();
		}, `/${lang}/he-preview/new`),
	]);
	await expect(
		page.getByRole("heading", { level: 2, name: UNEXPECTED_TITLE }),
	).toBeVisible();
	// Lets the site header hydrate before any screenshot or assertion.
	await page.waitForLoadState("networkidle");
}

/** The page's own error status logs one resource error; anything else (e.g. hydration) fails. */
function expectNoRuntimeErrorsBeyondDocumentStatus(
	errors: string[],
	status: 404 | 500,
) {
	const marker = `status of ${status}`;
	expect(errors.filter((e) => e.includes(marker)).length).toBeLessThanOrEqual(
		1,
	);
	expect(errors.filter((e) => !e.includes(marker))).toEqual([]);
}

function alert(page: Page) {
	return page.getByRole("alert").filter({ has: page.getByRole("heading") });
}

test.describe("Hazardous events error boundary (6b)", () => {
	test.beforeEach(async ({ page }) => {
		await login(page);
	});

	test("a missing event renders the not-found state inside the app layout", async ({
		page,
	}) => {
		const runtimeErrors = attachErrorCollector(page);
		const response = await page.goto(`/en/he-preview/${MISSING_ID}`);
		await page.waitForLoadState("networkidle");

		expect(response?.status()).toBe(404);
		await expect(
			page.getByRole("heading", { level: 1, name: "Hazardous events" }),
		).toBeVisible();
		await expect(
			alert(page).getByRole("heading", { level: 2, name: NOT_FOUND_TITLE }),
		).toBeVisible();
		await expect(
			page.getByText(
				"The record does not exist or you do not have access to it.",
			),
		).toBeVisible();
		// The site header sits outside <main>; the root error page has none.
		await expect(page.locator("header:not(main header)")).toBeVisible();
		await expect(page.getByText("Return to Home")).toHaveCount(0);
		await expect(page.getByText("[object Object]")).toHaveCount(0);
		// Hydration mismatches surface as console errors.
		expectNoRuntimeErrorsBeyondDocumentStatus(runtimeErrors.errors, 404);
	});

	for (const path of ["not-a-uuid", "edit/not-a-uuid"]) {
		test(`a malformed id on /${path} is not found, with no SQL text`, async ({
			page,
		}) => {
			const response = await page.goto(`/en/he-preview/${path}`);

			expect(response?.status()).toBe(404);
			await expect(
				page.getByRole("heading", { level: 2, name: NOT_FOUND_TITLE }),
			).toBeVisible();
			const html = await page.content();
			expect(html).not.toContain("Failed query");
		});
	}

	test("the French not-found state is translated and links back in French", async ({
		page,
	}) => {
		const runtimeErrors = attachErrorCollector(page);
		const response = await page.goto(`/fr/he-preview/${MISSING_ID}`);
		await page.waitForLoadState("networkidle");

		expect(response?.status()).toBe(404);
		await expect(
			page.getByRole("heading", {
				level: 2,
				name: "Événement dangereux introuvable",
			}),
		).toBeVisible();
		await expect(
			page.getByRole("link", { name: "Retour aux événements dangereux" }),
		).toHaveAttribute("href", "/fr/he-preview");
		expectNoRuntimeErrorsBeyondDocumentStatus(runtimeErrors.errors, 404);
	});

	test("the error reference is shown and the copy button copies exactly it", async ({
		page,
		context,
	}) => {
		await context.grantPermissions(["clipboard-read", "clipboard-write"]);
		await page.goto(`/en/he-preview/${MISSING_ID}`);
		await expect(
			page.getByText("Error reference", { exact: true }),
		).toBeVisible();
		const traceId = (
			await page.locator(".font-mono").first().textContent()
		)?.trim();
		expect(traceId).toMatch(/^[0-9a-f-]{36}$/);

		await page.getByRole("button", { name: COPY_BUTTON }).click();

		await expect(page.getByRole("status")).toHaveText("Error reference copied");
		expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
			traceId,
		);
	});

	test("the back link navigates to the list", async ({ page }) => {
		await page.goto(`/en/he-preview/${MISSING_ID}`);
		await page.waitForLoadState("networkidle");

		await page.getByRole("link", { name: BACK_LINK }).click();

		await page.waitForURL(/\/en\/he-preview$/);
		await expect(page.getByRole("alert")).toHaveCount(0);
	});

	test("an unexpected server error shows the generic state with an error reference", async ({
		page,
	}) => {
		let runtimeErrors: ReturnType<typeof attachErrorCollector> | undefined;
		await submitNonFormPost(page, () => {
			runtimeErrors = attachErrorCollector(page);
		});

		await expect(
			page.getByText("An unexpected error occurred. Please try again later."),
		).toBeVisible();
		await expect(
			page.getByText("Error reference", { exact: true }),
		).toBeVisible();
		await expect(page.getByText("FormData")).toHaveCount(0);
		expect(runtimeErrors).toBeDefined();
		expectNoRuntimeErrorsBeyondDocumentStatus(runtimeErrors?.errors ?? [], 500);
	});

	test("Gate 9b: axe WCAG 2.2 AA on every error state", async ({ page }) => {
		// Audits every state before failing, so one violation can't hide another.
		const violations: string[] = [];
		const audit = async (label: string) => {
			await runWcag22A11yCheck(page, { scope: "main", label }).catch(
				(err: Error) => violations.push(err.message),
			);
		};
		for (const url of [
			`/en/he-preview/${MISSING_ID}`,
			`/fr/he-preview/${MISSING_ID}`,
			"/en/he-preview/not-a-uuid",
		]) {
			await page.goto(url);
			await audit(url);
		}
		await submitNonFormPost(page);
		await audit("unexpected");

		expect(violations).toEqual([]);
	});

	test("Gate 9b: target sizes on every error state", async ({ page }) => {
		for (const url of [
			`/en/he-preview/${MISSING_ID}`,
			`/fr/he-preview/${MISSING_ID}`,
			"/en/he-preview/not-a-uuid",
		]) {
			await page.goto(url);
			await assertTargetSizesAndLabels(page, { scope: "main", label: url });
		}
		await submitNonFormPost(page);
		await assertTargetSizesAndLabels(page, {
			scope: "main",
			label: "unexpected",
		});
	});

	test("Gate 9b: keyboard order copy then back link, Enter announces", async ({
		page,
		context,
	}) => {
		await context.grantPermissions(["clipboard-read", "clipboard-write"]);
		await page.goto(`/en/he-preview/${MISSING_ID}`);
		await page.waitForLoadState("networkidle");
		// Start sequential focus navigation inside the error content.
		await page
			.getByRole("heading", { level: 2, name: NOT_FOUND_TITLE })
			.click();
		await verifyKeyboardSequence(
			page,
			[
				{
					key: "Tab",
					expectedFocusedSelector: 'main [role="alert"] button',
				},
				{ key: "Enter", description: "copy" },
				{
					key: "Tab",
					expectedFocusedSelector: `a[href="/en/he-preview"]`,
				},
			],
			"not-found",
		);
		await expect(page.getByRole("status")).toHaveText("Error reference copied");
	});

	test("Gate 9b: no horizontal scroll at 320 px and the trace id wraps", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 320, height: 800 });
		await page.goto(`/en/he-preview/${MISSING_ID}`);

		await assertNoHorizontalOverflow(page, "not-found at 320px");
		await expect(
			page.getByRole("button", { name: COPY_BUTTON }),
		).toBeInViewport({ ratio: 1 });
		const traceBox = await page.locator(".font-mono").first().boundingBox();
		expect(traceBox?.width ?? Infinity).toBeLessThanOrEqual(320);
		await page.getByRole("link", { name: BACK_LINK }).scrollIntoViewIfNeeded();
		await expect(page.getByRole("link", { name: BACK_LINK })).toBeInViewport({
			ratio: 1,
		});
	});

	test("Gate 9c: evidence screenshots at desktop and 375 px", async ({
		page,
	}) => {
		const viewports = [BREAKPOINTS.desktop, BREAKPOINTS.mobile];
		await capturePrototypeStateScreenshots(page, {
			changeName: CHANGE_NAME,
			routeUrl: `/en/he-preview/${MISSING_ID}`,
			routeLabel: "he-preview-not-found-en",
			state: "error",
			viewports,
		});
		await capturePrototypeStateScreenshots(page, {
			changeName: CHANGE_NAME,
			routeUrl: `/fr/he-preview/${MISSING_ID}`,
			routeLabel: "he-preview-not-found-fr",
			state: "error",
			viewports,
		});
		await capturePrototypeStateScreenshots(page, {
			changeName: CHANGE_NAME,
			routeUrl: "/en/he-preview",
			routeLabel: "he-preview-unexpected-en",
			state: "error",
			viewports,
			prepareState: (p) => submitNonFormPost(p),
		});
	});
});
