import { AlertCircle, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
	useFetcher,
	useLoaderData,
	useLocation,
	useNavigate,
	useNavigation,
} from "react-router";
import type {
	OrganizationListItem,
	OrganizationSortColumn,
} from "~/db/queries/organizationRepository";
import {
	Button,
	ModalDialog,
	Pagination,
	SortableTable,
	type SortDescriptor,
	TextField,
	type ToastItem,
	ToastRegion,
	Tooltip,
} from "~/design-system/ui";
import { ViewContext } from "~/frontend/context";
import type { OrganizationFetcherResult } from "~/frontend/organizationAction";
import type { loader } from "~/routes/$lang+/settings+/organizations+/_layout";

type PendingAction =
	| { type: "create"; name: string }
	| { type: "edit" }
	| { type: "delete"; name: string };

export default function OrganizationManagementPage() {
	const ld = useLoaderData<typeof loader>();
	const ctx = new ViewContext();
	const navigate = useNavigate();
	const navigation = useNavigation();
	const location = useLocation();
	const fetcher = useFetcher<OrganizationFetcherResult>();

	const { filters, data, canManage, canAdd } = ld;
	const { items, existingNames, pagination } = data;
	const { search, sort, dir } = filters;
	const { totalItems, page, pageSize } = pagination;

	const [searchValue, setSearchValue] = useState(search);
	const [addOpen, setAddOpen] = useState(false);
	const [editingOrg, setEditingOrg] = useState<OrganizationListItem | null>(
		null,
	);
	const [deletingOrg, setDeletingOrg] = useState<OrganizationListItem | null>(
		null,
	);

	const [nameValue, setNameValue] = useState("");
	const [nameError, setNameError] = useState("");
	const [serverError, setServerError] = useState<string | null>(null);

	const [toasts, setToasts] = useState<ToastItem[]>([]);
	const pendingActionRef = useRef<PendingAction | null>(null);
	const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const toastTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
		new Map(),
	);

	useEffect(() => {
		setSearchValue(search);
	}, [search]);

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
			if (action.type === "create") {
				setAddOpen(false);
				addToast(
					ctx.t(
						{
							code: "organizations.toast_added",
							msg: "{name} was added.",
						},
						{ name: action.name },
					),
					"success",
				);
			} else if (action.type === "edit") {
				setEditingOrg(null);
				addToast(
					ctx.t({
						code: "organizations.toast_saved",
						msg: "Changes saved.",
					}),
					"success",
				);
			} else if (action.type === "delete") {
				setDeletingOrg(null);
				addToast(
					ctx.t(
						{
							code: "organizations.toast_deleted",
							msg: "{name} was deleted.",
						},
						{ name: action.name },
					),
					"success",
				);
			}
			setNameError("");
			setServerError(null);
		} else {
			if (fetcher.data.fieldErrors?.name) {
				setNameError(fetcher.data.fieldErrors.name);
			} else if (fetcher.data.error) {
				setServerError(fetcher.data.error);
			}
		}
	}, [fetcher.state, fetcher.data]);

	const updateQuery = (
		updates: Partial<{
			search: string;
			sort: OrganizationSortColumn;
			dir: "asc" | "desc";
			page: number;
			pageSize: number;
		}>,
		options?: { replace?: boolean },
	) => {
		if (searchTimerRef.current) {
			clearTimeout(searchTimerRef.current);
			searchTimerRef.current = null;
		}
		const params = new URLSearchParams(location.search);
		const nextSearch = (updates.search ?? search).trim();
		const nextSort = updates.sort ?? sort;
		const nextDir = updates.dir ?? dir;
		const nextPage = updates.page ?? page;
		const nextPageSize = updates.pageSize ?? pageSize;

		if (nextSearch) {
			params.set("search", nextSearch);
		} else {
			params.delete("search");
		}
		params.set("sort", nextSort);
		params.set("dir", nextDir);
		params.set("page", String(nextPage));
		params.set("pageSize", String(nextPageSize));

		const target = `${location.pathname}?${params.toString()}`;
		if (options) {
			navigate(target, options);
		} else {
			navigate(target);
		}
	};

	const handleSearchChange = (value: string) => {
		setSearchValue(value);
		if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
		searchTimerRef.current = setTimeout(() => {
			updateQuery({ search: value, page: 1 }, { replace: true });
		}, 250);
	};

	const handleClearSearch = () => {
		if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
		setSearchValue("");
		updateQuery({ search: "", page: 1 });
	};

	const openAddDialog = () => {
		setNameValue("");
		setNameError("");
		setServerError(null);
		setAddOpen(true);
	};

	const openEditDialog = (item: OrganizationListItem) => {
		setNameValue(item.name);
		setNameError("");
		setServerError(null);
		setEditingOrg(item);
	};

	const openDeleteDialog = (item: OrganizationListItem) => {
		setServerError(null);
		setDeletingOrg(item);
	};

	const closeAddDialog = () => {
		setAddOpen(false);
		setNameError("");
		setServerError(null);
	};

	const closeEditDialog = () => {
		setEditingOrg(null);
		setNameError("");
		setServerError(null);
	};

	const closeDeleteDialog = () => {
		setDeletingOrg(null);
		setServerError(null);
	};

	const validateName = (raw: string, excludeName?: string): string | null => {
		const trimmed = raw.trim();
		if (!trimmed) {
			return ctx.t({
				code: "organizations.enter_name",
				msg: "Enter a name.",
			});
		}
		const lower = trimmed.toLowerCase();
		const excludedLower = excludeName?.trim().toLowerCase();
		const duplicate = existingNames.some((n) => {
			const candidate = n.trim().toLowerCase();
			return candidate === lower && candidate !== excludedLower;
		});
		if (duplicate) {
			return ctx.t({
				code: "organizations.duplicate_name",
				msg: "An organization with this name already exists.",
			});
		}
		return null;
	};

	const handleCreateSubmit = () => {
		const validationError = validateName(nameValue);
		if (validationError) {
			setNameError(validationError);
			return;
		}
		const trimmed = nameValue.trim();
		setNameError("");
		setServerError(null);
		pendingActionRef.current = { type: "create", name: trimmed };
		const formData = new FormData();
		formData.set("_fetcher", "1");
		formData.set("name", trimmed);
		fetcher.submit(formData, {
			method: "post",
			action: ctx.url("/settings/organizations/new"),
		});
	};

	const handleEditSubmit = () => {
		if (!editingOrg) return;
		const validationError = validateName(nameValue, editingOrg.name);
		if (validationError) {
			setNameError(validationError);
			return;
		}
		setNameError("");
		setServerError(null);
		pendingActionRef.current = { type: "edit" };
		const formData = new FormData();
		formData.set("_fetcher", "1");
		formData.set("name", nameValue.trim());
		fetcher.submit(formData, {
			method: "post",
			action: ctx.url(`/settings/organizations/edit/${editingOrg.id}`),
		});
	};

	const handleDeleteSubmit = () => {
		if (!deletingOrg) return;
		setServerError(null);
		pendingActionRef.current = { type: "delete", name: deletingOrg.name };
		const formData = new FormData();
		formData.set("_fetcher", "1");
		fetcher.submit(formData, {
			method: "post",
			action: ctx.url(`/settings/organizations/delete/${deletingOrg.id}`),
		});
	};

	const isSubmitting = fetcher.state !== "idle";
	const isNavigating = navigation.state === "loading";

	const sortDescriptor: SortDescriptor = {
		column: sort,
		direction: dir === "asc" ? "ascending" : "descending",
	};

	const columns = [
		{
			id: "name",
			label: ctx.t({ code: "common.name", msg: "Name" }),
			sortable: true,
			isRowHeader: true,
		},
		{
			id: "users",
			label: ctx.t({ code: "organizations.users", msg: "Users" }),
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

	const pageTitle = ctx.t({
		code: "organizations.title",
		msg: "Organizations",
	});
	const addButtonLabel = ctx.t({
		code: "organizations.add",
		msg: "Add organization",
	});
	const closeLabel = ctx.t({ code: "common.close", msg: "Close" });
	const cancelLabel = ctx.t({ code: "common.cancel", msg: "Cancel" });
	const requiredLabel = ctx.t({
		code: "common.required_parens",
		msg: "(required)",
	});
	const searchLabel = ctx.t({
		code: "organizations.search_by_name",
		msg: "Search by name",
	});

	const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
	const safePage = Math.min(Math.max(1, page), totalPages);
	const from = totalItems === 0 ? 0 : (safePage - 1) * pageSize + 1;
	const to = Math.min(safePage * pageSize, totalItems);
	const showingText =
		totalItems === 0
			? ctx.t({
					code: "organizations.pagination_showing_empty",
					msg: "Showing 0 of 0 organizations",
				})
			: ctx.t(
					{
						code: "organizations.pagination_showing",
						msg: "Showing {from}-{to} of {total} organizations",
					},
					{ from, to, total: totalItems },
				);
	const pageText = ctx.t(
		{
			code: "common.pagination_page",
			msg: "Page {page} of {totalPages}",
		},
		{ page: safePage, totalPages },
	);

	const deletingInUse = Boolean(deletingOrg && deletingOrg.users > 0);
	const userCountText = deletingOrg
		? deletingOrg.users === 1
			? ctx.t({ code: "organizations.one_user", msg: "1 user" })
			: ctx.t(
					{
						code: "organizations.n_users",
						msg: "{count} users",
					},
					{ count: deletingOrg.users },
				)
		: "";

	const renderServerError = () =>
		serverError ? (
			<div
				role="alert"
				className="flex items-start gap-2 rounded-lg border border-crit-border bg-crit-bg px-3 py-2 text-body text-crit"
			>
				<AlertCircle
					className="mt-0.5 h-4 w-4 shrink-0 text-crit"
					aria-hidden="true"
				/>
				<span>{serverError}</span>
			</div>
		) : null;

	return (
		<div
			className="mx-auto w-full max-w-[1280px] px-4 md:px-12"
			aria-busy={isNavigating || undefined}
		>
			<div className="flex flex-wrap items-start justify-between gap-4 pt-8 pb-6">
				<div className="flex min-w-0 max-w-[640px] flex-1 basis-[320px] flex-col gap-1">
					<h1 className="text-page font-medium leading-[var(--lh-tight)] text-fg">
						{pageTitle}
					</h1>
					<p className="text-body text-fg-2">
						{ctx.t({
							code: "organizations.subtitle",
							msg: "The organizations people on this site belong to.",
						})}
					</p>
				</div>
				{canAdd ? (
					<Button variant="primary" onPress={openAddDialog}>
						<Plus className="h-4 w-4" aria-hidden="true" />
						<span>{addButtonLabel}</span>
					</Button>
				) : null}
			</div>

			<div className="flex flex-wrap items-center gap-2 pb-4" role="search">
				<TextField
					aria-label={searchLabel}
					type="search"
					placeholder={searchLabel}
					value={searchValue}
					onChange={handleSearchChange}
					className="w-[340px] max-w-full"
				/>
			</div>

			<section
				aria-label={pageTitle}
				className="overflow-hidden rounded-xl border border-border-subtle bg-surface"
			>
				<SortableTable
					aria-label={pageTitle}
					columns={columns}
					items={items}
					sortDescriptor={sortDescriptor}
					onSortChange={(next) => {
						updateQuery({
							sort: next.column as OrganizationSortColumn,
							dir: next.direction === "ascending" ? "asc" : "desc",
							page: 1,
						});
					}}
					renderEmptyState={() => (
						<div className="flex flex-col items-start gap-3 p-6 text-body text-fg-2">
							{search ? (
								<>
									<p>
										{ctx.t(
											{
												code: "organizations.empty_search",
												msg: 'No organizations match "{search}".',
											},
											{ search },
										)}
									</p>
									<Button variant="secondary" onPress={handleClearSearch}>
										{ctx.t({
											code: "organizations.clear_search",
											msg: "Clear search",
										})}
									</Button>
								</>
							) : (
								<p>
									{ctx.t({
										code: "organizations.empty_state",
										msg: "No organizations yet.",
									})}
								</p>
							)}
						</div>
					)}
					renderRow={(item) => [
						<span
							key="name"
							className="block max-w-[560px] truncate"
							title={item.name}
						>
							{item.name}
						</span>,
						<span key="users" className="tabular-nums">
							{item.users}
						</span>,
						<span
							key="actions"
							className="inline-flex items-center justify-end gap-1"
						>
							{canManage ? (
								<>
									<Tooltip
										text={ctx.t({
											code: "organizations.edit",
											msg: "Edit organization",
										})}
									>
										<Button
											variant="icon"
											aria-label={ctx.t(
												{
													code: "organizations.edit_for",
													msg: "Edit {name}",
												},
												{ name: item.name },
											)}
											onPress={() => openEditDialog(item)}
										>
											<Pencil className="h-4 w-4" aria-hidden="true" />
										</Button>
									</Tooltip>
									<Tooltip
										text={ctx.t({
											code: "organizations.delete",
											msg: "Delete organization",
										})}
									>
										<Button
											variant="icon"
											aria-label={ctx.t(
												{
													code: "organizations.delete_for",
													msg: "Delete {name}",
												},
												{ name: item.name },
											)}
											onPress={() => openDeleteDialog(item)}
										>
											<Trash2 className="h-4 w-4" aria-hidden="true" />
										</Button>
									</Tooltip>
								</>
							) : null}
						</span>,
					]}
				/>

				<Pagination
					total={totalItems}
					page={safePage}
					pageSize={pageSize}
					pageSizeOptions={[25, 50, 100]}
					noun={ctx.t({
						code: "organizations.noun",
						msg: "organizations",
					})}
					showingText={showingText}
					pageText={pageText}
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
					onPageChange={(nextPage) => updateQuery({ page: nextPage })}
					onPageSizeChange={(nextPageSize) =>
						updateQuery({ pageSize: nextPageSize, page: 1 })
					}
				/>
			</section>

			<div className="h-16" aria-hidden="true" />

			<ModalDialog
				isOpen={addOpen}
				onOpenChange={(open) => {
					if (!open) closeAddDialog();
				}}
				title={addButtonLabel}
				closeLabel={closeLabel}
				footer={
					<>
						<Button
							variant="secondary"
							onPress={closeAddDialog}
							isDisabled={isSubmitting}
						>
							{cancelLabel}
						</Button>
						<Button
							variant="primary"
							onPress={handleCreateSubmit}
							isLoading={isSubmitting}
						>
							{addButtonLabel}
						</Button>
					</>
				}
			>
				<form
					onSubmit={(e) => {
						e.preventDefault();
						handleCreateSubmit();
					}}
					className="flex flex-col gap-6"
					noValidate
				>
					{renderServerError()}
					<TextField
						label={ctx.t({ code: "common.name", msg: "Name" })}
						name="name"
						value={nameValue}
						onChange={(val) => {
							setNameValue(val);
							if (nameError) setNameError("");
						}}
						isRequired
						requiredLabel={requiredLabel}
						autoFocus
						errorMessage={nameError || undefined}
					/>
				</form>
			</ModalDialog>

			<ModalDialog
				isOpen={Boolean(editingOrg)}
				onOpenChange={(open) => {
					if (!open) closeEditDialog();
				}}
				title={ctx.t({
					code: "organizations.edit",
					msg: "Edit organization",
				})}
				closeLabel={closeLabel}
				footer={
					<>
						<Button
							variant="secondary"
							onPress={closeEditDialog}
							isDisabled={isSubmitting}
						>
							{cancelLabel}
						</Button>
						<Button
							variant="primary"
							onPress={handleEditSubmit}
							isLoading={isSubmitting}
						>
							{ctx.t({ code: "common.save_changes", msg: "Save changes" })}
						</Button>
					</>
				}
			>
				<form
					onSubmit={(e) => {
						e.preventDefault();
						handleEditSubmit();
					}}
					className="flex flex-col gap-6"
					noValidate
				>
					{renderServerError()}
					<TextField
						label={ctx.t({ code: "common.name", msg: "Name" })}
						name="name"
						value={nameValue}
						onChange={(val) => {
							setNameValue(val);
							if (nameError) setNameError("");
						}}
						isRequired
						requiredLabel={requiredLabel}
						autoFocus
						errorMessage={nameError || undefined}
					/>
				</form>
			</ModalDialog>

			<ModalDialog
				isOpen={Boolean(deletingOrg)}
				onOpenChange={(open) => {
					if (!open) closeDeleteDialog();
				}}
				role="alertdialog"
				title={
					deletingInUse
						? ctx.t({
								code: "organizations.in_use_title",
								msg: "This organization is in use",
							})
						: ctx.t({
								code: "organizations.delete",
								msg: "Delete organization",
							})
				}
				closeLabel={closeLabel}
				footer={
					deletingInUse ? (
						<Button variant="primary" onPress={closeDeleteDialog}>
							{closeLabel}
						</Button>
					) : (
						<>
							<Button
								variant="secondary"
								onPress={closeDeleteDialog}
								isDisabled={isSubmitting}
							>
								{cancelLabel}
							</Button>
							<Button
								variant="destructive"
								onPress={handleDeleteSubmit}
								isLoading={isSubmitting}
							>
								{ctx.t({
									code: "organizations.delete",
									msg: "Delete organization",
								})}
							</Button>
						</>
					)
				}
			>
				{renderServerError()}
				{deletingOrg ? (
					deletingInUse ? (
						<p className="text-body text-fg-2">
							<strong className="font-medium text-fg">
								{deletingOrg.name}
							</strong>{" "}
							{ctx.t(
								{
									code: "organizations.in_use_body",
									msg: "has {users}. Move them to another organization in Access management, then delete it.",
								},
								{ users: userCountText },
							)}
						</p>
					) : (
						<p className="text-body text-fg-2">
							<strong className="font-medium text-fg">
								{deletingOrg.name}
							</strong>{" "}
							{ctx.t({
								code: "organizations.delete_warning",
								msg: "will be deleted. This cannot be undone.",
							})}
						</p>
					)
				) : null}
			</ModalDialog>

			<ToastRegion
				toasts={toasts}
				onDismiss={dismissToast}
				dismissLabel={ctx.t({
					code: "common.dismiss_notification",
					msg: "Dismiss notification",
				})}
			/>
		</div>
	);
}
