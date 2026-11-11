import { test, expect } from "@playwright/test";
import { randomUUID } from "crypto";
import { eq, inArray } from "drizzle-orm";
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";
import { userTable } from "~/drizzle/schema";
import { userCountryAccountsTable } from "~/drizzle/schema/userCountryAccountsTable";
import { instanceSystemSettingsTable } from "~/drizzle/schema/instanceSystemSettingsTable";
import { eventTable } from "~/drizzle/schema/eventTable";
import { hazardousEventTable } from "~/drizzle/schema/hazardousEventTable";
import { workflowInstanceTable } from "~/domains/validation-workflow/infrastructure/workflowInstanceTable";
import { BASE_UPLOAD_PATH } from "~/utils/paths";
import { dr, initDB } from "~/db.server";
import {
	seedCountryAccount,
	seedSpecificHazard,
} from "../../integration/db/models/hazardousEventTestHelpers";

const password = "Password123!";
const dataCollectorEmail = `e2e_he_attachments_collector_${Date.now()}@test.com`;
const dataCollectorId = randomUUID();
let countryAccountId: string;

test.beforeAll(async () => {
	initDB();
	const passwordHash = bcrypt.hashSync(password, 10);

	countryAccountId = await seedCountryAccount();
	// Only seeded so #specificHazardId's dropdown has an option -- unlike the sibling spec, this
	// test creates no parent event, so the id itself is never read.
	await seedSpecificHazard();

	await dr.insert(userTable).values({
		id: dataCollectorId,
		email: dataCollectorEmail,
		password: passwordHash,
		emailVerified: true,
	});
	await dr.insert(userCountryAccountsTable).values({
		userId: dataCollectorId,
		countryAccountsId: countryAccountId,
		role: "data-collector",
	});
	// The legacy file-viewer route's authLoaderPublicOrWithPerm reads this row unconditionally
	// (app/utils/auth.ts) -- without it, any request through that loader 500s on a null read.
	await dr.insert(instanceSystemSettingsTable).values({
		countryAccountsId: countryAccountId,
		approvedRecordsArePublic: true,
	});
});

test.afterAll(async () => {
	await dr.transaction(async (tx) => {
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
		await tx
			.delete(instanceSystemSettingsTable)
			.where(
				eq(instanceSystemSettingsTable.countryAccountsId, countryAccountId),
			);
		await tx.delete(userTable).where(eq(userTable.id, dataCollectorId));
	});
	// promote() wrote a real file under this tenant's own dir -- DB rows don't carry it away.
	fs.rmSync(path.resolve(BASE_UPLOAD_PATH, `tenant-${countryAccountId}`), {
		recursive: true,
		force: true,
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

const FIXTURE_CONTENT = "%PDF-1.4 e2e test fixture, not a real PDF\n";

/** `.pdf` is on FileValidator.ts's allow-list (extension-only check). Written under
 * Playwright's per-test output dir so it's cleaned up automatically. */
function createTestUploadFile(outputPath: (name: string) => string): string {
	const filePath = outputPath("test-attachment.pdf");
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(filePath, FIXTURE_CONTENT);
	return filePath;
}

test.describe("Hazardous event attachments widget (6.1, DEF-054 regression)", () => {
	test("a File-type and a Link-type attachment both survive save and reload, and the File link resolves", async ({
		page,
	}) => {
		await login(page, dataCollectorEmail);
		await page.goto("/en/he-preview/new");

		await page.getByLabel("Hazard type").selectOption({ index: 1 });
		await page.getByLabel("Hazard cluster").selectOption({ index: 1 });
		await page.selectOption("#specificHazardId", { index: 1 });
		await page.fill("#startDate", "2026-01-01");
		await page.fill("#endDate", "2026-01-02");
		await page.fill("#recordOriginator", "E2E originator");

		const attachments = page.locator("#attachments");
		// "Add" is an <a> with no href -- no link role, so match by text instead.
		const addButton = attachments
			.locator(".content-repeater-actions")
			.getByText("Add", { exact: true });

		// -- Attachment 1: File type --
		await addButton.click();
		let dialog = page.getByRole("dialog");
		await dialog.getByLabel("Title").fill("E2E uploaded file");
		// "File" is the widget's own default file_option for a new item -- no radio click needed.
		const uploadFilePath = createTestUploadFile((name) =>
			test.info().outputPath(name),
		);
		await dialog.locator('input[type="file"]').setInputFiles(uploadFilePath);
		// Waiting for the file link (id is the field's own "file", not the instance id) is the
		// upload-complete signal -- it only renders once handleFileUpload()'s response lands.
		await expect(dialog.locator("#file-link-file")).toBeVisible({
			timeout: 15000,
		});
		await dialog.getByRole("button", { name: "Apply" }).click();

		// -- Attachment 2: Link type --
		await addButton.click();
		dialog = page.getByRole("dialog");
		await dialog.getByLabel("Title").fill("E2E link resource");
		// Not getByRole("radio", {name: "Link"}) -- both radios' accessible names can include
		// "Link" (ambiguous); the per-option <label for=...> id is unambiguous.
		await dialog.locator('label[for="attachments_file_option_1"]').click();
		await dialog.locator("#attachments_url").fill("https://example.com/report");
		await dialog.getByRole("button", { name: "Apply" }).click();

		// "File/URL" is the 3rd <td> (Title, Tags, File/URL, Action) -- scoped, since Tags is "N/A"
		// here too (no tags set).
		const fileRow = attachments
			.locator("tbody tr")
			.filter({ hasText: "E2E uploaded file" });
		const linkRow = attachments
			.locator("tbody tr")
			.filter({ hasText: "E2E link resource" });
		await expect(fileRow.locator("td").nth(2)).toContainText(".pdf");
		await expect(linkRow.locator("td").nth(2)).toContainText(
			"https://example.com/report",
		);

		await page.getByRole("button", { name: "Save or submit" }).click();
		await page.getByRole("radio", { name: "Save as draft" }).click();
		await Promise.all([
			page.waitForURL(/\/en\/he-preview\/[0-9a-f-]+$/),
			page.getByRole("button", { name: "Save as draft" }).click(),
		]);

		const detailUrl = page.url();
		const eventId = detailUrl.match(/\/en\/he-preview\/([0-9a-f-]+)$/)?.[1];
		expect(eventId).toBeTruthy();

		// Reload via the edit page -- the regression proof for the mapper fix (used to feed the
		// domain shape back into the widget, rendering every attachment as "N/A").
		await page.goto(`/en/he-preview/edit/${eventId}`);

		const reloadedAttachments = page.locator("#attachments");
		const reloadedFileRow = reloadedAttachments
			.locator("tbody tr")
			.filter({ hasText: "E2E uploaded file" });
		const reloadedLinkRow = reloadedAttachments
			.locator("tbody tr")
			.filter({ hasText: "E2E link resource" });

		await expect(reloadedFileRow).toBeVisible();
		await expect(reloadedLinkRow).toBeVisible();
		// "N/A" here is exactly what the pre-fix bug rendered.
		const reloadedFileCell = reloadedFileRow.locator("td").nth(2);
		await expect(reloadedFileCell).toContainText(".pdf");
		await expect(reloadedFileCell).not.toContainText("N/A");
		await expect(reloadedLinkRow.locator("td").nth(2)).toContainText(
			"https://example.com/report",
		);

		// The table cell is plain text -- open the row's edit dialog for the real file link, and
		// confirm it serves the promoted file (not just a 200) via the unchanged file-viewer route.
		await reloadedFileRow.getByRole("link", { name: "Edit" }).click();
		const editDialog = page.getByRole("dialog");
		const fileLink = editDialog.locator("#file-link-file");
		await expect(fileLink).toBeVisible();
		await expect(fileLink).not.toHaveText("N/A");
		const href = await fileLink.getAttribute("href");
		expect(href).toBeTruthy();
		const viewerResponse = await page.request.get(href!);
		expect(viewerResponse.status()).toBe(200);
		expect(await viewerResponse.text()).toContain("%PDF-1.4 e2e test fixture");
		await editDialog.getByRole("button", { name: "Cancel" }).click();
	});
});
