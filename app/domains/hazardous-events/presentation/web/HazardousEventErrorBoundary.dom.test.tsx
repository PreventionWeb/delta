import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import {
	render,
	screen,
	fireEvent,
	cleanup,
	waitFor,
	within,
} from "@testing-library/react";
import { createMemoryRouter, RouterProvider, useFetcher } from "react-router";
import i18n, { type i18n as I18n } from "i18next";
import { initReactI18next, I18nextProvider } from "react-i18next";
import enHazardousEvents from "../../../../../locales/en/hazardous-events.json";
import frHazardousEvents from "../../../../../locales/fr/hazardous-events.json";
import { HazardousEventErrorBoundary } from "./HazardousEventErrorBoundary";

const TRACE_ID = "trace-zzz-123";

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
	vi.unstubAllGlobals();
	await testI18n.changeLanguage("en");
	expect(missingKeys).toEqual([]);
});

function envelope(status: number, extra: Record<string, unknown> = {}) {
	return Response.json(
		{
			success: false,
			error: {
				code: "SOME_CODE",
				message: "SECRET-SERVER-MESSAGE",
				details: { entity: "HazardousEvent", id: "SECRET-ID" },
				traceId: TRACE_ID,
				timestamp: "2026-11-23T00:00:00.000Z",
				...extra,
			},
		},
		{ status },
	);
}

/** Renders the boundary the way React Router does: for a loader that throws `failure`. */
async function renderBoundaryFor(failure: () => unknown, lang = "en") {
	await testI18n.changeLanguage(lang);
	const router = createMemoryRouter(
		[
			{
				path: "/:lang/he-preview/:id",
				loader: () => {
					throw failure();
				},
				Component: () => <p>detail page</p>,
				ErrorBoundary: HazardousEventErrorBoundary,
			},
			{ path: "/:lang/he-preview", Component: () => <p>list page</p> },
		],
		{ initialEntries: [`/${lang}/he-preview/some-id`] },
	);
	const view = render(
		<I18nextProvider i18n={testI18n}>
			<RouterProvider router={router} />
		</I18nextProvider>,
	);
	await screen.findByRole("alert");
	return { router, container: view.container };
}

function stubClipboard(writeText: (text: string) => Promise<void>) {
	vi.stubGlobal("navigator", {
		...navigator,
		clipboard: { writeText: vi.fn(writeText) },
	});
	return navigator.clipboard.writeText as ReturnType<typeof vi.fn>;
}

describe("HazardousEventErrorBoundary", () => {
	it.each([
		[
			404,
			"Hazardous event not found",
			"The record does not exist or you do not have access to it.",
		],
		[403, "Access denied", "You do not have permission to do this."],
		[
			422,
			"The request could not be processed",
			"Check the information you entered and try again.",
		],
		[
			409,
			"The record could not be saved",
			"It changed or is linked to other records. Reload the page and try again.",
		],
		[
			500,
			"Something went wrong",
			"An unexpected error occurred. Please try again later.",
		],
	])(
		"renders the title and body for status %i",
		async (status, title, body) => {
			await renderBoundaryFor(() => envelope(status));

			const alert = screen.getByRole("alert");
			expect(
				within(alert).getByRole("heading", { level: 2, name: title }),
			).toBeTruthy();
			expect(within(alert).getByText(body)).toBeTruthy();
		},
	);

	it("renders the page title as h1 above the h2 error title", async () => {
		await renderBoundaryFor(() => envelope(404));

		expect(
			screen.getByRole("heading", { level: 1, name: "Hazardous events" }),
		).toBeTruthy();
		expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(1);
	});

	it("hides the decorative icon from assistive technology", async () => {
		await renderBoundaryFor(() => envelope(404));

		const svg = screen.getByRole("alert").querySelector("svg");
		expect(svg?.getAttribute("aria-hidden")).toBe("true");
	});

	it("shows the trace reference row with a labelled copy button when a traceId exists", async () => {
		await renderBoundaryFor(() => envelope(404));

		expect(screen.getByText("Error reference")).toBeTruthy();
		expect(screen.getByText(TRACE_ID)).toBeTruthy();
		expect(
			screen.getByRole("button", { name: "Copy error reference" }),
		).toBeTruthy();
	});

	it("shows no trace row for a non-Response error and never its message", async () => {
		const { container } = await renderBoundaryFor(
			() => new Error("Failed query: select * from hazardous_event"),
		);

		expect(screen.getByText("Something went wrong")).toBeTruthy();
		expect(screen.queryByText("Error reference")).toBeNull();
		expect(screen.queryByRole("button")).toBeNull();
		expect(container.textContent).not.toContain("Failed query");
	});

	it("shows no trace row and no [object Object] for a string body", async () => {
		const { container } = await renderBoundaryFor(
			() => new Response("Not Found", { status: 404 }),
		);

		expect(screen.getByText("Hazardous event not found")).toBeTruthy();
		expect(screen.queryByText("Error reference")).toBeNull();
		expect(container.textContent).not.toContain("[object Object]");
	});

	it("never renders the server message, details, entity name or id", async () => {
		const { container } = await renderBoundaryFor(() => envelope(404));

		const text = container.textContent ?? "";
		expect(text).not.toContain("SECRET-SERVER-MESSAGE");
		expect(text).not.toContain("SECRET-ID");
		expect(text).not.toContain("HazardousEvent");
		expect(text).not.toContain("[object Object]");
	});

	it("has no support-contact line", async () => {
		const { container } = await renderBoundaryFor(() => envelope(500));

		expect(container.textContent?.toLowerCase()).not.toContain("support");
	});

	it("copies exactly the trace id and announces it", async () => {
		const writeText = stubClipboard(() => Promise.resolve());
		await renderBoundaryFor(() => envelope(404));

		fireEvent.click(
			screen.getByRole("button", { name: "Copy error reference" }),
		);

		await waitFor(() =>
			expect(screen.getByRole("status").textContent).toBe(
				"Error reference copied",
			),
		);
		expect(writeText).toHaveBeenCalledExactlyOnceWith(TRACE_ID);
	});

	it("re-announces on a second copy, not only the first", async () => {
		stubClipboard(() => Promise.resolve());
		await renderBoundaryFor(() => envelope(404));
		const status = screen.getByRole("status");
		const seen: string[] = [];
		const observer = new MutationObserver(() => {
			seen.push(status.textContent ?? "");
		});
		observer.observe(status, {
			childList: true,
			characterData: true,
			subtree: true,
		});
		const button = screen.getByRole("button", { name: "Copy error reference" });

		fireEvent.click(button);
		await waitFor(() =>
			expect(seen.filter((t) => t === "Error reference copied")).toHaveLength(
				1,
			),
		);
		fireEvent.click(button);

		await waitFor(() =>
			expect(seen.filter((t) => t === "Error reference copied")).toHaveLength(
				2,
			),
		);
		observer.disconnect();
	});

	it("renders the live region empty before any copy", async () => {
		await renderBoundaryFor(() => envelope(404));

		const status = screen.getByRole("status");
		expect(status.getAttribute("aria-live")).toBe("polite");
		expect(status.textContent).toBe("");
	});

	it("keeps the page and announces nothing when the clipboard rejects", async () => {
		const writeText = stubClipboard(() => Promise.reject(new Error("denied")));
		await renderBoundaryFor(() => envelope(404));

		fireEvent.click(
			screen.getByRole("button", { name: "Copy error reference" }),
		);

		await waitFor(() => expect(writeText).toHaveBeenCalled());
		await Promise.resolve();
		expect(screen.getByRole("status").textContent).toBe("");
		expect(screen.getByText(TRACE_ID)).toBeTruthy();
	});

	it("keeps the page and announces nothing when there is no clipboard API", async () => {
		vi.stubGlobal("navigator", { ...navigator, clipboard: undefined });
		await renderBoundaryFor(() => envelope(404));

		fireEvent.click(
			screen.getByRole("button", { name: "Copy error reference" }),
		);

		await Promise.resolve();
		expect(screen.getByRole("status").textContent).toBe("");
		expect(screen.getByText(TRACE_ID)).toBeTruthy();
	});

	it("links back to the list in the current language", async () => {
		await renderBoundaryFor(() => envelope(404));

		const link = screen.getByRole("link", { name: "Back to Hazardous events" });
		expect(link.getAttribute("href")).toBe("/en/he-preview");
	});

	// D7: a fetcher error renders the boundary of the route that called useFetcher.
	it("replaces the list page with the unexpected state when a delete fetcher action fails", async () => {
		function ListPage() {
			const fetcher = useFetcher();
			return (
				<button
					type="button"
					onClick={() =>
						fetcher.submit(null, {
							method: "post",
							action: "/en/he-preview/delete/he-1",
						})
					}
				>
					Delete
				</button>
			);
		}
		const router = createMemoryRouter(
			[
				{
					path: "/:lang/he-preview",
					Component: ListPage,
					ErrorBoundary: HazardousEventErrorBoundary,
				},
				{
					path: "/:lang/he-preview/delete/:id",
					action: () => {
						throw envelope(500);
					},
				},
			],
			{ initialEntries: ["/en/he-preview"] },
		);
		render(
			<I18nextProvider i18n={testI18n}>
				<RouterProvider router={router} />
			</I18nextProvider>,
		);

		fireEvent.click(await screen.findByRole("button", { name: "Delete" }));

		expect(
			await screen.findByRole("heading", {
				level: 2,
				name: "Something went wrong",
			}),
		).toBeTruthy();
		expect(screen.getByText(TRACE_ID)).toBeTruthy();
		expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
	});

	it("renders French copy and a French back link", async () => {
		await renderBoundaryFor(() => envelope(404), "fr");

		expect(screen.getByText("Événement dangereux introuvable")).toBeTruthy();
		expect(
			screen.getByRole("button", { name: "Copier la référence de l'erreur" }),
		).toBeTruthy();
		const link = screen.getByRole("link", {
			name: "Retour aux événements dangereux",
		});
		expect(link.getAttribute("href")).toBe("/fr/he-preview");
	});
});
