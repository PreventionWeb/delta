import { useId, type ReactNode } from "react";

// Legacy's two title-size groups: "sm" for Basic information/Hazard details, "lg" for the rest (design.md Decision 15, Fix 1).
const TITLE_SIZE_CLASS = {
	sm: "text-[16px] leading-[16px] font-semibold",
	lg: "text-[18px] leading-[24px] font-semibold",
} as const;

// Same groups, bound to legacy's header-to-content gap for each (design.md Decision 15, Fix 1 Part B).
const HEADER_GAP_CLASS = {
	sm: "mb-6",
	lg: "mb-4",
} as const;

export interface CardProps {
	title: string;
	/** Legacy's `pi-xxx` PrimeIcons suffix, e.g. "pi-info-circle"; opt-in, matches legacy's header icon. */
	icon?: string;
	/** Legacy's title-size group for this Card; only meaningful alongside `icon`. Defaults to "lg" (design.md Decision 15, Fix 1). */
	titleSize?: "sm" | "lg";
	children: ReactNode;
}

// Plain, accessible <section>, not a PrimeReact port; lives in the design system, not the hazardous-events domain.
export function Card({ title, icon, titleSize = "lg", children }: CardProps) {
	const headingId = useId();
	const heading = (
		<h2 id={headingId} className={TITLE_SIZE_CLASS[titleSize]}>
			{title}
		</h2>
	);
	return (
		<section
			className="rounded-2xl border border-gray-200 bg-white px-[20px] py-[36px] shadow-[0_2px_1px_-1px_rgba(0,0,0,0.2),0_1px_1px_0_rgba(0,0,0,0.14),0_1px_3px_0_rgba(0,0,0,0.12)]"
			aria-labelledby={headingId}
		>
			{icon ? (
				<div
					className={`flex items-center gap-2 text-slate-800 ${HEADER_GAP_CLASS[titleSize]}`}
				>
					<i className={`pi ${icon} text-blue-600`} aria-hidden="true"></i>
					{heading}
				</div>
			) : (
				heading
			)}
			{children}
		</section>
	);
}
