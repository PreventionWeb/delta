// Generic React Aria field wrappers for the POC create page (tasks 3.4-3.5,
// openspec/changes/poc-react-aria-hazardous-event). Each wrapper reads its label/required
// state from a `FormInputDef` entry (design.md Decision 5: `fieldsDef`'s metadata is reused as
// data, the generic FormView/Inputs rendering engine is not) rather than hardcoding it, and
// binds to a single value/onChange pair — the caller wires that back into the stepper's one
// controlled state object (design.md Decision 4), not a parallel state.
import {
	DateField,
	DateInput,
	DateSegment,
	Input,
	Label,
	Radio,
	RadioGroup,
	TextArea,
	TextField,
} from "react-aria-components";
import { CalendarDate, parseDate } from "@internationalized/date";

import type { FormInputDef } from "~/frontend/form";
import type { HazardousEventFields } from "~/backend.server/models/event";

type FieldDef = FormInputDef<HazardousEventFields>;

/** Reads a field's metadata from the real `fieldsDef(ctx)` result rather than
 *  hand-declaring labels/required flags a second time (task 3.2's established pattern).
 *  Throws if the key is missing — these keys are all present in `fieldsDefCommon`, so a miss
 *  means the contract changed underneath this POC, which should fail loudly, not silently
 *  fall back to a made-up label. */
export function fieldMetaOrThrow(
	fieldsMeta: FieldDef[],
	key: string,
): FieldDef {
	const found = fieldsMeta.find((f) => f.key === key);
	if (!found) {
		throw new Error(
			`fieldsDef metadata missing for key "${key}" — this POC's fields are expected to stay in sync with hazardeventform.tsx's fieldsDefCommon.`,
		);
	}
	return found;
}

const inputClass =
	"rounded border border-gray-300 px-2 py-1 data-[focus-visible]:outline data-[focus-visible]:outline-2 data-[focus-visible]:outline-[#106cb8]";
const labelClass = "font-medium text-[#333333]";

function requiredSuffix(def: FieldDef): string {
	return def.required ? " *" : "";
}

export function TextInputField({
	def,
	value,
	onChange,
}: {
	def: FieldDef;
	value: string;
	onChange: (value: string) => void;
}) {
	return (
		<TextField
			value={value}
			onChange={onChange}
			isRequired={!!def.required}
			className="flex flex-col gap-1 text-sm"
		>
			<Label className={labelClass}>
				{def.label}
				{requiredSuffix(def)}
			</Label>
			<Input className={inputClass} />
		</TextField>
	);
}

export function TextAreaInputField({
	def,
	value,
	onChange,
}: {
	def: FieldDef;
	value: string;
	onChange: (value: string) => void;
}) {
	return (
		<TextField
			value={value}
			onChange={onChange}
			isRequired={!!def.required}
			className="flex flex-col gap-1 text-sm"
		>
			<Label className={labelClass}>
				{def.label}
				{requiredSuffix(def)}
			</Label>
			<TextArea rows={3} className={inputClass} />
		</TextField>
	);
}

export function EnumRadioField({
	def,
	value,
	onChange,
}: {
	def: FieldDef;
	value: string;
	onChange: (value: string) => void;
}) {
	return (
		<RadioGroup
			value={value || null}
			onChange={onChange}
			isRequired={!!def.required}
			className="flex flex-col gap-2 text-sm"
		>
			<Label className={labelClass}>
				{def.label}
				{requiredSuffix(def)}
			</Label>
			<div className="flex flex-wrap gap-4">
				{def.enumData?.map((opt) => (
					<Radio
						key={opt.key}
						value={opt.key}
						className="flex cursor-pointer items-center gap-2 data-[focus-visible]:outline data-[focus-visible]:outline-2 data-[focus-visible]:outline-offset-2 data-[focus-visible]:outline-[#106cb8]"
					>
						{({ isSelected }) => (
							<>
								<span
									className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
										isSelected ? "border-[#004f91]" : "border-gray-400"
									}`}
								>
									{isSelected ? (
										<span className="h-2 w-2 rounded-full bg-[#004f91]" />
									) : null}
								</span>
								{opt.label}
							</>
						)}
					</Radio>
				))}
			</div>
		</RadioGroup>
	);
}

/** `date_optional_precision` (hazardeventform.tsx's fieldsDefCommon) supports partial
 *  precision — `yyyy`, `yyyy-mm`, or full `yyyy-mm-dd` (see the widget at
 *  app/frontend/form/input.tsx:223+) — via a separate precision toggle. This POC's `DateField`
 *  only edits full-precision `yyyy-mm-dd` values; a stored partial-precision value is treated
 *  as empty rather than attempting to represent it. This is a deliberate simplification, not a
 *  design.md deviation (Decision 3 names `DateField`/`DatePicker` for these fields but doesn't
 *  specify precision handling) — flagged for the task 4.3 recommendation. */
function toCalendarDate(value: string | null | undefined): CalendarDate | null {
	if (!value || value.length !== 10) return null;
	try {
		return parseDate(value);
	} catch {
		return null;
	}
}

export function DateInputField({
	def,
	value,
	onChange,
}: {
	def: FieldDef;
	value: string | undefined;
	onChange: (value: string) => void;
}) {
	return (
		<DateField
			value={toCalendarDate(value)}
			onChange={(date) => onChange(date ? date.toString() : "")}
			isRequired={!!def.required}
			className="flex flex-col gap-1 text-sm"
		>
			<Label className={labelClass}>
				{def.label}
				{requiredSuffix(def)}
			</Label>
			<DateInput
				className={`flex w-fit ${inputClass} data-[focus-within]:outline data-[focus-within]:outline-2 data-[focus-within]:outline-[#106cb8]`}
			>
				{(segment) => (
					<DateSegment
						segment={segment}
						className="rounded px-0.5 tabular-nums outline-none data-[placeholder]:text-gray-400 data-[focused]:bg-[#004f91] data-[focused]:text-white"
					/>
				)}
			</DateInput>
		</DateField>
	);
}
