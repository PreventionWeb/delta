import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { TreeList, type TreeListNode } from "~/design-system/components";

interface SampleNode extends TreeListNode {
	levelLabel: string;
	children?: SampleNode[];
}

const SAMPLE_NODES: SampleNode[] = [
	{
		id: "root-1",
		name: "Social",
		levelLabel: "Type",
		children: [
			{
				id: "child-1",
				name: "Housing",
				levelLabel: "Sector",
				children: [
					{
						id: "leaf-1",
						name: "Urban housing",
						levelLabel: "Sub-sector",
					},
				],
			},
			{
				id: "child-2",
				name: "Education",
				levelLabel: "Sector",
			},
		],
	},
	{
		id: "root-2",
		name: "Productive",
		levelLabel: "Type",
	},
];

beforeAll(() => {
	if (!Element.prototype.scrollTo) {
		Element.prototype.scrollTo = vi.fn();
	}
});

afterEach(() => {
	cleanup();
});

function ControlledTree({
	initialExpanded = ["root-1"],
	nodes = SAMPLE_NODES,
	withActions = false,
}: {
	initialExpanded?: string[];
	nodes?: SampleNode[];
	withActions?: boolean;
}) {
	const [expanded, setExpanded] = useState<Set<string>>(
		() => new Set(initialExpanded),
	);

	return (
		<TreeList
			ariaLabel="Sample hierarchy"
			nodes={nodes}
			expandedKeys={expanded}
			onExpandedChange={setExpanded}
			emptyMessage="No items found."
			renderMain={(node, level) => (
				<>
					<span>{node.name}</span>
					<span>
						{node.levelLabel} (L{level})
					</span>
				</>
			)}
			renderActions={
				withActions
					? (node) => (
							<button type="button" aria-label={`Edit ${node.name}`}>
								Edit
							</button>
						)
					: undefined
			}
		/>
	);
}

describe("TreeList design-system primitive", () => {
	it("renders expanded branches, hides collapsed descendants, and toggles via chevron click", async () => {
		const user = userEvent.setup();
		render(<ControlledTree initialExpanded={["root-1"]} />);

		expect(screen.getByText("Social")).toBeTruthy();
		expect(screen.getByText("Housing")).toBeTruthy();
		expect(screen.getByText("Education")).toBeTruthy();
		expect(screen.queryByText("Urban housing")).toBeNull();

		// Expand Housing via its chevron button
		const housingRow = screen.getByRole("row", { name: /Housing/i });
		const chevron = within(housingRow).getByRole("button");
		await user.click(chevron);

		expect(screen.getByText("Urban housing")).toBeTruthy();
		expect(screen.getByText("Sub-sector (L3)")).toBeTruthy();

		// Indentation scales by level: L1=8px, L2=32px, L3=56px
		const socialBranch = screen
			.getByRole("row", { name: /Social/i })
			.querySelector("[data-branch]") as HTMLElement | null;
		expect(socialBranch?.style.paddingInlineStart).toBe("8px");
		const housingBranch = housingRow.querySelector(
			"[data-branch]",
		) as HTMLElement | null;
		expect(housingBranch?.style.paddingInlineStart).toBe("32px");

		// Collapse Housing again
		await user.click(chevron);
		expect(screen.queryByText("Urban housing")).toBeNull();
	});

	it("toggles branch expansion via keyboard Enter activation, ArrowRight, and ArrowLeft", async () => {
		const user = userEvent.setup();
		render(<ControlledTree initialExpanded={[]} />);

		expect(screen.queryByText("Housing")).toBeNull();

		const socialRow = screen.getByRole("row", { name: /Social/i });
		await user.tab();
		expect(document.activeElement).toBe(socialRow);
		await user.keyboard("{Enter}");
		expect(screen.getByText("Housing")).toBeTruthy();

		await user.keyboard("{ArrowLeft}");
		expect(screen.queryByText("Housing")).toBeNull();

		await user.keyboard("{ArrowRight}");
		expect(screen.getByText("Housing")).toBeTruthy();
	});

	it("renders emptyMessage when nodes array is empty", () => {
		render(<ControlledTree nodes={[]} />);
		expect(screen.getByText("No items found.")).toBeTruthy();
	});

	it("renders optional renderActions slot for reuse in editable trees", () => {
		render(<ControlledTree initialExpanded={[]} withActions />);
		expect(screen.getByRole("button", { name: "Edit Social" })).toBeTruthy();
		expect(
			screen.getByRole("button", { name: "Edit Productive" }),
		).toBeTruthy();
	});
});
