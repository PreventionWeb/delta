import type { IAttachmentStoragePort } from "~/domains/shared/attachments/application/ports/IAttachmentStoragePort";
import { ValidationError } from "~/shared/errors";
import type { HazardousEventAttachmentProps } from "../../domain/HazardousEvent";
import type { HazardousEventAttachmentInput } from "../dto/HazardousEventAttachmentInput";
import { HAZARDOUS_EVENT_ATTACHMENT_OWNER_TYPE } from "./deleteAttachmentFiles";

export interface ResolvedAttachments {
	readonly attachments: readonly HazardousEventAttachmentProps[];
	/** fileKeys of existing File-type attachments no longer in `inputs` -- the caller deletes
	 * these AFTER the row write succeeds, not here (see CreateHazardousEvent.ts/
	 * UpdateHazardousEvent.ts's own ordering comments). */
	readonly fileKeysToDelete: readonly string[];
}

/**
 * Resolves the form's raw `HazardousEventAttachmentInput`s into the fully-populated,
 * domain-valid `HazardousEventAttachmentProps` that `HazardousEvent.create()` requires --
 * calling `promote()` for each new File-type item and carrying an existing row's file metadata
 * forward for an unchanged File-type item (matched by `fileKey`). MUST run inside the same
 * transaction as the entity write (design.md Decision 7) -- this is why `HazardousEvent.create()`
 * itself had to move inside the transaction callback in Create/UpdateHazardousEventUseCase (it
 * can't validate a File row before `promote()` has assigned it a real `fileKey`/`fileSize`).
 */
export async function resolveAttachmentsForWrite(
	inputs: readonly HazardousEventAttachmentInput[],
	existingAttachments: readonly HazardousEventAttachmentProps[],
	// Narrowed to the one method actually used (Gate 5/SOLID ISP finding).
	storagePort: Pick<IAttachmentStoragePort, "promote">,
	descriptor: { tenantId: string; ownerId: string },
): Promise<ResolvedAttachments> {
	const existingByFileKey = new Map(
		existingAttachments
			.filter(
				(
					attachment,
				): attachment is HazardousEventAttachmentProps & {
					fileKey: string;
				} => attachment.fileKey !== null,
			)
			.map((attachment) => [attachment.fileKey, attachment] as const),
	);

	const resolved: HazardousEventAttachmentProps[] = [];
	const keptFileKeys = new Set<string>();

	for (const input of inputs) {
		if (input.kind === "link") {
			resolved.push({
				id: input.id,
				title: input.title,
				type: "Link",
				url: input.url,
				tag: input.tag,
				fileKey: null,
				fileName: null,
				fileType: null,
				fileSize: null,
			});
			continue;
		}

		if (input.kind === "existingFile") {
			const existing = existingByFileKey.get(input.fileKey);
			if (existing === undefined) {
				// Never trust a client-supplied fileKey as-is (same rationale as design.md
				// Decision 1's path-construction rule) -- a resubmitted fileKey that doesn't match
				// anything this event has actually promoted is a structural error, not a new row.
				throw new ValidationError(
					"Attachment fileKey does not match an existing promoted file",
					{ fileKey: input.fileKey },
				);
			}
			keptFileKeys.add(input.fileKey);
			resolved.push({
				...existing,
				id: input.id,
				title: input.title,
				tag: input.tag,
			});
			continue;
		}

		// input.kind === "newFile"
		const { fileKey, fileSize, fileName } = await storagePort.promote(
			{
				tenantId: descriptor.tenantId,
				ownerType: HAZARDOUS_EVENT_ATTACHMENT_OWNER_TYPE,
				ownerId: descriptor.ownerId,
			},
			{ name: input.stagedFileName },
		);
		resolved.push({
			id: input.id,
			title: input.title,
			type: "File",
			url: null,
			tag: input.tag,
			fileKey,
			fileName,
			fileType: input.contentType,
			fileSize,
		});
	}

	const fileKeysToDelete = [...existingByFileKey.keys()].filter(
		(fileKey) => !keptFileKeys.has(fileKey),
	);

	return { attachments: resolved, fileKeysToDelete };
}
