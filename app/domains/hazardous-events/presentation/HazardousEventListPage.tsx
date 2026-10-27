import { Link as RouterLink, useNavigate, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import type { ListHazardousEventsResult } from "~/domains/hazardous-events/application/use-cases/ListHazardousEvents";
import type { PageProps } from "~/frontend/page-props";
import { useViewContext } from "~/frontend/context";
import { formatDateDisplay } from "~/utils/date";
import { Table } from "~/design-system/components/Table";
import { TableColumn } from "~/design-system/components/TableColumn";
import { TableRow } from "~/design-system/components/TableRow";
import { TableCell } from "~/design-system/components/TableCell";
import { Link } from "~/design-system/components/Link";
import { workflowStatusDisplay } from "./workflowStatusDisplay";
import { hazardLabel } from "./hazardLabel";
import { parsePagination } from "./parsePagination";

// Legacy's own pagination/view.tsx PAGE_SIZE_OPTIONS -- minimal, 6a-scoped selector; 6h may
// later generalize/relocate this into the shared design system (design.md Decision).
const PAGE_SIZE_OPTIONS = [10, 20, 30, 40, 50];

// Legacy's own ListLegend.tsx statuses, in its own order -- the null/"missing" DEF-031 state has
// no legacy equivalent and is deliberately left out here (human decision, 2026-10-27).
const LEGEND_STATUSES = [
	"DRAFT",
	"SUBMITTED",
	"REVISION_REQUESTED",
	"APPROVED",
	"PUBLISHED",
] as const;

/** Ports legacy's own pagination/view.tsx getPaginationWindow() exactly: 1 … [page-2..page+2] … n. */
function paginationWindow(page: number, totalPages: number): (number | "...")[] {
	const delta = 2;
	const range: (number | "...")[] = [];
	const left = Math.max(2, page - delta);
	const right = Math.min(totalPages - 1, page + delta);

	range.push(1);
	if (left > 2) range.push("...");
	for (let i = left; i <= right; i++) range.push(i);
	if (right < totalPages - 1) range.push("...");
	if (totalPages > 1) range.push(totalPages);

	return range;
}

export function HazardousEventListPage({
	data,
}: PageProps<ListHazardousEventsResult>) {
	const ctx = useViewContext();
	const { t } = useTranslation("hazardous-events");
	const { t: tCommon } = useTranslation("common");
	const [searchParams] = useSearchParams();
	const navigate = useNavigate();

	const { items, totalCount } = data;
	const { page, pageSize } = parsePagination(searchParams);
	const totalPages = Math.ceil(totalCount / pageSize);

	function pageHref(targetPage: number, targetPageSize = pageSize): string {
		const params = new URLSearchParams(searchParams);
		params.set("page", String(targetPage));
		params.set("pageSize", String(targetPageSize));
		return ctx.url(`/he-preview?${params.toString()}`);
	}

	function handlePageSizeChange(e: React.ChangeEvent<HTMLSelectElement>) {
		navigate(pageHref(1, Number(e.target.value)));
	}

	return (
		<section className="dts-page-section">
			{items.length === 0 ? (
				<p>{t("list.empty")}</p>
			) : (
				<>
					<div className="dts-heading-4">
						<p>
							{t("list.showing_of_total", {
								filtered: items.length,
								total: totalCount,
							})}
						</p>
					</div>
					<div className="dts-legend">
						<span className="dts-body-label">
							{t("list.columns.record_status")}
						</span>
						{LEGEND_STATUSES.map((legendStatus) => {
							const status = workflowStatusDisplay(legendStatus);
							return (
								<div className="dts-legend__item" key={legendStatus}>
									<span className={status.className} />
									<span>{t(`status.${status.labelKey}`)}</span>
								</div>
							);
						})}
					</div>
					<Table
						aria-label={t("title")}
						className="width-override-data-collection"
						header={
							<>
								<TableColumn id="hazard" isRowHeader>
									{t("list.columns.hazard")}
								</TableColumn>
								<TableColumn id="record-status">
									{t("list.columns.record_status")}
								</TableColumn>
								<TableColumn id="hazardous-event-uuid">
									{t("list.columns.hazardous_event_uuid")}
								</TableColumn>
								<TableColumn id="created-at">
									{t("list.columns.created_at")}
								</TableColumn>
								<TableColumn id="updated-at">
									{t("list.columns.updated_at")}
								</TableColumn>
								<TableColumn id="actions" centered>
									{t("list.columns.actions")}
								</TableColumn>
							</>
						}
					>
						{items.map((item) => {
							const hazard = hazardLabel(item);
							const status = workflowStatusDisplay(item.workflowStatus);
							return (
								<TableRow id={item.id} key={item.id}>
									<TableCell>
										{hazard.isFallback ? (
											<span
												style={{ fontFamily: "monospace", color: "#666" }}
												title={t("list.columns.hazard_id_fallback_title")}
											>
												{hazard.text}
											</span>
										) : (
											hazard.text
										)}
									</TableCell>
									<TableCell>
										<span
											className={status.className}
											style={status.style}
											title={t(`status.${status.labelKey}`)}
										/>{" "}
										{t(`status.${status.labelKey}`)}
									</TableCell>
									<TableCell>
										<Link href={ctx.url(`/he-preview/${item.id}`)}>
											{item.id.slice(0, 5)}
										</Link>
									</TableCell>
									<TableCell>
										{formatDateDisplay(item.createdAt, "dd-MM-yyyy")}
									</TableCell>
									<TableCell>
										{formatDateDisplay(item.updatedAt, "dd-MM-yyyy")}
									</TableCell>
									<TableCell centered className="dts-table__actions" focusChild>
										<Link
											href={ctx.url(`/he-preview/${item.id}`)}
											aria-label={tCommon("view")}
											className="mg-button mg-button-table"
										>
											<svg aria-hidden="true" focusable="false" role="img">
												<use href="/assets/icons/eye-show-password.svg#eye-show" />
											</svg>
										</Link>
									</TableCell>
								</TableRow>
							);
						})}
					</Table>
					<nav className="dts-pagination" aria-label={t("pagination.label")}>
						<ul>
							{page > 1 && (
								<li>
									<RouterLink
										className="mg-button mg-button--small mg-button-ghost"
										to={pageHref(page - 1)}
										aria-label={t("pagination.previous")}
									>
										<img
											src="/assets/icons/chevron-left-white.svg"
											alt=""
											width={20}
											height={20}
										/>
									</RouterLink>
								</li>
							)}
							{paginationWindow(page, totalPages).map((num, idx) =>
								num === "..." ? (
									<li key={`ellipsis-${idx}`}>
										<span
											className="mg-button mg-button--small mg-button-ghost"
											aria-hidden="true"
											tabIndex={-1}
										>
											...
										</span>
									</li>
								) : num === page ? (
									<li key={num}>
										<span
											className="mg-button mg-button--small mg-button-ghost"
											aria-label={t("pagination.current_page", {
												page_number: num,
											})}
											aria-current="true"
										>
											{num}
										</span>
									</li>
								) : (
									<li key={num}>
										<RouterLink
											className="mg-button mg-button--small mg-button-ghost"
											to={pageHref(num)}
											aria-label={t("pagination.page_n", { page_number: num })}
										>
											{num}
										</RouterLink>
									</li>
								),
							)}
							{page < totalPages && (
								<li>
									<RouterLink
										className="mg-button mg-button--small mg-button-ghost"
										to={pageHref(page + 1)}
										aria-label={t("pagination.next")}
									>
										<img
											src="/assets/icons/chevron-right-white.svg"
											alt=""
											width={20}
											height={20}
										/>
									</RouterLink>
								</li>
							)}
						</ul>
						<div className="dts-form-component">
							<select
								value={pageSize}
								onChange={handlePageSizeChange}
								aria-label={t("pagination.items_per_page")}
								id="dts-pagination-page-size"
							>
								{PAGE_SIZE_OPTIONS.map((size) => (
									<option key={size} value={size}>
										{t("list.page_size", { count: size })}
									</option>
								))}
							</select>
						</div>
					</nav>
				</>
			)}
		</section>
	);
}
