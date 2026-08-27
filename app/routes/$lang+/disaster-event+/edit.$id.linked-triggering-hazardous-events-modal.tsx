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
import { queryLinkedHazardousEventOptions } from "~/backend.server/services/disaster-event/linkedHazardousEventOptions";
import LinkedHazardousEventCard from "~/frontend/disaster-event/LinkedHazardousEventCard";
import type { DisasterEventFormOutletContext } from "~/frontend/disaster-event/DisasterEventForm";
import { authActionWithPerm, authLoaderWithPerm } from "~/utils/auth";
import { getCountryAccountsIdFromSession } from "~/utils/session";

type LinkedEventItem =
	DisasterEventFormOutletContext["hazardousEventOptions"][number] & {
		dateLabel?: string;
		divisionNamesLabel?: string;
	};

export const loader = authLoaderWithPerm("EditData", async ({ request, params }) => {
	const countryAccountsId = await getCountryAccountsIdFromSession(request);
	if (!countryAccountsId) {
		throw new Response("Unauthorized", { status: 401 });
	}

	const lang = typeof params.lang === "string" && params.lang ? params.lang : "en";
	const hazardousEventOptions = await queryLinkedHazardousEventOptions(
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

	const hazardousEventOptions = await queryLinkedHazardousEventOptions(
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
		<div className="mb-2 last:mb-0">
			<LinkedHazardousEventCard
				item={item}
				className="w-full"
				leading={
					<Checkbox
						inputId={`linked-triggering-hazardous-available-${item.id}`}
						checked={selectedAvailableIds.includes(item.id)}
						onChange={(event) =>
							toggleAvailable(item.id, Boolean(event.checked))
						}
					/>
				}
			/>
		</div>
	);

	const renderLinkedItem = (item: LinkedEventItem) => (
		<div className="mb-2 last:mb-0">
			<LinkedHazardousEventCard
				item={item}
				className="w-full"
				leading={
					<Checkbox
						inputId={`linked-triggering-hazardous-selected-${item.id}`}
						checked={selectedLinkedIds.includes(item.id)}
						onChange={(event) => toggleLinked(item.id, Boolean(event.checked))}
					/>
				}
			/>
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
						placeholder="Search by Hazard classification, date (yyyy-mm-dd), geographic level or UUID..."
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
							? "Closing dialog"
							: ""}
					</span>
				</div>
			</div>
		</div>
	);
}
