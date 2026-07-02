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
import { hazardousEventTable } from "~/drizzle/schema/hazardousEventTable";
import type { DisasterEventFormOutletContext } from "~/frontend/disaster-event/DisasterEventForm";
import { authActionWithPerm, authLoaderWithPerm } from "~/utils/auth";
import { getCountryAccountsIdFromSession } from "~/utils/session";

type LinkedEventItem =
	DisasterEventFormOutletContext["hazardousEventOptions"][number];

function localizedHipName(
	name: Record<string, string> | null | undefined,
	lang: string,
) {
	if (!name) {
		return "";
	}

	return String(name[lang] || name.en || Object.values(name)[0] || "").trim();
}

function formatHazardousEventOption(
	event: {
		id: string;
		description: string | null;
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
	const hazardName = localizedHipName(event.hipHazard?.name, lang);
	const clusterName = localizedHipName(event.hipCluster?.name, lang);
	const typeName = localizedHipName(event.hipType?.name, lang);
	const displayName =
		hazardName ||
		clusterName ||
		typeName;

	return {
		id: event.id,
		name: displayName,
		code: event.id,
	};
}

async function queryHazardousEventOptions(
	countryAccountsId: string,
	lang: string,
	currentHazardousIds: string[],
	keyword?: string,
) {
	const normalizedKeyword = keyword?.trim();
	const shouldSearch = Boolean(normalizedKeyword);
	const searchTerm = normalizedKeyword ? `%${normalizedKeyword}%` : "";

	const hazardousEvents = await dr.query.hazardousEventTable.findMany({
		columns: {
			id: true,
			description: true,
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
				eq(hazardousEventTable.countryAccountsId, countryAccountsId),
				currentHazardousIds.length > 0
					? ne(hazardousEventTable.id, currentHazardousIds[0] as string)
					: undefined,
				or(
					ilike(hazardousEventTable.description, searchTerm),
					sql`exists (
						select 1
						from hip_hazard hh
						where hh.id = ${hazardousEventTable.hipHazardId}
						and cast(hh.name as text) ilike ${searchTerm}
					)`,
					sql`exists (
						select 1
						from hip_cluster hc
						where hc.id = ${hazardousEventTable.hipClusterId}
						and cast(hc.name as text) ilike ${searchTerm}
					)`,
					sql`exists (
						select 1
						from hip_class ht
						where ht.id = ${hazardousEventTable.hipTypeId}
						and cast(ht.name as text) ilike ${searchTerm}
					)`,
					sql`cast(${hazardousEventTable.id} as text) ilike ${searchTerm}`,
					sql`cast(${hazardousEventTable.startDate} as text) ilike ${searchTerm}`,
					sql`cast(${hazardousEventTable.endDate} as text) ilike ${searchTerm}`,
					sql`cast(${hazardousEventTable.approvalStatus} as text) ilike ${searchTerm}`,
				),
			)
			: and(
				eq(hazardousEventTable.countryAccountsId, countryAccountsId),
				currentHazardousIds.length > 0
					? ne(hazardousEventTable.id, currentHazardousIds[0] as string)
					: undefined,
			),
		orderBy: [desc(hazardousEventTable.updatedAt)],
		limit: shouldSearch ? 500 : 200,
	});

	const blocked = new Set(currentHazardousIds);
	return hazardousEvents
		.map((event) => formatHazardousEventOption(event, lang))
		.filter((event) => !blocked.has(event.id));
}

export const loader = authLoaderWithPerm("EditData", async ({ request, params }) => {
	const countryAccountsId = await getCountryAccountsIdFromSession(request);
	if (!countryAccountsId) {
		throw new Response("Unauthorized", { status: 401 });
	}

	const lang = typeof params.lang === "string" && params.lang ? params.lang : "en";
	const hazardousEventOptions = await queryHazardousEventOptions(
		countryAccountsId,
		lang,
		[],
	);

	return {
		hazardousEventOptions,
	};
});

export const action = authActionWithPerm("EditData", async ({ request, params }) => {
	const countryAccountsId = await getCountryAccountsIdFromSession(request);
	if (!countryAccountsId) {
		throw new Response("Unauthorized", { status: 401 });
	}

	const lang = typeof params.lang === "string" && params.lang ? params.lang : "en";
	const formData = await request.formData();
	const keyword = String(formData.get("keyword") ?? "").trim();
	const blockedHazardousIdsRaw = String(
		formData.get("blockedHazardousIds") ?? "[]",
	);

	let blockedHazardousIds: string[] = [];
	try {
		const parsed = JSON.parse(blockedHazardousIdsRaw);
		blockedHazardousIds = Array.isArray(parsed)
			? parsed.filter((value): value is string => typeof value === "string")
			: [];
	} catch {
		blockedHazardousIds = [];
	}

	const hazardousEventOptions = await queryHazardousEventOptions(
		countryAccountsId,
		lang,
		blockedHazardousIds,
		keyword,
	);

	return {
		hazardousEventOptions,
		keyword,
	};
});

export default function LinkedTriggeringHazardousEventsModalRoute() {
	const ld = useLoaderData<typeof loader>();
	const fetcher = useFetcher<typeof action>();
	const navigate = useNavigate();
	const {
		triggeringHazardousEventTarget,
		setTriggeringHazardousEventTarget,
		triggeredHazardousEventTarget,
	} = useOutletContext<DisasterEventFormOutletContext>();

	const [searchTerm, setSearchTerm] = useState("");
	const [pendingExitAction, setPendingExitAction] = useState<
		"close" | "cancel" | "apply" | null
	>(null);
	const [draftTarget, setDraftTarget] = useState<LinkedEventItem[]>(
		Array.isArray(triggeringHazardousEventTarget)
			? triggeringHazardousEventTarget.filter(
				(item) =>
					!triggeredHazardousEventTarget.some((other) => other.id === item.id),
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

			fetcher.submit(
				{
					keyword,
					blockedHazardousIds: JSON.stringify(
						triggeredHazardousEventTarget
							.map((item) => item.id)
							.concat(draftTarget.map((item) => item.id)),
					),
				},
				{ method: "post" },
			);
		}, 300);

		return () => {
			window.clearTimeout(timeoutId);
		};
	}, [
		draftTarget,
		fetcher,
		searchTerm,
		triggeredHazardousEventTarget,
	]);

	const sourceOptions = useMemo(() => {
		if (searchTerm.trim().length < 3) {
			return ld.hazardousEventOptions;
		}

		return fetcher.data?.hazardousEventOptions ?? [];
	}, [fetcher.data?.hazardousEventOptions, ld.hazardousEventOptions, searchTerm]);

	const availableEvents = useMemo(() => {
		const selectedIds = new Set(draftTarget.map((item) => item.id));
		const blockedIds = new Set(
			triggeredHazardousEventTarget.map((item) => item.id),
		);
		return sourceOptions.filter(
			(item) => !selectedIds.has(item.id) && !blockedIds.has(item.id),
		);
	}, [draftTarget, sourceOptions, triggeredHazardousEventTarget]);

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

		const blockedIds = new Set(
			triggeredHazardousEventTarget.map((item) => item.id),
		);
		const toAdd = availableEvents.filter(
			(item) =>
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
		setTriggeringHazardousEventTarget(
			draftTarget.filter(
				(item) =>
					!triggeredHazardousEventTarget.some((other) => other.id === item.id),
			),
		);
		navigate("..", { replace: true });
	};

	const renderAvailableItem = (item: LinkedEventItem) => (
		<div className="mb-2 flex items-start rounded-lg border border-slate-200 px-4 py-3 last:mb-0">
			<div className="flex w-full items-start gap-3">
				<Checkbox
					inputId={`linked-triggering-hazardous-available-${item.id}`}
					checked={selectedAvailableIds.includes(item.id)}
					onChange={(event) =>
						toggleAvailable(item.id, Boolean(event.checked))
					}
				/>
				<div>
					<p className="text-[14px] font-semibold text-slate-700">{item.name}</p>
					<p>UUID: {item.code.substring(0, 8)}</p>
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
					inputId={`linked-triggering-hazardous-selected-${item.id}`}
					checked={selectedLinkedIds.includes(item.id)}
					onChange={(event) => toggleLinked(item.id, Boolean(event.checked))}
				/>
				<div>
					<p className="text-[14px] font-semibold text-slate-700">{item.name}</p>
					<p>UUID: {item.code.substring(0, 8)}</p>
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
						Manage linked triggering (causal) hazardous events
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
					Search and select hazardous events that causally triggered this
					disaster event.
				</p>

				<div className="mb-4 relative">
					<i className="pi pi-search pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
					<InputText
						value={searchTerm}
						onChange={(event) => setSearchTerm(event.target.value)}
						placeholder="Search by HIP name or UUID..."
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
								Selected triggering events
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
								emptyMessage="No triggering events linked"
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
							? "Closing linked triggering hazardous events dialog"
							: ""}
					</span>
				</div>
			</div>
		</div>
	);
}
