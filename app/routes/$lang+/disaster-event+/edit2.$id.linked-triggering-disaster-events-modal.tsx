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
import { and, desc, eq, ilike, inArray, ne, or, sql } from "drizzle-orm";
import { dr } from "~/db.server";
import { disasterEventTable } from "~/drizzle/schema/disasterEventTable";
import { eventCausalityTable } from "~/drizzle/schema/eventCausalityTable";
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
		currentItemId: string | undefined,
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
					currentItemId
						? ne(disasterEventTable.id, currentItemId)
						: undefined,
					or(
						ilike(disasterEventTable.nameNational, searchTerm),
						ilike(disasterEventTable.nameGlobalOrRegional, searchTerm),
						ilike(disasterEventTable.nationalDisasterId, searchTerm),
						ilike(disasterEventTable.glide, searchTerm),
						sql`cast(${disasterEventTable.id} as text) ilike ${searchTerm}`,
						sql`cast(${disasterEventTable.startDate} as text) ilike ${searchTerm}`,
						sql`cast(${disasterEventTable.endDate} as text) ilike ${searchTerm}`,
						sql`cast(${disasterEventTable.approvalStatus} as text) ilike ${searchTerm}`,
					),
				)
				: and(
					eq(disasterEventTable.countryAccountsId, countryAccountsId),
					currentItemId
						? ne(disasterEventTable.id, currentItemId)
						: undefined,
				),
			orderBy: [desc(disasterEventTable.updatedAt)],
			limit: shouldSearch ? 500 : 200,
		});

		return disasterEvents.map((event) => formatDisasterEventOption(event, lang));
	}

	async function queryDescendantDisasterEventIds(
		countryAccountsId: string,
		rootIds: string[],
	) {
		const normalizedRoots = Array.from(
			new Set(rootIds.map((id) => id.trim()).filter(Boolean)),
		);

		if (normalizedRoots.length === 0) {
			return [];
		}

		const visited = new Set<string>();
		let frontier = normalizedRoots;

		while (frontier.length > 0) {
			const rows = await dr
				.select({
					id: eventCausalityTable.triggeredDisasterEventId,
				})
				.from(eventCausalityTable)
				.innerJoin(
					disasterEventTable,
					eq(disasterEventTable.id, eventCausalityTable.triggeredDisasterEventId),
				)
				.where(
					and(
						eq(eventCausalityTable.triggeringEntityType, "DE"),
						eq(eventCausalityTable.triggeredEntityType, "DE"),
						inArray(eventCausalityTable.triggeringDisasterEventId, frontier),
						eq(disasterEventTable.countryAccountsId, countryAccountsId),
					),
				);

			const nextFrontier: string[] = [];
			for (const row of rows) {
				if (!row.id || visited.has(row.id)) {
					continue;
				}

				visited.add(row.id);
				nextFrontier.push(row.id);
			}

			frontier = nextFrontier;
		}

		return Array.from(visited);
	}

	export const loader = authLoaderWithPerm("EditData", async ({ request, params }) => {
		const countryAccountsId = await getCountryAccountsIdFromSession(request);
		if (!countryAccountsId) {
			throw new Response("Unauthorized", { status: 401 });
		}

		const rawItemId = String(params.id ?? "").trim();
		const currentItemId = rawItemId && rawItemId !== "new" ? rawItemId : undefined;
		const lang = typeof params.lang === "string" && params.lang ? params.lang : "en";

		const disasterEventOptions = await queryDisasterEventOptions(
			countryAccountsId,
			currentItemId,
			lang,
		);
		const descendantDisasterEventIds = currentItemId
			? await queryDescendantDisasterEventIds(countryAccountsId, [currentItemId])
			: [];

		return {
			disasterEventOptions,
			descendantDisasterEventIds,
		};
	});

	export const action = authActionWithPerm("EditData", async ({ request, params }) => {
		const countryAccountsId = await getCountryAccountsIdFromSession(request);
		if (!countryAccountsId) {
			throw new Response("Unauthorized", { status: 401 });
		}

		const rawItemId = String(params.id ?? "").trim();
		const currentItemId = rawItemId && rawItemId !== "new" ? rawItemId : undefined;
		const lang = typeof params.lang === "string" && params.lang ? params.lang : "en";

		const formData = await request.formData();
		const keyword = String(formData.get("keyword") ?? "").trim();
		const disasterEventOptions = await queryDisasterEventOptions(
			countryAccountsId,
			currentItemId,
			lang,
			keyword,
		);
		const descendantDisasterEventIds = currentItemId
			? await queryDescendantDisasterEventIds(countryAccountsId, [currentItemId])
			: [];

		return {
			disasterEventOptions,
			descendantDisasterEventIds,
			keyword,
		};
	});

	export default function LinkedTriggeringDisasterEventsModalRoute() {
		const ld = useLoaderData<typeof loader>();
		const fetcher = useFetcher<typeof action>();
		const navigate = useNavigate();
		const {
			triggeringDisasterEventTarget,
			setTriggeringDisasterEventTarget,
			triggeredDisasterEventTarget,
		} = useOutletContext<DisasterEventFormOutletContext>();

		const [searchTerm, setSearchTerm] = useState("");
		const [pendingExitAction, setPendingExitAction] = useState<
			"close" | "cancel" | "apply" | null
		>(null);
		const [draftTarget, setDraftTarget] = useState<LinkedEventItem[]>(
			Array.isArray(triggeringDisasterEventTarget)
				? triggeringDisasterEventTarget.filter(
					(item) => !triggeredDisasterEventTarget.some((other) => other.id === item.id),
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

		const descendantIds = useMemo(() => {
			if (searchTerm.trim().length < 3) {
				return new Set(ld.descendantDisasterEventIds ?? []);
			}

			return new Set(
				fetcher.data?.descendantDisasterEventIds ??
					ld.descendantDisasterEventIds ??
					[],
			);
		}, [
			fetcher.data?.descendantDisasterEventIds,
			ld.descendantDisasterEventIds,
			searchTerm,
		]);

		const blockedParentIds = useMemo(() => {
			const blockedIds = new Set(triggeredDisasterEventTarget.map((item) => item.id));
			for (const descendantId of descendantIds) {
				blockedIds.add(descendantId);
			}

			return blockedIds;
		}, [descendantIds, triggeredDisasterEventTarget]);

		const availableEvents = useMemo(() => {
			const selectedIds = new Set(draftTarget.map((item) => item.id));
			return sourceOptions.filter(
				(item) => !selectedIds.has(item.id) && !blockedParentIds.has(item.id),
			);
		}, [blockedParentIds, draftTarget, sourceOptions]);

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

			const toAdd = availableEvents.filter((item) =>
				selectedAvailableIds.includes(item.id) && !blockedParentIds.has(item.id),
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
			setTriggeringDisasterEventTarget(
				draftTarget.filter(
					(item) => !blockedParentIds.has(item.id),
				),
			);
			navigate("..", { replace: true });
		};

		const renderAvailableItem = (item: LinkedEventItem) => (
			<div className="mb-2 flex items-start rounded-lg border border-slate-200 px-4 py-3 last:mb-0">
				<div className="flex w-full items-start gap-3">
					<Checkbox
						inputId={`linked-triggering-available-${item.id}`}
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
						inputId={`linked-triggering-selected-${item.id}`}
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
							Manage linked triggering (causal) disaster events
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
						Search and select disaster events that causally triggered this event.
					</p>

					<div className="mb-4 relative">
						<i className="pi pi-search pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
						<InputText
							value={searchTerm}
							onChange={(event) => setSearchTerm(event.target.value)}
							placeholder="Search by name or UUID..."
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
								? "Closing linked triggering disaster events dialog"
								: ""}
						</span>
					</div>
				</div>
			</div>
		);
	}
