import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";

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
			id: "uca-1",
			userId: "u-1",
			countryAccountsId: "tenant-1",
			role: "admin",
			isPrimaryAdmin: true,
			addedAt: new Date("2026-09-14T10:00:00Z"),
			organizationId: "org-1",
			user: {
				id: "u-1",
				firstName: "Marie",
				lastName: "Joseph",
				email: "marie.joseph@dgpc.gouv.ht",
				emailVerified: true,
			},
			organization: { id: "org-1", name: "DGPC Haiti" },
		},
		{
			id: "uca-2",
			userId: "u-2",
			countryAccountsId: "tenant-1",
			role: "data-collector",
			isPrimaryAdmin: false,
			addedAt: new Date("2026-09-02T10:00:00Z"),
			organizationId: null,
			user: {
				id: "u-2",
				firstName: "",
				lastName: "",
				email: "pending.user@redcross.ht",
				emailVerified: false,
			},
			organization: null,
		},
	],
	pagination: {
		total: 2,
		pageNumber: 1,
		pageSize: 25,
		totalPages: 1,
		extraParams: {},
	},
	organizations: [
		{ id: "org-1", name: "DGPC Haiti" },
		{ id: "org-2", name: "Red Cross Haiti" },
	],
	search: "",
	roleFilter: "all",
	sort: "added" as const,
	dir: "desc" as const,
	userRole: "admin",
};

let currentLoaderData = { ...baseLoaderData };

vi.mock("react-router", () => ({
	useLoaderData: () => currentLoaderData,
	useNavigate: () => mockNavigate,
	useLocation: () => ({ pathname: "/en/settings/access-mgmnt/", search: "" }),
	useFetcher: () => mockFetcherState,
	useNavigation: () => ({ state: "idle" }),
}));

vi.mock("~/frontend/context", () => ({
	ViewContext: class {
		lang = "en";
		url(path: string) {
			return `/en${path.startsWith("/") ? path : `/${path}`}`;
		}
		t(
			opts: { code: string; msg: string },
			params?: Record<string, string | number>,
		) {
			let msg = opts.msg;
			if (params) {
				for (const [k, v] of Object.entries(params)) {
					msg = msg.replaceAll(`{${k}}`, String(v));
				}
			}
			return msg;
		}
	},
}));

import AccessManagementPage from "~/pages/AccessManagementPage";

beforeAll(() => {
	if (!Element.prototype.scrollTo) {
		Element.prototype.scrollTo = vi.fn();
	}
});

beforeEach(() => {
	mockNavigate.mockReset();
	mockSubmit.mockReset();
	currentLoaderData = { ...baseLoaderData };
	mockFetcherState = { state: "idle", data: undefined, submit: mockSubmit };
});

afterEach(() => {
	cleanup();
});

describe("AccessManagementPage (<main> v0.7.2 redesign)", () => {
	it("renders v0.7.2 main layout without NavSettings, user count banner, or status legend", () => {
		render(<AccessManagementPage />);

		expect(
			screen.getByRole("heading", { level: 1, name: "Access management" }),
		).toBeTruthy();
		expect(
			screen.getByText("Invite people and set what they can do on this site."),
		).toBeTruthy();
		expect(screen.getByRole("button", { name: "Invite user" })).toBeTruthy();

		// Legacy elements must be absent
		expect(screen.queryByText(/Currently there are/i)).toBeNull();
		expect(screen.queryByText(/Status legend/i)).toBeNull();
		expect(screen.queryByText("System settings")).toBeNull();
	});

	it("renders active & pending user rows with email fallback, dash org, Primary Admin protection, and CSS sentence-case role", () => {
		render(<AccessManagementPage />);

		// Active primary admin row
		expect(screen.getByText("Marie Joseph")).toBeTruthy();
		expect(screen.getByText("Active")).toBeTruthy();
		expect(screen.getByText("DGPC Haiti")).toBeTruthy();
		expect(screen.getByText(/Primary Admin/)).toBeTruthy();

		// Primary admin Edit & Delete are disabled
		const editMarie = screen.getByRole("button", {
			name: "Edit Marie Joseph",
		}) as HTMLButtonElement;
		const deleteMarie = screen.getByRole("button", {
			name: "Delete Marie Joseph",
		}) as HTMLButtonElement;
		expect(editMarie.disabled).toBe(true);
		expect(deleteMarie.disabled).toBe(true);

		// Pending user with empty name falls back to email and shows "-" for empty org
		const pendingEmails = screen.getAllByText("pending.user@redcross.ht");
		expect(pendingEmails.length).toBeGreaterThanOrEqual(2); // Name cell + Email cell
		expect(screen.getByText("Invitation pending")).toBeTruthy();
		expect(screen.getByText("-")).toBeTruthy();
		expect(
			screen.getByRole("button", {
				name: "Resend invitation to pending.user@redcross.ht",
			}),
		).toBeTruthy();
	});

	it("validates Invite user dialog inline, clears errors on edit, keeps organization optional, and submits via fetcher", async () => {
		const user = userEvent.setup();
		render(<AccessManagementPage />);

		await user.click(screen.getByRole("button", { name: "Invite user" }));
		const dialog = screen.getByRole("dialog", { name: "Invite user" });
		expect(dialog).toBeTruthy();

		// Submit empty -> inline errors appear
		await user.click(
			within(dialog).getByRole("button", { name: "Send invitation" }),
		);
		expect(within(dialog).getByText("Enter an email address.")).toBeTruthy();
		expect(within(dialog).getByText("Select a role.")).toBeTruthy();
		expect(mockSubmit).not.toHaveBeenCalled();

		// Typing clears email error
		const emailInput = within(dialog).getByPlaceholderText(
			"name@organization.org",
		);
		await user.type(emailInput, "new.person@example.org");
		expect(within(dialog).queryByText("Enter an email address.")).toBeNull();

		// Select role (organization left empty)
		const roleBtn = within(dialog).getByRole("button", { name: /Role/i });
		await user.click(roleBtn);
		await user.click(screen.getByRole("option", { name: /Data Collector/i }));
		expect(within(dialog).queryByText("Select a role.")).toBeNull();

		await user.click(
			within(dialog).getByRole("button", { name: "Send invitation" }),
		);
		expect(mockSubmit).toHaveBeenCalledTimes(1);
		const [formData, options] = mockSubmit.mock.calls[0];
		expect(formData.get("email")).toBe("new.person@example.org");
		expect(formData.get("organization")).toBe("");
		expect(formData.get("role")).toBe("data-collector");
		expect(formData.get("_fetcher")).toBe("1");
		expect(options).toEqual({
			method: "post",
			action: "/en/settings/access-mgmnt/new",
		});
	});

	it("opens Edit user dialog with read-only metadata, disabled email, and submits via fetcher", async () => {
		const user = userEvent.setup();
		render(<AccessManagementPage />);

		await user.click(
			screen.getByRole("button", { name: "Edit pending.user@redcross.ht" }),
		);
		const dialog = screen.getByRole("dialog", { name: "Edit user" });
		expect(within(dialog).getByText("System Admin")).toBeTruthy();
		expect(within(dialog).getByText("Invitation pending")).toBeTruthy();

		const emailInput = within(dialog).getByDisplayValue(
			"pending.user@redcross.ht",
		) as HTMLInputElement;
		expect(emailInput.disabled).toBe(true);

		await user.click(
			within(dialog).getByRole("button", { name: "Save changes" }),
		);
		expect(mockSubmit).toHaveBeenCalledTimes(1);
		const [, options] = mockSubmit.mock.calls[0];
		expect(options).toEqual({
			method: "post",
			action: "/en/settings/access-mgmnt/edit/u-2",
		});
	});

	it("opens Delete user alertdialog naming the user (email fallback) and submits via fetcher", async () => {
		const user = userEvent.setup();
		render(<AccessManagementPage />);

		await user.click(
			screen.getByRole("button", { name: "Delete pending.user@redcross.ht" }),
		);
		const dialog = screen.getByRole("alertdialog", { name: "Delete user" });
		expect(
			within(dialog).getByText(
				/will lose access to DELTA\. This cannot be undone\./,
			),
		).toBeTruthy();

		await user.click(
			within(dialog).getByRole("button", { name: "Delete user" }),
		);
		expect(mockSubmit).toHaveBeenCalledTimes(1);
		const [, options] = mockSubmit.mock.calls[0];
		expect(options).toEqual({
			method: "post",
			action: "/en/settings/access-mgmnt/delete/u-2",
		});
	});

	it("triggers one-click resend invitation directly from pending user row without confirmation dialog", async () => {
		const user = userEvent.setup();
		render(<AccessManagementPage />);

		await user.click(
			screen.getByRole("button", {
				name: "Resend invitation to pending.user@redcross.ht",
			}),
		);
		expect(screen.queryByRole("dialog")).toBeNull();
		expect(mockSubmit).toHaveBeenCalledTimes(1);
		const [formData, options] = mockSubmit.mock.calls[0];
		expect(formData.get("_fetcher")).toBe("1");
		expect(options).toEqual({
			method: "post",
			action: "/en/settings/access-mgmnt/resend-invitation/u-2",
		});
	});
});
