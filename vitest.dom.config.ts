import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/**
 * Separate config (mirrors vitest.integration-realdb.config.ts), with a plain @vitejs/plugin-react
 * instead of the main vite.config.ts's reactRouter() plugin: under jsdom, that plugin rejects any
 * `.server.ts` import (breaks the main config's shared setupFiles) and requires a dev-server
 * "preamble" these isolated-component renders never get. See design.md's Decision 12 addendum.
 */
export default defineConfig({
	plugins: [react()],
	resolve: {
		alias: {
			"~": path.resolve(__dirname, "app"),
		},
	},
	test: {
		environment: "jsdom",
		globals: true,

		// Explicit file list, not a directory glob -- Table.test.tsx/Link.test.tsx already live
		// under tests/unit/design-system/components/ and must stay on the renderToString/node tier
		// (vitest.config.ts), not move to jsdom.
		include: [
			"tests/unit/design-system/components/Checkbox.test.tsx",
			"tests/unit/design-system/components/Select.test.tsx",
			"tests/unit/design-system/components/DateRangePicker.test.tsx",
			"tests/unit/design-system/components/Combobox.test.tsx",
			"app/domains/hazardous-events/presentation/HazardousEventFilterBar.test.tsx",
		],

		exclude: [
			"tests/e2e/**",
			"**/*.spec.{ts,tsx}",
			"**/node_modules/**",
			"**/build/**",
			"**/dist/**",
			"**/__tests__/**",
		],
	},
});
