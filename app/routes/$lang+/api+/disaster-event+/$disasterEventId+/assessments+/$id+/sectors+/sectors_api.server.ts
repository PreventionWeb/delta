import { DisasterEventAssessmentSectorRepository } from "~/db/queries/disasterEventAssessmentSectorRepository";
import { getAssessmentForTenantById } from "~/routes/$lang+/api+/disaster-event+/assessments+/assessment_api.server";

export type AssessmentSectorInput =
	| string
	| { sectorId?: string | null; sectorIds?: Array<string | null> | null }
	| Array<string | null>;

export function normalizeAssessmentSectorPayload(
	payload: AssessmentSectorInput,
): string[] {
	const values: string[] = [];

	if (Array.isArray(payload)) {
		for (const item of payload) {
			const normalized = String(item ?? "").trim();
			if (normalized) values.push(normalized);
		}
		return Array.from(new Set(values));
	}

	if (typeof payload === "string") {
		const normalized = payload.trim();
		return normalized ? Array.from(new Set([normalized])) : [];
	}

	const explicit = String(payload?.sectorId ?? "").trim();
	if (explicit) values.push(explicit);

	for (const item of payload?.sectorIds ?? []) {
		const normalized = String(item ?? "").trim();
		if (normalized) values.push(normalized);
	}

	return Array.from(new Set(values));
}

async function ensureAssessmentScope(args: {
	countryAccountsId: string;
	disasterEventId: string;
	assessmentId: string;
}) {
	const assessment = await getAssessmentForTenantById({
		countryAccountsId: args.countryAccountsId,
		id: args.assessmentId,
	});
	if (!assessment || assessment.disasterEventId !== args.disasterEventId) {
		throw new Response("Assessment not found", { status: 404 });
	}
	return assessment;
}

export async function listAssessmentSectors(args: {
	countryAccountsId: string;
	disasterEventId: string;
	assessmentId: string;
}) {
	await ensureAssessmentScope(args);
	return DisasterEventAssessmentSectorRepository.listByDisasterEventAssessmentId(
		args.assessmentId,
	);
}

export async function addAssessmentSector(args: {
	countryAccountsId: string;
	disasterEventId: string;
	assessmentId: string;
	payload: AssessmentSectorInput;
}) {
	await ensureAssessmentScope(args);
	const sectorIds = normalizeAssessmentSectorPayload(args.payload);
	if (sectorIds.length === 0) {
		throw new Response("sectorId or sectorIds are required", { status: 400 });
	}

	return DisasterEventAssessmentSectorRepository.createMany(
		sectorIds.map((sectorId) => ({
			disasterEventAssessmentId: args.assessmentId,
			sectorId,
		})),
	);
}

export async function replaceAssessmentSectors(args: {
	countryAccountsId: string;
	disasterEventId: string;
	assessmentId: string;
	payload: AssessmentSectorInput;
}) {
	await ensureAssessmentScope(args);
	const sectorIds = normalizeAssessmentSectorPayload(args.payload);
	await DisasterEventAssessmentSectorRepository.deleteByDisasterEventAssessmentId(
		args.assessmentId,
	);

	if (sectorIds.length === 0) {
		return [];
	}

	return DisasterEventAssessmentSectorRepository.createMany(
		sectorIds.map((sectorId) => ({
			disasterEventAssessmentId: args.assessmentId,
			sectorId,
		})),
	);
}

export async function removeAssessmentSector(args: {
	countryAccountsId: string;
	disasterEventId: string;
	assessmentId: string;
	sectorId: string;
}) {
	await ensureAssessmentScope(args);
	if (!args.sectorId || !args.sectorId.trim()) {
		throw new Response("sectorId is required", { status: 400 });
	}

	const existing =
		await DisasterEventAssessmentSectorRepository.listByDisasterEventAssessmentId(
			args.assessmentId,
		);
	const hasSector = existing.some((row) => row.sectorId === args.sectorId);
	if (!hasSector) {
		throw new Response("Sector not found", { status: 404 });
	}

	await DisasterEventAssessmentSectorRepository.deleteByDisasterEventAssessmentIdAndSectorId(
		args.assessmentId,
		args.sectorId,
	);
}
