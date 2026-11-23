import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
	Button,
	FilterSelect,
	FormSelect,
	ModalDialog,
	Pagination,
	SortableTable,
	StatusIndicator,
	TextField,
	ToastRegion,
	Tooltip,
} from "~/design-system/ui";

beforeAll(() => {
	if (!Element.prototype.scrollTo) {
		Element.prototype.scrollTo = vi.fn();
	}
});

afterEach(() => {
	cleanup();
});

describe("DELTA Design System v0.7.2 UI primitives", () => {
	it("renders Button variants, loading state, and invokes onPress", async () => {
		const user = userEvent.setup();
		const onPress = vi.fn();
		const { rerender } = render(
			<Button variant="primary" onPress={onPress}>
				Invite user
			</Button>,
		);

		const btn = screen.getByRole("button", { name: "Invite user" });
		await user.click(btn);
		expect(onPress).toHaveBeenCalledTimes(1);

		rerender(
			<Button variant="destructive" isLoading onPress={onPress}>
				Delete user
			</Button>,
		);
		const loadingBtn = screen.getByRole("button", {
			name: "Delete user",
		}) as HTMLButtonElement;
		expect(loadingBtn.disabled).toBe(true);
	});

	it("ModalDialog ignores outside backdrop clicks and closes on Escape or Close button", async () => {
		const user = userEvent.setup();
		const onOpenChange = vi.fn();
		render(
			<ModalDialog
				isOpen={true}
				onOpenChange={onOpenChange}
				title="Invite user"
				footer={
					<Button variant="secondary" onPress={() => onOpenChange(false)}>
						Cancel
					</Button>
				}
			>
				<p>Modal body</p>
			</ModalDialog>,
		);

		expect(screen.getByRole("dialog", { name: "Invite user" })).toBeTruthy();

		// Clicking overlay scrim outside the dialog must NOT dismiss
		const overlay = document.querySelector("[data-testid='modal-overlay']");
		expect(overlay).toBeTruthy();
		if (overlay) {
			await user.click(overlay);
		}
		expect(onOpenChange).not.toHaveBeenCalled();

		// Escape key dismisses while focus is within the modal
		screen.getByRole("button", { name: "Cancel" }).focus();
		await user.keyboard("{Escape}");
		expect(onOpenChange).toHaveBeenCalledWith(false);

		// Close icon button dismisses
		onOpenChange.mockClear();
		await user.click(screen.getByRole("button", { name: "Close" }));
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	it("TextField renders required marker, inline error, and triggers onChange", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(
			<TextField
				label="Email address"
				isRequired
				value=""
				onChange={onChange}
				errorMessage="Enter an email address."
				placeholder="name@organization.org"
			/>,
		);

		expect(screen.getByText("(required)")).toBeTruthy();
		expect(screen.getByText("Enter an email address.")).toBeTruthy();

		const input = screen.getByPlaceholderText("name@organization.org");
		await user.type(input, "a");
		expect(onChange).toHaveBeenCalledWith("a");
	});

	it("FormSelect supports optional noneLabel and FilterSelect selects options", async () => {
		const user = userEvent.setup();
		const onFormChange = vi.fn();
		const onFilterChange = vi.fn();

		render(
			<div>
				<FormSelect
					label="Organization"
					items={[
						{ id: "org-1", label: "DGPC Haiti" },
						{ id: "org-2", label: "Red Cross" },
					]}
					value="org-1"
					onChange={onFormChange}
					placeholder="Select an organization"
					noneLabel="No organization"
				/>
				<FilterSelect
					label="Role"
					allLabel="All roles"
					options={[
						{ id: "all", label: "All roles" },
						{ id: "admin", label: "Admin" },
					]}
					value="all"
					onChange={onFilterChange}
				/>
			</div>,
		);

		// Open FormSelect and pick "No organization"
		const orgTrigger = screen.getByRole("button", { name: /Organization/i });
		await user.click(orgTrigger);
		await user.click(screen.getByRole("option", { name: "No organization" }));
		expect(onFormChange).toHaveBeenCalledWith(null);

		// Open FilterSelect and pick "Admin"
		const roleTrigger = screen.getByRole("button", { name: /Role/i });
		await user.click(roleTrigger);
		await user.click(screen.getByRole("option", { name: "Admin" }));
		expect(onFilterChange).toHaveBeenCalledWith("admin");
	});

	it("SortableTable renders sortable headers, non-sortable headers, and emits onSortChange", async () => {
		const user = userEvent.setup();
		const onSortChange = vi.fn();
		render(
			<SortableTable
				aria-label="Users"
				columns={[
					{ id: "name", label: "Name", sortable: true, isRowHeader: true },
					{ id: "email", label: "Email", sortable: false },
					{ id: "actions", label: "Actions", sortable: false, srOnly: true },
				]}
				items={[{ id: "1", name: "Marie Joseph", email: "marie@example.org" }]}
				sortDescriptor={{ column: "name", direction: "ascending" }}
				onSortChange={onSortChange}
				renderEmptyState={() => <div>Empty</div>}
				renderRow={(item) => [item.name, item.email, "Edit"]}
			/>,
		);

		const nameHeader = screen.getByRole("columnheader", { name: /Name/i });
		await user.click(nameHeader);
		expect(onSortChange).toHaveBeenCalledWith({
			column: "name",
			direction: "descending",
		});

		expect(screen.getByText("Marie Joseph")).toBeTruthy();
	});

	it("Pagination shows range summary, disables boundary buttons, and changes page", async () => {
		const user = userEvent.setup();
		const onPageChange = vi.fn();
		const onPageSizeChange = vi.fn();

		render(
			<Pagination
				total={64}
				page={1}
				pageSize={25}
				onPageChange={onPageChange}
				onPageSizeChange={onPageSizeChange}
				noun="users"
			/>,
		);

		expect(screen.getByText("Showing 1-25 of 64 users")).toBeTruthy();
		expect(screen.getByText("Page 1 of 3")).toBeTruthy();

		const prevBtn = screen.getByRole("button", {
			name: "Previous page",
		}) as HTMLButtonElement;
		const nextBtn = screen.getByRole("button", {
			name: "Next page",
		}) as HTMLButtonElement;
		expect(prevBtn.disabled).toBe(true);
		expect(nextBtn.disabled).toBe(false);

		await user.click(nextBtn);
		expect(onPageChange).toHaveBeenCalledWith(2);
	});

	it("StatusIndicator renders decorative dot with visible text", () => {
		const { container } = render(
			<StatusIndicator tone="positive">Active</StatusIndicator>,
		);
		expect(screen.getByText("Active")).toBeTruthy();
		expect(container.querySelector("[aria-hidden='true']")).toBeTruthy();
	});

	it("Tooltip wraps trigger and ToastRegion displays and dismisses toasts", async () => {
		const user = userEvent.setup();
		const onDismiss = vi.fn();
		render(
			<div>
				<Tooltip text="Edit user">
					<Button variant="icon" aria-label="Edit Marie">
						E
					</Button>
				</Tooltip>
				<ToastRegion
					toasts={[
						{
							id: "t1",
							message: "Invitation sent to marie@example.org.",
							tone: "success",
						},
					]}
					onDismiss={onDismiss}
				/>
			</div>,
		);

		expect(
			screen.getByText("Invitation sent to marie@example.org."),
		).toBeTruthy();
		await user.click(
			within(screen.getByRole("status")).getByRole("button", {
				name: "Dismiss notification",
			}),
		);
		expect(onDismiss).toHaveBeenCalledWith("t1");
	});
});
