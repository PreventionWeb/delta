import { AssessmentTypeRepository } from "~/db/queries/assessmentTypeRepository";
import { DisasterEventAssessmentAttachmentRepository } from "~/db/queries/disasterEventAssessmentAttachmentRepository";
import {
	DisasterEventAssessmentListItem,
	DisasterEventAssessmentRepository,
} from "~/db/queries/disasterEventAssessmentRepository";
import { DisasterEventAssessmentSectorRepository } from "~/db/queries/disasterEventAssessmentSectorRepository";
import { DisasterEventRepository } from "~/db/queries/disasterEventRepository";

export interface AssessmentAttachmentInput {
	title?: string | null;
	fileKey?: string | null;
	fileName?: string | null;
	fileType?: string | null;
	fileSize?: number | string | null;
}

export interface AssessmentPayload {
	disasterEventId?: string;
	assessmentTypeId?: string;
	assessmentType?: string;
	coverage?: string | null;
	assessmentDate?: string | Date | null;
	description?: string | null;
	otherSectors?: string | null;
	sectorIds?: string[];
	attachments?: AssessmentAttachmentInput[];
}

interface NormalizedAttachment {
	title: string;
	fileKey: string;
	fileName: string;
	fileType: string;
	fileSize: number;
}

export interface AssessmentApiEntity {
	id: string;
	disasterEventId: string;
	assessmentTypeId: string;
	assessmentType: string;
	coverage: string | null;
	assessmentDate: Date | null;
	description: string | null;
	otherSectors: string | null;
	sectorIds: string[];
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

function normalizeAssessmentDate(value: unknown): Date | null {
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

function normalizeSectorIds(sectorIds: unknown): string[] {
	if (!Array.isArray(sectorIds)) {
		return [];
	}
	return Array.from(
		new Set(
			sectorIds
				.filter((value): value is string => typeof value === "string")
				.map((value) => value.trim())
				.filter((value) => value.length > 0),
		),
	);
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

async function resolveAssessmentTypeId(payload: AssessmentPayload) {
	const assessmentTypeId = String(payload.assessmentTypeId ?? "").trim();
	if (assessmentTypeId) {
		const byId = await AssessmentTypeRepository.getById(assessmentTypeId);
		if (byId) {
			return byId.id;
		}
	}

	const assessmentType = String(payload.assessmentType ?? "").trim();
	if (!assessmentType) {
		return null;
	}
	const byType = await AssessmentTypeRepository.getByType(assessmentType);
	return byType?.id ?? null;
}

async function hydrateAssessments(
	rows: DisasterEventAssessmentListItem[],
): Promise<AssessmentApiEntity[]> {
	if (rows.length === 0) {
		return [];
	}

	const assessmentIds = rows.map((row) => row.id);
	const [sectors, attachments] = await Promise.all([
		DisasterEventAssessmentSectorRepository.listByDisasterEventAssessmentIds(
			assessmentIds,
		),
		DisasterEventAssessmentAttachmentRepository.listByDisasterEventAssessmentIds(
			assessmentIds,
		),
	]);

	const sectorsByAssessmentId = sectors.reduce<Record<string, string[]>>(
		(accumulator, row) => {
			const key = row.disasterEventAssessmentId;
			const previous = accumulator[key] ?? [];
			previous.push(row.sectorId);
			accumulator[key] = previous;
			return accumulator;
		},
		{},
	);

	const attachmentsByAssessmentId = attachments.reduce<
		Record<string, AssessmentApiEntity["attachments"]>
	>((accumulator, row) => {
		const key = row.disasterEventAssessmentId;
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
		assessmentTypeId: row.assessmentTypeId,
		assessmentType: row.assessmentType,
		coverage: row.coverage,
		assessmentDate: row.assessmentDate,
		description: row.description,
		otherSectors: row.otherSectors,
		sectorIds: sectorsByAssessmentId[row.id] ?? [],
		attachments: attachmentsByAssessmentId[row.id] ?? [],
	}));
}

export async function listAssessmentsForTenant(args: {
	countryAccountsId: string;
	disasterEventId?: string;
}) {
	const rows = await DisasterEventAssessmentRepository.listByCountryAccountsId(
		args.countryAccountsId,
		args.disasterEventId,
	);
	return hydrateAssessments(rows);
}

export async function getAssessmentForTenantById(args: {
	countryAccountsId: string;
	id: string;
}) {
	const row =
		await DisasterEventAssessmentRepository.getByIdAndCountryAccountsId(
			args.id,
			args.countryAccountsId,
		);
	if (!row) {
		return null;
	}
	const hydrated = await hydrateAssessments([row]);
	return hydrated[0] ?? null;
}

export async function createAssessmentForTenant(args: {
	countryAccountsId: string;
	payload: AssessmentPayload;
}) {
	const disasterEventId = String(args.payload.disasterEventId ?? "").trim();
	if (!disasterEventId) {
		throw new Response("disasterEventId is required", { status: 400 });
	}

	const eventExists = await ensureDisasterEventBelongsToTenant(
		disasterEventId,
		args.countryAccountsId,
	);
	if (!eventExists) {
		throw new Response("Disaster event not found", { status: 404 });
	}

	const assessmentTypeId = await resolveAssessmentTypeId(args.payload);
	if (!assessmentTypeId) {
		throw new Response("assessmentTypeId or assessmentType is required", {
			status: 400,
		});
	}

	const sectorIds = normalizeSectorIds(args.payload.sectorIds);
	const attachments = normalizeAttachments(args.payload.attachments);

	const created = await DisasterEventAssessmentRepository.withTransaction(
		async (tx) => {
			const assessment = await DisasterEventAssessmentRepository.createOne(
				{
					disasterEventId,
					assessmentTypeId,
					coverage: normalizeNullableText(args.payload.coverage),
					assessmentDate: normalizeAssessmentDate(args.payload.assessmentDate),
					description: normalizeNullableText(args.payload.description),
					otherSectors: normalizeNullableText(args.payload.otherSectors),
				},
				tx,
			);
			if (!assessment) {
				throw new Response("Failed to create assessment", { status: 500 });
			}

			if (sectorIds.length > 0) {
				await DisasterEventAssessmentSectorRepository.createMany(
					sectorIds.map((sectorId) => ({
						disasterEventAssessmentId: assessment.id,
						sectorId,
					})),
					tx,
				);
			}

			if (attachments.length > 0) {
				await DisasterEventAssessmentAttachmentRepository.createMany(
					attachments.map((attachment) => ({
						disasterEventAssessmentId: assessment.id,
						title: attachment.title,
						fileKey: attachment.fileKey,
						fileName: attachment.fileName,
						fileType: attachment.fileType,
						fileSize: Number(attachment.fileSize ?? 0),
					})),
					tx,
				);
			}

			return assessment.id;
		},
	);

	return getAssessmentForTenantById({
		countryAccountsId: args.countryAccountsId,
		id: created,
	});
}

export async function updateAssessmentForTenant(args: {
	countryAccountsId: string;
	id: string;
	payload: AssessmentPayload;
}) {
	const existing = await getAssessmentForTenantById({
		countryAccountsId: args.countryAccountsId,
		id: args.id,
	});
	if (!existing) {
		throw new Response("Assessment not found", { status: 404 });
	}

	const nextDisasterEventId = String(
		args.payload.disasterEventId ?? existing.disasterEventId,
	).trim();
	if (!nextDisasterEventId) {
		throw new Response("disasterEventId is required", { status: 400 });
	}

	const eventExists = await ensureDisasterEventBelongsToTenant(
		nextDisasterEventId,
		args.countryAccountsId,
	);
	if (!eventExists) {
		throw new Response("Disaster event not found", { status: 404 });
	}

	const assessmentTypeId =
		(await resolveAssessmentTypeId(args.payload)) ?? existing.assessmentTypeId;

	const hasSectorIds = Array.isArray(args.payload.sectorIds);
	const hasAttachments = Array.isArray(args.payload.attachments);
	const sectorIds = hasSectorIds
		? normalizeSectorIds(args.payload.sectorIds)
		: [];
	const attachments = hasAttachments
		? normalizeAttachments(args.payload.attachments)
		: [];

	await DisasterEventAssessmentRepository.withTransaction(async (tx) => {
		await DisasterEventAssessmentRepository.updateById(
			args.id,
			{
				disasterEventId: nextDisasterEventId,
				assessmentTypeId,
				coverage:
					args.payload.coverage !== undefined
						? normalizeNullableText(args.payload.coverage)
						: existing.coverage,
				assessmentDate:
					args.payload.assessmentDate !== undefined
						? normalizeAssessmentDate(args.payload.assessmentDate)
						: existing.assessmentDate,
				description:
					args.payload.description !== undefined
						? normalizeNullableText(args.payload.description)
						: existing.description,
				otherSectors:
					args.payload.otherSectors !== undefined
						? normalizeNullableText(args.payload.otherSectors)
						: existing.otherSectors,
			},
			tx,
		);

		if (hasSectorIds) {
			await DisasterEventAssessmentSectorRepository.deleteByDisasterEventAssessmentId(
				args.id,
				tx,
			);
			if (sectorIds.length > 0) {
				await DisasterEventAssessmentSectorRepository.createMany(
					sectorIds.map((sectorId) => ({
						disasterEventAssessmentId: args.id,
						sectorId,
					})),
					tx,
				);
			}
		}

		if (hasAttachments) {
			await DisasterEventAssessmentAttachmentRepository.deleteByDisasterEventAssessmentIds(
				[args.id],
				tx,
			);
			if (attachments.length > 0) {
				await DisasterEventAssessmentAttachmentRepository.createMany(
					attachments.map((attachment) => ({
						disasterEventAssessmentId: args.id,
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

	return getAssessmentForTenantById({
		countryAccountsId: args.countryAccountsId,
		id: args.id,
	});
}

export async function deleteAssessmentForTenant(args: {
	countryAccountsId: string;
	id: string;
}) {
	const existing = await getAssessmentForTenantById({
		countryAccountsId: args.countryAccountsId,
		id: args.id,
	});
	if (!existing) {
		throw new Response("Assessment not found", { status: 404 });
	}

	await DisasterEventAssessmentRepository.deleteById(args.id);
}
