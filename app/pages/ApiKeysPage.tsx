import { Copy, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
	useFetcher,
	useLoaderData,
	useLocation,
	useNavigate,
	useNavigation,
} from "react-router";
import type {
	ApiKeyListRow,
	ApiKeySortColumn,
} from "~/db/queries/apiKeyRepository";
import {
	Button,
	Callout,
	ModalDialog,
	Pagination,
	SortableTable,
	type SortDescriptor,
	TextField,
	type ToastItem,
	ToastRegion,
	Tooltip,
} from "~/design-system/components";
import type { ApiKeyActionResult } from "~/frontend/apiKeyAction";
import { ViewContext } from "~/frontend/context";
import type { loader } from "~/routes/$lang+/settings+/api-key+/_layout";

type PendingAction =
	| { type: "create" }
	| { type: "rename" }
	| { type: "delete"; name: string };

interface CreatedKeyReveal {
	id: string;
	name: string;
	secret: string;
}

const UTC_DATE_FORMATTER = new Intl.DateTimeFormat("en-GB", {
	day: "2-digit",
	month: "short",
	year: "numeric",
	timeZone: "UTC",
});

function formatDateCreated(
	dateValue: Date | string | null | undefined,
): string {
	if (!dateValue) return "-";
	const d = typeof dateValue === "string" ? new Date(dateValue) : dateValue;
	if (Number.isNaN(d.getTime())) return "-";
	return UTC_DATE_FORMATTER.format(d);
}

async function copyTextToClipboard(text: string): Promise<boolean> {
	try {
		if (!navigator.clipboard?.writeText) return false;
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		return false;
	}
}

export default function ApiKeysPage() {
	const ld = useLoaderData<typeof loader>();
	const ctx = new ViewContext();
	const navigate = useNavigate();
	const navigation = useNavigation();
	const location = useLocation();
	const fetcher = useFetcher<ApiKeyActionResult>();

	const {
		items,
		total,
		existingNames,
		sort,
		dir,
		page,
		pageSize,
		canAdd,
		canEdit,
	} = ld;

	const [addOpen, setAddOpen] = useState(false);
	const [renamingKey, setRenamingKey] = useState<ApiKeyListRow | null>(null);
	const [deletingKey, setDeletingKey] = useState<ApiKeyListRow | null>(null);
	const [createdKey, setCreatedKey] = useState<CreatedKeyReveal | null>(null);

	const [nameValue, setNameValue] = useState("");
	const [nameError, setNameError] = useState("");
	const [serverError, setServerError] = useState<string | null>(null);

	const [toasts, setToasts] = useState<ToastItem[]>([]);
	const pendingActionRef = useRef<PendingAction | null>(null);
	const toastTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
		new Map(),
	);

	useEffect(() => {
		return () => {
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
				if (fetcher.data.key) {
					setCreatedKey(fetcher.data.key);
				}
			} else if (action.type === "rename") {
				setRenamingKey(null);
				addToast(
					ctx.t({
						code: "api_keys.toast_saved",
						msg: "Changes saved.",
					}),
					"success",
				);
			} else if (action.type === "delete") {
				setDeletingKey(null);
				addToast(
					ctx.t(
						{
							code: "api_keys.toast_deleted",
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
			}
			if (fetcher.data.error) {
				setServerError(fetcher.data.error);
			}
		}
	}, [fetcher.state, fetcher.data]);

	const updateQuery = (
		updates: Partial<{
			sort: ApiKeySortColumn;
			dir: "asc" | "desc";
			page: number;
			pageSize: number;
		}>,
	) => {
		const params = new URLSearchParams(location.search);
		const nextSort = updates.sort ?? sort;
		const nextDir = updates.dir ?? dir;
		const nextPage = updates.page ?? page;
		const nextPageSize = updates.pageSize ?? pageSize;

		params.set("sort", nextSort);
		params.set("dir", nextDir);
		params.set("page", String(nextPage));
		params.set("pageSize", String(nextPageSize));

		navigate(`${location.pathname}?${params.toString()}`);
	};

	const openAddDialog = () => {
		setNameValue("");
		setNameError("");
		setServerError(null);
		setAddOpen(true);
	};

	const openRenameDialog = (item: ApiKeyListRow) => {
		setNameValue(item.name);
		setNameError("");
		setServerError(null);
		setRenamingKey(item);
	};

	const openDeleteDialog = (item: ApiKeyListRow) => {
		setServerError(null);
		setDeletingKey(item);
	};

	const handleCopy = async (secret: string) => {
		const copied = await copyTextToClipboard(secret);
		if (copied) {
			addToast(
				ctx.t({
					code: "api_keys.toast_copied",
					msg: "Key copied.",
				}),
				"success",
			);
		} else {
			addToast(
				ctx.t({
					code: "api_keys.toast_copy_failed",
					msg: "Could not copy key.",
				}),
				"error",
			);
		}
	};

	const validateName = (raw: string, excludeName?: string): string | null => {
		const trimmed = raw.trim();
		if (!trimmed) {
			return ctx.t({
				code: "api_keys.enter_name",
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
				code: "api_keys.duplicate_name",
				msg: "A key with this name already exists.",
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
		setNameError("");
		setServerError(null);
		pendingActionRef.current = { type: "create" };
		const formData = new FormData();
		formData.set("_fetcher", "1");
		formData.set("name", nameValue.trim());
		fetcher.submit(formData, {
			method: "post",
			action: ctx.url("/settings/api-key/new"),
		});
	};

	const handleRenameSubmit = () => {
		if (!renamingKey) return;
		const validationError = validateName(nameValue, renamingKey.name);
		if (validationError) {
			setNameError(validationError);
			return;
		}
		setNameError("");
		setServerError(null);
		pendingActionRef.current = { type: "rename" };
		const formData = new FormData();
		formData.set("_fetcher", "1");
		formData.set("name", nameValue.trim());
		fetcher.submit(formData, {
			method: "post",
			action: ctx.url(`/settings/api-key/edit/${renamingKey.id}`),
		});
	};

	const handleDeleteSubmit = () => {
		if (!deletingKey) return;
		setServerError(null);
		pendingActionRef.current = { type: "delete", name: deletingKey.name };
		const formData = new FormData();
		formData.set("_fetcher", "1");
		fetcher.submit(formData, {
			method: "post",
			action: ctx.url(`/settings/api-key/delete/${deletingKey.id}`),
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
			id: "key",
			label: ctx.t({ code: "api_keys.key", msg: "Key" }),
			sortable: false,
		},
		{
			id: "managedBy",
			label: ctx.t({ code: "common.managed_by", msg: "Managed by" }),
			sortable: true,
		},
		{
			id: "created",
			label: ctx.t({ code: "api_keys.created", msg: "Created" }),
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

	const pageTitle = ctx.t({ code: "api_keys.api_keys", msg: "API keys" });
	const addButtonLabel = ctx.t({
		code: "api_keys.add_api_key",
		msg: "Add API key",
	});
	const closeLabel = ctx.t({ code: "common.close", msg: "Close" });
	const cancelLabel = ctx.t({ code: "common.cancel", msg: "Cancel" });
	const copyKeyLabel = ctx.t({ code: "api_keys.copy_key", msg: "Copy key" });
	const requiredLabel = ctx.t({
		code: "common.required_parens",
		msg: "(required)",
	});

	const totalPages = Math.max(1, Math.ceil(total / pageSize));
	const safePage = Math.min(Math.max(1, page), totalPages);
	const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
	const to = Math.min(safePage * pageSize, total);
	const showingText =
		total === 0
			? ctx.t({
					code: "api_keys.pagination_showing_empty",
					msg: "Showing 0 of 0 keys",
				})
			: ctx.t(
					{
						code: "api_keys.pagination_showing",
						msg: "Showing {from}-{to} of {total} keys",
					},
					{ from, to, total },
				);
	const pageText = ctx.t(
		{
			code: "common.pagination_page",
			msg: "Page {page} of {totalPages}",
		},
		{ page: safePage, totalPages },
	);

	const closeAddDialog = () => {
		setAddOpen(false);
		setNameError("");
		setServerError(null);
	};

	const closeRenameDialog = () => {
		setRenamingKey(null);
		setNameError("");
		setServerError(null);
	};

	const closeDeleteDialog = () => {
		setDeletingKey(null);
		setServerError(null);
	};

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
							code: "api_keys.subtitle",
							msg: "Keys that let other applications read and send data for this site.",
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
							sort: next.column as ApiKeySortColumn,
							dir: next.direction === "ascending" ? "asc" : "desc",
							page: 1,
						});
					}}
					renderEmptyState={() => (
						<div className="flex flex-col items-start gap-3 p-6 text-body text-fg-2">
							<p>
								{ctx.t({
									code: "api_keys.empty_state",
									msg: "No API keys yet. Add one when another application needs access to this site's data.",
								})}
							</p>
							{canAdd ? (
								<Button variant="secondary" onPress={openAddDialog}>
									{addButtonLabel}
								</Button>
							) : null}
						</div>
					)}
					renderRow={(item) => [
						<span
							key="name"
							className="block max-w-[320px] truncate"
							title={item.name}
						>
							{item.name}
						</span>,
						<span key="key" className="inline-flex items-center gap-1">
							<span className="font-mono">{`${item.secret.slice(0, 5)}…`}</span>
							<Tooltip text={copyKeyLabel}>
								<Button
									variant="icon"
									aria-label={ctx.t(
										{
											code: "api_keys.copy_key_for",
											msg: "Copy key for {name}",
										},
										{ name: item.name },
									)}
									onPress={() => handleCopy(item.secret)}
								>
									<Copy className="h-4 w-4" aria-hidden="true" />
								</Button>
							</Tooltip>
						</span>,
						<span
							key="managedBy"
							className="block max-w-[260px] truncate"
							title={item.managedByUser.email}
						>
							{item.managedByUser.email}
						</span>,
						<span key="created" className="tabular-nums whitespace-nowrap">
							{formatDateCreated(item.createdAt)}
						</span>,
						<span
							key="actions"
							className="inline-flex items-center justify-end gap-1"
						>
							{canEdit ? (
								<>
									<Tooltip
										text={ctx.t({
											code: "api_keys.rename_key_tooltip",
											msg: "Rename key",
										})}
									>
										<Button
											variant="icon"
											aria-label={ctx.t(
												{
													code: "api_keys.rename_key_for",
													msg: "Rename {name}",
												},
												{ name: item.name },
											)}
											onPress={() => openRenameDialog(item)}
										>
											<Pencil className="h-4 w-4" aria-hidden="true" />
										</Button>
									</Tooltip>
									<Tooltip
										text={ctx.t({
											code: "api_keys.delete_key_tooltip",
											msg: "Delete key",
										})}
									>
										<Button
											variant="icon"
											aria-label={ctx.t(
												{
													code: "api_keys.delete_key_for",
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
					total={total}
					page={page}
					pageSize={pageSize}
					pageSizeOptions={[25, 50, 100]}
					noun={ctx.t({ code: "api_keys.noun_keys", msg: "keys" })}
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
							{ctx.t({ code: "api_keys.create_key", msg: "Create key" })}
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
					{serverError ? <Callout tone="error">{serverError}</Callout> : null}
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
						helpText={ctx.t({
							code: "api_keys.name_help",
							msg: "Name the key after the application that will use it.",
						})}
					/>
				</form>
			</ModalDialog>

			<ModalDialog
				isOpen={Boolean(renamingKey)}
				onOpenChange={(open) => {
					if (!open) closeRenameDialog();
				}}
				title={ctx.t({
					code: "api_keys.rename_api_key",
					msg: "Rename API key",
				})}
				closeLabel={closeLabel}
				footer={
					<>
						<Button
							variant="secondary"
							onPress={closeRenameDialog}
							isDisabled={isSubmitting}
						>
							{cancelLabel}
						</Button>
						<Button
							variant="primary"
							onPress={handleRenameSubmit}
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
						handleRenameSubmit();
					}}
					className="flex flex-col gap-6"
					noValidate
				>
					{serverError ? <Callout tone="error">{serverError}</Callout> : null}
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
						helpText={ctx.t({
							code: "api_keys.name_help",
							msg: "Name the key after the application that will use it.",
						})}
					/>
				</form>
			</ModalDialog>

			<ModalDialog
				isOpen={Boolean(createdKey)}
				onOpenChange={(open) => {
					if (!open) setCreatedKey(null);
				}}
				size="lg"
				title={ctx.t({
					code: "api_keys.api_key_created",
					msg: "API key created",
				})}
				closeLabel={closeLabel}
				footer={
					<Button variant="primary" onPress={() => setCreatedKey(null)}>
						{ctx.t({ code: "common.done", msg: "Done" })}
					</Button>
				}
			>
				{createdKey ? (
					<>
						<Callout
							tone="success"
							title={ctx.t(
								{
									code: "api_keys.ready_to_use_title",
									msg: "{name} is ready to use",
								},
								{ name: createdKey.name },
							)}
						>
							{ctx.t({
								code: "api_keys.ready_to_use_body",
								msg: "Copy the key and add it to the application that needs it.",
							})}
						</Callout>
						<div className="flex items-end gap-2">
							<TextField
								label={ctx.t({ code: "api_keys.key", msg: "Key" })}
								value={createdKey.secret}
								isReadOnly
								className="min-w-0 flex-1"
								inputClassName="font-mono"
								onFocus={(e) => e.currentTarget.select()}
							/>
							<Button
								variant="secondary"
								onPress={() => handleCopy(createdKey.secret)}
							>
								<Copy className="h-4 w-4" aria-hidden="true" />
								<span>{copyKeyLabel}</span>
							</Button>
						</div>
					</>
				) : null}
			</ModalDialog>

			<ModalDialog
				isOpen={Boolean(deletingKey)}
				onOpenChange={(open) => {
					if (!open) closeDeleteDialog();
				}}
				role="alertdialog"
				title={ctx.t({
					code: "api_keys.delete_api_key",
					msg: "Delete API key",
				})}
				closeLabel={closeLabel}
				footer={
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
							{ctx.t({ code: "api_keys.delete_key", msg: "Delete key" })}
						</Button>
					</>
				}
			>
				{serverError ? <Callout tone="error">{serverError}</Callout> : null}
				{deletingKey ? (
					<p className="text-body text-fg-2">
						<strong className="font-medium text-fg">{deletingKey.name}</strong>{" "}
						{ctx.t({
							code: "api_keys.delete_warning",
							msg: "will be deleted. Applications that use this key will stop working straight away. This cannot be undone.",
						})}
					</p>
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
