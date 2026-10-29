import type { ReactNode } from "react";

export interface CheckboxProps {
	name: string;
	label: ReactNode;
	/** Controlled; pass `onChange` too, or React warns on every keystroke. */
	checked?: boolean;
	/** Uncontrolled -- use this, not `checked`, unless you also own `onChange`. */
	defaultChecked?: boolean;
	onChange?: (checked: boolean) => void;
}

// Plain native input, not React Aria -- RAC's Checkbox hides the real input (design.md Decision 9).
export function Checkbox({
	name,
	label,
	checked,
	defaultChecked,
	onChange,
}: CheckboxProps) {
	return (
		<label className="dts-checkbox-label">
			<input
				type="checkbox"
				name={name}
				className="dts-checkbox"
				checked={checked}
				defaultChecked={defaultChecked}
				onChange={onChange ? (e) => onChange(e.target.checked) : undefined}
			/>
			{label}
		</label>
	);
}
