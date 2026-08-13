// POC list route (openspec/changes/poc-react-aria-hazardous-event, Section 2).
//
// Auth wiring is copied from the production route
// (app/routes/$lang+/_public+/hazardous-event+/_index.tsx) unchanged — real
// `authLoaderPublicOrWithPerm("ViewData", ...)` check, real session/DB reads for
// auth (design.md Decision 2). Only the *content* the loader returns is swapped
// for the static `listRows.ts` fixture (design.md Decision 8) — no live call to
// `hazardousEventsLoader`.
//
// The results table and the approval-status indicator are rebuilt with React Aria
// Components (`Table`/`Row`/`Cell`, `TooltipTrigger`/`Tooltip`) + Tailwind
// (design.md Decision 3, tasks 2.2-2.3). `MainContainer`, `HazardEventHeader`,
// `HazardousEventFilters`, `Pagination`, and `ListLegend` are reused unchanged
// (task 2.4). The "Add new event" action is hand-rolled with a React Aria
// `Link` instead of importing `DataMainLinks` (task 2.5), which pulls in a
// PrimeReact `Button`.
//
// Amendment (tasks 2.7-2.11, design.md Decision 3 revised): the page no longer distinguishes
// public/authenticated rendering — it always renders the full authenticated-equivalent column
// set (including Actions) plus the "Showing X of Y" summary text, and the fixture/loader now
// support real multi-page pagination instead of always returning one unsliced page.
import { MetaFunction, useLoaderData } from "react-router";
import {
	Table,
	TableHeader,
	TableBody,
	Column,
	Row,
	Cell,
	TooltipTrigger,
	Tooltip,
	Link as AriaLink,
	Button as AriaButton,
} from "react-aria-components";

import { authLoaderPublicOrWithPerm } from "~/utils/auth";
import { getCountrySettingsFromSession } from "~/utils/session";

import { MainContainer } from "~/frontend/container";
import { HazardEventHeader } from "~/components/EventCounter";
import { HazardousEventFilters } from "~/frontend/events/hazardevent-filters";
import { Pagination } from "~/frontend/pagination/view";
import { ListLegend } from "~/components/ListLegend";
import { ViewContext } from "~/frontend/context";
import { approvalStatusKeyToLabel } from "~/frontend/approval";
import { formatDateDisplay } from "~/utils/date";
import { htmlTitle } from "~/utils/htmlmeta";

import {
	listRowsFixture,
	listRowsEmptyFixture,
	type HazardousEventsLoaderResult,
} from "./fixtures/listRows";
import { MockActionButton } from "./MockActionDialog";

export const meta: MetaFunction = ({ params }) => {
	const ctx = new ViewContext({ lang: params.lang || "en" });

	return [
		{
			title: htmlTitle(
				ctx,
				ctx.t({
					code: "poc.hazardous_events.list",
					msg: "List of hazardous events (React Aria POC)",
				}),
			),
		},
	];
};

// Mirrors Pagination's own fixed page-size list (app/frontend/pagination/view.tsx) — duplicated
// here (not exported there) so the loader only ever resolves to a page size that component
// actually offers; anything else falls back the same way Pagination itself falls back.
const PAGE_SIZE_OPTIONS = [10, 20, 30, 40, 50];

export const loader = authLoaderPublicOrWithPerm("ViewData", async (args) => {
	// Real auth/permission check above (authLoaderPublicOrWithPerm) is unchanged
	// from production. Everything below is static fixture data — no live DB read
	// (design.md Decision 8). `?empty=1` swaps in the zero-row fixture variant so
	// the "No records found" path can be exercised manually.
	const url = new URL(args.request.url);
	const base: HazardousEventsLoaderResult = url.searchParams.get("empty")
		? listRowsEmptyFixture
		: listRowsFixture;

	// Task 2.7: the populated fixture now holds 25 rows spanning multiple pages, so — unlike the
	// original version of this loader, which always returned the fixture unsliced with a
	// hardcoded page/pageSize — real navigation requires reading `page`/`pageSize` from the
	// request's search params (as Pagination's own links set them via `buildQueryString`) and
	// slicing the fixture's full row list accordingly. Without this, the pagination control
	// renders but clicking "page 2" just re-renders an identical page 1.
	const allItems = base.data.items;
	const requestedPageSize = Number(url.searchParams.get("pageSize"));
	const pageSize = PAGE_SIZE_OPTIONS.includes(requestedPageSize)
		? requestedPageSize
		: base.data.pagination.pageSize;
	const totalItems = allItems.length;
	const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
	const requestedPage =
		Number(url.searchParams.get("page")) || base.data.pagination.page;
	const page = Math.min(Math.max(1, requestedPage), totalPages);
	const startIndex = (page - 1) * pageSize;
	const items = allItems.slice(startIndex, startIndex + pageSize);

	const eventsData: HazardousEventsLoaderResult = {
		...base,
		data: {
			items,
			pagination: {
				totalItems,
				itemsOnThisPage: items.length,
				page,
				pageSize,
				extraParams: base.data.pagination.extraParams,
			},
		},
	};

	const settings = await getCountrySettingsFromSession(args.request);

	return {
		...eventsData,
		instanceName: settings?.websiteName || "DELTA Resilience",
	};
});

type HazardousEventRow = HazardousEventsLoaderResult["data"]["items"][number];

/**
 * Mirrors hazardeventlist.tsx's getHazardDisplayName: shows the most specific
 * hazard classification available, falling back up the type→cluster→hazard
 * hierarchy. Duplicated locally (not imported) because the production file is
 * not modified and this is a small, self-contained helper.
 */
function getHazardDisplayName(item: HazardousEventRow): string {
	if (item.hipHazard?.name) return item.hipHazard.name;
	if (item.hipCluster?.name) return item.hipCluster.name;
	if (item.hipType?.name) return item.hipType.name;
	return "";
}

// Tailwind arbitrary-value swatches reproducing style-dts.css's `.dts-status--*`
// dot colors (public/assets/css/style-dts.css), so the rebuilt indicator stays
// visually aligned with the legend it's paired with (ListLegend, reused as-is).
const approvalStatusDotClass: Record<string, string> = {
	draft: "border border-[#181823] bg-white",
	"waiting-for-validation": "bg-[#d87838]",
	"needs-revision": "bg-[#ad66a1]",
	validated: "bg-[#106cb8]",
	published: "bg-[#6d9a75]",
};

function ApprovalStatusIndicator({
	ctx,
	status,
}: {
	ctx: ViewContext;
	status: string;
}) {
	const dotClass = approvalStatusDotClass[status] ?? "bg-gray-400";

	return (
		<div className="flex items-center gap-2">
			<TooltipTrigger delay={200}>
				<AriaButton
					className={`h-[0.65rem] w-[0.65rem] shrink-0 rounded-full p-0 data-[focus-visible]:outline data-[focus-visible]:outline-2 data-[focus-visible]:outline-offset-2 data-[focus-visible]:outline-blue-500 ${dotClass}`}
					aria-label={status}
				/>
				<Tooltip className="rounded bg-gray-900 px-2 py-1 text-xs text-white shadow">
					{status}
				</Tooltip>
			</TooltipTrigger>
			<span>{approvalStatusKeyToLabel(ctx, status)}</span>
		</div>
	);
}

/**
 * Results table rebuilt with React Aria `Table`/`Row`/`Cell` + Tailwind
 * (design.md Decision 3, task 2.2). Columns always render the full
 * authenticated-equivalent set — hazard type, record status (task 2.3's
 * Tooltip rebuild), UUID, created, updated, Actions (task 2.9) — with no
 * `isPublic` branching (task 2.10, design.md Decision 3 revised). See
 * task 2.11 for the re-run visual comparison against production's
 * authenticated list view, the only variant reachable in this environment.
 *
 * Task 2.13 root-cause note (corrects the task's original premise): RAC's
 * `Table` (v1.20.0, checked against node_modules/react-aria-components/dist/private/Table.mjs)
 * actually renders real semantic `<table>/<thead>/<tbody>/<tr>/<th>/<td>` elements when not
 * virtualized — not ARIA-role `<div>`s — so it already gets the browser's native table
 * auto-layout. The real cause of "Hazard type" reading as too narrow (confirmed by rendering at
 * 800px width: "Tropical cyclone" wraps to two lines while it doesn't need to) is that auto-layout
 * sizes each column from the widest content across *all* rows including the header — and the
 * "Hazardous event UUID" header text is much longer than its actual cell content (a 5-character
 * truncated id), so it claims width that would otherwise go to hazard names. Fixed by giving the
 * hazard-type column an explicit relative width hint (`w-[22%]`, a percentage of the table's own
 * `w-full` width — not a fixed rem/px value) so it keeps a proportionally larger, still-responsive
 * share regardless of what the other columns' header/content lengths do.
 */
function HazardousEventTable({
	ctx,
	items,
}: {
	ctx: ViewContext;
	items: HazardousEventRow[];
}) {
	return (
		<Table
			aria-label={ctx.t({
				code: "poc.hazardous_events.table_label",
				msg: "Hazardous events",
			})}
			className="mb-[0.81rem] w-full border-collapse text-base"
		>
			<TableHeader>
				<Column
					isRowHeader
					className="h-[3.86rem] w-[22%] bg-[#f2f2f2] p-[0.57rem] text-left font-medium data-[hovered]:bg-[#e3e3e3]"
				>
					{ctx.t({
						code: "hip.hazard_type",
						desc: "Label for hazard type",
						msg: "Hazard type",
					})}
				</Column>
				<Column className="h-[3.86rem] bg-[#f2f2f2] p-[0.57rem] text-left font-medium data-[hovered]:bg-[#e3e3e3]">
					{ctx.t({
						code: "record.status_label",
						desc: "Label for record status column in table",
						msg: "Record status",
					})}
				</Column>
				<Column className="h-[3.86rem] bg-[#f2f2f2] p-[0.57rem] text-left font-medium data-[hovered]:bg-[#e3e3e3]">
					{ctx.t({
						code: "hazardous_event.uuid",
						desc: "Label for the UUID of a hazardous event",
						msg: "Hazardous event UUID",
					})}
				</Column>
				<Column className="h-[3.86rem] bg-[#f2f2f2] p-[0.57rem] text-left font-medium data-[hovered]:bg-[#e3e3e3]">
					{ctx.t({
						code: "record.created",
						desc: "Label for the creation date of a record",
						msg: "Created",
					})}
				</Column>
				<Column className="h-[3.86rem] bg-[#f2f2f2] p-[0.57rem] text-left font-medium data-[hovered]:bg-[#e3e3e3]">
					{ctx.t({
						code: "record.updated",
						desc: "Label for the last updated date of a record",
						msg: "Updated",
					})}
				</Column>
				<Column className="h-[3.86rem] bg-[#f2f2f2] p-[0.57rem] text-center font-medium data-[hovered]:bg-[#e3e3e3]">
					{ctx.t({
						code: "record.table.actions",
						desc: "Label for the actions column in record tables",
						msg: "Actions",
					})}
				</Column>
			</TableHeader>
			<TableBody
				items={items}
				renderEmptyState={() => (
					<div className="p-4 text-gray-500">
						{ctx.t({
							code: "record.none_found",
							desc: "Message displayed when no records are found",
							msg: "No records found",
						})}
					</div>
				)}
			>
				{(item) => (
					<Row
						id={item.id}
						className="border-b border-[#f2f2f2] data-[hovered]:bg-[#f2f2f2]"
					>
						<Cell className="h-[3.86rem] p-[0.57rem]">
							{getHazardDisplayName(item)}
						</Cell>
						<Cell className="h-[3.86rem] p-[0.57rem]">
							<ApprovalStatusIndicator ctx={ctx} status={item.approvalStatus} />
						</Cell>
						<Cell className="h-[3.86rem] p-[0.57rem]">
							{/* Plain black, no underline by default — matches production's
							    computed style (getComputedStyle on hazardeventlist.tsx's
							    LangLink: color rgb(0,0,0), text-decoration none), with a
							    hover/focus affordance added since a plain-text-looking link
							    needs one to remain discoverable/accessible. */}
							<AriaLink
								href={ctx.url(`/hazardous-event/${item.id}`)}
								className="text-black no-underline data-[hovered]:underline data-[focus-visible]:outline data-[focus-visible]:outline-2 data-[focus-visible]:outline-[#106cb8]"
							>
								{item.id.slice(0, 5)}
							</AriaLink>
						</Cell>
						<Cell className="h-[3.86rem] p-[0.57rem]">
							{formatDateDisplay(item.createdAt, "dd-MM-yyyy")}
						</Cell>
						<Cell className="h-[3.86rem] p-[0.57rem]">
							{formatDateDisplay(item.updatedAt, "dd-MM-yyyy")}
						</Cell>
						<Cell className="h-[3.86rem] p-[0.57rem]">
							{/* All three mock actions (task 2.9) open the same shared
							    placeholder Modal/Dialog rather than navigating or
							    submitting a real delete — the fixture's rows have no
							    corresponding real DB record (design.md Decision 3,
							    revised "DataCollectionActionLinks disposition" note).
							    Task 2.14: Edit is only shown for "draft"/"needs-revision"
							    rows — a status-only simplification of production's
							    `canEditDataCollectionRecord` (which also considers user
							    role; not meaningful to test here). A grid with fixed
							    2.25rem tracks (mirroring ActionLinks.tsx's
							    `emptySlotStyle`/`actionSlotsStyle` grid-slot trick) keeps
							    View/Delete's horizontal position stable whether or not
							    the Edit slot is filled — a plain flex+gap would collapse
							    the gap and shift the remaining icons left instead. */}
							<div className="grid grid-cols-[repeat(3,2.25rem)] items-center justify-items-center gap-1">
								{item.approvalStatus === "draft" ||
								item.approvalStatus === "needs-revision" ? (
									<MockActionButton
										ctx={ctx}
										icon="/assets/icons/edit.svg#edit"
										label={ctx.t({ code: "common.edit", msg: "Edit" })}
									/>
								) : (
									<span aria-hidden="true" className="inline-block h-9 w-9" />
								)}
								<MockActionButton
									ctx={ctx}
									icon="/assets/icons/eye-show-password.svg#eye-show"
									label={ctx.t({ code: "common.view", msg: "View" })}
								/>
								<MockActionButton
									ctx={ctx}
									icon="/assets/icons/trash-alt.svg#delete"
									label={ctx.t({ code: "common.delete", msg: "Delete" })}
								/>
							</div>
						</Cell>
					</Row>
				)}
			</TableBody>
		</Table>
	);
}

export default function PocHazardousEventList() {
	const ld = useLoaderData<typeof loader>();
	const ctx = new ViewContext();

	const { hip, filters } = ld;
	const { items, pagination } = ld.data;

	const paginationView = Pagination({ ctx, ...pagination });

	return (
		<MainContainer
			title={ctx.t({
				code: "hazardous_events",
				msg: "Hazardous events",
			})}
		>
			<>
				<HazardEventHeader
					ctx={ctx}
					totalCount={pagination.totalItems}
					instanceName={ld.instanceName}
				/>

				{/* Task 2.17 fix (corrects 2.12's diagnosis): `HazardousEventFilters`
				    renders `<Form className="dts-form">`, and style-dts.css's
				    `.dts-form:not(.dts-form--horizontal):not(.dts-form--vertical):not(.dts-form--spaced)`
				    applies its own asymmetric self-inset — `padding: 0 4.57rem 0
				    2.29rem` — at >=1164px, *on top of* `MainContainer`'s ambient
				    `.mg-container` padding (`0 2.29rem`). 2.12 removed all padding
				    from this button and the table section on the assumption the
				    ambient padding alone was sufficient, which ignored this self-inset
				    and left both narrower than the filters form. This wrapper
				    reproduces the filters form's exact self-inset values (sourced
				    directly from style-dts.css, not re-guessed) around the button and
				    the table/summary/legend/pagination section below, so their edges
				    match the filters form's real content edges rather than just the
				    ambient container's. `HazardousEventFilters` itself stays a sibling
				    of this wrapper, not inside it — wrapping it too would double-apply
				    the inset it already applies to itself. */}
				{/* Task 2.17 fix (corrects 2.12's diagnosis): `HazardousEventFilters`
				    renders `<Form className="dts-form">`, and style-dts.css's
				    `.dts-form:not(.dts-form--horizontal):not(.dts-form--vertical):not(.dts-form--spaced)`
				    applies its own asymmetric self-inset — `padding: 0 4.57rem 0
				    2.29rem` — at >=1164px, *on top of* `MainContainer`'s ambient
				    `.mg-container` padding (`0 2.29rem`). 2.12 removed all padding
				    from this button and the table section on the assumption the
				    ambient padding alone was sufficient, which ignored this self-inset
				    and left both narrower than the filters form. Each of the two
				    wrappers below reproduces the filters form's exact self-inset
				    values (sourced directly from style-dts.css, not re-guessed) so
				    their edges match the filters form's real content edges rather
				    than just the ambient container's. `HazardousEventFilters` itself
				    stays unwrapped between them, in its original DOM position
				    (matching production's button → filters → table order) — wrapping
				    it too would double-apply the inset it already applies to itself. */}
				<div className="min-[1164px]:pl-[2.29rem] min-[1164px]:pr-[4.57rem]">
					{/* Hand-rolled "Add new event" action (task 2.5) — React Aria
					    `Link` styled with Tailwind utilities reproducing
					    mg-button-primary's look (design.md Decision 7: new markup uses
					    Tailwind utilities, not the legacy mg-button/dts-* classes
					    applied directly to RAC primitives), replacing DataMainLinks
					    (which pulls in a PrimeReact primereact/button `Button`).
					    Production's DataMainLinks hides this entirely for isPublic
					    viewers; it's always shown here so the rebuilt control has
					    something to evaluate visually. Right-aligned (flex
					    justify-end). */}
					<div className="mb-4 flex justify-end">
						<AriaLink
							href={ctx.url("/poc-react-aria/hazardous-event/new")}
							className="inline-flex cursor-pointer items-center justify-center rounded-[0.57rem] bg-[#004f91] px-[1.14rem] py-[0.8rem] font-medium leading-[1.14] text-white no-underline data-[hovered]:bg-[#106cb8] data-[focus-visible]:shadow-[0_0_0_2px_#106cb8] data-[focus-visible]:outline-none"
						>
							{ctx.t({
								code: "hazardous_event.add_new_event",
								msg: "Add new event",
							})}
						</AriaLink>
					</div>
				</div>

				<HazardousEventFilters
					ctx={ctx}
					hipHazardId={filters.hipHazardId}
					hipClusterId={filters.hipClusterId}
					hipTypeId={filters.hipTypeId}
					fromDate={filters.fromDate}
					toDate={filters.toDate}
					recordingOrganization={filters.recordingOrganization}
					hazardousEventStatus={filters.hazardousEventStatus}
					recordStatus={filters.recordStatus}
					viewMyRecords={filters.viewMyRecords}
					pendingMyAction={filters.pendingMyAction}
					search={filters.search}
					hip={hip}
					organizations={ld.organizations || []}
					clearFiltersUrl={ctx.url("/poc-react-aria/hazardous-event")}
				/>

				<div className="min-[1164px]:pl-[2.29rem] min-[1164px]:pr-[4.57rem]">
					<section className="mt-[2.86rem]">
						{/* Task 2.8: production gates this behind `!isPublic`
						    (hazardeventlist.tsx) — always shown here since this page no
						    longer distinguishes public/authenticated rendering at all
						    (design.md Decision 3, revised). */}
						<div className="mb-[0.57rem] text-lg font-medium">
							<p>
								{ctx.t(
									{
										code: "hazardous_events.showing_filtered_of_total",
										desc: "Shows how many hazardous events are displayed. {filtered} is the number of matching events, {total} is the total number of events.",
										msg: "Showing {filtered} of {total} hazardous event(s)",
									},
									{
										filtered: items.length,
										total: pagination.totalItems,
									},
								)}
							</p>
						</div>

						<ListLegend ctx={ctx} />

						{/* The table is always mounted (unlike production, which hides the
						    whole table+pagination block behind an outer totalItems check) so
						    RAC TableBody's own `renderEmptyState` is exercised — a real RAC
						    capability worth evaluating on its own, not just a stand-in for
						    production's guard. Pagination is still skipped for zero rows since
						    a 0/0 pager is meaningless. */}
						<HazardousEventTable ctx={ctx} items={items} />
						{pagination.totalItems > 0 && paginationView}
					</section>
				</div>
			</>
		</MainContainer>
	);
}
