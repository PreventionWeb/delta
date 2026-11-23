import { Button as AriaButton } from "react-aria-components";
import type { ReactNode } from "react";

export interface ButtonProps {
	/** `system`/`system-primary`/`icon` reuse legacy's own button classes; `accent*`/
	 * `muted-outline` reproduce legacy's item-dialog buttons in Tailwind palette classes;
	 * `danger-outline` is PrimeReact's `severity="danger" outlined` button. */
	variant:
		| "primary"
		| "outline"
		| "system"
		| "system-primary"
		| "icon"
		| "accent"
		| "accent-outline"
		| "muted-outline"
		| "danger-outline";
	type?: "button" | "submit";
	disabled?: boolean;
	/** React Aria pending state: ignores presses but stays focusable, unlike `disabled`. */
	pending?: boolean;
	autoFocus?: boolean;
	onPress?: () => void;
	children: ReactNode;
	/** For an icon-only button whose visible content isn't its accessible name. */
	"aria-label"?: string;
	/** Caller's own layout utilities, e.g. squared corners inside an input group. */
	className?: string;
	/** React Aria slot, e.g. "chevron" for a Tree row's expand toggle. */
	slot?: string;
}

const ITEM_DIALOG_BASE =
	"inline-flex cursor-pointer items-center justify-center gap-2 rounded-md border px-5 py-3 text-base font-bold disabled:cursor-not-allowed disabled:opacity-60";

const VARIANT_CLASS = {
	primary: "dts-button dts-button--primary",
	outline: "dts-button dts-button--outline",
	system: "mg-button mg-button-system",
	"system-primary": "mg-button mg-button-primary",
	icon: "inline-flex cursor-pointer",
	accent: `${ITEM_DIALOG_BASE} border-blue-500 bg-blue-500 text-white enabled:hover:border-blue-600 enabled:hover:bg-blue-600`,
	"accent-outline": `${ITEM_DIALOG_BASE} border-blue-500 bg-transparent text-blue-500 enabled:hover:bg-blue-500/5`,
	"muted-outline": `${ITEM_DIALOG_BASE} border-slate-500 bg-transparent text-slate-500 enabled:hover:bg-slate-500/5`,
	"danger-outline": `${ITEM_DIALOG_BASE} border-red-500 bg-transparent text-red-500 enabled:hover:bg-red-500/5`,
} as const;

// Wraps RAC's Button -- a real native <button> (design.md Decision 12).
export function Button({
	variant,
	type = "button",
	disabled = false,
	pending,
	autoFocus,
	onPress,
	children,
	"aria-label": ariaLabel,
	className,
	slot,
}: ButtonProps) {
	return (
		<AriaButton
			type={type}
			isDisabled={disabled}
			isPending={pending}
			autoFocus={autoFocus}
			onPress={onPress}
			aria-label={ariaLabel}
			slot={slot}
			className={[VARIANT_CLASS[variant], className].filter(Boolean).join(" ")}
		>
			{children}
		</AriaButton>
	);
}
