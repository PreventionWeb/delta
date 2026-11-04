import { useState } from "react";
import { useTranslation } from "react-i18next";
import { HazardousEventFormField } from "./HazardousEventFormField";
import {
	formatFlexibleDateValue,
	parseFlexibleDateValue,
	type DatePrecision,
	type FlexibleDateParts,
} from "./flexiblePrecisionDate";

export interface HazardousEventFlexibleDateFieldProps {
	name: string;
	label: string;
	initialValue: string;
	errors?: readonly string[];
}

function parseYear(raw: string): number {
	return /^\d{4}$/.test(raw) ? Number(raw) : 0;
}

/**
 * Ports legacy's date_optional_precision control (input.tsx:223-449) for parity (Decision 9,
 * Gate 9 finding). A "Format" row sits above the value row(s); `name` is only on the hidden
 * input carrying the real value -- `required` stays on the active precision's visible control.
 */
export function HazardousEventFlexibleDateField({
	name,
	label,
	initialValue,
	errors,
}: HazardousEventFlexibleDateFieldProps) {
	const { t, i18n } = useTranslation("hazardous-events");
	const monthNames = Array.from({ length: 12 }, (_, i) =>
		new Intl.DateTimeFormat(i18n.language, { month: "long" }).format(
			new Date(2000, i, 1),
		),
	);
	const initial = parseFlexibleDateValue(initialValue);
	const [precision, setPrecision] = useState<DatePrecision>(initial.precision);
	const [parts, setParts] = useState<FlexibleDateParts>(initial.parts);

	const dbValue = formatFlexibleDateValue(parts, precision);
	const formatFieldId = `${name}-precision`;
	const monthFieldId = `${name}-month`;

	return (
		// Real element, not a Fragment -- two of these sit side by side in one grid row in
		// HazardousEventFormPage.tsx; a Fragment would flatten their rows together (Decision 9 Addendum 3).
		<div className="flex flex-col gap-2">
			<HazardousEventFormField
				label={`${label} ${t("form.fields.date_format_label")}`}
				htmlFor={formatFieldId}
			>
				<select
					id={formatFieldId}
					value={precision}
					onChange={(e) => setPrecision(e.target.value as DatePrecision)}
				>
					<option value="yyyy-mm-dd">
						{t("form.fields.date_format_options.full_date")}
					</option>
					<option value="yyyy-mm">
						{t("form.fields.date_format_options.year_month")}
					</option>
					<option value="yyyy">
						{t("form.fields.date_format_options.year_only")}
					</option>
				</select>
			</HazardousEventFormField>

			<input type="hidden" name={name} value={dbValue} />

			{precision === "yyyy-mm-dd" && (
				<HazardousEventFormField
					label={`${label} ${t("form.fields.date_value_label")}`}
					required
					htmlFor={name}
					errors={errors}
				>
					<input
						id={name}
						type="date"
						required
						value={
							parts.y
								? `${parts.y}-${String(parts.m).padStart(2, "0")}-${String(parts.d).padStart(2, "0")}`
								: ""
						}
						onChange={(e) => {
							const v = e.target.value;
							if (v.length >= 10) {
								const [y, m, d] = v.split("-").map(Number);
								setParts({ y, m, d });
							} else {
								setParts({ y: 0, m: 0, d: 0 });
							}
						}}
					/>
				</HazardousEventFormField>
			)}

			{precision === "yyyy-mm" && (
				<>
					<HazardousEventFormField
						label={`${label} ${t("form.fields.date_year_label")}`}
						required
						htmlFor={name}
						errors={errors}
					>
						<input
							id={name}
							type="text"
							inputMode="numeric"
							pattern="\d{4}"
							required
							defaultValue={parts.y || ""}
							onChange={(e) =>
								setParts((prev) => ({ ...prev, y: parseYear(e.target.value) }))
							}
						/>
					</HazardousEventFormField>
					<HazardousEventFormField
						label={`${label} ${t("form.fields.date_month_label")}`}
						htmlFor={monthFieldId}
					>
						<select
							id={monthFieldId}
							value={parts.m || ""}
							onChange={(e) =>
								setParts((prev) => ({
									...prev,
									m: Number(e.target.value),
									d: 1,
								}))
							}
						>
							<option value="">{t("form.fields.select_month")}</option>
							{monthNames.map((name, i) => (
								<option key={i} value={i + 1}>
									{name}
								</option>
							))}
						</select>
					</HazardousEventFormField>
				</>
			)}

			{precision === "yyyy" && (
				<HazardousEventFormField
					label={`${label} ${t("form.fields.date_year_label")}`}
					required
					htmlFor={name}
					errors={errors}
				>
					<input
						id={name}
						type="text"
						inputMode="numeric"
						pattern="\d{4}"
						required
						defaultValue={parts.y || ""}
						onChange={(e) =>
							setParts({ y: parseYear(e.target.value), m: 1, d: 1 })
						}
					/>
				</HazardousEventFormField>
			)}
		</div>
	);
}
