import { test, expect } from "@playwright/test";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { userTable } from "~/drizzle/schema";
import { userCountryAccountsTable } from "~/drizzle/schema/userCountryAccountsTable";
import { dr, initDB } from "~/db.server";
import { hipsVersionTable } from "~/domains/hazardous-events/infrastructure/hipsVersionTable";
import { hazardTypeTable } from "~/domains/hazardous-events/infrastructure/hazardTypeTable";
import { hazardClusterTable } from "~/domains/hazardous-events/infrastructure/hazardClusterTable";
import { specificHazardTable } from "~/domains/hazardous-events/infrastructure/specificHazardTable";
import { eventTable } from "~/drizzle/schema/eventTable";
import { hazardousEventTable } from "~/drizzle/schema/hazardousEventTable";
// Plain Drizzle table inserts, not any application/infrastructure class -- Playwright's esbuild
// transform can't parse NestJS parameter decorators (he-preview.spec.ts's own precedent).
import { seedCountryAccount } from "../../integration/db/models/hazardousEventTestHelpers";
import { seedTextContent } from "../../integration/db/models/textContentTestHelpers";

const testEmail = `e2e_he_filters_${Date.now()}@test.com`;
const userId = randomUUID();
const suffix = Date.now();
let countryAccountId: string;

interface TaxonomyChain {
	hazardTypeId: string;
	hazardTypeName: string;
	hazardClusterId: string;
	hazardClusterName: string;
	specificHazardId: string;
	specificHazardName: string;
}

/** Full type->cluster->specificHazard chain with caller-chosen display names (not random text),
 * so filter-bar assertions can match on real visible labels -- distinct from
 * DrizzleHazardousEventRepository.test.ts's own seedTaxonomyChain(), which names everything with
 * a bare randomUUID and isn't exported for reuse here. */
async function seedTaxonomyChain(
	typeName: string,
	clusterName: string,
	hazardName: string,
): Promise<TaxonomyChain> {
	const [hipsVersion] = await dr
		.insert(hipsVersionTable)
		.values({ versionNo: `HIPs ${randomUUID()}` })
		.returning({ id: hipsVersionTable.id });
	const [type] = await dr
		.insert(hazardTypeTable)
		.values({
			id: randomUUID(),
			nameTextContentId: await seedTextContent(typeName),
			hipsVersionId: hipsVersion.id,
		})
		.returning({ id: hazardTypeTable.id });
	const [cluster] = await dr
		.insert(hazardClusterTable)
		.values({
			id: randomUUID(),
			nameTextContentId: await seedTextContent(clusterName),
			hazardTypeId: type.id,
		})
		.returning({ id: hazardClusterTable.id });
	const [specificHazard] = await dr
		.insert(specificHazardTable)
		.values({
			id: randomUUID(),
			nameTextContentId: await seedTextContent(hazardName),
			code: `code-${randomUUID()}`,
			hazardClusterId: cluster.id,
		})
		.returning({ id: specificHazardTable.id });
	return {
		hazardTypeId: type.id,
		hazardTypeName: typeName,
		hazardClusterId: cluster.id,
		hazardClusterName: clusterName,
		specificHazardId: specificHazard.id,
		specificHazardName: hazardName,
	};
}

let chainAlpha: TaxonomyChain;
let chainBeta: TaxonomyChain;
const alphaEventIds = [randomUUID(), randomUUID()];
const betaEventId = randomUUID();

test.beforeAll(async () => {
	initDB();
	const passwordHash = bcrypt.hashSync("Password123!", 10);

	countryAccountId = await seedCountryAccount();

	// Two distinct chains for real filtering variety (design.md Test approach) -- names prefixed
	// with "Z" so a single-character combobox search (test 3) doesn't collide with other seed
	// helpers' own "Hazard "/"Type "/"Cluster " + hex-uuid naming convention.
	chainAlpha = await seedTaxonomyChain(
		`E2E Filter Type Alpha ${suffix}`,
		`E2E Filter Cluster Alpha ${suffix}`,
		`ZAlphaHazard ${suffix}`,
	);
	chainBeta = await seedTaxonomyChain(
		`E2E Filter Type Beta ${suffix}`,
		`E2E Filter Cluster Beta ${suffix}`,
		`ZBetaHazard ${suffix}`,
	);

	await dr.insert(userTable).values({
		id: userId,
		email: testEmail,
		password: passwordHash,
		emailVerified: true,
	});
	// data-collector, not data-viewer -- canAddNewRecord(role) must be true for the
	// viewMyRecords/pendingMyAction checkboxes to render (test 2 needs one of them).
	await dr.insert(userCountryAccountsTable).values({
		userId,
		countryAccountsId: countryAccountId,
		role: "data-collector",
		isPrimaryAdmin: false,
	});

	// A dedicated, freshly-seeded tenant (he-preview.spec.ts's own precedent) -- 2 Alpha-type
	// events + 1 Beta-type event means filtering to Alpha should read "Showing 2 of 3" (Decision
	// 13: filtered total of role-safe unfiltered total).
	for (const id of [...alphaEventIds, betaEventId]) {
		await dr.insert(eventTable).values({ id });
	}
	for (const id of alphaEventIds) {
		await dr.insert(hazardousEventTable).values({
			id,
			countryAccountsId: countryAccountId,
			specificHazardId: chainAlpha.specificHazardId,
			startDate: "2026-01-01",
			description: `E2E summary-line Alpha event ${id}`,
			specificHazardLocalName: chainAlpha.specificHazardName,
		});
	}
	await dr.insert(hazardousEventTable).values({
		id: betaEventId,
		countryAccountsId: countryAccountId,
		specificHazardId: chainBeta.specificHazardId,
		startDate: "2026-01-01",
		description: `E2E summary-line Beta event ${betaEventId}`,
		specificHazardLocalName: chainBeta.specificHazardName,
	});
});

test.afterAll(async () => {
	await dr.transaction(async (tx) => {
		await tx
			.delete(userCountryAccountsTable)
			.where(eq(userCountryAccountsTable.countryAccountsId, countryAccountId));
		await tx.delete(userTable).where(eq(userTable.id, userId));
		// Taxonomy rows (hazardType/hazardCluster/specificHazard/hipsVersion) are deliberately left
		// in place -- GetHazardTaxonomyOptionsUseCase.listAll() is global/untenanted, and no other
		// suite in this file depends on an empty taxonomy table.
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

test.describe("Hazardous event list filter bar (6h)", () => {
	test("Apply filters persists the selected Hazard type's displayed value", async ({
		page,
	}) => {
		await login(page);
		await page.goto("/en/he-preview");
		// Lets a background revalidation (parallel-loader layout gap) settle before interacting (Gate 9).
		await page.waitForLoadState("networkidle");

		const form = page.locator("form.dts-form");
		// RAC's Select trigger button's accessible name is "<selected value> <field label>" (e.g.
		// "All hazard types Hazard type"), not the label alone -- confirmed via the real DOM, not
		// assumed. Anchored at the end so it can't collide with "Hazardous event status"'s own button.
		await form.getByRole("button", { name: /Hazard type$/ }).click();
		await page
			.getByRole("option", { name: chainAlpha.hazardTypeName, exact: true })
			.click();

		await Promise.all([
			page.waitForURL(/hazardTypeId=/),
			form.getByRole("button", { name: "Apply filters" }).click(),
		]);

		// The whole point: the DISPLAYED trigger text, not just the URL/loader data. Substring
		// match against the composed "<value> Hazard type" accessible name.
		await expect(
			form.getByRole("button", { name: chainAlpha.hazardTypeName }),
		).toBeVisible();
	});

	// Decision 13: the summary line is the filtered total of the role-safe unfiltered total --
	// 2 Alpha events + 1 Beta event seeded, so filtering to Alpha reads "2 of 3", not "2 of 2".
	test("the summary line reads the filtered total of the unfiltered total", async ({
		page,
	}) => {
		await login(page);
		await page.goto("/en/he-preview");
		await page.waitForLoadState("networkidle");

		const form = page.locator("form.dts-form");
		await form.getByRole("button", { name: /Hazard type$/ }).click();
		await page
			.getByRole("option", { name: chainAlpha.hazardTypeName, exact: true })
			.click();

		await Promise.all([
			page.waitForURL(/hazardTypeId=/),
			form.getByRole("button", { name: "Apply filters" }).click(),
		]);

		// A fresh, dedicated tenant (this file's own beforeAll) with exactly 2 Alpha + 1 Beta event,
		// nothing else -- the unfiltered total is exactly 3, not merely "more than the filtered 2".
		await expect(
			page.getByText("Showing 2 of 3 hazardous event(s)"),
		).toBeVisible();
	});

	test("Clear resets every filter field's displayed value, not just the URL/data", async ({
		page,
	}) => {
		await login(page);
		await page.goto("/en/he-preview");
		// Lets a background revalidation (parallel-loader layout gap) settle before interacting (Gate 9).
		await page.waitForLoadState("networkidle");

		const form = page.locator("form.dts-form");

		// Select: Hazard type.
		await form.getByRole("button", { name: /Hazard type$/ }).click();
		await page
			.getByRole("option", { name: chainAlpha.hazardTypeName, exact: true })
			.click();

		// Combobox: Specific hazard -- type then pick the matching option. Selecting it also
		// re-derives cluster/type from chainAlpha, consistent with the Select above (no conflict).
		const comboboxInput = form.getByLabel("Specific hazard");
		await comboboxInput.fill("ZAlphaHazard");
		await page
			.getByRole("option", { name: chainAlpha.specificHazardName, exact: true })
			.click();

		// Date: fromDate.
		await form.getByLabel("From").fill("2026-01-01");

		// Text: recordingOrganization.
		await form.getByLabel("Recording organization").fill("E2E Org Test");

		// Checkbox: viewMyRecords (role is data-collector, so canAddNewRecord is true).
		await form.getByLabel("View my records").check();

		await Promise.all([
			page.waitForURL(/specificHazardId=/),
			form.getByRole("button", { name: "Apply filters" }).click(),
		]);

		// Confirm the Apply actually committed every field before testing Clear against them.
		expect(page.url()).toContain(`fromDate=2026-01-01`);
		// GET form submission uses "+" for spaces (application/x-www-form-urlencoded), not %20 --
		// decodeURIComponent doesn't touch "+", so match the raw encoded form instead.
		expect(page.url()).toContain("recordingOrganization=E2E+Org+Test");
		expect(page.url()).toContain("viewMyRecords=on");
		await expect(
			form.getByRole("button", { name: chainAlpha.hazardTypeName }),
		).toBeVisible();
		await expect(form.getByLabel("Specific hazard")).toHaveValue(
			chainAlpha.specificHazardName,
		);
		await expect(form.getByLabel("From")).toHaveValue("2026-01-01");
		await expect(form.getByLabel("Recording organization")).toHaveValue(
			"E2E Org Test",
		);
		await expect(form.getByLabel("View my records")).toBeChecked();

		// Clear -- a same-route client-side React Router navigation (design.md Risk / the bug this
		// test guards against), not a full page reload.
		await Promise.all([
			page.waitForURL((url) => url.search === ""),
			form.getByRole("link", { name: "Clear" }).click(),
		]);

		expect(new URL(page.url()).search).toBe("");

		// Every control's DISPLAYED value must be back to its default, not just the URL/list data.
		await expect(
			form.getByRole("button", { name: "All hazard types" }),
		).toBeVisible();
		await expect(form.getByLabel("Specific hazard")).toHaveValue("");
		await expect(form.getByLabel("From")).toHaveValue("");
		await expect(form.getByLabel("Recording organization")).toHaveValue("");
		await expect(form.getByLabel("View my records")).not.toBeChecked();
	});

	test("A single-character combobox search opens the suggestion list", async ({
		page,
	}) => {
		await login(page);
		await page.goto("/en/he-preview");
		// Lets a background revalidation (parallel-loader layout gap) settle before interacting (Gate 9).
		await page.waitForLoadState("networkidle");

		const form = page.locator("form.dts-form");
		const comboboxInput = form.getByLabel("Specific hazard");

		// Regression guard: RAC's menuTrigger="input" heuristic checks a stale empty-items
		// collection on the very first empty->1-char keystroke, worked around via a synthetic
		// ArrowDown in Combobox.tsx's handleInputChange.
		await comboboxInput.pressSequentially("Z");

		await expect(page.getByRole("listbox")).toBeVisible();
		await expect(
			page.getByRole("option", {
				name: chainAlpha.specificHazardName,
				exact: true,
			}),
		).toBeVisible();
	});
});
