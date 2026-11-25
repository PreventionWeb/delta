import { useMemo, useState } from "react";
import { Button, TextField, TreeList } from "~/design-system/components";
import { useViewContext } from "~/frontend/context";
import {
	buildSectorTree,
	collectBranchIds,
	countTreeNodes,
	filterSectorTree,
	type SectorRow,
	type SectorTreeNode,
} from "~/frontend/sectorsTree";
import type { DContext } from "~/utils/dcontext";

export interface SectorsPageProps {
	sectors: readonly SectorRow[];
	lang: string;
}

function formatFooterCount(
	ctx: DContext,
	count: number,
	isSearching: boolean,
): string {
	if (isSearching) {
		return count === 1
			? ctx.t(
					{
						code: "settings.sectors.count_search_singular",
						msg: "{count} sector matches your search",
					},
					{ count },
				)
			: ctx.t(
					{
						code: "settings.sectors.count_search_plural",
						msg: "{count} sectors match your search",
					},
					{ count },
				);
	}

	return count === 1
		? ctx.t(
				{
					code: "settings.sectors.count_singular",
					msg: "{count} sector",
				},
				{ count },
			)
		: ctx.t(
				{
					code: "settings.sectors.count_plural",
					msg: "{count} sectors",
				},
				{ count },
			);
}

export default function SectorsPage({ sectors, lang }: SectorsPageProps) {
	const ctx = useViewContext();

	const tree = useMemo(() => buildSectorTree(sectors, lang), [sectors, lang]);

	const [query, setQuery] = useState("");
	const [expandedKeys, setExpandedKeys] = useState<Set<string>>(
		() => new Set(tree.map((node) => node.id)),
	);

	const trimmedQuery = query.trim();
	const isSearching = trimmedQuery.length > 0;

	const filteredTree = useMemo(
		() => filterSectorTree(tree, query),
		[tree, query],
	);

	const effectiveExpanded = useMemo(
		() =>
			isSearching ? new Set(collectBranchIds(filteredTree)) : expandedKeys,
		[isSearching, filteredTree, expandedKeys],
	);

	const visibleCount = useMemo(
		() => countTreeNodes(filteredTree),
		[filteredTree],
	);

	const pageTitle = ctx.t({
		code: "nav.analysis.sectors",
		msg: "Sectors",
	});

	const searchLabel = ctx.t({
		code: "settings.sectors.search_placeholder",
		msg: "Search sectors",
	});

	const getLevelLabel = (node: SectorTreeNode, depth: number): string => {
		const level = node.level || depth;
		switch (level) {
			case 1:
				return ctx.t({ code: "sectors.type", msg: "Type" });
			case 2:
				return ctx.t({ code: "sectors.sector", msg: "Sector" });
			case 3:
				return ctx.t({ code: "sectors.sub_sector", msg: "Sub-sector" });
			case 4:
				return ctx.t({ code: "sectors.category", msg: "Category" });
			default:
				return "-";
		}
	};

	const emptyMessage = isSearching
		? ctx.t(
				{
					code: "settings.sectors.empty_search",
					msg: 'No sectors match "{query}".',
				},
				{ query: trimmedQuery },
			)
		: ctx.t({
				code: "settings.sectors.empty_catalog",
				msg: "No sectors available.",
			});

	const footerText = formatFooterCount(ctx, visibleCount, isSearching);

	return (
		<div className="min-h-full w-full bg-bg">
			<div className="mx-auto w-full max-w-[1280px] px-[16px] md:px-[24px] xl:px-[32px]">
				<div className="flex flex-col gap-[4px] pt-[32px] pb-[24px]">
					<h1 className="text-page font-medium leading-[var(--lh-tight)] text-fg">
						{pageTitle}
					</h1>
					<p className="text-body text-fg-2">
						{ctx.t({
							code: "settings.sectors.subtitle",
							msg: "The sectors used to classify losses and damages. The list is the same for every country and cannot be changed here.",
						})}
					</p>
				</div>

				<div className="flex flex-wrap items-center gap-[8px] pb-[16px]">
					<TextField
						type="search"
						aria-label={searchLabel}
						placeholder={searchLabel}
						value={query}
						onChange={setQuery}
						className="w-[340px] max-w-full"
						inputClassName="h-[32px] px-[12px]"
					/>
					<div className="ml-auto flex gap-[8px]">
						<Button
							variant="ghost"
							isDisabled={isSearching}
							className="h-[32px] px-[12px] data-[focus-visible]:outline-accent"
							onPress={() => setExpandedKeys(new Set(collectBranchIds(tree)))}
						>
							{ctx.t({
								code: "settings.sectors.expand_all",
								msg: "Expand all",
							})}
						</Button>
						<Button
							variant="ghost"
							isDisabled={isSearching}
							className="h-[32px] px-[12px] data-[focus-visible]:outline-accent"
							onPress={() => setExpandedKeys(new Set())}
						>
							{ctx.t({
								code: "settings.sectors.collapse_all",
								msg: "Collapse all",
							})}
						</Button>
					</div>
				</div>

				<section
					aria-label={pageTitle}
					className="overflow-hidden rounded-lg border border-border-subtle bg-surface"
				>
					<div
						aria-hidden="true"
						className="flex h-[40px] items-center gap-[8px] border-b border-border pl-[40px] pr-[16px] text-label font-medium text-fg-2"
					>
						<span className="min-w-0 flex-1">
							{ctx.t({ code: "common.name", msg: "Name" })}
						</span>
						<span className="w-[96px] flex-none truncate">
							{ctx.t({ code: "common.level", msg: "Level" })}
						</span>
						<span className="hidden w-[440px] flex-none truncate lg:block">
							{ctx.t({ code: "common.description", msg: "Description" })}
						</span>
					</div>

					<TreeList
						ariaLabel={pageTitle}
						nodes={filteredTree}
						expandedKeys={effectiveExpanded}
						onExpandedChange={(next) => {
							if (!isSearching) {
								setExpandedKeys(next);
							}
						}}
						emptyMessage={emptyMessage}
						renderMain={(node, depth) => (
							<>
								<span
									className="min-w-0 flex-1 truncate text-body text-fg"
									title={node.name}
								>
									{node.name}
								</span>
								<span className="w-[96px] flex-none truncate text-body text-fg-2">
									{getLevelLabel(node, depth)}
								</span>
								<span
									className="hidden w-[440px] flex-none truncate text-body text-fg-2 lg:block"
									title={node.description || undefined}
								>
									{node.description || ""}
								</span>
							</>
						)}
					/>

					<div className="border-t border-border px-[16px] py-[12px] text-body text-fg-2">
						{footerText}
					</div>
				</section>

				<div className="h-[64px]" />
			</div>
		</div>
	);
}
