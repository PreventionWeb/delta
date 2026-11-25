import type { ReactNode } from "react";
import {
	Button as AriaButton,
	type ButtonProps as AriaButtonProps,
} from "react-aria-components";
import { Loader2 } from "lucide-react";

export type ButtonVariant =
	| "primary"
	| "secondary"
	| "ghost"
	| "destructive"
	| "icon";

export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends Omit<
	AriaButtonProps,
	"children" | "className"
> {
	variant?: ButtonVariant;
	size?: ButtonSize;
	isLoading?: boolean;
	className?: string;
	children: ReactNode;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
	primary:
		"bg-accent text-fg-inverse data-[hovered]:bg-accent-hover data-[pressed]:bg-accent-active data-[disabled]:bg-accent-disabled data-[disabled]:text-fg-inverse",
	secondary:
		"bg-surface text-fg border border-control data-[hovered]:border-fg-2 data-[hovered]:bg-inset/55 data-[pressed]:bg-inset data-[disabled]:bg-inset data-[disabled]:text-fg-3 data-[disabled]:border-border",
	ghost:
		"bg-transparent text-fg-2 data-[hovered]:bg-inset/55 data-[hovered]:text-fg data-[pressed]:bg-inset data-[disabled]:text-fg-3",
	destructive:
		"bg-crit text-fg-inverse data-[hovered]:bg-crit-hover data-[pressed]:bg-crit-hover data-[disabled]:bg-accent-disabled data-[disabled]:text-fg-inverse",
	icon: "bg-transparent text-fg-2 data-[hovered]:bg-inset data-[hovered]:text-fg data-[pressed]:bg-inset data-[disabled]:text-fg-3 data-[disabled]:bg-transparent",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
	sm: "h-7 px-3 text-body",
	md: "h-8 px-3 text-body",
	lg: "h-10 px-4 text-body",
};

export function Button({
	variant = "secondary",
	size = "md",
	isLoading = false,
	isDisabled,
	className,
	children,
	...props
}: ButtonProps) {
	const isIcon = variant === "icon";
	const disabled = Boolean(isDisabled || isLoading);

	return (
		<AriaButton
			{...props}
			isDisabled={disabled}
			className={[
				"inline-flex items-center justify-center gap-2 rounded-md font-normal leading-none transition-colors select-none cursor-pointer data-[disabled]:cursor-not-allowed",
				"data-[focus-visible]:outline-2 data-[focus-visible]:outline-offset-2 data-[focus-visible]:outline-[var(--focus-ring)]",
				isIcon ? "h-8 w-8 p-0" : SIZE_CLASSES[size],
				VARIANT_CLASSES[variant],
				className,
			]
				.filter(Boolean)
				.join(" ")}
		>
			{isLoading ? (
				<Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
			) : null}
			{children}
		</AriaButton>
	);
}
