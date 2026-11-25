import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FormSelect } from "~/design-system/components";

const mockSubmit = vi.fn();
let mockFetcherState: {
	state: "idle" | "submitting" | "loading";
	data: any;
	submit: typeof mockSubmit;
} = {
	state: "idle",
	data: undefined,
	submit: mockSubmit,
};

const baseLoaderData = {
	publicURL: "https://delta.undrr.org/haiti",
	currencyArray: ["HTG"],
	availableLanguages: ["en", "fr", "es"],
	systemLanguage: "fr",
	confEmailObj: {
		EMAIL_TRANSPORT: "smtp",
		SMTP_HOST: "smtp.undrr.org",
		SMTP_PORT: "587",
		SMTP_SECURE: true,
	},
	instanceSystemSettings: {
		id: "settings-1",
		websiteName: "DGPC Haiti",
		language: "fr",
		currencyCode: "HTG",
		totpIssuer: "DELTA Resilience Haiti",
	},
	dtsSystemInfo: {
		versionNo: "1.4.2",
	},
	country: {
		id: "country-1",
		name: "Haiti",
	},
	userRole: "admin",
	countryAccountType: "Official",
};

let currentLoaderData = structuredClone(baseLoaderData);

vi.mock("react-router", () => ({
	useLoaderData: () => currentLoaderData,
	useFetcher: () => mockFetcherState,
}));

vi.mock("~/frontend/context", () => ({
	ViewContext: class {
		lang = "en";
		url(path: string) {
			return `/en${path}`;
		}
		t(
			params: { code: string; msg: string },
			replacements?: Record<string, string | number>,
		) {
			let out = params.msg;
			if (replacements) {
				for (const [k, v] of Object.entries(replacements)) {
					out = out.replaceAll(`{${k}}`, String(v));
				}
			}
			return out;
		}
	},
}));

import SystemSettingsPage from "~/pages/SystemSettingsPage";

describe("FormSelect helpText", () => {
	afterEach(() => {
		cleanup();
	});

	it("renders helpText when valid and replaces it with errorMessage when invalid", () => {
		const { rerender } = render(
			<FormSelect
				label="Language"
				items={[{ id: "en", label: "English" }]}
				value="en"
				onChange={() => {}}
				placeholder="Select language"
				helpText="The default language for everyone on this instance."
			/>,
		);

		expect(
			screen.getByText("The default language for everyone on this instance."),
		).toBeTruthy();

		rerender(
			<FormSelect
				label="Language"
				items={[{ id: "en", label: "English" }]}
				value="en"
				onChange={() => {}}
				placeholder="Select language"
				helpText="The default language for everyone on this instance."
				errorMessage="Select a language."
			/>,
		);

		expect(screen.getByText("Select a language.")).toBeTruthy();
		expect(
			screen.queryByText("The default language for everyone on this instance."),
		).toBeNull();
	});
});

describe("SystemSettingsPage", () => {
	beforeEach(() => {
		currentLoaderData = structuredClone(baseLoaderData);
		mockSubmit.mockReset();
		mockFetcherState = {
			state: "idle",
			data: undefined,
			submit: mockSubmit,
		};
	});

	afterEach(() => {
		cleanup();
	});

	it("renders 4 setting groups with Intl.DisplayNames language, raw DB Type/Currency, and SMTP rows", () => {
		render(<SystemSettingsPage />);

		expect(
			screen.getByRole("heading", { level: 1, name: "System settings" }),
		).toBeTruthy();
		expect(
			screen.getByText("How this instance of DELTA Resilience is set up."),
		).toBeTruthy();

		const headings = screen
			.getAllByRole("heading", { level: 2 })
			.map((h) => h.textContent);
		expect(headings).toEqual(["Instance", "Country", "Email", "Software"]);

		expect(screen.getByText("DGPC Haiti")).toBeTruthy();
		expect(screen.getByText("French")).toBeTruthy();
		expect(screen.getByText("https://delta.undrr.org/haiti")).toBeTruthy();
		expect(screen.getByText("Name shown in authenticator apps")).toBeTruthy();
		expect(screen.getByText("DELTA Resilience Haiti")).toBeTruthy();

		expect(
			screen.getByText(
				"Set when the instance was created. Contact UNDRR to change it.",
			),
		).toBeTruthy();
		expect(screen.getByText("Haiti")).toBeTruthy();
		expect(screen.getByText("Official")).toBeTruthy();
		expect(screen.getByText("HTG")).toBeTruthy();

		expect(
			screen.getByText(
				"Set on the server. How DELTA sends invitations and password emails.",
			),
		).toBeTruthy();
		expect(screen.getByText("SMTP")).toBeTruthy();
		expect(screen.getByText("smtp.undrr.org")).toBeTruthy();
		expect(screen.getByText("587")).toBeTruthy();
		expect(screen.getByText("Secure connection")).toBeTruthy();
		expect(screen.getByText("Yes")).toBeTruthy();

		expect(screen.getByText("DELTA Resilience version")).toBeTruthy();
		expect(screen.getByText("1.4.2")).toBeTruthy();
	});

	it("hides SMTP-only rows when EMAIL_TRANSPORT is not smtp", () => {
		currentLoaderData = {
			...structuredClone(baseLoaderData),
			confEmailObj: {
				EMAIL_TRANSPORT: "file",
				SMTP_HOST: "",
				SMTP_PORT: "",
				SMTP_SECURE: false,
			},
		};
		render(<SystemSettingsPage />);

		expect(screen.getByText("file")).toBeTruthy();
		expect(screen.queryByText("Host")).toBeNull();
		expect(screen.queryByText("Port")).toBeNull();
		expect(screen.queryByText("Secure connection")).toBeNull();
	});

	it("opens Edit instance settings dialog, validates empty/50-char name, ignores outside click, submits, and shows toast", async () => {
		const user = userEvent.setup();
		const { rerender } = render(<SystemSettingsPage />);

		await user.click(screen.getByRole("button", { name: "Edit" }));
		const dialog = screen.getByRole("dialog", {
			name: "Edit instance settings",
		});
		expect(dialog).toBeTruthy();
		expect(
			within(dialog).getByText("Shown in the site selector and in emails."),
		).toBeTruthy();
		expect(
			within(dialog).getByText(
				"The default language for everyone on this instance.",
			),
		).toBeTruthy();
		expect(
			within(dialog).getByText("Changes apply the next time you sign in."),
		).toBeTruthy();

		// Clicking backdrop does NOT dismiss
		await user.click(screen.getByTestId("modal-overlay"));
		expect(
			screen.getByRole("dialog", { name: "Edit instance settings" }),
		).toBeTruthy();

		// Empty validation & clear on edit
		const nameInput = within(dialog).getByLabelText("Instance name");
		await user.clear(nameInput);
		await user.click(
			within(dialog).getByRole("button", { name: "Save changes" }),
		);
		expect(within(dialog).getByText("Enter an instance name.")).toBeTruthy();
		expect(mockSubmit).not.toHaveBeenCalled();

		// Over-50-char validation & clear on edit
		await user.type(nameInput, "A".repeat(51));
		expect(within(dialog).queryByText("Enter an instance name.")).toBeNull();
		await user.click(
			within(dialog).getByRole("button", { name: "Save changes" }),
		);
		expect(
			within(dialog).getByText("Instance name must be 50 characters or fewer."),
		).toBeTruthy();
		expect(mockSubmit).not.toHaveBeenCalled();

		await user.clear(nameInput);
		await user.type(nameInput, "New Instance Name");
		expect(
			within(dialog).queryByText(
				"Instance name must be 50 characters or fewer.",
			),
		).toBeNull();

		// Valid submit
		await user.click(
			within(dialog).getByRole("button", { name: "Save changes" }),
		);
		expect(mockSubmit).toHaveBeenCalledTimes(1);
		const [formData, options] = mockSubmit.mock.calls[0];
		expect(formData.get("instanceName")).toBe("New Instance Name");
		expect(formData.get("language")).toBe("fr");
		expect(options).toEqual({
			method: "post",
			action: "/en/settings/system",
		});

		// Simulate fetcher success -> closes modal & shows toast
		mockFetcherState = {
			state: "idle",
			data: { ok: true },
			submit: mockSubmit,
		};
		rerender(<SystemSettingsPage />);

		expect(
			screen.queryByRole("dialog", { name: "Edit instance settings" }),
		).toBeNull();
		expect(
			screen.getByText("Settings saved. They apply the next time you sign in."),
		).toBeTruthy();
	});

	it("keeps dialog open and shows server error callout on failed action response", async () => {
		const user = userEvent.setup();
		const { rerender } = render(<SystemSettingsPage />);

		await user.click(screen.getByRole("button", { name: "Edit" }));
		const dialog = screen.getByRole("dialog", {
			name: "Edit instance settings",
		});
		await user.click(
			within(dialog).getByRole("button", { name: "Save changes" }),
		);

		mockFetcherState = {
			state: "idle",
			data: { ok: false, error: "Could not save settings." },
			submit: mockSubmit,
		};
		rerender(<SystemSettingsPage />);

		expect(
			screen.getByRole("dialog", { name: "Edit instance settings" }),
		).toBeTruthy();
		expect(screen.getByRole("alert").textContent).toContain(
			"Could not save settings.",
		);
	});
});
