import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "~/design-system/components/Link";
import { useViewContext } from "~/frontend/context";
import { HazardousEventFormField } from "./HazardousEventFormField";

export interface HazardousEventParentFieldProps {
	initialParent: { id: string; displayName: string } | null;
	errors?: readonly string[];
}

/** Wires to the picker route (Decision 13) -- popup-window + postMessage + close-on-select,
 * listening for the `{ selected }` shape HazardousEventPickerPage.tsx's selectParentEvent() posts. */
export function HazardousEventParentField({
	initialParent,
	errors,
}: HazardousEventParentFieldProps) {
	const { t } = useTranslation("hazardous-events");
	const ctx = useViewContext();
	const [selected, setSelected] = useState(initialParent);
	const [causeIdChanged, setCauseIdChanged] = useState(false);

	useEffect(() => {
		function handleMessage(event: MessageEvent) {
			// Matches the picker's own postMessage target origin (code review finding) -- the
			// sender already scopes to window.location.origin, the listener didn't check it back.
			if (event.origin !== window.location.origin) {
				return;
			}
			const data = event.data as {
				selected?: { id: string; specificHazardName: string | null };
			};
			if (data?.selected) {
				setSelected({
					id: data.selected.id,
					displayName: data.selected.specificHazardName ?? "",
				});
				setCauseIdChanged(true);
			}
		}
		window.addEventListener("message", handleMessage);
		return () => window.removeEventListener("message", handleMessage);
	}, []);

	return (
		<HazardousEventFormField
			label={t("form.fields.parent")}
			htmlFor="causeId"
			errors={errors}
		>
			<div className="flex items-center gap-2">
				{selected ? (
					<Link href={ctx.url(`/he-preview/${selected.id}`)}>
						{selected.displayName}
					</Link>
				) : (
					<span>-</span>
				)}
				<button
					type="button"
					className="mg-button mg-button-outline"
					onClick={() => window.open(ctx.url("/he-preview/picker"), "_blank")}
				>
					{t("form.actions.change")}
				</button>
				<button
					type="button"
					className="mg-button mg-button-outline"
					onClick={() => {
						setSelected(null);
						setCauseIdChanged(true);
					}}
				>
					{t("form.actions.unset")}
				</button>
			</div>
			<input
				type="hidden"
				id="causeId"
				name="causeId"
				value={selected?.id ?? ""}
			/>
			<input
				type="hidden"
				name="causeIdChanged"
				value={causeIdChanged ? "1" : "0"}
			/>
		</HazardousEventFormField>
	);
}
