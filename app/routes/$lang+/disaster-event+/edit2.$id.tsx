// Import necessary modules
import {
	disasterEventById,
	disasterEventCreate,
	disasterEventUpdate,
} from "~/backend.server/models/event";

import {
	fieldsDef,
} from "~/frontend/events/disastereventform";

import { formSave } from "~/backend.server/handlers/form/form";


import { route } from "~/frontend/events/disastereventform";

import { useLoaderData } from "react-router";

import { getItem2 } from "~/backend.server/handlers/view";
import { dataForHazardPicker } from "~/backend.server/models/hip_hazard_picker";
import {
	authActionGetAuth,
	authActionWithPerm,
	authLoaderGetUserForFrontend,
	authLoaderWithPerm,
} from "~/utils/auth";
import {
	getCountryAccountsIdFromSession,
	getCountrySettingsFromSession,
} from "~/utils/session";
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { dr } from "~/db.server";
import { divisionTable } from "~/drizzle/schema/divisionTable";
import { buildTree } from "~/components/TreeView";

import { ViewContext } from "~/frontend/context";

import { BackendContext } from "~/backend.server/context";
import { InputTextarea } from 'primereact/inputtextarea';

export const handle = {
	hideMainNavigation: true,
};

// Helper function to get country ISO3 code
async function getCountryIso3(request: Request): Promise<string> {
	const settings = await getCountrySettingsFromSession(request);
	return settings?.dtsInstanceCtryIso3 || "";
}

// Helper function to get division GeoJSON data filtered by tenant context
async function getDivisionGeoJSON(countryAccountsId: string) {
	// Filter top-level divisions by tenant context
	return await dr
		.select({
			id: divisionTable.id,
			name: divisionTable.name,
			geojson: divisionTable.geojson,
		})
		.from(divisionTable)
		.where(
			and(
				isNull(divisionTable.parentId),
				isNotNull(divisionTable.geojson),
				eq(divisionTable.countryAccountsId, countryAccountsId),
			),
		);
}

export const action = authActionWithPerm("EditData", async (actionArgs) => {
	const { request } = actionArgs;
	const ctx = new BackendContext(actionArgs);
	const userSession = authActionGetAuth(actionArgs);

	const countryAccountsId = await getCountryAccountsIdFromSession(request);

	return formSave({
		actionArgs,
		fieldsDef: fieldsDef(ctx),
		save: async (tx, id, data) => {
			const updatedData = {
				...data,
				countryAccountsId,
				createdBy: userSession.user.id,
				updatedBy: userSession.user.id,
			};
			if (id) {
				return disasterEventUpdate(ctx, tx, id, updatedData);
			} else {
				return disasterEventCreate(ctx, tx, updatedData);
			}
		},
		redirectTo: (id: string) => route + "/" + id,
	});
});

export const loader = authLoaderWithPerm("EditData", async (loaderArgs) => {
	const { params, request } = loaderArgs;
	const ctx = new BackendContext(loaderArgs);
	const ctryIso3 = await getCountryIso3(request);
	const countryAccountsId = await getCountryAccountsIdFromSession(request);

	// Handle 'new' case without DB query
	if (params.id === "new") {
		// Define Keys Mapping
		const idKey = "id";
		const parentKey = "parentId";
		const nameKey = "name";

		// Filter divisions by tenant context for security
		const rawData = await dr
			.select({
				id: divisionTable.id,
				parentId: divisionTable.parentId,
				name: divisionTable.name,
				importId: divisionTable.importId,
				nationalId: divisionTable.nationalId,
				level: divisionTable.level,
			})
			.from(divisionTable)
			.where(sql`country_accounts_id = ${countryAccountsId}`);

		const treeData = buildTree(rawData, idKey, parentKey, nameKey, "en", [
			"importId",
			"nationalId",
			"level",
			"name",
		]);

		// Get division GeoJSON filtered by tenant context
		const divisionGeoJSON = await getDivisionGeoJSON(countryAccountsId);

		return {
			item: null, // No existing item for new disaster event
			hip: await dataForHazardPicker(ctx),
			treeData: treeData,
			ctryIso3: ctryIso3,
			divisionGeoJSON: divisionGeoJSON || [],
			user: await authLoaderGetUserForFrontend(loaderArgs),
		};
	}

	// For existing items, fetch the disaster event
	const getDisasterEvent = async (ctx: BackendContext, id: string) => {
		return disasterEventById(ctx, id);
	};

	let item = null;
	try {
		item = await getItem2(ctx, params, getDisasterEvent);
		if (item.countryAccountsId !== countryAccountsId) {
			throw new Response("Unauthorized access", { status: 403 });
		}
	} catch (error) {
		// If item not found, return 404
		if (error instanceof Response && error.status === 404) {
			throw new Response("Disaster event not found", { status: 404 });
		}
		// Re-throw other errors
		throw error;
	}

	// Fetch division data & build tree
	const idKey = "id";
	const parentKey = "parentId";
	const nameKey = "name";
	const rawData = await dr
		.select({
			id: divisionTable.id,
			parentId: divisionTable.parentId,
			name: divisionTable.name,
			importId: divisionTable.importId,
			nationalId: divisionTable.nationalId,
			level: divisionTable.level,
		})
		.from(divisionTable)
		.where(sql`country_accounts_id = ${countryAccountsId}`);

	const treeData = buildTree(rawData, idKey, parentKey, nameKey, "en", [
		"importId",
		"nationalId",
		"level",
		"name",
	]);

	// Get hazard picker data
	const hip = await dataForHazardPicker(ctx);

	// Get division GeoJSON data
	const divisionGeoJSON = await getDivisionGeoJSON(countryAccountsId);

	return {
		item,
		hip,
		treeData,
		ctryIso3,
		divisionGeoJSON: divisionGeoJSON || [],
		user: await authLoaderGetUserForFrontend(loaderArgs),
	};
});

export default function Screen() {
	let ld = useLoaderData<typeof loader>();
	let ctx = new ViewContext();

	// Fix the hazardousEvent to include missing HIP properties with complete structure
	const fixedHazardousEvent = ld.item?.hazardousEvent
		? {
				...ld.item.hazardousEvent,
			}
		: null;
	ctx;

	console.log("Loader:", {
		hip: ld.hip,
		hazardousEvent: fixedHazardousEvent,
		disasterEvent: ld.item?.disasterEvent,
		treeData: ld.treeData,
		ctryIso3: ld.ctryIso3,
		divisionGeoJSON: ld.divisionGeoJSON,
		user: ld.user,
	});

	//{ JSON.stringify(ld) }
	return (
		<>
			<StepperValidation
				ctx={ctx}
				hazardousEvent={fixedHazardousEvent}
				hip={ld.hip}
				disasterEvent={ld.item?.disasterEvent ?? null}
				treeData={ld.treeData}
				ctryIso3={ld.ctryIso3}
				divisionGeoJSON={ld.divisionGeoJSON}
				user={ld.user}
			/>
		</>
	);

	// return formScreen({
	// 	ctx,
	// 	extraData: {
	// 		hip: ld.hip,
	// 		hazardousEvent: fixedHazardousEvent,
	// 		disasterEvent: ld.item?.disasterEvent,
	// 		treeData: ld.treeData,
	// 		ctryIso3: ld.ctryIso3,
	// 		divisionGeoJSON: ld.divisionGeoJSON,
	// 		user: ld.user,
	// 	},
	// 	fieldsInitial: fieldsInitial,
	// 	form: DisasterEventForm,
	// 	edit: !!ld.item,
	// 	id: ld.item?.id,
	// });
}

import { useEffect, useMemo, useRef, useState } from "react";
import { Stepper } from "primereact/stepper";
import { StepperPanel } from "primereact/stepperpanel";
import { InputText } from "primereact/inputtext";
import { Button } from "primereact/button";
import { Tooltip } from "primereact/tooltip";
import { Card } from "primereact/card";
import { PickList } from "primereact/picklist";
import { Dialog } from "primereact/dialog";
import { Dropdown } from "primereact/dropdown";
import { Tree } from "primereact/tree";
import type { TreeProps } from "primereact/tree";
import type { TreeNode } from "primereact/treenode";

type Errors = {
	nameNational?: string;
};

type LinkedEventOption = {
	id: string;
	name: string;
	code: string;
};

type AdditionalDetailCategory = "response" | "assessment";

type AdditionalDetailItem = {
	id: string;
	type: string;
	date: string;
	location: string;
	description: string;
};

type HazardPickerItem = {
	id: string;
	name: string;
};

type HipClusterItem = HazardPickerItem & {
	typeId: string;
};

type HipHazardItem = HazardPickerItem & {
	clusterId: string;
};

type StepperHipData = {
	types: HazardPickerItem[];
	clusters: HipClusterItem[];
	hazards: HipHazardItem[];
};

type StepperFormState = {
	id: string;
	nameNational:  string;
	nameGlobalOrRegional: string;
	nationalDisasterId: string;
	glide: string;
	recordingInstitution: string;
};

type EventBasicsCompareFields = {
	id: string;
	nameNational: string;
	nameGlobalOrRegional: string;
	nationalDisasterId: string;
	glide: string;
	recordingInstitution: string;
};

type DatePrecision = "yyyy-mm-dd" | "yyyy-mm" | "yyyy";

type DateWithPrecisionState = {
	precision: DatePrecision;
	year: string;
	month: string;
	day: string;
};

type DivisionTreeNodeInput = {
	id: string | number;
	name: string;
	children?: DivisionTreeNodeInput[];
};

function toPrimeTreeNodes(nodes: DivisionTreeNodeInput[]): TreeNode[] {
	return nodes.map((node) => ({
		key: String(node.id),
		label: node.name,
		data: { id: node.id },
		children: toPrimeTreeNodes(node.children || []),
	}));
}

function filterTreeNodes(nodes: TreeNode[], query: string): TreeNode[] {
	const normalizedQuery = query.trim().toLowerCase();
	if (!normalizedQuery) {
		return nodes;
	}

	return nodes.reduce<TreeNode[]>((accumulator, node) => {
		const label = String(node.label || "").toLowerCase();
		const filteredChildren = node.children
			? filterTreeNodes(node.children, normalizedQuery)
			: [];
		const matchesNode = label.includes(normalizedQuery);

		if (matchesNode || filteredChildren.length > 0) {
			accumulator.push({
				...node,
				children: filteredChildren,
			});
		}

		return accumulator;
	}, []);
}

function getTopLevelSelectedKeys(nodes: TreeNode[], selectionKeys: TreeProps["selectionKeys"]): string[] {
	if (!selectionKeys || typeof selectionKeys !== "object") {
		return [];
	}

	const checkedKeys = new Set(
		Object.entries(selectionKeys)
			.filter(([, value]) => {
				if (value === true) {
					return true;
				}
				if (typeof value === "object" && value !== null) {
					return "checked" in value && value.checked === true;
				}
				return false;
			})
			.map(([key]) => key),
	);

	const result: string[] = [];

	const visit = (treeNodes: TreeNode[], parentChecked: boolean) => {
		for (const node of treeNodes) {
			const key = node.key == null ? null : String(node.key);
			const isChecked = key ? checkedKeys.has(key) : false;

			if (isChecked && !parentChecked && key) {
				result.push(key);
			}

			if (node.children?.length) {
				visit(node.children, parentChecked || isChecked);
			}
		}
	};

	visit(nodes, false);
	return result;
}

function getNodeAndDescendantKeys(nodes: TreeNode[], targetKey: string): string[] {
	for (const node of nodes) {
		const nodeKey = node.key == null ? null : String(node.key);
		if (nodeKey === targetKey) {
			const descendantKeys = node.children ? collectNodeKeys(node.children) : [];
			return [targetKey, ...descendantKeys];
		}

		if (node.children?.length) {
			const match = getNodeAndDescendantKeys(node.children, targetKey);
			if (match.length > 0) {
				return match;
			}
		}
	}

	return [];
}

function collectNodeKeys(nodes: TreeNode[]): string[] {
	return nodes.flatMap((node) => {
		const nodeKey = node.key == null ? [] : [String(node.key)];
		const childKeys = node.children ? collectNodeKeys(node.children) : [];
		return [...nodeKey, ...childKeys];
	});
}

const requiredFieldOrder: Array<keyof Errors> = ["nameNational"];

// const isValidEmail = (value: string) => /^\S+@\S+\.\S+$/.test(value);

type StepperValidationProps = {
	ctx: ViewContext;
	hazardousEvent: {
		id?: string | null;
	} | null;
	hip: StepperHipData;
	disasterEvent: {
		nameNational?: string | null;
		nameGlobalOrRegional?: string | null;
		nationalDisasterId?: string | null;
		glide?: string | null;
		startDate?: string | null;
		endDate?: string | null;
		startDateLocal?: string | null;
		endDateLocal?: string | null;
		hipTypeId?: string | null;
		hipClusterId?: string | null;
		hipHazardId?: string | null;
		disasterEventId?: string | null;
		recordingInstitution?: string | null;
		id?: string | null;
		spatialFootprint?: unknown;
	} | null;
	treeData: unknown;
	ctryIso3: string;
	divisionGeoJSON: unknown;
	user: unknown;
};

function StepperValidation({
	ctx,
	disasterEvent,
	hip,
	treeData,
	ctryIso3,
	divisionGeoJSON,
}: StepperValidationProps) {
	ctryIso3;
	divisionGeoJSON;

	const divisionNodes = useMemo(
		() =>
			toPrimeTreeNodes(
				(Array.isArray(treeData)
					? (treeData as DivisionTreeNodeInput[])
					: []) || [],
			),
		[treeData],
	);

	const divisionLabelByKey = useMemo(() => {
		const map = new Map<string, string>();
		const walk = (nodes: TreeNode[]) => {
			for (const node of nodes) {
				if (node.key != null) {
					map.set(String(node.key), String(node.label || node.key));
				}
				if (node.children?.length) {
					walk(node.children);
				}
			}
		};

		walk(divisionNodes);
		return map;
	}, [divisionNodes]);

	const [selectedDivisionKeys, setSelectedDivisionKeys] =
		useState<TreeProps["selectionKeys"]>(null);
	const [divisionSearchTerm, setDivisionSearchTerm] = useState("");

	const filteredDivisionNodes = useMemo(
		() => filterTreeNodes(divisionNodes, divisionSearchTerm),
		[divisionNodes, divisionSearchTerm],
	);

	const selectedDivisionNames = useMemo(() => {
		if (!selectedDivisionKeys || typeof selectedDivisionKeys !== "object") {
			return [];
		}

		const keys = getTopLevelSelectedKeys(divisionNodes, selectedDivisionKeys);

		return keys
			.map((key) => divisionLabelByKey.get(key))
			.filter((label): label is string => Boolean(label));
	}, [divisionLabelByKey, divisionNodes, selectedDivisionKeys]);

	const selectedDivisionCount = selectedDivisionNames.length;
	const selectedDivisionItems = useMemo(
		() =>
			getTopLevelSelectedKeys(divisionNodes, selectedDivisionKeys).map((key) => ({
				key,
				label: divisionLabelByKey.get(key) ?? key,
			})),
		[divisionLabelByKey, divisionNodes, selectedDivisionKeys],
	);

	const clearDivisionSelection = () => {
		setSelectedDivisionKeys(null);
	};

	const removeDivisionSelection = (keyToRemove: string) => {
		setSelectedDivisionKeys((currentSelection) => {
			if (!currentSelection || typeof currentSelection !== "object") {
				return currentSelection;
			}

			const keysToRemove = new Set(getNodeAndDescendantKeys(divisionNodes, keyToRemove));
			const nextSelection = Object.fromEntries(
				Object.entries(currentSelection).filter(([key]) => !keysToRemove.has(key)),
			);

			return Object.keys(nextSelection).length > 0 ? nextSelection : null;
		});
	};

	const saveDivisionSelection = () => {
		setSpatialFootprintDialogVisible(false);
	};

	const eventBasicsInitialValues: EventBasicsCompareFields = {
		id: disasterEvent?.id ?? "",
		nameNational: disasterEvent?.nameNational ?? "",
		nameGlobalOrRegional: disasterEvent?.nameGlobalOrRegional ?? "",
		nationalDisasterId: disasterEvent?.nationalDisasterId ?? "",
		glide: disasterEvent?.glide ?? "",
		recordingInstitution: disasterEvent?.recordingInstitution ?? "",
	};
	const [activeStep, setActiveStep] = useState(0);
	const firstNameTooltipRef = useRef<Tooltip>(null);
	const [form, setForm] = useState<StepperFormState>({
		id: eventBasicsInitialValues.id,
		nameNational: disasterEvent?.nameNational ?? "",
		nameGlobalOrRegional: disasterEvent?.nameGlobalOrRegional ?? "",
		nationalDisasterId: disasterEvent?.nationalDisasterId ?? "",
		glide: disasterEvent?.glide ?? "",
		recordingInstitution: disasterEvent?.recordingInstitution ?? "",
	});

	console.log("Initial form state - disasterEvent:", { disasterEvent });
	console.log("Initial form state - hip:", { hip });

	const parseDateWithPrecision = (value: string | null | undefined): DateWithPrecisionState => {
		if (!value) {
			return {
				precision: "yyyy-mm-dd",
				year: "",
				month: "",
				day: "",
			};
		}

		if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
			return {
				precision: "yyyy-mm-dd",
				year: value.slice(0, 4),
				month: value.slice(5, 7),
				day: value.slice(8, 10),
			};
		}

		if (/^\d{4}-\d{2}$/.test(value)) {
			return {
				precision: "yyyy-mm",
				year: value.slice(0, 4),
				month: value.slice(5, 7),
				day: "",
			};
		}

		if (/^\d{4}$/.test(value)) {
			return {
				precision: "yyyy",
				year: value,
				month: "",
				day: "",
			};
		}

		return {
			precision: "yyyy-mm-dd",
			year: "",
			month: "",
			day: "",
		};
	};

	const toDateWithPrecisionValue = (state: DateWithPrecisionState): string => {
		if (state.precision === "yyyy") {
			if (state.year.length !== 4) {
				return "";
			}
			return state.year;
		}

		if (state.precision === "yyyy-mm") {
			if (state.year.length !== 4 || state.month.length !== 2) {
				return "";
			}
			return `${state.year}-${state.month}`;
		}

		if (
			state.year.length !== 4 ||
			state.month.length !== 2 ||
			state.day.length !== 2
		) {
			return "";
		}

		return `${state.year}-${state.month}-${state.day}`;
	};

	const [startDateState, setStartDateState] = useState<DateWithPrecisionState>(
		parseDateWithPrecision(disasterEvent?.startDate),
	);
	const [endDateState, setEndDateState] = useState<DateWithPrecisionState>(
		parseDateWithPrecision(disasterEvent?.endDate),
	);
	const [startDateLocal, setStartDateLocal] = useState(
		disasterEvent?.startDateLocal ?? "",
	);
	const [endDateLocal, setEndDateLocal] = useState(
		disasterEvent?.endDateLocal ?? "",
	);
	const [spatialFootprintDialogVisible, setSpatialFootprintDialogVisible] =
		useState(false);
	const [spatialDialogHint, setSpatialDialogHint] = useState<
		"map" | "geographic"
	>("map");
	// const [spatialFootprintValue, setSpatialFootprintValue] = useState<any[]>(() => {
	// 	try {
	// 		if (Array.isArray(disasterEvent?.spatialFootprint)) {
	// 			return disasterEvent.spatialFootprint as any[];
	// 		}
	// 		if (typeof disasterEvent?.spatialFootprint === "string") {
	// 			return JSON.parse(disasterEvent.spatialFootprint) || [];
	// 		}
	// 	} catch {
	// 		// Ignore parse failures and fallback to empty list
	// 	}
	// 	return [];
	// });

	const monthOptions = [
		{ value: "01", label: "January" },
		{ value: "02", label: "February" },
		{ value: "03", label: "March" },
		{ value: "04", label: "April" },
		{ value: "05", label: "May" },
		{ value: "06", label: "June" },
		{ value: "07", label: "July" },
		{ value: "08", label: "August" },
		{ value: "09", label: "September" },
		{ value: "10", label: "October" },
		{ value: "11", label: "November" },
		{ value: "12", label: "December" },
	];

	const renderDateWithPrecision = (
		prefix: "startDate" | "endDate",
		label: string,
		state: DateWithPrecisionState,
		setState: React.Dispatch<React.SetStateAction<DateWithPrecisionState>>,
	) => {
		const isFullDate = state.precision === "yyyy-mm-dd";
		const isYearMonth = state.precision === "yyyy-mm";
		const isYearOnly = state.precision === "yyyy";

		return (
			<>
				<div className="col-span-12 md:col-span-6">
					<label htmlFor={`${prefix}Format`} className="mb-1 inline-flex items-center gap-2">
						{label} format
					</label>
					<select
						id={`${prefix}Format`}
						value={state.precision}
						onChange={(event) => {
							const precision = event.target.value as DatePrecision;
							setState((current) => ({
								...current,
								precision,
								month: precision === "yyyy" ? "" : current.month,
								day: precision === "yyyy-mm-dd" ? current.day : "",
							}));
						}}
						className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
					>
						<option value="yyyy-mm-dd">Full date</option>
						<option value="yyyy-mm">Year and month</option>
						<option value="yyyy">Year only</option>
					</select>
				</div>

				<div className="col-span-12 md:col-span-6">
					{isFullDate ? (
						<>
							<label htmlFor={`${prefix}Date`} className="mb-1 inline-flex items-center gap-2">
								{label} date
							</label>
							<input
								id={`${prefix}Date`}
								type="date"
								value={
									state.year.length === 4 &&
									state.month.length === 2 &&
									state.day.length === 2
										? `${state.year}-${state.month}-${state.day}`
										: ""
								}
								onChange={(event) => {
									const value = event.target.value;
									if (!value) {
										setState((current) => ({
											...current,
											year: "",
											month: "",
											day: "",
										}));
										return;
									}

									const [year, month, day] = value.split("-");
									setState((current) => ({
										...current,
										year,
										month,
										day,
									}));
								}}
								className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
							/>
						</>
					) : null}

					{isYearMonth ? (
						<div className="grid grid-cols-2 gap-2">
							<div>
								<label htmlFor={`${prefix}Year`} className="mb-1 inline-flex items-center gap-2">
									{label} year
								</label>
								<input
									id={`${prefix}Year`}
									type="text"
									inputMode="numeric"
									value={state.year}
									onChange={(event) => {
										const year = event.target.value.replace(/\D/g, "").slice(0, 4);
										setState((current) => ({ ...current, year }));
									}}
									className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
								/>
							</div>
							<div>
								<label htmlFor={`${prefix}Month`} className="mb-1 inline-flex items-center gap-2">
									{label} month
								</label>
								<select
									id={`${prefix}Month`}
									value={state.month}
									onChange={(event) => {
										setState((current) => ({ ...current, month: event.target.value }));
									}}
									className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
								>
									<option value="">Select month</option>
									{monthOptions.map((month) => (
										<option key={month.value} value={month.value}>
											{month.label}
										</option>
									))}
								</select>
							</div>
						</div>
					) : null}

					{isYearOnly ? (
						<>
							<label htmlFor={`${prefix}Year`} className="mb-1 inline-flex items-center gap-2">
								{label} year
							</label>
							<input
								id={`${prefix}Year`}
								type="text"
								inputMode="numeric"
								value={state.year}
								onChange={(event) => {
									const year = event.target.value.replace(/\D/g, "").slice(0, 4);
									setState((current) => ({ ...current, year }));
								}}
								className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
							/>
						</>
					) : null}
				</div>
			</>
		);
	};
	const [linkedEventSearch, setLinkedEventSearch] = useState("");
	const [linkedEventLoading, setLinkedEventLoading] = useState(false);
	const [linkedEventSource, setLinkedEventSource] = useState<LinkedEventOption[]>([]);
	const [linkedEventTarget, setLinkedEventTarget] = useState<LinkedEventOption[]>([]);
	const [linkedDisasterEventSearch, setLinkedDisasterEventSearch] = useState("");
	const [linkedDisasterEventLoading, setLinkedDisasterEventLoading] = useState(false);
	const [linkedDisasterEventSource, setLinkedDisasterEventSource] = useState<LinkedEventOption[]>([]);
	const [linkedDisasterEventTarget, setLinkedDisasterEventTarget] = useState<LinkedEventOption[]>([]);
	const [linkedDisasterRecordSearch, setLinkedDisasterRecordSearch] = useState("");
	const [linkedDisasterRecordLoading, setLinkedDisasterRecordLoading] = useState(false);
	const [linkedDisasterRecordSource, setLinkedDisasterRecordSource] = useState<LinkedEventOption[]>([]);
	const [linkedDisasterRecordTarget, setLinkedDisasterRecordTarget] = useState<LinkedEventOption[]>([]);
	const [responses, setResponses] = useState<AdditionalDetailItem[]>([]);
	const [assessments, setAssessments] = useState<AdditionalDetailItem[]>([]);
	const [declarations, setDeclarations] = useState<AdditionalDetailItem[]>([]);
	const [detailDialogVisible, setDetailDialogVisible] = useState(false);
	const [detailDialogCategory, setDetailDialogCategory] =
		useState<AdditionalDetailCategory>("response");
	const [editingDetailId, setEditingDetailId] = useState<string | null>(null);
	const [detailForm, setDetailForm] = useState({
		type: "",
		dateText: "",
		day: "",
		month: "",
		year: "",
		location: "",
		description: "",
	});
	const [errors, setErrors] = useState<Errors>({});
	const [selectedHipTypeId, setSelectedHipTypeId] = useState(
		disasterEvent?.hipTypeId ?? "",
	);
	const [selectedHipClusterId, setSelectedHipClusterId] = useState(
		disasterEvent?.hipClusterId ?? "",
	);
	const [selectedHipHazardId, setSelectedHipHazardId] = useState(
		disasterEvent?.hipHazardId ?? "",
	);

	const sortedHipTypes = [...(hip?.types ?? [])].sort((a, b) =>
		a.name.localeCompare(b.name),
	);
	const sortedHipClusters = [...(hip?.clusters ?? [])].sort((a, b) =>
		a.name.localeCompare(b.name),
	);
	const sortedHipHazards = [...(hip?.hazards ?? [])].sort((a, b) =>
		a.name.localeCompare(b.name),
	);

	const filteredHipClusters = sortedHipClusters.filter((cluster) =>
		selectedHipTypeId ? cluster.typeId === selectedHipTypeId : true,
	);

	const filteredHipHazards = sortedHipHazards.filter((hazard) => {
		const matchesCluster =
			!selectedHipClusterId || hazard.clusterId === selectedHipClusterId;
		const matchesType =
			!selectedHipTypeId ||
			sortedHipClusters.some(
				(cluster) =>
					cluster.id === hazard.clusterId &&
					cluster.typeId === selectedHipTypeId,
			);

		return matchesCluster && matchesType;
	});

	const hazardTypeOptions = sortedHipTypes.map((item) => ({
		label: item.name,
		value: item.id,
	}));

	const hazardClusterOptions = filteredHipClusters.map((item) => ({
		label: item.name,
		value: item.id,
	}));

	const specificHazardOptions = filteredHipHazards.map((item) => ({
		label: item.name,
		value: item.id,
	}));

	const handleTypeChange = (typeId: string) => {
		setSelectedHipTypeId(typeId);
		setSelectedHipHazardId("");

		if (!typeId) {
			setSelectedHipClusterId("");
			return;
		}

		if (
			selectedHipClusterId &&
			!sortedHipClusters.some(
				(cluster) =>
					cluster.id === selectedHipClusterId && cluster.typeId === typeId,
			)
		) {
			setSelectedHipClusterId("");
		}
	};

	const handleClusterChange = (clusterId: string) => {
		setSelectedHipClusterId(clusterId);
		setSelectedHipHazardId("");

		if (!clusterId) {
			return;
		}

		const matchedCluster = sortedHipClusters.find(
			(cluster) => cluster.id === clusterId,
		);
		if (matchedCluster) {
			setSelectedHipTypeId(matchedCluster.typeId);
		}
	};

	const selectSpecificHazard = (hazard: HipHazardItem) => {
		setSelectedHipHazardId(hazard.id);

		const matchedCluster = sortedHipClusters.find(
			(cluster) => cluster.id === hazard.clusterId,
		);
		if (matchedCluster) {
			setSelectedHipClusterId(matchedCluster.id);
			setSelectedHipTypeId(matchedCluster.typeId);
		}
	};

	const mockBackendLinkedEvents: LinkedEventOption[] = [
		{ id: "1", name: "Coastal Storm Delta", code: "DE-2024-001" },
		{ id: "2", name: "Industrial Leak - Benzene", code: "HE-2024-003" },
		{ id: "3", name: "Riverbank Flood", code: "FL-2024-011" },
		{ id: "4", name: "Power Grid Failure", code: "IN-2024-008" },
		{ id: "5", name: "Port Fuel Fire", code: "FI-2024-006" },
		{ id: "6", name: "Mountain Landslide", code: "GE-2024-014" },
		{ id: "7", name: "Hospital Oxygen Shortage", code: "HE-2024-017" },
		{ id: "8", name: "Pipeline Rupture - East", code: "IN-2024-021" },
		{ id: "9", name: "Warehouse Chemical Fire", code: "FI-2024-023" },
		{ id: "10", name: "Urban Flash Flood", code: "FL-2024-025" },
		{ id: "11", name: "Bridge Structural Failure", code: "IN-2024-028" },
		{ id: "12", name: "Cyclone Iris", code: "DE-2024-030" },
		{ id: "13", name: "Fuel Depot Explosion", code: "FI-2024-032" },
		{ id: "14", name: "Water Treatment Outage", code: "IN-2024-035" },
		{ id: "15", name: "Drought Escalation", code: "CL-2024-038" },
		{ id: "16", name: "Heatwave Alert Cluster", code: "CL-2024-041" },
		{ id: "17", name: "Cargo Train Derailment", code: "TR-2024-044" },
		{ id: "18", name: "Airport Fuel Spill", code: "TR-2024-046" },
		{ id: "19", name: "Substation Fire", code: "IN-2024-049" },
		{ id: "20", name: "River Contamination", code: "HE-2024-052" },
	];

	const mockBackendLinkedDisasterEvents: LinkedEventOption[] = [
		{ id: "d1", name: "Monsoon Flooding - Northern Basin", code: "DI-2024-101" },
		{ id: "d2", name: "Severe Drought - Central Plains", code: "DI-2024-103" },
		{ id: "d3", name: "Cyclone Aurora", code: "DI-2024-106" },
		{ id: "d4", name: "Earthquake Swarm - Western Ridge", code: "DI-2024-109" },
		{ id: "d5", name: "Volcanic Ash Dispersion", code: "DI-2024-112" },
		{ id: "d6", name: "Cross-Border River Flood", code: "DI-2024-115" },
		{ id: "d7", name: "Seasonal Heatwave Emergency", code: "DI-2024-118" },
		{ id: "d8", name: "Landslide Cluster - Hill District", code: "DI-2024-121" },
		{ id: "d9", name: "Tropical Storm Kendra", code: "DI-2024-124" },
		{ id: "d10", name: "Coastal Surge Impact", code: "DI-2024-127" },
		{ id: "d11", name: "Wildfire Expansion - South Range", code: "DI-2024-130" },
		{ id: "d12", name: "Urban Flood Emergency", code: "DI-2024-133" },
	];

	const mockBackendLinkedDisasterRecords: LinkedEventOption[] = [
		{ id: "r1", name: "Emergency Shelter Activation Record", code: "DR-2024-201" },
		{ id: "r2", name: "Damage Assessment Batch A", code: "DR-2024-204" },
		{ id: "r3", name: "Relief Distribution Log - East", code: "DR-2024-207" },
		{ id: "r4", name: "Casualty Verification Register", code: "DR-2024-210" },
		{ id: "r5", name: "Road Access Clearance Report", code: "DR-2024-213" },
		{ id: "r6", name: "Temporary Housing Intake", code: "DR-2024-216" },
		{ id: "r7", name: "Medical Supply Movement Sheet", code: "DR-2024-219" },
		{ id: "r8", name: "Livelihood Support Request File", code: "DR-2024-222" },
		{ id: "r9", name: "Water Trucking Operations Record", code: "DR-2024-225" },
		{ id: "r10", name: "Flood Barrier Deployment Note", code: "DR-2024-228" },
		{ id: "r11", name: "Power Restoration Tracking File", code: "DR-2024-231" },
		{ id: "r12", name: "Community Incident Consolidation", code: "DR-2024-234" },
	];

	const isStep1Complete =
		form.nameNational.trim().length > 0;

	const readFieldValue = (fieldId: keyof StepperFormState) => {
		const element = document.getElementById(fieldId) as
			| HTMLInputElement
			| HTMLSelectElement
			| HTMLTextAreaElement
			| null;
		if (!element) {
			return form[fieldId];
		}
		return element.value ?? "";
	};

	const saveCurrentFormState = (): StepperFormState => {
		const snapshot: StepperFormState = {
			id: readFieldValue("id"),
			nameNational: readFieldValue("nameNational"),
			nameGlobalOrRegional: readFieldValue("nameGlobalOrRegional"),
			nationalDisasterId: readFieldValue("nationalDisasterId"),
			glide: readFieldValue("glide"),
			recordingInstitution: readFieldValue("recordingInstitution"),
		};

		setForm((current) =>
			JSON.stringify(current) === JSON.stringify(snapshot)
				? current
				: snapshot,
		);

		return snapshot;
	};

	const validateStep1 = (formData: StepperFormState = form) => {
		const nextErrors: Errors = {};

		if (!formData.nameNational.trim()) {
			nextErrors.nameNational = "Name (National) is required";
		}

		setErrors(nextErrors);
		if (Object.keys(nextErrors).length > 0) {
			const firstInvalidField = requiredFieldOrder.find(
				(fieldName) => !!nextErrors[fieldName],
			);
			if (firstInvalidField) {
				requestAnimationFrame(() => {
					const element = document.getElementById(
						firstInvalidField,
					) as HTMLInputElement | null;
					element?.focus();
				});
			}
			return false;
		}

		return true;
	};

	const onStepSelect = (event: { index: number }) => {
		const snapshot = saveCurrentFormState();
		if (event.index > 0 && !validateStep1(snapshot)) {
			setActiveStep(0);
			return;
		}

		setActiveStep(event.index);
	};

	const goNext = () => {
		const snapshot = saveCurrentFormState();
		if (validateStep1(snapshot)) {
			setActiveStep(1);
		}
	};

	const goToAdditionalDetails = () => {
		const snapshot = saveCurrentFormState();
		if (validateStep1(snapshot)) {
			setActiveStep(2);
		}
	};

	const goToReview = () => {
		const snapshot = saveCurrentFormState();
		if (validateStep1(snapshot)) {
			setActiveStep(3);
		}
	};

	const saveAsDraft = () => {
		saveCurrentFormState();
	};

	const renderReviewItem = (label: string, value: string) => (
		<div className="space-y-1">
			<p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
				{label}
			</p>
			<p className="text-[14px] leading-[14px] font-semibold text-slate-800">{value || "-"}</p>
		</div>
	);

	const maxDetailItems = 5;
	const responseTypeOptions = ["Early action", "Response operation", "Coordination", "Evacuation"];
	const assessmentTypeOptions = ["Assessment", "Rapid assessment", "Needs assessment", "Sector assessment"];

	const openAddDetail = (category: AdditionalDetailCategory) => {
		const list = category === "response" ? responses : assessments;
		if (list.length >= maxDetailItems) {
			return;
		}

		setDetailDialogCategory(category);
		setEditingDetailId(null);
		setDetailForm({
			type: "",
			dateText: "",
			day: "",
			month: "",
			year: "",
			location: "",
			description: "",
		});
		setDetailDialogVisible(true);
	};

	const openEditDetail = (category: AdditionalDetailCategory, item: AdditionalDetailItem) => {
		setDetailDialogCategory(category);
		setEditingDetailId(item.id);
		setDetailForm({
			type: item.type,
			dateText: item.date,
			day: "",
			month: "",
			year: "",
			location: item.location,
			description: item.description,
		});
		setDetailDialogVisible(true);
	};

	const saveDetail = () => {
		const targetCategory = detailDialogCategory;
		const setTarget = targetCategory === "response" ? setResponses : setAssessments;
		const fallbackDate = [detailForm.day, detailForm.month, detailForm.year].filter(Boolean).join("/");
		const nextItem: AdditionalDetailItem = {
			id: editingDetailId ?? `${targetCategory}-${Date.now()}`,
			type: detailForm.type || (targetCategory === "response" ? "Response operation" : "Assessment"),
			date: detailForm.dateText || fallbackDate || "",
			location: detailForm.location || "Location not specified",
			description: detailForm.description || "",
		};

		setTarget((prev) => {
			if (editingDetailId) {
				return prev.map((item) => (item.id === editingDetailId ? nextItem : item));
			}

			if (prev.length >= maxDetailItems) {
				return prev;
			}

			return [...prev, nextItem];
		});

		setDetailDialogVisible(false);
	};

	const deleteDetail = () => {
		if (!editingDetailId) {
			return;
		}

		const setTarget = detailDialogCategory === "response" ? setResponses : setAssessments;
		setTarget((prev) => prev.filter((item) => item.id !== editingDetailId));
		setDetailDialogVisible(false);
	};

	const renderDetailCard = (category: AdditionalDetailCategory, item: AdditionalDetailItem) => {
		const badgeClass =
			category === "response"
				? "bg-blue-100 text-blue-700"
				: "bg-violet-100 text-violet-700";

		return (
			<Card
				key={item.id}
				className="rounded-2xl border border-slate-200 shadow-none"
				pt={{ body: { style: { padding: "14px 16px" } } }}
			>
				<div className="flex items-start justify-between gap-3">
					<div className="w-full">
						<div className="flex items-center gap-3">
							<span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${badgeClass}`}>
								{item.type}
							</span>
							<span className="text-[12px] text-slate-500">{item.date}</span>
						</div>
						<p className="mt-2 text-[16px] font-semibold text-slate-800">{item.location}</p>
						<p className="mt-1 text-[14px] text-slate-500">{item.description || "-"}</p>
					</div>
					<Button
						icon="pi pi-pencil"
						text
						rounded
						aria-label="Edit"
						onClick={() => openEditDetail(category, item)}
					/>
				</div>
			</Card>
		);
	};

	const renderEmptyDetails = (label: string) => (
		<div className="mt-4 rounded-xl border border-dashed border-slate-300 px-4 py-7 text-center text-[13px] text-slate-400">
			{label}
		</div>
	);

	const searchLinkedEvents = async (query: string) => {
		setLinkedEventLoading(true);

		await new Promise((resolve) => setTimeout(resolve, 450));

		const lowerQuery = query.trim().toLowerCase();
		const matched = mockBackendLinkedEvents.filter((item) => {
			if (!lowerQuery) {
				return true;
			}

			return (
				item.name.toLowerCase().includes(lowerQuery) ||
				item.code.toLowerCase().includes(lowerQuery)
			);
		});

		setLinkedEventSource(
			matched
				.filter(
					(item) => !linkedEventTarget.some((selected) => selected.id === item.id),
				)
				.slice(0, 10),
		);
		setLinkedEventLoading(false);
	};

	const searchLinkedDisasterEvents = async (query: string) => {
		setLinkedDisasterEventLoading(true);

		await new Promise((resolve) => setTimeout(resolve, 450));

		const lowerQuery = query.trim().toLowerCase();
		const matched = mockBackendLinkedDisasterEvents.filter((item) => {
			if (!lowerQuery) {
				return true;
			}

			return (
				item.name.toLowerCase().includes(lowerQuery) ||
				item.code.toLowerCase().includes(lowerQuery)
			);
		});

		setLinkedDisasterEventSource(
			matched
				.filter(
					(item) => !linkedDisasterEventTarget.some((selected) => selected.id === item.id),
				)
				.slice(0, 10),
		);
		setLinkedDisasterEventLoading(false);
	};

	const searchLinkedDisasterRecords = async (query: string) => {
		setLinkedDisasterRecordLoading(true);

		await new Promise((resolve) => setTimeout(resolve, 450));

		const lowerQuery = query.trim().toLowerCase();
		const matched = mockBackendLinkedDisasterRecords.filter((item) => {
			if (!lowerQuery) {
				return true;
			}

			return (
				item.name.toLowerCase().includes(lowerQuery) ||
				item.code.toLowerCase().includes(lowerQuery)
			);
		});

		setLinkedDisasterRecordSource(
			matched
				.filter(
					(item) => !linkedDisasterRecordTarget.some((selected) => selected.id === item.id),
				)
				.slice(0, 10),
		);
		setLinkedDisasterRecordLoading(false);
	};

	const linkedEventItemTemplate = (item: LinkedEventOption) => (
		<div>
			<p className="font-semibold text-slate-700">{item.name}</p>
			<p className="text-sm text-slate-500">{item.code}</p>
		</div>
	);

	const openSpatialDialog = (hint: "map" | "geographic") => {
		setSpatialDialogHint(hint);
		setSpatialFootprintDialogVisible(true);
	};

	useEffect(() => {
		firstNameTooltipRef.current?.updateTargetEvents();
	}, [activeStep]);

	useEffect(() => {
		searchLinkedEvents("");
		searchLinkedDisasterEvents("");
		searchLinkedDisasterRecords("");
	}, []);

	return (<>
		<style>{`
			.status-stepper .p-stepper-title::after {
				content: attr(data-status);
				display: block;
				margin-top: 2px;
				font-size: 12px;
				line-height: 16px;
				font-weight: 600;
				letter-spacing: 0.06em;
				text-transform: uppercase;
				color: #94a3b8;
			}

			.status-stepper .p-stepper-title[data-status="required"]::after {
				color: #94a3b8;
			}

			.status-stepper .p-stepper-title[data-status="optional"]::after {
				color: #9ca3af;
			}

			.status-stepper .p-stepper-nav {
				position: relative;
				padding: 30px 0;
				margin: 6px 0 16px;
			}

			.status-stepper .p-stepper-nav::before,
			.status-stepper .p-stepper-nav::after {
				content: "";
				position: absolute;
				left: 0;
				right: 0;
				height: 1px;
				background: #e2e8f0;
			}

			.status-stepper .p-stepper-nav::before {
				top: 0;
			}

			.status-stepper .p-stepper-nav::after {
				bottom: 0;
			}
		`}</style>
		<div className="mg-container">
			<section className="dts-page-section">
				<div className="mb-4">
					<div className="flex items-center justify-between px-4 py-2">
						<h2 className="text-[16px] font-semibold text-slate-800">
							{ctx.t({
								code: "disaster_event.edit",
								msg: "Edit disaster event",
							})}
						</h2>
						<Button
							icon="pi pi-times"
							text
							aria-label="Close"
							onClick={() => document.location.href = ctx.url("/disaster-event")}
						/>
					</div>
				</div>


				
				<Tooltip
					ref={firstNameTooltipRef}
					target=".first-name-tooltip"
					content="Enter the person's given name as shown on official records."
				/>
				<Stepper
					className="status-stepper"
					activeStep={activeStep}
					onChangeStep={onStepSelect}
					headerPosition="bottom"
					pt={{
						stepperpanel: {
							action: ({ context }: { context: { index: number } }) => ({
								disabled: context.index > 0 && !isStep1Complete,
								"aria-disabled": context.index > 0 && !isStep1Complete,
							}),
						},
					}}
				>
					<StepperPanel
						header="Basic Information"
						pt={{
							title: {
								style: { textAlign: "center" },
								"data-status": "required",
							},
						}}
					>
						<div className="grid grid-cols-12 gap-4">
							<div className="col-span-12 mb-4">
								<h2 className="text-[18px] leading-[24px] font-semibold text-slate-800 tracking-[-0.01em]">
									Event basics
								</h2>
								<p className="mt-2 text-[14px] leading-[22px] text-slate-500">
									General information about the disaster event.
								</p>
							</div>

							<div className="col-span-12 grid grid-cols-12 gap-4">
								<div className="col-span-12 md:col-span-4">
									<label htmlFor="nameNational" className="mb-1 inline-flex items-center gap-2">
										<span className="text-red-500">*</span> Disaster name - national
									</label>
									<InputText
										id="nameNational"
										defaultValue={form.nameNational}
										placeholder="For example, Hurricane Mitch"
										className="w-full"
										required={true}
									/>
									{errors.nameNational ? (
										<p className="mt-1 text-xs text-red-600">{errors.nameNational}</p>
									) : null}
								</div>

								<div className="col-span-12 md:col-span-4">
									<label htmlFor="nameGlobalOrRegional" className="mb-1 inline-flex items-center gap-2">
										Disaster name - Other (Global or Regional)
									</label>
									<InputText
										id="nameGlobalOrRegional"
										defaultValue={form.nameGlobalOrRegional}
										placeholder="Add event name"
										className="w-full"
									/>
								</div>

								<div className="col-span-12 md:col-span-4">
									<label htmlFor="nationalDisasterId" className="mb-1 inline-flex items-center gap-2">
										National event ID
									</label>
									<InputText
										id="nationalDisasterId"
										defaultValue={form.nationalDisasterId}
										placeholder="Add event ID"
										className="w-full"
									/>
								</div>

								<div className="col-span-12 md:col-span-4">
									<label htmlFor="glide" className="mb-1 inline-flex items-center gap-2">
										<span className="inline-flex items-center gap-1">
											GLIDE number
											<i className="pi pi-info-circle text-xs text-slate-400" aria-hidden="true" />
										</span>
									</label>
									<InputText
										id="glide"
										defaultValue={form.glide}
										placeholder="Add GLIDE number"
										className="w-full"
									/>
								</div>

								<div className="col-span-12 md:col-span-4">
									<label htmlFor="disasterEventId" className="mb-1 inline-flex items-center gap-2">
										Disaster event UUID
									</label>
									<div className="flex items-center gap-2">
										<InputText
											id="id"
											defaultValue={form.id}
											readOnly
											className="w-full"
										/>
	

										<Button
											icon="pi pi-copy"
											text
											rounded
											aria-label="Copy disaster event UUID"
											onClick={() => navigator.clipboard.writeText(form.id.toString())}
										/>
									</div>
								</div>

								<div className="col-span-12 md:col-span-4">
									<label htmlFor="recordingInstitution" className="mb-1 inline-flex items-center gap-2">
										Recording organisation
									</label>
									<InputText
										id="recordingInstitution"
										defaultValue={form.recordingInstitution}
										className="w-full"
									/>
								</div>
							</div>

							<div className="col-span-12 my-6 border-t border-slate-200" />

							<div className="col-span-12 mb-4">
								<h2 className="text-[18px] leading-[24px] font-semibold text-slate-800 tracking-[-0.01em]">
									Hazard and timing
								</h2>
								<p className="mt-2 text-[14px] leading-[22px] text-slate-500">
									Detailed information regarding the observed hazards and timing.
								</p>
							</div>

							<div className="col-span-12 grid grid-cols-12 gap-4">
								<div className="col-span-12 md:col-span-4">
									<label htmlFor="hazardTypeObserved" className="mb-1 inline-flex items-center gap-2">
										Hazard type (observed) <i className="pi pi-info-circle ml-1 text-xs text-slate-400" aria-hidden="true" />
									</label>
									<Dropdown
										id="hazardTypeObserved"
										value={selectedHipTypeId || null}
										options={hazardTypeOptions}
										onChange={(event) =>
											handleTypeChange(
												typeof event.value === "string" ? event.value : "",
											)
										}
										placeholder="Select hazard type"
										className="w-full"
										filter
										filterBy="label"
										showClear
									/>
									<input type="hidden" name="hipTypeId" value={selectedHipTypeId} />
								</div>

								<div className="col-span-12 md:col-span-4">
									<label htmlFor="hazardClusterObserved" className="mb-1 inline-flex items-center gap-2">
										Hazard cluster (observed) <i className="pi pi-info-circle ml-1 text-xs text-slate-400" aria-hidden="true" />
									</label>
									<Dropdown
										id="hazardClusterObserved"
										value={selectedHipClusterId || null}
										options={hazardClusterOptions}
										onChange={(event) =>
											handleClusterChange(
												typeof event.value === "string" ? event.value : "",
											)
										}
										placeholder="Select hazard cluster"
										className="w-full"
										filter
										filterBy="label"
										showClear
									/>
									<input type="hidden" name="hipClusterId" value={selectedHipClusterId} />
								</div>

								<div className="col-span-12 md:col-span-4">
									<label htmlFor="specificHazardObserved" className="mb-1 inline-flex items-center gap-2">
										Specific hazard (observed) <i className="pi pi-info-circle ml-1 text-xs text-slate-400" aria-hidden="true" />
									</label>
									<Dropdown
										id="specificHazardObserved"
										value={selectedHipHazardId || null}
										options={specificHazardOptions}
										onChange={(event) => {
											const hazardId =
												typeof event.value === "string" ? event.value : "";
											if (!hazardId) {
												setSelectedHipHazardId("");
												return;
											}

											const selectedHazard = sortedHipHazards.find(
												(item) => item.id === hazardId,
											);
											if (selectedHazard) {
												selectSpecificHazard(selectedHazard);
											}
										}}
										placeholder="Enter hazard name or HIPS code"
										className="w-full"
										filter
										filterBy="label"
										virtualScrollerOptions={{ itemSize: 38 }}
										showClear
									/>
									<input type="hidden" name="hipHazardId" value={selectedHipHazardId} />
								</div>

								<div className="col-span-12">
									<div className="grid grid-cols-12 gap-4">
										{renderDateWithPrecision(
											"startDate",
											"Start date",
											startDateState,
											setStartDateState,
										)}
										{renderDateWithPrecision(
											"endDate",
											"End date",
											endDateState,
											setEndDateState,
										)}

										<div className="col-span-12 md:col-span-6">
											<label htmlFor="startDateLocal" className="mb-1 inline-flex items-center gap-2">
												Start date in local format
											</label>
											<InputText
												id="startDateLocal"
												name="startDateLocal"
												value={startDateLocal}
												onChange={(event) => setStartDateLocal(event.target.value)}
												className="w-full"
											/>
										</div>

										<div className="col-span-12 md:col-span-6">
											<label htmlFor="endDateLocal" className="mb-1 inline-flex items-center gap-2">
												End date in local format
											</label>
											<InputText
												id="endDateLocal"
												name="endDateLocal"
												value={endDateLocal}
												onChange={(event) => setEndDateLocal(event.target.value)}
												className="w-full"
											/>
										</div>

										<input
											type="hidden"
											name="startDate"
											value={toDateWithPrecisionValue(startDateState)}
										/>
										<input
											type="hidden"
											name="endDate"
											value={toDateWithPrecisionValue(endDateState)}
										/>
									</div>
								</div>
							</div>

							<div className="col-span-12 my-6 border-t border-slate-200" />

							<div className="col-span-12 mb-2">
								<h2 className="text-[18px] leading-[24px] font-semibold text-slate-800 tracking-[-0.01em]">
									Disaster event spatial information
								</h2>
								<p className="mt-2 text-[14px] leading-[22px] text-slate-500">
									Indicate the geographic areas where the disaster event was experienced.
								</p>
							</div>

							<div className="col-span-12 space-y-4">
								<div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
									<div className="flex items-start justify-between gap-4">
										<div>
											<div className="flex items-center gap-2">
												<i className="pi pi-map-marker text-blue-500" />
												<h3 className="text-[18px] font-semibold text-slate-800">Geographical level</h3>
											</div>
											<p className="mt-2 text-[14px] leading-[22px] text-slate-500">
												Select the administrative areas where the disaster event was experienced.
											</p>
											<Button
												className="mt-4"
												label="Add affected areas"
												outlined
												icon="pi pi-plus"
												onClick={() => openSpatialDialog("geographic")}
											/>
											<div className="mt-6 flex flex-wrap gap-2 text-sm">
												{selectedDivisionItems.length > 0 &&
													selectedDivisionItems.map((item) => (
														<div
															key={item.key}
															className="inline-flex items-center gap-2 rounded-md bg-sky-100 px-3 py-2 text-sky-700"
														>
															<span>{item.label}</span>
															<button
																type="button"
																aria-label={`Remove ${item.label}`}
																onClick={() => removeDivisionSelection(item.key)}
																className="cursor-pointer text-sky-700 transition hover:text-sky-900"
															>
																×
															</button>
														</div>
													))}
											</div>
										</div>
										<i className="pi pi-chevron-right pt-2 text-slate-400" />
									</div>
								</div>

								<div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
									<div className="flex items-start justify-between gap-4">
										<div>
											<div className="flex items-center gap-2">
												<i className="pi pi-map text-blue-500" />
												<h3 className="text-[18px] font-semibold text-slate-800">Spatial footprint</h3>
											</div>
											<p className="mt-2 text-[14px] leading-[22px] text-slate-500">
												Define the specific geographic area affected using interactive map coordinates or manual input.
											</p>
											<Button
												className="mt-4"
												label="Define spatial footprint"
												outlined
												icon="pi pi-map"
												onClick={() => openSpatialDialog("map")}
											/>
										</div>
										<i className="pi pi-chevron-right pt-2 text-slate-400" />
									</div>
								</div>
							</div>

							<Dialog
								header={
									spatialDialogHint === "geographic"
										? "Select geographic levels"
										: "Define spatial footprint"
								}
								visible={spatialFootprintDialogVisible}
								style={{ width: "72rem", maxWidth: "95vw" }}
								onHide={() => setSpatialFootprintDialogVisible(false)}
								draggable={false}
								resizable={false}
								appendTo="self"
								footer={
									spatialDialogHint === "geographic" ? (
										<div className="flex items-center justify-between gap-3">
											<Button
												label="Cancel"
												outlined
												onClick={() => setSpatialFootprintDialogVisible(false)}
											/>
											<Button label="Save" onClick={saveDivisionSelection} />
										</div>
									) : null
								}
							>
								{spatialDialogHint === "geographic" ? (
									<div>
										<p className="mb-4 text-[13px] text-slate-500">
											Select one or more geographic levels from the hierarchical tree below.
										</p>
										<div className="mb-3 flex items-center gap-3">
											<div className="relative w-full">
												<i className="pi pi-search pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
												<InputText
													value={divisionSearchTerm}
													onChange={(event) => setDivisionSearchTerm(event.target.value)}
													placeholder="Search locations..."
													className="w-full pr-10"
												/>
											</div>
										</div>
										<div className="mb-3 flex items-center justify-between rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-slate-700">
											<div>
												{selectedDivisionCount} location
												{selectedDivisionCount === 1 ? " selected" : "s selected"}
											</div>
											<Button
												label="Clear all"
												text
												size="small"
												onClick={clearDivisionSelection}
											/>
										</div>
										<div className="max-h-[26rem] overflow-auto rounded-md border border-slate-200 bg-white p-3 shadow-sm">
											<Tree
												value={filteredDivisionNodes}
												selectionMode="checkbox"
												selectionKeys={selectedDivisionKeys}
												onSelectionChange={(e) =>
													setSelectedDivisionKeys(e.value)
												}
												className="w-full"
											/>
										</div>
									</div>
								) : (
									<p className="mb-4 text-[13px] text-slate-500">
										Use Add and choose Map coordinates to define the affected
										footprint.
									</p>
								)}
							</Dialog>
						</div>


						

						<div className="flex items-center justify-between w-full mt-6">
							<Button label="Cancel" outlined onClick={() => document.location.href = ctx.url("/disaster-event")} />
							<div className="flex gap-2">
								<Button label="Save as draft" outlined onClick={saveAsDraft} />
								<Button label="Next" icon="pi pi-chevron-right" iconPos="right" onClick={goNext} />
							</div>
						</div>
					</StepperPanel>

					<StepperPanel
						header="Linked events"
						pt={{
							title: {
								style: { textAlign: "center" },
								"data-status": "optional",
							},
						}}
					>
						<div className="col-span-12 mb-4">
							<h2 className="text-[18px] leading-[24px] font-semibold text-slate-800 tracking-[-0.01em]">
								Linked hazardous events
							</h2>
							<p className="mt-2 text-[14px] leading-[22px] text-slate-500">
								Link this disaster event to triggered hazardous events.
							</p>
						</div>
						<div className="space-y-4">
							<div>
								<div className="mt-2 flex gap-3">
									<div className="relative w-full">
										<i className="pi pi-search pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
										<InputText
											id="linkedEventSearch"
											value={linkedEventSearch}
											onChange={(event) => setLinkedEventSearch(event.target.value)}
											placeholder="Type to search hazardous events..."
											className="w-full pr-10"
										/>
									</div>
									<Button
										label={linkedEventLoading ? "Searching..." : "Search"}
										onClick={() => searchLinkedEvents(linkedEventSearch)}
										disabled={linkedEventLoading}
									/>
								</div>
							</div>

							<PickList
								dataKey="id"
								source={linkedEventSource}
								target={linkedEventTarget}
								onChange={(event) => {
									setLinkedEventSource(event.source);
									setLinkedEventTarget(event.target);
								}}
								itemTemplate={linkedEventItemTemplate}
								sourceHeader="Latest 10 hazardous events / Search results "
								targetHeader="Selected triggered (subsequent hazardous events)"
								sourceStyle={{ height: "18rem" }}
								targetStyle={{ height: "18rem" }}
								showSourceFilter={false}
								showTargetFilter={false}
							/>
						</div>
						
						<div className="col-span-12 mb-4 mt-8">
							<h2 className="text-[18px] leading-[24px] font-semibold text-slate-800 tracking-[-0.01em]">
								Linked disaster events
							</h2>
							<p className="mt-2 text-[14px] leading-[22px] text-slate-500">
								Link this disaster event to triggered disaster events.
							</p>
						</div>
						<div className="space-y-4">

							<div className="pt-4">
								<div className="mt-2 flex gap-3">
									<div className="relative w-full">
										<i className="pi pi-search pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
										<InputText
											id="linkedDisasterEventSearch"
											value={linkedDisasterEventSearch}
											onChange={(event) => setLinkedDisasterEventSearch(event.target.value)}
											placeholder="Type to search disaster events..."
											className="w-full pr-10"
										/>
									</div>
									<Button
										label={linkedDisasterEventLoading ? "Searching..." : "Search"}
										onClick={() => searchLinkedDisasterEvents(linkedDisasterEventSearch)}
										disabled={linkedDisasterEventLoading}
									/>
								</div>
							</div>

							<PickList
								dataKey="id"
								source={linkedDisasterEventSource}
								target={linkedDisasterEventTarget}
								onChange={(event) => {
									setLinkedDisasterEventSource(event.source);
									setLinkedDisasterEventTarget(event.target);
								}}
								itemTemplate={linkedEventItemTemplate}
								sourceHeader="Latest 10 disaster events / Search results"
								targetHeader="Selected  triggered (subsequent disaster events)"
								sourceStyle={{ height: "18rem" }}
								targetStyle={{ height: "18rem" }}
								showSourceFilter={false}
								showTargetFilter={false}
							/>
						</div>

						<div className="col-span-12 mb-4 mt-8">
							<h2 className="text-[18px] leading-[24px] font-semibold text-slate-800 tracking-[-0.01em]">
								Linked disaster records
							</h2>
							<p className="mt-2 text-[14px] leading-[22px] text-slate-500">
								Link this disaster event to related disaster records.
							</p>
						</div>
						<div className="space-y-4">
							<div className="pt-4">
								<div className="mt-2 flex gap-3">
									<div className="relative w-full">
										<i className="pi pi-search pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
										<InputText
											id="linkedDisasterRecordSearch"
											value={linkedDisasterRecordSearch}
											onChange={(event) => setLinkedDisasterRecordSearch(event.target.value)}
											placeholder="Type to search disaster records..."
											className="w-full pr-10"
										/>
									</div>
									<Button
										label={linkedDisasterRecordLoading ? "Searching..." : "Search"}
										onClick={() => searchLinkedDisasterRecords(linkedDisasterRecordSearch)}
										disabled={linkedDisasterRecordLoading}
									/>
								</div>
							</div>

							<PickList
								dataKey="id"
								source={linkedDisasterRecordSource}
								target={linkedDisasterRecordTarget}
								onChange={(event) => {
									setLinkedDisasterRecordSource(event.source);
									setLinkedDisasterRecordTarget(event.target);
								}}
								itemTemplate={linkedEventItemTemplate}
								sourceHeader="Latest 10 disaster records / Search results"
								targetHeader="Selected linked disaster records"
								sourceStyle={{ height: "18rem" }}
								targetStyle={{ height: "18rem" }}
								showSourceFilter={false}
								showTargetFilter={false}
							/>
						</div>

						<div className="flex items-center justify-between w-full mt-6">
							<Button
								label="Cancel"
								outlined
								onClick={() => (document.location.href = ctx.url("/disaster-event"))}
							/>
							<div className="flex gap-2">
								<Button label="Save as draft" outlined onClick={saveAsDraft} />
								<Button
									label="Back"
									outlined
									icon="pi pi-chevron-left"
									iconPos="left"
									onClick={() => {
										saveCurrentFormState();
										setActiveStep(0);
									}}
								/>
								<Button label="Next" icon="pi pi-chevron-right" iconPos="right" onClick={goToAdditionalDetails} />
							</div>
						</div>
					</StepperPanel>

					<StepperPanel
						header="Additional details"
						pt={{
							title: {
								style: { textAlign: "center" },
								"data-status": "optional",
							},
						}}
					>
						<div>
							<h3 className="text-[18px] leading-[24px] font-semibold text-slate-800">Additional details</h3>
							<p className="mt-2 text-[14px] text-slate-500">
								Document responses, assessments, and official declarations related to this disaster event.
							</p>

							<div className="mt-8 flex items-start justify-between gap-4">
								<div className="flex items-start gap-3">
									<div className="rounded-xl bg-blue-100 p-2">
										<i className="pi pi-file-edit text-blue-600" />
									</div>
									<div>
										<h4 className="text-[18px] leading-[24px] font-semibold text-slate-800">Responses</h4>
										<p className="text-[14px] text-slate-500">Track early actions and response operations</p>
									</div>
								</div>
								<Button
									label="Add response"
									icon="pi pi-plus"
									outlined
									disabled={responses.length >= maxDetailItems}
									onClick={() => openAddDetail("response")}
								/>
							</div>

							{responses.length > 0 ? (
								<div className="mt-4 space-y-3">
									{responses.map((item) => renderDetailCard("response", item))}
								</div>
							) : (
								renderEmptyDetails("No responses recorded yet")
							)}

							<div className="my-8 border-t border-slate-200" />

							<div className="flex items-start justify-between gap-4">
								<div className="flex items-start gap-3">
									<div className="rounded-xl bg-violet-100 p-2">
										<i className="pi pi-clipboard text-violet-600" />
									</div>
									<div>
										<h4 className="text-[18px] leading-[24px] font-semibold text-slate-800">Assessments</h4>
										<p className="text-[14px] text-slate-500">Document needs assessments and evaluations</p>
									</div>
								</div>
								<Button
									label="Add assessment"
									icon="pi pi-plus"
									outlined
									disabled={assessments.length >= maxDetailItems}
									onClick={() => openAddDetail("assessment")}
								/>
							</div>

							{assessments.length > 0 ? (
								<div className="mt-4 space-y-3">
									{assessments.map((item) => renderDetailCard("assessment", item))}
								</div>
							) : (
								renderEmptyDetails("No assessments recorded yet")
							)}

							<div className="my-8 border-t border-slate-200" />

							<div className="flex items-start justify-between gap-4">
								<div className="flex items-start gap-3">
									<div className="rounded-xl bg-amber-100 p-2">
										<i className="pi pi-send text-amber-600" />
									</div>
									<div>
										<h4 className="text-[18px] leading-[24px] font-semibold text-slate-800">Official declarations</h4>
										<p className="text-[14px] text-slate-500">Record official emergency declarations</p>
									</div>
								</div>
								<Button
									label="Add declaration"
									icon="pi pi-plus"
									outlined
									onClick={() => {
										setDeclarations((prev) => [...prev]);
									}}
								/>
							</div>

							{declarations.length > 0 ? (
								<div className="mt-4 space-y-3">
									{declarations.map((item) => renderDetailCard("response", item))}
								</div>
							) : (
								renderEmptyDetails("No declarations recorded yet")
							)}
						</div>

						<Dialog
							header={editingDetailId ? `Edit ${detailDialogCategory}` : `Add ${detailDialogCategory}`}
							visible={detailDialogVisible}
							style={{ width: "34rem" }}
							onHide={() => setDetailDialogVisible(false)}
							draggable={false}
							resizable={false}
						>
							<div className="space-y-4">
								<div>
									<label className="mb-1 block">Type</label>
									<select
										value={detailForm.type}
										onChange={(event) =>
											setDetailForm((state) => ({ ...state, type: event.target.value }))
										}
										className="w-full rounded-md border border-slate-300 px-3 py-2"
									>
										<option value="">Select type</option>
										{(detailDialogCategory === "response" ? responseTypeOptions : assessmentTypeOptions).map((option) => (
											<option key={option} value={option}>
												{option}
											</option>
										))}
									</select>
								</div>

								<div>
									<label className="mb-1 block">Date</label>
									<InputText
										value={detailForm.dateText}
										onChange={(event) =>
											setDetailForm((state) => ({ ...state, dateText: event.target.value }))
										}
										placeholder="Full date (DD/MM/YYYY)"
										className="w-full"
									/>
									<div className="mt-3 grid grid-cols-3 gap-2">
										<InputText
											value={detailForm.day}
											onChange={(event) => setDetailForm((state) => ({ ...state, day: event.target.value }))}
											placeholder="Day"
										/>
										<InputText
											value={detailForm.month}
											onChange={(event) => setDetailForm((state) => ({ ...state, month: event.target.value }))}
											placeholder="Month"
										/>
										<InputText
											value={detailForm.year}
											onChange={(event) => setDetailForm((state) => ({ ...state, year: event.target.value }))}
											placeholder="Year"
										/>
									</div>
								</div>

								<div>
									<label className="mb-1 block">Location</label>
									<InputText
										value={detailForm.location}
										onChange={(event) =>
											setDetailForm((state) => ({ ...state, location: event.target.value }))
										}
										placeholder="Search for a location..."
										className="w-full"
									/>
								</div>

								<div>
									<label className="mb-1 block">Description</label>
									<InputTextarea
										value={detailForm.description}
										onChange={(event) =>
											setDetailForm((state) => ({ ...state, description: event.target.value }))
										}
										rows={4}
										placeholder="Enter description"
										className="w-full"
									/>
								</div>

								<div className="flex items-center justify-between gap-2 pt-2">
									<div>
										{editingDetailId ? (
											<Button label="Delete" severity="danger" outlined onClick={deleteDetail} />
										) : null}
									</div>
									<div className="flex gap-2">
										<Button label="Cancel" outlined onClick={() => setDetailDialogVisible(false)} />
										<Button
											label={editingDetailId ? `Save ${detailDialogCategory}` : `Add ${detailDialogCategory}`}
											onClick={saveDetail}
										/>
									</div>
								</div>
							</div>
						</Dialog>

						<div className="flex items-center justify-between w-full mt-6">
							<Button
								label="Cancel"
								outlined
								onClick={() => (document.location.href = ctx.url("/disaster-event"))}
							/>
							<div className="flex gap-2">
								<Button label="Save as draft" outlined onClick={saveAsDraft} />
								<Button
									label="Back"
									outlined
									icon="pi pi-chevron-left"
									iconPos="left"
									onClick={() => {
										saveCurrentFormState();
										setActiveStep(1);
									}}
								/>
								<Button label="Next" icon="pi pi-chevron-right" iconPos="right" onClick={goToReview} />
							</div>
						</div>
					</StepperPanel>

					<StepperPanel
						header="Review and save"
						pt={{
							title: {
								style: { textAlign: "center" },
								"data-status": "required",
							},
						}}
					>
						<div className="space-y-5">
							<div>
								<h3 className="text-[18px] leading-[24px] font-semibold text-slate-800">
									Review and save
								</h3>
								<p className="mt-1 text-[14px] leading-[22px] text-slate-500">
									Verify the information before saving.
								</p>
							</div>

						<Card className="rounded-2xl border border-slate-200 shadow-none" pt={{ body: { style: { padding: '5px 20px 5px 20px' } } }}>
								<div className="space-y-6">
									<div className="flex items-center gap-2 text-slate-800">
										<i className="pi pi-info-circle text-blue-600" />
										<h4 className="text-[16px] leading-[16px] font-semibold">Basic information</h4>
									</div>
									<div className="grid grid-cols-1 gap-6 md:grid-cols-2">
										{renderReviewItem("Disaster name - national", form.nameNational)}
										{renderReviewItem("Disaster name - global/regional", form.nameGlobalOrRegional)}
										{renderReviewItem("National event ID", form.nationalDisasterId)}
										{renderReviewItem("GLIDE number", form.glide)}
										{renderReviewItem("Disaster event UUID", form.id)}
										{renderReviewItem("Recording organisation", form.recordingInstitution)}
									</div>
								</div>
							</Card>

						<Card className="rounded-2xl border border-slate-200 shadow-none" pt={{ body: { style: { padding: '5px 20px 5px 20px' } } }}>
								<div className="space-y-6">
									<div className="flex items-center gap-2 text-slate-800">
										<i className="pi pi-map-marker text-blue-600" />
										<h4 className="text-[16px] leading-[16px] font-semibold">Hazard classification</h4>
									</div>
									<div className="grid grid-cols-1 gap-6 md:grid-cols-2">
										{renderReviewItem(
											"Hazard type",
											sortedHipTypes.find((item) => item.id === selectedHipTypeId)?.name || "",
										)}
										{renderReviewItem(
											"Hazard cluster",
											sortedHipClusters.find((item) => item.id === selectedHipClusterId)?.name || "",
										)}
										{renderReviewItem(
											"Specific hazard",
											sortedHipHazards.find((item) => item.id === selectedHipHazardId)?.name || "",
										)}
										{renderReviewItem("HIPS code", selectedHipHazardId)}
									</div>
								</div>
							</Card>
						</div>

						<div className="flex items-center justify-between w-full mt-6">
							<Button
								label="Cancel"
								outlined
								onClick={() => (document.location.href = ctx.url("/disaster-event"))}
							/>
							<div className="flex gap-2">
								<Button label="Save as draft" outlined onClick={saveAsDraft} />
								<Button
									label="Back"
									outlined
									icon="pi pi-chevron-left"
									iconPos="left"
									onClick={() => {
										saveCurrentFormState();
										setActiveStep(2);
									}}
								/>
								<Button
									label="Save"
									onClick={() => {
										const snapshot = saveCurrentFormState();
										window.alert(JSON.stringify(snapshot, null, 2));
									}}
								/>
							</div>
						</div>
					</StepperPanel>
				</Stepper>
			</section>
		</div>
	</>);
}
