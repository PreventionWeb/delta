import {
	FieldError,
	Input,
	Label,
	Text,
	TextField as AriaTextField,
} from "react-aria-components";

export interface TextFieldProps {
	label?: string;
	"aria-label"?: string;
	name?: string;
	type?: "text" | "email" | "search";
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	isRequired?: boolean;
	requiredLabel?: string;
	isDisabled?: boolean;
	errorMessage?: string;
	helpText?: string;
	className?: string;
	inputClassName?: string;
	autoComplete?: string;
}

export function TextField({
	label,
	"aria-label": ariaLabel,
	name,
	type = "text",
	value,
	onChange,
	placeholder,
	isRequired = false,
	requiredLabel = "(required)",
	isDisabled = false,
	errorMessage,
	helpText,
	className,
	inputClassName,
	autoComplete,
}: TextFieldProps) {
	return (
		<AriaTextField
			name={name}
			type={type}
			value={value}
			onChange={onChange}
			isRequired={isRequired}
			isDisabled={isDisabled}
			isInvalid={Boolean(errorMessage)}
			aria-label={label ? undefined : ariaLabel}
			className={["flex flex-col gap-2", className].filter(Boolean).join(" ")}
		>
			{label ? (
				<Label className="text-body font-normal text-fg">
					{label}
					{isRequired ? (
						<>
							{" "}
							<span className="text-fg-2">{requiredLabel}</span>
						</>
					) : null}
				</Label>
			) : null}
			<Input
				placeholder={placeholder}
				autoComplete={autoComplete}
				className={[
					"h-8 w-full rounded-md border bg-surface px-3 text-body text-fg placeholder:text-fg-2 outline-none",
					"data-[hovered]:border-fg-2",
					"data-[focused]:border-accent data-[focused]:ring-1 data-[focused]:ring-inset data-[focused]:ring-accent",
					"data-[disabled]:bg-inset data-[disabled]:text-fg-2 data-[disabled]:border-border data-[disabled]:cursor-not-allowed",
					errorMessage ? "border-crit" : "border-control",
					inputClassName,
				]
					.filter(Boolean)
					.join(" ")}
			/>
			{helpText ? (
				<Text slot="description" className="text-label text-fg-2">
					{helpText}
				</Text>
			) : null}
			{errorMessage ? (
				<FieldError className="text-label text-crit">{errorMessage}</FieldError>
			) : null}
		</AriaTextField>
	);
}
