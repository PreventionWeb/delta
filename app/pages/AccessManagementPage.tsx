import { Mail, Pencil, Trash2, UserPlus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
	useFetcher,
	useLoaderData,
	useLocation,
	useNavigate,
	useNavigation,
} from "react-router";
import type {
	AccessManagementSortColumn,
	AccessManagementUserRow,
} from "~/db/queries/userCountryAccountsRepository";
import {
	Button,
	FilterSelect,
	FormSelect,
	ModalDialog,
	Pagination,
	SortableTable,
	type SortDescriptor,
	StatusIndicator,
	TextField,
	type ToastItem,
	ToastRegion,
	Tooltip,
} from "~/design-system/ui";
import { ViewContext } from "~/frontend/context";
import type { AccessManagementActionResult } from "~/frontend/user/accessManagementAction";
import { getCountryRole, getCountryRoles } from "~/frontend/user/roles";
import type { loader } from "~/routes/$lang+/settings+/access-mgmnt+/_layout";

type PendingAction =
	| { type: "invite"; email: string }
	| { type: "edit"; displayName: string }
	| { type: "delete"; displayName: string }
	| { type: "resend"; email: string; userId: string };

function getDisplayName(row: AccessManagementUserRow): string {
	const full = `${row.user.firstName ?? ""} ${row.user.lastName ?? ""}`.trim();
	return full || row.user.email;
}

const UTC_DATE_FORMATTER = new Intl.DateTimeFormat("en-GB", {
	day: "2-digit",
	month: "short",
	year: "numeric",
	timeZone: "UTC",
});

function formatDateAdded(dateValue: Date | string | null | undefined): string {
	if (!dateValue) return "-";
	const d = typeof dateValue === "string" ? new Date(dateValue) : dateValue;
	if (Number.isNaN(d.getTime())) return "-";
	return UTC_DATE_FORMATTER.format(d);
}

function isValidEmailFormat(value: string): boolean {
	return /^\S+@\S+\.\S+$/.test(value.trim());
}

export default function AccessManagementPage() {
	const ld = useLoaderData<typeof loader>();
	const ctx = new ViewContext();
	const navigate = useNavigate();
	const navigation = useNavigation();
	const location = useLocation();
	const fetcher = useFetcher<AccessManagementActionResult>();

	const { items, pagination, organizations } = ld;
	const roles = useMemo(() => getCountryRoles(ctx), [ctx.lang]);

	const [searchValue, setSearchValue] = useState(ld.search || "");
	const [inviteOpen, setInviteOpen] = useState(false);
	const [editingUser, setEditingUser] =
		useState<AccessManagementUserRow | null>(null);
	const [deletingUser, setDeletingUser] =
		useState<AccessManagementUserRow | null>(null);

	// Form state shared by Invite and Edit modals
	const [formEmail, setFormEmail] = useState("");
	const [formOrg, setFormOrg] = useState<string | null>(null);
	const [formRole, setFormRole] = useState<string | null>(null);
	const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
	const [serverError, setServerError] = useState<string | null>(null);

	const [toasts, setToasts] = useState<ToastItem[]>([]);
	const pendingActionRef = useRef<PendingAction | null>(null);
	const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const toastTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
		new Map(),
	);

	useEffect(() => {
		setSearchValue(ld.search || "");
	}, [ld.search]);

	useEffect(() => {
		return () => {
			if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
			for (const timer of toastTimersRef.current.values()) {
				clearTimeout(timer);
			}
			toastTimersRef.current.clear();
		};
	}, []);

	const addToast = (message: string, tone: "success" | "error") => {
		const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
		setToasts((prev) => [...prev.slice(-2), { id, message, tone }]);
		if (tone === "success") {
			const timer = setTimeout(() => {
				toastTimersRef.current.delete(id);
				setToasts((prev) => prev.filter((t) => t.id !== id));
			}, 4000);
			toastTimersRef.current.set(id, timer);
		}
	};

	const dismissToast = (id: string) => {
		const timer = toastTimersRef.current.get(id);
		if (timer) {
			clearTimeout(timer);
			toastTimersRef.current.delete(id);
		}
		setToasts((prev) => prev.filter((t) => t.id !== id));
	};

	useEffect(() => {
		if (
			fetcher.state !== "idle" ||
			!fetcher.data ||
			!pendingActionRef.current
		) {
			return;
		}

		const action = pendingActionRef.current;
		pendingActionRef.current = null;

		if (fetcher.data.ok) {
			if (action.type === "invite") {
				setInviteOpen(false);
				addToast(
					ctx.t(
						{
							code: "settings.access_mgmnt.toast_invited",
							msg: "Invitation sent to {email}.",
						},
						{ email: action.email },
					),
					"success",
				);
			} else if (action.type === "edit") {
				setEditingUser(null);
				addToast(
					ctx.t(
						{
							code: "settings.access_mgmnt.toast_saved",
							msg: "Changes saved for {name}.",
						},
						{ name: action.displayName },
					),
					"success",
				);
			} else if (action.type === "delete") {
				setDeletingUser(null);
				addToast(
					ctx.t(
						{
							code: "settings.access_mgmnt.toast_deleted",
							msg: "{name} was deleted.",
						},
						{ name: action.displayName },
					),
					"success",
				);
			} else if (action.type === "resend") {
				addToast(
					ctx.t(
						{
							code: "settings.access_mgmnt.toast_resent",
							msg: "Invitation sent again to {email}.",
						},
						{ email: action.email },
					),
					"success",
				);
			}
			return;
		}

		if (fetcher.data.fieldErrors) {
			setFieldErrors(fetcher.data.fieldErrors);
			return;
		}

		const errorMsg =
			fetcher.data.error ||
			ctx.t({
				code: "common.unexpected_error",
				msg: "Unexpected error",
			});

		if (action.type === "resend") {
			addToast(errorMsg, "error");
		} else {
			setServerError(errorMsg);
		}
	}, [fetcher.state, fetcher.data]);

	const updateQueryParams = (
		updates: Record<string, string | null>,
		options?: { replace?: boolean },
	) => {
		const params = new URLSearchParams(location.search);
		for (const [key, val] of Object.entries(updates)) {
			if (val === null || val === "") {
				params.delete(key);
			} else {
				params.set(key, val);
			}
		}
		const qs = params.toString();
		navigate(qs ? `${location.pathname}?${qs}` : location.pathname, options);
	};

	const handleSearchChange = (value: string) => {
		setSearchValue(value);
		if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
		searchTimerRef.current = setTimeout(() => {
			updateQueryParams(
				{ search: value.trim() ? value : null, page: "1" },
				{ replace: true },
			);
		}, 250);
	};

	const handleRoleFilterChange = (role: string) => {
		updateQueryParams({ role: role === "all" ? null : role, page: "1" });
	};

	const handleClearFilters = () => {
		if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
		setSearchValue("");
		updateQueryParams({ search: null, role: null, page: "1" });
	};

	const handleSortChange = (descriptor: SortDescriptor) => {
		const nextDir = descriptor.direction === "ascending" ? "asc" : "desc";
		updateQueryParams({
			sort: descriptor.column as AccessManagementSortColumn,
			dir: nextDir,
			page: "1",
		});
	};

	const handlePageChange = (nextPage: number) => {
		updateQueryParams({ page: String(nextPage) });
	};

	const handlePageSizeChange = (nextSize: number) => {
		updateQueryParams({ pageSize: String(nextSize), page: "1" });
	};

	const openInviteModal = () => {
		setFormEmail("");
		setFormOrg(null);
		setFormRole(null);
		setFieldErrors({});
		setServerError(null);
		setInviteOpen(true);
	};

	const openEditModal = (row: AccessManagementUserRow) => {
		setFormEmail(row.user.email);
		setFormOrg(row.organizationId ?? null);
		setFormRole(row.role);
		setFieldErrors({});
		setServerError(null);
		setEditingUser(row);
	};

	const openDeleteModal = (row: AccessManagementUserRow) => {
		setServerError(null);
		setDeletingUser(row);
	};

	const handleResend = (row: AccessManagementUserRow) => {
		const fd = new FormData();
		fd.set("_fetcher", "1");
		pendingActionRef.current = {
			type: "resend",
			email: row.user.email,
			userId: row.user.id,
		};
		fetcher.submit(fd, {
			method: "post",
			action: ctx.url(
				`/settings/access-mgmnt/resend-invitation/${row.user.id}`,
			),
		});
	};

	const handleInviteOrEditSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		const isEdit = Boolean(editingUser);
		const nextErrors: Record<string, string> = {};

		if (!isEdit) {
			if (!formEmail.trim()) {
				nextErrors.email = ctx.t({
					code: "settings.access_mgmnt.error_email_required",
					msg: "Enter an email address.",
				});
			} else if (!isValidEmailFormat(formEmail)) {
				nextErrors.email = ctx.t({
					code: "settings.access_mgmnt.error_email_invalid",
					msg: "Enter an email address, for example name@organization.org.",
				});
			}
		}

		if (!formRole) {
			nextErrors.role = ctx.t({
				code: "settings.access_mgmnt.error_role_required",
				msg: "Select a role.",
			});
		}

		if (Object.keys(nextErrors).length > 0) {
			setFieldErrors(nextErrors);
			return;
		}

		setFieldErrors({});
		setServerError(null);

		const fd = new FormData();
		fd.set("_fetcher", "1");
		if (!isEdit) {
			fd.set("email", formEmail.trim());
		}
		fd.set("organization", formOrg ?? "");
		fd.set("role", formRole ?? "");

		if (isEdit && editingUser) {
			pendingActionRef.current = {
				type: "edit",
				displayName: getDisplayName(editingUser),
			};
			fetcher.submit(fd, {
				method: "post",
				action: ctx.url(`/settings/access-mgmnt/edit/${editingUser.user.id}`),
			});
		} else {
			pendingActionRef.current = {
				type: "invite",
				email: formEmail.trim(),
			};
			fetcher.submit(fd, {
				method: "post",
				action: ctx.url("/settings/access-mgmnt/new"),
			});
		}
	};

	const handleConfirmDelete = () => {
		if (!deletingUser) return;
		setServerError(null);
		const fd = new FormData();
		fd.set("_fetcher", "1");
		pendingActionRef.current = {
			type: "delete",
			displayName: getDisplayName(deletingUser),
		};
		fetcher.submit(fd, {
			method: "post",
			action: ctx.url(`/settings/access-mgmnt/delete/${deletingUser.user.id}`),
		});
	};

	const isSubmitting = fetcher.state !== "idle";
	const isNavigating = navigation.state === "loading";
	const isFormOpen = inviteOpen || Boolean(editingUser);
	const isEditMode = Boolean(editingUser);

	const totalPages = Math.max(
		1,
		Math.ceil(pagination.total / pagination.pageSize),
	);
	const safePage = Math.min(Math.max(1, pagination.pageNumber), totalPages);
	const rangeFrom =
		pagination.total === 0 ? 0 : (safePage - 1) * pagination.pageSize + 1;
	const rangeTo = Math.min(safePage * pagination.pageSize, pagination.total);
	const primaryAdminDisabledReason = ctx.t({
		code: "settings.access_mgmnt.primary_admin_protected",
		msg: "Primary admin cannot be modified or deleted",
	});

	const selectedFilterRoleObj =
		ld.roleFilter && ld.roleFilter !== "all"
			? getCountryRole(ctx, ld.roleFilter)
			: null;
	const selectedFormRoleObj = formRole ? getCountryRole(ctx, formRole) : null;

	const sortDescriptor: SortDescriptor = {
		column: ld.sort || "added",
		direction: ld.dir === "asc" ? "ascending" : "descending",
	};

	const hasActiveFilters =
		Boolean(searchValue.trim()) || (ld.roleFilter && ld.roleFilter !== "all");

	const orgOptions = useMemo(
		() => organizations.map((o) => ({ id: o.id, label: o.name })),
		[organizations],
	);

	const roleOptions = useMemo(
		() => roles.map((r) => ({ id: r.id, label: r.label })),
		[roles],
	);

	const columns = [
		{
			id: "name",
			label: ctx.t({ code: "common.name", msg: "Name" }),
			sortable: true,
			isRowHeader: true,
		},
		{
			id: "status",
			label: ctx.t({ code: "common.status", msg: "Status" }),
			sortable: true,
		},
		{
			id: "email",
			label: ctx.t({ code: "common.email", msg: "Email" }),
			sortable: false,
		},
		{
			id: "org",
			label: ctx.t({ code: "common.organization", msg: "Organization" }),
			sortable: true,
		},
		{
			id: "role",
			label: ctx.t({ code: "common.role", msg: "Role" }),
			sortable: true,
		},
		{
			id: "added",
			label: ctx.t({
				code: "settings.access_mgmnt.date_added",
				msg: "Date added",
			}),
			sortable: true,
		},
		{
			id: "actions",
			label: ctx.t({ code: "common.actions", msg: "Actions" }),
			sortable: false,
			srOnly: true,
			align: "right" as const,
		},
	];

	return (
		<main className="mx-auto flex w-full max-w-[1280px] flex-col px-4 pb-16 md:px-6 xl:px-8">
			{/* Page header */}
			<div className="flex flex-wrap items-start justify-between gap-4 pt-8 pb-6">
				<div className="flex flex-col gap-1">
					<h1 className="text-page font-medium leading-[var(--lh-tight)] text-fg">
						{ctx.t({
							code: "nav.access_management",
							msg: "Access management",
						})}
					</h1>
					<p className="text-body text-fg-2">
						{ctx.t({
							code: "settings.access_mgmnt.subtitle",
							msg: "Invite people and set what they can do on this site.",
						})}
					</p>
				</div>
				<Button variant="primary" onPress={openInviteModal}>
					<UserPlus className="h-4 w-4" aria-hidden="true" />
					{ctx.t({
						code: "settings.access_mgmnt.invite_user",
						msg: "Invite user",
					})}
				</Button>
			</div>

			{/* Filter bar */}
			<div role="search" className="flex flex-wrap items-center gap-2 pb-4">
				<TextField
					type="search"
					aria-label={ctx.t({
						code: "settings.access_mgmnt.search_placeholder",
						msg: "Search by name, email or organization",
					})}
					placeholder={ctx.t({
						code: "settings.access_mgmnt.search_placeholder",
						msg: "Search by name, email or organization",
					})}
					value={searchValue}
					onChange={handleSearchChange}
					className="w-full sm:w-[340px]"
				/>
				<FilterSelect
					label={ctx.t({ code: "common.role", msg: "Role" })}
					options={[
						{
							id: "all",
							label: ctx.t({
								code: "settings.access_mgmnt.all_roles",
								msg: "All roles",
							}),
						},
						...roleOptions,
					]}
					value={ld.roleFilter || "all"}
					defaultValue="all"
					onChange={handleRoleFilterChange}
					optionClassName="inline-block lowercase first-letter:uppercase"
				/>
				<span className="hidden flex-1 sm:inline-block" />
				<Button variant="ghost" onPress={handleClearFilters}>
					{ctx.t({
						code: "settings.access_mgmnt.clear_filters",
						msg: "Clear filters",
					})}
				</Button>
			</div>

			{selectedFilterRoleObj ? (
				<p className="pb-4 text-body text-fg-2">
					<span className="inline-block lowercase first-letter:uppercase">
						{selectedFilterRoleObj.label}
					</span>
					: {selectedFilterRoleObj.desc}
				</p>
			) : null}

			{/* Users table card */}
			<section
				aria-label={ctx.t({ code: "common.users", msg: "Users" })}
				aria-busy={isNavigating}
				className={[
					"overflow-hidden rounded-lg border border-border-subtle bg-surface transition-opacity",
					isNavigating ? "opacity-60" : "",
				]
					.filter(Boolean)
					.join(" ")}
			>
				<SortableTable
					aria-label={ctx.t({ code: "common.users", msg: "Users" })}
					columns={columns}
					items={items}
					sortDescriptor={sortDescriptor}
					onSortChange={handleSortChange}
					renderEmptyState={() => (
						<div className="p-6 text-body text-fg-2">
							{hasActiveFilters
								? ctx.t({
										code: "settings.access_mgmnt.no_matching_users",
										msg: "No users match these filters.",
									})
								: ctx.t({
										code: "settings.access_mgmnt.no_users",
										msg: "No users found.",
									})}
						</div>
					)}
					renderRow={(row) => {
						const displayName = getDisplayName(row);
						const roleObj = getCountryRole(ctx, row.role);
						const roleLabel = roleObj ? roleObj.label : row.role;
						const orgName = row.organization?.name || "";
						const isPending = !row.user.emailVerified;

						return [
							<span
								key="name"
								className="block max-w-[200px] truncate"
								title={displayName}
							>
								{displayName}
							</span>,
							<StatusIndicator
								key="status"
								tone={isPending ? "warning" : "positive"}
							>
								{isPending
									? ctx.t({
											code: "settings.access_mgmnt.status_pending",
											msg: "Invitation pending",
										})
									: ctx.t({
											code: "settings.access_mgmnt.status_active",
											msg: "Active",
										})}
							</StatusIndicator>,
							<span
								key="email"
								className="block max-w-[260px] truncate"
								title={row.user.email}
							>
								{row.user.email}
							</span>,
							<span
								key="org"
								className="block max-w-[180px] truncate"
								title={orgName || undefined}
							>
								{orgName || "-"}
							</span>,
							<span key="role" className="inline-flex items-center gap-1">
								<span className="inline-block lowercase first-letter:uppercase">
									{roleLabel}
								</span>
								{row.isPrimaryAdmin ? (
									<span>
										{ctx.t({
											code: "settings.access_mgmnt.primary_admin_badge",
											msg: "(Primary Admin)",
										})}
									</span>
								) : null}
							</span>,
							<span key="added" className="tabular-nums whitespace-nowrap">
								{formatDateAdded(row.addedAt)}
							</span>,
							<span
								key="actions"
								className="inline-flex items-center justify-end gap-1"
							>
								{isPending ? (
									<Tooltip
										text={ctx.t({
											code: "settings.access_mgmnt.resend_invitation",
											msg: "Resend invitation",
										})}
									>
										<Button
											variant="icon"
											aria-label={ctx.t(
												{
													code: "settings.access_mgmnt.resend_invitation_to",
													msg: "Resend invitation to {name}",
												},
												{ name: displayName },
											)}
											isDisabled={isSubmitting}
											onPress={() => handleResend(row)}
										>
											<Mail className="h-4 w-4" aria-hidden="true" />
										</Button>
									</Tooltip>
								) : (
									<span className="inline-block h-8 w-8" aria-hidden="true" />
								)}
								<span
									title={
										row.isPrimaryAdmin ? primaryAdminDisabledReason : undefined
									}
								>
									<Tooltip
										text={ctx.t({
											code: "settings.access_mgmnt.edit_user",
											msg: "Edit user",
										})}
									>
										<Button
											variant="icon"
											aria-label={ctx.t(
												{
													code: "settings.access_mgmnt.edit_user_name",
													msg: "Edit {name}",
												},
												{ name: displayName },
											)}
											isDisabled={row.isPrimaryAdmin}
											onPress={() => openEditModal(row)}
										>
											<Pencil className="h-4 w-4" aria-hidden="true" />
										</Button>
									</Tooltip>
								</span>
								<span
									title={
										row.isPrimaryAdmin ? primaryAdminDisabledReason : undefined
									}
								>
									<Tooltip
										text={ctx.t({
											code: "settings.access_mgmnt.delete_user",
											msg: "Delete user",
										})}
									>
										<Button
											variant="icon"
											aria-label={ctx.t(
												{
													code: "settings.access_mgmnt.delete_user_name",
													msg: "Delete {name}",
												},
												{ name: displayName },
											)}
											isDisabled={row.isPrimaryAdmin}
											onPress={() => openDeleteModal(row)}
										>
											<Trash2 className="h-4 w-4" aria-hidden="true" />
										</Button>
									</Tooltip>
								</span>
							</span>,
						];
					}}
				/>
				<Pagination
					total={pagination.total}
					page={pagination.pageNumber}
					pageSize={pagination.pageSize}
					pageSizeOptions={[25, 50, 100]}
					onPageChange={handlePageChange}
					onPageSizeChange={handlePageSizeChange}
					noun={ctx.t({
						code: "settings.access_mgmnt.users_noun",
						msg: "users",
					})}
					showingText={
						pagination.total === 0
							? ctx.t({
									code: "settings.access_mgmnt.showing_zero_users",
									msg: "Showing 0 of 0 users",
								})
							: ctx.t(
									{
										code: "settings.access_mgmnt.showing_users_range",
										msg: "Showing {from}-{to} of {total} users",
									},
									{
										from: rangeFrom,
										to: rangeTo,
										total: pagination.total,
									},
								)
					}
					pageText={ctx.t(
						{
							code: "common.page_x_of_y",
							msg: "Page {page} of {totalPages}",
						},
						{ page: safePage, totalPages },
					)}
					rowsPerPageLabel={ctx.t({
						code: "common.rows_per_page",
						msg: "Rows per page",
					})}
					previousLabel={ctx.t({
						code: "common.previous_page",
						msg: "Previous page",
					})}
					nextLabel={ctx.t({
						code: "common.next_page",
						msg: "Next page",
					})}
				/>
			</section>

			{/* Invite / Edit User Modal */}
			<ModalDialog
				isOpen={isFormOpen}
				onOpenChange={(open) => {
					if (!open) {
						setInviteOpen(false);
						setEditingUser(null);
						setFieldErrors({});
						setServerError(null);
					}
				}}
				title={
					isEditMode
						? ctx.t({
								code: "settings.access_mgmnt.edit_user",
								msg: "Edit user",
							})
						: ctx.t({
								code: "settings.access_mgmnt.invite_user",
								msg: "Invite user",
							})
				}
				closeLabel={ctx.t({ code: "common.close", msg: "Close" })}
				footer={
					<>
						<Button
							variant="secondary"
							onPress={() => {
								setInviteOpen(false);
								setEditingUser(null);
							}}
						>
							{ctx.t({ code: "common.cancel", msg: "Cancel" })}
						</Button>
						<Button
							variant="primary"
							type="submit"
							form="access-management-user-form"
							isLoading={isSubmitting}
						>
							{isEditMode
								? ctx.t({
										code: "common.save_changes",
										msg: "Save changes",
									})
								: ctx.t({
										code: "settings.access_mgmnt.send_invitation",
										msg: "Send invitation",
									})}
						</Button>
					</>
				}
			>
				<form
					id="access-management-user-form"
					onSubmit={handleInviteOrEditSubmit}
					noValidate
					className="flex flex-col gap-6"
				>
					{serverError ? (
						<div
							role="alert"
							className="rounded-lg border border-crit-border bg-crit-bg px-4 py-3 text-body text-crit"
						>
							{serverError}
						</div>
					) : null}

					{isEditMode && editingUser ? (
						<dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-body">
							<dt className="text-fg-2">
								{ctx.t({ code: "common.status", msg: "Status" })}
							</dt>
							<dd>
								<StatusIndicator
									tone={editingUser.user.emailVerified ? "positive" : "warning"}
								>
									{editingUser.user.emailVerified
										? ctx.t({
												code: "settings.access_mgmnt.status_active",
												msg: "Active",
											})
										: ctx.t({
												code: "settings.access_mgmnt.status_pending",
												msg: "Invitation pending",
											})}
								</StatusIndicator>
							</dd>
							<dt className="text-fg-2">
								{ctx.t({
									code: "settings.access_mgmnt.date_added",
									msg: "Date added",
								})}
							</dt>
							<dd className="tabular-nums">
								{formatDateAdded(editingUser.addedAt)}
							</dd>
							<dt className="text-fg-2">
								{ctx.t({
									code: "settings.access_mgmnt.added_by",
									msg: "Added by",
								})}
							</dt>
							<dd>
								{ctx.t({
									code: "settings.access_mgmnt.system_admin",
									msg: "System Admin",
								})}
							</dd>
						</dl>
					) : null}

					<TextField
						label={ctx.t({
							code: "user_login.email_address",
							msg: "Email address",
						})}
						name="email"
						type="email"
						value={formEmail}
						onChange={(val) => {
							setFormEmail(val);
							setFieldErrors((prev) => ({ ...prev, email: "" }));
						}}
						placeholder="name@organization.org"
						isRequired
						requiredLabel={ctx.t({
							code: "common.required_parens",
							msg: "(required)",
						})}
						isDisabled={isEditMode}
						errorMessage={fieldErrors.email || undefined}
					/>

					<FormSelect
						label={ctx.t({ code: "common.organization", msg: "Organization" })}
						name="organization"
						items={orgOptions}
						value={formOrg}
						onChange={(val) => {
							setFormOrg(val);
							setFieldErrors((prev) => ({ ...prev, organization: "" }));
						}}
						placeholder={ctx.t({
							code: "settings.access_mgmnt.select_organization",
							msg: "Select an organization",
						})}
						noneLabel={ctx.t({
							code: "settings.access_mgmnt.no_organization",
							msg: "No organization",
						})}
						isRequired={false}
					/>

					<div className="flex flex-col gap-2">
						<FormSelect
							label={ctx.t({ code: "common.role", msg: "Role" })}
							name="role"
							items={roleOptions}
							value={formRole}
							onChange={(val) => {
								setFormRole(val);
								setFieldErrors((prev) => ({ ...prev, role: "" }));
							}}
							placeholder={ctx.t({
								code: "settings.access_mgmnt.select_role",
								msg: "Select a role",
							})}
							isRequired
							requiredLabel={ctx.t({
								code: "common.required_parens",
								msg: "(required)",
							})}
							errorMessage={fieldErrors.role || undefined}
							valueClassName="inline-block lowercase first-letter:uppercase"
							optionClassName="inline-block lowercase first-letter:uppercase"
						/>
						{selectedFormRoleObj ? (
							<p aria-live="polite" className="text-label text-fg-2">
								<span className="inline-block lowercase first-letter:uppercase">
									{selectedFormRoleObj.label}
								</span>
								: {selectedFormRoleObj.desc}
							</p>
						) : null}
					</div>
				</form>
			</ModalDialog>

			{/* Delete User Confirmation Modal */}
			<ModalDialog
				isOpen={Boolean(deletingUser)}
				onOpenChange={(open) => {
					if (!open) {
						setDeletingUser(null);
						setServerError(null);
					}
				}}
				role="alertdialog"
				title={ctx.t({
					code: "settings.access_mgmnt.delete_user",
					msg: "Delete user",
				})}
				closeLabel={ctx.t({ code: "common.close", msg: "Close" })}
				footer={
					<>
						<Button variant="secondary" onPress={() => setDeletingUser(null)}>
							{ctx.t({ code: "common.cancel", msg: "Cancel" })}
						</Button>
						<Button
							variant="destructive"
							isLoading={isSubmitting}
							onPress={handleConfirmDelete}
						>
							{ctx.t({
								code: "settings.access_mgmnt.delete_user",
								msg: "Delete user",
							})}
						</Button>
					</>
				}
			>
				{serverError ? (
					<div
						role="alert"
						className="rounded-lg border border-crit-border bg-crit-bg px-4 py-3 text-body text-crit"
					>
						{serverError}
					</div>
				) : null}
				<p className="text-body text-fg">
					<strong>{deletingUser ? getDisplayName(deletingUser) : ""}</strong>{" "}
					{ctx.t({
						code: "settings.access_mgmnt.delete_warning",
						msg: "will lose access to DELTA. This cannot be undone.",
					})}
				</p>
			</ModalDialog>

			<ToastRegion
				toasts={toasts}
				onDismiss={dismissToast}
				dismissLabel={ctx.t({
					code: "common.dismiss_notification",
					msg: "Dismiss notification",
				})}
			/>
		</main>
	);
}
