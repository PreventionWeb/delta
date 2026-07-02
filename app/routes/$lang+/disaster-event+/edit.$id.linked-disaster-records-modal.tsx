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
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { dr } from "~/db.server";
import { disasterRecordsTable } from "~/drizzle/schema/disasterRecordsTable";
import type { DisasterEventFormOutletContext } from "~/frontend/disaster-event/DisasterEventForm";
import { authActionWithPerm, authLoaderWithPerm } from "~/utils/auth";
import { getCountryAccountsIdFromSession } from "~/utils/session";

type LoaderLinkedRecordItem = {
	id: string;
	name: string;
	code: string;
	hip: string;
};

function localizedHipName(
	name: Record<string, string> | null | undefined,
	lang: string,
) {
	if (!name) {
		return "";
	}

	return String(name[lang] || name.en || Object.values(name)[0] || "").trim();
}

function formatDisasterRecordOption(
	record: {
		id: string;
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
): LoaderLinkedRecordItem {
	const hazardName = localizedHipName(record.hipHazard?.name, lang);
	const clusterName = localizedHipName(record.hipCluster?.name, lang);
	const typeName = localizedHipName(record.hipType?.name, lang);
	let hipLabel = "";
	if (hazardName) {
		hipLabel = record.hipHazard?.code
			? `H: ${hazardName} (${record.hipHazard.code})`
			: `H: ${hazardName}`;
	} else if (clusterName) {
		hipLabel = `C: ${clusterName}`;
	} else if (typeName) {
		hipLabel = `T: ${typeName}`;
	}

	return {
		id: record.id,
		name: `UUID: ${record.id.slice(0, 8)}`,
		code: record.id,
		hip: hipLabel,
	};
}

async function queryDisasterRecordOptions(
	countryAccountsId: string,
	lang: string,
	keyword?: string,
) {
	const normalizedKeyword = keyword?.trim();
	const shouldSearch = Boolean(normalizedKeyword);
	const searchTerm = normalizedKeyword ? `%${normalizedKeyword}%` : "";

	const disasterRecords = await dr.query.disasterRecordsTable.findMany({
		columns: {
			id: true,
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
				eq(disasterRecordsTable.countryAccountsId, countryAccountsId),
				or(
					ilike(disasterRecordsTable.locationDesc, searchTerm),
					ilike(disasterRecordsTable.startDate, searchTerm),
					ilike(disasterRecordsTable.endDate, searchTerm),
					ilike(disasterRecordsTable.localWarnInst, searchTerm),
					ilike(disasterRecordsTable.primaryDataSource, searchTerm),
					ilike(disasterRecordsTable.otherDataSource, searchTerm),
					ilike(disasterRecordsTable.assessmentModes, searchTerm),
					ilike(disasterRecordsTable.originatorRecorderInst, searchTerm),
					ilike(disasterRecordsTable.validatedBy, searchTerm),
					ilike(disasterRecordsTable.checkedBy, searchTerm),
					ilike(disasterRecordsTable.dataCollector, searchTerm),
					sql`cast(${disasterRecordsTable.id} as text) ilike ${searchTerm}`,
					sql`cast(${disasterRecordsTable.disasterEventId} as text) ilike ${searchTerm}`,
					sql`cast(${disasterRecordsTable.approvalStatus} as text) ilike ${searchTerm}`,
				),
			)
			: eq(disasterRecordsTable.countryAccountsId, countryAccountsId),
		orderBy: [desc(disasterRecordsTable.updatedAt)],
		limit: shouldSearch ? 500 : 200,
	});

	return disasterRecords.map((record) => formatDisasterRecordOption(record, lang));
}

export const loader = authLoaderWithPerm("EditData", async ({ request, params }) => {
	const countryAccountsId = await getCountryAccountsIdFromSession(request);
	if (!countryAccountsId) {
		throw new Response("Unauthorized", { status: 401 });
	}

	const lang = typeof params.lang === "string" && params.lang ? params.lang : "en";
	const disasterRecordOptions = await queryDisasterRecordOptions(
		countryAccountsId,
		lang,
	);

	return {
		disasterRecordOptions,
	};
});

export const action = authActionWithPerm("EditData", async ({ request, params }) => {
	const countryAccountsId = await getCountryAccountsIdFromSession(request);
	if (!countryAccountsId) {
		throw new Response("Unauthorized", { status: 401 });
	}

	const formData = await request.formData();
	const keyword = String(formData.get("keyword") ?? "").trim();
	const lang = typeof params.lang === "string" && params.lang ? params.lang : "en";
	const disasterRecordOptions = await queryDisasterRecordOptions(
		countryAccountsId,
		lang,
		keyword,
	);

	return {
		disasterRecordOptions,
		keyword,
	};
});

type LinkedRecordItem =
	DisasterEventFormOutletContext["disasterRecordOptions"][number];

export default function LinkedDisasterRecordsModalRoute() {
	const ld = useLoaderData<typeof loader>();
	const fetcher = useFetcher<typeof action>();
	const navigate = useNavigate();
	const {
		linkedDisasterRecordTarget,
		setLinkedDisasterRecordTarget,
	} = useOutletContext<DisasterEventFormOutletContext>();

	const [searchTerm, setSearchTerm] = useState("");
	const [pendingExitAction, setPendingExitAction] = useState<
		"close" | "cancel" | "apply" | null
	>(null);
	const [draftTarget, setDraftTarget] = useState<LinkedRecordItem[]>(
		Array.isArray(linkedDisasterRecordTarget)
			? linkedDisasterRecordTarget
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
			return ld.disasterRecordOptions;
		}

		return fetcher.data?.disasterRecordOptions ?? [];
	}, [fetcher.data?.disasterRecordOptions, ld.disasterRecordOptions, searchTerm]);

	const availableRecords = useMemo(() => {
		const selectedIds = new Set(draftTarget.map((item) => item.id));

		return sourceOptions.filter((item) => {
			if (selectedIds.has(item.id)) {
				return false;
			}
			return true;
		});
	}, [draftTarget, sourceOptions]);

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

		const toAdd = availableRecords.filter((item) =>
			selectedAvailableIds.includes(item.id),
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
		setLinkedDisasterRecordTarget(draftTarget);
		navigate("..", { replace: true });
	};

	const renderAvailableItem = (item: LinkedRecordItem) => (
		<div className="mb-2 flex items-start rounded-lg border border-slate-200 px-4 py-3 last:mb-0">
			<div className="flex w-full items-start gap-3">
				<Checkbox
					inputId={`linked-record-available-${item.id}`}
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

	const renderLinkedItem = (item: LinkedRecordItem) => (
		<div className="mb-2 flex items-start rounded-lg border border-slate-200 px-4 py-3 last:mb-0">
			<div className="flex w-full items-start gap-3">
				<Checkbox
					inputId={`linked-record-selected-${item.id}`}
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
						Manage linked disaster records
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
					Search and select disaster records to link this disaster event.
				</p>

				<div className="mb-4 relative">
					<i className="pi pi-search pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
					<InputText
						value={searchTerm}
						onChange={(event) => setSearchTerm(event.target.value)}
						placeholder="Search by UUID..."
						className="w-full pr-10"
					/>
				</div>

				<div className="grid gap-4 md:grid-cols-2">
					<div className="rounded-xl border border-slate-200 bg-white p-4">
						<div className="mb-3 flex items-center justify-between gap-2">
							<h4 className="text-[14px] font-semibold text-slate-800">
								{searchTerm.trim().length >= 3
									? "Search results"
									: "Latest 200 records"}
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
								value={availableRecords}
								itemTemplate={renderAvailableItem}
								emptyMessage="No records available"
							/>
						</div>
					</div>

					<div className="rounded-xl border border-slate-200 bg-white p-4">
						<div className="mb-3 flex items-center justify-between gap-2">
							<h4 className="text-[14px] font-semibold text-slate-800">
								Selected linked records
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
								emptyMessage="No linked records"
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
							? "Closing linked disaster records dialog"
							: ""}
					</span>
				</div>
			</div>
		</div>
	);
}
