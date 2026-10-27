import { describe, expect, it } from "vitest";
import { readdir, readFile } from "fs/promises";
import { join } from "path";

const COMPONENTS_DIR = join(
	process.cwd(),
	"app",
	"design-system",
	"components",
);

async function componentFiles(): Promise<string[]> {
	const entries = await readdir(COMPONENTS_DIR);
	return entries.filter(
		(name) => name.endsWith(".tsx") || name.endsWith(".ts"),
	);
}

// design-system-components spec: "Components ship with no PrimeReact dependency" and "Components
// carry no domain-specific knowledge" -- enforced here across every file in the folder at once so
// a new primitive added later is covered automatically, not just the five this intent adds.
describe("app/design-system/components — import constraints", () => {
	it("no file imports from primereact", async () => {
		const files = await componentFiles();

		for (const file of files) {
			const source = await readFile(join(COMPONENTS_DIR, file), "utf-8");
			expect(source, `${file} must not import from primereact`).not.toMatch(
				/from ["']primereact/,
			);
		}
	});

	it("no file imports from any app/domains/* path", async () => {
		const files = await componentFiles();

		for (const file of files) {
			const source = await readFile(join(COMPONENTS_DIR, file), "utf-8");
			expect(source, `${file} must not import from app/domains/*`).not.toMatch(
				/from ["'](~\/domains|.*app\/domains)/,
			);
		}
	});
});
