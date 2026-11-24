import { afterEach, describe, expect, it } from "vitest";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

export interface TokenSyncResult {
	skipped: boolean;
	missingImports: string[];
	missingInTheme: string[];
	missingFontFiles: string[];
	versionMismatch?: string;
}

const REQUIRED_SEMANTIC_TOKENS = [
	"--bg",
	"--surface",
	"--inset",
	"--overlay",
	"--border",
	"--border-subtle",
	"--border-strong",
	"--control-border",
	"--fg",
	"--fg-2",
	"--fg-3",
	"--fg-inverse",
	"--accent",
	"--accent-hover",
	"--accent-active",
	"--accent-disabled",
	"--accent-100",
	"--good",
	"--good-bg",
	"--good-border",
	"--warn",
	"--warn-bg",
	"--warn-border",
	"--crit",
	"--crit-hover",
	"--crit-bg",
	"--crit-border",
	"--info",
	"--info-bg",
	"--info-border",
	"--toast-bg",
] as const;

async function fileExists(path: string): Promise<boolean> {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

function stripCssComments(css: string): string {
	return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

function extractThemeBlockBody(css: string): string {
	const stripped = stripCssComments(css);
	const blocks: string[] = [];
	const themeRegex = /@theme\b[^{]*\{([\s\S]*?)\}/g;
	for (const match of stripped.matchAll(themeRegex)) {
		blocks.push(match[1]);
	}
	return blocks.join("\n");
}

function extractCssVersion(css: string): string | undefined {
	const headerComment = css.match(/\/\*[\s\S]*?\*\//)?.[0] ?? "";
	const match = headerComment.match(/v(\d+\.\d+\.\d+)/);
	return match?.[1];
}

function extractJsonVersion(json: Record<string, unknown>): string | undefined {
	const direct =
		json.version ??
		(json.$metadata as Record<string, unknown> | undefined)?.version;
	if (typeof direct === "string") {
		return direct.replace(/^v/, "");
	}
	const comment = typeof json.$comment === "string" ? json.$comment : "";
	const match = comment.match(/v(\d+\.\d+\.\d+)/);
	return match?.[1];
}

export async function validateTokenSync(
	repoRoot: string,
): Promise<TokenSyncResult> {
	const tokensCssPath = join(repoRoot, "_docs", "design", "tokens.css");
	const tokensJsonPath = join(repoRoot, "_docs", "design", "tokens.json");
	const allCssPath = join(repoRoot, "app", "styles", "all.css");
	const fontsCssPath = join(repoRoot, "app", "styles", "fonts.css");

	if (!(await fileExists(tokensCssPath))) {
		return {
			skipped: true,
			missingImports: [],
			missingInTheme: [],
			missingFontFiles: [],
		};
	}

	const [tokensCss, allCss] = await Promise.all([
		readFile(tokensCssPath, "utf-8"),
		readFile(allCssPath, "utf-8"),
	]);

	let versionMismatch: string | undefined;
	if (await fileExists(tokensJsonPath)) {
		const rawJson = await readFile(tokensJsonPath, "utf-8");
		const parsed = JSON.parse(rawJson) as Record<string, unknown>;
		const cssVersion = extractCssVersion(tokensCss);
		const jsonVersion = extractJsonVersion(parsed);
		if (cssVersion && jsonVersion && cssVersion !== jsonVersion) {
			versionMismatch = `tokens.css v${cssVersion} !== tokens.json v${jsonVersion}`;
		}
	}

	const allCssNoComments = stripCssComments(allCss);
	const missingImports: string[] = [];
	if (!allCssNoComments.includes("_docs/design/tokens.css")) {
		missingImports.push("_docs/design/tokens.css");
	}
	if (
		(await fileExists(fontsCssPath)) &&
		!allCssNoComments.includes("./fonts.css")
	) {
		missingImports.push("./fonts.css");
	}

	const tokensCssNoComments = stripCssComments(tokensCss);
	const themeBody = extractThemeBlockBody(allCss);
	const missingInTheme: string[] = [];
	for (const token of REQUIRED_SEMANTIC_TOKENS) {
		const definesToken = new RegExp(`(?:^|[\\s;{])${token}\\s*:`).test(
			tokensCssNoComments,
		);
		if (definesToken && !themeBody.includes(`var(${token})`)) {
			missingInTheme.push(token);
		}
	}

	const missingFontFiles: string[] = [];
	if (await fileExists(fontsCssPath)) {
		const fontsCss = stripCssComments(await readFile(fontsCssPath, "utf-8"));
		const urlRegex = /url\(["']?(\/[^"')]+)["']?\)/g;
		for (const match of fontsCss.matchAll(urlRegex)) {
			const relUrl = match[1];
			const diskPath = join(repoRoot, "public", relUrl.replace(/^\//, ""));
			if (!(await fileExists(diskPath))) {
				missingFontFiles.push(relUrl);
			}
		}
	}

	return {
		skipped: false,
		missingImports,
		missingInTheme,
		missingFontFiles,
		versionMismatch,
	};
}

describe("validateTokenSync", () => {
	const tempDirs: string[] = [];

	afterEach(async () => {
		await Promise.all(
			tempDirs
				.splice(0)
				.map((dir) => rm(dir, { recursive: true, force: true })),
		);
	});

	async function createTempRepo(): Promise<string> {
		const dir = await mkdtemp(join(tmpdir(), "delta-token-sync-"));
		tempDirs.push(dir);
		await mkdir(join(dir, "_docs", "design"), { recursive: true });
		await mkdir(join(dir, "app", "styles"), { recursive: true });
		await mkdir(join(dir, "public", "assets", "fonts", "inter"), {
			recursive: true,
		});
		return dir;
	}

	it("returns skipped: true when _docs/design/tokens.css is absent", async () => {
		const dir = await mkdtemp(join(tmpdir(), "delta-token-skip-"));
		tempDirs.push(dir);

		const result = await validateTokenSync(dir);
		expect(result.skipped).toBe(true);
		expect(result.missingInTheme).toEqual([]);
	});

	it("passes when tokens.css, tokens.json, all.css @theme, and self-hosted fonts are in sync", async () => {
		const dir = await createTempRepo();
		await writeFile(
			join(dir, "_docs", "design", "tokens.css"),
			"/* generated from tokens.json v0.7.2 */\n:root { --bg: #FAF9F5; --accent: #2D6FA3; }\n",
		);
		await writeFile(
			join(dir, "_docs", "design", "tokens.json"),
			JSON.stringify({ version: "0.7.2" }),
		);
		await writeFile(
			join(dir, "app", "styles", "all.css"),
			'@import "./fonts.css";\n@import "../../_docs/design/tokens.css";\n@theme { --color-bg: var(--bg); --color-accent: var(--accent); }\n',
		);
		await writeFile(
			join(dir, "app", "styles", "fonts.css"),
			'@font-face { font-family: "Inter"; src: url("/assets/fonts/inter/inter-latin-400.woff2") format("woff2"); }\n',
		);
		await writeFile(
			join(dir, "public", "assets", "fonts", "inter", "inter-latin-400.woff2"),
			"woff2",
		);

		const result = await validateTokenSync(dir);
		expect(result).toEqual({
			skipped: false,
			missingImports: [],
			missingInTheme: [],
			missingFontFiles: [],
			versionMismatch: undefined,
		});
	});

	it("reports missing @theme mappings, version mismatch, and missing font files", async () => {
		const dir = await createTempRepo();
		await writeFile(
			join(dir, "_docs", "design", "tokens.css"),
			"/* generated from tokens.json v0.7.2 */\n:root { --bg: #FAF9F5; --accent: #2D6FA3; }\n",
		);
		await writeFile(
			join(dir, "_docs", "design", "tokens.json"),
			JSON.stringify({ version: "0.8.0" }),
		);
		await writeFile(
			join(dir, "app", "styles", "all.css"),
			"@theme { --color-bg: var(--bg); }\n/* var(--accent) in comment only */\n.outside { color: var(--accent); }\n",
		);
		await writeFile(
			join(dir, "app", "styles", "fonts.css"),
			'@font-face { src: url("/fonts/missing.woff2") format("woff2"); }\n',
		);

		const result = await validateTokenSync(dir);
		expect(result.skipped).toBe(false);
		expect(result.missingImports).toEqual([
			"_docs/design/tokens.css",
			"./fonts.css",
		]);
		expect(result.missingInTheme).toEqual(["--accent"]);
		expect(result.missingFontFiles).toEqual(["/fonts/missing.woff2"]);
		expect(result.versionMismatch).toContain("0.7.2");
		expect(result.versionMismatch).toContain("0.8.0");
	});

	it("validates the repository workspace cleanly (passes or gracefully skips if tokens.css is not yet merged)", async () => {
		const result = await validateTokenSync(process.cwd());
		expect(result.missingImports).toEqual([]);
		expect(result.missingInTheme).toEqual([]);
		expect(result.missingFontFiles).toEqual([]);
		expect(result.versionMismatch).toBeUndefined();
	});
});
