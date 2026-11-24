import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockNavigate = vi.fn();
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
	items: [
		{
			id: "key-1",
			name: "National statistics sync",
			secret: "dk_7f3a9c2e41b84d06a5e2c97b10f3d8aa",
			createdAt: new Date("2026-09-18T10:00:00Z"),
			managedByUserId: "u-1",
			managedByUser: { email: "anna.charles@ihsi.ht" },
		},
		{
			id: "key-2",
			name: "Early warning dashboard",
			secret: "dk_b21e0d7c9a4f4c1e8d3360f5a7b942c1",
			createdAt: new Date("2026-08-04T10:00:00Z"),
			managedByUserId: "u-2",
			managedByUser: { email: "marie.joseph@dgpc.gouv.ht" },
		},
	],
	total: 2,
	existingNames: ["National statistics sync", "Early warning dashboard"],
	sort: "created" as const,
	dir: "desc" as const,
	page: 1,
	pageSize: 25,
	canAdd: true,
	canEdit: true,
};

let currentLoaderData = { ...baseLoaderData };

vi.mock("react-router", () => ({
	useLoaderData: () => currentLoaderData,
	useNavigate: () => mockNavigate,
	useLocation: () => ({ pathname: "/en/settings/api-key/", search: "" }),
	useFetcher: () => mockFetcherState,
	useNavigation: () => ({ state: "idle" }),
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

import ApiKeysPage from "~/pages/ApiKeysPage";

describe("ApiKeysPage", () => {
	const writeTextMock = vi.fn().mockResolvedValue(undefined);

	beforeEach(() => {
		currentLoaderData = { ...baseLoaderData };
		mockNavigate.mockReset();
		mockSubmit.mockReset();
		writeTextMock.mockReset().mockResolvedValue(undefined);
		mockFetcherState = {
			state: "idle",
			data: undefined,
			submit: mockSubmit,
		};
		Object.defineProperty(navigator, "clipboard", {
			value: { writeText: writeTextMock },
			configurable: true,
		});
	});

	afterEach(() => {
		cleanup();
	});

	it("renders header, masked monospace keys, formatted dates, and pagination", () => {
		render(<ApiKeysPage />);

		expect(screen.getByRole("heading", { name: "API keys" })).toBeTruthy();
		expect(
			screen.getByText(
				"Keys that let other applications read and send data for this site.",
			),
		).toBeTruthy();
		expect(screen.getByText("National statistics sync")).toBeTruthy();
		expect(screen.getByText("dk_7f…")).toBeTruthy();
		expect(screen.getByText("anna.charles@ihsi.ht")).toBeTruthy();
		expect(screen.getByText(/18 Sept? 2026/)).toBeTruthy();
		expect(screen.getByText("Showing 1-2 of 2 keys")).toBeTruthy();
	});

	it("copies full secret and shows Key copied toast", async () => {
		const user = userEvent.setup();
		const spy = vi
			.spyOn(navigator.clipboard, "writeText")
			.mockResolvedValue(undefined);
		render(<ApiKeysPage />);

		await user.click(
			screen.getByRole("button", {
				name: "Copy key for National statistics sync",
			}),
		);

		expect(spy).toHaveBeenCalledWith("dk_7f3a9c2e41b84d06a5e2c97b10f3d8aa");
		expect(screen.getByText("Key copied.")).toBeTruthy();
	});

	it("renders empty state with secondary Add API key button when canAdd is true", () => {
		currentLoaderData = {
			...baseLoaderData,
			items: [],
			total: 0,
			existingNames: [],
		};
		render(<ApiKeysPage />);

		expect(
			screen.getByText(
				"No API keys yet. Add one when another application needs access to this site's data.",
			),
		).toBeTruthy();
		expect(screen.getAllByRole("button", { name: "Add API key" })).toHaveLength(
			2,
		);
	});

	it("validates empty and duplicate names, clears error on edit, ignores backdrop click, and opens reveal dialog on create", async () => {
		const user = userEvent.setup();
		const spy = vi
			.spyOn(navigator.clipboard, "writeText")
			.mockResolvedValue(undefined);
		const { rerender } = render(<ApiKeysPage />);

		await user.click(screen.getByRole("button", { name: "Add API key" }));
		const dialog = screen.getByRole("dialog", { name: "Add API key" });
		expect(dialog).toBeTruthy();

		// Clicking outside overlay must NOT close the dialog
		await user.click(screen.getByTestId("modal-overlay"));
		expect(screen.getByRole("dialog", { name: "Add API key" })).toBeTruthy();

		// Empty submit shows inline error
		await user.click(
			within(dialog).getByRole("button", { name: "Create key" }),
		);
		expect(screen.getByText("Enter a name.")).toBeTruthy();

		// Typing clears inline error
		const input = within(dialog).getByLabelText(/Name/);
		await user.type(input, "early warning dashboard");
		expect(screen.queryByText("Enter a name.")).toBeNull();

		// Duplicate name rejected client-side
		await user.click(
			within(dialog).getByRole("button", { name: "Create key" }),
		);
		expect(
			screen.getByText("A key with this name already exists."),
		).toBeTruthy();
		expect(mockSubmit).not.toHaveBeenCalled();

		// Valid unique name submits via fetcher
		await user.clear(input);
		await user.type(input, "Red Cross field app");
		await user.click(
			within(dialog).getByRole("button", { name: "Create key" }),
		);
		expect(mockSubmit).toHaveBeenCalledTimes(1);

		// Simulate fetcher returning newly created key
		mockFetcherState = {
			state: "idle",
			data: {
				ok: true,
				key: {
					id: "key-3",
					name: "Red Cross field app",
					secret: "dk_04c8e6a1f7d24b93b0a5d1e86c7f3920",
				},
			},
			submit: mockSubmit,
		};
		rerender(<ApiKeysPage />);

		const revealDialog = screen.getByRole("dialog", {
			name: "API key created",
		});
		expect(
			within(revealDialog).getByText("Red Cross field app is ready to use"),
		).toBeTruthy();
		const keyInput = within(revealDialog).getByLabelText(
			"Key",
		) as HTMLInputElement;
		expect(keyInput.readOnly).toBe(true);
		expect(keyInput.value).toBe("dk_04c8e6a1f7d24b93b0a5d1e86c7f3920");

		await user.click(
			within(revealDialog).getByRole("button", { name: "Copy key" }),
		);
		expect(spy).toHaveBeenCalledWith("dk_04c8e6a1f7d24b93b0a5d1e86c7f3920");
		expect(screen.getByText("Key copied.")).toBeTruthy();

		await user.click(
			within(revealDialog).getByRole("button", { name: "Done" }),
		);
		expect(
			screen.queryByRole("dialog", { name: "API key created" }),
		).toBeNull();
	});

	it("supports rename and delete dialogs with toast confirmations", async () => {
		const user = userEvent.setup();
		const { rerender } = render(<ApiKeysPage />);

		await user.click(
			screen.getByRole("button", { name: "Rename National statistics sync" }),
		);
		const renameDialog = screen.getByRole("dialog", {
			name: "Rename API key",
		});
		const input = within(renameDialog).getByLabelText(/Name/);
		await user.clear(input);
		await user.type(input, "IHSI sync");
		await user.click(
			within(renameDialog).getByRole("button", { name: "Save changes" }),
		);
		expect(mockSubmit).toHaveBeenCalledTimes(1);

		mockFetcherState = {
			state: "idle",
			data: { ok: true },
			submit: mockSubmit,
		};
		rerender(<ApiKeysPage />);
		expect(screen.getByText("Changes saved.")).toBeTruthy();

		await user.click(
			screen.getByRole("button", { name: "Delete Early warning dashboard" }),
		);
		const deleteDialog = screen.getByRole("alertdialog", {
			name: "Delete API key",
		});
		expect(
			within(deleteDialog).getByText(/This cannot be undone\./),
		).toBeTruthy();
		await user.click(
			within(deleteDialog).getByRole("button", { name: "Delete key" }),
		);
		expect(mockSubmit).toHaveBeenCalledTimes(2);

		mockFetcherState = {
			state: "idle",
			data: { ok: true },
			submit: mockSubmit,
		};
		rerender(<ApiKeysPage />);
		expect(
			screen.getByText("Early warning dashboard was deleted."),
		).toBeTruthy();
	});

	it("hides add, rename, and delete controls when user lacks permissions", () => {
		currentLoaderData = {
			...baseLoaderData,
			canAdd: false,
			canEdit: false,
		};
		render(<ApiKeysPage />);

		expect(screen.queryByRole("button", { name: "Add API key" })).toBeNull();
		expect(screen.queryByRole("button", { name: /Rename / })).toBeNull();
		expect(screen.queryByRole("button", { name: /Delete / })).toBeNull();
	});

	it("updates URL query params on sort change and closes dialogs with Escape", async () => {
		const user = userEvent.setup();
		render(<ApiKeysPage />);

		await user.click(screen.getByRole("columnheader", { name: "Name" }));
		expect(mockNavigate).toHaveBeenCalledWith(
			"/en/settings/api-key/?sort=name&dir=asc&page=1&pageSize=25",
		);

		await user.click(screen.getByRole("button", { name: "Add API key" }));
		expect(screen.getByRole("dialog", { name: "Add API key" })).toBeTruthy();
		await user.keyboard("{Escape}");
		expect(screen.queryByRole("dialog", { name: "Add API key" })).toBeNull();
	});
});
