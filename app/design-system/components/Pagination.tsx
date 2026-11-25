import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./Button";
import { FilterSelect } from "./SelectField";

export interface PaginationProps {
	total: number;
	page: number;
	pageSize: number;
	pageSizeOptions?: number[];
	onPageChange: (page: number) => void;
	onPageSizeChange: (pageSize: number) => void;
	noun?: string;
	rowsPerPageLabel?: string;
	previousLabel?: string;
	nextLabel?: string;
	showingText?: string;
	pageText?: string;
}

export function Pagination({
	total,
	page,
	pageSize,
	pageSizeOptions = [25, 50, 100],
	onPageChange,
	onPageSizeChange,
	noun = "items",
	rowsPerPageLabel = "Rows per page",
	previousLabel = "Previous page",
	nextLabel = "Next page",
	showingText,
	pageText,
}: PaginationProps) {
	const totalPages = Math.max(1, Math.ceil(total / pageSize));
	const safePage = Math.min(Math.max(1, page), totalPages);
	const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
	const to = Math.min(safePage * pageSize, total);

	const rangeLabel =
		showingText ??
		(total === 0
			? `Showing 0 of 0 ${noun}`
			: `Showing ${from}-${to} of ${total} ${noun}`);
	const pageSummary = pageText ?? `Page ${safePage} of ${totalPages}`;

	return (
		<div className="flex flex-wrap items-center justify-between gap-4 border-t border-border-subtle px-4 py-3 text-body text-fg-2">
			<span className="tabular-nums">{rangeLabel}</span>
			<div className="flex flex-wrap items-center gap-4">
				<div className="flex items-center gap-2">
					<span>{rowsPerPageLabel}</span>
					<FilterSelect
						label={rowsPerPageLabel}
						options={pageSizeOptions.map((n) => ({
							id: String(n),
							label: String(n),
						}))}
						value={String(pageSize)}
						defaultValue={String(pageSize)}
						onChange={(val) => onPageSizeChange(Number(val))}
						className="min-w-20"
					/>
				</div>
				<div className="flex items-center gap-2">
					<Button
						variant="icon"
						aria-label={previousLabel}
						isDisabled={safePage <= 1}
						onPress={() => onPageChange(safePage - 1)}
					>
						<ChevronLeft className="h-4 w-4" aria-hidden="true" />
					</Button>
					<span className="tabular-nums whitespace-nowrap">{pageSummary}</span>
					<Button
						variant="icon"
						aria-label={nextLabel}
						isDisabled={safePage >= totalPages}
						onPress={() => onPageChange(safePage + 1)}
					>
						<ChevronRight className="h-4 w-4" aria-hidden="true" />
					</Button>
				</div>
			</div>
		</div>
	);
}
