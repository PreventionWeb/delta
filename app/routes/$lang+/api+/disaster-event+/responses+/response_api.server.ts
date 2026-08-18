import { ResponseTypeRepository } from "~/db/queries/responseTypeRepository";
import { DisasterEventRepository } from "~/db/queries/disasterEventRepository";
import { DisasterEventResponseAttachmentRepository } from "~/db/queries/disasterEventResponseAttachmentRepository";
import {
	DisasterEventResponseListItem,
	DisasterEventResponseRepository,
} from "~/db/queries/disasterEventResponseRepository";

export interface ResponseAttachmentInput {
	title?: string | null;
	fileKey?: string | null;
	fileName?: string | null;
	fileType?: string | null;
	fileSize?: number | string | null;
}

export interface ResponsePayload {
	disasterEventId?: string;
	responseTypeId?: string;
	responseType?: string;
	responseDate?: string | Date | null;
	coverage?: string | null;
	description?: string | null;
	attachments?: ResponseAttachmentInput[];
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

export interface ResponseApiEntity {
	id: string;
	disasterEventId: string | null;
	responseTypeId: string;
	responseType: string;
	responseDate: Date | null;
	coverage: string | null;
	description: string | null;
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

function normalizeResponseDate(value: unknown): Date | null {
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

async function resolveResponseTypeId(payload: ResponsePayload) {
	const responseTypeId = String(payload.responseTypeId ?? "").trim();
	if (responseTypeId) {
		const byId = await ResponseTypeRepository.getById(responseTypeId);
		if (byId) {
			return byId.id;
		}
	}

	const responseType = String(payload.responseType ?? "").trim();
	if (!responseType) {
		return null;
	}
	const byType = await ResponseTypeRepository.getByType(responseType);
	return byType?.id ?? null;
}

async function hydrateResponses(
	rows: DisasterEventResponseListItem[],
): Promise<ResponseApiEntity[]> {
	if (rows.length === 0) {
		return [];
	}

	const responseIds = rows.map((row) => row.id);
	const attachments =
		await DisasterEventResponseAttachmentRepository.listByDisasterEventResponseIds(
			responseIds,
		);

	const attachmentsByResponseId = attachments.reduce<
		Record<string, ResponseApiEntity["attachments"]>
	>((accumulator, row) => {
		const key = row.disasterEventResponseId;
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
		responseTypeId: row.responseTypeId,
		responseType: row.responseType,
		responseDate: row.responseDate,
		coverage: row.coverage,
		description: row.description,
		attachments: attachmentsByResponseId[row.id] ?? [],
	}));
}

export function normalizeResponsePayload(payload: ResponsePayload) {
	const responseTypeId = String(payload.responseTypeId ?? "").trim();
	const responseType = String(payload.responseType ?? "").trim();
	const coverage = normalizeNullableText(payload.coverage) ?? "";
	const description = normalizeNullableText(payload.description) ?? "";
	if (!responseTypeId && !responseType) {
		throwHttpResponse("responseTypeId or responseType is required", 400);
	}

	return {
		responseTypeId: responseTypeId || undefined,
		responseType: responseType || undefined,
		coverage: coverage || null,
		description: description || null,
		responseDate:
			payload.responseDate !== undefined
				? normalizeResponseDate(payload.responseDate)
				: null,
	};
}

export function normalizeResponseAttachmentPayload(
	payload: ResponseAttachmentInput,
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

export async function listResponsesForTenant(args: {
	countryAccountsId: string;
	disasterEventId?: string;
}) {
	const rows = await DisasterEventResponseRepository.listByCountryAccountsId(
		args.countryAccountsId,
		args.disasterEventId,
	);
	return hydrateResponses(rows);
}

export async function getResponseForTenantById(args: {
	countryAccountsId: string;
	id: string;
}) {
	const row = await DisasterEventResponseRepository.getByIdAndCountryAccountsId(
		args.id,
		args.countryAccountsId,
	);
	if (!row) {
		return null;
	}
	const hydrated = await hydrateResponses([row]);
	return hydrated[0] ?? null;
}

export async function createResponseForTenant(args: {
	countryAccountsId: string;
	payload: ResponsePayload;
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

	const responseTypeId = await resolveResponseTypeId(args.payload);
	if (!responseTypeId) {
		throwHttpResponse("responseTypeId or responseType is required", 400);
	}

	const attachments = normalizeAttachments(args.payload.attachments);
	const created = await DisasterEventResponseRepository.withTransaction(
		async (tx) => {
			const response = await DisasterEventResponseRepository.createOne(
				{
					disasterEventId,
					responseTypeId,
					responseDate: normalizeResponseDate(args.payload.responseDate),
					coverage: normalizeNullableText(args.payload.coverage),
					description: normalizeNullableText(args.payload.description),
				},
				tx,
			);
			if (!response) {
				throwHttpResponse("Failed to create response", 500);
			}

			if (attachments.length > 0) {
				await DisasterEventResponseAttachmentRepository.createMany(
					attachments.map((attachment) => ({
						disasterEventResponseId: response.id,
						title: attachment.title,
						fileKey: attachment.fileKey,
						fileName: attachment.fileName,
						fileType: attachment.fileType,
						fileSize: Number(attachment.fileSize ?? 0),
					})),
					tx,
				);
			}

			return response.id;
		},
	);

	return getResponseForTenantById({
		countryAccountsId: args.countryAccountsId,
		id: created,
	});
}

export async function updateResponseForTenant(args: {
	countryAccountsId: string;
	id: string;
	payload: ResponsePayload;
}) {
	const existing = await getResponseForTenantById({
		countryAccountsId: args.countryAccountsId,
		id: args.id,
	});
	if (!existing) {
		throwHttpResponse("Response not found", 404);
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

	const responseTypeId =
		(await resolveResponseTypeId(args.payload)) ?? existing.responseTypeId;
	const hasAttachments = Array.isArray(args.payload.attachments);
	const attachments = hasAttachments
		? normalizeAttachments(args.payload.attachments)
		: [];

	await DisasterEventResponseRepository.withTransaction(async (tx) => {
		await DisasterEventResponseRepository.updateById(
			args.id,
			{
				disasterEventId: nextDisasterEventId,
				responseTypeId,
				responseDate:
					args.payload.responseDate !== undefined
						? normalizeResponseDate(args.payload.responseDate)
						: existing.responseDate,
				coverage:
					args.payload.coverage !== undefined
						? normalizeNullableText(args.payload.coverage)
						: existing.coverage,
				description:
					args.payload.description !== undefined
						? normalizeNullableText(args.payload.description)
						: existing.description,
			},
			tx,
		);

		if (hasAttachments) {
			await DisasterEventResponseAttachmentRepository.deleteByDisasterEventResponseId(
				args.id,
				tx,
			);
			if (attachments.length > 0) {
				await DisasterEventResponseAttachmentRepository.createMany(
					attachments.map((attachment) => ({
						disasterEventResponseId: args.id,
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

	return getResponseForTenantById({
		countryAccountsId: args.countryAccountsId,
		id: args.id,
	});
}

export async function deleteResponseForTenant(args: {
	countryAccountsId: string;
	id: string;
}) {
	const existing = await getResponseForTenantById({
		countryAccountsId: args.countryAccountsId,
		id: args.id,
	});
	if (!existing) {
		throwHttpResponse("Response not found", 404);
	}

	await DisasterEventResponseRepository.deleteById(args.id);
}
