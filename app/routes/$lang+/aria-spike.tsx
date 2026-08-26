/*
 * Consumer-side proof for Mangrove's published React Aria CSS surfaces.
 * It uses react-aria-components plus the packaged DELTA tokens and Aria CSS —
 * never Mangrove's own component CSS.
 */
import { useEffect, useMemo, useState } from "react";
import {
	Button,
	Calendar,
	CalendarCell,
	CalendarGrid,
	CalendarGridBody,
	CalendarGridHeader,
	CalendarHeaderCell,
	Cell,
	Checkbox,
	Column,
	ColumnResizer,
	ComboBox,
	DateInput,
	DatePicker,
	DateSegment,
	Dialog,
	DialogTrigger,
	DropZone,
	FieldError,
	Form,
	Group,
	Heading,
	Input,
	Label,
	ListBox,
	ListBoxItem,
	Menu,
	MenuItem,
	MenuTrigger,
	Modal,
	ModalOverlay,
	Popover,
	ResizableTableContainer,
	Row,
	SearchField,
	Select,
	SelectValue,
	SubmenuTrigger,
	Table,
	TableBody,
	TableHeader,
	TextField,
	ToggleButton,
	isFileDropItem,
} from "react-aria-components";

type HazardEvent = {
	id: string;
	hazard: string;
	note: string;
	status: string;
	onset: string;
	exposure: string;
	severity: string;
	updated: string;
	favorite: boolean;
	image?: string;
};

const INITIAL_EVENTS: HazardEvent[] = [
	{
		id: "cyclone",
		hazard: "Tropical Cyclone",
		note: "HIPS-001",
		status: "Validated",
		onset: "Rapid onset",
		exposure: "High",
		severity: "Average",
		updated: "02-05-2026",
		favorite: false,
	},
	{
		id: "cholera",
		hazard: "Cholera",
		note: "HIPS-002",
		status: "Published",
		onset: "Slow onset",
		exposure: "Low",
		severity: "Minimum",
		updated: "02-05-2026",
		favorite: false,
	},
	{
		id: "drought",
		hazard: "Drought",
		note: "HIPS-003",
		status: "Draft",
		onset: "Slow onset",
		exposure: "High",
		severity: "Minimum",
		updated: "02-05-2026",
		favorite: false,
	},
	{
		id: "heatwave",
		hazard: "Heatwave",
		note: "HIPS-004",
		status: "Draft",
		onset: "Rapid onset",
		exposure: "High",
		severity: "Average",
		updated: "02-05-2026",
		favorite: false,
	},
	{
		id: "flood",
		hazard: "Riverine Flood",
		note: "HIPS-005",
		status: "Waiting for validation",
		onset: "Rapid onset",
		exposure: "Medium",
		severity: "Frequent",
		updated: "01-05-2026",
		favorite: false,
	},
];
const COLUMNS = [
	{ id: "hazard", label: "Hazard type", width: 260 },
	{ id: "onset", label: "Onset", width: 160 },
	{ id: "exposure", label: "Exposure", width: 150 },
	{ id: "severity", label: "Severity", width: 150 },
	{ id: "status", label: "Record status", width: 190 },
	{ id: "updated", label: "Updated", width: 150 },
] as const;
const STATUSES = ["Draft", "Waiting for validation", "Validated", "Published"];
const ONSETS = ["Rapid onset", "Slow onset"];
const EXPOSURES = ["Low", "Medium", "High"];
const SEVERITIES = ["Minimum", "Average", "Frequent"];

export const handle = { hideMainNavigation: true };

function ChoiceSelect({
	label,
	value,
	onChange,
	items,
}: {
	label: string;
	value: string;
	onChange: (value: string) => void;
	items: readonly string[];
}) {
	return (
		<Select
			selectedKey={value}
			onSelectionChange={(key) => onChange(String(key))}
		>
			<Label>{label}</Label>
			<Button>
				<SelectValue />
				<span aria-hidden="true">▾</span>
			</Button>
			<Popover>
				<ListBox items={items}>
					{(item) => <ListBoxItem id={item}>{item}</ListBoxItem>}
				</ListBox>
			</Popover>
		</Select>
	);
}

function Editor({
	item,
	onClose,
	onSave,
}: {
	item: HazardEvent | null;
	onClose: () => void;
	onSave: (item: HazardEvent) => void;
}) {
	const [draft, setDraft] = useState(() =>
		item
			? { ...item }
			: {
					hazard: "",
					note: "",
					status: "Draft",
					onset: "Rapid onset",
					exposure: "High",
					severity: "Average",
					updated: "26-08-2026",
					favorite: false,
					id: "",
				},
	);
	const [showValidation, setShowValidation] = useState(false);
	const [image, setImage] = useState(item?.image);
	const update = (key: keyof HazardEvent, value: string) =>
		setDraft((current) => ({ ...current, [key]: value }));
	const submit = (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!draft.hazard.trim() || !draft.note.trim()) {
			setShowValidation(true);
			return;
		}
		onSave({
			...draft,
			image,
			id: item?.id ?? crypto.randomUUID(),
			favorite: item?.favorite ?? false,
		});
	};
	return (
		<ModalOverlay isOpen onOpenChange={(open) => !open && onClose()}>
			<Modal>
				<Dialog className="aria-crud-editor">
					<Form onSubmit={submit} className="aria-crud-editor">
						<Heading slot="title">
							{item ? "Edit hazardous event" : "Add hazardous event"}
						</Heading>
						<div className="aria-crud-editor__identity grid gap-4 md:grid-cols-2">
							<DropZone
								aria-label="Attach event evidence"
								getDropOperation={(types) =>
									types.has("image/jpeg") || types.has("image/png")
										? "copy"
										: "cancel"
								}
								onDrop={async (event) => {
									const dropped = event.items
										.filter(isFileDropItem)
										.find(
											(entry) =>
												entry.type === "image/jpeg" ||
												entry.type === "image/png",
										);
									if (dropped)
										setImage(URL.createObjectURL(await dropped.getFile()));
								}}
							>
								{image ? (
									<img alt="" src={image} />
								) : (
									<>
										<span aria-hidden="true">⇧</span>
										<span>Drop or paste an image here</span>
									</>
								)}
							</DropZone>
							<ComboBox
								allowsCustomValue
								isRequired
								inputValue={draft.hazard}
								onInputChange={(value) => update("hazard", value)}
								onSelectionChange={(key) => update("hazard", String(key ?? ""))}
								isInvalid={showValidation && !draft.hazard.trim()}
							>
								<Label>Hazard type</Label>
								<Group>
									<Input placeholder="Enter hazard type" />
									<Button aria-label="Show suggested hazards">▾</Button>
								</Group>
								<Popover>
									<ListBox items={INITIAL_EVENTS}>
										{(event) => (
											<ListBoxItem id={event.hazard}>
												{event.hazard}
											</ListBoxItem>
										)}
									</ListBox>
								</Popover>
								<FieldError>A hazard type is required.</FieldError>
							</ComboBox>
						</div>
						<div className="aria-crud-editor__fields grid gap-4 md:grid-cols-2">
							<TextField
								isRequired
								value={draft.note}
								onChange={(value) => update("note", value)}
								isInvalid={showValidation && !draft.note.trim()}
							>
								<Label>Event reference</Label>
								<Input placeholder="Enter reference" />
								<FieldError>An event reference is required.</FieldError>
							</TextField>
							<ChoiceSelect
								label="Record status"
								value={draft.status}
								onChange={(value) => update("status", value)}
								items={STATUSES}
							/>
							<DatePicker>
								<Label>Date recorded</Label>
								<Group>
									<DateInput>
										{(segment) => <DateSegment segment={segment} />}
									</DateInput>
									<Button aria-label="Choose date">▾</Button>
								</Group>
								<Popover>
									<Dialog>
										<Calendar aria-label="Date recorded">
											<header className="aria-calendar-header">
												<Button slot="previous">‹</Button>
												<Heading />
												<Button slot="next">›</Button>
											</header>
											<CalendarGrid>
												<CalendarGridHeader>
													{(day) => (
														<CalendarHeaderCell>{day}</CalendarHeaderCell>
													)}
												</CalendarGridHeader>
												<CalendarGridBody>
													{(date) => <CalendarCell date={date} />}
												</CalendarGridBody>
											</CalendarGrid>
										</Calendar>
									</Dialog>
								</Popover>
							</DatePicker>
							<ChoiceSelect
								label="Onset"
								value={draft.onset}
								onChange={(value) => update("onset", value)}
								items={ONSETS}
							/>
							<ChoiceSelect
								label="Exposure"
								value={draft.exposure}
								onChange={(value) => update("exposure", value)}
								items={EXPOSURES}
							/>
							<ChoiceSelect
								label="Severity"
								value={draft.severity}
								onChange={(value) => update("severity", value)}
								items={SEVERITIES}
							/>
						</div>
						<div className="aria-crud-actions">
							<Button type="button" onPress={onClose}>
								Cancel
							</Button>
							<Button type="submit">{item ? "Save" : "Add"}</Button>
						</div>
					</Form>
				</Dialog>
			</Modal>
		</ModalOverlay>
	);
}

function DeleteDialog({
	item,
	onClose,
	onDelete,
}: {
	item: HazardEvent;
	onClose: () => void;
	onDelete: (id: string) => void;
}) {
	return (
		<ModalOverlay isOpen onOpenChange={(open) => !open && onClose()}>
			<Modal>
				<Dialog>
					{() => (
						<>
							<Heading slot="title">Delete event?</Heading>
							<p>
								Delete {item.hazard}? This only changes in-memory spike data.
							</p>
							<div className="aria-crud-actions">
								<Button onPress={onClose}>Cancel</Button>
								<Button onPress={() => onDelete(item.id)}>Delete</Button>
							</div>
						</>
					)}
				</Dialog>
			</Modal>
		</ModalOverlay>
	);
}

export default function AriaSpikeRoute() {
	const [items, setItems] = useState(INITIAL_EVENTS);
	const [search, setSearch] = useState("");
	const [favoritesOnly, setFavoritesOnly] = useState(false);
	const [statuses, setStatuses] = useState<Set<string>>(new Set());
	const [onsets, setOnsets] = useState<Set<string>>(new Set());
	const [visibleColumns, setVisibleColumns] = useState<Set<string>>(
		new Set(COLUMNS.map((column) => column.id)),
	);
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [sort, setSort] = useState<{
		column: string;
		direction: "ascending" | "descending";
	}>({ column: "hazard", direction: "ascending" });
	const [page, setPage] = useState(1);
	const [editing, setEditing] = useState<HazardEvent | "new" | null>(null);
	const [deleting, setDeleting] = useState<HazardEvent | null>(null);
	const columns = COLUMNS.filter((column) => visibleColumns.has(column.id));
	const filtered = useMemo(
		() =>
			items
				.filter(
					(item) =>
						item.hazard.toLowerCase().includes(search.toLowerCase()) &&
						(!favoritesOnly || item.favorite) &&
						(!statuses.size || statuses.has(item.status)) &&
						(!onsets.size || onsets.has(item.onset)),
				)
				.sort(
					(a, b) =>
						String(a[sort.column as keyof HazardEvent]).localeCompare(
							String(b[sort.column as keyof HazardEvent]),
						) * (sort.direction === "ascending" ? 1 : -1),
				),
		[items, search, favoritesOnly, statuses, onsets, sort],
	);
	const pageSize = 3;
	const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
	useEffect(() => {
		if (page > pageCount) setPage(pageCount);
	}, [page, pageCount]);
	const pageItems = filtered.slice((page - 1) * pageSize, page * pageSize);
	const filterCount = Number(favoritesOnly) + statuses.size + onsets.size;
	const clearFilters = () => {
		setFavoritesOnly(false);
		setStatuses(new Set());
		setOnsets(new Set());
		setPage(1);
	};
	const save = (item: HazardEvent) => {
		setItems((current) =>
			current.some((entry) => entry.id === item.id)
				? current.map((entry) => (entry.id === item.id ? item : entry))
				: [...current, item],
		);
		setEditing(null);
	};
	const remove = (id: string) => {
		setItems((current) => current.filter((item) => item.id !== id));
		setSelected((current) => {
			const next = new Set(current);
			next.delete(id);
			return next;
		});
		setDeleting(null);
	};
	const toggleFavorite = (id: string) =>
		setItems((current) =>
			current.map((item) =>
				item.id === id ? { ...item, favorite: !item.favorite } : item,
			),
		);
	const toggleFilter = (
		set: React.Dispatch<React.SetStateAction<Set<string>>>,
		key: string,
		value: boolean,
	) => {
		set((current) => {
			const next = new Set(current);
			value ? next.add(key) : next.delete(key);
			return next;
		});
		setPage(1);
	};
	return (
		<section className="mx-auto max-w-6xl space-y-8 px-4 py-8">
			<div>
				<h1 className="text-2xl font-semibold text-gray-900">
					React Aria DELTA CRUD consumption spike
				</h1>
				<p className="mt-2 text-gray-600">
					The fresh local Mangrove package supplies only the DELTA token adapter
					and shared React Aria CSS.
				</p>
			</div>
			<div className="rounded-lg border border-dashed border-blue-400 bg-blue-50 p-4 text-blue-900">
				Adjacent Tailwind utility element: local utilities coexist with the
				imported Aria stylesheet.
			</div>
			<div className="aria-crud-demo">
				<div className="flex flex-wrap items-end gap-2">
					<SearchField
						aria-label="Search events"
						value={search}
						onChange={(value) => {
							setSearch(value);
							setPage(1);
						}}
					>
						<Label>Search events</Label>
						<Input placeholder="Search hazardous events" />
						{search && (
							<Button slot="clear" aria-label="Clear search">
								×
							</Button>
						)}
					</SearchField>
					<DialogTrigger>
						<Button>Filters{filterCount ? ` (${filterCount})` : ""}</Button>
						<Popover className="!w-[min(25rem,calc(100vw-2rem))] !p-0">
							<Dialog className="gap-0">
								<div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
									<Heading
										slot="title"
										className="text-lg font-semibold text-slate-900"
									>
										Filters
									</Heading>
									{filterCount > 0 && (
										<Button
											className="min-h-10 bg-transparent px-2 py-1 text-sm text-blue-800 active:scale-[0.96]"
											onPress={clearFilters}
										>
											Clear all
										</Button>
									)}
								</div>
								<div className="space-y-4 px-4 py-4">
									<Checkbox
										className="min-h-10"
										isSelected={favoritesOnly}
										onChange={(value) => {
											setFavoritesOnly(value);
											setPage(1);
										}}
									>
										Favorites only
									</Checkbox>
									<div className="space-y-2 border-t border-slate-100 pt-4">
										<Label className="block text-sm font-semibold text-slate-800">
											Record status
										</Label>
										<div className="grid grid-cols-2 gap-x-4 gap-y-2">
											{STATUSES.map((status) => (
												<Checkbox
													className="min-h-10"
													key={status}
													isSelected={statuses.has(status)}
													onChange={(value) =>
														toggleFilter(setStatuses, status, value)
													}
												>
													{status}
												</Checkbox>
											))}
										</div>
									</div>
									<div className="space-y-2 border-t border-slate-100 pt-4">
										<Label className="block text-sm font-semibold text-slate-800">
											Onset
										</Label>
										<div className="grid grid-cols-2 gap-x-4 gap-y-2">
											{ONSETS.map((onset) => (
												<Checkbox
													className="min-h-10"
													key={onset}
													isSelected={onsets.has(onset)}
													onChange={(value) =>
														toggleFilter(setOnsets, onset, value)
													}
												>
													{onset}
												</Checkbox>
											))}
										</div>
									</div>
								</div>
							</Dialog>
						</Popover>
					</DialogTrigger>
					<MenuTrigger>
						<Button>Columns</Button>
						<Popover>
							<Menu
								aria-label="Visible columns"
								selectionMode="multiple"
								selectedKeys={visibleColumns}
								onSelectionChange={(keys) =>
									setVisibleColumns(
										keys === "all"
											? new Set(COLUMNS.map((column) => column.id))
											: new Set(keys as Set<string>),
									)
								}
							>
								{COLUMNS.map((column) => (
									<MenuItem key={column.id} id={column.id}>
										{column.label}
									</MenuItem>
								))}
							</Menu>
						</Popover>
					</MenuTrigger>
					<Button onPress={() => setEditing("new")}>Add event</Button>
				</div>
				<ResizableTableContainer className="aria-spike-table-scroll">
					<Table
						aria-label="Hazardous events"
						selectionMode="multiple"
						selectedKeys={selected}
						onSelectionChange={(keys) =>
							setSelected(
								keys === "all"
									? new Set(pageItems.map((item) => item.id))
									: new Set(keys as Set<string>),
							)
						}
						sortDescriptor={sort}
						onSortChange={(descriptor) => {
							setSort({
								column: String(descriptor.column),
								direction: descriptor.direction,
							});
							setPage(1);
						}}
					>
						<TableHeader>
							<Column
								id="selection"
								width={40}
								minWidth={40}
								maxWidth={40}
								className="aria-crud-selection-column"
							>
								<Checkbox slot="selection" aria-label="Select all" />
							</Column>
							<Column
								id="favorite"
								width={40}
								minWidth={40}
								maxWidth={40}
								aria-label="Favorite"
								className="aria-crud-favorite-column"
							/>
							{columns.map((column) => (
								<Column
									key={column.id}
									id={column.id}
									isRowHeader={column.id === "hazard"}
									allowsSorting
									defaultWidth={column.width}
								>
									{({ sortDirection }) => (
										<div className="aria-spike-column-header">
											<span>
												{column.label}
												{sortDirection
													? sortDirection === "ascending"
														? " ↑"
														: " ↓"
													: ""}
											</span>
											<ColumnResizer />
										</div>
									)}
								</Column>
							))}
							<Column id="actions" width={64} aria-label="Actions" />
						</TableHeader>
						<TableBody
							items={pageItems}
							dependencies={[visibleColumns]}
							renderEmptyState={() => "No results. Try changing the filters."}
						>
							{(item) => (
								<Row
									className={
										selected.has(item.id)
											? "aria-spike-row-selected"
											: undefined
									}
								>
									<Cell className="aria-crud-selection-cell">
										<Checkbox
											slot="selection"
											aria-label={`Select ${item.hazard}`}
										/>
									</Cell>
									<Cell className="aria-crud-favorite-cell">
										<ToggleButton
											className="aria-crud-favorite-button"
											aria-label={`Favorite ${item.hazard}`}
											isSelected={item.favorite}
											onChange={() => toggleFavorite(item.id)}
										>
											{item.favorite ? "★" : "☆"}
										</ToggleButton>
									</Cell>
									{columns.map((column) => (
										<Cell key={column.id}>
											{column.id === "hazard" ? (
												<div className="aria-crud-event-identity">
													{item.image && <img alt="" src={item.image} />}
													<span>
														<strong>{item.hazard}</strong>
														<small>{item.note}</small>
													</span>
												</div>
											) : (
												String(item[column.id as keyof HazardEvent])
											)}
										</Cell>
									))}
									<Cell>
										<MenuTrigger>
											<Button aria-label={`Actions for ${item.hazard}`}>
												•••
											</Button>
											<Popover>
												<Menu aria-label={`Actions for ${item.hazard}`}>
													<MenuItem
														id="favorite"
														onAction={() => toggleFavorite(item.id)}
													>
														{item.favorite ? "Unfavorite" : "Favorite"}
													</MenuItem>
													<MenuItem id="edit" onAction={() => setEditing(item)}>
														Edit…
													</MenuItem>
													<MenuItem
														id="delete"
														onAction={() => setDeleting(item)}
													>
														Delete…
													</MenuItem>
													<SubmenuTrigger>
														<MenuItem id="share">Share</MenuItem>
														<Popover>
															<Menu aria-label={`Share ${item.hazard}`}>
																<MenuItem
																	id="copy"
																	onAction={() =>
																		navigator.clipboard?.writeText(item.note)
																	}
																>
																	Copy reference
																</MenuItem>
																<MenuItem
																	id="email"
																	href={`mailto:?subject=${encodeURIComponent(item.hazard)}`}
																>
																	Email
																</MenuItem>
															</Menu>
														</Popover>
													</SubmenuTrigger>
												</Menu>
											</Popover>
										</MenuTrigger>
									</Cell>
								</Row>
							)}
						</TableBody>
					</Table>
				</ResizableTableContainer>
				<div className="flex items-center justify-between">
					<span>
						Showing {filtered.length ? (page - 1) * pageSize + 1 : 0}–
						{Math.min(page * pageSize, filtered.length)} of {filtered.length}
					</span>
					<div className="flex gap-2">
						<Button
							isDisabled={page === 1}
							onPress={() => setPage((value) => value - 1)}
						>
							Previous
						</Button>
						<span className="self-center">
							Page {page} of {pageCount}
						</span>
						<Button
							isDisabled={page === pageCount}
							onPress={() => setPage((value) => value + 1)}
						>
							Next
						</Button>
					</div>
				</div>
			</div>
			{editing && (
				<Editor
					item={editing === "new" ? null : editing}
					onClose={() => setEditing(null)}
					onSave={save}
				/>
			)}
			{deleting && (
				<DeleteDialog
					item={deleting}
					onClose={() => setDeleting(null)}
					onDelete={remove}
				/>
			)}
		</section>
	);
}
