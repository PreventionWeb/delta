import { useId, useState } from "react";
import type { ReactNode } from "react";
import { ListBox, ListBoxItem } from "react-aria-components";

export interface MultiSelectComboboxOption {
	id: string;
	name: string;
}

export interface MultiSelectComboboxProps {
	name: string;
	label: ReactNode;
	options: readonly MultiSelectComboboxOption[];
	selectedIds: readonly string[];
	onSelectionChange: (ids: readonly string[]) => void;
	/** Builds each chip's remove-button aria-label from its option name (Decision 12: text as props). */
	removeLabel: (name: string) => string;
	disabled?: boolean;
}

/** Hand-composed filter input + ListBox + chip row (design.md Decision 12) -- RAC's ComboBox is
 * single-selection by construction, so this isn't a ComboBox wrapper like Combobox.tsx. */
export function MultiSelectCombobox({
	name,
	label,
	options,
	selectedIds,
	onSelectionChange,
	removeLabel,
	disabled = false,
}: MultiSelectComboboxProps) {
	const inputId = useId();
	const [filterText, setFilterText] = useState("");

	const filtered =
		filterText === ""
			? []
			: options.filter(
					(o) =>
						!selectedIds.includes(o.id) &&
						o.name.toLowerCase().includes(filterText.toLowerCase()),
				);

	function selectOption(id: string) {
		if (!selectedIds.includes(id)) {
			onSelectionChange([...selectedIds, id]);
		}
		setFilterText("");
	}

	function removeOption(id: string) {
		onSelectionChange(selectedIds.filter((selectedId) => selectedId !== id));
	}

	const selectedOptions = selectedIds
		.map((id) => options.find((o) => o.id === id))
		.filter((o): o is MultiSelectComboboxOption => o !== undefined);

	return (
		// Not .dts-form-component -- its display:grid with no real grid parent here stacked
		// children into overlapping cells, intercepting clicks on rendered options.
		<div className="flex flex-col gap-[0.57rem]">
			<label htmlFor={inputId} className="dts-form-component__label">
				{label}
			</label>
			<input
				id={inputId}
				className="dts-text-input"
				disabled={disabled}
				value={filterText}
				onChange={(e) => setFilterText(e.target.value)}
			/>
			{/* Carries the real value for native form submission -- the visible input above is
			 * transient filter text, not the selection (comma-joined, this app's existing
			 * multi-id hidden-field convention). */}
			<input type="hidden" name={name} value={selectedIds.join(",")} />
			{filtered.length > 0 && (
				// Not RAC's <Popover> -- wrapping this in one breaks option filtering. Chrome
				// class applied directly to the inline ListBox instead.
				<ListBox
					aria-label={typeof label === "string" ? label : name}
					className="dts-select-popover"
				>
					{filtered.map((option) => (
						<ListBoxItem
							key={option.id}
							id={option.id}
							textValue={option.name}
							onAction={() => selectOption(option.id)}
						>
							{option.name}
						</ListBoxItem>
					))}
				</ListBox>
			)}
			<div className="dts-multiselect-chips">
				{selectedOptions.map((option) => (
					<span key={option.id} className="dts-multiselect-chip">
						{option.name}
						<button
							type="button"
							aria-label={removeLabel(option.name)}
							onClick={() => removeOption(option.id)}
						>
							×
						</button>
					</span>
				))}
			</div>
		</div>
	);
}
