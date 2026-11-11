import type { HazardousEventStatus } from "../../domain/HazardousEvent";
import type { HazardousEventAttachmentInput } from "../../application/dto/HazardousEventAttachmentInput";
import { sanitizeBasename } from "~/domains/shared/attachments/application/sanitizeBasename";
import { ValidationError } from "~/shared/errors";

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
	 * changed-flag is needed (unlike causeId/spatialObservation). Raw, pre-resolution shape --
	 * see HazardousEventAttachmentInput. */
	attachments: readonly HazardousEventAttachmentInput[];
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

/** `tag` is opaque JSON (design.md Decision 4) -- normalized to null rather than rejected, since
 * a malformed tag has no destructive consequence (unlike a malformed file_option/file/title,
 * which now drives a real promote/delete decision). */
function normalizeTag(
	value: unknown,
): ReadonlyArray<{ id: string; name: string }> | null {
	return Array.isArray(value) ? value : null;
}

/** A staged (just-uploaded-this-session) file's `file.name` lives under its tenant's `temp/`
 * directory (PreUploadFile.tsx's own response shape); an already-promoted one doesn't -- this
 * is the only signal available to tell them apart (ca-shared-attachments-module). */
function isStagedFileName(name: string): boolean {
	return name.split("/").includes("temp");
}

/** Converts one raw widget item into its resolved kind, or throws ValidationError for a
 * structurally malformed item -- a dropped item here now reads as "removed" on Update, which
 * deletes that attachment's real on-disk file, so malformed input must fail loudly instead of
 * being silently filtered out (ca-shared-attachments-module). */
function toAttachmentInput(value: unknown): HazardousEventAttachmentInput {
	if (typeof value !== "object" || value === null) {
		throw new ValidationError("Attachment item must be an object");
	}
	const v = value as Record<string, unknown>;
	if (typeof v.title !== "string") {
		throw new ValidationError("Attachment title must be a string");
	}
	const id = typeof v.id === "string" ? v.id : "";
	const title = v.title;
	const tag = normalizeTag(v.tag);

	if (v.file_option === "Link") {
		return {
			kind: "link",
			id,
			title,
			tag,
			url: typeof v.url === "string" ? v.url : "",
		};
	}

	if (v.file_option === "File") {
		const file = v.file as Record<string, unknown> | undefined;
		if (
			typeof file !== "object" ||
			file === null ||
			typeof file.name !== "string"
		) {
			throw new ValidationError(
				"File-type attachment item must have a file object",
			);
		}
		const name = sanitizeBasename(file.name);
		const contentType =
			typeof file.content_type === "string" ? file.content_type : "";
		return isStagedFileName(file.name)
			? { kind: "newFile", id, title, tag, stagedFileName: name, contentType }
			: { kind: "existingFile", id, title, tag, fileKey: name };
	}

	throw new ValidationError('Attachment file_option must be "File" or "Link"');
}

function parseAttachments(
	raw: string,
): readonly HazardousEventAttachmentInput[] {
	if (raw === "") {
		return [];
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		throw new ValidationError("attachments must be valid JSON");
	}
	if (!Array.isArray(parsed)) {
		throw new ValidationError("attachments must be an array");
	}
	return parsed.map(toAttachmentInput);
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
