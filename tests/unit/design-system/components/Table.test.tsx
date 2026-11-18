import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { Table } from "~/design-system/components/Table";
import { TableColumn } from "~/design-system/components/TableColumn";
import { TableRow } from "~/design-system/components/TableRow";
import { TableCell } from "~/design-system/components/TableCell";

function renderSampleTable() {
	return renderToString(
		<Table
			aria-label="Sample"
			header={
				<>
					<TableColumn id="name" isRowHeader>
						Name
					</TableColumn>
					<TableColumn id="actions" centered>
						Actions
					</TableColumn>
				</>
			}
		>
			<TableRow id="row-1">
				<TableCell>Row one</TableCell>
				<TableCell centered className="dts-table__actions">
					link
				</TableCell>
			</TableRow>
		</Table>,
	);
}

describe("Table", () => {
	it("renders a real <table> carrying the legacy dts-table class", () => {
		const html = renderSampleTable();

		expect(html).toContain("<table");
		expect(html).toMatch(/<table[^>]*class="[^"]*\bdts-table\b/);
	});

	// Pinned: React Aria's accessible-table always sets role="grid", which this wrapper can't
	// override -- a known divergence from legacy's implicit role="table" (see Table.tsx's comment).
	it("renders role=grid (React Aria's own accessible-table pattern, not role=table)", () => {
		const html = renderSampleTable();

		expect(html).toMatch(/<table[^>]*role="grid"/);
	});

	it("renders real <thead>/<tbody>/<th>/<td> elements, not <div>s", () => {
		const html = renderSampleTable();

		expect(html).toContain("<thead");
		expect(html).toContain("<tbody");
		expect(html).toContain("<th");
		expect(html).toContain("<td");
	});

	it("renders cell content for each row", () => {
		const html = renderSampleTable();

		expect(html).toContain("Row one");
	});
});

describe("TableColumn", () => {
	it("renders the dts-table__cell-centered class when centered is set", () => {
		const html = renderSampleTable();

		expect(html).toMatch(/<th[^>]*class="[^"]*dts-table__cell-centered/);
	});

	it("resolves its header-cell styling to the @theme tokens, not literal hardcoded hex", () => {
		const html = renderSampleTable();

		expect(html).toContain("var(--color-dts-table-header-bg)");
		expect(html).toContain("var(--color-dts-table-border)");
		expect(html).not.toMatch(/#f2f2f2/);
	});

	// design.md Decision 15, Fix 7: same mechanism, same values, as TableCell's own cozy padding.
	it("renders cozy padding via inline style when padding='cozy'", () => {
		const html = renderToString(
			<Table
				aria-label="Sample"
				header={
					<TableColumn id="a" padding="cozy">
						A
					</TableColumn>
				}
			>
				<TableRow id="row-1">
					<TableCell>content</TableCell>
				</TableRow>
			</Table>,
		);

		expect(html).toMatch(/<th[^>]*style="[^"]*padding:0\.5rem 0\.75rem/);
		expect(html).toMatch(/<th[^>]*style="[^"]*height:auto/);
	});
});

describe("TableCell", () => {
	it("carries a caller-supplied structural class alongside its own styling", () => {
		const html = renderSampleTable();

		expect(html).toMatch(/<td[^>]*class="[^"]*dts-table__actions/);
	});

	it("resolves its cell styling to the @theme tokens, not literal hardcoded hex", () => {
		const html = renderSampleTable();

		expect(html).toContain("var(--color-dts-table-border)");
		expect(html).toContain("var(--spacing-dts-cell-padding)");
	});

	// design.md Decision 15, Fix 7: inline style, since a className can't beat this app's own
	// unlayered .dts-table td rule.
	it("renders cozy padding via inline style when padding='cozy'", () => {
		const html = renderToString(
			<Table aria-label="Sample" header={<TableColumn id="a">A</TableColumn>}>
				<TableRow id="row-1">
					<TableCell padding="cozy">content</TableCell>
				</TableRow>
			</Table>,
		);

		expect(html).toMatch(/<td[^>]*style="[^"]*padding:0\.5rem 0\.75rem/);
		expect(html).toMatch(/<td[^>]*style="[^"]*height:auto/);
	});
});
