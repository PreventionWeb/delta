import { useMemo, useRef, useState } from "react";
import type { Key, ReactNode } from "react";
import {
	ComboBox,
	Input,
	Label,
	ListBox,
	ListBoxItem,
	Popover,
} from "react-aria-components";

export interface ComboboxOption {
	id: string;
	name: string;
	code?: string;
}

export interface ComboboxProps {
	name: string;
	label: ReactNode;
	placeholder?: string;
	options: ComboboxOption[];
	defaultSelectedKey?: string;
	onSelectionChange?: (key: string | null) => void;
}

const MAX_DISPLAYED_OPTIONS = 20;

// No native equivalent (Decision 9); filters a fully preloaded array client-side, not server
// search (Decision 1), matching legacy's filteredHazards (Decision 10).
export function Combobox({
	name,
	label,
	placeholder,
	options,
	defaultSelectedKey,
	onSelectionChange,
}: ComboboxProps) {
	const defaultOption = options.find((o) => o.id === defaultSelectedKey);
	const [inputValue, setInputValue] = useState(defaultOption?.name ?? "");
	const inputRef = useRef<HTMLInputElement>(null);

	const filtered = useMemo(() => {
		if (!inputValue) return [];
		const needle = inputValue.toLowerCase();
		return options
			.filter(
				(o) =>
					o.name.toLowerCase().includes(needle) ||
					o.code?.toLowerCase().includes(needle),
			)
			.slice(0, MAX_DISPLAYED_OPTIONS);
	}, [inputValue, options]);

	function handleSelectionChange(key: Key | null) {
		onSelectionChange?.(key === null ? null : String(key));
	}

	// First keystroke into an empty field never opens the menu -- RAC's menuTrigger="input" check
	// runs against the still-stale empty collection (Gate 9 finding). A synthetic ArrowDown opens
	// it via RAC's keyboard path instead, which isn't affected.
	function handleInputChange(value: string) {
		const wasEmpty = inputValue === "";
		setInputValue(value);
		if (wasEmpty && value !== "") {
			requestAnimationFrame(() => {
				inputRef.current?.dispatchEvent(
					new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
				);
			});
		}
	}

	return (
		<ComboBox
			name={name}
			formValue="key"
			items={filtered}
			inputValue={inputValue}
			menuTrigger="input"
			defaultValue={defaultSelectedKey}
			onInputChange={handleInputChange}
			onChange={handleSelectionChange}
		>
			<Label className="dts-form-component__label">{label}</Label>
			<Input
				ref={inputRef}
				className="dts-text-input"
				placeholder={placeholder}
			/>
			<Popover className="dts-select-popover">
				<ListBox>
					{(item: ComboboxOption) => (
						<ListBoxItem id={item.id} textValue={item.name}>
							{item.name}
						</ListBoxItem>
					)}
				</ListBox>
			</Popover>
		</ComboBox>
	);
}
