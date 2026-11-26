import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import {
	render,
	screen,
	cleanup,
	waitFor,
	within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRoutesStub } from "react-router";
import i18n, { type i18n as I18n } from "i18next";
import { initReactI18next, I18nextProvider } from "react-i18next";
import enHazardousEvents from "../../../../../../locales/en/hazardous-events.json";
import frHazardousEvents from "../../../../../../locales/fr/hazardous-events.json";
import { HazardousEventCsvImportPage } from "./HazardousEventCsvImportPage";
import type { HazardousEventCsvImportResult } from "~/domains/hazardous-events/application/dto/HazardousEventCsvImportResult";

let testI18n: I18n;
const missingKeys: string[] = [];

beforeAll(async () => {
	testI18n = i18n.createInstance();
	await testI18n.use(initReactI18next).init({
		lng: "en",
		fallbackLng: false,
		ns: ["hazardous-events"],
		defaultNS: "hazardous-events",
		resources: {
			en: { "hazardous-events": enHazardousEvents },
			fr: { "hazardous-events": frHazardousEvents },
		},
		saveMissing: true,
		missingKeyHandler: (_lngs, _ns, key) => {
			missingKeys.push(key);
		},
	});
}, 60000);

afterEach(async () => {
	cleanup();
	removeSubmitListener?.();
	removeSubmitListener = undefined;
	await testI18n.changeLanguage("en");
	expect(missingKeys).toEqual([]);
});

interface RenderOptions {
	lang?: string;
	result?: HazardousEventCsvImportResult;
	submitting?: boolean;
	onSubmit?: (formData: FormData) => void;
}

async function renderPage({
	lang = "en",
	result,
	submitting = false,
	onSubmit,
}: RenderOptions = {}) {
	await testI18n.changeLanguage(lang);
	if (onSubmit) captureSubmit(onSubmit);
	const path = `/${lang}/he-preview/csv-import`;
	const Stub = createRoutesStub([
		{
			path,
			Component: () => (
				<HazardousEventCsvImportPage
					lang={lang}
					result={result}
					submitting={submitting}
				/>
			),
		},
	]);
	const view = render(
		<I18nextProvider i18n={testI18n}>
			<Stub initialEntries={[path]} />
		</I18nextProvider>,
	);
	await screen.findByRole("button", {
		name: testI18n.t(submitting ? "csv.submitting" : "csv.submit"),
	});
	return view;
}

// jsdom's empty-file FormData crashes vitest's Request shim, so read the native submit instead.
let removeSubmitListener: (() => void) | undefined;
function captureSubmit(onSubmit: (formData: FormData) => void) {
	const listener = (event: SubmitEvent) => {
		event.preventDefault();
		onSubmit(new FormData(event.target as HTMLFormElement, event.submitter));
	};
	window.addEventListener("submit", listener, { capture: true });
	removeSubmitListener = () =>
		window.removeEventListener("submit", listener, { capture: true });
}

const SUCCESS: HazardousEventCsvImportResult = {
	ok: true,
	mode: "create",
	created: 3,
	updated: 2,
	unchanged: 1,
	ignoredColumns: [],
};

const FAILURE: HazardousEventCsvImportResult = {
	ok: false,
	mode: "create",
	fileErrors: [{ code: "no_data" }],
	rowErrors: [
		{ line: 3, column: "startDate", code: "invalid_date", value: "2024-13" },
		{ line: 5, code: "duplicate_key" },
	],
	errorCount: 3,
	ignoredColumns: [],
};

function modeTrigger() {
	return screen.getByRole("button", { name: /Type/ });
}

describe("HazardousEventCsvImportPage: initial state (checklist 2, 4-11)", () => {
	it("wraps a multipart dts-form in mg-container (item 2)", async () => {
		const { container } = await renderPage();

		const form = container.querySelector("form");
		expect(form?.closest(".mg-container")).not.toBeNull();
		expect(form?.classList.contains("dts-form")).toBe(true);
		expect(form?.getAttribute("enctype")).toBe("multipart/form-data");
		expect(form?.getAttribute("method")).toBe("post");
	});

	it("labels the file input 'File upload' with name=file and a CSV accept hint (item 4)", async () => {
		await renderPage();

		const input = screen.getByLabelText("File upload");
		expect(input.getAttribute("type")).toBe("file");
		expect(input.getAttribute("name")).toBe("file");
		expect(input.getAttribute("accept")).toBe(".csv,text/csv");
		// Label wraps its control.
		expect(input.closest("label")).not.toBeNull();
	});

	it("labels the mode select 'Type' and defaults to Create (item 5)", async () => {
		await renderPage();

		expect(modeTrigger().textContent).toContain("Create");
		const hidden = document.querySelector<HTMLSelectElement>(
			'select[name="import_type"]',
		);
		expect(hidden?.value).toBe("create");
	});

	it("lists the mode options in the order Update, Create, Upsert (item 5)", async () => {
		const user = userEvent.setup();
		await renderPage();

		await user.click(modeTrigger());
		await screen.findByRole("listbox");

		expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
			"Update",
			"Create",
			"Upsert",
		]);
	});

	it("submits import_type=create by default through the hidden select (item 5)", async () => {
		const user = userEvent.setup();
		const submitted: FormData[] = [];
		await renderPage({ onSubmit: (data) => submitted.push(data) });

		await user.click(screen.getByRole("button", { name: "Import" }));

		await waitFor(() => expect(submitted).toHaveLength(1));
		expect(submitted[0].get("import_type")).toBe("create");
	});

	it("submits the chosen mode after the user picks Upsert (item 5)", async () => {
		const user = userEvent.setup();
		const submitted: FormData[] = [];
		await renderPage({ onSubmit: (data) => submitted.push(data) });

		await user.click(modeTrigger());
		await user.click(await screen.findByRole("option", { name: "Upsert" }));
		await user.click(screen.getByRole("button", { name: "Import" }));

		await waitFor(() => expect(submitted).toHaveLength(1));
		expect(submitted[0].get("import_type")).toBe("upsert");
	});

	it("renders an enabled submit button named 'Import' with the primary look (item 6)", async () => {
		await renderPage();

		const button = screen.getByRole("button", { name: "Import" });
		expect(button.getAttribute("type")).toBe("submit");
		expect((button as HTMLButtonElement).disabled).toBe(false);
		expect(button.classList.contains("mg-button-primary")).toBe(true);
	});

	it("links back to /en/he-preview (item 7)", async () => {
		await renderPage();

		const link = screen.getByRole("link", { name: "Back to hazardous events" });
		expect(link.getAttribute("href")).toBe("/en/he-preview");
	});

	it("renders h3 'Example files' with Create, Update, Upsert template links in order (item 8)", async () => {
		await renderPage();

		const heading = screen.getByRole("heading", {
			level: 3,
			name: "Example files",
		});
		const list = heading.nextElementSibling as HTMLElement;
		const links = within(list).getAllByRole("link");
		expect(links.map((l) => [l.textContent, l.getAttribute("href")])).toEqual([
			["Create", "/en/he-preview/csv-template?mode=create"],
			["Update", "/en/he-preview/csv-template?mode=update"],
			["Upsert", "/en/he-preview/csv-template?mode=upsert"],
		]);
	});

	it("shows only the form with no result region initially (item 10)", async () => {
		await renderPage();

		expect(screen.queryByRole("status")).toBeNull();
		expect(screen.queryByRole("alert")).toBeNull();
	});

	it("follows tab order file, mode, submit, back link, template links", async () => {
		const user = userEvent.setup();
		await renderPage();

		const expected = [
			screen.getByLabelText("File upload"),
			modeTrigger(),
			screen.getByRole("button", { name: "Import" }),
			screen.getByRole("link", { name: "Back to hazardous events" }),
			...within(
				screen.getByRole("heading", { level: 3 })
					.nextElementSibling as HTMLElement,
			).getAllByRole("link"),
		];
		const visited: Element[] = [];
		for (let i = 0; i < expected.length; i++) {
			await user.tab();
			visited.push(document.activeElement as Element);
		}
		expect(visited).toEqual(expected);
	});
});

describe("HazardousEventCsvImportPage: submitting state (items 6, 10)", () => {
	it("shows 'Importing…' and marks the button pending, still focusable (Gate 9 N3)", async () => {
		await renderPage({ submitting: true });

		const button = screen.getByRole("button", { name: "Importing…" });
		expect(button.hasAttribute("data-pending")).toBe(true);
		expect((button as HTMLButtonElement).disabled).toBe(false);
		expect(screen.queryByRole("button", { name: "Import" })).toBeNull();
	});
});

describe("HazardousEventCsvImportPage: success state (item 3)", () => {
	it("announces 'N events created, M updated, K unchanged' in role=status", async () => {
		await renderPage({ result: SUCCESS });

		const status = screen.getByRole("status");
		expect(status.textContent).toContain(
			"3 events created, 2 updated, 1 unchanged.",
		);
		expect(screen.queryByRole("alert")).toBeNull();
	});

	it("places the result at the top of the form", async () => {
		const { container } = await renderPage({ result: SUCCESS });

		expect(container.querySelector("form")?.firstElementChild).toBe(
			screen.getByRole("status"),
		);
	});

	it("shows the skipped-data notice with a plural row count", async () => {
		await renderPage({
			result: { ...SUCCESS, skippedDataNotice: { rows: 4 } },
		});

		expect(screen.getByRole("status").textContent).toContain(
			"4 rows had spatial footprint or attachment data that was not imported.",
		);
	});

	it("shows the skipped-data notice with a singular row count", async () => {
		await renderPage({
			result: { ...SUCCESS, skippedDataNotice: { rows: 1 } },
		});

		expect(screen.getByRole("status").textContent).toContain(
			"1 row had spatial footprint or attachment data that was not imported.",
		);
	});

	it("omits the skipped-data notice when there is none", async () => {
		await renderPage({ result: SUCCESS });

		expect(screen.getByRole("status").textContent).not.toContain(
			"spatial footprint",
		);
	});

	it("lists ignored columns in one line (item 9)", async () => {
		await renderPage({
			result: {
				...SUCCESS,
				ignoredColumns: ["spatialFootprint", "attachments"],
			},
		});

		expect(
			within(screen.getByRole("status")).getByText(
				"Columns not imported: spatialFootprint, attachments",
			),
		).toBeTruthy();
	});

	it("omits the ignored-columns line when the list is empty (item 9)", async () => {
		const { container } = await renderPage({ result: SUCCESS });

		expect(container.textContent).not.toContain("Columns not imported");
	});
});

describe("HazardousEventCsvImportPage: failure state (item 3)", () => {
	it("renders role=alert and moves focus to it", async () => {
		await renderPage({ result: FAILURE });

		const alert = screen.getByRole("alert");
		await waitFor(() => expect(document.activeElement).toBe(alert));
		expect(alert.getAttribute("tabindex")).toBe("-1");
	});

	it("summarises the total problem count (file + row errors)", async () => {
		await renderPage({ result: FAILURE });

		expect(screen.getByRole("alert").textContent).toContain(
			"The file was not imported. Fix 3 problems and upload it again.",
		);
	});

	it("uses the singular summary for one problem", async () => {
		await renderPage({
			result: {
				...FAILURE,
				fileErrors: [],
				rowErrors: [
					{ line: 2, code: "required", column: "hazardousEventStatus" },
				],
				errorCount: 1,
			},
		});

		expect(screen.getByRole("alert").textContent).toContain(
			"Fix 1 problem and upload it again.",
		);
	});

	it("lists every error with its line and column in text, file errors first", async () => {
		await renderPage({ result: FAILURE });

		const items = within(screen.getByRole("alert"))
			.getAllByRole("listitem")
			.map((li) => li.textContent);
		expect(items).toEqual([
			"File: The file has a header but no data rows.",
			"Line 3, column startDate: Enter a date as YYYY, YYYY-MM or YYYY-MM-DD. Value: 2024-13",
			"Line 5: This key appears on an earlier line of the file.",
		]);
	});

	it("renders a file-level column error without a line", async () => {
		await renderPage({
			result: {
				...FAILURE,
				fileErrors: [{ code: "unknown_column", column: "foo" }],
				rowErrors: [],
			},
		});

		const item = within(screen.getByRole("alert")).getByRole("listitem");
		expect(item.textContent).toBe("Column foo: This column is not recognised.");
		expect(item.textContent).not.toContain("Line");
	});

	it("renders a header name with & and / literally, not HTML-escaped (m4)", async () => {
		await renderPage({
			result: {
				...FAILURE,
				fileErrors: [
					{ code: "unknown_column", column: "R&D" },
					{ code: "duplicate_column", column: "Date/Time" },
				],
				rowErrors: [{ line: 4, column: "a<b>", code: "required" }],
			},
		});

		const items = within(screen.getByRole("alert"))
			.getAllByRole("listitem")
			.map((li) => li.textContent);
		expect(items).toEqual([
			"Column R&D: This column is not recognised.",
			"Column Date/Time: This column appears more than once.",
			"Line 4, column a<b>: This value is required.",
		]);
	});

	it("renders a file-level error carrying a line", async () => {
		await renderPage({
			result: {
				...FAILURE,
				fileErrors: [{ code: "malformed_csv", line: 7 }],
				rowErrors: [],
			},
		});

		expect(
			within(screen.getByRole("alert")).getByRole("listitem").textContent,
		).toMatch(/^Line 7: The file is not valid CSV\./);
	});

	it("renders an echoed value as literal text, creating no element", async () => {
		const { container } = await renderPage({
			result: {
				...FAILURE,
				fileErrors: [],
				rowErrors: [
					{
						line: 2,
						column: "nationalSpecification",
						code: "invalid_enum",
						value: "<b>x</b>",
					},
				],
			},
		});

		expect(screen.getByText("Value: <b>x</b>")).toBeTruthy();
		expect(container.querySelector("b")).toBeNull();
	});

	it("shows no success line and no 'imported N records' line on failure", async () => {
		const { container } = await renderPage({ result: FAILURE });

		const text = container.textContent ?? "";
		expect(screen.queryByRole("status")).toBeNull();
		expect(text).not.toContain("events created");
		expect(text).not.toMatch(/imported (or updated )?\d+ records/i);
	});

	it("lists ignored columns inside the alert (item 9)", async () => {
		await renderPage({
			result: { ...FAILURE, ignoredColumns: ["attachments"] },
		});

		expect(
			within(screen.getByRole("alert")).getByText(
				"Columns not imported: attachments",
			),
		).toBeTruthy();
	});
});

describe("HazardousEventCsvImportPage: French copy", () => {
	it("renders the form, links and back link in French", async () => {
		const user = userEvent.setup();
		await renderPage({ lang: "fr" });

		expect(screen.getByLabelText("Téléversement du fichier")).toBeTruthy();
		expect(screen.getByRole("button", { name: "Importer" })).toBeTruthy();
		expect(
			screen
				.getByRole("link", { name: "Retour aux événements dangereux" })
				.getAttribute("href"),
		).toBe("/fr/he-preview");
		expect(
			screen.getByRole("heading", { level: 3, name: "Fichiers d'exemple" }),
		).toBeTruthy();
		expect(
			screen
				.getByRole("link", { name: "Créer ou mettre à jour" })
				.getAttribute("href"),
		).toBe("/fr/he-preview/csv-template?mode=upsert");

		await user.click(modeTrigger());
		await screen.findByRole("listbox");
		expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
			"Mettre à jour",
			"Créer",
			"Créer ou mettre à jour",
		]);
	});

	it("renders the success and failure copy in French", async () => {
		await renderPage({ lang: "fr", result: SUCCESS });
		expect(screen.getByRole("status").textContent).toContain(
			"3 événements créés, 2 mis à jour, 1 inchangé.",
		);
		cleanup();

		await renderPage({ lang: "fr", result: FAILURE });
		const alert = screen.getByRole("alert");
		expect(alert.textContent).toContain(
			"Le fichier n'a pas été importé. Corrigez 3 problèmes et téléversez-le à nouveau.",
		);
		expect(alert.textContent).toContain("Ligne 3, colonne startDate");
		expect(alert.textContent).toContain("Valeur : 2024-13");
	});

	it("shows 'Importation…' while submitting in French", async () => {
		await renderPage({ lang: "fr", submitting: true });

		expect(
			screen
				.getByRole("button", { name: "Importation…" })
				.hasAttribute("data-pending"),
		).toBe(true);
	});
});

describe("HazardousEventCsvImportPage: a bounded error list (gate 10, finding 3)", () => {
	const TRUNCATED: HazardousEventCsvImportResult = {
		...FAILURE,
		errorCount: 250,
	};

	it("summarises the total count, not only the listed errors", async () => {
		await renderPage({ result: TRUNCATED });

		expect(screen.getByRole("alert").textContent).toContain(
			"Fix 250 problems and upload it again.",
		);
	});

	it("says how many errors are not listed", async () => {
		await renderPage({ result: TRUNCATED });

		expect(screen.getByRole("alert").textContent).toContain(
			"…and 247 more problems.",
		);
	});

	it("uses the singular for one unlisted error", async () => {
		await renderPage({ result: { ...FAILURE, errorCount: 4 } });

		expect(screen.getByRole("alert").textContent).toContain(
			"…and 1 more problem.",
		);
	});

	it("shows no 'more' line when every error is listed", async () => {
		await renderPage({ result: FAILURE });

		expect(screen.getByRole("alert").textContent).not.toContain("more");
	});

	it("renders the 'more' line in French", async () => {
		await renderPage({ lang: "fr", result: TRUNCATED });

		expect(screen.getByRole("alert").textContent).toContain(
			"…et 247 autres problèmes.",
		);
	});
});

describe("HazardousEventCsvImportPage: French plurals for every count (NR1)", () => {
	it("uses the French singular for zero and one unchanged or updated", async () => {
		await renderPage({
			lang: "fr",
			result: { ...SUCCESS, created: 0, updated: 1, unchanged: 0 },
		});

		expect(screen.getByRole("status").textContent).toContain(
			"0 événement créé, 1 mis à jour, 0 inchangé.",
		);
	});

	it("uses the French plural for two or more unchanged", async () => {
		await renderPage({ lang: "fr", result: { ...SUCCESS, unchanged: 2 } });

		expect(screen.getByRole("status").textContent).toContain(
			"3 événements créés, 2 mis à jour, 2 inchangés.",
		);
	});
});

describe("HazardousEventCsvImportPage: Gate 9 follow-ups", () => {
	it("uses the singular for one created event", async () => {
		await renderPage({ result: { ...SUCCESS, created: 1 } });

		expect(screen.getByRole("status").textContent).toContain(
			"1 event created, 2 updated, 1 unchanged.",
		);
	});

	it("uses the French separator between location and message", async () => {
		await renderPage({ lang: "fr", result: FAILURE });

		expect(screen.getByRole("alert").textContent).toContain(
			"Ligne 3, colonne startDate : ",
		);
	});

	it("resets the form (clearing the chosen file) after a success, not after a failure", async () => {
		const reset = vi.spyOn(HTMLFormElement.prototype, "reset");
		await renderPage({ result: FAILURE });
		expect(reset).not.toHaveBeenCalled();
		cleanup();

		await renderPage({ result: SUCCESS });
		expect(reset).toHaveBeenCalledTimes(1);
		reset.mockRestore();
	});

	it("draws the error summary outline only for keyboard focus", async () => {
		await renderPage({ result: FAILURE });

		const alert = screen.getByRole("alert");
		expect(alert.className).toContain("focus-visible:outline-2");
		expect(alert.className).not.toMatch(/(^|\s)focus:/);
	});
});
