import { useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router";
import { InputText } from "primereact/inputtext";
import { Button } from "primereact/button";
import { Checkbox } from "primereact/checkbox";
import { DataView } from "primereact/dataview";
import type { DisasterEventFormOutletContext } from "~/frontend/disaster-event/DisasterEventForm";

type LinkedRecordItem =
	DisasterEventFormOutletContext["disasterRecordOptions"][number];

export default function LinkedDisasterRecordsModalRoute() {
	const navigate = useNavigate();
	const {
		disasterRecordOptions,
		linkedDisasterRecordTarget,
		setLinkedDisasterRecordTarget,
	} = useOutletContext<DisasterEventFormOutletContext>();

	const [searchTerm, setSearchTerm] = useState("");
	const [draftTarget, setDraftTarget] = useState<LinkedRecordItem[]>(
		Array.isArray(linkedDisasterRecordTarget)
			? linkedDisasterRecordTarget
			: [],
	);
	const [selectedAvailableIds, setSelectedAvailableIds] = useState<string[]>([]);
	const [selectedLinkedIds, setSelectedLinkedIds] = useState<string[]>([]);

	const availableRecords = useMemo(() => {
		const selectedIds = new Set(draftTarget.map((item) => item.id));
		const normalizedQuery = searchTerm.trim().toLowerCase();

		return disasterRecordOptions.filter((item) => {
			if (selectedIds.has(item.id)) {
				return false;
			}
			if (!normalizedQuery) {
				return true;
			}
			return (
				item.name.toLowerCase().includes(normalizedQuery) ||
				item.code.toLowerCase().includes(normalizedQuery)
			);
		});
	}, [disasterRecordOptions, draftTarget, searchTerm]);

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

	const handleApply = () => {
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
					<p className="mt-1 text-[12px] text-slate-500">{item.code}</p>
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
					<p className="mt-1 text-[12px] text-slate-500">{item.code}</p>
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
			<div className="w-full max-w-6xl rounded-xl bg-white p-5 shadow-xl">
				<div className="mb-4 flex items-center justify-between">
					<h3 className="text-[18px] font-semibold text-slate-800">
						Manage linked disaster records
					</h3>
					<Button
						type="button"
						label="Close"
						text
						onClick={() => navigate("..", { replace: true })}
					/>
				</div>

				<p className="mb-4 text-[13px] text-slate-500">
					Search and select records to link this disaster event with relevant
					disaster records.
				</p>

				<div className="mb-4 relative">
					<i className="pi pi-search pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
					<InputText
						value={searchTerm}
						onChange={(event) => setSearchTerm(event.target.value)}
						placeholder="Search disaster records..."
						className="w-full pr-10"
					/>
				</div>

				<div className="grid gap-4 md:grid-cols-2">
					<div className="rounded-xl border border-slate-200 bg-white p-4">
						<div className="mb-3 flex items-center justify-between gap-2">
							<h4 className="text-[14px] font-semibold text-slate-800">
								Available records
							</h4>
							<Button
								type="button"
								label="Add selected"
								onClick={addSelected}
								disabled={selectedAvailableIds.length === 0}
							/>
						</div>
						<DataView
							value={availableRecords}
							itemTemplate={renderAvailableItem}
							emptyMessage="No records available"
						/>
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
						<DataView
							value={draftTarget}
							itemTemplate={renderLinkedItem}
							emptyMessage="No linked records"
						/>
					</div>
				</div>

				<div className="mt-4 flex justify-end gap-2">
					<Button
						type="button"
						label="Cancel"
						outlined
						onClick={() => navigate("..", { replace: true })}
					/>
					<Button type="button" label="Apply" onClick={handleApply} />
				</div>
			</div>
		</div>
	);
}
