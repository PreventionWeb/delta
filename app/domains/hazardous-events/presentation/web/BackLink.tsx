import { Link } from "~/design-system/components/Link";

// Hand-rolled SVG standing in for PrimeReact's `pi-arrow-left` icon — no icon
// library exists in this codebase (design.md Decision 12).
function ArrowLeftIcon() {
	return (
		<svg
			aria-hidden="true"
			focusable="false"
			viewBox="0 0 16 16"
			className="h-3.5 w-3.5"
			fill="none"
			stroke="currentColor"
		>
			<path
				d="M14 8H2M2 8L7 3M2 8L7 13"
				strokeWidth="1.5"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

/** Legacy's outlined "Back to Hazardous events" button, re-created as a styled Link
 * (design.md Decision 12 — exact class list matched to legacy's measured computed styles).
 * Colour is the accessible action token, not legacy's failing blue (6b design.md B1). */
export function BackLink({ href, label }: { href: string; label: string }) {
	return (
		<Link
			href={href}
			className="inline-flex items-center gap-2 rounded-[6px] border border-dts-action bg-transparent px-[1.09375rem] py-[0.65625rem] text-sm font-normal text-dts-action"
		>
			<ArrowLeftIcon />
			{label}
		</Link>
	);
}
