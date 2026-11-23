import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import {
	render,
	screen,
	fireEvent,
	cleanup,
	act,
	waitFor,
} from "@testing-library/react";
import { createMemoryRouter, data, RouterProvider } from "react-router";
import i18n, { type i18n as I18n } from "i18next";
import { initReactI18next, I18nextProvider } from "react-i18next";
import enHazardousEvents from "../../../../../locales/en/hazardous-events.json";
import {
	ToastRegion,
	createToastQueue,
} from "~/design-system/components/Toast";
import { HazardousEventDeleteButton } from "./HazardousEventDeleteButton";

const ACTION_PATH = "/en/he-preview/delete/he-1";

let testI18n: I18n;
const missingKeys: string[] = [];

beforeAll(async () => {
	testI18n = i18n.createInstance();
	await testI18n.use(initReactI18next).init({
		lng: "en",
		fallbackLng: false,
		ns: ["hazardous-events"],
		defaultNS: "hazardous-events",
		resources: { en: { "hazardous-events": enHazardousEvents } },
		saveMissing: true,
		missingKeyHandler: (_lngs, _ns, key) => {
			missingKeys.push(key);
		},
	});
}, 60000);

afterEach(() => {
	cleanup();
	expect(missingKeys).toEqual([]);
});

type ActionResult = Response | ReturnType<typeof blockedResult>;

function renderButton(
	actionImpl: (request: Request) => Promise<ActionResult> | ActionResult,
) {
	const actionSpy = vi.fn(({ request }: { request: Request }) =>
		actionImpl(request),
	);
	const toastQueue = createToastQueue();
	const loaderSpy = vi.fn(() => null);
	const router = createMemoryRouter(
		[
			{
				id: "list",
				path: "/",
				loader: loaderSpy,
				element: (
					<>
						<HazardousEventDeleteButton
							action={ACTION_PATH}
							toastQueue={toastQueue}
						/>
						<ToastRegion queue={toastQueue} closeLabel="Close" />
					</>
				),
			},
			{ path: ACTION_PATH, action: actionSpy },
		],
		// Hydrated, so the list renders at once and loaderSpy counts only revalidations.
		{ initialEntries: ["/"], hydrationData: { loaderData: { list: null } } },
	);
	render(
		<I18nextProvider i18n={testI18n}>
			<RouterProvider router={router} />
		</I18nextProvider>,
	);
	return { actionSpy, toastQueue, loaderSpy };
}

/** RAC's pending state: still a focusable native button, but aria-disabled and inert to presses. */
function isPending(element: HTMLElement): boolean {
	return (
		element.getAttribute("aria-disabled") === "true" &&
		element.hasAttribute("data-pending")
	);
}

function trigger(): HTMLElement {
	return screen.getByRole("button", { name: "Delete" });
}

function openDialog(): void {
	fireEvent.click(trigger());
}

/** Mirrors the route's real 4xx statuses, which make React Router skip its own revalidation. */
function blockedResult(messageKeys: string[]) {
	const status = messageKeys.includes("delete.not_found")
		? 404
		: messageKeys.includes("delete.forbidden")
			? 403
			: 409;
	return data({ ok: false as const, messageKeys }, { status });
}

describe("HazardousEventDeleteButton", () => {
	it("renders a native trigger button named Delete with the trash sprite and legacy's table-icon classes", () => {
		renderButton(() => blockedResult([]));

		const button = trigger();
		expect(button.tagName).toBe("BUTTON");
		expect(button.getAttribute("type")).toBe("button");
		expect(button.className).toContain("mg-button");
		expect(button.className).toContain("mg-button-table");
		expect(button.querySelector("use")?.getAttribute("href")).toBe(
			"/assets/icons/trash-alt.svg#delete",
		);
	});

	it("opens a dialog with the exact title, body, and Do not delete then Delete permanently, in that order", () => {
		renderButton(() => blockedResult([]));

		openDialog();

		const dialog = screen.getByRole("dialog");
		expect(
			screen.getByRole("heading", {
				name: "Are you sure you want to delete this record?",
			}),
		).toBeTruthy();
		expect(dialog.textContent).toContain(
			"This data cannot be recovered after being deleted.",
		);
		const footerButtons = Array.from(dialog.querySelectorAll("button")).map(
			(b) => b.textContent?.trim(),
		);
		const cancelIndex = footerButtons.indexOf("Do not delete");
		const confirmIndex = footerButtons.indexOf("Delete permanently");
		expect(cancelIndex).toBeGreaterThanOrEqual(0);
		expect(confirmIndex).toBeGreaterThan(cancelIndex);
	});

	it("gives Delete permanently a leading trash icon", () => {
		renderButton(() => blockedResult([]));
		openDialog();

		const confirm = screen.getByRole("button", { name: "Delete permanently" });
		expect(confirm.firstElementChild?.tagName.toLowerCase()).toBe("svg");
		expect(confirm.querySelector("use")?.getAttribute("href")).toBe(
			"/assets/icons/trash-alt.svg#delete",
		);
		// Without a viewBox the 24x25 sprite is clipped at size-4; cropped to the path's bounds.
		expect(confirm.firstElementChild?.getAttribute("viewBox")).toBe(
			"5 3 14 18",
		);
	});

	it.each([
		[
			"Do not delete",
			() =>
				fireEvent.click(screen.getByRole("button", { name: "Do not delete" })),
		],
		[
			"the close control",
			() => fireEvent.click(screen.getByRole("button", { name: "Close" })),
		],
		[
			"Escape",
			() =>
				fireEvent.keyDown(screen.getByRole("dialog"), {
					key: "Escape",
					code: "Escape",
				}),
		],
	])("closes on %s without submitting", (_label, close) => {
		const { actionSpy } = renderButton(() => blockedResult([]));
		openDialog();

		close();

		expect(screen.queryByRole("dialog")).toBeNull();
		expect(actionSpy).not.toHaveBeenCalled();
	});

	it("stays open on an overlay click, without submitting", () => {
		const { actionSpy } = renderButton(() => blockedResult([]));
		openDialog();

		const overlay = document.body.querySelector(".dts-dialog-overlay");
		expect(overlay).not.toBeNull();
		fireEvent.pointerDown(overlay as Element);
		fireEvent.click(overlay as Element);

		expect(screen.queryByRole("dialog")).not.toBeNull();
		expect(actionSpy).not.toHaveBeenCalled();
	});

	it("Delete permanently submits exactly one POST to the action path and closes the dialog", async () => {
		const { actionSpy } = renderButton(() => blockedResult([]));
		openDialog();

		fireEvent.click(screen.getByRole("button", { name: "Delete permanently" }));

		expect(screen.queryByRole("dialog")).toBeNull();
		await waitFor(() => expect(actionSpy).toHaveBeenCalledTimes(1));
		const request = actionSpy.mock.calls[0][0].request;
		expect(request.method).toBe("POST");
		expect(new URL(request.url).pathname).toBe(ACTION_PATH);
	});

	it("puts the trigger in React Aria's pending state (not natively disabled) and shows dts-spinner while the request is in flight", async () => {
		let settle: (value: ActionResult) => void = () => {};
		renderButton(
			() =>
				new Promise<ActionResult>((resolve) => {
					settle = resolve;
				}),
		);
		openDialog();

		fireEvent.click(screen.getByRole("button", { name: "Delete permanently" }));

		await waitFor(() => {
			expect(isPending(trigger())).toBe(true);
		});
		expect((trigger() as HTMLButtonElement).disabled).toBe(false);
		// Pointer-inert like legacy's disabled button, without losing focusability.
		expect(trigger().className).toContain("data-[pending]:pointer-events-none");
		expect(trigger().querySelector(".dts-spinner")).not.toBeNull();
		expect(trigger().querySelector("svg")).toBeNull();

		await act(async () => {
			settle(blockedResult(["delete.not_found"]));
		});
		await waitFor(() => {
			expect(isPending(trigger())).toBe(false);
		});
		expect(trigger().querySelector(".dts-spinner")).toBeNull();
	});

	it("returns focus to the trigger after confirming, and keeps it there while pending", async () => {
		let settle: (value: ActionResult) => void = () => {};
		renderButton(
			() =>
				new Promise<ActionResult>((resolve) => {
					settle = resolve;
				}),
		);
		act(() => {
			trigger().focus();
		});
		fireEvent.keyDown(trigger(), { key: "Enter", code: "Enter" });
		fireEvent.keyUp(trigger(), { key: "Enter", code: "Enter" });
		expect(screen.queryByRole("dialog")).not.toBeNull();

		fireEvent.click(screen.getByRole("button", { name: "Delete permanently" }));

		await waitFor(() => {
			expect(isPending(trigger())).toBe(true);
		});
		await waitFor(() => {
			expect(document.activeElement).toBe(trigger());
		});
		await act(async () => {
			settle(blockedResult(["delete.blocked.disaster_event"]));
		});
		expect(document.activeElement).toBe(trigger());
	});

	it.each([
		["not found", "delete.not_found"],
		["forbidden", "delete.forbidden"],
		["blocked", "delete.blocked.disaster_event"],
	])(
		"revalidates the list after a %s result, so a stale row or icon refreshes",
		async (_label, key) => {
			const { loaderSpy } = renderButton(() => blockedResult([key]));
			expect(loaderSpy).not.toHaveBeenCalled();
			openDialog();

			fireEvent.click(
				screen.getByRole("button", { name: "Delete permanently" }),
			);

			await screen.findByRole("alertdialog");
			await waitFor(() => expect(loaderSpy).toHaveBeenCalledTimes(1));
		},
	);

	it("shows the forbidden message as an error toast", async () => {
		renderButton(() => blockedResult(["delete.forbidden"]));
		openDialog();

		fireEvent.click(screen.getByRole("button", { name: "Delete permanently" }));

		const toast = await screen.findByRole("alertdialog");
		expect(toast.getAttribute("data-variant")).toBe("error");
		expect(toast.textContent).toContain(
			"You do not have permission to delete this record.",
		);
	});

	it("sends only one request on a double activation of Delete permanently", async () => {
		const { actionSpy } = renderButton(() => blockedResult([]));
		openDialog();

		const confirm = screen.getByRole("button", { name: "Delete permanently" });
		fireEvent.click(confirm);
		fireEvent.click(confirm);

		await waitFor(() => expect(actionSpy).toHaveBeenCalled());
		expect(actionSpy).toHaveBeenCalledTimes(1);
	});

	it("does not reopen the dialog while a request is in flight", async () => {
		let settle: (value: ActionResult) => void = () => {};
		const { actionSpy } = renderButton(
			() =>
				new Promise<ActionResult>((resolve) => {
					settle = resolve;
				}),
		);
		openDialog();
		fireEvent.click(screen.getByRole("button", { name: "Delete permanently" }));
		await waitFor(() => {
			expect(isPending(trigger())).toBe(true);
		});

		fireEvent.click(trigger());

		expect(screen.queryByRole("dialog")).toBeNull();
		await act(async () => {
			settle(blockedResult(["delete.not_found"]));
		});
		expect(actionSpy).toHaveBeenCalledTimes(1);
	});

	it("shows the translated message in an error toast when the action returns a blocked result", async () => {
		renderButton(() => blockedResult(["delete.blocked.disaster_event"]));
		openDialog();

		fireEvent.click(screen.getByRole("button", { name: "Delete permanently" }));

		const toast = await screen.findByRole("alertdialog");
		expect(toast.getAttribute("data-variant")).toBe("error");
		expect(toast.textContent).toContain(
			"Cannot delete hazard event because it is linked to one or more disaster events. Please delete the associated disaster events first.",
		);
		expect(screen.queryByRole("dialog")).toBeNull();
	});

	it("shows every blocking message, in the returned order, in a single toast", async () => {
		renderButton(() =>
			blockedResult([
				"delete.blocked.disaster_event",
				"delete.blocked.causal_chain",
			]),
		);
		openDialog();

		fireEvent.click(screen.getByRole("button", { name: "Delete permanently" }));

		const toast = await screen.findByRole("alertdialog");
		expect(screen.getAllByRole("alertdialog")).toHaveLength(1);
		const text = toast.textContent ?? "";
		const disasterAt = text.indexOf("linked to one or more disaster events.");
		const causalAt = text.indexOf("linked to another hazardous event");
		expect(disasterAt).toBeGreaterThanOrEqual(0);
		expect(causalAt).toBeGreaterThan(disasterAt);
	});

	it("shows the not-found message as an error toast", async () => {
		renderButton(() => blockedResult(["delete.not_found"]));
		openDialog();

		fireEvent.click(screen.getByRole("button", { name: "Delete permanently" }));

		const toast = await screen.findByRole("alertdialog");
		expect(toast.textContent).toContain("Record not found or access denied");
	});

	it("keeps the toast visible after the button unmounts (e.g. the row leaves the list)", async () => {
		const toastQueue = createToastQueue();
		function Harness({ showButton }: { showButton: boolean }) {
			return (
				<>
					{showButton && (
						<HazardousEventDeleteButton
							action={ACTION_PATH}
							toastQueue={toastQueue}
						/>
					)}
					<ToastRegion queue={toastQueue} closeLabel="Close" />
				</>
			);
		}
		const router = createMemoryRouter(
			[
				{ path: "/", element: <Harness showButton /> },
				{ path: "/gone", element: <Harness showButton={false} /> },
				{
					path: ACTION_PATH,
					action: () => blockedResult(["delete.not_found"]),
				},
			],
			{ initialEntries: ["/"] },
		);
		render(
			<I18nextProvider i18n={testI18n}>
				<RouterProvider router={router} />
			</I18nextProvider>,
		);
		openDialog();
		fireEvent.click(screen.getByRole("button", { name: "Delete permanently" }));
		await screen.findByRole("alertdialog");

		await act(async () => {
			await router.navigate("/gone");
		});

		expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
		expect(screen.getByRole("alertdialog").textContent).toContain(
			"Record not found or access denied",
		);
	});

	it("shows no toast when the action redirects (success is reported by the root flash)", async () => {
		renderButton(
			() => new Response(null, { status: 302, headers: { Location: "/" } }),
		);
		openDialog();

		fireEvent.click(screen.getByRole("button", { name: "Delete permanently" }));

		await waitFor(() => expect(isPending(trigger())).toBe(false));
		expect(screen.queryByRole("alertdialog")).toBeNull();
	});

	it("imports nothing from PrimeReact and renders no PrimeIcons class", () => {
		renderButton(() => blockedResult([]));
		openDialog();

		expect(document.body.innerHTML).not.toMatch(
			/\bp-(button|dialog|toast)|\bpi-/,
		);
	});
});
