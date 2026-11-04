import type {
	HazardousEventAttachmentProps,
	HazardousEventStatus,
} from "../../domain/HazardousEvent";

export interface ParsedHazardousEventFormData {
	specificHazardId: string;
	startDate: string;
	endDate: string;
	nationalSpecification: string;
	description: string;
	chainsExplanation: string;
	magnitude: string;
	recordOriginator: string;
	dataSource: string;
	hazardousEventStatus: HazardousEventStatus | null;
	specificHazardLocalName: string | null;
	specificHazardNationalName: string | null;
	/** `undefined` (not `""`) when absent -- matches CreateHazardousEventCommand/UpdateHazardousEventCommand's own "absent" convention for causeId. */
	causeId: string | undefined;
	causalityExplanation: string | null;
	/** True only when the user used the "Change"/"Unset" parent controls this submission
	 * (set via a hidden field) -- the DTO has no current-cause field to diff against. */
	causeIdChanged: boolean;
	spatialObservation:
		| { geometries: unknown[]; divisionIds: string[] }
		| undefined;
	/** True only when the user edited the spatial-footprint widget this submission -- avoids
	 * appending a new observation row on every plain save. */
	spatialObservationChanged: boolean;
	/** The form's full, current attachment-metadata list (JSON-encoded, ContentRepeater's own
	 * state) -- always complete, same "resend everything" convention as legacy, so no
	 * changed-flag is needed (unlike causeId/spatialObservation). */
	attachments: readonly HazardousEventAttachmentProps[];
	/** Raw legacy ApprovalAction string ("submit-draft"/"submit-validate"/"submit-publish"/"submit-validation"/"submit-return"), or null when absent. */
	tempAction: string | null;
	/** Parsed per legacy's own parseValidatorIds (approvalWorkflowService.ts:389-394). */
	validatorUserIds: readonly string[];
}

function str(formData: FormData, key: string): string {
	const value = formData.get(key);
	return typeof value === "string" ? value : "";
}

function strOrNull(formData: FormData, key: string): string | null {
	const value = str(formData, key);
	return value === "" ? null : value;
}

function isAttachmentProps(
	value: unknown,
): value is HazardousEventAttachmentProps {
	if (typeof value !== "object" || value === null) {
		return false;
	}
	const v = value as Record<string, unknown>;
	return (
		typeof v.id === "string" &&
		typeof v.title === "string" &&
		typeof v.fileKey === "string" &&
		typeof v.fileName === "string" &&
		typeof v.fileType === "string" &&
		typeof v.fileSize === "number"
	);
}

function parseAttachments(
	raw: string,
): readonly HazardousEventAttachmentProps[] {
	if (raw === "") {
		return [];
	}
	try {
		const parsed = JSON.parse(raw) as unknown;
		return Array.isArray(parsed) ? parsed.filter(isAttachmentProps) : [];
	} catch {
		return [];
	}
}

function parseSpatialObservation(
	raw: string,
): ParsedHazardousEventFormData["spatialObservation"] {
	if (raw === "") {
		return undefined;
	}
	try {
		const parsed = JSON.parse(raw) as {
			geometries?: unknown;
			divisionIds?: unknown;
		};
		return {
			geometries: Array.isArray(parsed.geometries) ? parsed.geometries : [],
			divisionIds: Array.isArray(parsed.divisionIds)
				? parsed.divisionIds.filter(
						(id): id is string => typeof id === "string",
					)
				: [],
		};
	} catch {
		return undefined;
	}
}

/** Shared by the create/edit actions -- field set per design.md Decision 9. hazardDriverIds/
 * fieldValues/customFieldValues aren't part of this form and are always empty; the parent
 * picker (Section 8) feeds `causeId` the same way. */
export function parseHazardousEventFormData(
	formData: FormData,
): ParsedHazardousEventFormData {
	return {
		specificHazardId: str(formData, "specificHazardId"),
		startDate: str(formData, "startDate"),
		endDate: str(formData, "endDate"),
		nationalSpecification: str(formData, "nationalSpecification"),
		description: str(formData, "description"),
		chainsExplanation: str(formData, "chainsExplanation"),
		magnitude: str(formData, "magnitude"),
		recordOriginator: str(formData, "recordOriginator"),
		dataSource: str(formData, "dataSource"),
		hazardousEventStatus: strOrNull(
			formData,
			"hazardousEventStatus",
		) as HazardousEventStatus | null,
		specificHazardLocalName: strOrNull(formData, "specificHazardLocalName"),
		specificHazardNationalName: strOrNull(
			formData,
			"specificHazardNationalName",
		),
		causeId: strOrNull(formData, "causeId") ?? undefined,
		causalityExplanation: strOrNull(formData, "causalityExplanation"),
		causeIdChanged: str(formData, "causeIdChanged") === "1",
		spatialObservation: parseSpatialObservation(
			str(formData, "spatialObservation"),
		),
		spatialObservationChanged:
			str(formData, "spatialObservationChanged") === "1",
		attachments: parseAttachments(str(formData, "attachments")),
		tempAction: strOrNull(formData, "tempAction"),
		validatorUserIds: str(formData, "tempValidatorUserIds")
			.split(",")
			.map((id) => id.trim())
			.filter((id) => id.length > 0),
	};
}
