import type { ReactNode } from "react";

/** Legacy's stacked label/value block (design.md Decision 10). */
export function ReviewField({
	label,
	value,
	preserveLineBreaks = false,
}: {
	label: string;
	value: ReactNode;
	/** Legacy's long free-text fields keep embedded newlines and a lighter, non-bold style (design.md Fix 4). */
	preserveLineBreaks?: boolean;
}) {
	const valueClassName = preserveLineBreaks
		? "text-[14px] leading-relaxed text-slate-700 whitespace-pre-line"
		: "text-[14px] leading-[18px] font-semibold text-slate-800";

	return (
		<div className="space-y-1">
			<p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
				{label}
			</p>
			<p className={valueClassName}>{value}</p>
		</div>
	);
}
