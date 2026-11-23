import { mkdir } from "fs/promises";
import { join } from "path";
import { pathToFileURL } from "url";
import { chromium, type Page } from "@playwright/test";
import {
	BREAKPOINTS,
	type ViewportSpec,
	assertFocusNotObscured,
	assertNoHorizontalOverflow,
	assertTargetSizesAndLabels,
	assertWcag22AA,
	attachErrorCollector,
	resolveAuditScope,
} from "../tests/e2e/helpers/designSystemChecks";

const LOGIN_REDIRECT_TIMEOUT_MS = 30_000;
const FOCUS_TAB_STEPS = 3;

export interface DesignCheckCliOptions {
	url: string;
	scope: string;
	fullPage: boolean;
	screenshotsDir?: string;
	executablePath?: string;
	loginEmail?: string;
	loginPassword?: string;
	viewports: ViewportSpec[];
	help: boolean;
}

export interface DesignCheckFailure {
	viewport: string;
	check: string;
	message: string;
}

export interface DesignCheckReport {
	passed: boolean;
	failures: DesignCheckFailure[];
}

export const CLI_USAGE = `Usage: yarn design:check --url <url> [options]

Audits a rendered DELTA route across mobile (375x812), tablet (768x1024), and
desktop (1280x900) viewports for WCAG 2.2 AA (axe-core), horizontal overflow,
WCAG 2.2 target size (>= 24px), button labels, focus obscuration, and console/page errors.

Options:
  --url <url>               Target URL to audit (http://, https://, or file://)
  --scope <selector>        CSS selector to scope axe & target checks (default: main)
  --full-page               Audit the entire document instead of scoping to <main>
  --screenshots <dir>       Directory to save mobile/tablet/desktop PNG screenshots
  --executable-path <path>  Optional Chromium binary path (falls back to PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH)
  --viewports <list>        Comma-separated subset of: mobile,tablet,desktop
  --login-email <email>     Optional email to sign in via /en/user/login first
  --login-password <pass>   Optional password paired with --login-email
  -h, --help                Show this help text
`;

function nextArg(
	argv: string[],
	idx: number,
	flag: string,
	allowDashPrefix = false,
): string {
	const value = argv[idx + 1];
	if (!value || (!allowDashPrefix && value.startsWith("-"))) {
		throw new Error(`Missing value for ${flag}`);
	}
	return value;
}

function parseViewportsArg(rawValue: string): Array<ViewportSpec["name"]> {
	const raw = rawValue
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
	const parsed: Array<ViewportSpec["name"]> = [];
	for (const name of raw) {
		if (!(name in BREAKPOINTS)) {
			throw new Error(
				`Unknown viewport "${name}". Expected one of: mobile, tablet, desktop`,
			);
		}
		parsed.push(name as ViewportSpec["name"]);
	}
	if (parsed.length === 0) {
		throw new Error("At least one viewport must be provided");
	}
	return parsed;
}

function validateDesignCheckOptions(params: {
	url: string;
	loginEmail?: string;
	loginPassword?: string;
}): void {
	if (!params.url) {
		throw new Error("Missing required --url argument");
	}
	let parsedUrl: URL;
	try {
		parsedUrl = new URL(params.url);
	} catch {
		throw new Error(`Invalid URL: ${params.url}`);
	}
	if (!["http:", "https:", "file:"].includes(parsedUrl.protocol)) {
		throw new Error(`Unsupported URL protocol: ${parsedUrl.protocol}`);
	}
	if (Boolean(params.loginEmail) !== Boolean(params.loginPassword)) {
		throw new Error(
			"--login-email and --login-password must be provided together",
		);
	}
	if (params.loginEmail && parsedUrl.protocol === "file:") {
		throw new Error("Login flags cannot be used with file:// URLs");
	}
}

export function parseDesignCheckArgs(argv: string[]): DesignCheckCliOptions {
	let url = "";
	let scope = "main";
	let fullPage = false;
	let screenshotsDir: string | undefined;
	let executablePath: string | undefined;
	let loginEmail: string | undefined;
	let loginPassword: string | undefined;
	let viewportNames: Array<ViewportSpec["name"]> = [
		"mobile",
		"tablet",
		"desktop",
	];

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--help" || arg === "-h") {
			return {
				url: "",
				scope,
				fullPage,
				viewports: viewportNames.map((name) => BREAKPOINTS[name]),
				help: true,
			};
		}
		if (arg === "--url") {
			url = nextArg(argv, i++, "--url");
		} else if (arg === "--scope") {
			scope = nextArg(argv, i++, "--scope");
		} else if (arg === "--full-page") {
			fullPage = true;
		} else if (arg === "--screenshots") {
			screenshotsDir = nextArg(argv, i++, "--screenshots");
		} else if (arg === "--executable-path") {
			executablePath = nextArg(argv, i++, "--executable-path");
		} else if (arg === "--login-email") {
			loginEmail = nextArg(argv, i++, "--login-email");
		} else if (arg === "--login-password") {
			loginPassword = nextArg(argv, i++, "--login-password", true);
		} else if (arg === "--viewports") {
			viewportNames = parseViewportsArg(nextArg(argv, i++, "--viewports"));
		} else {
			throw new Error(`Unknown argument: ${arg}`);
		}
	}

	validateDesignCheckOptions({ url, loginEmail, loginPassword });

	return {
		url,
		scope,
		fullPage,
		screenshotsDir,
		executablePath,
		loginEmail,
		loginPassword,
		viewports: viewportNames.map((name) => BREAKPOINTS[name]),
		help: false,
	};
}

async function runCheck(
	failures: DesignCheckFailure[],
	viewport: string,
	check: string,
	fn: () => Promise<void> | void,
): Promise<void> {
	try {
		await fn();
	} catch (err) {
		failures.push({
			viewport,
			check,
			message: err instanceof Error ? err.message : String(err),
		});
	}
}

async function performLogin(
	page: Page,
	targetUrl: string,
	email: string,
	password: string,
): Promise<void> {
	const loginUrl = new URL("/en/user/login", targetUrl).toString();
	await page.goto(loginUrl, { waitUntil: "networkidle" });
	await page.fill('input[name="email"]', email);
	await page.fill('input[name="password"]', password);
	await Promise.all([
		page.waitForURL((u) => !u.href.includes("/user/login"), {
			timeout: LOGIN_REDIRECT_TIMEOUT_MS,
		}),
		page.getByRole("button", { name: /sign in/i }).click(),
	]);
}

async function checkScopedFocusTraversal(
	page: Page,
	options: DesignCheckCliOptions,
	label: string,
): Promise<void> {
	const hasMain = (await page.locator("main").count()) > 0;
	const effectiveScope = resolveAuditScope({
		hasMain,
		scope: options.scope,
		fullPage: options.fullPage,
	});

	let startedInsideScope = false;
	if (effectiveScope) {
		const focusableInScope = page
			.locator(effectiveScope)
			.locator(
				'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
			)
			.first();
		if ((await focusableInScope.count()) > 0) {
			await focusableInScope.focus();
			await assertFocusNotObscured(page, `${label} focus #1`);
			startedInsideScope = true;
		}
	}

	const remainingTabs = startedInsideScope
		? FOCUS_TAB_STEPS - 1
		: FOCUS_TAB_STEPS;
	for (let step = 0; step < remainingTabs; step++) {
		await page.keyboard.press("Tab");
		const idx = startedInsideScope ? step + 2 : step + 1;
		await assertFocusNotObscured(page, `${label} tab #${idx}`);
	}
}

async function auditViewport(
	page: Page,
	vp: ViewportSpec,
	options: DesignCheckCliOptions,
	failures: DesignCheckFailure[],
): Promise<void> {
	const label = `${vp.name} (${vp.width}x${vp.height})`;
	await page.setViewportSize({ width: vp.width, height: vp.height });
	const collector = attachErrorCollector(page);

	try {
		const response = await page.goto(options.url, { waitUntil: "networkidle" });
		if (response && response.status() >= 400) {
			failures.push({
				viewport: label,
				check: "http-status",
				message: `Navigation to ${options.url} returned HTTP ${response.status()}`,
			});
			return;
		}

		if (options.screenshotsDir) {
			await page.screenshot({
				path: join(options.screenshotsDir, `${vp.name}.png`),
				fullPage: true,
			});
		}

		await runCheck(failures, label, "wcag22aa", () =>
			assertWcag22AA(page, {
				scope: options.scope,
				fullPage: options.fullPage,
				label,
			}),
		);
		await runCheck(failures, label, "horizontal-overflow", () =>
			assertNoHorizontalOverflow(page, label),
		);
		await runCheck(failures, label, "target-size-and-labels", () =>
			assertTargetSizesAndLabels(page, {
				scope: options.scope,
				fullPage: options.fullPage,
				label,
			}),
		);
		await runCheck(failures, label, "focus-not-obscured", () =>
			checkScopedFocusTraversal(page, options, label),
		);
		await runCheck(failures, label, "runtime-errors", () =>
			collector.assertZeroErrors(label),
		);
	} finally {
		collector.detach();
	}
}

export async function runDesignCheck(
	options: DesignCheckCliOptions,
): Promise<DesignCheckReport> {
	const failures: DesignCheckFailure[] = [];
	const executablePath =
		options.executablePath ?? process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
	const browser = await chromium.launch(
		executablePath ? { executablePath } : undefined,
	);

	try {
		const context = await browser.newContext();
		const page = await context.newPage();

		if (options.loginEmail && options.loginPassword) {
			await performLogin(
				page,
				options.url,
				options.loginEmail,
				options.loginPassword,
			);
		}

		if (options.screenshotsDir) {
			await mkdir(options.screenshotsDir, { recursive: true });
		}

		for (const vp of options.viewports) {
			await auditViewport(page, vp, options, failures);
		}
	} finally {
		await browser.close();
	}

	return {
		passed: failures.length === 0,
		failures,
	};
}

async function main(): Promise<void> {
	let options: DesignCheckCliOptions;
	try {
		options = parseDesignCheckArgs(process.argv.slice(2));
	} catch (err) {
		console.error(err instanceof Error ? err.message : String(err));
		console.error("\n" + CLI_USAGE);
		process.exit(1);
	}

	if (options.help) {
		console.log(CLI_USAGE);
		process.exit(0);
	}

	const scopeDesc = options.fullPage ? "full document" : options.scope;
	console.log(
		`Auditing ${options.url} (scope: ${scopeDesc}) across ${options.viewports.map((v) => v.name).join(", ")}...`,
	);

	const report = await runDesignCheck(options);
	if (report.passed) {
		console.log("PASS: all WCAG 2.2 AA and design-system checks passed.");
		process.exit(0);
	}

	console.error(`FAIL: ${report.failures.length} check(s) failed:\n`);
	for (const f of report.failures) {
		console.error(`[${f.viewport}] (${f.check})\n${f.message}\n`);
	}
	process.exit(1);
}

const isDirectRun =
	Boolean(process.argv[1]) &&
	import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
	main().catch((err) => {
		console.error(err);
		process.exit(1);
	});
}
