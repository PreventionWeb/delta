import {
	Select as AriaSelect,
	SelectValue,
	Button,
	Popover,
	ListBox,
	ListBoxItem,
	Label,
} from "react-aria-components";
import type { ReactNode } from "react";

export interface SelectOption {
	id: string;
	name: string;
}

export interface SelectProps {
	name: string;
	label: ReactNode;
	options: SelectOption[];
	placeholder?: string;
	defaultSelectedKey?: string;
	onSelectionChange?: (key: string) => void;
}

// Accepted structural deviation: RAC's Select is a button+popover, not a native <select>, but its
// own HiddenSelect still submits `name` in a native GET form (design.md Decision 9).
export function Select({
	name,
	label,
	options,
	placeholder,
	defaultSelectedKey,
	onSelectionChange,
}: SelectProps) {
	return (
		<AriaSelect
			name={name}
			placeholder={placeholder}
			defaultValue={defaultSelectedKey}
			// key is Key | null (RAC); guard against the literal string "null" leaking into the form value.
			onChange={(key) => onSelectionChange?.(key === null ? "" : String(key))}
		>
			<Label className="dts-form-component__label">{label}</Label>
			<Button className="dts-select-trigger">
				<SelectValue />
			</Button>
			<Popover className="dts-select-popover">
				<ListBox>
					{options.map((option) => (
						<ListBoxItem key={option.id} id={option.id}>
							{option.name}
						</ListBoxItem>
					))}
				</ListBox>
			</Popover>
		</AriaSelect>
	);
}
