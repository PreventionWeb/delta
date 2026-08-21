import {
	Form as RouterForm,
	Outlet,
	useNavigate,
	useNavigation,
} from "react-router";
import {
	type Dispatch,
	type SetStateAction,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { Stepper } from "primereact/stepper";
import { StepperPanel } from "primereact/stepperpanel";
import { InputText } from "primereact/inputtext";
import { Button } from "primereact/button";
import { Tooltip } from "primereact/tooltip";
import { Card } from "primereact/card";
import { DataView } from "primereact/dataview";
import { Dialog } from "primereact/dialog";
import { Calendar } from "primereact/calendar";
import { Dropdown } from "primereact/dropdown";
import { InputTextarea } from "primereact/inputtextarea";
import { Toast } from "primereact/toast";
import { TreeSelect } from "primereact/treeselect";
import { ViewContext } from "~/frontend/context";
import { copyTextToClipboardWithToast } from "~/frontend/utils/clipboard";
import DisasterEventAttachment from "~/frontend/disaster-event/DisasterEventAttachment";
import DisasterEventLink, {
	type DisasterEventLinkItem,
	type EditableDisasterEventLink,
} from "~/frontend/disaster-event/DisasterEventLink";
import DisasterEventReviewStep from "~/frontend/disaster-event/DisasterEventReviewStep";
import LinkedHazardousEventCard from "~/frontend/disaster-event/LinkedHazardousEventCard";
import LinkedDisasterRecordCard from "~/frontend/disaster-event/LinkedDisasterRecordCard";
import {
	SaveSubmitDialog,
	type SaveAction,
} from "~/frontend/components/approval-workflow/SaveSubmitDialog";

type Errors = {
	nameNational?: string;
	startDate?: string;
	endDate?: string;
};

type LinkedEventOption = {
	id: string;
	name: string;
	code: string;
	hip?: string;
	dateLabel?: string;
	divisionNamesLabel?: string;
};

type AdditionalDetailCategory = "response" | "assessment" | "declaration";

type DeclarationStatusOption = {
	id: string;
	status: string;
	description: string | null;
};

type AdditionalDetailMeta = {
	declarationStatusId?: string;
	declarationStatus?: string;
	issuingOrganization?: string;
	assessmentTypeId?: string;
	otherSectors?: string;
	sectorIds?: string[];
};

type ResponseAttachmentValue = {
	id?: string;
	title?: string;
	fileKey?: string;
	fileName: string;
	fileType: string;
	fileSize: number;
	tempFilePath?: string;
	tenantPath?: string;
};

type AdditionalDetailItem = {
	id: string;
	type: string;
	date: string;
	coverage?: string;
	description: string;
	meta?: AdditionalDetailMeta;
	attachments?: ResponseAttachmentValue[];
};

type AdditionalDetailTypeOption = {
	value: string;
	label: string;
};

type AssessmentFieldIndex = 1 | 2 | 3 | 4 | 5;

type HazardPickerItem = {
	id: string;
	name: string;
	code?: string;
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
	nameNational: string;
	nameGlobalOrRegional: string;
	nationalDisasterId: string;
	glide: string;
	recordingOrganizationId: string;
	recordingOrganizationName: string;
};

type EventBasicsCompareFields = {
	id: string;
	nameNational: string;
	nameGlobalOrRegional: string;
	nationalDisasterId: string;
	glide: string;
	recordingOrganizationId: string;
	recordingOrganizationName: string;
};

type DatePrecision = "yyyy-mm-dd" | "yyyy-mm" | "yyyy";

type DateWithPrecisionState = {
	precision: DatePrecision;
	year: string;
	month: string;
	day: string;
};

export type SelectedDivisionItem = {
	key: string;
	label: string;
};

export type DisasterEventFormOutletContext = {
	selectedDivisionItems: SelectedDivisionItem[];
	setSelectedDivisionItems: Dispatch<SetStateAction<SelectedDivisionItem[]>>;
	spatialFootprintValue: any[];
	setSpatialFootprintValue: Dispatch<SetStateAction<any[]>>;
	disasterEventOptions: LinkedEventOption[];
	hazardousEventOptions: LinkedEventOption[];
	triggeringHazardousEventTarget: LinkedEventOption[];
	setTriggeringHazardousEventTarget: Dispatch<
		SetStateAction<LinkedEventOption[]>
	>;
	triggeredHazardousEventTarget: LinkedEventOption[];
	setTriggeredHazardousEventTarget: Dispatch<
		SetStateAction<LinkedEventOption[]>
	>;
	triggeringDisasterEventTarget: LinkedEventOption[];
	setTriggeringDisasterEventTarget: Dispatch<
		SetStateAction<LinkedEventOption[]>
	>;
	triggeredDisasterEventTarget: LinkedEventOption[];
	setTriggeredDisasterEventTarget: Dispatch<
		SetStateAction<LinkedEventOption[]>
	>;
	disasterRecordOptions: LinkedEventOption[];
	linkedDisasterRecordTarget: LinkedEventOption[];
	setLinkedDisasterRecordTarget: Dispatch<SetStateAction<LinkedEventOption[]>>;
};

const requiredFieldOrder: Array<keyof Errors> = ["nameNational"];

export function buildAssessmentSectorTree(
	sectors: Array<{ id: string; parentId: string | null; name: string }>,
) {
	const map = new Map<string, any>();
	const rootNodes: any[] = [];

	for (const sector of sectors) {
		map.set(sector.id, {
			key: sector.id,
			label: sector.name,
			data: { ...sector },
			children: [],
		});
	}

	for (const sector of sectors) {
		const node = map.get(sector.id);
		if (!node) {
			continue;
		}

		if (sector.parentId && map.has(sector.parentId)) {
			map.get(sector.parentId).children.push(node);
		} else {
			rootNodes.push(node);
		}
	}

	return rootNodes.sort((a, b) => a.label.localeCompare(b.label));
}

export function filterParentOnlySectorIds(
	sectors: Array<{ id: string; parentId: string | null }>,
	selectedIds: string[],
): string[] {
	const sectorParentMap = new Map(
		sectors.map((sector) => [sector.id, sector.parentId]),
	);
	const selected = new Set(
		selectedIds.map((value) => value.trim()).filter(Boolean),
	);
	const result: string[] = [];

	for (const sectorId of selected) {
		let parentId = sectorParentMap.get(sectorId) ?? null;
		let hasSelectedAncestor = false;
		while (parentId) {
			if (selected.has(parentId)) {
				hasSelectedAncestor = true;
				break;
			}
			parentId = sectorParentMap.get(parentId) ?? null;
		}

		if (!hasSelectedAncestor) {
			result.push(sectorId);
		}
	}

	return result;
}

export type TreeSelectSelectionKeys = Record<
	string,
	{ checked?: boolean; partialChecked?: boolean }
>;

export function buildTreeSelectSelectionKeys(
	sectors: Array<{ id: string; parentId: string | null }>,
	selectedIds: string[],
): TreeSelectSelectionKeys {
	const sectorParentMap = new Map(
		sectors.map((sector) => [sector.id, sector.parentId]),
	);
	const selected = new Set(
		selectedIds.map((value) => value.trim()).filter(Boolean),
	);
	const selectionKeys: TreeSelectSelectionKeys = {};

	for (const sectorId of selected) {
		selectionKeys[sectorId] = { checked: true };
	}

	for (const sectorId of selected) {
		let parentId = sectorParentMap.get(sectorId) ?? null;

		while (parentId) {
			if (!selected.has(parentId)) {
				selectionKeys[parentId] = {
					...(selectionKeys[parentId] ?? {}),
					partialChecked: true,
				};
			}

			parentId = sectorParentMap.get(parentId) ?? null;
		}
	}

	return selectionKeys;
}

const legacyDetailTypeToKey: Record<string, string> = {
	"Early action": "early_action",
	"Response operation": "response_operation",
	Coordination: "coordination",
	Evacuation: "evacuation",
	Assessment: "assessment",
	"Rapid assessment": "rapid_assessment",
	"Needs assessment": "needs_assessment",
	"Sector assessment": "sector_assessment",
	"Rapid/Preliminary assessment": "rapid_preliminary_assessment",
	"Post-disaster assessment": "post_disaster_assessment",
	"Other assessment": "other_assessment",
	"Disaster declaration": "disaster_declaration",
	"Disaster declaration effects": "disaster_declaration_effects",
	"Official Warning": "official_warning",
};

function normalizeDetailTypeValue(value: string): string {
	return legacyDetailTypeToKey[value] ?? value;
}

function extensionFromName(fileName: string): string {
	const segments = fileName.split(".");
	if (segments.length < 2) return "";
	return segments[segments.length - 1].toLowerCase();
}

function formatFileSize(fileSize: number): string {
	if (!Number.isFinite(fileSize) || fileSize <= 0) {
		return "0 B";
	}

	const units = ["B", "KB", "MB", "GB"];
	let unitIndex = 0;
	let value = fileSize;

	while (value >= 1024 && unitIndex < units.length - 1) {
		value /= 1024;
		unitIndex += 1;
	}

	const fixed =
		value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1);
	return `${fixed} ${units[unitIndex]}`;
}

function getFileIconClass(fileName: string): string {
	const ext = extensionFromName(fileName);

	if (["pdf"].includes(ext)) return "pi pi-file-pdf";
	if (["doc", "docx"].includes(ext)) return "pi pi-file-word";
	if (["xls", "xlsx"].includes(ext)) return "pi pi-file-excel";
	if (["ppt", "pptx"].includes(ext)) return "pi pi-file";
	if (["jpg", "png", "gif", "webp"].includes(ext)) return "pi pi-image";
	if (["mp3", "wav", "m4a"].includes(ext)) return "pi pi-volume-up";
	if (["mp4", "mov"].includes(ext)) return "pi pi-video";

	return "pi pi-file";
}

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
		startDateTime?: string | null;
		endDate?: string | null;
		endDateTime?: string | null;
		hipTypeId?: string | null;
		hipClusterId?: string | null;
		hipHazardId?: string | null;
		disasterEventId?: string | null;
		recordingOrganizationId?: string | null;
		recordingOrganizationName?: string | null;
		id?: string | null;
		spatialFootprint?: unknown;
		rapidOrPreliminaryAssessmentDescription1?: string | null;
		rapidOrPreliminaryAssessmentDate1?: string | Date | null;
		rapidOrPreliminaryAssessmentDescription2?: string | null;
		rapidOrPreliminaryAssessmentDate2?: string | Date | null;
		rapidOrPreliminaryAssessmentDescription3?: string | null;
		rapidOrPreliminaryAssessmentDate3?: string | Date | null;
		rapidOrPreliminaryAssessmentDescription4?: string | null;
		rapidOrPreliminaryAssessmentDate4?: string | Date | null;
		rapidOrPreliminaryAssessmentDescription5?: string | null;
		rapidOrPreliminaryAssessmentDate5?: string | Date | null;
		postDisasterAssessmentDescription1?: string | null;
		postDisasterAssessmentDate1?: string | Date | null;
		postDisasterAssessmentDescription2?: string | null;
		postDisasterAssessmentDate2?: string | Date | null;
		postDisasterAssessmentDescription3?: string | null;
		postDisasterAssessmentDate3?: string | Date | null;
		postDisasterAssessmentDescription4?: string | null;
		postDisasterAssessmentDate4?: string | Date | null;
		postDisasterAssessmentDescription5?: string | null;
		postDisasterAssessmentDate5?: string | Date | null;
		otherAssessmentDescription1?: string | null;
		otherAssessmentDate1?: string | Date | null;
		otherAssessmentDescription2?: string | null;
		otherAssessmentDate2?: string | Date | null;
		otherAssessmentDescription3?: string | null;
		otherAssessmentDate3?: string | Date | null;
		otherAssessmentDescription4?: string | null;
		otherAssessmentDate4?: string | Date | null;
		otherAssessmentDescription5?: string | null;
		otherAssessmentDate5?: string | Date | null;
		hadOfficialWarningOrWeatherAdvisory?: boolean | null;
		officialWarningAffectedAreas?: string | null;
	} | null;
	disasterEventAttachments: Array<{
		id: string;
		fileKey: string;
		fileName: string;
		fileType: string;
		fileSize: number;
		createdAt: string | Date;
	}>;
	disasterEventResponses: Array<{
		id: string;
		responseType: string;
		responseDate: string | Date | null;
		coverage: string | null;
		description: string | null;
	}>;
	disasterEventResponseAttachments: Array<{
		id: string;
		disasterEventResponseId: string;
		title: string;
		fileKey: string;
		fileName: string;
		fileType: string;
		fileSize: number;
		createdAt: string | Date;
		updatedAt: string | Date | null;
	}>;
	disasterEventAssessments: Array<{
		id: string;
		assessmentType: string;
		assessmentTypeId?: string | null;
		assessmentDate: string | Date | null;
		coverage: string | null;
		description: string | null;
		otherSectors: string | null;
	}>;
	disasterEventAssessmentAttachments: Array<{
		id: string;
		disasterEventAssessmentId: string;
		title: string;
		fileKey: string;
		fileName: string;
		fileType: string;
		fileSize: number;
		createdAt: string | Date;
		updatedAt: string | Date | null;
	}>;
	disasterEventAssessmentSectors: Array<{
		disasterEventAssessmentId: string;
		sectorId: string;
	}>;
	disasterEventDeclarations: Array<{
		id: string;
		type: string | null;
		effects: string | null;
		declarationDate: string | Date | null;
		issuingOrganization: string | null;
		coverage: string | null;
		declarationStatusId: string | null;
		declarationStatus: string | null;
		declarationStatusDescription: string | null;
	}>;
	disasterEventDeclarationAttachments: Array<{
		id: string;
		disasterEventDeclarationId: string;
		title: string;
		fileKey: string;
		fileName: string;
		fileType: string;
		fileSize: number;
		createdAt: string | Date;
		updatedAt: string | Date | null;
	}>;
	disasterEventLinks: DisasterEventLinkItem[];
	hazardousEventOptions: LinkedEventOption[];
	linkedTriggeringHazardousEvents: LinkedEventOption[];
	linkedTriggeredHazardousEvents: LinkedEventOption[];
	disasterEventOptions: LinkedEventOption[];
	linkedTriggeringDisasterEvents: LinkedEventOption[];
	linkedTriggeredDisasterEvents: LinkedEventOption[];
	disasterRecordOptions: LinkedEventOption[];
	linkedDisasterRecords: LinkedEventOption[];
	currentUserOrganization: {
		id: string;
		name: string;
	} | null;
	user: {
		role?: string | null;
	} | null;
	usersWithValidatorRole: Array<{
		id: string;
		firstName: string;
		lastName: string;
		email: string;
	}>;
	responseTypes: Array<{
		id: string;
		type: string;
	}>;
	assessmentTypes: Array<{
		id: string;
		type: string;
	}>;
	sectorOptions: Array<{
		id: string;
		parentId: string | null;
		name: string;
	}>;
	declarationStatuses: DeclarationStatusOption[];
	serverFormErrors?: string[];
};

type NewAttachmentUpload = {
	fileName: string;
	fileType: string;
	fileSize: number;
	tempFilePath: string;
	tenantPath?: string;
};

function StepperValidation({
	ctx,
	disasterEvent,
	disasterEventAttachments,
	disasterEventResponses,
	disasterEventResponseAttachments,
	disasterEventAssessments,
	disasterEventAssessmentAttachments,
	disasterEventAssessmentSectors,
	disasterEventDeclarations,
	disasterEventDeclarationAttachments,
	disasterEventLinks: initialDisasterEventLinks,
	hip,
	hazardousEventOptions,
	linkedTriggeringHazardousEvents,
	linkedTriggeredHazardousEvents,
	disasterEventOptions,
	linkedTriggeringDisasterEvents,
	linkedTriggeredDisasterEvents,
	disasterRecordOptions,
	linkedDisasterRecords,
	currentUserOrganization,
	user,
	usersWithValidatorRole,
	responseTypes,
	assessmentTypes,
	sectorOptions,
	declarationStatuses,
	serverFormErrors = [],
}: StepperValidationProps) {
	const navigate = useNavigate();
	const navigation = useNavigation();
	const isOpeningAffectedAreasModal =
		navigation.state !== "idle" &&
		navigation.location?.pathname.includes("/affected-areas-modal");
	const isOpeningLinkedTriggeringDisasterEventsModal =
		navigation.state !== "idle" &&
		navigation.location?.pathname.includes(
			"/linked-triggering-disaster-events-modal",
		);
	const isOpeningLinkedTriggeredDisasterEventsModal =
		navigation.state !== "idle" &&
		navigation.location?.pathname.includes(
			"/linked-triggered-disaster-events-modal",
		);
	const isOpeningLinkedTriggeringHazardousEventsModal =
		navigation.state !== "idle" &&
		navigation.location?.pathname.includes(
			"/linked-triggering-hazardous-events-modal",
		);
	const isOpeningLinkedTriggeredHazardousEventsModal =
		navigation.state !== "idle" &&
		navigation.location?.pathname.includes(
			"/linked-triggered-hazardous-events-modal",
		);
	const isOpeningLinkedDisasterRecordsModal =
		navigation.state !== "idle" &&
		navigation.location?.pathname.includes("/linked-disaster-records-modal");
	const isOpeningSpatialFootprintModal =
		navigation.state !== "idle" &&
		navigation.location?.pathname.includes("/spatial-footprint-modal");
	const [selectedDivisionItems, setSelectedDivisionItems] = useState<
		SelectedDivisionItem[]
	>(() => {
		try {
			const spatial = Array.isArray(disasterEvent?.spatialFootprint)
				? disasterEvent.spatialFootprint
				: typeof disasterEvent?.spatialFootprint === "string"
					? JSON.parse(disasterEvent.spatialFootprint)
					: [];

			if (!Array.isArray(spatial)) {
				return [];
			}

			const byId = new Map<string, string>();
			for (const item of spatial) {
				const maybeItem = item as any;
				const geojson = maybeItem?.geojson as any;
				const properties = geojson?.properties;
				const divisionId =
					typeof maybeItem?.division_id === "string"
						? maybeItem.division_id
						: typeof properties?.division_id === "string"
							? properties.division_id
							: null;

				if (!divisionId) {
					continue;
				}

				const label =
					typeof maybeItem?.geographic_level === "string" &&
					maybeItem.geographic_level.trim().length > 0
						? maybeItem.geographic_level.trim()
						: typeof maybeItem?.title === "string" &&
							  maybeItem.title.trim().length > 0
							? maybeItem.title.trim()
							: divisionId;

				if (!byId.has(divisionId)) {
					byId.set(divisionId, label);
				}
			}

			return Array.from(byId.entries()).map(([key, label]) => ({
				key,
				label,
			}));
		} catch {
			return [];
		}
	});
	const [keptAttachmentIds, setKeptAttachmentIds] = useState<string[]>(() =>
		disasterEventAttachments.map((attachment) => attachment.id),
	);
	const [newAttachmentUploads, setNewAttachmentUploads] = useState<
		NewAttachmentUpload[]
	>([]);
	const [disasterEventLinks, setDisasterEventLinks] = useState<
		EditableDisasterEventLink[]
	>(() =>
		initialDisasterEventLinks.map((link) => ({
			id: link.id,
			url: link.url,
			title: link.title ?? "",
		})),
	);

	const removeDivisionSelection = (keyToRemove: string) => {
		setSelectedDivisionItems((current) =>
			current.filter((item) => item.key !== keyToRemove),
		);
	};

	const resolvedRecordingOrganizationId =
		disasterEvent?.recordingOrganizationId ?? currentUserOrganization?.id ?? "";
	const resolvedRecordingOrganizationName =
		disasterEvent?.recordingOrganizationName ??
		currentUserOrganization?.name ??
		"";

	const eventBasicsInitialValues: EventBasicsCompareFields = {
		id: disasterEvent?.id ?? "",
		nameNational: disasterEvent?.nameNational ?? "",
		nameGlobalOrRegional: disasterEvent?.nameGlobalOrRegional ?? "",
		nationalDisasterId: disasterEvent?.nationalDisasterId ?? "",
		glide: disasterEvent?.glide ?? "",
		recordingOrganizationId: resolvedRecordingOrganizationId,
		recordingOrganizationName: resolvedRecordingOrganizationName,
	};
	const [activeStep, setActiveStep] = useState(0);
	const [form, setForm] = useState<StepperFormState>({
		id: eventBasicsInitialValues.id,
		nameNational: disasterEvent?.nameNational ?? "",
		nameGlobalOrRegional: disasterEvent?.nameGlobalOrRegional ?? "",
		nationalDisasterId: disasterEvent?.nationalDisasterId ?? "",
		glide: disasterEvent?.glide ?? "",
		recordingOrganizationId: eventBasicsInitialValues.recordingOrganizationId,
		recordingOrganizationName:
			eventBasicsInitialValues.recordingOrganizationName,
	});

	const parseDateWithPrecision = (
		value: string | null | undefined,
	): DateWithPrecisionState => {
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

	const parseBackendTime = (value: string | null | undefined): Date | null => {
		if (!value) {
			return null;
		}

		const match = String(value)
			.trim()
			.match(/^(\d{2}):(\d{2})(?::(\d{2}))?/);
		if (!match) {
			return null;
		}

		const hours = Number(match[1]);
		const minutes = Number(match[2]);
		const seconds = Number(match[3] ?? "0");

		if (
			Number.isNaN(hours) ||
			Number.isNaN(minutes) ||
			Number.isNaN(seconds) ||
			hours < 0 ||
			hours > 23 ||
			minutes < 0 ||
			minutes > 59 ||
			seconds < 0 ||
			seconds > 59
		) {
			return null;
		}

		const parsed = new Date();
		parsed.setHours(hours, minutes, seconds, 0);
		return parsed;
	};

	const formatTimeForSubmit = (value: Date | null): string => {
		if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
			return "";
		}

		const hours = String(value.getHours()).padStart(2, "0");
		const minutes = String(value.getMinutes()).padStart(2, "0");
		const seconds = String(value.getSeconds()).padStart(2, "0");
		return `${hours}:${minutes}:${seconds}`;
	};

	const toComparableBoundaryDate = (
		state: DateWithPrecisionState,
		boundary: "start" | "end",
	): string => {
		if (state.precision === "yyyy") {
			return boundary === "start"
				? `${state.year}-01-01`
				: `${state.year}-12-31`;
		}

		if (state.precision === "yyyy-mm") {
			if (boundary === "start") {
				return `${state.year}-${state.month}-01`;
			}

			const lastDayOfMonth = new Date(
				Date.UTC(Number(state.year), Number(state.month), 0),
			)
				.getUTCDate()
				.toString()
				.padStart(2, "0");
			return `${state.year}-${state.month}-${lastDayOfMonth}`;
		}

		return `${state.year}-${state.month}-${state.day}`;
	};

	const validateDateWithPrecisionState = (
		label: string,
		state: DateWithPrecisionState,
	): string | null => {
		const hasAnyDateValue =
			state.year.trim().length > 0 ||
			state.month.trim().length > 0 ||
			state.day.trim().length > 0;

		if (!hasAnyDateValue) {
			return null;
		}

		if (state.precision === "yyyy") {
			if (!/^\d{4}$/.test(state.year)) {
				return ctx.t(
					{
						code: "disaster_event.form.validation.year_must_be_4_digits",
						msg: "{label} year must be 4 digits",
					},
					{ label },
				);
			}
			return null;
		}

		if (state.precision === "yyyy-mm") {
			if (!/^\d{4}$/.test(state.year) || !/^\d{2}$/.test(state.month)) {
				return ctx.t(
					{
						code: "disaster_event.form.validation.requires_year_and_month",
						msg: "{label} requires both year and month",
					},
					{ label },
				);
			}

			const monthNumber = Number(state.month);
			if (monthNumber < 1 || monthNumber > 12) {
				return ctx.t(
					{
						code: "disaster_event.form.validation.month_invalid",
						msg: "{label} month is invalid",
					},
					{ label },
				);
			}

			return null;
		}

		if (
			!/^\d{4}$/.test(state.year) ||
			!/^\d{2}$/.test(state.month) ||
			!/^\d{2}$/.test(state.day)
		) {
			return ctx.t(
				{
					code: "disaster_event.form.validation.requires_complete_date",
					msg: "{label} requires a complete date",
				},
				{ label },
			);
		}

		const yearNumber = Number(state.year);
		const monthNumber = Number(state.month);
		const dayNumber = Number(state.day);
		const parsedDate = new Date(yearNumber, monthNumber - 1, dayNumber);
		const isValidDate =
			parsedDate.getFullYear() === yearNumber &&
			parsedDate.getMonth() === monthNumber - 1 &&
			parsedDate.getDate() === dayNumber;

		if (!isValidDate) {
			return ctx.t(
				{
					code: "disaster_event.form.validation.is_invalid",
					msg: "{label} is invalid",
				},
				{ label },
			);
		}

		return null;
	};

	const [startDateState, setStartDateState] = useState<DateWithPrecisionState>(
		parseDateWithPrecision(disasterEvent?.startDate),
	);
	const [endDateState, setEndDateState] = useState<DateWithPrecisionState>(
		parseDateWithPrecision(disasterEvent?.endDate),
	);
	const [startTime, setStartTime] = useState<Date | null>(() =>
		parseBackendTime(disasterEvent?.startDateTime),
	);
	const [endTime, setEndTime] = useState<Date | null>(() =>
		parseBackendTime(disasterEvent?.endDateTime),
	);
	const [spatialFootprintValue, setSpatialFootprintValue] = useState<any[]>(
		() => {
			try {
				if (Array.isArray(disasterEvent?.spatialFootprint)) {
					return disasterEvent.spatialFootprint as any[];
				}
				if (typeof disasterEvent?.spatialFootprint === "string") {
					return JSON.parse(disasterEvent.spatialFootprint) || [];
				}
			} catch {
				// Ignore parse failures and fallback to empty list
			}
			return [];
		},
	);

	const renderDateWithPrecision = (
		prefix: "startDate" | "endDate",
		label: string,
		state: DateWithPrecisionState,
		setState: React.Dispatch<React.SetStateAction<DateWithPrecisionState>>,
		errorMessage?: string,
	) => {
		const isFullDate = state.precision === "yyyy-mm-dd";
		const isYearMonth = state.precision === "yyyy-mm";
		const isYearOnly = state.precision === "yyyy";
		const timeLabel =
			prefix === "startDate"
				? ctx.t({ code: "start_time", msg: "Start time" })
				: ctx.t({ code: "end_time", msg: "End time" });
		const timePlaceholder = ctx.t({
			code: "time_placeholder_24h",
			msg: "Time (24h, e.g. 14:30)",
		});
		const timeValue = prefix === "startDate" ? startTime : endTime;

		return (
			<>
				<div className="col-span-12 md:col-span-4">
					<label
						htmlFor={`${prefix}Format`}
						className="mb-1 inline-flex items-center gap-2"
					>
						{ctx.t(
							{
								code: "disaster_event.form.date_format_label",
								msg: "{label} format",
							},
							{ label },
						)}
					</label>
					<Dropdown
						id={`${prefix}Format`}
						value={state.precision || null}
						options={datePrecisionOptions}
						optionLabel="label"
						optionValue="value"
						onChange={(event) => {
							const precision =
								typeof event.value === "string"
									? (event.value as DatePrecision)
									: ("yyyy-mm-dd" as DatePrecision);
							setState((current) => ({
								...current,
								precision,
								month: precision === "yyyy" ? "" : current.month,
								day: precision === "yyyy-mm-dd" ? current.day : "",
							}));
						}}
						placeholder={ctx.t({
							code: "disaster_event.form.select_format",
							msg: "Select format",
						})}
						className="w-full"
					/>
				</div>

				<div className="col-span-12 md:col-span-4">
					{isFullDate ? (
						<>
							<label
								htmlFor={`${prefix}Date`}
								className="mb-1 inline-flex items-center gap-2"
							>
								{label}
							</label>
							<Calendar
								id={`${prefix}DateCalendar`}
								inputId={`${prefix}Date`}
								value={
									state.year.length === 4 &&
									state.month.length === 2 &&
									state.day.length === 2
										? new Date(
												Number(state.year),
												Number(state.month) - 1,
												Number(state.day),
											)
										: null
								}
								onChange={(event) => {
									const selected = event.value;
									if (
										!(selected instanceof Date) ||
										Number.isNaN(selected.getTime())
									) {
										setState((current) => ({
											...current,
											year: "",
											month: "",
											day: "",
										}));
										return;
									}

									const year = String(selected.getFullYear());
									const month = String(selected.getMonth() + 1).padStart(
										2,
										"0",
									);
									const day = String(selected.getDate()).padStart(2, "0");
									setState((current) => ({
										...current,
										year,
										month,
										day,
									}));
								}}
								dateFormat="yy-mm-dd"
								placeholder={ctx.t({
									code: "disaster_event.form.placeholder.yyyy_mm_dd",
									msg: "YYYY-MM-DD",
								})}
								showIcon
								className="w-full"
							/>
						</>
					) : null}

					{isYearMonth ? (
						<>
							<label
								htmlFor={`${prefix}Month`}
								className="mb-1 inline-flex items-center gap-2"
							>
								{label}
							</label>
							<Calendar
								id={`${prefix}Month`}
								value={
									/^\d{4}$/.test(state.year) && /^\d{2}$/.test(state.month)
										? new Date(Number(state.year), Number(state.month) - 1, 1)
										: null
								}
								onChange={(e) => {
									const selected = e.value;
									if (
										!(selected instanceof Date) ||
										Number.isNaN(selected.getTime())
									) {
										setState((current) => ({
											...current,
											year: "",
											month: "",
										}));
										return;
									}

									setState((current) => ({
										...current,
										year: String(selected.getFullYear()),
										month: String(selected.getMonth() + 1).padStart(2, "0"),
									}));
								}}
								view="month"
								dateFormat="yy-mm"
								placeholder={ctx.t({
									code: "disaster_event.form.placeholder.yyyy_mm",
									msg: "YYYY-MM",
								})}
								showIcon
								className="w-full"
							/>
						</>
					) : null}

					{isYearOnly ? (
						<>
							<label
								htmlFor={`${prefix}Year`}
								className="mb-1 inline-flex items-center gap-2"
							>
								{label}
							</label>
							<Calendar
								id={`${prefix}Year`}
								value={
									/^\d{4}$/.test(state.year)
										? new Date(Number(state.year), 0, 1)
										: null
								}
								onChange={(e) => {
									const selected = e.value;
									setState((current) => ({
										...current,
										year:
											selected instanceof Date
												? String(selected.getFullYear())
												: "",
									}));
								}}
								view="year"
								dateFormat="yy"
								placeholder={ctx.t({
									code: "disaster_event.form.placeholder.yyyy",
									msg: "YYYY",
								})}
								showIcon
								className="w-full"
							/>
						</>
					) : null}

					{errorMessage ? (
						<p className="mt-1 text-xs text-red-600">{errorMessage}</p>
					) : null}
				</div>

				<div className="col-span-12 md:col-span-4">
					<label
						htmlFor={`${prefix}Time`}
						className="mb-1 flex items-center gap-2"
					>
						{timeLabel}
					</label>
					<Calendar
						id={`${prefix}Time`}
						value={timeValue}
						onChange={(e) => {
							const selected = e.value;
							const parsed =
								selected instanceof Date && !Number.isNaN(selected.getTime())
									? selected
									: null;

							if (prefix === "startDate") {
								setStartTime(parsed);
								return;
							}

							setEndTime(parsed);
						}}
						timeOnly
						showIcon
						icon="pi pi-clock"
						placeholder={timePlaceholder}
						className="w-full"
					/>
				</div>
			</>
		);
	};
	const [triggeringHazardousEventTarget, setTriggeringHazardousEventTarget] =
		useState<LinkedEventOption[]>(() => linkedTriggeringHazardousEvents);
	const [triggeredHazardousEventTarget, setTriggeredHazardousEventTarget] =
		useState<LinkedEventOption[]>(() => linkedTriggeredHazardousEvents);
	const [triggeringDisasterEventTarget, setTriggeringDisasterEventTarget] =
		useState<LinkedEventOption[]>(() => linkedTriggeringDisasterEvents);
	const [triggeredDisasterEventTarget, setTriggeredDisasterEventTarget] =
		useState<LinkedEventOption[]>(() => linkedTriggeredDisasterEvents);
	const [linkedDisasterRecordTarget, setLinkedDisasterRecordTarget] = useState<
		LinkedEventOption[]
	>(() => linkedDisasterRecords);

	const formatBackendDate = (
		value: string | Date | null | undefined,
	): string => {
		if (!value) {
			return "";
		}

		const dateValue = value instanceof Date ? value : new Date(value);
		if (Number.isNaN(dateValue.getTime())) {
			return "";
		}

		const day = String(dateValue.getUTCDate()).padStart(2, "0");
		const month = String(dateValue.getUTCMonth() + 1).padStart(2, "0");
		const year = String(dateValue.getUTCFullYear());
		return `${day}/${month}/${year}`;
	};

	const mapEarlyActionToResponses = (): AdditionalDetailItem[] => {
		const attachmentsByResponseId = new Map<
			string,
			ResponseAttachmentValue[]
		>();
		for (const attachment of disasterEventResponseAttachments) {
			const existing =
				attachmentsByResponseId.get(attachment.disasterEventResponseId) ?? [];
			existing.push({
				id: attachment.id,
				title: attachment.title,
				fileKey: attachment.fileKey,
				fileName: attachment.fileName,
				fileType: attachment.fileType,
				fileSize: attachment.fileSize,
			});
			attachmentsByResponseId.set(attachment.disasterEventResponseId, existing);
		}

		return disasterEventResponses.reduce<AdditionalDetailItem[]>(
			(accumulator, item, index) => {
				const normalizedType = normalizeDetailTypeValue(item.responseType);
				const coverageText = String(item.coverage ?? "").trim();
				const descriptionText = String(item.description ?? "").trim();
				const formattedDate = formatBackendDate(item.responseDate);
				const attachments = item.id
					? (attachmentsByResponseId.get(item.id) ?? [])
					: [];

				if (
					!coverageText &&
					!descriptionText &&
					!formattedDate &&
					attachments.length === 0
				) {
					return accumulator;
				}

				accumulator.push({
					id: item.id || `response-${normalizedType}-${index}`,
					type: normalizedType,
					date: formattedDate,
					coverage: coverageText,
					description: descriptionText,
					attachments,
				});

				return accumulator;
			},
			[],
		);
	};

	const mapAssessmentsToItems = (): AdditionalDetailItem[] => {
		const assessmentAttachmentsById = new Map<
			string,
			ResponseAttachmentValue[]
		>();
		for (const attachment of disasterEventAssessmentAttachments) {
			const existing =
				assessmentAttachmentsById.get(attachment.disasterEventAssessmentId) ??
				[];
			existing.push({
				id: attachment.id,
				title: attachment.title,
				fileKey: attachment.fileKey,
				fileName: attachment.fileName,
				fileType: attachment.fileType,
				fileSize: attachment.fileSize,
			});
			assessmentAttachmentsById.set(
				attachment.disasterEventAssessmentId,
				existing,
			);
		}

		const assessmentSectorsById = new Map<string, string[]>();
		for (const link of disasterEventAssessmentSectors) {
			const assessmentId = String(link.disasterEventAssessmentId ?? "");
			if (!assessmentId) {
				continue;
			}
			const existing = assessmentSectorsById.get(assessmentId) ?? [];
			existing.push(String(link.sectorId ?? ""));
			assessmentSectorsById.set(assessmentId, existing.filter(Boolean));
		}

		if (disasterEventAssessments.length > 0) {
			return disasterEventAssessments.reduce<AdditionalDetailItem[]>(
				(accumulator, item, index) => {
					const normalizedType = normalizeDetailTypeValue(item.assessmentType);
					const coverageText = String(item.coverage ?? "").trim();
					const descriptionText = String(item.description ?? "").trim();
					const formattedDate = formatBackendDate(item.assessmentDate);
					const otherSectors = String(item.otherSectors ?? "").trim();
					const attachments = item.id
						? (assessmentAttachmentsById.get(item.id) ?? [])
						: [];
					const sectorIds = item.id
						? (assessmentSectorsById.get(item.id) ?? [])
						: [];

					if (
						!coverageText &&
						!descriptionText &&
						!formattedDate &&
						!otherSectors &&
						attachments.length === 0 &&
						sectorIds.length === 0
					) {
						return accumulator;
					}

					accumulator.push({
						id: item.id || `assessment-${normalizedType}-${index}`,
						type: normalizedType,
						date: formattedDate,
						coverage: coverageText,
						description: descriptionText,
						meta: {
							assessmentTypeId:
								item.assessmentTypeId ??
								assessmentTypes.find(
									(type) =>
										normalizeDetailTypeValue(type.type) === normalizedType,
								)?.id,
							otherSectors: otherSectors || undefined,
							sectorIds: sectorIds.filter(Boolean),
						},
						attachments,
					});

					return accumulator;
				},
				[],
			);
		}

		const indexes: AssessmentFieldIndex[] = [1, 2, 3, 4, 5];
		const configs = [
			{
				type: "rapid_preliminary_assessment",
				descriptionPrefix: "rapidOrPreliminaryAssessmentDescription",
				datePrefix: "rapidOrPreliminaryAssessmentDate",
			},
			{
				type: "post_disaster_assessment",
				descriptionPrefix: "postDisasterAssessmentDescription",
				datePrefix: "postDisasterAssessmentDate",
			},
			{
				type: "other_assessment",
				descriptionPrefix: "otherAssessmentDescription",
				datePrefix: "otherAssessmentDate",
			},
		] as const;

		return configs.reduce<AdditionalDetailItem[]>((allItems, config) => {
			const itemsForType = indexes.reduce<AdditionalDetailItem[]>(
				(items, index) => {
					const descriptionRaw =
						disasterEvent?.[`${config.descriptionPrefix}${index}` as const] ??
						"";
					const dateRaw =
						disasterEvent?.[`${config.datePrefix}${index}` as const] ?? null;
					const descriptionText = String(descriptionRaw).trim();
					const formattedDate = formatBackendDate(dateRaw);

					if (!descriptionText && !formattedDate) {
						return items;
					}

					items.push({
						id: `assessment-${config.type}-${index}`,
						type: config.type,
						date: formattedDate,
						description: descriptionText,
					});

					return items;
				},
				[],
			);

			return [...allItems, ...itemsForType];
		}, []);
	};

	const mapDeclarationsToItems = (): AdditionalDetailItem[] => {
		const attachmentsByDeclarationId = new Map<
			string,
			ResponseAttachmentValue[]
		>();
		for (const attachment of disasterEventDeclarationAttachments) {
			const existing =
				attachmentsByDeclarationId.get(attachment.disasterEventDeclarationId) ??
				[];
			existing.push({
				id: attachment.id,
				title: attachment.title,
				fileKey: attachment.fileKey,
				fileName: attachment.fileName,
				fileType: attachment.fileType,
				fileSize: attachment.fileSize,
			});
			attachmentsByDeclarationId.set(
				attachment.disasterEventDeclarationId,
				existing,
			);
		}

		return disasterEventDeclarations.reduce<AdditionalDetailItem[]>(
			(accumulator, item, index) => {
				const type =
					String(item.type ?? "").trim() ||
					ctx.t({
						code: "disaster_event.review.declaration",
						msg: "Declaration",
					});
				const effects = String(item.effects ?? "").trim();
				const coverage = String(item.coverage ?? "").trim();
				const issuingOrganization = String(
					item.issuingOrganization ?? "",
				).trim();
				const declarationStatus = String(item.declarationStatus ?? "").trim();
				const formattedDate = formatBackendDate(item.declarationDate);
				const attachments = item.id
					? (attachmentsByDeclarationId.get(item.id) ?? [])
					: [];

				if (
					!type &&
					!effects &&
					!coverage &&
					!issuingOrganization &&
					!declarationStatus &&
					!formattedDate &&
					attachments.length === 0
				) {
					return accumulator;
				}

				accumulator.push({
					id: item.id || `declaration-${index}`,
					type,
					date: formattedDate,
					coverage,
					description: effects,
					meta: {
						declarationStatusId: item.declarationStatusId || undefined,
						declarationStatus: declarationStatus || undefined,
						issuingOrganization: issuingOrganization || undefined,
					},
					attachments,
				});

				return accumulator;
			},
			[],
		);
	};

	const [responses, setResponses] = useState<AdditionalDetailItem[]>(() =>
		mapEarlyActionToResponses(),
	);
	const [assessments, setAssessments] = useState<AdditionalDetailItem[]>(() =>
		mapAssessmentsToItems(),
	);
	const [declarations, setDeclarations] = useState<AdditionalDetailItem[]>(() =>
		mapDeclarationsToItems(),
	);
	const responseTypeOptions = useMemo(
		() =>
			responseTypes.map((responseType) => ({
				value: normalizeDetailTypeValue(responseType.type),
				label: responseType.type,
			})),
		[responseTypes],
	);
	const assessmentCountByType = useMemo(() => {
		return assessments.reduce<Record<string, number>>((counts, item) => {
			const key = normalizeDetailTypeValue(item.type);
			counts[key] = (counts[key] ?? 0) + 1;
			return counts;
		}, {});
	}, [assessments]);
	const declarationStatusOptions = useMemo(
		() =>
			declarationStatuses.map((status) => ({
				value: status.id,
				label: status.status,
			})),
		[declarationStatuses],
	);
	const assessmentSectorTreeOptions = useMemo(
		() => buildAssessmentSectorTree(sectorOptions),
		[sectorOptions],
	);
	const assessmentSectorLabelById = useMemo(
		() => new Map(sectorOptions.map((sector) => [sector.id, sector.name])),
		[sectorOptions],
	);
	const normalizeTreeSelectValue = (value: unknown): string[] => {
		if (Array.isArray(value)) {
			return value.filter((item): item is string => typeof item === "string");
		}
		if (value && typeof value === "object") {
			return Object.entries(value as Record<string, unknown>)
				.filter(([, selected]) => {
					if (!selected || typeof selected !== "object") {
						return Boolean(selected);
					}
					return Boolean((selected as { checked?: boolean }).checked);
				})
				.map(([key]) => key);
		}
		return [];
	};
	const parseDetailDate = (value: string): Date | null => {
		const match = /^([0-3]\d)\/([0-1]\d)\/(\d{4})$/.exec(value.trim());
		if (!match) {
			return null;
		}

		const day = Number(match[1]);
		const month = Number(match[2]);
		const year = Number(match[3]);
		const parsed = new Date(year, month - 1, day);

		if (
			parsed.getFullYear() !== year ||
			parsed.getMonth() !== month - 1 ||
			parsed.getDate() !== day
		) {
			return null;
		}

		return parsed;
	};

	const formatDetailDate = (value: Date | null): string => {
		if (!value) {
			return "";
		}

		const day = String(value.getDate()).padStart(2, "0");
		const month = String(value.getMonth() + 1).padStart(2, "0");
		const year = String(value.getFullYear());
		return `${day}/${month}/${year}`;
	};

	const [detailDialogVisible, setDetailDialogVisible] = useState(false);
	const [detailDialogCategory, setDetailDialogCategory] =
		useState<AdditionalDetailCategory>("response");
	const [editingDetailId, setEditingDetailId] = useState<string | null>(null);
	const [detailForm, setDetailForm] = useState({
		type: "",
		dateValue: null as Date | null,
		coverage: "",
		description: "",
		declarationStatusId: "",
		issuingOrganization: "",
		assessmentOtherSectors: "",
	});
	const [
		detailAssessmentSelectedSectorIds,
		setDetailAssessmentSelectedSectorIds,
	] = useState<string[]>([]);
	const [
		detailAssessmentSelectedSectorKeys,
		setDetailAssessmentSelectedSectorKeys,
	] = useState<TreeSelectSelectionKeys>({});
	const detailAssessmentDisplaySectorIds = useMemo(
		() =>
			filterParentOnlySectorIds(
				sectorOptions,
				detailAssessmentSelectedSectorIds,
			),
		[detailAssessmentSelectedSectorIds, sectorOptions],
	);
	const [
		detailAssessmentExistingAttachments,
		setDetailAssessmentExistingAttachments,
	] = useState<
		Array<{
			id: string;
			fileName: string;
			fileType: string;
			fileSize: number;
			fileKey: string;
			title?: string;
		}>
	>([]);
	const [
		detailAssessmentKeptAttachmentIds,
		setDetailAssessmentKeptAttachmentIds,
	] = useState<string[]>([]);
	const [
		detailAssessmentNewAttachmentUploads,
		setDetailAssessmentNewAttachmentUploads,
	] = useState<NewAttachmentUpload[]>([]);
	const [assessmentAttachmentEditorKey, setAssessmentAttachmentEditorKey] =
		useState(0);
	const [
		detailResponseExistingAttachments,
		setDetailResponseExistingAttachments,
	] = useState<
		Array<{
			id: string;
			fileName: string;
			fileType: string;
			fileSize: number;
			fileKey: string;
			title?: string;
		}>
	>([]);
	const [detailResponseKeptAttachmentIds, setDetailResponseKeptAttachmentIds] =
		useState<string[]>([]);
	const [
		detailResponseNewAttachmentUploads,
		setDetailResponseNewAttachmentUploads,
	] = useState<NewAttachmentUpload[]>([]);
	const [responseAttachmentEditorKey, setResponseAttachmentEditorKey] =
		useState(0);
	const [
		detailDeclarationExistingAttachments,
		setDetailDeclarationExistingAttachments,
	] = useState<
		Array<{
			id: string;
			fileName: string;
			fileType: string;
			fileSize: number;
			fileKey: string;
			title?: string;
		}>
	>([]);
	const [
		detailDeclarationKeptAttachmentIds,
		setDetailDeclarationKeptAttachmentIds,
	] = useState<string[]>([]);
	const [
		detailDeclarationNewAttachmentUploads,
		setDetailDeclarationNewAttachmentUploads,
	] = useState<NewAttachmentUpload[]>([]);
	const [declarationAttachmentEditorKey, setDeclarationAttachmentEditorKey] =
		useState(0);
	const selectedDeclarationStatusDescription = useMemo(() => {
		if (!detailForm.declarationStatusId) {
			return "";
		}

		return (
			declarationStatuses.find(
				(status) => status.id === detailForm.declarationStatusId,
			)?.description ?? ""
		);
	}, [declarationStatuses, detailForm.declarationStatusId]);
	const showDateField = true;
	const hasDetailType = detailForm.type.trim().length > 0;
	const declarationHasRequiredFields = detailForm.dateValue !== null;
	const hasDetailContent =
		detailDialogCategory === "response"
			? detailForm.coverage.trim().length > 0 ||
				detailForm.description.trim().length > 0 ||
				detailForm.dateValue !== null ||
				detailResponseExistingAttachments.length > 0 ||
				detailResponseNewAttachmentUploads.length > 0
			: detailDialogCategory === "declaration"
				? declarationHasRequiredFields
				: detailForm.description.trim().length > 0 ||
					detailForm.dateValue !== null;
	const canSaveDetail =
		detailDialogCategory === "declaration"
			? declarationHasRequiredFields
			: detailDialogCategory === "assessment"
				? hasDetailType
				: hasDetailType && hasDetailContent;
	const [errors, setErrors] = useState<Errors>({});
	const [visibleModalSubmit, setVisibleModalSubmit] = useState<boolean>(false);
	const [visibleExitModal, setVisibleExitModal] = useState<boolean>(false);
	const serverErrorRef = useRef<HTMLDivElement | null>(null);
	const [selectedHipTypeId, setSelectedHipTypeId] = useState(
		disasterEvent?.hipTypeId ?? "",
	);
	const [selectedHipClusterId, setSelectedHipClusterId] = useState(
		disasterEvent?.hipClusterId ?? "",
	);
	const [selectedHipHazardId, setSelectedHipHazardId] = useState(
		disasterEvent?.hipHazardId ?? "",
	);
	const assessmentTypeOptions: AdditionalDetailTypeOption[] = [
		{
			value: "rapid_preliminary_assessment",
			label: ctx.t({
				code: "disaster_event.rapid_preliminary_assessment",
				msg: "Rapid/Preliminary assessment",
			}),
		},
		{
			value: "post_disaster_assessment",
			label: ctx.t({
				code: "disaster_event.post_disaster_assessment",
				msg: "Post-disaster assessment",
			}),
		},
		{
			value: "other_assessment",
			label: ctx.t({
				code: "disaster_event.other_assessment",
				msg: "Other assessment",
			}),
		},
	];
	const datePrecisionOptions = [
		{
			value: "yyyy-mm-dd",
			label: ctx.t({
				code: "common.date_format_full_date",
				msg: "Full date",
			}),
		},
		{
			value: "yyyy-mm",
			label: ctx.t({
				code: "common.date_format_year_month",
				msg: "Year and month",
			}),
		},
		{
			value: "yyyy",
			label: ctx.t({
				code: "common.date_format_year_only",
				msg: "Year only",
			}),
		},
	];
	const detailCategoryLabel = (category: AdditionalDetailCategory): string => {
		switch (category) {
			case "response":
				return ctx.t({
					code: "disaster_event.review.responses",
					msg: "Responses",
				});
			case "assessment":
				return ctx.t({
					code: "disaster_event.review.assessments",
					msg: "Assessments",
				});
			case "declaration":
				return ctx.t({
					code: "disaster_event.review.official_declarations",
					msg: "Official declarations",
				});
			default:
				return "";
		}
	};
	const detailCategorySingularLabel = (
		category: AdditionalDetailCategory,
	): string => {
		switch (category) {
			case "response":
				return ctx.t({
					code: "disaster_event.review.response_operation",
					msg: "Response operation",
				});
			case "assessment":
				return ctx.t({
					code: "disaster_event.review.assessment",
					msg: "Assessment",
				});
			case "declaration":
				return ctx.t({
					code: "disaster_event.review.declaration",
					msg: "Declaration",
				});
			default:
				return "";
		}
	};

	useEffect(() => {
		if (serverFormErrors.length === 0) {
			return;
		}

		window.requestAnimationFrame(() => {
			serverErrorRef.current?.scrollIntoView({
				behavior: "smooth",
				block: "start",
			});
			serverErrorRef.current?.focus();
		});
	}, [serverFormErrors]);

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
		label: item.code ? `${item.name} (${item.code})` : item.name,
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

	const isStep1Complete = form.nameNational.trim().length > 0;

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
			recordingOrganizationId: form.recordingOrganizationId,
			recordingOrganizationName: readFieldValue("recordingOrganizationName"),
		};

		setForm((current) =>
			JSON.stringify(current) === JSON.stringify(snapshot) ? current : snapshot,
		);

		return snapshot;
	};

	const validateStep1 = (formData: StepperFormState = form) => {
		const nextErrors: Errors = {};
		const startDateValue = toDateWithPrecisionValue(startDateState);
		const endDateValue = toDateWithPrecisionValue(endDateState);
		const hasStartTime = startTime instanceof Date;
		const hasEndTime = endTime instanceof Date;

		if (!formData.nameNational.trim()) {
			nextErrors.nameNational = ctx.t({
				code: "disaster_event.form.validation.national_name_required",
				msg: "Disaster name (national) is required",
			});
		}

		const startDateError = validateDateWithPrecisionState(
			"Start date",
			startDateState,
		);
		if (startDateError) {
			nextErrors.startDate = startDateError;
		}

		const endDateError = validateDateWithPrecisionState(
			"End date",
			endDateState,
		);
		if (endDateError) {
			nextErrors.endDate = endDateError;
		}

		if (
			hasStartTime &&
			(startDateState.precision !== "yyyy-mm-dd" || !startDateValue)
		) {
			nextErrors.startDate = ctx.t({
				code: "disaster_event.form.validation.start_time_requires_full_start_date",
				msg: "Start time requires a complete start date (YYYY-MM-DD)",
			});
		}

		if (
			hasEndTime &&
			(endDateState.precision !== "yyyy-mm-dd" || !endDateValue)
		) {
			nextErrors.endDate = ctx.t({
				code: "disaster_event.form.validation.end_time_requires_full_end_date",
				msg: "End time requires a complete end date (YYYY-MM-DD)",
			});
		}

		if (endDateValue && !startDateValue) {
			nextErrors.startDate = ctx.t({
				code: "disaster_event.form.validation.start_date_required_when_end_date_has_value",
				msg: "Start date is required when end date has a value",
			});
		}

		if (
			!nextErrors.startDate &&
			!nextErrors.endDate &&
			startDateValue &&
			endDateValue
		) {
			const startBoundary = toComparableBoundaryDate(startDateState, "start");
			const endBoundary = toComparableBoundaryDate(endDateState, "end");

			if (endBoundary < startBoundary) {
				nextErrors.endDate = ctx.t({
					code: "disaster_event.form.validation.end_date_before_start_date",
					msg: "End date cannot be before start date",
				});
			} else if (
				startBoundary === endBoundary &&
				hasStartTime &&
				hasEndTime &&
				endTime.getTime() < startTime.getTime()
			) {
				nextErrors.endDate = ctx.t({
					code: "disaster_event.form.validation.end_time_before_start_time",
					msg: "End time cannot be before start time",
				});
			}
		}

		setErrors(nextErrors);
		if (Object.keys(nextErrors).length > 0) {
			requestAnimationFrame(() => {
				const firstInvalidField = requiredFieldOrder.find(
					(fieldName) => !!nextErrors[fieldName],
				);
				if (firstInvalidField) {
					const element = document.getElementById(
						firstInvalidField,
					) as HTMLInputElement | null;
					element?.focus();
					return;
				}

				if (nextErrors.endDate) {
					const endDateElement =
						(document.getElementById(
							"endDateDate",
						) as HTMLInputElement | null) ||
						(document.getElementById(
							"endDateYear",
						) as HTMLInputElement | null) ||
						(document.getElementById(
							"endDateMonth",
						) as HTMLSelectElement | null);
					endDateElement?.focus();
					return;
				}

				if (nextErrors.startDate) {
					const startDateElement =
						(document.getElementById(
							"startDateDate",
						) as HTMLInputElement | null) ||
						(document.getElementById(
							"startDateYear",
						) as HTMLInputElement | null) ||
						(document.getElementById(
							"startDateMonth",
						) as HTMLSelectElement | null);
					startDateElement?.focus();
				}
			});
			return false;
		}

		return true;
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

	const openExitConfirmModal = () => {
		saveCurrentFormState();
		setVisibleExitModal(true);
	};

	const discardAndExit = () => {
		setVisibleExitModal(false);
		document.location.href = ctx.url("/disaster-event");
	};

	const saveDraftAndExit = () => {
		saveAsDraft();
		handleSubmitAction("submit-draft");
	};

	const formatDateForSubmit = (value: Date | null): string => {
		if (!value) {
			return "";
		}

		const day = String(value.getDate()).padStart(2, "0");
		const month = String(value.getMonth() + 1).padStart(2, "0");
		const year = String(value.getFullYear());
		return `${year}-${month}-${day}`;
	};

	const handleSubmitAction = (action: SaveAction, validatorIds?: string) => {
		const tempActionField = document.getElementById(
			"tempAction",
		) as HTMLInputElement | null;
		if (tempActionField) {
			tempActionField.value = action;
		}

		const tempValidatorField = document.getElementById(
			"tempValidatorUserIds",
		) as HTMLInputElement | null;
		if (tempValidatorField) {
			tempValidatorField.value = validatorIds || "";
		}

		const formElement = document.getElementById(
			"disaster-event-stepper-form",
		) as HTMLFormElement | null;
		if (formElement) {
			if (!formElement.checkValidity()) {
				formElement.reportValidity();
				return;
			}

			setVisibleModalSubmit(false);
			setVisibleExitModal(false);
			formElement.requestSubmit();
		}
	};

	const usersWithValidatorRoleOptions = usersWithValidatorRole.map(
		(userAccount) => ({
			name: `${userAccount.firstName} ${userAccount.lastName}`,
			id: userAccount.id,
			email: userAccount.email,
		}),
	);

	const hiddenFormValues = useMemo(() => {
		const values: Array<{ name: string; value: string }> = [];
		const pushValue = (name: string, value: string | null | undefined) => {
			values.push({ name, value: value ?? "" });
		};

		pushValue("id", form.id);
		pushValue("nameNational", form.nameNational);
		pushValue("nameGlobalOrRegional", form.nameGlobalOrRegional);
		pushValue("nationalDisasterId", form.nationalDisasterId);
		pushValue("glide", form.glide);
		pushValue("recordingOrganizationId", form.recordingOrganizationId);
		pushValue("recordingOrganizationName", form.recordingOrganizationName);
		pushValue("hipTypeId", selectedHipTypeId);
		pushValue("hipClusterId", selectedHipClusterId);
		pushValue("hipHazardId", selectedHipHazardId);
		pushValue("hazardousEventId", triggeredHazardousEventTarget[0]?.id ?? "");
		pushValue(
			"linkedTriggeringHazardousEventIds",
			JSON.stringify(triggeringHazardousEventTarget.map((event) => event.id)),
		);
		pushValue(
			"linkedTriggeredHazardousEventIds",
			JSON.stringify(triggeredHazardousEventTarget.map((event) => event.id)),
		);
		pushValue("startDate", toDateWithPrecisionValue(startDateState));
		pushValue("startDateTime", formatTimeForSubmit(startTime));
		pushValue("endDate", toDateWithPrecisionValue(endDateState));
		pushValue("endDateTime", formatTimeForSubmit(endTime));
		pushValue(
			"selectedDivisionItems",
			JSON.stringify(selectedDivisionItems ?? []),
		);
		pushValue("spatialFootprint", JSON.stringify(spatialFootprintValue ?? []));
		pushValue(
			"linkedDisasterRecordIds",
			JSON.stringify(linkedDisasterRecordTarget.map((record) => record.id)),
		);
		pushValue(
			"linkedTriggeringDisasterEventIds",
			JSON.stringify(triggeringDisasterEventTarget.map((event) => event.id)),
		);
		pushValue(
			"linkedTriggeredDisasterEventIds",
			JSON.stringify(triggeredDisasterEventTarget.map((event) => event.id)),
		);

		const responsePayload = responses.map((item) => ({
			id: item.id,
			type: normalizeDetailTypeValue(item.type),
			responseDate: item.date
				? formatDateForSubmit(parseDetailDate(item.date))
				: "",
			coverage: item.coverage ?? "",
			description: item.description ?? "",
			attachments: (item.attachments ?? []).map((attachment) => ({
				id: attachment.id,
				title: attachment.title,
				fileKey: attachment.fileKey,
				fileName: attachment.fileName,
				fileType: attachment.fileType,
				fileSize: attachment.fileSize,
				tempFilePath: attachment.tempFilePath,
				tenantPath: attachment.tenantPath,
			})),
		}));
		pushValue("disasterEventResponses", JSON.stringify(responsePayload));

		const assessmentPayload = assessments.map((item) => ({
			id: item.id,
			type: normalizeDetailTypeValue(item.type),
			assessmentTypeId:
				item.meta?.assessmentTypeId ??
				assessmentTypes.find(
					(type) =>
						normalizeDetailTypeValue(type.type) ===
						normalizeDetailTypeValue(item.type),
				)?.id ??
				"",
			assessmentDate: item.date
				? formatDateForSubmit(parseDetailDate(item.date))
				: "",
			coverage: item.coverage ?? "",
			description: item.description ?? "",
			otherSectors: item.meta?.otherSectors ?? "",
			sectorIds: item.meta?.sectorIds ?? [],
			attachments: (item.attachments ?? []).map((attachment) => ({
				id: attachment.id,
				title: attachment.title,
				fileKey: attachment.fileKey,
				fileName: attachment.fileName,
				fileType: attachment.fileType,
				fileSize: attachment.fileSize,
				tempFilePath: attachment.tempFilePath,
				tenantPath: attachment.tenantPath,
			})),
		}));
		pushValue("disasterEventAssessments", JSON.stringify(assessmentPayload));

		const assessmentConfigs = [
			{
				type: "rapid_preliminary_assessment",
				descriptionPrefix: "rapidOrPreliminaryAssessmentDescription",
				datePrefix: "rapidOrPreliminaryAssessmentDate",
			},
			{
				type: "post_disaster_assessment",
				descriptionPrefix: "postDisasterAssessmentDescription",
				datePrefix: "postDisasterAssessmentDate",
			},
			{
				type: "other_assessment",
				descriptionPrefix: "otherAssessmentDescription",
				datePrefix: "otherAssessmentDate",
			},
		] as const;

		for (const config of assessmentConfigs) {
			const items = assessments.filter(
				(item) => normalizeDetailTypeValue(item.type) === config.type,
			);
			for (let index = 0; index < 5; index++) {
				const item = items[index];
				pushValue(
					`${config.descriptionPrefix}${index + 1}`,
					item?.description ?? "",
				);
				pushValue(
					`${config.datePrefix}${index + 1}`,
					item?.date ? formatDateForSubmit(parseDetailDate(item.date)) : "",
				);
			}
		}

		const declarationPayload = declarations.map((item) => ({
			id: item.id,
			type: item.type || "",
			declarationDate: item.date
				? formatDateForSubmit(parseDetailDate(item.date))
				: "",
			coverage: item.coverage ?? "",
			effects: item.description ?? "",
			issuingOrganization: item.meta?.issuingOrganization ?? "",
			declarationStatusId: item.meta?.declarationStatusId ?? "",
			declarationStatus: item.meta?.declarationStatus ?? "",
			attachments: (item.attachments ?? []).map((attachment) => ({
				id: attachment.id,
				title: attachment.title,
				fileKey: attachment.fileKey,
				fileName: attachment.fileName,
				fileType: attachment.fileType,
				fileSize: attachment.fileSize,
				tempFilePath: attachment.tempFilePath,
				tenantPath: attachment.tenantPath,
			})),
		}));
		pushValue("disasterEventDeclarations", JSON.stringify(declarationPayload));

		return values;
	}, [
		assessments,
		declarations,
		form,
		responses,
		triggeringHazardousEventTarget,
		triggeredHazardousEventTarget,
		triggeringDisasterEventTarget,
		triggeredDisasterEventTarget,
		linkedDisasterRecordTarget,
		selectedHipClusterId,
		selectedHipHazardId,
		selectedHipTypeId,
		startDateState,
		startTime,
		endDateState,
		endTime,
		selectedDivisionItems,
		spatialFootprintValue,
		assessmentTypes,
	]);

	const maxDetailItems = 5;
	const detailTypeLabelByValue = useMemo(() => {
		return new Map(
			[...responseTypeOptions, ...assessmentTypeOptions].map((option) => [
				option.value,
				option.label,
			]),
		);
	}, [responseTypeOptions]);
	const availableAssessmentTypeOptions = useMemo(
		() =>
			assessmentTypeOptions.filter(
				(option) => (assessmentCountByType[option.value] ?? 0) < maxDetailItems,
			),
		[assessmentCountByType],
	);
	const detailTypeOptions = useMemo(() => {
		if (detailDialogCategory === "response") {
			return responseTypeOptions;
		}

		if (detailDialogCategory === "assessment") {
			return assessmentTypeOptions.filter(
				(option) =>
					availableAssessmentTypeOptions.some(
						(availableOption) => availableOption.value === option.value,
					) || option.value === detailForm.type,
			);
		}

		return [];
	}, [
		availableAssessmentTypeOptions,
		detailDialogCategory,
		detailForm.type,
		responseTypeOptions,
	]);
	const canAddAnyResponse = responseTypeOptions.length > 0;
	const canAddAnyAssessment = assessmentTypeOptions.some(
		(option) => (assessmentCountByType[option.value] ?? 0) < maxDetailItems,
	);
	const canAddAnyDeclaration = true;
	const reviewSpatialFootprintItems = useMemo(
		() =>
			spatialFootprintValue
				.filter((item) => {
					if (!item || typeof item !== "object") {
						return false;
					}

					const mapOption =
						typeof item.map_option === "string" ? item.map_option : "";
					if (mapOption === "Geographic level") {
						return false;
					}

					if (mapOption === "Map coordinates") {
						return true;
					}

					return Boolean(item.geojson);
				})
				.map((item, index) => {
					const title =
						typeof item?.title === "string" ? item.title.trim() : "";
					return (
						title ||
						ctx.t(
							{
								code: "disaster_event.form.spatial_footprint_numbered",
								msg: "Spatial footprint {count}",
							},
							{ count: index + 1 },
						)
					);
				}),
		[spatialFootprintValue],
	);
	const mapCoordinateSpatialFootprintCount = useMemo(
		() =>
			spatialFootprintValue.filter((item) => {
				if (!item || typeof item !== "object") {
					return false;
				}

				const mapOption =
					typeof item.map_option === "string" ? item.map_option : "";
				if (mapOption === "Geographic level") {
					return false;
				}

				if (mapOption === "Map coordinates") {
					return true;
				}

				return Boolean(item.geojson);
			}).length,
		[spatialFootprintValue],
	);
	const reviewAttachments = useMemo(() => {
		const keptIds = new Set(keptAttachmentIds);
		const keptExisting = disasterEventAttachments
			.filter((attachment) => keptIds.has(attachment.id))
			.map((attachment) => ({
				id: attachment.id,
				fileName: attachment.fileName,
				fileType: attachment.fileType,
				fileSize: attachment.fileSize,
			}));

		const pendingUploads = newAttachmentUploads.map((upload, index) => ({
			id: `new-${index}-${upload.fileName}`,
			fileName: upload.fileName,
			fileType: upload.fileType,
			fileSize: upload.fileSize,
		}));

		return [...keptExisting, ...pendingUploads];
	}, [disasterEventAttachments, keptAttachmentIds, newAttachmentUploads]);
	const reviewLinks = useMemo(
		() =>
			disasterEventLinks.map((link) => ({
				id: link.id,
				url: link.url,
				title: link.title || link.url,
			})),
		[disasterEventLinks],
	);
	const formatReviewDateWithPrecision = (
		state: DateWithPrecisionState,
	): string => {
		const value = toDateWithPrecisionValue(state);

		if (value) {
			return value;
		}

		return "-";
	};
	const formatReviewTime = (value: Date | null): string => {
		if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
			return "-";
		}

		return value.toLocaleTimeString([], {
			hour: "2-digit",
			minute: "2-digit",
			hour12: false,
		});
	};
	const reviewStartTimingValue = ctx.t(
		{
			code: "disaster_event.review.date_at_time",
			msg: "{date} at {time}",
		},
		{
			date: formatReviewDateWithPrecision(startDateState),
			time: formatReviewTime(startTime),
		},
	);
	const reviewEndTimingValue = ctx.t(
		{
			code: "disaster_event.review.date_at_time",
			msg: "{date} at {time}",
		},
		{
			date: formatReviewDateWithPrecision(endDateState),
			time: formatReviewTime(endTime),
		},
	);
	const selectedHazardTypeName =
		sortedHipTypes.find((item) => item.id === selectedHipTypeId)?.name || "";
	const selectedHazardClusterName =
		sortedHipClusters.find((item) => item.id === selectedHipClusterId)?.name ||
		"";
	const selectedSpecificHazardName =
		sortedHipHazards.find((item) => item.id === selectedHipHazardId)?.name ||
		"";
	const getDetailTypeLabel = (value: string) =>
		detailTypeLabelByValue.get(normalizeDetailTypeValue(value)) ?? value;

	const openAddDetail = (category: AdditionalDetailCategory) => {
		if (category === "response" && !canAddAnyResponse) {
			return;
		}

		if (category === "assessment" && !canAddAnyAssessment) {
			return;
		}

		if (category === "declaration" && !canAddAnyDeclaration) {
			return;
		}

		let defaultType = "";
		if (category === "response") {
			defaultType = responseTypeOptions[0]?.value ?? "";
		} else if (category === "assessment") {
			defaultType = availableAssessmentTypeOptions[0]?.value ?? "";
		}

		setDetailDialogCategory(category);
		setEditingDetailId(null);
		setDetailForm({
			type: defaultType,
			dateValue: null,
			coverage: "",
			description: "",
			declarationStatusId: "",
			issuingOrganization: "",
			assessmentOtherSectors: "",
		});
		setDetailAssessmentSelectedSectorIds([]);
		setDetailAssessmentSelectedSectorKeys({});
		setDetailAssessmentExistingAttachments([]);
		setDetailAssessmentKeptAttachmentIds([]);
		setDetailAssessmentNewAttachmentUploads([]);
		setAssessmentAttachmentEditorKey((value) => value + 1);
		if (category === "response") {
			setDetailResponseExistingAttachments([]);
			setDetailResponseKeptAttachmentIds([]);
			setDetailResponseNewAttachmentUploads([]);
			setResponseAttachmentEditorKey((value) => value + 1);
		} else if (category === "declaration") {
			setDetailDeclarationExistingAttachments([]);
			setDetailDeclarationKeptAttachmentIds([]);
			setDetailDeclarationNewAttachmentUploads([]);
			setDeclarationAttachmentEditorKey((value) => value + 1);
		}
		setDetailDialogVisible(true);
	};

	const openEditDetail = (
		category: AdditionalDetailCategory,
		item: AdditionalDetailItem,
	) => {
		setDetailDialogCategory(category);
		setEditingDetailId(item.id);
		const normalizedType = normalizeDetailTypeValue(item.type);
		setDetailForm({
			type: normalizedType,
			dateValue: parseDetailDate(item.date),
			coverage:
				category === "response" || category === "declaration"
					? (item.coverage ?? "")
					: "",
			description: item.description,
			declarationStatusId:
				category === "declaration"
					? (item.meta?.declarationStatusId ?? "")
					: "",
			issuingOrganization:
				category === "declaration"
					? (item.meta?.issuingOrganization ?? "")
					: "",
			assessmentOtherSectors:
				category === "assessment" ? (item.meta?.otherSectors ?? "") : "",
		});
		setDetailAssessmentSelectedSectorIds(
			category === "assessment" ? (item.meta?.sectorIds ?? []) : [],
		);
		setDetailAssessmentSelectedSectorKeys(
			category === "assessment"
				? buildTreeSelectSelectionKeys(
						sectorOptions,
						item.meta?.sectorIds ?? [],
					)
				: {},
		);
		if (category === "assessment") {
			const existingAttachments = (item.attachments ?? []).filter(
				(
					attachment,
				): attachment is ResponseAttachmentValue & {
					id: string;
					fileKey: string;
				} =>
					typeof attachment.id === "string" &&
					typeof attachment.fileKey === "string" &&
					attachment.fileKey.length > 0,
			);
			setDetailAssessmentExistingAttachments(
				existingAttachments.map((attachment) => ({
					id: attachment.id,
					fileName: attachment.fileName,
					fileType: attachment.fileType,
					fileSize: attachment.fileSize,
					fileKey: attachment.fileKey,
					title: attachment.title,
				})),
			);
			setDetailAssessmentKeptAttachmentIds(
				existingAttachments.map((attachment) => attachment.id),
			);
			setDetailAssessmentNewAttachmentUploads(
				(item.attachments ?? [])
					.filter(
						(
							attachment,
						): attachment is ResponseAttachmentValue & {
							tempFilePath: string;
						} =>
							typeof attachment.tempFilePath === "string" &&
							attachment.tempFilePath.length > 0,
					)
					.map((attachment) => ({
						fileName: attachment.fileName,
						fileType: attachment.fileType,
						fileSize: attachment.fileSize,
						tempFilePath: attachment.tempFilePath,
						tenantPath: attachment.tenantPath,
					})),
			);
			setAssessmentAttachmentEditorKey((value) => value + 1);
		}
		if (category === "response") {
			const existingAttachments = (item.attachments ?? []).filter(
				(
					attachment,
				): attachment is ResponseAttachmentValue & {
					id: string;
					fileKey: string;
				} =>
					typeof attachment.id === "string" &&
					typeof attachment.fileKey === "string" &&
					attachment.fileKey.length > 0,
			);
			setDetailResponseExistingAttachments(
				existingAttachments.map((attachment) => ({
					id: attachment.id,
					fileName: attachment.fileName,
					fileType: attachment.fileType,
					fileSize: attachment.fileSize,
					fileKey: attachment.fileKey,
					title: attachment.title,
				})),
			);
			setDetailResponseKeptAttachmentIds(
				existingAttachments.map((attachment) => attachment.id),
			);
			setDetailResponseNewAttachmentUploads(
				(item.attachments ?? [])
					.filter(
						(
							attachment,
						): attachment is ResponseAttachmentValue & {
							tempFilePath: string;
						} =>
							typeof attachment.tempFilePath === "string" &&
							attachment.tempFilePath.length > 0,
					)
					.map((attachment) => ({
						fileName: attachment.fileName,
						fileType: attachment.fileType,
						fileSize: attachment.fileSize,
						tempFilePath: attachment.tempFilePath,
						tenantPath: attachment.tenantPath,
					})),
			);
			setResponseAttachmentEditorKey((value) => value + 1);
		} else if (category === "declaration") {
			const existingAttachments = (item.attachments ?? []).filter(
				(
					attachment,
				): attachment is ResponseAttachmentValue & {
					id: string;
					fileKey: string;
				} =>
					typeof attachment.id === "string" &&
					typeof attachment.fileKey === "string" &&
					attachment.fileKey.length > 0,
			);
			setDetailDeclarationExistingAttachments(
				existingAttachments.map((attachment) => ({
					id: attachment.id,
					fileName: attachment.fileName,
					fileType: attachment.fileType,
					fileSize: attachment.fileSize,
					fileKey: attachment.fileKey,
					title: attachment.title,
				})),
			);
			setDetailDeclarationKeptAttachmentIds(
				existingAttachments.map((attachment) => attachment.id),
			);
			setDetailDeclarationNewAttachmentUploads(
				(item.attachments ?? [])
					.filter(
						(
							attachment,
						): attachment is ResponseAttachmentValue & {
							tempFilePath: string;
						} =>
							typeof attachment.tempFilePath === "string" &&
							attachment.tempFilePath.length > 0,
					)
					.map((attachment) => ({
						fileName: attachment.fileName,
						fileType: attachment.fileType,
						fileSize: attachment.fileSize,
						tempFilePath: attachment.tempFilePath,
						tenantPath: attachment.tenantPath,
					})),
			);
			setDeclarationAttachmentEditorKey((value) => value + 1);
		}
		setDetailDialogVisible(true);
	};

	const saveDetail = () => {
		if (!canSaveDetail) {
			return;
		}

		const trimmedType = detailForm.type.trim();
		const trimmedCoverage = detailForm.coverage.trim();
		const trimmedDescription = detailForm.description.trim();

		const targetCategory = detailDialogCategory;
		const setTarget =
			targetCategory === "response"
				? setResponses
				: targetCategory === "assessment"
					? setAssessments
					: setDeclarations;
		const declarationMeta: AdditionalDetailMeta | undefined =
			targetCategory === "declaration"
				? {
						declarationStatusId: detailForm.declarationStatusId || undefined,
						declarationStatus:
							declarationStatusOptions.find(
								(option) => option.value === detailForm.declarationStatusId,
							)?.label ?? undefined,
						issuingOrganization:
							detailForm.issuingOrganization.trim() || undefined,
					}
				: undefined;
		const assessmentMeta: AdditionalDetailMeta | undefined =
			targetCategory === "assessment"
				? {
						assessmentTypeId:
							assessmentTypes.find(
								(type) =>
									normalizeDetailTypeValue(type.type) ===
									normalizeDetailTypeValue(trimmedType),
							)?.id ?? undefined,
						otherSectors: detailForm.assessmentOtherSectors.trim() || undefined,
						sectorIds: filterParentOnlySectorIds(
							sectorOptions,
							detailAssessmentSelectedSectorIds,
						),
					}
				: undefined;
		const nextItem: AdditionalDetailItem = {
			id: editingDetailId ?? `${targetCategory}-${Date.now()}`,
			type:
				targetCategory === "declaration"
					? trimmedType ||
						ctx.t({
							code: "disaster_event.review.declaration",
							msg: "Declaration",
						})
					: trimmedType,
			date: formatDetailDate(detailForm.dateValue),
			coverage:
				targetCategory === "response" || targetCategory === "declaration"
					? trimmedCoverage
					: undefined,
			description: trimmedDescription,
			meta: targetCategory === "assessment" ? assessmentMeta : declarationMeta,
			attachments:
				targetCategory === "response"
					? [
							...detailResponseExistingAttachments
								.filter((attachment) =>
									detailResponseKeptAttachmentIds.includes(attachment.id),
								)
								.map((attachment) => ({
									id: attachment.id,
									title: attachment.title ?? attachment.fileName,
									fileKey: attachment.fileKey,
									fileName: attachment.fileName,
									fileType: attachment.fileType,
									fileSize: attachment.fileSize,
								})),
							...detailResponseNewAttachmentUploads.map((upload) => ({
								title: upload.fileName,
								fileName: upload.fileName,
								fileType: upload.fileType,
								fileSize: upload.fileSize,
								tempFilePath: upload.tempFilePath,
								tenantPath: upload.tenantPath,
							})),
						]
					: targetCategory === "assessment"
						? [
								...detailAssessmentExistingAttachments
									.filter((attachment) =>
										detailAssessmentKeptAttachmentIds.includes(attachment.id),
									)
									.map((attachment) => ({
										id: attachment.id,
										title: attachment.title ?? attachment.fileName,
										fileKey: attachment.fileKey,
										fileName: attachment.fileName,
										fileType: attachment.fileType,
										fileSize: attachment.fileSize,
									})),
								...detailAssessmentNewAttachmentUploads.map((upload) => ({
									title: upload.fileName,
									fileName: upload.fileName,
									fileType: upload.fileType,
									fileSize: upload.fileSize,
									tempFilePath: upload.tempFilePath,
									tenantPath: upload.tenantPath,
								})),
							]
						: targetCategory === "declaration"
							? [
									...detailDeclarationExistingAttachments
										.filter((attachment) =>
											detailDeclarationKeptAttachmentIds.includes(
												attachment.id,
											),
										)
										.map((attachment) => ({
											id: attachment.id,
											title: attachment.title ?? attachment.fileName,
											fileKey: attachment.fileKey,
											fileName: attachment.fileName,
											fileType: attachment.fileType,
											fileSize: attachment.fileSize,
										})),
									...detailDeclarationNewAttachmentUploads.map((upload) => ({
										title: upload.fileName,
										fileName: upload.fileName,
										fileType: upload.fileType,
										fileSize: upload.fileSize,
										tempFilePath: upload.tempFilePath,
										tenantPath: upload.tenantPath,
									})),
								]
							: undefined,
		};

		setTarget((prev) => {
			if (editingDetailId) {
				return prev.map((item) =>
					item.id === editingDetailId ? nextItem : item,
				);
			}

			if (targetCategory === "assessment") {
				const nextTypeCount = prev.filter(
					(item) => normalizeDetailTypeValue(item.type) === nextItem.type,
				).length;
				if (nextTypeCount >= maxDetailItems) {
					return prev;
				}
			}

			return [...prev, nextItem];
		});

		setDetailDialogVisible(false);
		setDetailAssessmentExistingAttachments([]);
		setDetailAssessmentKeptAttachmentIds([]);
		setDetailAssessmentNewAttachmentUploads([]);
		setDetailAssessmentSelectedSectorKeys({});
		setDetailResponseExistingAttachments([]);
		setDetailResponseKeptAttachmentIds([]);
		setDetailResponseNewAttachmentUploads([]);
		setDetailDeclarationExistingAttachments([]);
		setDetailDeclarationKeptAttachmentIds([]);
		setDetailDeclarationNewAttachmentUploads([]);
	};

	const renderDetailCard = (
		category: AdditionalDetailCategory,
		item: AdditionalDetailItem,
	) => {
		const badgeClass =
			category === "response"
				? "bg-blue-100 text-blue-700"
				: category === "assessment"
					? "bg-violet-100 text-violet-700"
					: "bg-amber-100 text-amber-700";
		const typeLabel =
			detailTypeLabelByValue.get(normalizeDetailTypeValue(item.type)) ??
			item.type;
		const descriptionValue = getDetailDescriptionValue(item);
		const assessmentSectorNames =
			category === "assessment"
				? (item.meta?.sectorIds ?? [])
						.map(
							(sectorId) =>
								sectorOptions.find((option) => option.id === sectorId)?.name,
						)
						.filter((name): name is string => Boolean(name))
				: [];
		return (
			<Card
				key={item.id}
				className="rounded-2xl border border-slate-200 shadow-none"
				pt={{
					root: { style: { boxShadow: "none" } },
					body: { style: { padding: "14px 16px" } },
				}}
			>
				<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
					<div className="w-full min-w-0">
						<div className="flex items-center gap-3">
							<span
								className={`rounded-full px-2 py-1 text-[11px] font-semibold ${badgeClass}`}
							>
								{typeLabel}
							</span>
							{item.date ? (
								<span className="text-[12px] text-slate-500">{item.date}</span>
							) : null}
						</div>
						{category === "response" || category === "declaration" ? (
							<div className="mt-2 space-y-1 text-[14px] text-slate-500">
								{category === "declaration" && item.meta?.declarationStatus ? (
									<p>
										<span className="font-semibold text-slate-700">
											Status:
										</span>{" "}
										{item.meta.declarationStatus}
									</p>
								) : null}
								{category === "declaration" &&
								item.meta?.issuingOrganization?.trim() ? (
									<p>
										<span className="font-semibold text-slate-700">
											Issuing Organization:
										</span>{" "}
										{item.meta.issuingOrganization.trim()}
									</p>
								) : null}
								{item.coverage?.trim() ? (
									<p>
										<span className="font-semibold text-slate-700">
											Coverage:
										</span>{" "}
										{item.coverage.trim()}
									</p>
								) : null}
								{item.description?.trim() ? (
									<p>
										<span className="font-semibold text-slate-700">
											{category === "declaration" ? "Effects:" : "Description:"}
										</span>{" "}
										{renderMultilineText(
											item.description.trim(),
											`${item.id}-detail-description`,
										)}
									</p>
								) : null}
								{!item.coverage?.trim() && !item.description?.trim() ? (
									<p>-</p>
								) : null}
							</div>
						) : category === "assessment" ? (
							<div className="mt-2 space-y-1 text-[14px] text-slate-500">
								{item.coverage?.trim() ? (
									<p>
										<span className="font-semibold text-slate-700">
											Coverage:
										</span>{" "}
										{item.coverage.trim()}
									</p>
								) : null}
								{item.description?.trim() ? (
									<p>
										<span className="font-semibold text-slate-700">
											Description:
										</span>{" "}
										{renderMultilineText(
											item.description.trim(),
											`${item.id}-assessment-description`,
										)}
									</p>
								) : null}
								{item.meta?.otherSectors?.trim() ? (
									<p>
										<span className="font-semibold text-slate-700">
											Other sectors:
										</span>{" "}
										{item.meta.otherSectors.trim()}
									</p>
								) : null}
								{assessmentSectorNames.length > 0 ? (
									<p>
										<span className="font-semibold text-slate-700">
											Sectors:
										</span>{" "}
										{assessmentSectorNames.join(", ")}
									</p>
								) : null}
								{!item.coverage?.trim() &&
								!item.description?.trim() &&
								!item.meta?.otherSectors?.trim() &&
								assessmentSectorNames.length === 0 ? (
									<p>-</p>
								) : null}
							</div>
						) : (
							<p className="mt-1 text-[14px] text-slate-500">
								{descriptionValue
									? (() => {
											const lines = descriptionValue.split("\n");
											return lines.map((line, index) => (
												<span key={`${item.id}-line-${index}`}>
													{line}
													{index < lines.length - 1 ? <br /> : null}
												</span>
											));
										})()
									: "-"}
							</p>
						)}
						{category === "response" ||
						category === "assessment" ||
						category === "declaration" ? (
							item.attachments && item.attachments.length > 0 ? (
								<div className="mt-3 space-y-2">
									<p className="text-[14px] font-semibold text-slate-700">
										{ctx.t({ code: "common.attachments", msg: "Attachments" })}:
									</p>
									{item.attachments.map((attachment, index) => (
										<div
											key={
												attachment.id ??
												attachment.fileKey ??
												`${item.id}-attachment-${index}`
											}
											className="rounded-md border border-slate-200 bg-white px-3 py-2"
										>
											<div className="flex min-w-0 items-center gap-3">
												<i
													className={`${getFileIconClass(attachment.fileName)} text-slate-500`}
												/>
												<div className="min-w-0">
													<p className="truncate text-sm font-medium text-slate-800">
														{attachment.fileName}
													</p>
													<p className="text-xs text-slate-500">
														{`${formatFileSize(attachment.fileSize)}${attachment.fileType ? ` • ${attachment.fileType}` : ""}`}
													</p>
												</div>
											</div>
										</div>
									))}
								</div>
							) : null
						) : null}
					</div>
					<div className="flex items-center gap-1 self-end sm:self-auto sm:shrink-0">
						<Button
							type="button"
							icon="pi pi-pencil"
							text
							aria-label={ctx.t({ code: "common.edit", msg: "Edit" })}
							onClick={() => openEditDetail(category, item)}
						/>
						{category === "response" ||
						category === "assessment" ||
						category === "declaration" ? (
							<Button
								type="button"
								icon="pi pi-trash"
								text
								severity="danger"
								aria-label={ctx.t({ code: "common.delete", msg: "Delete" })}
								onClick={() =>
									category === "response"
										? setResponses((prev) =>
												prev.filter(
													(responseItem) => responseItem.id !== item.id,
												),
											)
										: category === "assessment"
											? setAssessments((prev) =>
													prev.filter(
														(assessmentItem) => assessmentItem.id !== item.id,
													),
												)
											: setDeclarations((prev) =>
													prev.filter(
														(declarationItem) => declarationItem.id !== item.id,
													),
												)
								}
							/>
						) : null}
					</div>
				</div>
			</Card>
		);
	};

	function getDetailDescriptionValue(item: AdditionalDetailItem): string {
		if (item.coverage?.trim()) {
			return [
				`${ctx.t({ code: "disaster_event.review.coverage", msg: "Coverage" })}: ${item.coverage.trim()}`,
				item.description,
			]
				.filter((value) => value && value.trim().length > 0)
				.join("\n");
		}

		return item.description;
	}

	function renderMultilineText(value: string, keyPrefix: string) {
		return value.split(/\r?\n/).map((line, index, lines) => (
			<span key={`${keyPrefix}-line-${index}`}>
				{line}
				{index < lines.length - 1 ? <br /> : null}
			</span>
		));
	}

	const triggeringHazardousEventItemTemplate = (
		item: LinkedEventOption,
		layout?: "list" | "grid",
	) => {
		const wrapperClass =
			layout === "grid" ? "linked-disaster-record-grid-item" : "w-full";

		return (
			<div className={wrapperClass}>
				<LinkedHazardousEventCard
					item={item}
					trailing={
						<Button
							type="button"
							icon="pi pi-times"
							text
							rounded
							className="h-6 w-6 p-0 text-slate-400 hover:text-slate-700"
							aria-label={ctx.t(
								{
									code: "disaster_event.form.remove_named",
									msg: "Remove {name}",
								},
								{ name: item.name },
							)}
							onClick={() =>
								setTriggeringHazardousEventTarget((previous) =>
									previous.filter((record) => record.id !== item.id),
								)
							}
						/>
					}
				/>
			</div>
		);
	};

	const triggeredHazardousEventItemTemplate = (
		item: LinkedEventOption,
		layout?: "list" | "grid",
	) => {
		const wrapperClass =
			layout === "grid" ? "linked-disaster-record-grid-item" : "w-full";

		return (
			<div className={wrapperClass}>
				<LinkedHazardousEventCard
					item={item}
					trailing={
						<Button
							type="button"
							icon="pi pi-times"
							text
							rounded
							className="h-6 w-6 p-0 text-slate-400 hover:text-slate-700"
							aria-label={ctx.t(
								{
									code: "disaster_event.form.remove_named",
									msg: "Remove {name}",
								},
								{ name: item.name },
							)}
							onClick={() =>
								setTriggeredHazardousEventTarget((previous) =>
									previous.filter((record) => record.id !== item.id),
								)
							}
						/>
					}
				/>
			</div>
		);
	};

	const renderEmptyDetails = (label: string) => (
		<div className="mt-4 rounded-xl border border-dashed border-slate-300 px-4 py-7 text-center text-[13px] text-slate-400">
			{label}
		</div>
	);

	const linkedDisasterRecordItemTemplate = (
		item: LinkedEventOption,
		layout?: "list" | "grid",
	) => {
		const wrapperClass =
			layout === "grid" ? "linked-disaster-record-grid-item" : "w-full";

		return (
			<div className={wrapperClass}>
				<LinkedDisasterRecordCard
					item={item}
					trailing={
						<Button
							type="button"
							icon="pi pi-times"
							text
							rounded
							className="h-6 w-6 p-0 text-slate-400 hover:text-slate-700"
							aria-label={ctx.t(
								{
									code: "disaster_event.form.remove_named",
									msg: "Remove {name}",
								},
								{ name: item.name },
							)}
							onClick={() =>
								setLinkedDisasterRecordTarget((previous) =>
									previous.filter((record) => record.id !== item.id),
								)
							}
						/>
					}
				/>
			</div>
		);
	};

	const triggeringDisasterEventItemTemplate = (
		item: LinkedEventOption,
		layout?: "list" | "grid",
	) => {
		const wrapperClass =
			layout === "grid" ? "linked-disaster-record-grid-item" : "w-full";

		return (
			<div className={wrapperClass}>
				<LinkedDisasterRecordCard
					item={item}
					trailing={
						<Button
							type="button"
							icon="pi pi-times"
							text
							rounded
							className="h-6 w-6 p-0 text-slate-400 hover:text-slate-700"
							aria-label={ctx.t(
								{
									code: "disaster_event.form.remove_named",
									msg: "Remove {name}",
								},
								{ name: item.name },
							)}
							onClick={() =>
								setTriggeringDisasterEventTarget((previous) =>
									previous.filter((record) => record.id !== item.id),
								)
							}
						/>
					}
				/>
			</div>
		);
	};

	const triggeredDisasterEventItemTemplate = (
		item: LinkedEventOption,
		layout?: "list" | "grid",
	) => {
		const wrapperClass =
			layout === "grid" ? "linked-disaster-record-grid-item" : "w-full";

		return (
			<div className={wrapperClass}>
				<LinkedDisasterRecordCard
					item={item}
					trailing={
						<Button
							type="button"
							icon="pi pi-times"
							text
							rounded
							className="h-6 w-6 p-0 text-slate-400 hover:text-slate-700"
							aria-label={ctx.t(
								{
									code: "disaster_event.form.remove_named",
									msg: "Remove {name}",
								},
								{ name: item.name },
							)}
							onClick={() =>
								setTriggeredDisasterEventTarget((previous) =>
									previous.filter((record) => record.id !== item.id),
								)
							}
						/>
					}
				/>
			</div>
		);
	};

	const openAffectedAreasModal = () => {
		if (isOpeningAffectedAreasModal) {
			return;
		}

		navigate("affected-areas-modal");
	};

	const openSpatialFootprintModal = () => {
		if (isOpeningSpatialFootprintModal) {
			return;
		}

		navigate("spatial-footprint-modal");
	};

	const openLinkedDisasterRecordsModal = () => {
		if (isOpeningLinkedDisasterRecordsModal) {
			return;
		}

		navigate("linked-disaster-records-modal");
	};

	const openLinkedTriggeringDisasterEventsModal = () => {
		if (isOpeningLinkedTriggeringDisasterEventsModal) {
			return;
		}

		navigate("linked-triggering-disaster-events-modal");
	};

	const openLinkedTriggeredDisasterEventsModal = () => {
		if (isOpeningLinkedTriggeredDisasterEventsModal) {
			return;
		}

		navigate("linked-triggered-disaster-events-modal");
	};

	const openLinkedTriggeringHazardousEventsModal = () => {
		if (isOpeningLinkedTriggeringHazardousEventsModal) {
			return;
		}

		navigate("linked-triggering-hazardous-events-modal");
	};

	const openLinkedTriggeredHazardousEventsModal = () => {
		if (isOpeningLinkedTriggeredHazardousEventsModal) {
			return;
		}

		navigate("linked-triggered-hazardous-events-modal");
	};

	const toast = useRef<Toast>(null);
	const glideTooltipRef = useRef<Tooltip>(null);
	const hazardTypeObservedTooltipRef = useRef<Tooltip>(null);
	const hazardClusterObservedTooltipRef = useRef<Tooltip>(null);
	const specificHazardObservedTooltipRef = useRef<Tooltip>(null);
	const otherSectorsTooltipRef = useRef<Tooltip>(null);

	function shortUuid(value: string) {
		if (!value) return "-";
		return value.slice(0, 6);
	}

	async function copyUuidToClipboard(value: string) {
		await copyTextToClipboardWithToast({
			value,
			toastRef: toast,
			successSummary: ctx.t({ code: "copied", msg: "Copied" }),
			successDetail: ctx.t(
				{
					code: "uuid_copied_to_clipboard",
					msg: "UUID {shortUuid}… copied to clipboard",
				},
				{ shortUuid: shortUuid(value) },
			),
			errorSummary: ctx.t({ code: "failed", msg: "Failed" }),
			errorDetail: ctx.t({
				code: "could_not_copy_to_clipboard",
				msg: "Could not copy to clipboard",
			}),
		});
	}

	useEffect(() => {
		const animationFrameId = requestAnimationFrame(() => {
			glideTooltipRef.current?.updateTargetEvents();
			hazardTypeObservedTooltipRef.current?.updateTargetEvents();
			hazardClusterObservedTooltipRef.current?.updateTargetEvents();
			specificHazardObservedTooltipRef.current?.updateTargetEvents();
			otherSectorsTooltipRef.current?.updateTargetEvents();
		});

		const timeoutId = window.setTimeout(() => {
			glideTooltipRef.current?.updateTargetEvents();
			hazardTypeObservedTooltipRef.current?.updateTargetEvents();
			hazardClusterObservedTooltipRef.current?.updateTargetEvents();
			specificHazardObservedTooltipRef.current?.updateTargetEvents();
			otherSectorsTooltipRef.current?.updateTargetEvents();
		}, 150);

		return () => {
			cancelAnimationFrame(animationFrameId);
			window.clearTimeout(timeoutId);
		};
	}, [activeStep]);

	useEffect(() => {
		if (!detailDialogVisible || detailDialogCategory !== "assessment") {
			return;
		}

		const animationFrameId = requestAnimationFrame(() => {
			otherSectorsTooltipRef.current?.updateTargetEvents();
		});

		const timeoutId = window.setTimeout(() => {
			otherSectorsTooltipRef.current?.updateTargetEvents();
		}, 150);

		return () => {
			cancelAnimationFrame(animationFrameId);
			window.clearTimeout(timeoutId);
		};
	}, [detailDialogVisible, detailDialogCategory]);

	return (
		<>
			<Toast
				ref={toast}
				position={ctx.lang === "ar" ? "top-left" : "top-right"}
			/>
			<div className="card flex justify-content-center">
				<SaveSubmitDialog
					ctx={ctx}
					visible={visibleModalSubmit}
					onHide={() => setVisibleModalSubmit(false)}
					onSubmit={handleSubmitAction}
					usersWithValidatorRole={usersWithValidatorRoleOptions}
					userRole={user?.role ?? undefined}
				/>
				<Dialog
					header={ctx.t({
						code: "common.exit_confirmation",
						msg: "Are you sure you want to exit?",
					})}
					visible={visibleExitModal}
					onHide={() => setVisibleExitModal(false)}
					style={{ width: "42rem", maxWidth: "92vw" }}
					draggable={false}
					resizable={false}
				>
					<p className="mb-5 text-[16px] leading-[24px] text-slate-500">
						{ctx.t({
							code: "common.unsaved_changes_warning",
							msg: "If you leave this page, your work will not be saved.",
						})}
					</p>
					<div>
						<Button
							type="button"
							label={ctx.t({ code: "common.save_draft", msg: "Save as draft" })}
							className="w-full"
							onClick={saveDraftAndExit}
						/>
					</div>
					<div className="mt-2.5">
						<Button
							type="button"
							label={ctx.t({
								code: "common.discard_work_and_exit",
								msg: "Discard work and exit",
							})}
							outlined
							className="w-full"
							onClick={discardAndExit}
						/>
					</div>
				</Dialog>
			</div>
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

			.status-stepper .p-stepper-header .p-stepper-action {
				pointer-events: none;
				cursor: default;
			}

			.linked-disaster-records-grid .p-dataview-content .p-grid {
				display: grid;
				grid-template-columns: repeat(1, minmax(0, 1fr));
				gap: 0.75rem;
				margin: 0;
			}

			.linked-disaster-event-grid .p-dataview-content .p-grid {
				display: grid;
				grid-template-columns: repeat(1, minmax(0, 1fr));
				gap: 0.75rem;
				margin: 0;
			}

			@media (min-width: 768px) {
				.linked-disaster-records-grid .p-dataview-content .p-grid {
					grid-template-columns: repeat(2, minmax(0, 1fr));
				}

				.linked-disaster-event-grid .p-dataview-content .p-grid {
					grid-template-columns: repeat(2, minmax(0, 1fr));
				}
			}

			@media (min-width: 1280px) {
				.linked-disaster-records-grid .p-dataview-content .p-grid {
					grid-template-columns: repeat(3, minmax(0, 1fr));
				}
			}

			.linked-disaster-record-grid-item {
				min-width: 0;
			}
		`}</style>
			<div className="mg-container">
				<section className="dts-page-section">
					<RouterForm id="disaster-event-stepper-form" method="post">
						<input
							type="hidden"
							id="tempValidatorUserIds"
							name="tempValidatorUserIds"
						/>
						<input type="hidden" id="tempAction" name="tempAction" />
						<input
							type="hidden"
							name="existingAttachmentIds"
							value={JSON.stringify(keptAttachmentIds)}
						/>
						<input
							type="hidden"
							name="newAttachmentUploads"
							value={JSON.stringify(newAttachmentUploads)}
						/>
						<input
							type="hidden"
							name="disasterEventLinks"
							value={JSON.stringify(
								disasterEventLinks.map((link) => ({
									url: link.url,
									title: link.title || null,
								})),
							)}
						/>
						{hiddenFormValues.map((field) => (
							<input
								key={field.name}
								type="hidden"
								name={field.name}
								value={field.value}
							/>
						))}
						<div className="mb-4">
							<div className="flex items-center justify-between px-4 py-2">
								<h2 className="text-[16px] font-semibold text-slate-800">
									{ctx.t({
										code: "disaster_event.edit",
										msg: "Edit disaster event",
									})}
								</h2>
							<Button
								type="button"
								icon="pi pi-times"
								text
								aria-label={ctx.t({ code: "common.close", msg: "Close" })}
								onClick={openExitConfirmModal}
							/>
							</div>
						</div>

						{serverFormErrors.length > 0 ? (
							<div
								ref={serverErrorRef}
								className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-red-700"
								role="alert"
								aria-live="polite"
								tabIndex={-1}
							>
								<p className="text-sm font-semibold">
									{ctx.t({
										code: "common.cannot_save_record",
										msg: "Could not save this record",
									})}
								</p>
								<ul className="mt-2 list-disc pl-5 text-sm">
									{serverFormErrors.map((error, index) => (
										<li key={`server-form-error-${index}`}>{error}</li>
									))}
								</ul>
							</div>
						) : null}

						<Tooltip
							key={`glide-tooltip-${activeStep}`}
							ref={glideTooltipRef}
							target=".glide-info-tooltip"
							content={ctx.t({
								code: "disaster_event.form.tooltip.glide_number",
								msg: "A globally unique identifier used to cross-reference this event across international disaster risk systems",
							})}
						/>
						<Tooltip
							key={`hazard-type-observed-tooltip-${activeStep}`}
							ref={hazardTypeObservedTooltipRef}
							target=".hazard-type-observed-tooltip"
							content={ctx.t({
								code: "disaster_event.form.tooltip.hazard_type_observed",
								msg: "The observed hazard type before full confirmation",
							})}
						/>
						<Tooltip
							key={`hazard-cluster-observed-tooltip-${activeStep}`}
							ref={hazardClusterObservedTooltipRef}
							target=".hazard-cluster-observed-tooltip"
							content={ctx.t({
								code: "disaster_event.form.tooltip.hazard_cluster_observed",
								msg: "The observed hazard cluster",
							})}
						/>
						<Tooltip
							key={`specific-hazard-observed-tooltip-${activeStep}`}
							ref={specificHazardObservedTooltipRef}
							target=".specific-hazard-observed-tooltip"
							content={ctx.t({
								code: "disaster_event.form.tooltip.specific_hazard_observed",
								msg: "The specific observed hazard",
							})}
						/>
						<Tooltip
							key={`other-sectors-tooltip-${activeStep}`}
							ref={otherSectorsTooltipRef}
							target=".other-sectors-tooltip"
							content={ctx.t({
								code: "disaster_event.form.tooltip.other_sectors",
								msg: "Type a sector name not available in the dropdown above, e.g., Waste management, Humanitarian assistance.",
							})}
						/>
						<Stepper
							className="status-stepper"
							activeStep={activeStep}
							onChangeStep={() => undefined}
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
								header={ctx.t({
									code: "disaster_event.review.basic_information",
									msg: "Basic information",
								})}
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
										{ctx.t({
											code: "disaster_event.form.event_basics",
											msg: "Event basics",
										})}
									</h2>
									<p className="mt-2 text-[14px] leading-[22px] text-slate-500">
										{ctx.t({
											code: "disaster_event.form.event_basics_description",
											msg: "General information about the disaster event.",
										})}
									</p>
									</div>

									<div className="col-span-12 grid grid-cols-12 gap-4">
										<div className="col-span-12 md:col-span-4">
											<label
												htmlFor="nameNational"
												className="mb-1 inline-flex items-center gap-2"
											>
												<span className="text-red-500">*</span>{" "}
												{ctx.t({
													code: "disaster_event.national_name",
													msg: "National name",
												})}
											</label>
											<InputText
												id="nameNational"
												name="nameNational"
												defaultValue={form.nameNational}
												placeholder={ctx.t({
													code: "disaster_event.form.placeholder.name_national",
													msg: "For example, Hurricane Mitch",
												})}
												className="w-full"
												required={true}
											/>
											{errors.nameNational ? (
												<p className="mt-1 text-xs text-red-600">
													{errors.nameNational}
												</p>
											) : null}
										</div>

										<div className="col-span-12 md:col-span-4">
											<label
												htmlFor="nameGlobalOrRegional"
												className="mb-1 inline-flex items-center gap-2"
											>
												{ctx.t({
													code: "disaster_event.form.name_global_other",
													msg: "Disaster name - Other (Global or Regional)",
												})}
											</label>
											<InputText
												id="nameGlobalOrRegional"
												name="nameGlobalOrRegional"
												defaultValue={form.nameGlobalOrRegional}
												placeholder={ctx.t({
													code: "disaster_event.form.placeholder.add_event_name",
													msg: "Add event name",
												})}
												className="w-full"
											/>
										</div>

										<div className="col-span-12 md:col-span-4">
											<label
												htmlFor="nationalDisasterId"
												className="mb-1 inline-flex items-center gap-2"
											>
												{ctx.t({
													code: "disaster_event.national_disaster_id",
													msg: "National disaster ID",
												})}
											</label>
											<InputText
												id="nationalDisasterId"
												name="nationalDisasterId"
												defaultValue={form.nationalDisasterId}
												placeholder={ctx.t({
													code: "disaster_event.form.placeholder.add_event_id",
													msg: "Add event ID",
												})}
												className="w-full"
											/>
										</div>

										<div className="col-span-12 md:col-span-4">
											<label
												htmlFor="glide"
												className="mb-1 inline-flex items-center gap-2"
											>
												<span className="inline-flex items-center gap-1">
													{ctx.t({
														code: "disaster_event.glide_number",
														msg: "GLIDE number",
													})}
													<i
														className="glide-info-tooltip pi pi-info-circle text-xs text-slate-400"
														aria-hidden="true"
													/>
												</span>
											</label>
											<InputText
												id="glide"
												name="glide"
												defaultValue={form.glide}
												placeholder={ctx.t({
													code: "disaster_event.form.placeholder.add_glide_number",
													msg: "Add GLIDE number",
												})}
												className="w-full"
											/>
										</div>

										<div className="col-span-12 md:col-span-4">
											<label
												htmlFor="disasterEventId"
												className="mb-1 inline-flex items-center gap-2"
											>
												{ctx.t({
													code: "disaster_event.uuid",
													msg: "Disaster event UUID",
												})}
											</label>
											<div className="flex items-center gap-2">
												<InputText
													id="id"
													name="id"
													defaultValue={shortUuid(form.id.toString())}
													readOnly
													className="w-full !border-slate-100 !bg-slate-50 shadow-none cursor-not-allowed"
												/>
												<input
													type="hidden"
													id="id"
													name="id"
													value={form.id}
												/>

												<Button
													type="button"
													icon="pi pi-copy"
													text
													rounded
													title={ctx.t({
														code: "disaster_event.form.copy_uuid",
														msg: "Copy disaster event UUID",
													})}
													aria-label={ctx.t({
														code: "disaster_event.form.copy_uuid",
														msg: "Copy disaster event UUID",
													})}
													onClick={() =>
														copyUuidToClipboard(form.id.toString())
													}
												/>
											</div>
										</div>

										<div className="col-span-12 md:col-span-4">
											<label
												htmlFor="recordingOrganizationName"
												className="mb-1 inline-flex items-center gap-2"
											>
												{ctx.t({
													code: "disaster_event.recording_organization",
													msg: "Recording organization",
												})}
											</label>
											<InputText
												id="recordingOrganizationName"
												name="recordingOrganizationName"
												value={form.recordingOrganizationName}
												readOnly
												className="w-full !border-slate-100 !bg-slate-50 shadow-none cursor-not-allowed"
											/>
										</div>
									</div>

									<div className="col-span-12 my-6 border-t border-slate-200" />

									<div className="col-span-12 mb-4">
									<h2 className="text-[18px] leading-[24px] font-semibold text-slate-800 tracking-[-0.01em]">
										{ctx.t({
											code: "disaster_event.form.hazard_and_timing",
											msg: "Hazard and timing",
										})}
									</h2>
									<p className="mt-2 text-[14px] leading-[22px] text-slate-500">
										{ctx.t({
											code: "disaster_event.form.hazard_and_timing_description",
											msg: "Detailed information regarding the observed hazards and timing.",
										})}
									</p>
									</div>

									<div className="col-span-12 grid grid-cols-12 gap-4">
										<div className="col-span-12 md:col-span-4">
											<label
												htmlFor="hazardTypeObserved"
												className="mb-1 inline-flex items-center gap-2"
											>
												{ctx.t({
													code: "disaster_event.form.hazard_type_observed",
													msg: "Hazard type (observed)",
												})}{" "}
												<i
													className="hazard-type-observed-tooltip pi pi-info-circle ml-1 text-xs text-slate-400"
													aria-hidden="true"
												/>
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
												placeholder={ctx.t({
													code: "disaster_event.form.select_hazard_type",
													msg: "Select hazard type",
												})}
												className="w-full"
												filter
												filterBy="label"
												showClear
											/>
											<input
												type="hidden"
												name="hipTypeId"
												value={selectedHipTypeId}
											/>
										</div>

										<div className="col-span-12 md:col-span-4">
											<label
												htmlFor="hazardClusterObserved"
												className="mb-1 inline-flex items-center gap-2"
											>
												{ctx.t({
													code: "disaster_event.form.hazard_cluster_observed",
													msg: "Hazard cluster (observed)",
												})}{" "}
												<i
													className="hazard-cluster-observed-tooltip pi pi-info-circle ml-1 text-xs text-slate-400"
													aria-hidden="true"
												/>
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
												placeholder={ctx.t({
													code: "disaster_event.form.select_hazard_cluster",
													msg: "Select hazard cluster",
												})}
												className="w-full"
												filter
												filterBy="label"
												showClear
											/>
											<input
												type="hidden"
												name="hipClusterId"
												value={selectedHipClusterId}
											/>
										</div>

										<div className="col-span-12 md:col-span-4">
											<label
												htmlFor="specificHazardObserved"
												className="mb-1 inline-flex items-center gap-2"
											>
												{ctx.t({
													code: "disaster_event.form.specific_hazard_observed",
													msg: "Specific hazard (observed)",
												})}{" "}
												<i
													className="specific-hazard-observed-tooltip pi pi-info-circle ml-1 text-xs text-slate-400"
													aria-hidden="true"
												/>
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
												placeholder={ctx.t({
													code: "enter_hazard_name_or_hips_code",
													msg: "Enter hazard name or HIPS code",
												})}
												className="w-full"
												filter
												filterBy="label"
												virtualScrollerOptions={{ itemSize: 38 }}
												showClear
											/>
											<input
												type="hidden"
												name="hipHazardId"
												value={selectedHipHazardId}
											/>
										</div>

										<div className="col-span-12">
											<div className="grid grid-cols-12 gap-4">
												{renderDateWithPrecision(
													"startDate",
													ctx.t({ code: "common.start_date", msg: "Start date" }),
													startDateState,
													setStartDateState,
													errors.startDate,
												)}
												{renderDateWithPrecision(
													"endDate",
													ctx.t({ code: "common.end_date", msg: "End date" }),
													endDateState,
													setEndDateState,
													errors.endDate,
												)}

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
										{ctx.t({
											code: "disaster_event.form.spatial_information",
											msg: "Disaster event spatial information",
										})}
									</h2>
									<p className="mt-2 text-[14px] leading-[22px] text-slate-500">
										{ctx.t({
											code: "disaster_event.form.spatial_information_description",
											msg: "Indicate the geographic areas where the disaster event was experienced.",
										})}
									</p>
									</div>

									<div className="col-span-12 space-y-4">
										<div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
											<div className="flex items-start justify-between gap-4">
												<div>
													<div className="flex items-center gap-2">
														<i className="pi pi-map-marker text-blue-500" />
													<h3 className="text-[18px] font-semibold text-slate-800">
														{ctx.t({
															code: "spatial_footprint.geographic_level",
															msg: "Geographic level",
														})}
													</h3>
												</div>
												<p className="mt-2 text-[14px] leading-[22px] text-slate-500">
													{ctx.t({
														code: "disaster_event.form.geographic_level_description",
														msg: "Select the administrative areas where the disaster event was experienced.",
													})}
												</p>
												<div className="mt-2.5">
													<Button
														type="button"
														label={
															isOpeningAffectedAreasModal
																? ctx.t({
																		code: "common.opening",
																		msg: "Opening...",
																  })
																: ctx.t({
																		code: "disaster_event.form.add_affected_areas",
																		msg: "Add affected areas",
																  })
														}
															outlined
															icon="pi pi-plus"
															loading={isOpeningAffectedAreasModal}
															disabled={isOpeningAffectedAreasModal}
															onClick={openAffectedAreasModal}
														/>
													<span className="sr-only" aria-live="polite">
														{isOpeningAffectedAreasModal
															? ctx.t({
																	code: "disaster_event.form.loading_affected_areas_selector",
																	msg: "Loading affected areas selector",
																  })
															: ""}
													</span>
													</div>
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
																aria-label={ctx.t(
																	{
																		code: "disaster_event.form.remove_named",
																		msg: "Remove {name}",
																	},
																	{ name: item.label },
																)}
																		onClick={() =>
																			removeDivisionSelection(item.key)
																		}
																		className="cursor-pointer text-sky-700 transition hover:text-sky-900"
																	>
																		×
																	</button>
																</div>
															))}
													</div>
												</div>
											</div>
										</div>

										<div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
											<div className="mb-4 flex items-start justify-between gap-4">
												<div>
													<div className="flex items-center gap-2">
														<i className="pi pi-map text-blue-500" />
													<h3 className="text-[18px] font-semibold text-slate-800">
														{ctx.t({
															code: "common.spatial_footprint",
															msg: "Spatial footprint",
														})}
													</h3>
												</div>
												<p className="mt-2 text-[14px] leading-[22px] text-slate-500">
													{ctx.t({
														code: "disaster_event.form.spatial_footprint_description",
														msg: "Define the specific geographic area affected using interactive map coordinates or manual input.",
													})}
												</p>
													<div className="mt-2.5">
														<Button
															type="button"
														label={
															isOpeningSpatialFootprintModal
																? ctx.t({
																		code: "common.opening",
																		msg: "Opening...",
																  })
																: ctx.t({
																		code: "disaster_event.form.define_spatial_footprint",
																		msg: "Define spatial footprint",
																  })
														}
															outlined
															icon="pi pi-map"
															loading={isOpeningSpatialFootprintModal}
															disabled={isOpeningSpatialFootprintModal}
															onClick={openSpatialFootprintModal}
														/>
													<span className="sr-only" aria-live="polite">
														{isOpeningSpatialFootprintModal
															? ctx.t({
																	code: "disaster_event.form.loading_spatial_footprint_editor",
																	msg: "Loading spatial footprint editor",
																  })
															: ""}
													</span>
													</div>
												</div>
											</div>
											<div className="px-3 py-3 text-[13px] text-slate-600">
												{mapCoordinateSpatialFootprintCount > 0
													? ctx.t(
														{
															code: "disaster_event.form.spatial_footprint_items_added",
															msg: "{count} spatial footprint item(s) added",
														},
														{ count: mapCoordinateSpatialFootprintCount },
													)
													: ctx.t({
															code: "disaster_event.form.no_spatial_footprint_items",
															msg: "No spatial footprint items added yet",
														  })}
											</div>
										</div>

										<DisasterEventLink
											initialLinks={disasterEventLinks}
											onLinksChange={setDisasterEventLinks}
										/>
									</div>

									<div
										id="disaster-event-attachment-divider"
										className="col-span-12 my-6 border-t border-slate-200"
									/>

									<DisasterEventAttachment
										ctx={ctx}
										initialAttachments={disasterEventAttachments ?? []}
										initialNewAttachmentUploads={newAttachmentUploads}
										keptAttachmentIds={keptAttachmentIds}
										onKeptAttachmentIdsChange={setKeptAttachmentIds}
										onNewAttachmentUploadsChange={setNewAttachmentUploads}
										showChooseButton={false}
										enableClickableUploadText
									/>
								</div>

								<div className="col-span-12 mt-30 mb-6 h-[2px] w-full bg-slate-200" />

								<div className="flex items-center justify-between w-full">
									<Button
										type="button"
										label={ctx.t({ code: "common.cancel", msg: "Cancel" })}
										outlined
										onClick={openExitConfirmModal}
									/>
									<div className="flex gap-2">
										<Button
											type="button"
											label={ctx.t({ code: "common.next", msg: "Next" })}
											icon="pi pi-chevron-right"
											iconPos="right"
											onClick={goNext}
										/>
									</div>
								</div>
							</StepperPanel>

							<StepperPanel
								header={ctx.t({
									code: "disaster_event.review.linked_events",
									msg: "Linked events",
								})}
								pt={{
									title: {
										style: { textAlign: "center" },
										"data-status": "optional",
									},
								}}
							>
								<div className="col-span-12 mb-4">
									<h1 className="text-[20px] leading-[28px] font-semibold text-slate-800 tracking-[-0.01em]">
										{ctx.t({
											code: "disaster_event.review.linked_events",
											msg: "Linked events",
										})}
									</h1>
									<p className="mt-2 text-[14px] leading-[22px] text-slate-500">
										{ctx.t({
											code: "disaster_event.form.linked_events_description",
											msg: "Define relationships between this event and other system records.",
										})}
									</p>
								</div>
								<div className="col-span-12 mb-4">
									<h2 className="text-[18px] leading-[24px] font-semibold text-slate-800 tracking-[-0.01em]">
										{ctx.t({
											code: "disaster_event.form.linked_hazardous_events",
											msg: "Linked hazardous events",
										})}
									</h2>
									<p className="mt-2 text-[14px] leading-[22px] text-slate-500">
										{ctx.t({
											code: "disaster_event.form.linked_hazardous_events_description",
											msg: "Link this disaster event to related hazardous events.",
										})}
									</p>
								</div>
								<div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
									<div>
										<h3 className="text-[16px] leading-[20px] font-semibold text-slate-600 tracking-[-0.01em]">
											{ctx.t({
												code: "disaster_event.review.triggering_hazardous_events",
												msg: "Triggering (causal) hazardous events",
											})}
										</h3>
										<div className="mt-2.5">
											<Button
												type="button"
												label={
													isOpeningLinkedTriggeringHazardousEventsModal
														? ctx.t({ code: "common.opening", msg: "Opening..." })
														: ctx.t({
																code: "disaster_event.form.manage_linked_triggering_events",
																msg: "Manage linked triggering events",
														  })
												}
												outlined
												icon="pi pi-link"
												loading={isOpeningLinkedTriggeringHazardousEventsModal}
												disabled={isOpeningLinkedTriggeringHazardousEventsModal}
												onClick={openLinkedTriggeringHazardousEventsModal}
											/>
											<span className="sr-only" aria-live="polite">
												{isOpeningLinkedTriggeringHazardousEventsModal
													? ctx.t({
															code: "disaster_event.form.loading_linked_triggering_hazardous_events_selector",
															msg: "Loading linked triggering hazardous events selector",
														  })
													: ""}
											</span>
										</div>

										<div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
											<DataView
												className="linked-disaster-event-grid"
												value={triggeringHazardousEventTarget}
												itemTemplate={triggeringHazardousEventItemTemplate}
												emptyMessage={ctx.t({
													code: "disaster_event.review.no_triggering_hazardous_events",
													msg: "No linked triggering (causal) hazardous events",
												})}
												layout="grid"
											/>
										</div>
									</div>
									<div>
										<h3 className="text-[16px] leading-[20px] font-semibold text-slate-600 tracking-[-0.01em]">
											{ctx.t({
												code: "disaster_event.review.triggered_hazardous_events",
												msg: "Triggered (subsequent) hazardous events",
											})}
										</h3>
										<div className="mt-2.5">
											<Button
												type="button"
												label={
													isOpeningLinkedTriggeredHazardousEventsModal
														? ctx.t({ code: "common.opening", msg: "Opening..." })
														: ctx.t({
																code: "disaster_event.form.manage_linked_triggered_events",
																msg: "Manage linked triggered events",
														  })
												}
												outlined
												icon="pi pi-link"
												loading={isOpeningLinkedTriggeredHazardousEventsModal}
												disabled={isOpeningLinkedTriggeredHazardousEventsModal}
												onClick={openLinkedTriggeredHazardousEventsModal}
											/>
											<span className="sr-only" aria-live="polite">
												{isOpeningLinkedTriggeredHazardousEventsModal
													? ctx.t({
															code: "disaster_event.form.loading_linked_triggered_hazardous_events_selector",
															msg: "Loading linked triggered hazardous events selector",
														  })
													: ""}
											</span>
										</div>

										<div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
											<DataView
												className="linked-disaster-event-grid"
												value={triggeredHazardousEventTarget}
												itemTemplate={triggeredHazardousEventItemTemplate}
												emptyMessage={ctx.t({
													code: "disaster_event.review.no_triggered_hazardous_events",
													msg: "No linked triggered (subsequent) hazardous events",
												})}
												layout="grid"
											/>
										</div>
									</div>
								</div>

								<div className="col-span-12 mb-4 mt-8">
									<h2 className="text-[18px] leading-[24px] font-semibold text-slate-800 tracking-[-0.01em]">
										{ctx.t({
											code: "disaster_event.form.linked_disaster_events",
											msg: "Linked disaster events",
										})}
									</h2>
									<p className="mt-2 text-[14px] leading-[22px] text-slate-500">
										{ctx.t({
											code: "disaster_event.form.linked_disaster_events_description",
											msg: "Link this disaster event to its cause or its consequences.",
										})}
									</p>
								</div>
								<div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
									<div>
										<h3 className="text-[16px] leading-[20px] font-semibold text-slate-600 tracking-[-0.01em]">
											{ctx.t({
												code: "disaster_event.review.triggering_disaster_events",
												msg: "Triggering (causal) disaster events",
											})}
										</h3>
										<div className="mt-2.5">
											<Button
												type="button"
												label={
													isOpeningLinkedTriggeringDisasterEventsModal
														? ctx.t({ code: "common.opening", msg: "Opening..." })
														: ctx.t({
																code: "disaster_event.form.manage_linked_triggering_events",
																msg: "Manage linked triggering events",
														  })
												}
												outlined
												icon="pi pi-link"
												loading={isOpeningLinkedTriggeringDisasterEventsModal}
												disabled={isOpeningLinkedTriggeringDisasterEventsModal}
												onClick={openLinkedTriggeringDisasterEventsModal}
											/>
											<span className="sr-only" aria-live="polite">
												{isOpeningLinkedTriggeringDisasterEventsModal
													? ctx.t({
															code: "disaster_event.form.loading_linked_triggering_events_selector",
															msg: "Loading linked triggering events selector",
														  })
													: ""}
											</span>
										</div>

										<div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
											<DataView
												className="linked-disaster-event-grid"
												value={triggeringDisasterEventTarget}
												itemTemplate={triggeringDisasterEventItemTemplate}
												emptyMessage={ctx.t({
													code: "disaster_event.review.no_triggering_disaster_events",
													msg: "No linked triggering (causal) disaster events",
												})}
												layout="grid"
											/>
										</div>
									</div>
									<div>
										<h3 className="text-[16px] leading-[20px] font-semibold text-slate-600 tracking-[-0.01em]">
											{ctx.t({
												code: "disaster_event.review.triggered_disaster_events",
												msg: "Triggered (subsequent) disaster events",
											})}
										</h3>
										<div className="mt-2.5">
											<Button
												type="button"
												label={
													isOpeningLinkedTriggeredDisasterEventsModal
														? ctx.t({ code: "common.opening", msg: "Opening..." })
														: ctx.t({
																code: "disaster_event.form.manage_linked_triggered_events",
																msg: "Manage linked triggered events",
														  })
												}
												outlined
												icon="pi pi-link"
												loading={isOpeningLinkedTriggeredDisasterEventsModal}
												disabled={isOpeningLinkedTriggeredDisasterEventsModal}
												onClick={openLinkedTriggeredDisasterEventsModal}
											/>
											<span className="sr-only" aria-live="polite">
												{isOpeningLinkedTriggeredDisasterEventsModal
													? ctx.t({
															code: "disaster_event.form.loading_linked_triggered_events_selector",
															msg: "Loading linked triggered events selector",
														  })
													: ""}
											</span>
										</div>

										<div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
											<DataView
												className="linked-disaster-event-grid"
												value={triggeredDisasterEventTarget}
												itemTemplate={triggeredDisasterEventItemTemplate}
												emptyMessage={ctx.t({
													code: "disaster_event.review.no_triggered_disaster_events",
													msg: "No linked triggered (subsequent) disaster events",
												})}
												layout="grid"
											/>
										</div>
									</div>
								</div>

								<div className="col-span-12 mb-4 mt-8">
									<h2 className="text-[18px] leading-[24px] font-semibold text-slate-800 tracking-[-0.01em]">
										{ctx.t({
											code: "disaster_event.review.linked_disaster_records",
											msg: "Linked disaster records",
										})}
									</h2>
									<p className="mt-2 text-[14px] leading-[22px] text-slate-500">
										{ctx.t({
											code: "disaster_event.form.linked_disaster_records_description",
											msg: "Link this disaster event to related disaster records.",
										})}
									</p>
									<div className="mt-2.5">
										<Button
											type="button"
												label={
													isOpeningLinkedDisasterRecordsModal
														? ctx.t({ code: "common.opening", msg: "Opening..." })
														: ctx.t({
																code: "disaster_event.form.manage_linked_disaster_records",
																msg: "Manage linked disaster records",
														  })
												}
											outlined
											icon="pi pi-link"
											loading={isOpeningLinkedDisasterRecordsModal}
											disabled={isOpeningLinkedDisasterRecordsModal}
											onClick={openLinkedDisasterRecordsModal}
										/>
										<span className="sr-only" aria-live="polite">
											{isOpeningLinkedDisasterRecordsModal
												? ctx.t({
														code: "disaster_event.form.loading_linked_disaster_records_selector",
														msg: "Loading linked disaster records selector",
													})
												: ""}
										</span>
									</div>
								</div>
								<div className="space-y-4">
									<div className="gap-4 md:cols-2">
										<div className="rounded-xl border border-slate-200 bg-white p-4">
											<DataView
												className="linked-disaster-records-grid"
												value={linkedDisasterRecordTarget}
												itemTemplate={linkedDisasterRecordItemTemplate}
												emptyMessage={ctx.t({
													code: "disaster_event.review.no_linked_records",
													msg: "No linked records",
												})}
												layout="grid"
											/>
										</div>
									</div>
								</div>

								<div className="col-span-12 mt-30 mb-6 h-[2px] w-full bg-slate-200" />

								<div className="flex items-center justify-between w-full">
									<Button
										type="button"
										label={ctx.t({ code: "common.cancel", msg: "Cancel" })}
										outlined
										onClick={openExitConfirmModal}
									/>
									<div className="flex gap-2">
										<Button
											type="button"
											label={ctx.t({ code: "common.back", msg: "Back" })}
											outlined
											icon="pi pi-chevron-left"
											iconPos="left"
											onClick={() => {
												saveCurrentFormState();
												setActiveStep(0);
											}}
										/>
										<Button
											type="button"
											label={ctx.t({ code: "common.next", msg: "Next" })}
											icon="pi pi-chevron-right"
											iconPos="right"
											onClick={goToAdditionalDetails}
										/>
									</div>
								</div>
							</StepperPanel>

							<StepperPanel
								header={ctx.t({
									code: "disaster_event.form.additional_details",
									msg: "Additional details",
								})}
								pt={{
									title: {
										style: { textAlign: "center" },
										"data-status": "optional",
									},
								}}
							>
								<div>
									<h3 className="text-[18px] leading-[24px] font-semibold text-slate-800">
										{ctx.t({
											code: "disaster_event.form.additional_details",
											msg: "Additional details",
										})}
									</h3>
									<p className="mt-2 text-[14px] text-slate-500">
										{ctx.t({
											code: "disaster_event.form.additional_details_description",
											msg: "Document responses, assessments, and official declarations related to this disaster event.",
										})}
									</p>

									<div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
										<div className="flex items-start gap-3">
											<div className="rounded-xl bg-blue-100 p-2">
												<i className="pi pi-file-edit text-blue-600" />
											</div>
											<div>
												<h4 className="text-[18px] leading-[24px] font-semibold text-slate-800">
													{ctx.t({
														code: "disaster_event.review.responses",
														msg: "Responses",
													})}
												</h4>
												<p className="text-[14px] text-slate-500">
													{ctx.t({
														code: "disaster_event.form.responses_description",
														msg: "Track early actions and response operations",
													})}
												</p>
											</div>
										</div>
										<Button
											type="button"
											label={ctx.t({
												code: "disaster_event.form.add_response",
												msg: "Add response",
											})}
											icon="pi pi-plus"
											outlined
											className="w-full sm:w-auto"
											disabled={!canAddAnyResponse}
											onClick={() => openAddDetail("response")}
										/>
									</div>

									{responses.length > 0 ? (
										<div className="mt-4 space-y-3">
											{responses.map((item) =>
												renderDetailCard("response", item),
											)}
										</div>
									) : (
										renderEmptyDetails(
											ctx.t({
												code: "disaster_event.review.no_responses",
												msg: "No responses recorded yet",
											}),
										)
									)}

									<div className="my-8 border-t border-slate-200" />

									<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
										<div className="flex items-start gap-3">
											<div className="rounded-xl bg-violet-100 p-2">
												<i className="pi pi-clipboard text-violet-600" />
											</div>
											<div>
												<h4 className="text-[18px] leading-[24px] font-semibold text-slate-800">
													{ctx.t({
														code: "disaster_event.review.assessments",
														msg: "Assessments",
													})}
												</h4>
												<p className="text-[14px] text-slate-500">
													{ctx.t({
														code: "disaster_event.form.assessments_description",
														msg: "Document needs assessments and evaluations",
													})}
												</p>
											</div>
										</div>
										<Button
											type="button"
											label={ctx.t({
												code: "disaster_event.form.add_assessment",
												msg: "Add assessment",
											})}
											icon="pi pi-plus"
											outlined
											className="w-full sm:w-auto"
											disabled={!canAddAnyAssessment}
											onClick={() => openAddDetail("assessment")}
										/>
									</div>

									{assessments.length > 0 ? (
										<div className="mt-4 space-y-3">
											{assessments.map((item) =>
												renderDetailCard("assessment", item),
											)}
										</div>
									) : (
										renderEmptyDetails(
											ctx.t({
												code: "disaster_event.review.no_assessments",
												msg: "No assessments recorded yet",
											}),
										)
									)}

									<div className="my-8 border-t border-slate-200" />

									<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
										<div className="flex items-start gap-3">
											<div className="rounded-xl bg-amber-100 p-2">
												<i className="pi pi-send text-amber-600" />
											</div>
											<div>
												<h4 className="text-[18px] leading-[24px] font-semibold text-slate-800">
													{ctx.t({
														code: "disaster_event.review.official_declarations",
														msg: "Official declarations",
													})}
												</h4>
												<p className="text-[14px] text-slate-500">
													{ctx.t({
														code: "disaster_event.form.declarations_description",
														msg: "Record official emergency declarations",
													})}
												</p>
											</div>
										</div>
										<Button
											type="button"
											label={ctx.t({
												code: "disaster_event.form.add_declaration",
												msg: "Add declaration",
											})}
											icon="pi pi-plus"
											outlined
											className="w-full sm:w-auto"
											disabled={!canAddAnyDeclaration}
											onClick={() => openAddDetail("declaration")}
										/>
									</div>

									{declarations.length > 0 ? (
										<div className="mt-4 space-y-3">
											{declarations.map((item) =>
												renderDetailCard("declaration", item),
											)}
										</div>
									) : (
										renderEmptyDetails(
											ctx.t({
												code: "disaster_event.review.no_declarations",
												msg: "No declarations recorded yet",
											}),
										)
									)}
								</div>

								<Dialog
									header={
										editingDetailId
											? `${ctx.t({ code: "common.edit", msg: "Edit" })} ${detailCategorySingularLabel(detailDialogCategory)}`
											: `${ctx.t({ code: "common.add", msg: "Add" })} ${detailCategorySingularLabel(detailDialogCategory)}`
									}
									visible={detailDialogVisible}
									style={{ width: "48rem" }}
									onHide={() => setDetailDialogVisible(false)}
									draggable={false}
									resizable={false}
								>
									<div className="space-y-4">
										<div>
											<label className="mb-1 block">
												{ctx.t({ code: "common.type", msg: "Type" })}
												{detailDialogCategory === "declaration" ? null : (
													<span className="text-red-500">*</span>
												)}
											</label>
											{detailDialogCategory === "declaration" ? (
												<InputText
													value={detailForm.type}
													onChange={(event) =>
														setDetailForm((state) => ({
															...state,
															type: event.target.value,
														}))
													}
													placeholder={ctx.t({
														code: "disaster_event.form.enter_type",
														msg: "Enter type",
													})}
													className="w-full"
												/>
											) : (
												<Dropdown
													value={detailForm.type}
													onChange={(event) => {
														const selectedType = String(event.value ?? "");
														setDetailForm((state) => ({
															...state,
															type: selectedType,
														}));
													}}
													options={detailTypeOptions}
													optionLabel="label"
													optionValue="value"
													placeholder={ctx.t({
														code: "disaster_event.form.select_type",
														msg: "Select type",
													})}
													className="w-full"
												/>
											)}
										</div>

										{showDateField ? (
											<div>
												<label className="mb-1 block">
													{ctx.t({ code: "common.date", msg: "Date" })}
													{detailDialogCategory === "declaration" ? (
														<span className="text-red-500">*</span>
													) : null}
												</label>
												<Calendar
													value={detailForm.dateValue}
													onChange={(event) =>
														setDetailForm((state) => ({
															...state,
															dateValue:
																event.value instanceof Date
																	? event.value
																	: null,
														}))
													}
													dateFormat="dd/mm/yy"
													placeholder={ctx.t({
														code: "common.select_date",
														msg: "Select date",
													})}
													showIcon
													className="w-full"
												/>
											</div>
										) : null}

										{detailDialogCategory === "declaration" ? (
											<div>
												<label className="mb-1 block">
													{ctx.t({ code: "common.status", msg: "Status" })}
												</label>
												<Dropdown
													value={detailForm.declarationStatusId}
													onChange={(event) =>
														setDetailForm((state) => ({
															...state,
															declarationStatusId: String(event.value ?? ""),
														}))
													}
													options={declarationStatusOptions}
													optionLabel="label"
													optionValue="value"
													placeholder={ctx.t({
														code: "disaster_event.form.select_status",
														msg: "Select status",
													})}
													showClear
													className="w-full"
												/>
												{selectedDeclarationStatusDescription ? (
													<small className="mt-1 block text-gray-600">
														{selectedDeclarationStatusDescription}
													</small>
												) : null}
											</div>
										) : null}

										{detailDialogCategory === "response" ||
										detailDialogCategory === "declaration" ? (
											<div>
												<label className="mb-1 block">
													{ctx.t({
														code: "disaster_event.review.coverage",
														msg: "Coverage",
													})}
												</label>
												<InputText
													value={detailForm.coverage}
													onChange={(event) =>
														setDetailForm((state) => ({
															...state,
															coverage: event.target.value,
														}))
													}
													placeholder={ctx.t({
														code: "disaster_event.form.enter_coverage",
														msg: "Enter coverage",
													})}
													className="w-full"
												/>
											</div>
										) : null}

										{detailDialogCategory === "declaration" ? (
											<div>
												<label className="mb-1 block">
													{ctx.t({
														code: "disaster_event.review.issuing_organization",
														msg: "Issuing organization",
													})}
												</label>
												<InputText
													value={detailForm.issuingOrganization}
													onChange={(event) =>
														setDetailForm((state) => ({
															...state,
															issuingOrganization: event.target.value,
														}))
													}
													placeholder={ctx.t({
														code: "disaster_event.form.enter_issuing_organization",
														msg: "Enter issuing organization",
													})}
													className="w-full"
												/>
											</div>
										) : null}

										{true ? (
											<div>
												<label className="mb-1 block">
													{detailDialogCategory === "declaration"
														? ctx.t({
																code: "disaster_event.effects",
																msg: "Effects",
														  })
														: ctx.t({
																code: "common.description",
																msg: "Description",
														  })}
												</label>
												<InputTextarea
													value={detailForm.description}
													onChange={(event) =>
														setDetailForm((state) => ({
															...state,
															description: event.target.value,
														}))
													}
													rows={4}
													placeholder={ctx.t({
														code: "disaster_event.form.enter_description",
														msg: "Enter description",
													})}
													className="w-full"
												/>
											</div>
										) : null}

										{detailDialogCategory === "assessment" ? (
											<div>
												<label className="mb-1 block">
													{ctx.t({ code: "common.sectors", msg: "Sectors" })}
												</label>
												<TreeSelect
													value={detailAssessmentSelectedSectorKeys}
													options={assessmentSectorTreeOptions}
													valueTemplate={() => {
														if (detailAssessmentDisplaySectorIds.length === 0) {
															return ctx.t({
																code: "disaster_event.form.select_sectors",
																msg: "Select sectors",
															});
														}

														return (
															<>
																{detailAssessmentDisplaySectorIds.map(
																	(sectorId, index) => {
																		const label =
																			assessmentSectorLabelById.get(sectorId);
																		if (!label) {
																			return null;
																		}

																		return (
																			<div
																				key={`${sectorId}-${index}`}
																				className="p-treeselect-token"
																			>
																				<span className="p-treeselect-token-label">
																					{label}
																				</span>
																			</div>
																		);
																	},
																)}
															</>
														);
													}}
													onChange={(event) => {
														const nextSelectedIds = normalizeTreeSelectValue(
															event.value,
														);
														setDetailAssessmentSelectedSectorKeys(
															buildTreeSelectSelectionKeys(
																sectorOptions,
																nextSelectedIds,
															),
														);
														setDetailAssessmentSelectedSectorIds(
															nextSelectedIds,
														);
													}}
													selectionMode="checkbox"
													filter
													showClear
													display="chip"
													placeholder={ctx.t({
														code: "disaster_event.form.select_sectors",
														msg: "Select sectors",
													})}
													className="w-full"
													panelClassName="max-h-[22rem]"
												/>
											</div>
										) : null}

										{detailDialogCategory === "assessment" ? (
											<div>
												<label className="mb-1 flex items-center gap-1">
													<span>
														{ctx.t({
															code: "disaster_event.review.other_sectors",
															msg: "Other sectors",
														})}
													</span>
													<i
														className="other-sectors-tooltip pi pi-info-circle text-xs text-slate-400"
														aria-label={ctx.t({
															code: "disaster_event.form.other_sectors_help",
															msg: "Other sectors help",
														})}
													/>
												</label>
												<InputText
													value={detailForm.assessmentOtherSectors}
													onChange={(event) =>
														setDetailForm((state) => ({
															...state,
															assessmentOtherSectors: event.target.value,
														}))
													}
													placeholder={ctx.t({
														code: "disaster_event.form.enter_other_sectors",
														msg: "Enter other sectors (if not listed)",
													})}
													className="w-full"
												/>
											</div>
										) : null}

										{detailDialogCategory === "assessment" ? (
											<DisasterEventAttachment
												key={`assessment-attachment-editor-${assessmentAttachmentEditorKey}`}
												ctx={ctx}
												initialAttachments={detailAssessmentExistingAttachments}
												initialNewAttachmentUploads={
													detailAssessmentNewAttachmentUploads
												}
												keptAttachmentIds={detailAssessmentKeptAttachmentIds}
												onKeptAttachmentIdsChange={
													setDetailAssessmentKeptAttachmentIds
												}
												onNewAttachmentUploadsChange={
													setDetailAssessmentNewAttachmentUploads
												}
												titleText={ctx.t({
													code: "common.attachments",
													msg: "Attachments",
												})}
												titleClassName="mb-1 block"
												uploadContainerClassName="mt-0"
												showTitleIcon={false}
												showSupportingText={false}
												showChooseButton={false}
												enableClickableUploadText
											/>
										) : null}

										{detailDialogCategory === "response" ? (
											<DisasterEventAttachment
												key={`response-attachment-editor-${responseAttachmentEditorKey}`}
												ctx={ctx}
												initialAttachments={detailResponseExistingAttachments}
												initialNewAttachmentUploads={
													detailResponseNewAttachmentUploads
												}
												keptAttachmentIds={detailResponseKeptAttachmentIds}
												onKeptAttachmentIdsChange={
													setDetailResponseKeptAttachmentIds
												}
												onNewAttachmentUploadsChange={
													setDetailResponseNewAttachmentUploads
												}
												titleText={ctx.t({
													code: "common.attachments",
													msg: "Attachments",
												})}
												titleClassName="mb-1 block"
												uploadContainerClassName="mt-0"
												showTitleIcon={false}
												showSupportingText={false}
												showChooseButton={false}
												enableClickableUploadText
											/>
										) : null}

										{detailDialogCategory === "declaration" ? (
											<DisasterEventAttachment
												key={`declaration-attachment-editor-${declarationAttachmentEditorKey}`}
												ctx={ctx}
												initialAttachments={
													detailDeclarationExistingAttachments
												}
												initialNewAttachmentUploads={
													detailDeclarationNewAttachmentUploads
												}
												keptAttachmentIds={detailDeclarationKeptAttachmentIds}
												onKeptAttachmentIdsChange={
													setDetailDeclarationKeptAttachmentIds
												}
												onNewAttachmentUploadsChange={
													setDetailDeclarationNewAttachmentUploads
												}
												titleText={ctx.t({
													code: "common.attachments",
													msg: "Attachments",
												})}
												titleClassName="mb-1 block"
												uploadContainerClassName="mt-0"
												showTitleIcon={false}
												showSupportingText={false}
												showChooseButton={false}
												enableClickableUploadText
											/>
										) : null}

										<div className="flex items-center justify-end gap-2 pt-2">
											<div className="flex gap-2">
												<Button
													type="button"
													label={ctx.t({ code: "common.cancel", msg: "Cancel" })}
													outlined
													onClick={() => setDetailDialogVisible(false)}
												/>
												<Button
													type="button"
													label={
														editingDetailId
															? `${ctx.t({ code: "common.save", msg: "Save" })} ${detailCategoryLabel(detailDialogCategory)}`
															: `${ctx.t({ code: "common.add", msg: "Add" })} ${detailCategoryLabel(detailDialogCategory)}`
													}
													disabled={!canSaveDetail}
													onClick={saveDetail}
												/>
											</div>
										</div>
									</div>
								</Dialog>

								<div className="col-span-12 mt-30 mb-6 h-[2px] w-full bg-slate-200" />

								<div className="flex items-center justify-between w-full">
									<Button
										type="button"
										label={ctx.t({ code: "common.cancel", msg: "Cancel" })}
										outlined
										onClick={openExitConfirmModal}
									/>
									<div className="flex gap-2">
										<Button
											type="button"
											label={ctx.t({ code: "common.back", msg: "Back" })}
											outlined
											icon="pi pi-chevron-left"
											iconPos="left"
											onClick={() => {
												saveCurrentFormState();
												setActiveStep(1);
											}}
										/>
										<Button
											type="button"
											label={ctx.t({ code: "common.next", msg: "Next" })}
											icon="pi pi-chevron-right"
											iconPos="right"
											onClick={goToReview}
										/>
									</div>
								</div>
							</StepperPanel>

							<StepperPanel
								header={ctx.t({
									code: "disaster_event.review.review_and_save",
									msg: "Review and save",
								})}
								pt={{
									title: {
										style: { textAlign: "center" },
										"data-status": "required",
									},
								}}
							>
							<DisasterEventReviewStep
								ctx={ctx}
								form={form}
									selectedHazardTypeName={selectedHazardTypeName}
									selectedHazardClusterName={selectedHazardClusterName}
									selectedSpecificHazardName={selectedSpecificHazardName}
									startTimingValue={reviewStartTimingValue}
									endTimingValue={reviewEndTimingValue}
									selectedDivisionItems={selectedDivisionItems}
									reviewSpatialFootprintItems={reviewSpatialFootprintItems}
									reviewSpatialFootprintData={spatialFootprintValue}
									reviewLinks={reviewLinks}
									reviewAttachments={reviewAttachments}
									triggeringHazardousEventTarget={
										triggeringHazardousEventTarget
									}
									triggeredHazardousEventTarget={triggeredHazardousEventTarget}
									triggeringDisasterEventTarget={triggeringDisasterEventTarget}
									triggeredDisasterEventTarget={triggeredDisasterEventTarget}
									linkedDisasterRecordTarget={linkedDisasterRecordTarget}
									responses={responses}
									assessments={assessments}
									declarations={declarations}
									sectorNameById={
										new Map(
											sectorOptions.map((sector) => [sector.id, sector.name]),
										)
									}
									getDetailTypeLabel={getDetailTypeLabel}
									getDetailDescriptionValue={getDetailDescriptionValue}
									onCancel={openExitConfirmModal}
									onBack={() => {
										saveCurrentFormState();
										setActiveStep(2);
									}}
									onSendForValidation={() => {
										const snapshot = saveCurrentFormState();
										if (validateStep1(snapshot)) {
											setVisibleModalSubmit(true);
										}
									}}
								/>
							</StepperPanel>
						</Stepper>
					</RouterForm>
				</section>
			</div>
			<Outlet
				context={{
					selectedDivisionItems,
					setSelectedDivisionItems,
					spatialFootprintValue,
					setSpatialFootprintValue,
					disasterEventOptions,
					hazardousEventOptions,
					triggeringHazardousEventTarget,
					setTriggeringHazardousEventTarget,
					triggeredHazardousEventTarget,
					setTriggeredHazardousEventTarget,
					triggeringDisasterEventTarget,
					setTriggeringDisasterEventTarget,
					triggeredDisasterEventTarget,
					setTriggeredDisasterEventTarget,
					disasterRecordOptions,
					linkedDisasterRecordTarget,
					setLinkedDisasterRecordTarget,
				}}
			/>
		</>
	);
}

export type DisasterEventFormProps = StepperValidationProps;

export default function DisasterEventForm(props: DisasterEventFormProps) {
	return <StepperValidation {...props} />;
}
