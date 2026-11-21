export interface SpatialObservationHiddenFields {
	spatialObservation: string;
	spatialObservationChanged: string;
}

/** Hidden-field wire format the create/edit actions parse: empty until a real draw or
 * division-selection interaction, so an untouched picker never writes a spurious row. */
export function serializeSpatialObservation(
	geometries: readonly unknown[],
	divisionIds: readonly string[],
	interacted: boolean,
): SpatialObservationHiddenFields {
	const hasContent = geometries.length > 0 || divisionIds.length > 0;
	return {
		spatialObservation: hasContent
			? JSON.stringify({ geometries, divisionIds })
			: "",
		spatialObservationChanged: hasContent && interacted ? "1" : "0",
	};
}
