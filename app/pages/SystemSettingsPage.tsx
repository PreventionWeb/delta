import { Pencil } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useFetcher, useLoaderData } from "react-router";
import {
	Button,
	Callout,
	FormSelect,
	ModalDialog,
	TextField,
	type ToastItem,
	ToastRegion,
} from "~/design-system/components";
import { ViewContext } from "~/frontend/context";
import {
	INSTANCE_NAME_MAX_LENGTH,
	type SystemSettingsActionResult,
} from "~/frontend/systemSettingsAction";
import type { loader } from "~/routes/$lang+/settings+/system";

interface SettingRow {
	label: string;
	value: ReactNode;
}

function formatLanguageDisplayName(
	code: string | null | undefined,
	displayLocale: string,
): string {
	if (!code) return "-";
	try {
		const formatter = new Intl.DisplayNames([displayLocale], {
			type: "language",
		});
		const name = formatter.of(code);
		if (!name) return code;
		return name.charAt(0).toUpperCase() + name.slice(1);
	} catch {
		return code;
	}
}

function SettingsGroup({
	title,
	subtitle,
	action,
	rows,
}: {
	title: string;
	subtitle?: string;
	action?: ReactNode;
	rows: SettingRow[];
}) {
	return (
		<div className="flex flex-col gap-2">
			<div className="flex flex-wrap items-end justify-between gap-2">
				<div className="flex flex-col gap-1">
					<h2 className="text-section font-medium leading-[var(--lh-tight)] text-fg">
						{title}
					</h2>
					{subtitle ? <p className="text-label text-fg-2">{subtitle}</p> : null}
				</div>
				{action ?? null}
			</div>
			<section
				aria-label={title}
				className="overflow-hidden rounded-lg border border-border-subtle bg-surface"
			>
				<dl>
					{rows.map((row) => (
						<div
							key={row.label}
							className="grid grid-cols-1 gap-x-6 gap-y-1 border-b border-border px-6 py-3 last:border-b-0 md:grid-cols-[220px_minmax(0,1fr)]"
						>
							<dt className="text-body text-fg-2">{row.label}</dt>
							<dd className="min-w-0 break-words text-body text-fg">
								{row.value}
							</dd>
						</div>
					))}
				</dl>
			</section>
		</div>
	);
}

export default function SystemSettingsPage() {
	const ld = useLoaderData<typeof loader>();
	const ctx = new ViewContext();
	const fetcher = useFetcher<SystemSettingsActionResult>();

	const [isDialogOpen, setIsDialogOpen] = useState(false);
	const [instanceName, setInstanceName] = useState("");
	const [language, setLanguage] = useState<string | null>(
		ld.systemLanguage ?? null,
	);
	const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
	const [serverError, setServerError] = useState<string | null>(null);
	const [toasts, setToasts] = useState<ToastItem[]>([]);

	const pendingSubmitRef = useRef(false);
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
			!pendingSubmitRef.current
		) {
			return;
		}
		pendingSubmitRef.current = false;

		if (fetcher.data.ok) {
			setIsDialogOpen(false);
			setFieldErrors({});
			setServerError(null);
			addToast(
				ctx.t({
					code: "settings.system.toast_saved",
					msg: "Settings saved. They apply the next time you sign in.",
				}),
				"success",
			);
			return;
		}

		if (fetcher.data.fieldErrors) {
			setFieldErrors(fetcher.data.fieldErrors);
		}
		if (fetcher.data.error) {
			setServerError(fetcher.data.error);
		}
	}, [fetcher.state, fetcher.data]);

	const languageOptions = useMemo(
		() =>
			(ld.availableLanguages ?? []).map((code) => ({
				id: code,
				label: formatLanguageDisplayName(code, ctx.lang),
			})),
		[ld.availableLanguages, ctx.lang],
	);

	const openEditDialog = () => {
		setInstanceName(ld.instanceSystemSettings?.websiteName ?? "");
		setLanguage(
			ld.instanceSystemSettings?.language ?? ld.systemLanguage ?? null,
		);
		setFieldErrors({});
		setServerError(null);
		setIsDialogOpen(true);
	};

	const closeEditDialog = () => {
		setIsDialogOpen(false);
		setFieldErrors({});
		setServerError(null);
	};

	const handleSubmit = () => {
		const trimmedName = instanceName.trim();
		const nextErrors: Record<string, string> = {};

		if (!trimmedName) {
			nextErrors.instanceName = ctx.t({
				code: "settings.system.error_instance_name_required",
				msg: "Enter an instance name.",
			});
		} else if (trimmedName.length > INSTANCE_NAME_MAX_LENGTH) {
			nextErrors.instanceName = ctx.t(
				{
					code: "settings.system.error_instance_name_max_length",
					msg: "Instance name must be {max} characters or fewer.",
				},
				{ max: INSTANCE_NAME_MAX_LENGTH },
			);
		}

		if (!language) {
			nextErrors.language = ctx.t({
				code: "settings.system.error_language_required",
				msg: "Select a language.",
			});
		}

		if (Object.keys(nextErrors).length > 0) {
			setFieldErrors(nextErrors);
			return;
		}

		setFieldErrors({});
		setServerError(null);
		pendingSubmitRef.current = true;

		const fd = new FormData();
		fd.set("instanceName", trimmedName);
		fd.set("language", language ?? "");
		fetcher.submit(fd, {
			method: "post",
			action: ctx.url("/settings/system"),
		});
	};

	const isSubmitting = fetcher.state !== "idle";
	const settings = ld.instanceSystemSettings;
	const isSmtp = ld.confEmailObj.EMAIL_TRANSPORT === "smtp";
	const notSetLabel = ctx.t({
		code: "settings.system.not_set",
		msg: "Not set",
	});

	const instanceRows: SettingRow[] = [
		{
			label: ctx.t({
				code: "settings.system.instance_name",
				msg: "Instance name",
			}),
			value: settings?.websiteName || "-",
		},
		{
			label: ctx.t({ code: "common.language", msg: "Language" }),
			value: formatLanguageDisplayName(settings?.language, ctx.lang),
		},
		{
			label: ctx.t({
				code: "settings.system.application_url",
				msg: "Application URL",
			}),
			value: ld.publicURL || "-",
		},
		{
			label: ctx.t({
				code: "settings.system.authenticator_name",
				msg: "Name shown in authenticator apps",
			}),
			value: settings?.totpIssuer || "-",
		},
	];

	const countryRows: SettingRow[] = [
		{
			label: ctx.t({ code: "common.country", msg: "Country" }),
			value: ld.country?.name || "-",
		},
		{
			label: ctx.t({ code: "common.type", msg: "Type" }),
			value: ld.countryAccountType || "-",
		},
		{
			label: ctx.t({ code: "common.currency", msg: "Currency" }),
			value: settings?.currencyCode || "-",
		},
	];

	const emailRows: SettingRow[] = [
		{
			label: ctx.t({ code: "settings.system.transport", msg: "Transport" }),
			value: isSmtp ? "SMTP" : ld.confEmailObj.EMAIL_TRANSPORT || "-",
		},
		...(isSmtp
			? [
					{
						label: ctx.t({ code: "settings.system.host", msg: "Host" }),
						value: ld.confEmailObj.SMTP_HOST || notSetLabel,
					},
					{
						label: ctx.t({ code: "settings.system.port", msg: "Port" }),
						value: ld.confEmailObj.SMTP_PORT ? (
							<span className="tabular-nums">{ld.confEmailObj.SMTP_PORT}</span>
						) : (
							notSetLabel
						),
					},
					{
						label: ctx.t({
							code: "settings.system.secure_connection",
							msg: "Secure connection",
						}),
						value: ld.confEmailObj.SMTP_SECURE
							? ctx.t({ code: "common.yes", msg: "Yes" })
							: ctx.t({ code: "common.no", msg: "No" }),
					},
				]
			: []),
	];

	const softwareRows: SettingRow[] = [
		{
			label: ctx.t({
				code: "settings.system.delta_resilience_software_application_version",
				msg: "DELTA Resilience version",
			}),
			value: ld.dtsSystemInfo?.versionNo ? (
				<span className="tabular-nums">{ld.dtsSystemInfo.versionNo}</span>
			) : (
				"-"
			),
		},
	];

	return (
		<div className="mx-auto flex w-full max-w-[1280px] flex-col px-4 pb-16 md:px-6 xl:px-8">
			<div className="flex flex-col gap-1 pt-8 pb-6">
				<h1 className="text-page font-medium leading-[var(--lh-tight)] text-fg">
					{ctx.t({
						code: "nav.system_settings",
						msg: "System settings",
					})}
				</h1>
				<p className="text-body text-fg-2">
					{ctx.t({
						code: "settings.system.subtitle",
						msg: "How this instance of DELTA Resilience is set up.",
					})}
				</p>
			</div>

			<div className="flex flex-col gap-8">
				<SettingsGroup
					title={ctx.t({
						code: "settings.system.group_instance",
						msg: "Instance",
					})}
					action={
						<Button variant="secondary" onPress={openEditDialog}>
							<Pencil className="h-4 w-4" aria-hidden="true" />
							<span>{ctx.t({ code: "common.edit", msg: "Edit" })}</span>
						</Button>
					}
					rows={instanceRows}
				/>

				<SettingsGroup
					title={ctx.t({
						code: "settings.system.group_country",
						msg: "Country",
					})}
					subtitle={ctx.t({
						code: "settings.system.group_country_subtitle",
						msg: "Set when the instance was created. Contact UNDRR to change it.",
					})}
					rows={countryRows}
				/>

				<SettingsGroup
					title={ctx.t({
						code: "settings.system.group_email",
						msg: "Email",
					})}
					subtitle={ctx.t({
						code: "settings.system.group_email_subtitle",
						msg: "Set on the server. How DELTA sends invitations and password emails.",
					})}
					rows={emailRows}
				/>

				<SettingsGroup
					title={ctx.t({
						code: "settings.system.software",
						msg: "Software",
					})}
					rows={softwareRows}
				/>
			</div>

			<ModalDialog
				isOpen={isDialogOpen}
				onOpenChange={(open) => {
					if (!open) closeEditDialog();
				}}
				title={ctx.t({
					code: "settings.system.edit_instance_settings",
					msg: "Edit instance settings",
				})}
				closeLabel={ctx.t({ code: "common.close", msg: "Close" })}
				footer={
					<>
						<Button
							variant="secondary"
							onPress={closeEditDialog}
							isDisabled={isSubmitting}
						>
							{ctx.t({ code: "common.cancel", msg: "Cancel" })}
						</Button>
						<Button
							variant="primary"
							type="submit"
							form="system-settings-edit-form"
							isLoading={isSubmitting}
						>
							{ctx.t({ code: "common.save_changes", msg: "Save changes" })}
						</Button>
					</>
				}
			>
				<form
					id="system-settings-edit-form"
					onSubmit={(e) => {
						e.preventDefault();
						handleSubmit();
					}}
					noValidate
					className="flex flex-col gap-6"
				>
					{serverError ? <Callout tone="error">{serverError}</Callout> : null}

					<TextField
						label={ctx.t({
							code: "settings.system.instance_name",
							msg: "Instance name",
						})}
						name="instanceName"
						value={instanceName}
						onChange={(val) => {
							setInstanceName(val);
							if (fieldErrors.instanceName) {
								setFieldErrors((prev) => ({ ...prev, instanceName: "" }));
							}
						}}
						autoFocus
						helpText={
							fieldErrors.instanceName
								? undefined
								: ctx.t({
										code: "settings.system.instance_name_help",
										msg: "Shown in the site selector and in emails.",
									})
						}
						errorMessage={fieldErrors.instanceName || undefined}
					/>

					<FormSelect
						label={ctx.t({ code: "common.language", msg: "Language" })}
						name="language"
						items={languageOptions}
						value={language}
						onChange={(val) => {
							setLanguage(val);
							if (fieldErrors.language) {
								setFieldErrors((prev) => ({ ...prev, language: "" }));
							}
						}}
						placeholder={ctx.t({
							code: "settings.system.select_language",
							msg: "Select a language",
						})}
						helpText={ctx.t({
							code: "settings.system.language_help",
							msg: "The default language for everyone on this instance.",
						})}
						errorMessage={fieldErrors.language || undefined}
					/>

					<p className="text-label text-fg-2">
						{ctx.t({
							code: "settings.system.changes_next_signin",
							msg: "Changes apply the next time you sign in.",
						})}
					</p>
				</form>
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
