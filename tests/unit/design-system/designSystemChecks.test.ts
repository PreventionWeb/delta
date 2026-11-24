import { EventEmitter } from "events";
import type { Page } from "@playwright/test";
import { describe, expect, it } from "vitest";
import {
	BREAKPOINTS,
	WCAG_22_AA_TAGS,
	attachErrorCollector,
	formatAxeViolations,
	resolveAuditScope,
} from "../../e2e/helpers/designSystemChecks";
import { parseDesignCheckArgs } from "../../../scripts/check-design-a11y";

describe("designSystemChecks constants and helpers", () => {
	it("includes all WCAG 2.0, 2.1, and 2.2 A/AA tags", () => {
		expect(WCAG_22_AA_TAGS).toEqual([
			"wcag2a",
			"wcag2aa",
			"wcag21a",
			"wcag21aa",
			"wcag22aa",
		]);
	});

	it("defines mobile, tablet, and desktop breakpoints matching DESIGN.md", () => {
		expect(BREAKPOINTS.mobile).toEqual({
			name: "mobile",
			width: 375,
			height: 812,
		});
		expect(BREAKPOINTS.tablet).toEqual({
			name: "tablet",
			width: 768,
			height: 1024,
		});
		expect(BREAKPOINTS.desktop).toEqual({
			name: "desktop",
			width: 1280,
			height: 900,
		});
	});

	it("resolves audit scope to main by default when main exists", () => {
		expect(resolveAuditScope({ hasMain: true })).toBe("main");
	});

	it("falls back to document scope when fullPage is true or no main landmark exists", () => {
		expect(resolveAuditScope({ hasMain: true, fullPage: true })).toBeNull();
		expect(resolveAuditScope({ hasMain: false })).toBeNull();
		expect(resolveAuditScope({ hasMain: false, scope: "main" })).toBeNull();
	});

	it("honors an explicit scope selector over the default main landmark", () => {
		expect(resolveAuditScope({ hasMain: true, scope: "[role='dialog']" })).toBe(
			"[role='dialog']",
		);
	});

	it("formats axe violations with singular/plural node counts, fallback impact, and HTML snippet", () => {
		const summary = formatAxeViolations(
			[
				{
					id: "button-name",
					impact: "critical",
					nodes: [
						{
							html: "<button class='icon-btn'><svg></svg></button>",
							failureSummary: "Element does not have inner text",
						},
					],
				},
				{
					id: "color-contrast",
					impact: null,
					nodes: [{ html: "<p>First</p>" }, { html: "<p>Second</p>" }],
				},
			],
			"desktop (1280x900)",
		);

		expect(summary).toContain("desktop (1280x900)");
		expect(summary).toContain("[critical] button-name (1 node)");
		expect(summary).toContain("<button class='icon-btn'>");
		expect(summary).toContain("[unknown] color-contrast (2 nodes)");
	});

	it("collects pageerror and console.error, ignores console warnings, and detaches cleanly", () => {
		const emitter = new EventEmitter();
		// EventEmitter satisfies Page's on/off listener surface needed by attachErrorCollector
		const collector = attachErrorCollector(emitter as unknown as Page);

		emitter.emit("console", { type: () => "warning", text: () => "ignored" });
		expect(() => collector.assertZeroErrors("fixture")).not.toThrow();

		emitter.emit("pageerror", new Error("Uncaught boom"));
		emitter.emit("console", {
			type: () => "error",
			text: () => "Hydration mismatch",
		});
		expect(collector.errors).toEqual([
			"pageerror: Uncaught boom",
			"console.error: Hydration mismatch",
		]);
		expect(() => collector.assertZeroErrors("fixture")).toThrow(
			/Runtime errors detected on fixture/,
		);

		collector.detach();
		emitter.emit("pageerror", new Error("After detach"));
		expect(collector.errors).toHaveLength(2);
	});
});

describe("parseDesignCheckArgs", () => {
	it("defaults scope to main and audits mobile, tablet, and desktop viewports", () => {
		const opts = parseDesignCheckArgs(["--url", "http://localhost:3000/en"]);

		expect(opts.url).toBe("http://localhost:3000/en");
		expect(opts.scope).toBe("main");
		expect(opts.fullPage).toBe(false);
		expect(opts.help).toBe(false);
		expect(opts.viewports.map((v) => v.name)).toEqual([
			"mobile",
			"tablet",
			"desktop",
		]);
	});

	it("supports --full-page, --scope, --screenshots, --viewports, and login credentials (including dash-prefixed passwords)", () => {
		const opts = parseDesignCheckArgs([
			"--url",
			"http://localhost:3000/en/hazardous-event",
			"--scope",
			"[role='dialog']",
			"--full-page",
			"--screenshots",
			"/tmp/gate9",
			"--viewports",
			"mobile,desktop",
			"--login-email",
			"admin@example.org",
			"--login-password",
			"-dash-secret!",
		]);

		expect(opts.scope).toBe("[role='dialog']");
		expect(opts.fullPage).toBe(true);
		expect(opts.screenshotsDir).toBe("/tmp/gate9");
		expect(opts.viewports.map((v) => v.name)).toEqual(["mobile", "desktop"]);
		expect(opts.loginEmail).toBe("admin@example.org");
		expect(opts.loginPassword).toBe("-dash-secret!");
	});

	it("returns help: true without requiring --url when --help is passed", () => {
		const opts = parseDesignCheckArgs(["--help"]);
		expect(opts.help).toBe(true);
	});

	it("throws when --url is missing, malformed, or uses an unsupported protocol", () => {
		expect(() => parseDesignCheckArgs([])).toThrow(/--url/);
		expect(() => parseDesignCheckArgs(["--url"])).toThrow(/Missing value/);
		expect(() => parseDesignCheckArgs(["--url", "not-a-url"])).toThrow(/URL/i);
		expect(() =>
			parseDesignCheckArgs(["--url", "ftp://example.org/file"]),
		).toThrow(/Unsupported URL protocol/);
	});

	it("throws on unknown flags, empty viewports, or unknown viewport names", () => {
		expect(() =>
			parseDesignCheckArgs(["--url", "http://localhost:3000/en", "--bogus"]),
		).toThrow(/Unknown argument/);
		expect(() =>
			parseDesignCheckArgs([
				"--url",
				"http://localhost:3000/en",
				"--viewports",
				",",
			]),
		).toThrow(/At least one viewport/);
		expect(() =>
			parseDesignCheckArgs([
				"--url",
				"http://localhost:3000/en",
				"--viewports",
				"ultrawide",
			]),
		).toThrow(/viewport/i);
	});

	it("accepts --executable-path for preinstalled Chromium binaries", () => {
		const opts = parseDesignCheckArgs([
			"--url",
			"file:///tmp/fixture.html",
			"--executable-path",
			"/usr/bin/chromium",
		]);
		expect(opts.executablePath).toBe("/usr/bin/chromium");
	});

	it("throws when login flags are unpaired or combined with file:// URLs", () => {
		expect(() =>
			parseDesignCheckArgs([
				"--url",
				"http://localhost:3000/en",
				"--login-email",
				"admin@example.org",
			]),
		).toThrow(/must be provided together/);
		expect(() =>
			parseDesignCheckArgs([
				"--url",
				"file:///tmp/fixture.html",
				"--login-email",
				"admin@example.org",
				"--login-password",
				"secret",
			]),
		).toThrow(/file:\/\//);
	});
});
