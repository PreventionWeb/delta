import { Form as RouterForm, Outlet, useNavigate } from "react-router";
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
import { PickList } from "primereact/picklist";
import { Dialog } from "primereact/dialog";
import { Calendar } from "primereact/calendar";
import { Dropdown } from "primereact/dropdown";
import { InputTextarea } from "primereact/inputtextarea";
import { Toast } from "primereact/toast";
import { ViewContext } from "~/frontend/context";
import { copyTextToClipboardWithToast } from "~/frontend/utils/clipboard";
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
};

type AdditionalDetailCategory = "response" | "assessment" | "declaration";

type DeclarationStatus = "unknown" | "yes" | "no";

type AdditionalDetailMeta = {
	declarationStatus?: DeclarationStatus;
	hadOfficialWarningOrWeatherAdvisory?: boolean;
	officialWarningAffectedAreas?: string;
};

type AdditionalDetailItem = {
	id: string;
	type: string;
	date: string;
	description: string;
	meta?: AdditionalDetailMeta;
};

type AdditionalDetailTypeOption = {
	value: string;
	label: string;
};

type EarlyActionFieldIndex = 1 | 2 | 3 | 4 | 5;
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

export type SelectedDivisionItem = {
	key: string;
	label: string;
};

export type DisasterEventFormOutletContext = {
	selectedDivisionItems: SelectedDivisionItem[];
	setSelectedDivisionItems: Dispatch<SetStateAction<SelectedDivisionItem[]>>;
	spatialFootprintValue: any[];
	setSpatialFootprintValue: Dispatch<SetStateAction<any[]>>;
};

const requiredFieldOrder: Array<keyof Errors> = ["nameNational"];

const responseTypeOptions: AdditionalDetailTypeOption[] = [
	{ value: "early_action", label: "Early action" },
	{ value: "response_operation", label: "Response operation" },
];

const assessmentTypeOptions: AdditionalDetailTypeOption[] = [
	{
		value: "rapid_preliminary_assessment",
		label: "Rapid/Preliminary assessment",
	},
	{
		value: "post_disaster_assessment",
		label: "Post-disaster assessment",
	},
	{ value: "other_assessment", label: "Other assessment" },
];

const declarationTypeOptions: AdditionalDetailTypeOption[] = [
	{ value: "disaster_declaration", label: "Disaster declaration" },
	{
		value: "disaster_declaration_effects",
		label: "Disaster declaration effects",
	},
	{ value: "official_warning", label: "Official Warning" },
];

const declarationStatusOptions: AdditionalDetailTypeOption[] = [
	{ value: "unknown", label: "Unknown" },
	{ value: "yes", label: "Yes" },
	{ value: "no", label: "No" },
];

const datePrecisionOptions = [
	{ value: "yyyy-mm-dd", label: "Full date" },
	{ value: "yyyy-mm", label: "Year and month" },
	{ value: "yyyy", label: "Year only" },
];

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
		hipTypeId?: string | null;
		hipClusterId?: string | null;
		hipHazardId?: string | null;
		disasterEventId?: string | null;
		recordingInstitution?: string | null;
		id?: string | null;
		spatialFootprint?: unknown;
		earlyActionDescription1?: string | null;
		earlyActionDate1?: string | Date | null;
		earlyActionDescription2?: string | null;
		earlyActionDate2?: string | Date | null;
		earlyActionDescription3?: string | null;
		earlyActionDate3?: string | Date | null;
		earlyActionDescription4?: string | null;
		earlyActionDate4?: string | Date | null;
		earlyActionDescription5?: string | null;
		earlyActionDate5?: string | Date | null;
		responseOperations?: string | null;
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
		disasterDeclaration?: DeclarationStatus | null;
		disasterDeclarationTypeAndEffect1?: string | null;
		disasterDeclarationDate1?: string | Date | null;
		disasterDeclarationTypeAndEffect2?: string | null;
		disasterDeclarationDate2?: string | Date | null;
		disasterDeclarationTypeAndEffect3?: string | null;
		disasterDeclarationDate3?: string | Date | null;
		disasterDeclarationTypeAndEffect4?: string | null;
		disasterDeclarationDate4?: string | Date | null;
		disasterDeclarationTypeAndEffect5?: string | null;
		disasterDeclarationDate5?: string | Date | null;
		hadOfficialWarningOrWeatherAdvisory?: boolean | null;
		officialWarningAffectedAreas?: string | null;
	} | null;
	hazardousEventOptions: LinkedEventOption[];
	linkedHazardousEvents: LinkedEventOption[];
	disasterRecordOptions: LinkedEventOption[];
	linkedDisasterRecords: LinkedEventOption[];
	disasterEventOptions: LinkedEventOption[];
	linkedDisasterEvents: LinkedEventOption[];
	user: {
		role?: string | null;
	} | null;
	usersWithValidatorRole: Array<{
		id: string;
		firstName: string;
		lastName: string;
		email: string;
	}>;
};

function StepperValidation({
	ctx,
	disasterEvent,
	hip,
	hazardousEventOptions,
	linkedHazardousEvents,
	disasterRecordOptions,
	linkedDisasterRecords,
	disasterEventOptions,
	linkedDisasterEvents,
	user,
	usersWithValidatorRole,
}: StepperValidationProps) {
	const navigate = useNavigate();
	const [selectedDivisionItems, setSelectedDivisionItems] = useState<
		SelectedDivisionItem[]
	>([]);

	const removeDivisionSelection = (keyToRemove: string) => {
		setSelectedDivisionItems((current) =>
			current.filter((item) => item.key !== keyToRemove),
		);
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
				return `${label} year must be 4 digits`;
			}
			return null;
		}

		if (state.precision === "yyyy-mm") {
			if (!/^\d{4}$/.test(state.year) || !/^\d{2}$/.test(state.month)) {
				return `${label} requires both year and month`;
			}

			const monthNumber = Number(state.month);
			if (monthNumber < 1 || monthNumber > 12) {
				return `${label} month is invalid`;
			}

			return null;
		}

		if (
			!/^\d{4}$/.test(state.year) ||
			!/^\d{2}$/.test(state.month) ||
			!/^\d{2}$/.test(state.day)
		) {
			return `${label} requires a complete date`;
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
			return `${label} is invalid`;
		}

		return null;
	};

	const [startDateState, setStartDateState] = useState<DateWithPrecisionState>(
		parseDateWithPrecision(disasterEvent?.startDate),
	);
	const [endDateState, setEndDateState] = useState<DateWithPrecisionState>(
		parseDateWithPrecision(disasterEvent?.endDate),
	);
	const [startTime, setStartTime] = useState<Date | null>(null);
	const [endTime, setEndTime] = useState<Date | null>(null);
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
						{label} format
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
						placeholder="Select format"
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
								placeholder="YYYY-MM-DD"
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
								placeholder="YYYY-MM"
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
								placeholder="YYYY"
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
	const [linkedEventSearch, setLinkedEventSearch] = useState("");
	const [linkedEventLoading, setLinkedEventLoading] = useState(false);
	const [linkedEventSource, setLinkedEventSource] = useState<
		LinkedEventOption[]
	>(() => {
		const linkedIds = new Set(linkedHazardousEvents.map((event) => event.id));
		return hazardousEventOptions
			.filter((event) => !linkedIds.has(event.id))
			.slice(0, 10);
	});
	const [linkedEventTarget, setLinkedEventTarget] = useState<
		LinkedEventOption[]
	>(() => linkedHazardousEvents);
	const [linkedDisasterEventSearch, setLinkedDisasterEventSearch] =
		useState("");
	const [linkedDisasterEventLoading, setLinkedDisasterEventLoading] =
		useState(false);
	const [linkedDisasterEventSource, setLinkedDisasterEventSource] = useState<
		LinkedEventOption[]
	>(() => {
		const linkedIds = new Set(linkedDisasterEvents.map((event) => event.id));
		return disasterEventOptions
			.filter((event) => !linkedIds.has(event.id))
			.slice(0, 10);
	});
	const [linkedDisasterEventTarget, setLinkedDisasterEventTarget] = useState<
		LinkedEventOption[]
	>(() => linkedDisasterEvents);
	const [linkedDisasterRecordSearch, setLinkedDisasterRecordSearch] =
		useState("");
	const [linkedDisasterRecordLoading, setLinkedDisasterRecordLoading] =
		useState(false);
	const [linkedDisasterRecordSource, setLinkedDisasterRecordSource] = useState<
		LinkedEventOption[]
	>(() => {
		const linkedIds = new Set(linkedDisasterRecords.map((record) => record.id));
		return disasterRecordOptions
			.filter((record) => !linkedIds.has(record.id))
			.slice(0, 10);
	});
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
		const indexes: EarlyActionFieldIndex[] = [1, 2, 3, 4, 5];
		const responseOperationDescription = String(
			disasterEvent?.responseOperations ?? "",
		).trim();

		const earlyActionItems = indexes.reduce<AdditionalDetailItem[]>(
			(accumulator, index) => {
				const descriptionRaw =
					disasterEvent?.[`earlyActionDescription${index}` as const] ?? "";
				const dateRaw =
					disasterEvent?.[`earlyActionDate${index}` as const] ?? null;

				const descriptionText = String(descriptionRaw).trim();
				const formattedDate = formatBackendDate(dateRaw);

				if (!descriptionText && !formattedDate) {
					return accumulator;
				}

				accumulator.push({
					id: `response-early-action-${index}`,
					type: "early_action",
					date: formattedDate,
					description: descriptionText,
				});

				return accumulator;
			},
			[],
		);

		if (!responseOperationDescription) {
			return earlyActionItems;
		}

		return [
			...earlyActionItems,
			{
				id: "response-operation-backend",
				type: "response_operation",
				date: "",
				description: responseOperationDescription,
			},
		];
	};

	const mapAssessmentsToItems = (): AdditionalDetailItem[] => {
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
		const declarationItems: AdditionalDetailItem[] = [];
		const declarationStatus = disasterEvent?.disasterDeclaration;

		if (
			declarationStatus &&
			["unknown", "yes", "no"].includes(declarationStatus)
		) {
			declarationItems.push({
				id: "declaration-status",
				type: "disaster_declaration",
				date: "",
				description: "",
				meta: {
					declarationStatus,
				},
			});
		}

		const effectIndexes: AssessmentFieldIndex[] = [1, 2, 3, 4, 5];
		for (const index of effectIndexes) {
			const descriptionText = String(
				disasterEvent?.[`disasterDeclarationTypeAndEffect${index}` as const] ??
					"",
			).trim();
			const formattedDate = formatBackendDate(
				disasterEvent?.[`disasterDeclarationDate${index}` as const] ?? null,
			);

			if (!descriptionText && !formattedDate) {
				continue;
			}

			declarationItems.push({
				id: `declaration-effects-${index}`,
				type: "disaster_declaration_effects",
				date: formattedDate,
				description: descriptionText,
			});
		}

		const warningFlag = Boolean(
			disasterEvent?.hadOfficialWarningOrWeatherAdvisory,
		);
		const warningAreas = String(
			disasterEvent?.officialWarningAffectedAreas ?? "",
		).trim();
		if (warningFlag || warningAreas) {
			declarationItems.push({
				id: "declaration-official-warning",
				type: "official_warning",
				date: "",
				description: warningAreas,
				meta: {
					hadOfficialWarningOrWeatherAdvisory: warningFlag,
					officialWarningAffectedAreas: warningAreas,
				},
			});
		}

		return declarationItems;
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
	const responseCountByType = useMemo(() => {
		return responses.reduce<Record<string, number>>((counts, item) => {
			const key = normalizeDetailTypeValue(item.type);
			counts[key] = (counts[key] ?? 0) + 1;
			return counts;
		}, {});
	}, [responses]);
	const assessmentCountByType = useMemo(() => {
		return assessments.reduce<Record<string, number>>((counts, item) => {
			const key = normalizeDetailTypeValue(item.type);
			counts[key] = (counts[key] ?? 0) + 1;
			return counts;
		}, {});
	}, [assessments]);
	const declarationCountByType = useMemo(() => {
		return declarations.reduce<Record<string, number>>((counts, item) => {
			const key = normalizeDetailTypeValue(item.type);
			counts[key] = (counts[key] ?? 0) + 1;
			return counts;
		}, {});
	}, [declarations]);

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
		description: "",
		declarationStatus: "" as DeclarationStatus | "",
		hadOfficialWarningOrWeatherAdvisory: false,
		officialWarningAffectedAreas: "",
	});
	const isResponseOperationType =
		detailDialogCategory === "response" &&
		detailForm.type === "response_operation";
	const isDeclarationStatusType =
		detailDialogCategory === "declaration" &&
		detailForm.type === "disaster_declaration";
	const isOfficialWarningType =
		detailDialogCategory === "declaration" &&
		detailForm.type === "official_warning";
	const showDateField =
		!isResponseOperationType &&
		!isDeclarationStatusType &&
		!isOfficialWarningType;
	const hasOfficialWarningAreas =
		detailForm.officialWarningAffectedAreas.trim().length > 0;
	const passesOfficialWarningRule =
		!isOfficialWarningType ||
		!detailForm.hadOfficialWarningOrWeatherAdvisory ||
		hasOfficialWarningAreas;
	const hasDetailType = detailForm.type.trim().length > 0;
	const hasDetailContent = isDeclarationStatusType
		? detailForm.declarationStatus !== ""
		: isOfficialWarningType
			? detailForm.hadOfficialWarningOrWeatherAdvisory ||
				hasOfficialWarningAreas
			: detailForm.description.trim().length > 0 ||
				detailForm.dateValue !== null;
	const canSaveDetail =
		hasDetailType && hasDetailContent && passesOfficialWarningRule;
	const [errors, setErrors] = useState<Errors>({});
	const [visibleModalSubmit, setVisibleModalSubmit] = useState<boolean>(false);
	const [visibleExitModal, setVisibleExitModal] = useState<boolean>(false);
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
			recordingInstitution: readFieldValue("recordingInstitution"),
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
			nextErrors.nameNational = "Name (National) is required";
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
			nextErrors.startDate =
				"Start time requires a complete start date (YYYY-MM-DD)";
		}

		if (hasEndTime && (endDateState.precision !== "yyyy-mm-dd" || !endDateValue)) {
			nextErrors.endDate = "End time requires a complete end date (YYYY-MM-DD)";
		}

		if (endDateValue && !startDateValue) {
			nextErrors.startDate =
				"Start date is required when end date has a value";
		}

		if (!nextErrors.startDate && !nextErrors.endDate && startDateValue && endDateValue) {
			const startBoundary = toComparableBoundaryDate(startDateState, "start");
			const endBoundary = toComparableBoundaryDate(endDateState, "end");

			if (endBoundary < startBoundary) {
				nextErrors.endDate = "End date cannot be before start date";
			} else if (
				startBoundary === endBoundary &&
				hasStartTime &&
				hasEndTime &&
				endTime.getTime() < startTime.getTime()
			) {
				nextErrors.endDate = "End time cannot be before start time";
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
		setVisibleExitModal(false);
		document.location.href = ctx.url("/disaster-event");
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
		pushValue("recordingInstitution", form.recordingInstitution);
		pushValue("hipTypeId", selectedHipTypeId);
		pushValue("hipClusterId", selectedHipClusterId);
		pushValue("hipHazardId", selectedHipHazardId);
		pushValue("hazardousEventId", linkedEventTarget[0]?.id ?? "");
		pushValue(
			"linkedHazardousEventIds",
			JSON.stringify(linkedEventTarget.map((event) => event.id)),
		);
		pushValue("startDate", toDateWithPrecisionValue(startDateState));
		pushValue("endDate", toDateWithPrecisionValue(endDateState));
		pushValue("spatialFootprint", JSON.stringify(spatialFootprintValue ?? []));
		pushValue(
			"linkedDisasterRecordIds",
			JSON.stringify(linkedDisasterRecordTarget.map((record) => record.id)),
		);
		pushValue(
			"linkedDisasterEventIds",
			JSON.stringify(linkedDisasterEventTarget.map((event) => event.id)),
		);

		const earlyActions = responses.filter(
			(item) => normalizeDetailTypeValue(item.type) === "early_action",
		);
		for (let index = 0; index < 5; index++) {
			const item = earlyActions[index];
			pushValue(`earlyActionDescription${index + 1}`, item?.description ?? "");
			pushValue(
				`earlyActionDate${index + 1}`,
				item?.date ? formatDateForSubmit(parseDetailDate(item.date)) : "",
			);
		}

		const responseOperation = responses.find(
			(item) => normalizeDetailTypeValue(item.type) === "response_operation",
		);
		pushValue("responseOperations", responseOperation?.description ?? "");

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

		const declarationStatusItem = declarations.find(
			(item) => normalizeDetailTypeValue(item.type) === "disaster_declaration",
		);
		pushValue(
			"disasterDeclaration",
			declarationStatusItem?.meta?.declarationStatus ?? "unknown",
		);

		const declarationEffects = declarations.filter(
			(item) =>
				normalizeDetailTypeValue(item.type) === "disaster_declaration_effects",
		);
		for (let index = 0; index < 5; index++) {
			const item = declarationEffects[index];
			pushValue(
				`disasterDeclarationTypeAndEffect${index + 1}`,
				item?.description ?? "",
			);
			pushValue(
				`disasterDeclarationDate${index + 1}`,
				item?.date ? formatDateForSubmit(parseDetailDate(item.date)) : "",
			);
		}

		const officialWarning = declarations.find(
			(item) => normalizeDetailTypeValue(item.type) === "official_warning",
		);
		pushValue(
			"hadOfficialWarningOrWeatherAdvisory",
			officialWarning?.meta?.hadOfficialWarningOrWeatherAdvisory
				? "true"
				: "off",
		);
		pushValue(
			"officialWarningAffectedAreas",
			officialWarning?.meta?.officialWarningAffectedAreas ?? "",
		);

		return values;
	}, [
		assessments,
		declarations,
		form,
		responses,
		linkedEventTarget,
		selectedHipClusterId,
		selectedHipHazardId,
		selectedHipTypeId,
		spatialFootprintValue,
	]);

	const renderReviewItem = (label: string, value: string) => (
		<div className="space-y-1">
			<p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
				{label}
			</p>
			<p className="text-[14px] leading-[14px] font-semibold text-slate-800">
				{value || "-"}
			</p>
		</div>
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

	const renderReviewTimingItem = (
		label: string,
		state: DateWithPrecisionState,
		time: Date | null,
	) => (
		<div className="space-y-1">
			<p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
				{label}
			</p>
			<p className="text-[14px] leading-[14px] font-semibold text-slate-800">
				{`${formatReviewDateWithPrecision(state)} at ${formatReviewTime(time)}`}
			</p>
		</div>
	);

	const maxDetailItems = 5;
	const maxEarlyActionItems = 5;
	const maxResponseOperationItems = 1;
	const maxDisasterDeclarationItems = 1;
	const maxDisasterDeclarationEffectsItems = 5;
	const maxOfficialWarningItems = 1;
	const detailTypeLabelByValue = useMemo(() => {
		return new Map(
			[
				...responseTypeOptions,
				...assessmentTypeOptions,
				...declarationTypeOptions,
			].map((option) => [option.value, option.label]),
		);
	}, []);
	const availableAssessmentTypeOptions = useMemo(
		() =>
			assessmentTypeOptions.filter(
				(option) => (assessmentCountByType[option.value] ?? 0) < maxDetailItems,
			),
		[assessmentCountByType],
	);
	const detailTypeOptions = useMemo(() => {
		if (detailDialogCategory === "response") {
			return responseTypeOptions.filter((option) => {
				if (option.value === detailForm.type) {
					return true;
				}
				if (option.value === "early_action") {
					return (responseCountByType.early_action ?? 0) < maxEarlyActionItems;
				}
				if (option.value === "response_operation") {
					return (
						(responseCountByType.response_operation ?? 0) <
						maxResponseOperationItems
					);
				}
				return true;
			});
		}

		if (detailDialogCategory === "assessment") {
			return assessmentTypeOptions.filter(
				(option) =>
					availableAssessmentTypeOptions.some(
						(availableOption) => availableOption.value === option.value,
					) || option.value === detailForm.type,
			);
		}

		return declarationTypeOptions.filter((option) => {
			if (option.value === detailForm.type) {
				return true;
			}

			if (option.value === "disaster_declaration") {
				return (
					(declarationCountByType.disaster_declaration ?? 0) <
					maxDisasterDeclarationItems
				);
			}

			if (option.value === "disaster_declaration_effects") {
				return (
					(declarationCountByType.disaster_declaration_effects ?? 0) <
					maxDisasterDeclarationEffectsItems
				);
			}

			if (option.value === "official_warning") {
				return (
					(declarationCountByType.official_warning ?? 0) <
					maxOfficialWarningItems
				);
			}

			return true;
		});
	}, [
		availableAssessmentTypeOptions,
		detailDialogCategory,
		detailForm.type,
		declarationCountByType,
		maxDisasterDeclarationEffectsItems,
		maxDisasterDeclarationItems,
		maxEarlyActionItems,
		maxOfficialWarningItems,
		maxResponseOperationItems,
		responseCountByType,
	]);
	const canAddAnyResponse =
		(responseCountByType.early_action ?? 0) < maxEarlyActionItems ||
		(responseCountByType.response_operation ?? 0) < maxResponseOperationItems;
	const canAddAnyAssessment = assessmentTypeOptions.some(
		(option) => (assessmentCountByType[option.value] ?? 0) < maxDetailItems,
	);
	const canAddAnyDeclaration =
		(declarationCountByType.disaster_declaration ?? 0) <
			maxDisasterDeclarationItems ||
		(declarationCountByType.disaster_declaration_effects ?? 0) <
			maxDisasterDeclarationEffectsItems ||
		(declarationCountByType.official_warning ?? 0) < maxOfficialWarningItems;
	const reviewSpatialFootprintItems = useMemo(
		() =>
			spatialFootprintValue
				.filter((item) => Boolean(item))
				.map((item, index) => {
					const title =
						typeof item?.title === "string" ? item.title.trim() : "";
					return title || `Spatial footprint ${index + 1}`;
				}),
		[spatialFootprintValue],
	);

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
			defaultType =
				responseTypeOptions.find((option) => {
					if (option.value === "early_action") {
						return (
							(responseCountByType.early_action ?? 0) < maxEarlyActionItems
						);
					}
					if (option.value === "response_operation") {
						return (
							(responseCountByType.response_operation ?? 0) <
							maxResponseOperationItems
						);
					}
					return false;
				})?.value ?? "";
		} else if (category === "assessment") {
			defaultType = availableAssessmentTypeOptions[0]?.value ?? "";
		} else if (category === "declaration") {
			defaultType =
				declarationTypeOptions.find((option) => {
					if (option.value === "disaster_declaration") {
						return (
							(declarationCountByType.disaster_declaration ?? 0) <
							maxDisasterDeclarationItems
						);
					}

					if (option.value === "disaster_declaration_effects") {
						return (
							(declarationCountByType.disaster_declaration_effects ?? 0) <
							maxDisasterDeclarationEffectsItems
						);
					}

					if (option.value === "official_warning") {
						return (
							(declarationCountByType.official_warning ?? 0) <
							maxOfficialWarningItems
						);
					}

					return false;
				})?.value ?? "";
		}

		setDetailDialogCategory(category);
		setEditingDetailId(null);
		setDetailForm({
			type: defaultType,
			dateValue: null,
			description: "",
			declarationStatus: "",
			hadOfficialWarningOrWeatherAdvisory: false,
			officialWarningAffectedAreas: "",
		});
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
			dateValue:
				category === "response" && normalizedType === "response_operation"
					? null
					: category === "declaration" &&
						  normalizedType !== "disaster_declaration_effects"
						? null
						: parseDetailDate(item.date),
			description: item.description,
			declarationStatus:
				category === "declaration" && normalizedType === "disaster_declaration"
					? (item.meta?.declarationStatus ?? "")
					: "",
			hadOfficialWarningOrWeatherAdvisory:
				category === "declaration" && normalizedType === "official_warning"
					? Boolean(item.meta?.hadOfficialWarningOrWeatherAdvisory)
					: false,
			officialWarningAffectedAreas:
				category === "declaration" && normalizedType === "official_warning"
					? (item.meta?.officialWarningAffectedAreas ?? item.description)
					: "",
		});
		setDetailDialogVisible(true);
	};

	const saveDetail = () => {
		if (!canSaveDetail) {
			return;
		}

		const trimmedType = detailForm.type.trim();
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
						declarationStatus: isDeclarationStatusType
							? (detailForm.declarationStatus as DeclarationStatus)
							: undefined,
						hadOfficialWarningOrWeatherAdvisory: isOfficialWarningType
							? detailForm.hadOfficialWarningOrWeatherAdvisory
							: undefined,
						officialWarningAffectedAreas: isOfficialWarningType
							? detailForm.officialWarningAffectedAreas.trim()
							: undefined,
					}
				: undefined;
		const nextItem: AdditionalDetailItem = {
			id: editingDetailId ?? `${targetCategory}-${Date.now()}`,
			type: trimmedType,
			date:
				targetCategory === "response" && trimmedType === "response_operation"
					? ""
					: targetCategory === "declaration" &&
						  trimmedType !== "disaster_declaration_effects"
						? ""
						: formatDetailDate(detailForm.dateValue),
			description:
				targetCategory === "declaration" &&
				trimmedType === "disaster_declaration"
					? ""
					: targetCategory === "declaration" &&
						  trimmedType === "official_warning"
						? detailForm.officialWarningAffectedAreas.trim()
						: trimmedDescription,
			meta: declarationMeta,
		};

		setTarget((prev) => {
			if (editingDetailId) {
				return prev.map((item) =>
					item.id === editingDetailId ? nextItem : item,
				);
			}

			if (targetCategory === "response") {
				if (nextItem.type === "early_action") {
					const earlyActionCount = prev.filter(
						(item) => normalizeDetailTypeValue(item.type) === "early_action",
					).length;
					if (earlyActionCount >= maxEarlyActionItems) {
						return prev;
					}
				}

				if (nextItem.type === "response_operation") {
					const responseOperationCount = prev.filter(
						(item) =>
							normalizeDetailTypeValue(item.type) === "response_operation",
					).length;
					if (responseOperationCount >= maxResponseOperationItems) {
						return prev;
					}
				}
			} else if (targetCategory === "assessment") {
				const nextTypeCount = prev.filter(
					(item) => normalizeDetailTypeValue(item.type) === nextItem.type,
				).length;
				if (nextTypeCount >= maxDetailItems) {
					return prev;
				}
			} else {
				if (nextItem.type === "disaster_declaration") {
					const nextTypeCount = prev.filter(
						(item) =>
							normalizeDetailTypeValue(item.type) === "disaster_declaration",
					).length;
					if (nextTypeCount >= maxDisasterDeclarationItems) {
						return prev;
					}
				}

				if (nextItem.type === "disaster_declaration_effects") {
					const nextTypeCount = prev.filter(
						(item) =>
							normalizeDetailTypeValue(item.type) ===
							"disaster_declaration_effects",
					).length;
					if (nextTypeCount >= maxDisasterDeclarationEffectsItems) {
						return prev;
					}
				}

				if (nextItem.type === "official_warning") {
					const nextTypeCount = prev.filter(
						(item) =>
							normalizeDetailTypeValue(item.type) === "official_warning",
					).length;
					if (nextTypeCount >= maxOfficialWarningItems) {
						return prev;
					}
				}
			}

			return [...prev, nextItem];
		});

		setDetailDialogVisible(false);
	};

	const deleteDetail = () => {
		if (!editingDetailId) {
			return;
		}

		const setTarget =
			detailDialogCategory === "response"
				? setResponses
				: detailDialogCategory === "assessment"
					? setAssessments
					: setDeclarations;
		setTarget((prev) => prev.filter((item) => item.id !== editingDetailId));
		setDetailDialogVisible(false);
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

		return (
			<Card
				key={item.id}
				className="rounded-2xl border border-slate-200 shadow-none"
				pt={{ body: { style: { padding: "14px 16px" } } }}
			>
				<div className="flex items-start justify-between gap-3">
					<div className="w-full">
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
					</div>
					<Button
						type="button"
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

	function getDetailDescriptionValue(item: AdditionalDetailItem): string {
		if (item.type === "disaster_declaration") {
			return `Disaster declaration: ${
				declarationStatusOptions.find(
					(option) => option.value === item.meta?.declarationStatus,
				)?.label ?? "-"
			}`;
		}

		if (item.type === "official_warning") {
			return [
				`Was there an officially issued warning and/or weather advisory?: ${
					item.meta?.hadOfficialWarningOrWeatherAdvisory ? "Yes" : "No"
				}`,
				`Which affected areas were covered by the warning?: ${
					item.meta?.officialWarningAffectedAreas || "-"
				}`,
			].join("\n");
		}

		return item.description;
	}

	const renderStep4DetailRow = (
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

		return (
			<div key={item.id} className="space-y-2">
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
				{descriptionValue ? (
					<p className="text-[14px] text-slate-500">
						{descriptionValue.split(/\r?\n/).map((line, index, lines) => (
							<span key={`${item.id}-review-line-${index}`}>
								{line}
								{index < lines.length - 1 ? <br /> : null}
							</span>
						))}
					</p>
				) : null}
			</div>
		);
	};

	const reviewLinkedDisasterEventRows = linkedDisasterEventTarget.map(
		(event) => (
			<div key={event.id} className="space-y-1">
				<div className="space-y-1">
					<p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
						Subsequent Disaster Event
					</p>
					<p className="text-[14px] font-semibold text-slate-800">
						{event.name || "-"}
					</p>
					<p className="text-[13px] text-slate-500">{event.code || "-"}</p>
				</div>
			</div>
		),
	);

	const reviewLinkedHazardousEventRows = linkedEventTarget.map((event) => (
		<div key={event.id} className="space-y-1">
			<div className="space-y-1">
				<p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
					Subsequent Hazardous Event
				</p>
				<p className="text-[14px] font-semibold text-slate-800">
					{event.name || "-"}
				</p>
				<p className="text-[13px] text-slate-500">{event.code || "-"}</p>
			</div>
		</div>
	));

	const renderStep4SectionCard = (
		title: string,
		iconClass: string,
		emptyLabel: string,
		content: React.ReactNode,
		hasItems: boolean,
	) => (
		<Card
			className="rounded-2xl border border-slate-200 shadow-none"
			pt={{ body: { style: { padding: "18px 20px" } } }}
		>
			<div className="space-y-4">
				<div className="flex items-center gap-2 text-slate-800">
					<i className={iconClass} />
					<h4 className="text-[18px] leading-[24px] font-semibold">{title}</h4>
				</div>
				{hasItems ? (
					<div className="space-y-5">{content}</div>
				) : (
					<p className="text-[14px] italic text-slate-400">{emptyLabel}</p>
				)}
			</div>
		</Card>
	);

	const renderEmptyDetails = (label: string) => (
		<div className="mt-4 rounded-xl border border-dashed border-slate-300 px-4 py-7 text-center text-[13px] text-slate-400">
			{label}
		</div>
	);

	const searchLinkedEvents = async (query: string) => {
		setLinkedEventLoading(true);

		const lowerQuery = query.trim().toLowerCase();
		const matched = hazardousEventOptions.filter((item) => {
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
					(item) =>
						!linkedEventTarget.some((selected) => selected.id === item.id),
				)
				.slice(0, 10),
		);
		setLinkedEventLoading(false);
	};

	const searchLinkedDisasterEvents = async (query: string) => {
		setLinkedDisasterEventLoading(true);

		const lowerQuery = query.trim().toLowerCase();
		const matched = disasterEventOptions.filter((item) => {
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
					(item) =>
						!linkedDisasterEventTarget.some(
							(selected) => selected.id === item.id,
						),
				)
				.slice(0, 10),
		);
		setLinkedDisasterEventLoading(false);
	};

	const searchLinkedDisasterRecords = async (query: string) => {
		setLinkedDisasterRecordLoading(true);

		const lowerQuery = query.trim().toLowerCase();
		const matched = disasterRecordOptions.filter((item) => {
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
					(item) =>
						!linkedDisasterRecordTarget.some(
							(selected) => selected.id === item.id,
						),
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

	const openAffectedAreasModal = () => {
		navigate("affected-areas-modal");
	};

	const openSpatialFootprintModal = () => {
		navigate("spatial-footprint-modal");
	};

	const toast = useRef<Toast>(null);
	const glideTooltipRef = useRef<Tooltip>(null);
	const hazardTypeObservedTooltipRef = useRef<Tooltip>(null);
	const hazardClusterObservedTooltipRef = useRef<Tooltip>(null);
	const specificHazardObservedTooltipRef = useRef<Tooltip>(null);

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
		const linkedIds = new Set(linkedHazardousEvents.map((event) => event.id));
		setLinkedEventTarget(linkedHazardousEvents);
		setLinkedEventSource(
			hazardousEventOptions
				.filter((event) => !linkedIds.has(event.id))
				.slice(0, 10),
		);
	}, [hazardousEventOptions, linkedHazardousEvents]);

	useEffect(() => {
		const linkedIds = new Set(linkedDisasterEvents.map((event) => event.id));
		setLinkedDisasterEventTarget(linkedDisasterEvents);
		setLinkedDisasterEventSource(
			disasterEventOptions
				.filter((event) => !linkedIds.has(event.id))
				.slice(0, 10),
		);
	}, [disasterEventOptions, linkedDisasterEvents]);

	useEffect(() => {
		searchLinkedEvents("");
		searchLinkedDisasterEvents("");
		searchLinkedDisasterRecords("");
	}, []);

	useEffect(() => {
		const animationFrameId = requestAnimationFrame(() => {
			glideTooltipRef.current?.updateTargetEvents();
			hazardTypeObservedTooltipRef.current?.updateTargetEvents();
			hazardClusterObservedTooltipRef.current?.updateTargetEvents();
			specificHazardObservedTooltipRef.current?.updateTargetEvents();
		});

		const timeoutId = window.setTimeout(() => {
			glideTooltipRef.current?.updateTargetEvents();
			hazardTypeObservedTooltipRef.current?.updateTargetEvents();
			hazardClusterObservedTooltipRef.current?.updateTargetEvents();
			specificHazardObservedTooltipRef.current?.updateTargetEvents();
		}, 150);

		return () => {
			cancelAnimationFrame(animationFrameId);
			window.clearTimeout(timeoutId);
		};
	}, [activeStep]);

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
					header="Are you sure you want to exit?"
					visible={visibleExitModal}
					onHide={() => setVisibleExitModal(false)}
					style={{ width: "42rem", maxWidth: "92vw" }}
					draggable={false}
					resizable={false}
				>
					<p className="mb-5 text-[16px] leading-[24px] text-slate-500">
						If you leave this page, your work will not be saved.
					</p>
					<div>
						<Button
							type="button"
							label="Save as draft"
							className="w-full"
							onClick={saveDraftAndExit}
						/>
					</div>
					<div className="mt-2.5">
							<Button
								type="button"
								label="Discard work and exit"
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
									aria-label="Close"
									onClick={openExitConfirmModal}
								/>
							</div>
						</div>

						<Tooltip
							key={`glide-tooltip-${activeStep}`}
							ref={glideTooltipRef}
							target=".glide-info-tooltip"
							content="A globally unique identifier used to cross-reference this event across international disaster risk systems"
						/>
						<Tooltip
							key={`hazard-type-observed-tooltip-${activeStep}`}
							ref={hazardTypeObservedTooltipRef}
							target=".hazard-type-observed-tooltip"
							content="The observed hazard type before full confirmation"
						/>
						<Tooltip
							key={`hazard-cluster-observed-tooltip-${activeStep}`}
							ref={hazardClusterObservedTooltipRef}
							target=".hazard-cluster-observed-tooltip"
							content="The observed hazard cluster"
						/>
						<Tooltip
							key={`specific-hazard-observed-tooltip-${activeStep}`}
							ref={specificHazardObservedTooltipRef}
							target=".specific-hazard-observed-tooltip"
							content="The specific observed hazard"
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
											<label
												htmlFor="nameNational"
												className="mb-1 inline-flex items-center gap-2"
											>
												<span className="text-red-500">*</span> Disaster name -
												national
											</label>
											<InputText
												id="nameNational"
												name="nameNational"
												defaultValue={form.nameNational}
												placeholder="For example, Hurricane Mitch"
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
												Disaster name - Other (Global or Regional)
											</label>
											<InputText
												id="nameGlobalOrRegional"
												name="nameGlobalOrRegional"
												defaultValue={form.nameGlobalOrRegional}
												placeholder="Add event name"
												className="w-full"
											/>
										</div>

										<div className="col-span-12 md:col-span-4">
											<label
												htmlFor="nationalDisasterId"
												className="mb-1 inline-flex items-center gap-2"
											>
												National event ID
											</label>
											<InputText
												id="nationalDisasterId"
												name="nationalDisasterId"
												defaultValue={form.nationalDisasterId}
												placeholder="Add event ID"
												className="w-full"
											/>
										</div>

										<div className="col-span-12 md:col-span-4">
											<label
												htmlFor="glide"
												className="mb-1 inline-flex items-center gap-2"
											>
												<span className="inline-flex items-center gap-1">
													GLIDE number
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
												placeholder="Add GLIDE number"
												className="w-full"
											/>
										</div>

										<div className="col-span-12 md:col-span-4">
											<label
												htmlFor="disasterEventId"
												className="mb-1 inline-flex items-center gap-2"
											>
												Disaster event UUID
											</label>
											<div className="flex items-center gap-2">
												<InputText
													defaultValue={ shortUuid(form.id.toString()) }
													readOnly
													className="w-full !border-slate-100 !bg-slate-50 shadow-none cursor-not-allowed"
												/>
												<input type="hidden" id="id" name="id" value={form.id} />

												<Button
													type="button"
													icon="pi pi-copy"
													text
													rounded
													title="Copy UUID"
													aria-label="Copy disaster event UUID"
													onClick={() => copyUuidToClipboard(form.id.toString())}
												/>
											</div>
										</div>

										<div className="col-span-12 md:col-span-4">
											<label
												htmlFor="recordingInstitution"
												className="mb-1 inline-flex items-center gap-2"
											>
												Recording organisation
											</label>
											<InputText
												id="recordingInstitution"
												name="recordingInstitution"
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
											Detailed information regarding the observed hazards and
											timing.
										</p>
									</div>

									<div className="col-span-12 grid grid-cols-12 gap-4">
										<div className="col-span-12 md:col-span-4">
											<label
												htmlFor="hazardTypeObserved"
												className="mb-1 inline-flex items-center gap-2"
											>
												Hazard type (observed){" "}
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
												placeholder="Select hazard type"
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
												Hazard cluster (observed){" "}
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
												placeholder="Select hazard cluster"
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
												Specific hazard (observed){" "}
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
												placeholder="Enter hazard name or HIPS code"
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
													"Start date",
													startDateState,
													setStartDateState,
													errors.startDate,
												)}
												{renderDateWithPrecision(
													"endDate",
													"End date",
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
											Disaster event spatial information
										</h2>
										<p className="mt-2 text-[14px] leading-[22px] text-slate-500">
											Indicate the geographic areas where the disaster event was
											experienced.
										</p>
									</div>

									<div className="col-span-12 space-y-4">
										<div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
											<div className="flex items-start justify-between gap-4">
												<div>
													<div className="flex items-center gap-2">
														<i className="pi pi-map-marker text-blue-500" />
														<h3 className="text-[18px] font-semibold text-slate-800">
															Geographical level
														</h3>
													</div>
													<p className="mt-2 text-[14px] leading-[22px] text-slate-500">
														Select the administrative areas where the disaster
														event was experienced.
													</p>
													<div className="mt-2.5">
														<Button
															type="button"
															label="Add affected areas"
															outlined
															icon="pi pi-plus"
															onClick={openAffectedAreasModal}
														/>
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
																		aria-label={`Remove ${item.label}`}
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
												<i className="pi pi-chevron-right pt-2 text-slate-400" />
											</div>
										</div>

										<div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
											<div className="mb-4 flex items-start justify-between gap-4">
												<div>
													<div className="flex items-center gap-2">
														<i className="pi pi-map text-blue-500" />
														<h3 className="text-[18px] font-semibold text-slate-800">
															Spatial footprint
														</h3>
													</div>
													<p className="mt-2 text-[14px] leading-[22px] text-slate-500">
														Define the specific geographic area affected using interactive map coordinates or manual input.
													</p>
													<div className="mt-2.5">
														<Button
															type="button"
															label="Define spatial footprint"
															outlined
															icon="pi pi-map"
															onClick={openSpatialFootprintModal}
														/>
													</div>
												</div>
												<i className="pi pi-chevron-right pt-2 text-slate-400" />
											</div>
											<div className="px-3 py-3 text-[13px] text-slate-600">
												{spatialFootprintValue.length > 0
													? `${spatialFootprintValue.length} spatial footprint item(s) added`
													: "No spatial footprint items added yet"}
											</div>
										</div>
									</div>
								</div>

								<div className="flex items-center justify-between w-full mt-20">
									<Button
										type="button"
										label="Cancel"
										outlined
										onClick={openExitConfirmModal}
									/>
									<div className="flex gap-2">
										<Button
											type="button"
											label="Save as draft"
											outlined
											onClick={saveAsDraft}
										/>
										<Button
											type="button"
											label="Next"
											icon="pi pi-chevron-right"
											iconPos="right"
											onClick={goNext}
										/>
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
													onChange={(event) =>
														setLinkedEventSearch(event.target.value)
													}
													placeholder="Type to search hazardous events..."
													className="w-full pr-10"
												/>
											</div>
											<Button
												type="button"
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
													onChange={(event) =>
														setLinkedDisasterEventSearch(event.target.value)
													}
													placeholder="Type to search disaster events..."
													className="w-full pr-10"
												/>
											</div>
											<Button
												type="button"
												label={
													linkedDisasterEventLoading ? "Searching..." : "Search"
												}
												onClick={() =>
													searchLinkedDisasterEvents(linkedDisasterEventSearch)
												}
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
													onChange={(event) =>
														setLinkedDisasterRecordSearch(event.target.value)
													}
													placeholder="Type to search disaster records..."
													className="w-full pr-10"
												/>
											</div>
											<Button
												type="button"
												label={
													linkedDisasterRecordLoading
														? "Searching..."
														: "Search"
												}
												onClick={() =>
													searchLinkedDisasterRecords(
														linkedDisasterRecordSearch,
													)
												}
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

								<div className="flex items-center justify-between w-full mt-20">
									<Button
										type="button"
										label="Cancel"
										outlined
										onClick={openExitConfirmModal}
									/>
									<div className="flex gap-2">
										<Button
											type="button"
											label="Save as draft"
											outlined
											onClick={saveAsDraft}
										/>
										<Button
											type="button"
											label="Back"
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
											label="Next"
											icon="pi pi-chevron-right"
											iconPos="right"
											onClick={goToAdditionalDetails}
										/>
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
									<h3 className="text-[18px] leading-[24px] font-semibold text-slate-800">
										Additional details
									</h3>
									<p className="mt-2 text-[14px] text-slate-500">
										Document responses, assessments, and official declarations
										related to this disaster event.
									</p>

									<div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
										<div className="flex items-start gap-3">
											<div className="rounded-xl bg-blue-100 p-2">
												<i className="pi pi-file-edit text-blue-600" />
											</div>
											<div>
												<h4 className="text-[18px] leading-[24px] font-semibold text-slate-800">
													Responses
												</h4>
												<p className="text-[14px] text-slate-500">
													Track early actions and response operations
												</p>
											</div>
										</div>
										<Button
											type="button"
											label="Add response"
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
										renderEmptyDetails("No responses recorded yet")
									)}

									<div className="my-8 border-t border-slate-200" />

									<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
										<div className="flex items-start gap-3">
											<div className="rounded-xl bg-violet-100 p-2">
												<i className="pi pi-clipboard text-violet-600" />
											</div>
											<div>
												<h4 className="text-[18px] leading-[24px] font-semibold text-slate-800">
													Assessments
												</h4>
												<p className="text-[14px] text-slate-500">
													Document needs assessments and evaluations
												</p>
											</div>
										</div>
										<Button
											type="button"
											label="Add assessment"
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
										renderEmptyDetails("No assessments recorded yet")
									)}

									<div className="my-8 border-t border-slate-200" />

									<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
										<div className="flex items-start gap-3">
											<div className="rounded-xl bg-amber-100 p-2">
												<i className="pi pi-send text-amber-600" />
											</div>
											<div>
												<h4 className="text-[18px] leading-[24px] font-semibold text-slate-800">
													Official declarations
												</h4>
												<p className="text-[14px] text-slate-500">
													Record official emergency declarations
												</p>
											</div>
										</div>
										<Button
											type="button"
											label="Add declaration"
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
										renderEmptyDetails("No declarations recorded yet")
									)}
								</div>

								<Dialog
									header={
										editingDetailId
											? `Edit ${detailDialogCategory}`
											: `Add ${detailDialogCategory}`
									}
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
												onChange={(event) => {
													const selectedType = event.target.value;
													setDetailForm((state) => ({
														...state,
														type: selectedType,
														dateValue:
															detailDialogCategory === "response" &&
															selectedType === "response_operation"
																? null
																: detailDialogCategory === "declaration" &&
																	  selectedType !==
																			"disaster_declaration_effects"
																	? null
																	: state.dateValue,
														declarationStatus:
															selectedType === "disaster_declaration"
																? state.declarationStatus
																: "",
														hadOfficialWarningOrWeatherAdvisory:
															selectedType === "official_warning"
																? state.hadOfficialWarningOrWeatherAdvisory
																: false,
														officialWarningAffectedAreas:
															selectedType === "official_warning"
																? state.officialWarningAffectedAreas
																: "",
													}));
												}}
												disabled={Boolean(editingDetailId)}
												className="w-full rounded-md border border-slate-300 px-3 py-2"
											>
												<option value="">Select type</option>
												{detailTypeOptions.map((option) => (
													<option key={option.value} value={option.value}>
														{option.label}
													</option>
												))}
											</select>
										</div>

										{showDateField ? (
											<div>
												<label className="mb-1 block">Date</label>
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
													placeholder="Select date"
													showIcon
													className="w-full"
												/>
											</div>
										) : null}

										{isDeclarationStatusType ? (
											<div>
												<label className="mb-1 block">
													Disaster declaration status
												</label>
												<select
													value={detailForm.declarationStatus}
													onChange={(event) =>
														setDetailForm((state) => ({
															...state,
															declarationStatus: event.target.value as
																| DeclarationStatus
																| "",
														}))
													}
													className="w-full rounded-md border border-slate-300 px-3 py-2"
												>
													<option value="">Select declaration status</option>
													{declarationStatusOptions.map((option) => (
														<option key={option.value} value={option.value}>
															{option.label}
														</option>
													))}
												</select>
											</div>
										) : null}

										{isOfficialWarningType ? (
											<div className="space-y-3">
												<label className="flex items-center gap-2 text-sm text-slate-700">
													<input
														type="checkbox"
														checked={
															detailForm.hadOfficialWarningOrWeatherAdvisory
														}
														onChange={(event) =>
															setDetailForm((state) => ({
																...state,
																hadOfficialWarningOrWeatherAdvisory:
																	event.target.checked,
															}))
														}
													/>
													<span>
														Was there an officially issued warning and/or
														weather advisory?
													</span>
												</label>

												<div>
													<label className="mb-1 block">
														Which affected areas were covered by the warning?
													</label>
													<InputTextarea
														value={detailForm.officialWarningAffectedAreas}
														onChange={(event) =>
															setDetailForm((state) => ({
																...state,
																officialWarningAffectedAreas:
																	event.target.value,
															}))
														}
														rows={3}
														placeholder="Enter affected areas"
														className="w-full"
													/>
													{detailForm.hadOfficialWarningOrWeatherAdvisory &&
													!hasOfficialWarningAreas ? (
														<p className="mt-1 text-xs text-red-600">
															Affected areas are required when warning/advisory
															is checked.
														</p>
													) : null}
												</div>
											</div>
										) : null}

										{!isDeclarationStatusType && !isOfficialWarningType ? (
											<div>
												<label className="mb-1 block">Description</label>
												<InputTextarea
													value={detailForm.description}
													onChange={(event) =>
														setDetailForm((state) => ({
															...state,
															description: event.target.value,
														}))
													}
													rows={4}
													placeholder="Enter description"
													className="w-full"
												/>
											</div>
										) : null}

										<div className="flex items-center justify-between gap-2 pt-2">
											<div>
												{editingDetailId ? (
													<Button
														type="button"
														label="Delete"
														severity="danger"
														outlined
														onClick={deleteDetail}
													/>
												) : null}
											</div>
											<div className="flex gap-2">
												<Button
													type="button"
													label="Cancel"
													outlined
													onClick={() => setDetailDialogVisible(false)}
												/>
												<Button
													type="button"
													label={
														editingDetailId
															? `Save ${detailDialogCategory}`
															: `Add ${detailDialogCategory}`
													}
													disabled={!canSaveDetail}
													onClick={saveDetail}
												/>
											</div>
										</div>
									</div>
								</Dialog>

								<div className="flex items-center justify-between w-full mt-20">
									<Button
										type="button"
										label="Cancel"
										outlined
										onClick={openExitConfirmModal}
									/>
									<div className="flex gap-2">
										<Button
											type="button"
											label="Save as draft"
											outlined
											onClick={saveAsDraft}
										/>
										<Button
											type="button"
											label="Back"
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
											label="Next"
											icon="pi pi-chevron-right"
											iconPos="right"
											onClick={goToReview}
										/>
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

									<Card
										className="rounded-2xl border border-slate-200 shadow-none"
										pt={{ body: { style: { padding: "5px 20px 5px 20px" } } }}
									>
										<div className="space-y-6">
											<div className="flex items-center gap-2 text-slate-800">
												<i className="pi pi-info-circle text-blue-600" />
												<h4 className="text-[16px] leading-[16px] font-semibold">
													Basic information
												</h4>
											</div>
											<div className="grid grid-cols-1 gap-6 md:grid-cols-2">
												{renderReviewItem(
													"Disaster name - national",
													form.nameNational,
												)}
												{renderReviewItem(
													"Disaster name - global/regional",
													form.nameGlobalOrRegional,
												)}
												{renderReviewItem(
													"National event ID",
													form.nationalDisasterId,
												)}
												{renderReviewItem("GLIDE number", form.glide)}
												{renderReviewItem("Disaster event UUID", form.id)}
												{renderReviewItem(
													"Recording organisation",
													form.recordingInstitution,
												)}
											</div>
										</div>
									</Card>

									<Card
										className="rounded-2xl border border-slate-200 shadow-none"
										pt={{ body: { style: { padding: "5px 20px 5px 20px" } } }}
									>
										<div className="space-y-6">
											<div className="flex items-center gap-2 text-slate-800">
												<i className="pi pi-map-marker text-blue-600" />
												<h4 className="text-[16px] leading-[16px] font-semibold">
													Hazard details
												</h4>
											</div>
											<div className="grid grid-cols-1 gap-6 md:grid-cols-2">
												{renderReviewItem(
													"Hazard type",
													sortedHipTypes.find(
														(item) => item.id === selectedHipTypeId,
													)?.name || "",
												)}
												{renderReviewItem(
													"Hazard cluster",
													sortedHipClusters.find(
														(item) => item.id === selectedHipClusterId,
													)?.name || "",
												)}
												{renderReviewItem(
													"Specific hazard",
													sortedHipHazards.find(
														(item) => item.id === selectedHipHazardId,
													)?.name || "",
												)}
											</div>
											<div className="grid grid-cols-1 gap-6 md:grid-cols-2">
												{renderReviewTimingItem(
													"Start",
													startDateState,
													startTime,
												)}
												{renderReviewTimingItem(
													"End",
													endDateState,
													endTime,
												)}
											</div>
										</div>
									</Card>

									{renderStep4SectionCard(
										"Location",
										"pi pi-map-marker text-blue-600",
										"No location details available",
										<>
											<div className="space-y-2">
												<p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
													Geographic levels
												</p>
												{selectedDivisionItems.length > 0 ? (
													<div className="flex flex-wrap gap-2">
														{selectedDivisionItems.map((item) => (
															<span
																key={`review-division-${item.key}`}
																className="rounded-md bg-blue-50 px-2 py-1 text-[12px] text-blue-700"
															>
																{item.label}
															</span>
														))}
													</div>
												) : (
													<p className="text-[14px] italic text-slate-400">
														No geographic levels selected
													</p>
												)}
											</div>

											<div className="space-y-2">
												<p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
													Spatial footprint
												</p>
												{reviewSpatialFootprintItems.length > 0 ? (
													<ul className="list-disc pl-5 text-[14px] text-slate-500">
														{reviewSpatialFootprintItems.map((title, index) => (
															<li key={`review-footprint-${index}`}>{title}</li>
														))}
													</ul>
												) : (
													<p className="text-[14px] italic text-slate-400">
														No spatial data defined
													</p>
												)}
											</div>
										</>,
										selectedDivisionItems.length > 0 ||
											reviewSpatialFootprintItems.length > 0,
									)}

									{renderStep4SectionCard(
										"Linked events",
										"pi pi-link text-blue-600",
										"No linked hazardous or disaster events selected yet",
										<>
											{reviewLinkedHazardousEventRows}
											{reviewLinkedDisasterEventRows}
										</>,
										reviewLinkedHazardousEventRows.length > 0 ||
											reviewLinkedDisasterEventRows.length > 0,
									)}

									{renderStep4SectionCard(
										"Linked disaster records",
										"pi pi-file text-blue-600",
										"No disaster records linked yet",
										linkedDisasterRecordTarget.map((record) => (
											<div key={record.id} className="space-y-1">
												<p className="text-[14px] font-semibold text-slate-700">
													{record.name}
												</p>
												<p className="text-[13px] text-slate-500">
													{record.code}
												</p>
											</div>
										)),
										linkedDisasterRecordTarget.length > 0,
									)}

									{renderStep4SectionCard(
										"Responses",
										"pi pi-file-edit text-blue-600",
										"No responses recorded yet",
										responses.map((item) =>
											renderStep4DetailRow("response", item),
										),
										responses.length > 0,
									)}

									{renderStep4SectionCard(
										"Assessments",
										"pi pi-clipboard text-violet-600",
										"No assessments recorded yet",
										assessments.map((item) =>
											renderStep4DetailRow("assessment", item),
										),
										assessments.length > 0,
									)}

									{renderStep4SectionCard(
										"Official declarations",
										"pi pi-send text-amber-600",
										"No declarations recorded yet",
										declarations.map((item) =>
											renderStep4DetailRow("declaration", item),
										),
										declarations.length > 0,
									)}
								</div>

								<div className="flex items-center justify-between w-full mt-20">
									<Button
										type="button"
										label="Cancel"
										outlined
										onClick={openExitConfirmModal}
									/>
									<div className="flex gap-2">
										<Button
											type="button"
											label="Save as draft"
											outlined
											onClick={saveAsDraft}
										/>
										<Button
											type="button"
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
											type="button"
											label="Save"
											onClick={() => {
												const snapshot = saveCurrentFormState();
												if (validateStep1(snapshot)) {
													setVisibleModalSubmit(true);
												}
											}}
										/>
									</div>
								</div>
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
				}}
			/>
		</>
	);
}


export type DisasterEventFormProps = StepperValidationProps;

export default function DisasterEventForm(props: DisasterEventFormProps) {
	return <StepperValidation {...props} />;
}
