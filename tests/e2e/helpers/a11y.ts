import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import {
	type AxeViolationLike,
	WCAG_22_AA_TAGS,
	type WcagAuditOptions,
	assertFocusNotObscured,
	assertTargetSizesAndLabels,
	formatAxeViolations,
	resolveAuditScope,
} from "./designSystemChecks";

export {
	WCAG_22_AA_TAGS,
	assertFocusNotObscured,
	assertTargetSizesAndLabels,
	formatAxeViolations,
	resolveAuditScope,
};

/**
 * Structured governance metadata required for any approved WCAG 2.2 AA violation exception
 * in Gate 9b. Every exception must link to a tracked issue, rationale, owner, and target
 * remediation date (YYYY-MM-DD).
 */
export interface A11yViolationException {
	ruleId: string;
	target?: string;
	issue: string;
	rationale: string;
	owner: string;
	remediationDate: string;
}

export interface Gate9bA11yOptions extends WcagAuditOptions {
	exceptions?: A11yViolationException[];
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function validateA11yExceptions(
	exceptions: A11yViolationException[],
): void {
	for (const ex of exceptions) {
		if (!ex.ruleId?.trim()) {
			throw new Error("A11y exception is missing ruleId");
		}
		if (!ex.issue?.trim()) {
			throw new Error(
				`A11y exception for "${ex.ruleId}" is missing a tracked issue reference`,
			);
		}
		if (!ex.rationale?.trim()) {
			throw new Error(
				`A11y exception for "${ex.ruleId}" is missing a rationale`,
			);
		}
		if (!ex.owner?.trim()) {
			throw new Error(`A11y exception for "${ex.ruleId}" is missing an owner`);
		}
		if (!ISO_DATE_RE.test(ex.remediationDate?.trim() ?? "")) {
			throw new Error(
				`A11y exception for "${ex.ruleId}" must have an ISO remediationDate (YYYY-MM-DD), got "${ex.remediationDate ?? ""}"`,
			);
		}
	}
}

export function filterUnapprovedViolations(
	violations: AxeViolationLike[],
	exceptions: A11yViolationException[] = [],
): AxeViolationLike[] {
	validateA11yExceptions(exceptions);
	if (exceptions.length === 0) {
		return violations;
	}

	const remaining: AxeViolationLike[] = [];
	for (const violation of violations) {
		const matchingExceptions = exceptions.filter(
			(ex) => ex.ruleId === violation.id,
		);
		if (matchingExceptions.length === 0) {
			remaining.push(violation);
			continue;
		}

		// If any exception for this rule omits target, the entire rule is covered.
		if (matchingExceptions.some((ex) => !ex.target)) {
			continue;
		}

		const unapprovedNodes = violation.nodes.filter(
			(node) =>
				!matchingExceptions.some(
					(ex) => ex.target && node.html.includes(ex.target),
				),
		);
		if (unapprovedNodes.length > 0) {
			remaining.push({
				...violation,
				nodes: unapprovedNodes,
			});
		}
	}

	return remaining;
}

/**
 * Runs Playwright + `@axe-core/playwright` across WCAG 2.0/2.1/2.2 Level A & AA tags
 * (`wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa`), failing on any unapproved violation.
 */
export async function runWcag22A11yCheck(
	page: Page,
	options: Gate9bA11yOptions = {},
): Promise<void> {
	const exceptions = options.exceptions ?? [];
	validateA11yExceptions(exceptions);

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

	let builder = new AxeBuilder({ page }).withTags([...WCAG_22_AA_TAGS]);
	if (effectiveScope) {
		builder = builder.include(effectiveScope);
	}
	for (const selector of options.exclude ?? []) {
		builder = builder.exclude(selector);
	}

	const results = await builder.analyze();
	const unapproved = filterUnapprovedViolations(results.violations, exceptions);
	if (unapproved.length > 0) {
		throw new Error(
			formatAxeViolations(unapproved, options.label ?? page.url()),
		);
	}
}

export interface KeyboardStep {
	key:
		| "Tab"
		| "Shift+Tab"
		| "Enter"
		| "Space"
		| "Escape"
		| "ArrowUp"
		| "ArrowDown"
		| "ArrowLeft"
		| "ArrowRight";
	expectedFocusedSelector?: string;
	description?: string;
}

/**
 * Executes a Gate 9b keyboard navigation sequence and verifies focus order and
 * non-obscuration after each key press.
 */
export async function verifyKeyboardSequence(
	page: Page,
	steps: KeyboardStep[],
	label = "page",
): Promise<void> {
	for (let i = 0; i < steps.length; i++) {
		const step = steps[i];
		const stepLabel = `${label} step #${i + 1} (${step.key}${step.description ? `: ${step.description}` : ""})`;
		await page.keyboard.press(step.key);
		await assertFocusNotObscured(page, stepLabel);

		if (step.expectedFocusedSelector) {
			const matches = await page.evaluate((selector) => {
				const active = document.activeElement;
				return Boolean(active && active.matches(selector));
			}, step.expectedFocusedSelector);
			if (!matches) {
				const actualHtml = await page.evaluate(
					() => document.activeElement?.outerHTML.slice(0, 140) ?? "null",
				);
				throw new Error(
					`Keyboard focus mismatch at ${stepLabel}: expected focused element matching "${step.expectedFocusedSelector}", got ${actualHtml}`,
				);
			}
		}
	}
}
