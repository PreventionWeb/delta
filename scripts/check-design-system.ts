import { execFileSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { relative, resolve } from "path";
import { pathToFileURL } from "url";

export type UiClassification = "react-aria" | "legacy-exempt" | "non-visual";
export type FeaturePrototypeStatus = "required" | "approved" | "not-required";

export interface DesignSystemSpecMetadata {
	designSystem?: {
		repository?: string;
		versionOrTag?: string;
		commit?: string;
	};
	featurePrototype?: {
		repository?: string;
		path?: string;
		commit?: string;
		status?: string;
		exceptionReason?: string;
	};
	uiClassification?: string;
}

export interface DesignSystemViolation {
	file: string;
	line: number;
	rule:
		| "prohibited-primitive-token"
		| "raw-color-literal"
		| "primereact-import"
		| "em-dash-copy"
		| "icon-only-button-missing-label"
		| "invalid-suppression"
		| "spec-metadata";
	message: string;
}

export interface CheckDesignSystemCliOptions {
	change?: string;
	verifySpec: boolean;
	baseRef: string;
	files: string[];
	help: boolean;
}

export const CLI_USAGE = `Usage: yarn check:design-system [options] [files...]

Gate 9a static design-system & token checker and pre-flight OpenSpec design.md validator.

Options:
  --change <name>     OpenSpec change name under openspec/changes/<name>/
  --verify-spec       Validate design.md UI classification, immutable SHAs, and prototype approval status
  --base <git-ref>    Git base ref for diff file discovery when no files are passed (default: dev)
  --files <a,b,c>     Comma-separated file paths to check
  -h, --help          Show this help message
`;

const PRESENTATION_PATH_PATTERNS = [
	/^app\/domains\/[^/]+\/presentation\//,
	/^app\/routes\//,
	/^app\/components\//,
	/^app\/design-system\//,
	/^app\/styles\//,
	/\.css$/,
];

const MOVING_REF_VALUES = new Set([
	"main",
	"master",
	"dev",
	"develop",
	"head",
	"latest",
	"tbd",
	"todo",
	"none",
	"n/a",
	"<release-tag>",
	"<commit-sha>",
	"<feature-path>",
]);

const COMMIT_SHA_RE = /^[0-9a-f]{7,40}$/i;
const SUPPRESSION_RE =
	/delta-design-ignore-next-line(?:\s+([a-z0-9-]+)\s*:\s*(.+?))?(?:\s*\*\/)?$/i;

export function isPresentationFile(filePath: string): boolean {
	const normalized = filePath.replace(/\\/g, "/").replace(/^\.\//, "");
	if (
		normalized.endsWith(".test.ts") ||
		normalized.endsWith(".test.tsx") ||
		normalized.endsWith(".spec.ts") ||
		normalized.endsWith(".spec.tsx") ||
		normalized.endsWith(".server.ts") ||
		normalized.endsWith(".server.tsx")
	) {
		return false;
	}
	return PRESENTATION_PATH_PATTERNS.some((re) => re.test(normalized));
}

export function isImmutableCommitSha(value: string | undefined): boolean {
	if (!value) return false;
	const trimmed = value.trim();
	if (MOVING_REF_VALUES.has(trimmed.toLowerCase())) return false;
	return COMMIT_SHA_RE.test(trimmed);
}

export function isImmutableVersionOrTag(value: string | undefined): boolean {
	if (!value) return false;
	const trimmed = value.trim();
	if (!trimmed || MOVING_REF_VALUES.has(trimmed.toLowerCase())) return false;
	if (trimmed.startsWith("<") && trimmed.endsWith(">")) return false;
	return true;
}

function stripYamlValue(raw: string): string {
	return raw
		.trim()
		.replace(/^["']|["']$/g, "")
		.trim();
}

/**
 * Extracts `design-system`, `feature-prototype`, and `ui-classification` from `design.md`.
 */
export function parseDesignMdMetadata(
	markdown: string,
): DesignSystemSpecMetadata {
	const metadata: DesignSystemSpecMetadata = {};
	const lines = markdown.split(/\r?\n/);
	let currentSection: "design-system" | "feature-prototype" | null = null;

	for (const rawLine of lines) {
		const trimmed = rawLine.trim();
		if (
			!trimmed ||
			trimmed.startsWith("```") ||
			trimmed.startsWith("#") ||
			trimmed.startsWith("//")
		) {
			if (trimmed.startsWith("```") || trimmed.startsWith("#")) {
				currentSection = null;
			}
			continue;
		}

		const indent = rawLine.match(/^\s*/)?.[0].length ?? 0;
		if (trimmed === "design-system:") {
			currentSection = "design-system";
			metadata.designSystem = metadata.designSystem ?? {};
			continue;
		}
		if (trimmed === "feature-prototype:") {
			currentSection = "feature-prototype";
			metadata.featurePrototype = metadata.featurePrototype ?? {};
			continue;
		}

		const kvMatch = trimmed.match(/^([a-z-]+)\s*:\s*(.*)$/i);
		if (!kvMatch) continue;
		const key = kvMatch[1].toLowerCase();
		const value = stripYamlValue(kvMatch[2]);

		if (key === "ui-classification") {
			currentSection = null;
			metadata.uiClassification = value;
			continue;
		}
		if (key === "exception-reason") {
			metadata.featurePrototype = metadata.featurePrototype ?? {};
			metadata.featurePrototype.exceptionReason = value;
			continue;
		}

		if (indent > 0 && currentSection === "design-system") {
			metadata.designSystem = metadata.designSystem ?? {};
			if (key === "repository") metadata.designSystem.repository = value;
			if (key === "version-or-tag") metadata.designSystem.versionOrTag = value;
			if (key === "commit") metadata.designSystem.commit = value;
		} else if (indent > 0 && currentSection === "feature-prototype") {
			metadata.featurePrototype = metadata.featurePrototype ?? {};
			if (key === "repository") metadata.featurePrototype.repository = value;
			if (key === "path") metadata.featurePrototype.path = value;
			if (key === "commit") metadata.featurePrototype.commit = value;
			if (key === "status") metadata.featurePrototype.status = value;
			if (key === "exception-reason") {
				metadata.featurePrototype.exceptionReason = value;
			}
		}
	}

	return metadata;
}

export function validateDesignMdSpec(
	markdown: string,
	filePath = "design.md",
): DesignSystemViolation[] {
	const violations: DesignSystemViolation[] = [];
	const meta = parseDesignMdMetadata(markdown);

	const validClassifications: UiClassification[] = [
		"react-aria",
		"legacy-exempt",
		"non-visual",
	];
	if (
		!meta.uiClassification ||
		!validClassifications.includes(meta.uiClassification as UiClassification)
	) {
		violations.push({
			file: filePath,
			line: 1,
			rule: "spec-metadata",
			message: `Missing or invalid ui-classification "${meta.uiClassification ?? ""}". Expected one of: react-aria | legacy-exempt | non-visual.`,
		});
		return violations;
	}

	const classification = meta.uiClassification as UiClassification;
	if (classification === "non-visual") {
		if (
			meta.featurePrototype?.status &&
			meta.featurePrototype.status !== "not-required"
		) {
			violations.push({
				file: filePath,
				line: 1,
				rule: "spec-metadata",
				message:
					'non-visual change should set feature-prototype.status to "not-required" (or omit feature-prototype).',
			});
		}
		return violations;
	}

	// For react-aria and legacy-exempt, verify design-system and feature-prototype metadata
	const ds = meta.designSystem;
	if (!ds) {
		violations.push({
			file: filePath,
			line: 1,
			rule: "spec-metadata",
			message: "Missing design-system block in design.md for UI change.",
		});
	} else {
		if (ds.repository !== "https://github.com/unisdr/delta-design") {
			violations.push({
				file: filePath,
				line: 1,
				rule: "spec-metadata",
				message:
					'design-system.repository must be "https://github.com/unisdr/delta-design".',
			});
		}
		if (!isImmutableVersionOrTag(ds.versionOrTag)) {
			violations.push({
				file: filePath,
				line: 1,
				rule: "spec-metadata",
				message: `design-system.version-or-tag "${ds.versionOrTag ?? ""}" must be an immutable release tag (not a moving branch or placeholder).`,
			});
		}
		if (!isImmutableCommitSha(ds.commit)) {
			violations.push({
				file: filePath,
				line: 1,
				rule: "spec-metadata",
				message: `design-system.commit "${ds.commit ?? ""}" must be an immutable commit SHA (7-40 hex chars).`,
			});
		}
	}

	const fp = meta.featurePrototype;
	if (!fp || !fp.status) {
		violations.push({
			file: filePath,
			line: 1,
			rule: "spec-metadata",
			message:
				"Missing feature-prototype block or feature-prototype.status in design.md for UI change.",
		});
		return violations;
	}

	if (fp.status === "required") {
		violations.push({
			file: filePath,
			line: 1,
			rule: "spec-metadata",
			message:
				'feature-prototype.status is still "required". Human prototype approval (status: approved) is mandatory before /opsx:apply.',
		});
	} else if (fp.status === "approved") {
		if (
			fp.repository !== "https://github.com/unisdr/delta-feature-prototypes"
		) {
			violations.push({
				file: filePath,
				line: 1,
				rule: "spec-metadata",
				message:
					'feature-prototype.repository must be "https://github.com/unisdr/delta-feature-prototypes".',
			});
		}
		if (!isImmutableVersionOrTag(fp.path)) {
			violations.push({
				file: filePath,
				line: 1,
				rule: "spec-metadata",
				message:
					"feature-prototype.path must record the concrete prototype path in unisdr/delta-feature-prototypes.",
			});
		}
		if (!isImmutableCommitSha(fp.commit)) {
			violations.push({
				file: filePath,
				line: 1,
				rule: "spec-metadata",
				message: `feature-prototype.commit "${fp.commit ?? ""}" must be an immutable commit SHA (7-40 hex chars).`,
			});
		}
	} else if (fp.status === "not-required") {
		const reason = fp.exceptionReason ?? "";
		if (
			!reason ||
			reason.startsWith("<") ||
			MOVING_REF_VALUES.has(reason.toLowerCase())
		) {
			violations.push({
				file: filePath,
				line: 1,
				rule: "spec-metadata",
				message:
					'feature-prototype.exception-reason is required when status is "not-required".',
			});
		}
	} else {
		violations.push({
			file: filePath,
			line: 1,
			rule: "spec-metadata",
			message: `Invalid feature-prototype.status "${fp.status}". Expected: required | approved | not-required.`,
		});
	}

	return violations;
}

const RAW_HEX_RE = /#[0-9a-fA-F]{3,8}\b/;
const RAW_FUNC_COLOR_RE = /\b(?:rgb|rgba|hsl|hsla)\s*\(/i;
const PRIMITIVE_TOKEN_RE = /var\(\s*--color-[a-z0-9-]+\s*\)/i;
const PRIMEREACT_IMPORT_RE =
	/\bfrom\s+["'](?:primereact|primeicons)(?:\/[^"']*)?["']|\bimport\s+["'](?:primereact|primeicons)(?:\/[^"']*)?["']/;

function getSuppressionFromPreviousLine(
	lines: string[],
	lineIndex: number,
): string | null {
	if (lineIndex === 0) return null;
	const prev = lines[lineIndex - 1].trim();
	if (!prev.includes("delta-design-ignore-next-line")) return null;

	const match = prev.match(SUPPRESSION_RE);
	const rule = match?.[1]?.trim();
	const reason = match?.[2]?.trim();
	if (!rule || !reason) {
		return null;
	}
	return rule.toLowerCase();
}

function isCommentLine(trimmedLine: string): boolean {
	return (
		trimmedLine.startsWith("//") ||
		trimmedLine.startsWith("/*") ||
		trimmedLine.startsWith("*")
	);
}

/**
 * Scans a presentation/style file for DELTA Design System violations.
 */
export function scanFileContent(
	filePath: string,
	content: string,
	classification: UiClassification = "react-aria",
): DesignSystemViolation[] {
	const violations: DesignSystemViolation[] = [];
	const normalizedPath = filePath.replace(/\\/g, "/");
	const lines = content.split(/\r?\n/);

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const trimmed = line.trim();
		const lineNum = i + 1;

		if (classification !== "react-aria") {
			continue;
		}

		// Validate any standalone suppression comment immediately
		if (trimmed.includes("delta-design-ignore-next-line")) {
			const match = trimmed.match(SUPPRESSION_RE);
			if (!match?.[1]?.trim() || !match?.[2]?.trim()) {
				violations.push({
					file: normalizedPath,
					line: lineNum,
					rule: "invalid-suppression",
					message:
						'delta-design-ignore-next-line must specify "<rule>: <reason>".',
				});
			}
			continue;
		}

		const suppressedRule = getSuppressionFromPreviousLine(lines, i);

		if (
			PRIMEREACT_IMPORT_RE.test(line) &&
			suppressedRule !== "primereact-import"
		) {
			violations.push({
				file: normalizedPath,
				line: lineNum,
				rule: "primereact-import",
				message:
					"PrimeReact / PrimeIcons imports are prohibited in react-aria classified files.",
			});
		}

		if (isCommentLine(trimmed)) {
			continue;
		}

		if (
			PRIMITIVE_TOKEN_RE.test(line) &&
			suppressedRule !== "prohibited-primitive-token"
		) {
			violations.push({
				file: normalizedPath,
				line: lineNum,
				rule: "prohibited-primitive-token",
				message:
					"Prohibited primitive --color-* token in feature/component code; use semantic tokens from tokens.css (e.g. var(--fg), var(--accent)).",
			});
		}

		if (
			(RAW_HEX_RE.test(line) || RAW_FUNC_COLOR_RE.test(line)) &&
			suppressedRule !== "raw-color-literal"
		) {
			violations.push({
				file: normalizedPath,
				line: lineNum,
				rule: "raw-color-literal",
				message:
					"Unapproved raw colour literal; use a semantic CSS token from unisdr/delta-design (tokens.css).",
			});
		}

		if (line.includes("\u2014") && suppressedRule !== "em-dash-copy") {
			violations.push({
				file: normalizedPath,
				line: lineNum,
				rule: "em-dash-copy",
				message:
					"Prohibited em dash (—) in presentation file; DELTA content guidance requires hyphens or standard punctuation.",
			});
		}
	}

	if (
		classification === "react-aria" &&
		(normalizedPath.endsWith(".tsx") || normalizedPath.endsWith(".jsx"))
	) {
		const buttonRegex =
			/<(Button|button)\b([^>]*)\/?>([\s\S]*?)<\/\1>|<(Button|button)\b([^>]*)\/>/g;
		let match: RegExpExecArray | null;
		while ((match = buttonRegex.exec(content)) !== null) {
			const attrs = (match[2] ?? match[5] ?? "").trim();
			const inner = (match[3] ?? "").trim();
			const beforeIdx = content.slice(0, match.index).split(/\r?\n/).length;
			const suppressedRule = getSuppressionFromPreviousLine(
				lines,
				beforeIdx - 1,
			);
			if (suppressedRule === "icon-only-button-missing-label") continue;

			const hasLabelAttr = /\b(?:aria-label|aria-labelledby)\s*=/.test(attrs);
			const isIconOnly =
				inner.length > 0 &&
				/^<(?:[A-Z][A-Za-z0-9]*Icon|svg|[A-Z][A-Za-z0-9]*)\b[^>]*\/?>(?:<\/[A-Za-z0-9]+>)?$/.test(
					inner,
				);
			if (isIconOnly && !hasLabelAttr) {
				violations.push({
					file: normalizedPath,
					line: beforeIdx,
					rule: "icon-only-button-missing-label",
					message:
						"Icon-only button is missing an explicit accessible name (aria-label or aria-labelledby).",
				});
			}
		}
	}

	return violations;
}

export function parseCheckDesignSystemArgs(
	argv: string[],
): CheckDesignSystemCliOptions {
	let change: string | undefined;
	let verifySpec = false;
	let baseRef = "dev";
	const files: string[] = [];

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--help" || arg === "-h") {
			return { verifySpec: false, baseRef, files: [], help: true };
		}
		if (arg === "--verify-spec") {
			verifySpec = true;
		} else if (arg === "--change") {
			const val = argv[++i];
			if (!val || val.startsWith("-")) {
				throw new Error("Missing value for --change");
			}
			change = val;
		} else if (arg === "--base") {
			const val = argv[++i];
			if (!val || val.startsWith("-")) {
				throw new Error("Missing value for --base");
			}
			baseRef = val;
		} else if (arg === "--files") {
			const val = argv[++i];
			if (!val) {
				throw new Error("Missing value for --files");
			}
			files.push(
				...val
					.split(",")
					.map((s) => s.trim())
					.filter(Boolean),
			);
		} else if (arg.startsWith("-")) {
			throw new Error(`Unknown option: ${arg}`);
		} else {
			files.push(arg);
		}
	}

	return { change, verifySpec, baseRef, files, help: false };
}

function discoverChangedFiles(baseRef: string, cwd: string): string[] {
	try {
		const out = execFileSync(
			"git",
			["diff", "--name-only", "--diff-filter=ACMR", `${baseRef}...HEAD`],
			{ cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
		);
		const committed = out
			.split(/\r?\n/)
			.map((s) => s.trim())
			.filter(Boolean);
		const workingOut = execFileSync(
			"git",
			["diff", "--name-only", "--diff-filter=ACMR", "HEAD"],
			{ cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
		);
		const working = workingOut
			.split(/\r?\n/)
			.map((s) => s.trim())
			.filter(Boolean);
		return Array.from(new Set([...committed, ...working]));
	} catch {
		return [];
	}
}

export function runCheckDesignSystem(
	options: CheckDesignSystemCliOptions,
	cwd = process.cwd(),
): { passed: boolean; violations: DesignSystemViolation[] } {
	const violations: DesignSystemViolation[] = [];
	let classification: UiClassification = "react-aria";

	if (options.change) {
		const designMdPath = resolve(
			cwd,
			"openspec",
			"changes",
			options.change,
			"design.md",
		);
		const relPath = relative(cwd, designMdPath).replace(/\\/g, "/");
		if (!existsSync(designMdPath)) {
			violations.push({
				file: relPath,
				line: 1,
				rule: "spec-metadata",
				message: `design.md not found at ${relPath}.`,
			});
			return { passed: false, violations };
		}
		const mdContent = readFileSync(designMdPath, "utf8");
		const meta = parseDesignMdMetadata(mdContent);
		if (
			meta.uiClassification === "react-aria" ||
			meta.uiClassification === "legacy-exempt" ||
			meta.uiClassification === "non-visual"
		) {
			classification = meta.uiClassification;
		}
		if (options.verifySpec) {
			violations.push(...validateDesignMdSpec(mdContent, relPath));
		}
	} else if (options.verifySpec) {
		throw new Error("--verify-spec requires --change <name>");
	}

	const candidateFiles =
		options.files.length > 0
			? options.files
			: discoverChangedFiles(options.baseRef, cwd);
	const presentationFiles = candidateFiles.filter(isPresentationFile);

	if (classification === "non-visual" && presentationFiles.length > 0) {
		violations.push({
			file: options.change
				? `openspec/changes/${options.change}/design.md`
				: presentationFiles[0],
			line: 1,
			rule: "spec-metadata",
			message: `Change is classified as non-visual but modifies presentation file(s): ${presentationFiles.join(", ")}`,
		});
		return { passed: false, violations };
	}

	for (const relOrAbs of presentationFiles) {
		const absPath = resolve(cwd, relOrAbs);
		if (!existsSync(absPath)) continue;
		const relPath = relative(cwd, absPath).replace(/\\/g, "/");
		// Skip read-only synced design token definitions
		if (relPath === "_docs/design/tokens.css") continue;
		const content = readFileSync(absPath, "utf8");
		violations.push(...scanFileContent(relPath, content, classification));
	}

	return {
		passed: violations.length === 0,
		violations,
	};
}

function main(): void {
	let options: CheckDesignSystemCliOptions;
	try {
		options = parseCheckDesignSystemArgs(process.argv.slice(2));
	} catch (err) {
		console.error(err instanceof Error ? err.message : String(err));
		console.error("\n" + CLI_USAGE);
		process.exit(1);
	}

	if (options.help) {
		console.log(CLI_USAGE);
		process.exit(0);
	}

	try {
		const result = runCheckDesignSystem(options);
		if (result.passed) {
			console.log("PASS: Gate 9a design-system and spec verification passed.");
			process.exit(0);
		}
		console.error(
			`FAIL: ${result.violations.length} design-system violation(s) found:\n`,
		);
		for (const v of result.violations) {
			console.error(`${v.file}:${v.line} [${v.rule}] ${v.message}`);
		}
		process.exit(1);
	} catch (err) {
		console.error(err instanceof Error ? err.message : String(err));
		process.exit(1);
	}
}

const isDirectRun =
	Boolean(process.argv[1]) &&
	import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isDirectRun) {
	main();
}
