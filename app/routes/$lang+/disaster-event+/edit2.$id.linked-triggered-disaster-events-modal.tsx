import { useEffect, useMemo, useState } from "react";
import {
	useFetcher,
	useLoaderData,
	useNavigate,
	useOutletContext,
} from "react-router";
import { InputText } from "primereact/inputtext";
import { Button } from "primereact/button";
import { Checkbox } from "primereact/checkbox";
import { DataView } from "primereact/dataview";
import { and, desc, eq, ilike, ne, or, sql } from "drizzle-orm";
import { dr } from "~/db.server";
import { disasterEventTable } from "~/drizzle/schema/disasterEventTable";
import type { DisasterEventFormOutletContext } from "~/frontend/disaster-event/DisasterEventForm";
import { authActionWithPerm, authLoaderWithPerm } from "~/utils/auth";
import { getCountryAccountsIdFromSession } from "~/utils/session";

type LinkedEventItem = DisasterEventFormOutletContext["disasterEventOptions"][number];

function localizedHipName(
	name: Record<string, string> | null | undefined,
	lang: string,
) {
	if (!name) {
		return "";
	}

	return String(name[lang] || name.en || Object.values(name)[0] || "").trim();
}

function formatDisasterEventOption(
	event: {
		id: string;
		nameNational: string | null;
		nameGlobalOrRegional: string | null;
		hipHazard: {
			name: Record<string, string> | null;
			code: string | null;
		} | null;
		hipCluster: {
			name: Record<string, string> | null;
		} | null;
		hipType: {
			name: Record<string, string> | null;
		} | null;
	},
	lang: string,
) {
	const displayName =
		event.nameNational?.trim() ||
		event.nameGlobalOrRegional?.trim() ||
		`DE: ${event.id.slice(0, 8)}`;
	const hazardName = localizedHipName(event.hipHazard?.name, lang);
	const clusterName = localizedHipName(event.hipCluster?.name, lang);
	const typeName = localizedHipName(event.hipType?.name, lang);
	const hipLabel = hazardName
		? event.hipHazard?.code
			? `H: ${hazardName} (${event.hipHazard.code})`
			: `H: ${hazardName}`
		: clusterName
			? `C: ${clusterName}`
			: typeName
				? `T: ${typeName}`
				: "";

	return {
		id: event.id,
		name: displayName,
		code: event.id,
		hip: hipLabel,
	};
}

async function queryDisasterEventOptions(
	countryAccountsId: string,
	currentItemId: string,
	lang: string,
	keyword?: string,
) {
	const normalizedKeyword = keyword?.trim();
	const shouldSearch = Boolean(normalizedKeyword);
	const searchTerm = normalizedKeyword ? `%${normalizedKeyword}%` : "";

	const disasterEvents = await dr.query.disasterEventTable.findMany({
		columns: {
			id: true,
			nameNational: true,
			nameGlobalOrRegional: true,
		},
		with: {
			hipHazard: {
				columns: {
					name: true,
					code: true,
				},
			},
			hipCluster: {
				columns: {
					name: true,
				},
			},
			hipType: {
				columns: {
					name: true,
				},
			},
		},
		where: shouldSearch
			? and(
				eq(disasterEventTable.countryAccountsId, countryAccountsId),
				ne(disasterEventTable.id, currentItemId),
				or(
					ilike(disasterEventTable.nameNational, searchTerm),
					ilike(disasterEventTable.nameGlobalOrRegional, searchTerm),
					ilike(disasterEventTable.nationalDisasterId, searchTerm),
					ilike(disasterEventTable.glide, searchTerm),
					sql`cast(${disasterEventTable.id} as text) ilike ${searchTerm}`,
				),
			)
			: and(
				eq(disasterEventTable.countryAccountsId, countryAccountsId),
				ne(disasterEventTable.id, currentItemId),
			),
		orderBy: [desc(disasterEventTable.updatedAt)],
		limit: shouldSearch ? 500 : 200,
	});

	return disasterEvents.map((event) => formatDisasterEventOption(event, lang));
}

export const loader = authLoaderWithPerm("EditData", async ({ request, params }) => {
	const countryAccountsId = await getCountryAccountsIdFromSession(request);
	if (!countryAccountsId) {
		throw new Response("Unauthorized", { status: 401 });
	}

	const currentItemId = String(params.id ?? "").trim();
	const lang = typeof params.lang === "string" && params.lang ? params.lang : "en";
	if (!currentItemId || currentItemId === "new") {
		return {
			disasterEventOptions: [],
		};
	}

	const disasterEventOptions = await queryDisasterEventOptions(
		countryAccountsId,
		currentItemId,
		lang,
	);

	return {
		disasterEventOptions,
	};
});

export const action = authActionWithPerm("EditData", async ({ request, params }) => {
	const countryAccountsId = await getCountryAccountsIdFromSession(request);
	if (!countryAccountsId) {
		throw new Response("Unauthorized", { status: 401 });
	}

	const currentItemId = String(params.id ?? "").trim();
	const lang = typeof params.lang === "string" && params.lang ? params.lang : "en";
	if (!currentItemId || currentItemId === "new") {
		return {
			disasterEventOptions: [],
			keyword: "",
		};
	}

	const formData = await request.formData();
	const keyword = String(formData.get("keyword") ?? "").trim();
	const disasterEventOptions = await queryDisasterEventOptions(
		countryAccountsId,
		currentItemId,
		lang,
		keyword,
	);

	return {
		disasterEventOptions,
		keyword,
	};
});

export default function LinkedTriggeredDisasterEventsModalRoute() {
	const ld = useLoaderData<typeof loader>();
	const fetcher = useFetcher<typeof action>();
	const navigate = useNavigate();
	const {
		triggeredDisasterEventTarget,
		setTriggeredDisasterEventTarget,
		triggeringDisasterEventTarget,
	} = useOutletContext<DisasterEventFormOutletContext>();

	const [searchTerm, setSearchTerm] = useState("");
	const [pendingExitAction, setPendingExitAction] = useState<
		"close" | "cancel" | "apply" | null
	>(null);
	const [draftTarget, setDraftTarget] = useState<LinkedEventItem[]>(
		Array.isArray(triggeredDisasterEventTarget)
			? triggeredDisasterEventTarget.filter(
				(item) => !triggeringDisasterEventTarget.some((other) => other.id === item.id),
			)
			: [],
	);
	const [selectedAvailableIds, setSelectedAvailableIds] = useState<string[]>([]);
	const [selectedLinkedIds, setSelectedLinkedIds] = useState<string[]>([]);

	useEffect(() => {
		const timeoutId = window.setTimeout(() => {
			const keyword = searchTerm.trim();
			if (keyword.length < 3) {
				return;
			}

			fetcher.submit({ keyword }, { method: "post" });
		}, 300);

		return () => {
			window.clearTimeout(timeoutId);
		};
	}, [fetcher, searchTerm]);

	const sourceOptions = useMemo(() => {
		if (searchTerm.trim().length < 3) {
			return ld.disasterEventOptions;
		}

		return fetcher.data?.disasterEventOptions ?? [];
	}, [fetcher.data?.disasterEventOptions, ld.disasterEventOptions, searchTerm]);

	const availableEvents = useMemo(() => {
		const selectedIds = new Set(draftTarget.map((item) => item.id));
		const blockedIds = new Set(triggeringDisasterEventTarget.map((item) => item.id));
		return sourceOptions.filter(
			(item) => !selectedIds.has(item.id) && !blockedIds.has(item.id),
		);
	}, [draftTarget, sourceOptions, triggeringDisasterEventTarget]);

	const toggleAvailable = (id: string, checked: boolean) => {
		setSelectedAvailableIds((previous) =>
			checked
				? [...previous, id]
				: previous.filter((currentId) => currentId !== id),
		);
	};

	const toggleLinked = (id: string, checked: boolean) => {
		setSelectedLinkedIds((previous) =>
			checked
				? [...previous, id]
				: previous.filter((currentId) => currentId !== id),
		);
	};

	const addSelected = () => {
		if (selectedAvailableIds.length === 0) {
			return;
		}

		const blockedIds = new Set(triggeringDisasterEventTarget.map((item) => item.id));
		const toAdd = availableEvents.filter((item) =>
			selectedAvailableIds.includes(item.id) && !blockedIds.has(item.id),
		);
		setDraftTarget((previous) => [...previous, ...toAdd]);
		setSelectedAvailableIds([]);
	};

	const removeSelected = () => {
		if (selectedLinkedIds.length === 0) {
			return;
		}

		setDraftTarget((previous) =>
			previous.filter((item) => !selectedLinkedIds.includes(item.id)),
		);
		setSelectedLinkedIds([]);
	};

	const handleClose = () => {
		if (pendingExitAction) {
			return;
		}

		setPendingExitAction("close");
		navigate("..", { replace: true });
	};

	const handleCancel = () => {
		if (pendingExitAction) {
			return;
		}

		setPendingExitAction("cancel");
		navigate("..", { replace: true });
	};

	const handleApply = () => {
		if (pendingExitAction) {
			return;
		}

		setPendingExitAction("apply");
		setTriggeredDisasterEventTarget(
			draftTarget.filter(
				(item) =>
					!triggeringDisasterEventTarget.some((other) => other.id === item.id),
			),
		);
		navigate("..", { replace: true });
	};

	const renderAvailableItem = (item: LinkedEventItem) => (
		<div className="mb-2 flex items-start rounded-lg border border-slate-200 px-4 py-3 last:mb-0">
			<div className="flex w-full items-start gap-3">
				<Checkbox
					inputId={`linked-triggered-available-${item.id}`}
					checked={selectedAvailableIds.includes(item.id)}
					onChange={(event) =>
						toggleAvailable(item.id, Boolean(event.checked))
					}
				/>
				<div>
					<p className="text-[14px] font-semibold text-slate-700">{item.name}</p>
					{item.hip ? (
						<p className="mt-1 text-[12px] text-slate-500">{item.hip}</p>
					) : null}
				</div>
			</div>
		</div>
	);

	const renderLinkedItem = (item: LinkedEventItem) => (
		<div className="mb-2 flex items-start rounded-lg border border-slate-200 px-4 py-3 last:mb-0">
			<div className="flex w-full items-start gap-3">
				<Checkbox
					inputId={`linked-triggered-selected-${item.id}`}
					checked={selectedLinkedIds.includes(item.id)}
					onChange={(event) => toggleLinked(item.id, Boolean(event.checked))}
				/>
				<div>
					<p className="text-[14px] font-semibold text-slate-700">{item.name}</p>
					{item.hip ? (
						<p className="mt-1 text-[12px] text-slate-500">{item.hip}</p>
					) : null}
				</div>
			</div>
		</div>
	);

	return (
		<div
			style={{
				position: "fixed",
				inset: 0,
				zIndex: 40,
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				background: "rgba(0, 0, 0, 0.35)",
				padding: "1rem",
			}}
		>
			<div className="max-h-[calc(100vh-2rem)] w-full max-w-6xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
				<div className="mb-4 flex items-center justify-between">
					<h3 className="text-[18px] font-semibold text-slate-800">
						Manage linked triggered (subsequent) disaster events
					</h3>
					<Button
						type="button"
						icon="pi pi-times"
						text
						aria-label="Close"
						loading={pendingExitAction === "close"}
						disabled={Boolean(pendingExitAction)}
						onClick={handleClose}
					/>
				</div>

				<p className="mb-4 text-[13px] text-slate-500">
					Search and select disaster events that were triggered by this event.
				</p>

				<div className="mb-4 relative">
					<i className="pi pi-search pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
					<InputText
						value={searchTerm}
						onChange={(event) => setSearchTerm(event.target.value)}
						placeholder="Search disaster events..."
						className="w-full pr-10"
					/>
				</div>

				<div className="grid gap-4 md:grid-cols-2">
					<div className="rounded-xl border border-slate-200 bg-white p-4">
						<div className="mb-3 flex items-center justify-between gap-2">
							<h4 className="text-[14px] font-semibold text-slate-800">
								{searchTerm.trim().length >= 3
									? "Search results"
									: "Latest 200 events"}
							</h4>
							<Button
								type="button"
								label="Add selected"
								onClick={addSelected}
								disabled={selectedAvailableIds.length === 0}
							/>
						</div>
						<div className="max-h-[50vh] overflow-y-auto pr-1">
							<DataView
								value={availableEvents}
								itemTemplate={renderAvailableItem}
								emptyMessage="No events available"
							/>
						</div>
					</div>

					<div className="rounded-xl border border-slate-200 bg-white p-4">
						<div className="mb-3 flex items-center justify-between gap-2">
							<h4 className="text-[14px] font-semibold text-slate-800">
								Selected triggered events
							</h4>
							<Button
								type="button"
								label="Remove selected"
								severity="danger"
								outlined
								onClick={removeSelected}
								disabled={selectedLinkedIds.length === 0}
							/>
						</div>
						<div className="max-h-[50vh] overflow-y-auto pr-1">
							<DataView
								value={draftTarget}
								itemTemplate={renderLinkedItem}
								emptyMessage="No triggered events linked"
							/>
						</div>
					</div>
				</div>

				<div className="mt-4 flex justify-end gap-2">
					<Button
						type="button"
						label="Cancel"
						outlined
						loading={pendingExitAction === "cancel"}
						disabled={Boolean(pendingExitAction)}
						onClick={handleCancel}
					/>
					<Button
						type="button"
						label="Apply"
						loading={pendingExitAction === "apply"}
						disabled={Boolean(pendingExitAction)}
						onClick={handleApply}
					/>
					<span className="sr-only" aria-live="polite">
						{pendingExitAction
							? "Closing linked triggered disaster events dialog"
							: ""}
					</span>
				</div>
			</div>
		</div>
	);
}
