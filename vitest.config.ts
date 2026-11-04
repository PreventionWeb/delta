// vitest.config.ts
import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { mergeConfig } from "vite";
import viteConfig from "./vite.config";

export default mergeConfig(
	viteConfig,
	defineConfig({
		test: {
			projects: [
				{
					// Main/node tier -- inherits this file's own resolved config (reactRouter(),
					// aliases, etc. via the mergeConfig(viteConfig, ...) wrapper above).
					extends: true,
					test: {
						name: "node",
						setupFiles: "./tests/integration/db/setup.ts",
						environment: "node",
						globals: true,
						include: [
							"tests/unit/**/*.test.{ts,tsx}",
							"tests/integration/**/*.test.{ts,tsx}",
							"app/routes/**/*.test.{ts,tsx}",
							// Pure unit tests co-located with domain entities and shared utilities (no DB dependency)
							"app/domains/**/*.test.{ts,tsx}",
							"app/shared/**/*.test.{ts,tsx}",
						],
						exclude: [
							"tests/e2e/**",
							"**/*.spec.{ts,tsx}",
							"**/node_modules/**",
							"**/build/**",
							"**/dist/**",
							"**/__tests__/**",
							"app/entry.client.tsx",
							"app/entry.server.tsx",
							// Filename convention, not an enumerated list (see the "dom" project below)
							// -- any test needing jsdom names itself *.dom.test.{ts,tsx} and is excluded
							// from this tier automatically.
							"**/*.dom.test.{ts,tsx}",
						],
					},
				},
				{
					// jsdom tier -- standalone, NOT extending the root config: a plain
					// @vitejs/plugin-react instead of the root's reactRouter() plugin, which under
					// jsdom rejects any `.server.ts` import and requires a dev-server "preamble"
					// these isolated-component renders never get (same reasoning the former,
					// now-folded-in separate dom config carried -- see design.md's Decision 12 addendum).
					plugins: [react()],
					resolve: {
						alias: {
							"~": path.resolve(__dirname, "app"),
						},
					},
					test: {
						name: "dom",
						environment: "jsdom",
						globals: true,
						// Single glob, not an enumerated file list -- any new test needing jsdom
						// opts in just by naming itself *.dom.test.{ts,tsx}.
						include: ["**/*.dom.test.{ts,tsx}"],
						exclude: [
							"tests/e2e/**",
							"**/*.spec.{ts,tsx}",
							"**/node_modules/**",
							"**/build/**",
							"**/dist/**",
							"**/__tests__/**",
						],
					},
				},
			],

			coverage: {
				provider: "v8",
				include: ["app/**/*.{ts,tsx}"],

				exclude: [
					"**/*.test.{ts,tsx}",
					"**/*.spec.{ts,tsx}",
					"**/__tests__/**",
					"**/node_modules/**",
					"**/build/**",
					"**/dist/**",
					"app/entry.client.tsx",
					"app/entry.server.tsx",
				],

				reporter: ["text", "html", "lcov"],

				// Legacy code is unthresholded; new Clean Architecture code is held to a real bar.
				thresholds: {
					"app/domains/**/*.{ts,tsx}": {
						lines: 95,
						functions: 95,
						statements: 95,
						branches: 90,
					},
				},
			},
		},
	}),
);
