import { mkdir, writeFile } from "fs/promises";
import { join, resolve } from "path";
import type { Page } from "@playwright/test";
import { BREAKPOINTS, type ViewportSpec } from "./designSystemChecks";

export type PrototypeMaterialState =
	| "default"
	| "empty"
	| "loading"
	| "error"
	| "success"
	| "destructive";

export interface PrototypeScreenshotCapture {
	route: string;
	state: PrototypeMaterialState;
	viewport: ViewportSpec["name"];
	width: number;
	height: number;
	screenshotPath: string;
}

export interface ParityChecklistItem {
	category:
		| "hierarchy-layout"
		| "fields-columns-actions"
		| "states"
		| "responsive-keyboard"
		| "design-system-tokens"
		| "content-copy";
	requirement: string;
	status: "pass" | "deviation" | "fail";
	notes?: string;
}

export interface ApprovedDeviationRecord {
	item: string;
	prototypeIntent: string;
	productionImplementation: string;
	reason:
		| "react-aria-semantics"
		| "wcag-22-aa"
		| "responsive-layout"
		| "browser-rendering"
		| "production-data"
		| "localisation"
		| "security-performance";
	approvedBy: string;
}

export interface Gate9EvidenceReportInput {
	changeName: string;
	uiClassification: "react-aria" | "legacy-exempt";
	designSystem: {
		repository: string;
		versionOrTag: string;
		commit: string;
	};
	featurePrototype: {
		repository: string;
		path: string;
		commit: string;
		status: "approved" | "not-required";
		exceptionReason?: string;
	};
	testDataContext: string;
	commandsRun: {
		gate9a: string;
		gate9b: string;
		gate9c: string;
	};
	screenshots: PrototypeScreenshotCapture[];
	checklist: ParityChecklistItem[];
	deviations?: ApprovedDeviationRecord[];
}

export function resolveScreenshotOutputDir(
	changeName: string,
	cwd = process.cwd(),
): string {
	return resolve(cwd, "test-results", "gate-9", changeName);
}

export function resolveGate9ReportPath(
	changeName: string,
	cwd = process.cwd(),
): string {
	return resolve(
		cwd,
		"openspec",
		"changes",
		changeName,
		"evidence",
		"gate-9-report.md",
	);
}

function sanitizeSlug(input: string): string {
	return (
		input
			.replace(/^\/+|\/+$/g, "")
			.replace(/[^a-zA-Z0-9-_]+/g, "-")
			.replace(/-+/g, "-") || "root"
	);
}

/**
 * Captures screenshots across principal responsive viewports (`mobile`, `tablet`, `desktop`)
 * for a route and material state, storing PNGs under `test-results/gate-9/<changeName>/`.
 */
export async function capturePrototypeStateScreenshots(
	page: Page,
	params: {
		changeName: string;
		routeUrl: string;
		routeLabel?: string;
		state?: PrototypeMaterialState;
		viewports?: ViewportSpec[];
		prepareState?: (page: Page) => Promise<void>;
		cwd?: string;
	},
): Promise<PrototypeScreenshotCapture[]> {
	const state = params.state ?? "default";
	const viewports = params.viewports ?? [
		BREAKPOINTS.mobile,
		BREAKPOINTS.tablet,
		BREAKPOINTS.desktop,
	];
	const outDir = resolveScreenshotOutputDir(params.changeName, params.cwd);
	await mkdir(outDir, { recursive: true });

	const routeSlug = sanitizeSlug(
		params.routeLabel ?? new URL(params.routeUrl).pathname,
	);
	const captures: PrototypeScreenshotCapture[] = [];

	for (const vp of viewports) {
		await page.setViewportSize({ width: vp.width, height: vp.height });
		await page.goto(params.routeUrl, { waitUntil: "networkidle" });
		if (params.prepareState) {
			await params.prepareState(page);
		}
		const fileName = `${routeSlug}--${state}--${vp.name}.png`;
		const absPath = join(outDir, fileName);
		await page.screenshot({ path: absPath, fullPage: true });
		captures.push({
			route: params.routeLabel ?? params.routeUrl,
			state,
			viewport: vp.name,
			width: vp.width,
			height: vp.height,
			screenshotPath: `test-results/gate-9/${params.changeName}/${fileName}`,
		});
	}

	return captures;
}

/**
 * Formats the deterministic Markdown evidence report committed to
 * `openspec/changes/<changeName>/evidence/gate-9-report.md`.
 */
export function formatGate9EvidenceReport(
	input: Gate9EvidenceReportInput,
): string {
	const deviations = input.deviations ?? [];
	const screenshotRows =
		input.screenshots.length > 0
			? input.screenshots
					.map(
						(s) =>
							`| \`${s.route}\` | \`${s.state}\` | \`${s.viewport}\` (${s.width}x${s.height}) | \`${s.screenshotPath}\` |`,
					)
					.join("\n")
			: "| _None_ | - | - | - |";

	const checklistRows =
		input.checklist.length > 0
			? input.checklist
					.map(
						(c) =>
							`| \`${c.category}\` | ${c.requirement} | **${c.status.toUpperCase()}** | ${c.notes ?? "-"} |`,
					)
					.join("\n")
			: "| - | _No checklist items recorded_ | - | - |";

	const deviationRows =
		deviations.length > 0
			? deviations
					.map(
						(d) =>
							`| ${d.item} | ${d.prototypeIntent} | ${d.productionImplementation} | \`${d.reason}\` | ${d.approvedBy} |`,
					)
					.join("\n")
			: "| _None_ | - | - | - | - |";

	return `# Gate 9 Verification Evidence Report — \`${input.changeName}\`

## 1. Governance & Pinned References

- **UI Classification**: \`${input.uiClassification}\`
- **Design System Authority**: \`${input.designSystem.repository}\`
  - **Tag / Version**: \`${input.designSystem.versionOrTag}\`
  - **Commit SHA**: \`${input.designSystem.commit}\`
- **Feature Prototype Authority**: \`${input.featurePrototype.repository}\`
  - **Path**: \`${input.featurePrototype.path}\`
  - **Commit SHA**: \`${input.featurePrototype.commit}\`
  - **Status**: \`${input.featurePrototype.status}\`${
		input.featurePrototype.exceptionReason
			? `\n  - **Exception Reason**: ${input.featurePrototype.exceptionReason}`
			: ""
	}
- **Test Data & Viewport Context**: ${input.testDataContext}

## 2. Verification Commands Executed

- **Gate 9a (Design-system & token compliance)**: \`${input.commandsRun.gate9a}\`
- **Gate 9b (WCAG 2.2 AA & keyboard compliance)**: \`${input.commandsRun.gate9b}\`
- **Gate 9c (Feature hand-off parity & evidence)**: \`${input.commandsRun.gate9c}\`

## 3. Captured Screenshots (\`test-results/gate-9/${input.changeName}/\`)

| Route | Material State | Viewport | Artifact Path |
| ----- | -------------- | -------- | ------------- |
${screenshotRows}

## 4. Itemised Feature Hand-Off Parity Checklist (Gate 9c)

| Category | Requirement | Status | Notes |
| -------- | ----------- | ------ | ----- |
${checklistRows}

## 5. Documented & Approved Deviations

| Item | Prototype Intent | Production Implementation | Permitted Reason | Approved By |
| ---- | ---------------- | ------------------------- | ---------------- | ----------- |
${deviationRows}
`;
}

export async function writeGate9EvidenceReport(
	input: Gate9EvidenceReportInput,
	cwd = process.cwd(),
): Promise<string> {
	const reportPath = resolveGate9ReportPath(input.changeName, cwd);
	await mkdir(resolve(reportPath, ".."), { recursive: true });
	await writeFile(reportPath, formatGate9EvidenceReport(input), "utf8");
	return reportPath;
}
