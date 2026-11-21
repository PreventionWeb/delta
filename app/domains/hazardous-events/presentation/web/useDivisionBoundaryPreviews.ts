import { useEffect, useMemo, useRef, useState } from "react";

export interface DivisionPreviewEntry {
	id: string;
	name: string;
	geojson: unknown;
}

/** Fetches/caches each selected division's boundary for the map's preview overlay (Decision 1/7),
 * separated from the picker's own form-state concern. Discards late results for deselected ids
 * and never double-fetches an id already in flight. */
export function useDivisionBoundaryPreviews(
	divisionIds: readonly string[],
	buildBoundaryUrl: (id: string) => string,
): readonly DivisionPreviewEntry[] {
	const [previewCache, setPreviewCache] = useState<
		Record<string, DivisionPreviewEntry>
	>({});
	const divisionIdsRef = useRef(divisionIds);
	const pendingFetchesRef = useRef(new Set<string>());

	useEffect(() => {
		divisionIdsRef.current = divisionIds;
	}, [divisionIds]);

	useEffect(() => {
		for (const id of divisionIds) {
			if (id in previewCache || pendingFetchesRef.current.has(id)) {
				continue;
			}
			pendingFetchesRef.current.add(id);
			fetch(buildBoundaryUrl(id))
				.then((response) => (response.ok ? response.json() : Promise.reject()))
				.then((data: { geojson: unknown; name: string }) => {
					pendingFetchesRef.current.delete(id);
					// Discard a late-resolving fetch for a division the user already deselected
					// (spec: "deselected before its boundary fetch resolves").
					if (!divisionIdsRef.current.includes(id)) {
						return;
					}
					setPreviewCache((prev) => ({
						...prev,
						[id]: { id, name: data.name, geojson: data.geojson },
					}));
				})
				.catch(() => {
					// 404/error: no crash, no preview overlay -- the id stays selectable for removal.
					pendingFetchesRef.current.delete(id);
				});
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [divisionIds]);

	// Stable across unrelated re-renders -- a new array makes the Preview map rebuild and lose its view.
	return useMemo(
		() =>
			divisionIds
				.map((id) => previewCache[id])
				.filter((entry): entry is DivisionPreviewEntry => entry !== undefined),
		[divisionIds, previewCache],
	);
}
