import AxeBuilder from "@axe-core/playwright";
import type { ConsoleMessage, Locator, Page } from "@playwright/test";

export const WCAG_22_AA_TAGS = [
	"wcag2a",
	"wcag2aa",
	"wcag21a",
	"wcag21aa",
	"wcag22aa",
] as const;

export interface ViewportSpec {
	name: "mobile" | "tablet" | "desktop";
	width: number;
	height: number;
}

export const BREAKPOINTS: Record<ViewportSpec["name"], ViewportSpec> = {
	mobile: { name: "mobile", width: 375, height: 812 },
	tablet: { name: "tablet", width: 768, height: 1024 },
	desktop: { name: "desktop", width: 1280, height: 900 },
};

export interface WcagAuditOptions {
	/** CSS selector to scope the audit (defaults to `"main"` when present). */
	scope?: string;
	/** Scan the full document instead of scoping to `<main>`. */
	fullPage?: boolean;
	/** CSS selectors to exclude from axe-core scanning. */
	exclude?: string[];
	/** Context label included in failure messages. */
	label?: string;
}

export interface AxeViolationLike {
	id: string;
	impact?: string | null;
	nodes: Array<{
		html: string;
		failureSummary?: string;
	}>;
}

const MIN_TARGET_PX = 24;
const MAX_HTML_SNIPPET_LEN = 160;
const MAX_FAILURE_SUMMARY_LEN = 200;
const MAX_CONSOLE_ERROR_LEN = 240;
const MAX_ELEMENT_SNIPPET_LEN = 140;

/**
 * Defaults to `"main"` to avoid failing on legacy `app/root.tsx` chrome;
 * returns `null` (full document) when `fullPage` is set or `<main>` is absent.
 */
export function resolveAuditScope(params: {
	hasMain: boolean;
	scope?: string;
	fullPage?: boolean;
}): string | null {
	if (params.fullPage) {
		return null;
	}
	if (params.scope && params.scope !== "main") {
		return params.scope;
	}
	return params.hasMain ? "main" : null;
}

async function resolveValidatedScope(
	page: Page,
	options: { scope?: string; fullPage?: boolean; label?: string },
): Promise<string | null> {
	const hasMain = (await page.locator("main").count()) > 0;
	const effectiveScope = resolveAuditScope({
		hasMain,
		scope: options.scope,
		fullPage: options.fullPage,
	});
	if (effectiveScope && (await page.locator(effectiveScope).count()) === 0) {
		throw new Error(
			`Scope selector "${effectiveScope}" matched no element on ${options.label ?? page.url()}`,
		);
	}
	return effectiveScope;
}

export function formatAxeViolations(
	violations: AxeViolationLike[],
	label = "page",
): string {
	const lines = violations.map((v) => {
		const count = v.nodes.length;
		const noun = count === 1 ? "node" : "nodes";
		const first = v.nodes[0];
		const html = first ? first.html.slice(0, MAX_HTML_SNIPPET_LEN) : "";
		const summary = first?.failureSummary
			? first.failureSummary
					.replace(/\s+/g, " ")
					.slice(0, MAX_FAILURE_SUMMARY_LEN)
			: "";
		return `- [${v.impact ?? "unknown"}] ${v.id} (${count} ${noun}): ${html}${summary ? ` | ${summary}` : ""}`;
	});
	return `WCAG 2.2 AA violations on ${label}:\n${lines.join("\n")}`;
}

export interface ErrorCollector {
	errors: string[];
	assertZeroErrors: (label?: string) => void;
	detach: () => void;
}

export function attachErrorCollector(page: Page): ErrorCollector {
	const errors: string[] = [];
	const onPageError = (err: Error) => {
		errors.push(`pageerror: ${err.message}`);
	};
	const onConsole = (msg: ConsoleMessage) => {
		if (msg.type() === "error") {
			errors.push(
				`console.error: ${msg.text().slice(0, MAX_CONSOLE_ERROR_LEN)}`,
			);
		}
	};

	page.on("pageerror", onPageError);
	page.on("console", onConsole);

	return {
		errors,
		assertZeroErrors(label = "page") {
			if (errors.length > 0) {
				throw new Error(
					`Runtime errors detected on ${label}:\n- ${errors.join("\n- ")}`,
				);
			}
		},
		detach() {
			page.off("pageerror", onPageError);
			page.off("console", onConsole);
		},
	};
}

export async function assertWcag22AA(
	page: Page,
	options: WcagAuditOptions = {},
): Promise<void> {
	const effectiveScope = await resolveValidatedScope(page, options);

	let builder = new AxeBuilder({ page }).withTags([...WCAG_22_AA_TAGS]);
	if (effectiveScope) {
		builder = builder.include(effectiveScope);
	}
	for (const selector of options.exclude ?? []) {
		builder = builder.exclude(selector);
	}

	const results = await builder.analyze();
	if (results.violations.length > 0) {
		throw new Error(
			formatAxeViolations(results.violations, options.label ?? page.url()),
		);
	}
}

export async function assertNoHorizontalOverflow(
	page: Page,
	label = "page",
): Promise<void> {
	const { scrollWidth, innerWidth } = await page.evaluate(() => ({
		scrollWidth: document.documentElement.scrollWidth,
		innerWidth: window.innerWidth,
	}));

	if (scrollWidth > innerWidth) {
		throw new Error(
			`Horizontal overflow on ${label}: scrollWidth (${scrollWidth}px) > innerWidth (${innerWidth}px)`,
		);
	}
}

export async function assertTargetSizesAndLabels(
	page: Page,
	options: { scope?: string; fullPage?: boolean; label?: string } = {},
): Promise<void> {
	const effectiveScope = await resolveValidatedScope(page, options);

	const issues = await page.evaluate(
		({ scopeSelector, minTargetPx, maxSnippetLen }) => {
			const roots: ParentNode[] = scopeSelector
				? Array.from(document.querySelectorAll(scopeSelector))
				: [document];
			if (roots.length === 0) {
				return [`Scope selector "${scopeSelector}" matched no element`];
			}

			const controlSelector = [
				"button",
				"a[href]",
				'input:not([type="hidden"])',
				"select",
				"textarea",
				'[role="button"]',
				'[role="tab"]',
				'[role="menuitem"]',
				'[role="checkbox"]',
				'[role="switch"]',
			].join(", ");

			const seen = new Set<HTMLElement>();
			const found: string[] = [];

			// Avoid nested named functions inside page.evaluate: tsx/esbuild injects __name() which is undefined in browser context.
			for (const root of roots) {
				const controls = Array.from(
					root.querySelectorAll<HTMLElement>(controlSelector),
				);
				for (const el of controls) {
					if (seen.has(el)) continue;
					seen.add(el);

					// Skip aria-hidden and sr-only internals (e.g. React Aria HiddenSelect / DismissButton)
					if (el.closest('[aria-hidden="true"]') !== null) continue;
					const style = window.getComputedStyle(el);
					if (
						style.display === "none" ||
						style.visibility === "hidden" ||
						style.opacity === "0"
					) {
						continue;
					}
					const rect = el.getBoundingClientRect();
					if (rect.width === 0 && rect.height === 0) continue;

					let visuallyHidden = false;
					for (
						let cur: Element | null = el;
						cur && cur !== document.body;
						cur = cur.parentElement
					) {
						const cs = window.getComputedStyle(cur);
						const box = cur.getBoundingClientRect();
						const isClipped =
							cs.clip === "rect(0px, 0px, 0px, 0px)" ||
							cs.clipPath === "inset(50%)";
						if (
							box.width <= 1 &&
							box.height <= 1 &&
							(isClipped || cs.overflow === "hidden")
						) {
							visuallyHidden = true;
							break;
						}
					}
					if (visuallyHidden) continue;

					const tag = el.tagName.toLowerCase();
					const role = el.getAttribute("role");

					// WCAG 2.2 SC 2.5.8 inline exception for links within running prose
					const isInlineProseLink =
						tag === "a" &&
						style.display === "inline" &&
						Boolean(el.closest("p, li, dd, blockquote"));

					// Small native inputs inside a <label> inherit the label's hit target
					const wrappingLabel = el.closest("label");
					const hitRect =
						wrappingLabel &&
						(tag === "input" || role === "checkbox" || role === "switch")
							? wrappingLabel.getBoundingClientRect()
							: rect;

					if (
						!isInlineProseLink &&
						(hitRect.width < minTargetPx || hitRect.height < minTargetPx)
					) {
						found.push(
							`Undersized target (${Math.round(hitRect.width)}x${Math.round(hitRect.height)}px < ${minTargetPx}px): ${el.outerHTML.slice(0, maxSnippetLen)}`,
						);
					}

					if (tag === "button" || role === "button") {
						const labelledBy = el.getAttribute("aria-labelledby");
						const hasLabelledBy = Boolean(
							labelledBy &&
							labelledBy
								.split(/\s+/)
								.some((id) =>
									Boolean(document.getElementById(id)?.textContent?.trim()),
								),
						);
						const hasAccessibleName =
							Boolean(el.innerText?.trim()) ||
							Boolean(el.getAttribute("aria-label")?.trim()) ||
							Boolean(el.getAttribute("title")?.trim()) ||
							hasLabelledBy ||
							Boolean(
								el.querySelector(
									"img[alt]:not([alt='']), svg[aria-label], svg title",
								),
							);
						if (!hasAccessibleName) {
							found.push(
								`Button missing accessible name: ${el.outerHTML.slice(0, maxSnippetLen)}`,
							);
						}
					}
				}
			}
			return found;
		},
		{
			scopeSelector: effectiveScope,
			minTargetPx: MIN_TARGET_PX,
			maxSnippetLen: MAX_ELEMENT_SNIPPET_LEN,
		},
	);

	if (issues.length > 0) {
		throw new Error(
			`Target-size / accessible-name issues on ${options.label ?? page.url()}:\n- ${issues.join("\n- ")}`,
		);
	}
}

/**
 * Verifies WCAG 2.2 SC 2.4.11 (Focus Not Obscured): the currently focused element's
 * center point must not be hidden behind an unrelated fixed or sticky overlay.
 */
export async function assertFocusNotObscured(
	page: Page,
	label = "page",
): Promise<void> {
	const result = await page.evaluate((maxSnippetLen) => {
		const active = document.activeElement;
		if (
			!active ||
			active === document.body ||
			active === document.documentElement
		) {
			return { ok: true as const };
		}
		const rect = active.getBoundingClientRect();
		if (rect.width === 0 || rect.height === 0) {
			return { ok: true as const };
		}
		// Skip elements scrolled completely outside the viewport so clamping does not hit a fixed header
		if (
			rect.bottom <= 0 ||
			rect.top >= window.innerHeight ||
			rect.right <= 0 ||
			rect.left >= window.innerWidth
		) {
			return { ok: true as const };
		}

		const visibleLeft = Math.max(rect.left, 0);
		const visibleRight = Math.min(rect.right, window.innerWidth);
		const visibleTop = Math.max(rect.top, 0);
		const visibleBottom = Math.min(rect.bottom, window.innerHeight);
		const cx = (visibleLeft + visibleRight) / 2;
		const cy = (visibleTop + visibleBottom) / 2;

		const topEl = document.elementFromPoint(cx, cy);
		if (!topEl || active.contains(topEl) || topEl.contains(active)) {
			return { ok: true as const };
		}

		let cur: Element | null = topEl;
		while (cur && cur !== document.body) {
			const pos = window.getComputedStyle(cur).position;
			if (pos === "fixed" || pos === "sticky") {
				return {
					ok: false as const,
					activeHtml: active.outerHTML.slice(0, maxSnippetLen),
					coverHtml: cur.outerHTML.slice(0, maxSnippetLen),
				};
			}
			cur = cur.parentElement;
		}
		return { ok: true as const };
	}, MAX_ELEMENT_SNIPPET_LEN);

	if (!result.ok) {
		throw new Error(
			`Focused element obscured on ${label}: ${result.activeHtml} covered by ${result.coverHtml}`,
		);
	}
}

/**
 * Verifies DESIGN.md Table row semantics: non-clickable rows must not display
 * `cursor: pointer`, while clickable rows must.
 */
export async function assertRowCursorSemantics(
	row: Locator,
	options: { clickable: boolean; label?: string },
): Promise<void> {
	await row.hover();
	const cursor = await row.evaluate((el) => window.getComputedStyle(el).cursor);
	const context = options.label ?? "table row";

	if (options.clickable && cursor !== "pointer") {
		throw new Error(
			`Expected clickable ${context} to have cursor: pointer on hover, got "${cursor}"`,
		);
	}
	if (!options.clickable && cursor === "pointer") {
		throw new Error(
			`Expected non-clickable ${context} NOT to have cursor: pointer on hover`,
		);
	}
}
