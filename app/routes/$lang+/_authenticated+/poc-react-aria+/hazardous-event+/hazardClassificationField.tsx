// Stubbed inline hazard classification picker (task 3.4, design.md Decision 3's `HazardPicker`
// row) — replaces production's `HazardPicker` (app/frontend/hip/hazardpicker.tsx), which opens
// a popup window (`window.open("/hazardous-event/picker")`) and waits for a `postMessage` from
// that production route. That route is outside this isolated POC's tree, so reusing it would
// break the "isolated route tree" claim (design.md Decision 1). This is a plain cascading
// type -> cluster -> hazard selector built from three React Aria `Select`s bound to the `hip`
// loader fixture (design.md Decision 8), with no popup/postMessage handshake and no search box
// (production's filter-by-name input is not reproduced — out of scope for the stub).
//
// Labels/required-ness for hipHazardId/hipClusterId/hipTypeId/parent have no usable value in
// `fieldsDef(ctx)` (`hipHazardId`'s def is `{ label: "Hazard test" }`; the other three are
// `{ label: "" }` — all four are overridden at render time in production, never rendered from
// fieldsDef directly). This component therefore sources its labels/required flag from the same
// i18n codes production's own override (`hazardeventform.tsx`) and `hazardpicker.tsx` use
// (`hip.hazard_classification`, `hip.hazard_type`, `hip.hazard_cluster`, `hip.specific_hazard`),
// not from fieldsDef — consistent with task 3.2's rule (real labels, not invented ones), just
// sourced from a different real place for these specific keys.
import {
	Button,
	Label,
	ListBox,
	ListBoxItem,
	Popover,
	Select,
	SelectValue,
} from "react-aria-components";
import type { Key } from "react-aria-components";

import { ViewContext } from "~/frontend/context";
import type { HipDataForHazardPicker } from "~/backend.server/models/hip_hazard_picker";

function sortByName<T extends { name: string }>(items: T[]): T[] {
	return [...items].sort((a, b) => a.name.localeCompare(b.name));
}

const triggerClass =
	"flex items-center justify-between gap-2 rounded border border-gray-300 bg-white px-2 py-1 text-left data-[focus-visible]:outline data-[focus-visible]:outline-2 data-[focus-visible]:outline-[#106cb8] data-[disabled]:opacity-50";
const popoverClass =
	"w-[var(--trigger-width)] rounded border border-gray-300 bg-white shadow-lg";
const listBoxClass = "max-h-60 overflow-auto p-1";
const itemClass =
	"cursor-pointer rounded px-2 py-1 text-sm data-[focused]:bg-[#e6e6e6] data-[selected]:font-medium data-[selected]:bg-[#e6e6e6]";

interface HazardClassification {
	hipTypeId?: string;
	hipClusterId?: string;
	hipHazardId?: string;
}

export function HazardClassificationField({
	ctx,
	hip,
	required,
	typeId,
	clusterId,
	hazardId,
	onChange,
}: {
	ctx: ViewContext;
	hip: HipDataForHazardPicker;
	required?: boolean;
	typeId?: string;
	clusterId?: string;
	hazardId?: string;
	onChange: (next: HazardClassification) => void;
}) {
	const types = sortByName(hip.types);
	const clusters = sortByName(hip.clusters);
	const hazards = sortByName(hip.hazards);

	// Cascade-filter down the hierarchy (design.md Decision 8's parent-id linkage requirement),
	// mirroring hazardpicker.tsx's own filtering logic without its search-term branch.
	const visibleClusters = typeId
		? clusters.filter((c) => c.typeId === typeId)
		: clusters;
	const visibleHazards = clusterId
		? hazards.filter((h) => h.clusterId === clusterId)
		: typeId
			? hazards.filter((h) => visibleClusters.some((c) => c.id === h.clusterId))
			: hazards;

	const handleTypeChange = (key: Key | null) => {
		const nextTypeId = key ? String(key) : undefined;
		onChange({
			hipTypeId: nextTypeId,
			hipClusterId: undefined,
			hipHazardId: undefined,
		});
	};

	const handleClusterChange = (key: Key | null) => {
		const nextClusterId = key ? String(key) : undefined;
		const matchedCluster = clusters.find((c) => c.id === nextClusterId);
		onChange({
			hipClusterId: nextClusterId,
			hipTypeId: matchedCluster?.typeId ?? typeId,
			hipHazardId: undefined,
		});
	};

	const handleHazardChange = (key: Key | null) => {
		const nextHazardId = key ? String(key) : undefined;
		const matchedHazard = hazards.find((h) => h.id === nextHazardId);
		const matchedCluster = clusters.find(
			(c) => c.id === matchedHazard?.clusterId,
		);
		onChange({
			hipHazardId: nextHazardId,
			hipClusterId: matchedHazard?.clusterId ?? clusterId,
			hipTypeId: matchedCluster?.typeId ?? typeId,
		});
	};

	return (
		<div className="flex flex-col gap-1 text-sm">
			<span className="font-medium text-[#333333]">
				{ctx.t({
					code: "hip.hazard_classification",
					desc: "Label for hazard classification field",
					msg: "Hazard classification",
				})}
				{required ? " *" : ""}
			</span>
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
				<Select
					aria-label={ctx.t({ code: "hip.hazard_type", msg: "Hazard type" })}
					selectedKey={typeId ?? null}
					onSelectionChange={handleTypeChange}
					placeholder={ctx.t({ code: "hip.select_type", msg: "Select type" })}
					className="flex flex-col gap-1"
				>
					<Label className="text-xs text-gray-600">
						{ctx.t({ code: "hip.hazard_type", msg: "Hazard type" })}
					</Label>
					<Button className={triggerClass}>
						<SelectValue />
						<span aria-hidden="true">▾</span>
					</Button>
					<Popover className={popoverClass}>
						<ListBox className={listBoxClass}>
							{types.map((t) => (
								<ListBoxItem key={t.id} id={t.id} className={itemClass}>
									{t.name}
								</ListBoxItem>
							))}
						</ListBox>
					</Popover>
				</Select>

				<Select
					aria-label={ctx.t({
						code: "hip.hazard_cluster",
						msg: "Hazard cluster",
					})}
					selectedKey={clusterId ?? null}
					onSelectionChange={handleClusterChange}
					isDisabled={!visibleClusters.length}
					placeholder={ctx.t({
						code: "hip.select_cluster",
						msg: "Select cluster",
					})}
					className="flex flex-col gap-1"
				>
					<Label className="text-xs text-gray-600">
						{ctx.t({ code: "hip.hazard_cluster", msg: "Hazard cluster" })}
					</Label>
					<Button className={triggerClass}>
						<SelectValue />
						<span aria-hidden="true">▾</span>
					</Button>
					<Popover className={popoverClass}>
						<ListBox className={listBoxClass}>
							{visibleClusters.map((c) => (
								<ListBoxItem key={c.id} id={c.id} className={itemClass}>
									{c.name}
								</ListBoxItem>
							))}
						</ListBox>
					</Popover>
				</Select>

				<Select
					aria-label={ctx.t({
						code: "hip.specific_hazard",
						msg: "Specific hazard",
					})}
					selectedKey={hazardId ?? null}
					onSelectionChange={handleHazardChange}
					isDisabled={!visibleHazards.length}
					placeholder={ctx.t({
						code: "hip.select_hazard",
						msg: "Select hazard",
					})}
					className="flex flex-col gap-1"
				>
					<Label className="text-xs text-gray-600">
						{ctx.t({ code: "hip.specific_hazard", msg: "Specific hazard" })}
					</Label>
					<Button className={triggerClass}>
						<SelectValue />
						<span aria-hidden="true">▾</span>
					</Button>
					<Popover className={popoverClass}>
						<ListBox className={listBoxClass}>
							{visibleHazards.map((h) => (
								<ListBoxItem key={h.id} id={h.id} className={itemClass}>
									{h.name}
								</ListBoxItem>
							))}
						</ListBox>
					</Popover>
				</Select>
			</div>
		</div>
	);
}

/** Production's `parent` (caused-by) field is set via `?parent=<id>` in the URL plus a real
 *  `hazardousEventById` DB lookup to render the parent's label/link (hazardeventform.tsx's
 *  `parent` override). design.md Decision 8 forbids a live DB read here, and there's no fixture
 *  keyed by arbitrary parent ids to look up against — so this POC renders the raw id read-only
 *  when `?parent=` is present, with no lookup and no re-pick affordance (the popup picker this
 *  would otherwise reuse is the same production-route dependency being stubbed out above). This
 *  is a deliberate simplification of the field's real behavior, not a fixture — flagged for the
 *  task 4.3 recommendation. */
export function CausedByField({
	ctx,
	parentId,
	onClear,
}: {
	ctx: ViewContext;
	parentId?: string;
	onClear: () => void;
}) {
	return (
		<div className="flex flex-col gap-1 text-sm">
			<span className="font-medium text-[#333333]">
				{ctx.t({
					code: "event.parent",
					desc: "Label for parent event field",
					msg: "Parent",
				})}
			</span>
			{parentId ? (
				<div className="flex items-center gap-2">
					<span className="rounded bg-gray-100 px-2 py-1 font-mono text-xs">
						{parentId}
					</span>
					<Button
						onPress={onClear}
						className="rounded border border-gray-300 px-2 py-1 text-xs font-medium data-[hovered]:bg-[#e6e6e6] data-[focus-visible]:shadow-[0_0_0_2px_#106cb8] data-[focus-visible]:outline-none"
					>
						{ctx.t({
							code: "common.unset",
							desc: "Label for unset or clear value action",
							msg: "Unset",
						})}
					</Button>
				</div>
			) : (
				<span className="text-gray-500">
					{ctx.t({
						code: "poc.hazardous_event.parent_none",
						desc: "Shown for the caused-by field when no ?parent= query param is present. This POC does not implement a picker for choosing a parent event after the fact — only reads one from the URL.",
						msg: "None — pass ?parent=<id> in the URL to see this field populated; this POC does not implement a way to choose a parent event from the page itself",
					})}
				</span>
			)}
		</div>
	);
}
