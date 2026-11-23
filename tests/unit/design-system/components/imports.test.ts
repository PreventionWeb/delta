import { beforeAll, describe, expect, it } from "vitest";
import { readdir, readFile } from "fs/promises";
import { join } from "path";

const COMPONENTS_DIR = join(
	process.cwd(),
	"app",
	"design-system",
	"components",
);

const FORBIDDEN_PRIMEREACT_IMPORT =
	/(?:from|import)\s+["']primereact|import\(\s*["']primereact/;
const FORBIDDEN_DOMAIN_IMPORT =
	/(?:from|import)\s+["'](~\/domains|.*app\/domains)|import\(\s*["'](~\/domains|.*app\/domains)/;
const FORBIDDEN_ICON_IMPORT =
	/(?:from|import)\s+["'](react-icons|primeicons|@heroicons|@fortawesome)|import\(\s*["'](react-icons|primeicons|@heroicons|@fortawesome)/;
const HARDCODED_HEX_COLOR =
	/#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/;
const TOKENS_CSS_PRIMITIVE =
	/--color-(neutral|warm|accent|green|amber|red)-\d+/;

interface ComponentSource {
	file: string;
	stripped: string;
}

/** Strips line/block comments so static checks inspect code/JSX, not developer notes. */
export function stripComments(source: string): string {
	return source
		.replace(/\/\*[\s\S]*?\*\//g, "")
		.replace(/(^|[^:\\])\/\/.*$/gm, "$1");
}

export function findComponentViolations(source: string): string[] {
	const stripped = stripComments(source);
	const violations: string[] = [];

	if (FORBIDDEN_PRIMEREACT_IMPORT.test(stripped)) {
		violations.push("must not import from primereact");
	}
	if (FORBIDDEN_DOMAIN_IMPORT.test(stripped)) {
		violations.push("must not import from app/domains/*");
	}
	if (FORBIDDEN_ICON_IMPORT.test(stripped)) {
		violations.push("must use lucide-react only for icons");
	}
	if (HARDCODED_HEX_COLOR.test(stripped)) {
		violations.push("must not contain hardcoded hex colors");
	}
	if (TOKENS_CSS_PRIMITIVE.test(stripped)) {
		violations.push("must use semantic tokens, not --color-* primitives");
	}
	if (stripped.includes("\u2014")) {
		violations.push("must not use em-dashes in UI copy");
	}

	return violations;
}

// design-system-components spec: static invariants enforced across every file in
// app/design-system/components/ so every new primitive is covered automatically.
describe("app/design-system/components — static constraints", () => {
	let sources: ComponentSource[] = [];

	beforeAll(async () => {
		const entries = await readdir(COMPONENTS_DIR, { recursive: true });
		const files = entries.filter(
			(name) => name.endsWith(".tsx") || name.endsWith(".ts"),
		);
		expect(files.length).toBeGreaterThan(0);

		sources = await Promise.all(
			files.map(async (file) => {
				const raw = await readFile(join(COMPONENTS_DIR, file), "utf-8");
				return { file, stripped: stripComments(raw) };
			}),
		);
	});

	it("no file imports from primereact", () => {
		for (const { file, stripped } of sources) {
			expect(stripped, `${file} must not import from primereact`).not.toMatch(
				FORBIDDEN_PRIMEREACT_IMPORT,
			);
		}
	});

	it("no file imports from any app/domains/* path", () => {
		for (const { file, stripped } of sources) {
			expect(
				stripped,
				`${file} must not import from app/domains/*`,
			).not.toMatch(FORBIDDEN_DOMAIN_IMPORT);
		}
	});

	it("no file imports non-Lucide icon libraries", () => {
		for (const { file, stripped } of sources) {
			expect(stripped, `${file} must use lucide-react only`).not.toMatch(
				FORBIDDEN_ICON_IMPORT,
			);
		}
	});

	it("no file contains hardcoded hex colors or tokens.css primitive variables", () => {
		for (const { file, stripped } of sources) {
			expect(stripped, `${file} must not hardcode hex colors`).not.toMatch(
				HARDCODED_HEX_COLOR,
			);
			expect(
				stripped,
				`${file} must not use tokens.css --color-* primitives`,
			).not.toMatch(TOKENS_CSS_PRIMITIVE);
		}
	});

	it("no file contains em-dashes in visible UI copy", () => {
		for (const { file, stripped } of sources) {
			expect(
				stripped,
				`${file} must not contain em-dashes in UI copy`,
			).not.toContain("\u2014");
		}
	});
});

describe("findComponentViolations", () => {
	it("detects forbidden icon imports, hex colors, primitive tokens, and em-dashes", () => {
		const badSource = `
			import "primeicons/primeicons.css";
			// Comments may explain why — that is fine
			export const Bad = () => (
				<div style={{ color: "#2D6FA3", background: "var(--color-neutral-900)" }}>
					Hello \u2014 world
				</div>
			);
		`;
		const violations = findComponentViolations(badSource);
		expect(violations).toEqual([
			"must use lucide-react only for icons",
			"must not contain hardcoded hex colors",
			"must use semantic tokens, not --color-* primitives",
			"must not use em-dashes in UI copy",
		]);
	});

	it("allows semantic tokens, lucide-react, and comments with em-dashes", () => {
		const goodSource = `
			import { Trash2 } from "lucide-react";
			// Legacy parity note — comment em-dash is ignored
			export const Good = () => (
				<button style={{ color: "var(--fg)", borderColor: "var(--control-border)" }}>
					<Trash2 size={16} /> Delete
				</button>
			);
		`;
		expect(findComponentViolations(goodSource)).toEqual([]);
	});
});
