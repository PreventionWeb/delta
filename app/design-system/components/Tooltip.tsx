import type { ReactNode } from "react";
import { Tooltip as AriaTooltip, TooltipTrigger } from "react-aria-components";

export interface TooltipProps {
	text: string;
	children: ReactNode;
}

export function Tooltip({ text, children }: TooltipProps) {
	return (
		<TooltipTrigger delay={300} closeDelay={0}>
			{children}
			<AriaTooltip
				offset={4}
				className="ds-scope z-50 rounded-md bg-toast px-2 py-1 text-label font-normal text-fg-inverse shadow-md"
			>
				{text}
			</AriaTooltip>
		</TooltipTrigger>
	);
}
