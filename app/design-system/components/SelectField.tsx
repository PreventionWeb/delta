import {
	Button as AriaButton,
	FieldError,
	Label,
	ListBox,
	ListBoxItem,
	Popover,
	Select as AriaSelect,
	SelectValue,
	Text,
} from "react-aria-components";
import { Check, ChevronDown } from "lucide-react";

export interface SelectOption {
	id: string;
	label: string;
}

const NONE_SENTINEL = "__delta_none__";

interface SelectPopoverListProps {
	label: string;
	items: SelectOption[];
	skipOptionClassId?: string;
	optionClassName?: string;
}

function SelectPopoverList({
	label,
	items,
	skipOptionClassId,
	optionClassName,
}: SelectPopoverListProps) {
	return (
		<Popover
			offset={4}
			className="ds-scope z-50 min-w-[var(--trigger-width)] rounded-xl border border-border bg-surface p-2 shadow-md outline-none"
		>
			<ListBox
				aria-label={label}
				className="max-h-80 overflow-y-auto outline-none"
			>
				{items.map((item) => (
					<ListBoxItem
						key={item.id}
						id={item.id}
						textValue={item.label}
						className="flex h-8 cursor-pointer items-center justify-between gap-2 rounded-md px-3 text-body text-fg outline-none data-[hovered]:bg-inset data-[focused]:bg-inset"
					>
						{({ isSelected }) => (
							<>
								<span
									className={[
										"truncate",
										item.id !== skipOptionClassId ? optionClassName : "",
									]
										.filter(Boolean)
										.join(" ")}
								>
									{item.label}
								</span>
								{isSelected ? (
									<Check
										className="h-4 w-4 shrink-0 text-fg"
										aria-hidden="true"
									/>
								) : null}
							</>
						)}
					</ListBoxItem>
				))}
			</ListBox>
		</Popover>
	);
}

export interface FormSelectProps {
	label: string;
	name?: string;
	items: SelectOption[];
	value: string | null;
	onChange: (value: string | null) => void;
	placeholder: string;
	helpText?: string;
	errorMessage?: string;
	isRequired?: boolean;
	requiredLabel?: string;
	noneLabel?: string;
	isDisabled?: boolean;
	valueClassName?: string;
	optionClassName?: string;
}

export function FormSelect({
	label,
	name,
	items,
	value,
	onChange,
	placeholder,
	helpText,
	errorMessage,
	isRequired = false,
	requiredLabel = "(required)",
	noneLabel,
	isDisabled = false,
	valueClassName,
	optionClassName,
}: FormSelectProps) {
	const allItems: SelectOption[] = noneLabel
		? [{ id: NONE_SENTINEL, label: noneLabel }, ...items]
		: items;

	return (
		<AriaSelect
			name={name}
			selectedKey={value ?? null}
			onSelectionChange={(key) => {
				if (key === null || (noneLabel && String(key) === NONE_SENTINEL)) {
					onChange(null);
				} else {
					onChange(String(key));
				}
			}}
			isRequired={isRequired}
			isDisabled={isDisabled}
			isInvalid={Boolean(errorMessage)}
			className="flex flex-col gap-2"
		>
			<Label className="text-body font-normal text-fg">
				{label}
				{isRequired ? (
					<>
						{" "}
						<span className="text-fg-2">{requiredLabel}</span>
					</>
				) : null}
			</Label>
			<AriaButton
				className={[
					"flex h-8 w-full items-center justify-between gap-2 rounded-md border bg-surface px-3 text-body text-fg outline-none cursor-pointer",
					"data-[hovered]:border-fg-2",
					"data-[focus-visible]:outline-2 data-[focus-visible]:outline-offset-2 data-[focus-visible]:outline-[var(--focus-ring)]",
					"data-[disabled]:bg-inset data-[disabled]:text-fg-3 data-[disabled]:border-border data-[disabled]:cursor-not-allowed",
					errorMessage ? "border-crit" : "border-control",
				].join(" ")}
			>
				<SelectValue className="truncate text-left">
					{({ selectedText }) =>
						selectedText ? (
							<span className={valueClassName}>{selectedText}</span>
						) : (
							<span className="text-fg-2">{placeholder}</span>
						)
					}
				</SelectValue>
				<ChevronDown
					className="h-4 w-4 shrink-0 text-fg-2"
					aria-hidden="true"
				/>
			</AriaButton>
			{helpText && !errorMessage ? (
				<Text slot="description" className="text-label text-fg-2">
					{helpText}
				</Text>
			) : null}
			{errorMessage ? (
				<FieldError className="text-label text-crit">{errorMessage}</FieldError>
			) : null}
			<SelectPopoverList
				label={label}
				items={allItems}
				skipOptionClassId={NONE_SENTINEL}
				optionClassName={optionClassName}
			/>
		</AriaSelect>
	);
}

export interface FilterSelectProps {
	label: string;
	allLabel?: string;
	options: SelectOption[];
	value: string;
	onChange: (value: string) => void;
	defaultValue?: string;
	className?: string;
	optionClassName?: string;
}

export function FilterSelect({
	label,
	options,
	value,
	onChange,
	defaultValue = "all",
	className,
	optionClassName,
}: FilterSelectProps) {
	const isActive = value !== defaultValue;

	return (
		<AriaSelect
			aria-label={label}
			selectedKey={value}
			onSelectionChange={(key) => {
				if (key !== null) {
					onChange(String(key));
				}
			}}
			className={className}
		>
			<AriaButton
				data-active={isActive ? "true" : undefined}
				className={[
					"flex h-8 min-w-36 items-center justify-between gap-2 rounded-md border border-control px-3 text-body text-fg outline-none cursor-pointer",
					"data-[hovered]:border-fg-2",
					"data-[focus-visible]:outline-2 data-[focus-visible]:outline-offset-2 data-[focus-visible]:outline-[var(--focus-ring)]",
					isActive ? "bg-inset" : "bg-surface",
				].join(" ")}
			>
				<SelectValue className="truncate text-left">
					{({ selectedText }) => (
						<span className={isActive ? optionClassName : undefined}>
							{selectedText}
						</span>
					)}
				</SelectValue>
				<ChevronDown
					className="h-4 w-4 shrink-0 text-fg-2"
					aria-hidden="true"
				/>
			</AriaButton>
			<SelectPopoverList
				label={label}
				items={options}
				skipOptionClassId={defaultValue}
				optionClassName={optionClassName}
			/>
		</AriaSelect>
	);
}
