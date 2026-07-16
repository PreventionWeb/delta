import { test, expect } from "@playwright/test";

// Permanent regression guard for the SSR i18n pipeline (middleware ->
// fs-backend -> SSR); kept indefinitely since no domain has adopted this
// system yet to cover it otherwise. See app/routes/$lang+/_public+/e2e-i18n-fixture.tsx.
test.describe("i18n SSR locale resolution", () => {
	// First request in a run can pay Vite's dependency pre-bundling cost (~60s observed).
	test.describe.configure({ timeout: 120_000 });

	test("renders the English fixture translation in the initial server-rendered HTML for /en", async ({
		request,
	}) => {
		const response = await request.get("/en/e2e-i18n-fixture");
		const html = await response.text();

		expect(html).toContain("Hello (en fixture)");
		expect(html).not.toContain("Bonjour (fr fixture)");
	});

	test("renders the French fixture translation in the initial server-rendered HTML for /fr", async ({
		request,
	}) => {
		const response = await request.get("/fr/e2e-i18n-fixture");
		const html = await response.text();

		expect(html).toContain("Bonjour (fr fixture)");
		expect(html).not.toContain("Hello (en fixture)");
	});

	// "es" has no locales/es/__e2e_fixture__.json fixture file.
	test("falls back to the English translation, without erroring, when the requested locale has no namespace file", async ({
		request,
	}) => {
		const response = await request.get("/es/e2e-i18n-fixture");

		expect(response.status()).toBe(200);
		expect(await response.text()).toContain("Hello (en fixture)");
	});

	test("keeps the translation correct and hydrates without console errors after client-side JS loads", async ({
		page,
	}) => {
		const consoleErrors: string[] = [];
		page.on("console", (msg) => {
			if (msg.type() === "error") consoleErrors.push(msg.text());
		});

		await page.goto("/fr/e2e-i18n-fixture");
		await expect(page.getByTestId("e2e-i18n-fixture")).toHaveText(
			"Bonjour (fr fixture)",
		);

		expect(consoleErrors).toEqual([]);
	});
});
