import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import {
	isImmutableCommitSha,
	isPresentationFile,
	parseCheckDesignSystemArgs,
	parseDesignMdMetadata,
	runCheckDesignSystem,
	scanFileContent,
	validateDesignMdSpec,
} from "../../../scripts/check-design-system";
import {
	filterUnapprovedViolations,
	validateA11yExceptions,
} from "../../e2e/helpers/a11y";
import {
	formatGate9EvidenceReport,
	resolveGate9ReportPath,
	resolveScreenshotOutputDir,
} from "../../e2e/helpers/prototype-evidence";

describe("scripts/check-design-system — spec metadata & static checks", () => {
	it("identifies presentation and style files while excluding tests and .server files", () => {
		expect(
			isPresentationFile(
				"app/domains/hazardous-events/presentation/HazardousEventList.tsx",
			),
		).toBe(true);
		expect(isPresentationFile("app/routes/$lang+/analytics+/_index.tsx")).toBe(
			true,
		);
		expect(isPresentationFile("app/design-system/components/Table.tsx")).toBe(
			true,
		);
		expect(isPresentationFile("app/styles/all.css")).toBe(true);

		expect(
			isPresentationFile(
				"app/domains/hazardous-events/presentation/HazardousEventList.test.tsx",
			),
		).toBe(false);
		expect(
			isPresentationFile("app/routes/$lang+/analytics+/loader.server.ts"),
		).toBe(false);
		expect(
			isPresentationFile("app/backend.server/models/organization.ts"),
		).toBe(false);
	});

	it("validates immutable commit SHAs and rejects moving branch refs or placeholders", () => {
		expect(isImmutableCommitSha("a1b2c3d")).toBe(true);
		expect(
			isImmutableCommitSha("0123456789abcdef0123456789abcdef01234567"),
		).toBe(true);
		expect(isImmutableCommitSha("main")).toBe(false);
		expect(isImmutableCommitSha("HEAD")).toBe(false);
		expect(isImmutableCommitSha("<commit-sha>")).toBe(false);
		expect(isImmutableCommitSha("")).toBe(false);
	});

	it("parses and validates an approved react-aria design.md spec", () => {
		const md = `# Design

\`\`\`yaml
design-system:
  repository: https://github.com/unisdr/delta-design
  version-or-tag: v0.7.2
  commit: 9f8e7d6c5b4a

feature-prototype:
  repository: https://github.com/unisdr/delta-feature-prototypes
  path: prototypes/hazardous-events-list
  commit: 1a2b3c4d5e6f
  status: approved

ui-classification: react-aria
\`\`\`
`;
		const meta = parseDesignMdMetadata(md);
		expect(meta.uiClassification).toBe("react-aria");
		expect(meta.designSystem?.versionOrTag).toBe("v0.7.2");
		expect(meta.designSystem?.commit).toBe("9f8e7d6c5b4a");
		expect(meta.featurePrototype?.status).toBe("approved");
		expect(validateDesignMdSpec(md)).toEqual([]);
	});

	it("blocks pre-flight verification when feature-prototype.status is still required or refs are moving branches", () => {
		const md = `
design-system:
  repository: https://github.com/unisdr/delta-design
  version-or-tag: main
  commit: main

feature-prototype:
  repository: https://github.com/unisdr/delta-feature-prototypes
  path: prototypes/he
  commit: 1a2b3c4d
  status: required

ui-classification: react-aria
`;
		const violations = validateDesignMdSpec(md);
		expect(violations.map((v) => v.message)).toEqual(
			expect.arrayContaining([
				expect.stringMatching(/version-or-tag/),
				expect.stringMatching(/design-system\.commit/),
				expect.stringMatching(/status is still "required"/),
			]),
		);
	});

	it("requires exception-reason when feature-prototype.status is not-required on a UI change", () => {
		const missingReasonMd = `
design-system:
  repository: https://github.com/unisdr/delta-design
  version-or-tag: v0.7.2
  commit: 9f8e7d6c

feature-prototype:
  repository: https://github.com/unisdr/delta-feature-prototypes
  status: not-required

ui-classification: legacy-exempt
`;
		expect(validateDesignMdSpec(missingReasonMd)).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					rule: "spec-metadata",
					message: expect.stringMatching(/exception-reason is required/),
				}),
			]),
		);

		const validExceptionMd = `${missingReasonMd}  exception-reason: Approved legacy-only bug fix on unmigrated formScreen route\n`;
		expect(validateDesignMdSpec(validExceptionMd)).toEqual([]);
	});

	it("flags raw colours, primitive tokens, PrimeReact imports, em dashes, and missing icon button labels in react-aria files", () => {
		const tsx = `
import { DataTable } from "primereact/datatable";
import { Trash2 } from "lucide-react";

export function Sample() {
	return (
		<div style={{ color: "#004f91", borderColor: "var(--color-neutral-500)" }}>
			<p>Disaster events — summary</p>
			<Button><Trash2 /></Button>
		</div>
	);
}
`;
		const violations = scanFileContent(
			"app/domains/hazardous-events/presentation/Sample.tsx",
			tsx,
			"react-aria",
		);
		const rules = violations.map((v) => v.rule);
		expect(rules).toContain("primereact-import");
		expect(rules).toContain("raw-color-literal");
		expect(rules).toContain("prohibited-primitive-token");
		expect(rules).toContain("em-dash-copy");
		expect(rules).toContain("icon-only-button-missing-label");
	});

	it("honors valid delta-design-ignore-next-line suppressions and flags malformed suppressions without rule/reason", () => {
		const tsx = `
// delta-design-ignore-next-line raw-color-literal: canvas fallback requires literal hex
const fallback = "#2D6FA3";
// delta-design-ignore-next-line
const bad = "#123456";
`;
		const violations = scanFileContent(
			"app/domains/hazardous-events/presentation/Chart.tsx",
			tsx,
			"react-aria",
		);
		expect(violations).toEqual([
			expect.objectContaining({
				line: 4,
				rule: "invalid-suppression",
			}),
			expect.objectContaining({
				line: 5,
				rule: "raw-color-literal",
			}),
		]);
	});

	it("fails when a non-visual change modifies presentation files", () => {
		const tempRoot = mkdtempSync(join(tmpdir(), "delta-ds-check-"));
		try {
			const changeDir = join(tempRoot, "openspec", "changes", "sample-change");
			const presDir = join(tempRoot, "app", "components");
			mkdirSync(changeDir, { recursive: true });
			mkdirSync(presDir, { recursive: true });

			writeFileSync(
				join(changeDir, "design.md"),
				"ui-classification: non-visual\n",
				"utf8",
			);
			writeFileSync(
				join(presDir, "Widget.tsx"),
				"export const Widget = () => <div>Hello</div>;\n",
				"utf8",
			);

			const res = runCheckDesignSystem(
				{
					change: "sample-change",
					verifySpec: true,
					baseRef: "dev",
					files: ["app/components/Widget.tsx"],
					help: false,
				},
				tempRoot,
			);
			expect(res.passed).toBe(false);
			expect(res.violations[0]?.message).toMatch(/classified as non-visual/);
		} finally {
			rmSync(tempRoot, { recursive: true, force: true });
		}
	});

	it("parses CLI arguments cleanly", () => {
		const parsed = parseCheckDesignSystemArgs([
			"--verify-spec",
			"--change",
			"he-list",
			"--files",
			"app/styles/all.css,app/components/Tag.tsx",
		]);
		expect(parsed.verifySpec).toBe(true);
		expect(parsed.change).toBe("he-list");
		expect(parsed.files).toEqual([
			"app/styles/all.css",
			"app/components/Tag.tsx",
		]);
	});
});

describe("tests/e2e/helpers/a11y — exception validation and filtering", () => {
	it("requires tracked issue, rationale, owner, and ISO remediationDate on every exception", () => {
		expect(() =>
			validateA11yExceptions([
				{
					ruleId: "color-contrast",
					issue: "DELTA-123",
					rationale: "Legacy banner contrast scheduled for Q4 migration",
					owner: "@joel",
					remediationDate: "2026-12-15",
				},
			]),
		).not.toThrow();

		expect(() =>
			validateA11yExceptions([
				{
					ruleId: "color-contrast",
					issue: "",
					rationale: "Missing issue",
					owner: "@joel",
					remediationDate: "2026-12-15",
				},
			]),
		).toThrow(/tracked issue/);

		expect(() =>
			validateA11yExceptions([
				{
					ruleId: "color-contrast",
					issue: "DELTA-123",
					rationale: "Bad date",
					owner: "@joel",
					remediationDate: "soon",
				},
			]),
		).toThrow(/ISO remediationDate/);
	});

	it("filters out only nodes covered by an approved exception and retains unapproved violations", () => {
		const violations = [
			{
				id: "color-contrast",
				impact: "serious",
				nodes: [
					{ html: '<span class="legacy-badge">Draft</span>' },
					{ html: '<span class="new-badge">Active</span>' },
				],
			},
		];

		const filtered = filterUnapprovedViolations(violations, [
			{
				ruleId: "color-contrast",
				target: "legacy-badge",
				issue: "DELTA-123",
				rationale: "Unmigrated badge in shared header",
				owner: "@joel",
				remediationDate: "2026-12-15",
			},
		]);

		expect(filtered).toHaveLength(1);
		expect(filtered[0]?.nodes).toEqual([
			{ html: '<span class="new-badge">Active</span>' },
		]);
	});
});

describe("tests/e2e/helpers/prototype-evidence — report formatting & paths", () => {
	it("resolves screenshot dir under test-results/gate-9/<change> and report path under openspec/changes/<change>/evidence/", () => {
		expect(
			resolveScreenshotOutputDir("ca-he-list", "/repo").replace(/\\/g, "/"),
		).toBe("/repo/test-results/gate-9/ca-he-list");
		expect(
			resolveGate9ReportPath("ca-he-list", "/repo").replace(/\\/g, "/"),
		).toBe("/repo/openspec/changes/ca-he-list/evidence/gate-9-report.md");
	});

	it("formats a complete Gate 9 evidence report with pinned SHAs, screenshots, parity checklist, and approved deviations", () => {
		const report = formatGate9EvidenceReport({
			changeName: "ca-he-list",
			uiClassification: "react-aria",
			designSystem: {
				repository: "https://github.com/unisdr/delta-design",
				versionOrTag: "v0.7.2",
				commit: "9f8e7d6c",
			},
			featurePrototype: {
				repository: "https://github.com/unisdr/delta-feature-prototypes",
				path: "prototypes/hazardous-events",
				commit: "1a2b3c4d",
				status: "approved",
			},
			testDataContext: "Seeded tenant with 15 hazardous events",
			commandsRun: {
				gate9a: "yarn check:design-system --change ca-he-list",
				gate9b: "yarn test:e2e tests/e2e/hazardous-events/he-preview.spec.ts",
				gate9c: "yarn design:check --url http://localhost:4000/en/he-preview",
			},
			screenshots: [
				{
					route: "/en/he-preview",
					state: "default",
					viewport: "desktop",
					width: 1280,
					height: 900,
					screenshotPath:
						"test-results/gate-9/ca-he-list/en-he-preview--default--desktop.png",
				},
			],
			checklist: [
				{
					category: "fields-columns-actions",
					requirement: "Columns appear in prototype order",
					status: "pass",
				},
			],
			deviations: [
				{
					item: "Table keyboard navigation",
					prototypeIntent: "Plain HTML table",
					productionImplementation:
						'React Aria Table role="grid" with arrow key cell navigation',
					reason: "react-aria-semantics",
					approvedBy: "Product Design Review",
				},
			],
		});

		expect(report).toContain("https://github.com/unisdr/delta-design");
		expect(report).toContain("`9f8e7d6c`");
		expect(report).toContain(
			"https://github.com/unisdr/delta-feature-prototypes",
		);
		expect(report).toContain("`1a2b3c4d`");
		expect(report).toContain(
			"test-results/gate-9/ca-he-list/en-he-preview--default--desktop.png",
		);
		expect(report).toContain("`react-aria-semantics`");
	});
});
