import { SpatialObservation } from "../../domain/SpatialObservation";
import type {
	IHazardousEventRepository,
	SpatialObservationRecord,
} from "../ports/IHazardousEventRepository";
import type { IDivisionRepository } from "../ports/IDivisionRepository";
import type { SpatialObservationDto } from "../dto/SpatialObservationDto";
import { toSpatialObservationDto } from "../dto/SpatialObservationDto";
import type { ILogger } from "~/shared/logging/ILogger";
import { ValidationError } from "~/shared/errors";
import { assertNonEmptyString } from "../assertNonEmptyString";

/**
 * Input for RecordSpatialObservationUseCase. Omits id/createdAt/updatedAt -- generated or
 * defaulted internally. No actingUserId: unlike HazardousEventProps,
 * SpatialObservationProps has no attribution fields to feed.
 */
export interface RecordSpatialObservationCommand {
	tenantId: string;
	hazardousEventId: string;
	/** Defaults to a single internally-computed `now()` when omitted. A real `Date`. */
	observationTime?: Date;
	geometries: readonly unknown[];
	divisionIds: readonly string[];
	/** Defaults to `null` when omitted -- including on a replace, where an omitted `note` resets to `null`. */
	note?: string | null;
	confirmReplace?: boolean;
}

/** Same predicate as SpatialObservation.ts's own isInvalidDate -- redefined locally to keep each
 * entity/use-case file independently auditable. */
function isInvalidDate(value: unknown): boolean {
	return !(value instanceof Date) || Number.isNaN(value.getTime());
}

/** Crash-safe only -- a malformed element must still fail via SpatialObservation.create()'s
 * own ValidationError, not a TypeError here. */
function toSafeStringArray(value: unknown): readonly string[] {
	if (!Array.isArray(value)) {
		return [];
	}
	return value.filter((item): item is string => typeof item === "string");
}

/** Write-direction mapping only -- the read direction reuses SpatialObservation.create() directly. */
function toSpatialObservationRecord(
	observation: SpatialObservation,
): SpatialObservationRecord {
	return {
		id: observation.id,
		hazardousEventId: observation.hazardousEventId,
		observationTime: observation.observationTime,
		note: observation.note,
		geometries: observation.geometries,
		divisionIds: observation.divisionIds,
		createdAt: observation.createdAt,
		updatedAt: observation.updatedAt,
	};
}

/**
 * Use case: validate + persist one spatial reading against an existing, tenant-owned
 * HazardousEvent, enforcing SpatialObservation's own duplicate-observationTime conflict rule by
 * calling its real static method rather than reimplementing it (design.md Decision 2).
 */
export class RecordSpatialObservationUseCase {
	constructor(
		private readonly logger: ILogger,
		private readonly hazardousEventRepository: IHazardousEventRepository,
		private readonly divisionRepository: IDivisionRepository,
	) {}

	async execute(
		command: RecordSpatialObservationCommand,
	): Promise<SpatialObservationDto> {
		// Malformed runtime input (bypassing TypeScript) must fail with ValidationError, not an
		// unhandled TypeError from inside the repository call it would otherwise reach first.
		assertNonEmptyString(command.tenantId, "tenantId");
		assertNonEmptyString(command.hazardousEventId, "hazardousEventId");

		// Every later step is meaningless against an event that doesn't exist under this
		// tenant -- NotFoundError propagates unmodified for a missing or foreign-tenant id.
		await this.hazardousEventRepository.findById(
			command.hazardousEventId,
			command.tenantId,
		);

		// Only `undefined` counts as omitted -- an explicit non-Date value (including null)
		// must fail the shape guard below, not silently become "now".
		const now = new Date();
		const observationTime =
			command.observationTime === undefined ? now : command.observationTime;

		// Shape validated before any repository call that uses it, so a malformed
		// observationTime never reaches findSpatialObservationByTime and a ValidationError is
		// never shadowed by a ConflictError computed from garbage input (Decision 7).
		if (isInvalidDate(observationTime)) {
			throw new ValidationError("observationTime must be a valid Date");
		}

		const validDivisionIds = await this.divisionRepository.findValidDivisionIds(
			toSafeStringArray(command.divisionIds),
			command.tenantId,
		);

		const existingRecord =
			await this.hazardousEventRepository.findSpatialObservationByTime(
				command.hazardousEventId,
				observationTime,
				command.tenantId,
			);

		// Reconstructed so assertNoConflictingObservationTime can read its own fields (Decision 3).
		const existingEntity =
			existingRecord === null
				? null
				: SpatialObservation.create(
						existingRecord,
						new Set(existingRecord.divisionIds),
					);

		// Built before the conflict check so malformed geometries/divisionIds always surfaces
		// (Decision 7). Reuses the existing observation's id/createdAt on a replace (Decision 4);
		// geometries/divisionIds/note are this call's own values in full (Decision 4/5).
		const newObservation = SpatialObservation.create(
			{
				id: existingEntity?.id ?? crypto.randomUUID(),
				hazardousEventId: command.hazardousEventId,
				observationTime,
				note: command.note ?? null,
				geometries: command.geometries,
				divisionIds: command.divisionIds,
				createdAt: existingEntity?.createdAt ?? now,
				updatedAt: now,
			},
			validDivisionIds,
		);

		SpatialObservation.assertNoConflictingObservationTime(
			existingEntity,
			command.confirmReplace === true,
		);

		const savedRecord =
			await this.hazardousEventRepository.saveSpatialObservation(
				command.hazardousEventId,
				toSpatialObservationRecord(newObservation),
				command.tenantId,
			);

		this.logger.info({
			msg: "spatial_observation.recorded",
			hazardousEventId: command.hazardousEventId,
			tenantId: command.tenantId,
			observationTime: observationTime.toISOString(),
			replaced: existingEntity !== null,
		});

		return toSpatialObservationDto(savedRecord);
	}
}
