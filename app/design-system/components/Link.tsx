import { Link as AriaLink } from "react-aria-components";
import { Link as RouterLink } from "react-router";
import type { ReactNode } from "react";

export interface LinkProps {
	/** Already lang-prefixed by the caller (this primitive carries no app-routing knowledge). */
	href: string;
	children: ReactNode;
	className?: string;
	"aria-label"?: string;
}

// Matches the legacy .mg-button-ghost rule exactly via @theme tokens (design.md Decision 8; see TableColumn).
const linkStyle = {
	color: "var(--color-dts-action)",
	borderRadius: "var(--radius-dts-button)",
};

// Delegates navigation to React Router via `render` (React Aria's router-integration point),
// matching legacy `LangLink` (design.md Decision 7).
export function Link({ href, children, className, ...rest }: LinkProps) {
	return (
		<AriaLink
			href={href}
			// Inline style always overrides className, so this yields to a caller's own class
			// (Gate 8 finding -- was overriding legacy's grey icon color otherwise).
			style={className ? undefined : linkStyle}
			className={className}
			{...rest}
			// href is always provided here; the union-type check only satisfies render's declared type.
			render={(props) =>
				"href" in props ? (
					<RouterLink {...props} to={href} />
				) : (
					<span {...props} />
				)
			}
		>
			{children}
		</AriaLink>
	);
}
