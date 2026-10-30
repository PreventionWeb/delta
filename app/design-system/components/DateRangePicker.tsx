import type { ReactNode } from "react";

export interface DateRangePickerProps {
	fromName: string;
	fromLabel: ReactNode;
	fromDefaultValue?: string;
	toName: string;
	toLabel: ReactNode;
	toDefaultValue?: string;
}

// Two independent native date inputs, not React Aria's segmented DateRangePicker -- legacy renders
// two separate <input type="date"> elements, not one composite control (design.md Decision 9).
export function DateRangePicker({
	fromName,
	fromLabel,
	fromDefaultValue,
	toName,
	toLabel,
	toDefaultValue,
}: DateRangePickerProps) {
	return (
		<>
			<label className="dts-form-component">
				<div className="dts-form-component__label">{fromLabel}</div>
				<input
					type="date"
					name={fromName}
					className="dts-date-input"
					defaultValue={fromDefaultValue}
				/>
			</label>
			<label className="dts-form-component">
				<div className="dts-form-component__label">{toLabel}</div>
				<input
					type="date"
					name={toName}
					className="dts-date-input"
					defaultValue={toDefaultValue}
				/>
			</label>
		</>
	);
}
