import type { SpatialObservationRecord } from "../ports/IHazardousEventRepository";

/**
 * Serialisable representation of a spatial observation crossing the
 * application-to-presentation boundary; dates as ISO 8601 strings.
 */
export interface SpatialObservationDto {
	id: string;
	hazardousEventId: string;
	observationTime: string;
	note: string | null;
	geometries: readonly unknown[];
	divisionIds: readonly string[];
	createdAt: string;
	updatedAt: string;
}

/** Pure mapper — see `toNoticeDto`'s own WHY comment for why this lives outside the domain layer. */
export function toSpatialObservationDto(
	record: SpatialObservationRecord,
): SpatialObservationDto {
	return {
		id: record.id,
		hazardousEventId: record.hazardousEventId,
		observationTime: record.observationTime.toISOString(),
		note: record.note,
		geometries: record.geometries,
		divisionIds: record.divisionIds,
		createdAt: record.createdAt.toISOString(),
		updatedAt: record.updatedAt.toISOString(),
	};
}
