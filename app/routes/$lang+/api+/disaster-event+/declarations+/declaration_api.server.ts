import { DeclarationStatusRepository } from "~/db/queries/declarationStatusRepository";
import { DisasterEventDeclarationAttachmentRepository } from "~/db/queries/disasterEventDeclarationAttachmentRepository";
import {
	DisasterEventDeclarationListItem,
	DisasterEventDeclarationRepository,
} from "~/db/queries/disasterEventDeclarationRepository";
import { DisasterEventRepository } from "~/db/queries/disasterEventRepository";

export interface DeclarationAttachmentInput {
	title?: string | null;
	fileKey?: string | null;
	fileName?: string | null;
	fileType?: string | null;
	fileSize?: number | string | null;
}

export interface DeclarationPayload {
	disasterEventId?: string;
	type?: string | null;
	effects?: string | null;
	declarationDate?: string | Date | null;
	issuingOrganization?: string | null;
	coverage?: string | null;
	declarationStatusId?: string | null;
	declarationStatus?: string | null;
	attachments?: DeclarationAttachmentInput[];
}

interface NormalizedAttachment {
	title: string;
	fileKey: string;
	fileName: string;
	fileType: string;
	fileSize: number;
}

class HttpResponseError extends Response {
	constructor(message: string, status: number) {
		super(message, { status });
		Object.defineProperty(this, "message", {
			get: () => message,
			configurable: true,
		});
		Object.defineProperty(this, "name", {
			value: "HttpResponseError",
			configurable: true,
		});
	}
}

function throwHttpResponse(message: string, status: number): never {
	throw new HttpResponseError(message, status);
}

export interface DeclarationApiEntity {
	id: string;
	disasterEventId: string;
	type: string | null;
	effects: string | null;
	declarationDate: Date | null;
	issuingOrganization: string | null;
	coverage: string | null;
	declarationStatusId: string | null;
	declarationStatus: string | null;
	declarationStatusDescription: string | null;
	attachments: Array<{
		id: string;
		title: string;
		fileKey: string;
		fileName: string;
		fileType: string;
		fileSize: number;
		createdAt: Date;
		updatedAt: Date | null;
	}>;
}

function normalizeNullableText(value: unknown): string | null {
	if (value === null || value === undefined) {
		return null;
	}
	const normalized = String(value).trim();
	return normalized.length > 0 ? normalized : null;
}

function normalizeDeclarationDate(value: unknown): Date | null {
	if (!value) {
		return null;
	}
	if (value instanceof Date) {
		return Number.isNaN(value.getTime()) ? null : value;
	}
	const date = new Date(String(value));
	if (Number.isNaN(date.getTime())) {
		return null;
	}
	return date;
}

function normalizeAttachments(attachments: unknown): NormalizedAttachment[] {
	if (!Array.isArray(attachments)) {
		return [];
	}

	return attachments
		.map((item) => ({
			title: String(item?.title ?? item?.fileName ?? "").trim(),
			fileKey: String(item?.fileKey ?? "").trim(),
			fileName: String(item?.fileName ?? "").trim(),
			fileType: String(item?.fileType ?? "").trim(),
			fileSize: Number(item?.fileSize ?? 0),
		}))
		.filter(
			(item) =>
				item.title.length > 0 &&
				item.fileKey.length > 0 &&
				item.fileName.length > 0,
		);
}

async function ensureDisasterEventBelongsToTenant(
	disasterEventId: string,
	countryAccountsId: string,
) {
	return DisasterEventRepository.existsByIdAndCountryAccountsId(
		disasterEventId,
		countryAccountsId,
	);
}

async function resolveDeclarationStatusId(payload: DeclarationPayload) {
	const declarationStatusId = String(payload.declarationStatusId ?? "").trim();
	if (declarationStatusId) {
		const byId = await DeclarationStatusRepository.getById(declarationStatusId);
		if (byId) {
			return byId.id;
		}
	}

	const declarationStatus = String(payload.declarationStatus ?? "").trim();
	if (!declarationStatus) {
		return null;
	}
	const byStatus =
		await DeclarationStatusRepository.getByStatus(declarationStatus);
	return byStatus?.id ?? null;
}

async function hydrateDeclarations(
	rows: DisasterEventDeclarationListItem[],
): Promise<DeclarationApiEntity[]> {
	if (rows.length === 0) {
		return [];
	}

	const declarationIds = rows.map((row) => row.id);
	const attachments =
		await DisasterEventDeclarationAttachmentRepository.listByDisasterEventDeclarationIds(
			declarationIds,
		);

	const attachmentsByDeclarationId = attachments.reduce<
		Record<string, DeclarationApiEntity["attachments"]>
	>((accumulator, row) => {
		const key = row.disasterEventDeclarationId;
		const previous = accumulator[key] ?? [];
		previous.push({
			id: row.id,
			title: row.title,
			fileKey: row.fileKey,
			fileName: row.fileName,
			fileType: row.fileType,
			fileSize: row.fileSize,
			createdAt: row.createdAt,
			updatedAt: row.updatedAt,
		});
		accumulator[key] = previous;
		return accumulator;
	}, {});

	return rows.map((row) => ({
		id: row.id,
		disasterEventId: row.disasterEventId,
		type: row.type,
		effects: row.effects,
		declarationDate: row.declarationDate,
		issuingOrganization: row.issuingOrganization,
		coverage: row.coverage,
		declarationStatusId: row.declarationStatusId,
		declarationStatus: row.declarationStatus,
		declarationStatusDescription: row.declarationStatusDescription,
		attachments: attachmentsByDeclarationId[row.id] ?? [],
	}));
}

export function normalizeDeclarationPayload(payload: DeclarationPayload) {
	return {
		type: normalizeNullableText(payload.type),
		effects: normalizeNullableText(payload.effects),
		issuingOrganization: normalizeNullableText(payload.issuingOrganization),
		coverage: normalizeNullableText(payload.coverage),
		declarationStatusId:
			String(payload.declarationStatusId ?? "").trim() || undefined,
		declarationStatus:
			String(payload.declarationStatus ?? "").trim() || undefined,
		declarationDate:
			payload.declarationDate !== undefined
				? normalizeDeclarationDate(payload.declarationDate)
				: null,
	};
}

export function normalizeDeclarationAttachmentPayload(
	payload: DeclarationAttachmentInput,
) {
	const title = String(payload?.title ?? payload?.fileName ?? "").trim();
	const fileKey = String(payload?.fileKey ?? "").trim();
	const fileName = String(payload?.fileName ?? "").trim();
	const fileType = String(payload?.fileType ?? "").trim();
	const fileSize = Number(payload?.fileSize ?? 0);

	if (!title || !fileKey || !fileName) {
		throwHttpResponse("title, fileKey and fileName are required", 400);
	}

	return {
		title,
		fileKey,
		fileName,
		fileType,
		fileSize,
	};
}

export async function listDeclarationsForTenant(args: {
	countryAccountsId: string;
	disasterEventId?: string;
}) {
	const rows = await DisasterEventDeclarationRepository.listByCountryAccountsId(
		args.countryAccountsId,
		args.disasterEventId,
	);
	return hydrateDeclarations(rows);
}

export async function getDeclarationForTenantById(args: {
	countryAccountsId: string;
	id: string;
}) {
	const row =
		await DisasterEventDeclarationRepository.getByIdAndCountryAccountsId(
			args.id,
			args.countryAccountsId,
		);
	if (!row) {
		return null;
	}
	const hydrated = await hydrateDeclarations([row]);
	return hydrated[0] ?? null;
}

export async function createDeclarationForTenant(args: {
	countryAccountsId: string;
	payload: DeclarationPayload;
}) {
	const disasterEventId = String(args.payload.disasterEventId ?? "").trim();
	if (!disasterEventId) {
		throwHttpResponse("disasterEventId is required", 400);
	}

	const eventExists = await ensureDisasterEventBelongsToTenant(
		disasterEventId,
		args.countryAccountsId,
	);
	if (!eventExists) {
		throwHttpResponse("Disaster event not found", 404);
	}

	const declarationStatusId = await resolveDeclarationStatusId(args.payload);
	const normalized = normalizeDeclarationPayload(args.payload);
	const attachments = normalizeAttachments(args.payload.attachments);

	const created = await DisasterEventDeclarationRepository.withTransaction(
		async (tx) => {
			const declaration = await DisasterEventDeclarationRepository.createOne(
				{
					disasterEventId,
					type: normalized.type,
					effects: normalized.effects,
					declarationDate: normalized.declarationDate,
					issuingOrganization: normalized.issuingOrganization,
					coverage: normalized.coverage,
					declarationStatusId,
				},
				tx,
			);
			if (!declaration) {
				throwHttpResponse("Failed to create declaration", 500);
			}

			if (attachments.length > 0) {
				await DisasterEventDeclarationAttachmentRepository.createMany(
					attachments.map((attachment) => ({
						disasterEventDeclarationId: declaration.id,
						title: attachment.title,
						fileKey: attachment.fileKey,
						fileName: attachment.fileName,
						fileType: attachment.fileType,
						fileSize: Number(attachment.fileSize ?? 0),
					})),
					tx,
				);
			}

			return declaration.id;
		},
	);

	return getDeclarationForTenantById({
		countryAccountsId: args.countryAccountsId,
		id: created,
	});
}

export async function updateDeclarationForTenant(args: {
	countryAccountsId: string;
	id: string;
	payload: DeclarationPayload;
}) {
	const existing = await getDeclarationForTenantById({
		countryAccountsId: args.countryAccountsId,
		id: args.id,
	});
	if (!existing) {
		throwHttpResponse("Declaration not found", 404);
	}

	const nextDisasterEventId = String(
		args.payload.disasterEventId ?? existing.disasterEventId,
	).trim();
	if (!nextDisasterEventId) {
		throwHttpResponse("disasterEventId is required", 400);
	}

	const eventExists = await ensureDisasterEventBelongsToTenant(
		nextDisasterEventId,
		args.countryAccountsId,
	);
	if (!eventExists) {
		throwHttpResponse("Disaster event not found", 404);
	}

	const resolvedDeclarationStatusId = await resolveDeclarationStatusId(
		args.payload,
	);
	const declarationStatusId =
		resolvedDeclarationStatusId ??
		(args.payload.declarationStatusId !== undefined ||
		args.payload.declarationStatus !== undefined
			? null
			: existing.declarationStatusId);

	const normalized = normalizeDeclarationPayload(args.payload);
	const hasAttachments = Array.isArray(args.payload.attachments);
	const attachments = hasAttachments
		? normalizeAttachments(args.payload.attachments)
		: [];

	await DisasterEventDeclarationRepository.withTransaction(async (tx) => {
		await DisasterEventDeclarationRepository.updateById(
			args.id,
			{
				disasterEventId: nextDisasterEventId,
				type: args.payload.type !== undefined ? normalized.type : existing.type,
				effects:
					args.payload.effects !== undefined
						? normalized.effects
						: existing.effects,
				declarationDate:
					args.payload.declarationDate !== undefined
						? normalized.declarationDate
						: existing.declarationDate,
				issuingOrganization:
					args.payload.issuingOrganization !== undefined
						? normalized.issuingOrganization
						: existing.issuingOrganization,
				coverage:
					args.payload.coverage !== undefined
						? normalized.coverage
						: existing.coverage,
				declarationStatusId,
			},
			tx,
		);

		if (hasAttachments) {
			await DisasterEventDeclarationAttachmentRepository.deleteByDisasterEventDeclarationIds(
				[args.id],
				tx,
			);
			if (attachments.length > 0) {
				await DisasterEventDeclarationAttachmentRepository.createMany(
					attachments.map((attachment) => ({
						disasterEventDeclarationId: args.id,
						title: attachment.title,
						fileKey: attachment.fileKey,
						fileName: attachment.fileName,
						fileType: attachment.fileType,
						fileSize: Number(attachment.fileSize ?? 0),
					})),
					tx,
				);
			}
		}
	});

	return getDeclarationForTenantById({
		countryAccountsId: args.countryAccountsId,
		id: args.id,
	});
}

export async function deleteDeclarationForTenant(args: {
	countryAccountsId: string;
	id: string;
}) {
	const existing = await getDeclarationForTenantById({
		countryAccountsId: args.countryAccountsId,
		id: args.id,
	});
	if (!existing) {
		throwHttpResponse("Declaration not found", 404);
	}

	await DisasterEventDeclarationRepository.deleteById(args.id);
}
