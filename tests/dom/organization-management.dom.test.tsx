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
	filters: {
		search: "",
		sort: "name" as const,
		dir: "asc" as const,
	},
	data: {
		items: [
			{ id: "org-1", name: "DGPC Haiti", users: 4 },
			{ id: "org-2", name: "Statistics Office", users: 0 },
		],
		existingNames: ["DGPC Haiti", "Statistics Office"],
		pagination: {
			totalItems: 2,
			itemsOnThisPage: 2,
			page: 1,
			pageSize: 25,
			extraParams: {},
		},
	},
	canManage: true,
	canAdd: true,
};

let currentLoaderData = structuredClone(baseLoaderData);

vi.mock("react-router", () => ({
	useLoaderData: () => currentLoaderData,
	useNavigate: () => mockNavigate,
	useLocation: () => ({ pathname: "/en/settings/organizations/", search: "" }),
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

import OrganizationManagementPage from "~/pages/OrganizationManagementPage";

describe("OrganizationManagementPage", () => {
	beforeEach(() => {
		currentLoaderData = structuredClone(baseLoaderData);
		mockNavigate.mockReset();
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

	it("renders header, subtitle, search bar, Name and Users columns, and pagination", () => {
		render(<OrganizationManagementPage />);

		expect(
			screen.getByRole("heading", { level: 1, name: "Organizations" }),
		).toBeTruthy();
		expect(
			screen.getByText("The organizations people on this site belong to."),
		).toBeTruthy();
		expect(screen.getByPlaceholderText("Search by name")).toBeTruthy();
		expect(screen.getByText("DGPC Haiti")).toBeTruthy();
		expect(screen.getByText("4")).toBeTruthy();
		expect(screen.getByText("Statistics Office")).toBeTruthy();
		expect(screen.getByText("Showing 1-2 of 2 organizations")).toBeTruthy();
	});

	it("renders search empty state with Clear search button and zero-org empty state", async () => {
		const user = userEvent.setup();
		currentLoaderData = {
			...structuredClone(baseLoaderData),
			filters: { search: "unknown", sort: "name", dir: "asc" },
			data: {
				items: [],
				existingNames: ["DGPC Haiti"],
				pagination: {
					totalItems: 0,
					itemsOnThisPage: 0,
					page: 1,
					pageSize: 25,
					extraParams: { search: ["unknown"] },
				},
			},
		};
		const { rerender } = render(<OrganizationManagementPage />);

		expect(screen.getByText('No organizations match "unknown".')).toBeTruthy();
		await user.click(screen.getByRole("button", { name: "Clear search" }));
		expect(mockNavigate).toHaveBeenCalledWith(
			"/en/settings/organizations/?sort=name&dir=asc&page=1&pageSize=25",
		);

		currentLoaderData = {
			...structuredClone(baseLoaderData),
			filters: { search: "", sort: "name", dir: "asc" },
			data: {
				items: [],
				existingNames: [],
				pagination: {
					totalItems: 0,
					itemsOnThisPage: 0,
					page: 1,
					pageSize: 25,
					extraParams: {},
				},
			},
		};
		rerender(<OrganizationManagementPage />);
		expect(screen.getByText("No organizations yet.")).toBeTruthy();
	});

	it("validates Add organization dialog, ignores backdrop click, supports Enter submit, and shows toast", async () => {
		const user = userEvent.setup();
		const { rerender } = render(<OrganizationManagementPage />);

		await user.click(screen.getByRole("button", { name: "Add organization" }));
		const dialog = screen.getByRole("dialog", { name: "Add organization" });

		// Clicking overlay outside must NOT dismiss
		await user.click(screen.getByTestId("modal-overlay"));
		expect(
			screen.getByRole("dialog", { name: "Add organization" }),
		).toBeTruthy();

		// Empty submit shows inline error
		await user.click(
			within(dialog).getByRole("button", { name: "Add organization" }),
		);
		expect(screen.getByText("Enter a name.")).toBeTruthy();

		// Typing clears error immediately
		const input = within(dialog).getByLabelText(/Name/);
		await user.type(input, "dgpc haiti");
		expect(screen.queryByText("Enter a name.")).toBeNull();

		// Duplicate name rejected client-side
		await user.click(
			within(dialog).getByRole("button", { name: "Add organization" }),
		);
		expect(
			screen.getByText("An organization with this name already exists."),
		).toBeTruthy();
		expect(mockSubmit).not.toHaveBeenCalled();

		// Unique name submitted via Enter key
		await user.clear(input);
		await user.type(input, "Red Cross Haiti{Enter}");
		expect(mockSubmit).toHaveBeenCalledTimes(1);

		mockFetcherState = {
			state: "idle",
			data: { ok: true, intent: "create" },
			submit: mockSubmit,
		};
		rerender(<OrganizationManagementPage />);
		expect(screen.getByText("Red Cross Haiti was added.")).toBeTruthy();
	});

	it("blocks deleting an organization with users up front and confirms unused deletion", async () => {
		const user = userEvent.setup();
		const { rerender } = render(<OrganizationManagementPage />);

		// In-use organization (4 users)
		await user.click(screen.getByRole("button", { name: "Delete DGPC Haiti" }));
		const blockedDialog = screen.getByRole("alertdialog", {
			name: "This organization is in use",
		});
		expect(
			within(blockedDialog).getByText(
				/has 4 users\. Move them to another organization in Access management, then delete it\./,
			),
		).toBeTruthy();
		expect(
			within(blockedDialog).queryByRole("button", {
				name: "Delete organization",
			}),
		).toBeNull();

		await user.keyboard("{Escape}");
		expect(
			screen.queryByRole("alertdialog", {
				name: "This organization is in use",
			}),
		).toBeNull();

		// Unused organization (0 users)
		await user.click(
			screen.getByRole("button", { name: "Delete Statistics Office" }),
		);
		const deleteDialog = screen.getByRole("alertdialog", {
			name: "Delete organization",
		});
		expect(
			within(deleteDialog).getByText(/This cannot be undone\./),
		).toBeTruthy();

		await user.click(
			within(deleteDialog).getByRole("button", { name: "Delete organization" }),
		);
		expect(mockSubmit).toHaveBeenCalledTimes(1);

		mockFetcherState = {
			state: "idle",
			data: { ok: true, intent: "delete" },
			submit: mockSubmit,
		};
		rerender(<OrganizationManagementPage />);
		expect(screen.getByText("Statistics Office was deleted.")).toBeTruthy();
	});

	it("supports Edit organization dialog and URL sort updates", async () => {
		const user = userEvent.setup();
		const { rerender } = render(<OrganizationManagementPage />);

		await user.click(screen.getByRole("columnheader", { name: "Users" }));
		expect(mockNavigate).toHaveBeenCalledWith(
			"/en/settings/organizations/?sort=users&dir=asc&page=1&pageSize=25",
		);

		await user.click(screen.getByRole("button", { name: "Edit DGPC Haiti" }));
		const editDialog = screen.getByRole("dialog", {
			name: "Edit organization",
		});
		const input = within(editDialog).getByLabelText(/Name/);
		await user.clear(input);
		await user.type(input, "DGPC National");
		await user.click(
			within(editDialog).getByRole("button", { name: "Save changes" }),
		);
		expect(mockSubmit).toHaveBeenCalledTimes(1);

		mockFetcherState = {
			state: "idle",
			data: { ok: true, intent: "update" },
			submit: mockSubmit,
		};
		rerender(<OrganizationManagementPage />);
		expect(screen.getByText("Changes saved.")).toBeTruthy();
	});

	it("hides add, edit, and delete buttons when user lacks permissions", () => {
		currentLoaderData = {
			...structuredClone(baseLoaderData),
			canManage: false,
			canAdd: false,
		};
		render(<OrganizationManagementPage />);

		expect(
			screen.queryByRole("button", { name: "Add organization" }),
		).toBeNull();
		expect(screen.queryByRole("button", { name: /Edit / })).toBeNull();
		expect(screen.queryByRole("button", { name: /Delete / })).toBeNull();
	});
});
