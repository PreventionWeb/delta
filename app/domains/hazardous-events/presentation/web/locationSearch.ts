export interface LocationSearchResult {
	lat: string;
	lon: string;
	boundingbox?: string[];
}

/** Isolates the volatile third-party dependency (design.md Decision 11) behind one seam, mirroring
 * leafletLoader.ts's own isolation of the CDN-loading dependency -- callers never see the URL. */
export async function searchLocation(
	query: string,
): Promise<LocationSearchResult | null> {
	// A failed/erroring request degrades to "not found", never throws into the caller
	// (design.md Decision 11 Risks: an unauthenticated third-party call with no SLA).
	try {
		const response = await fetch(
			`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json`,
		);
		if (!response.ok) {
			return null;
		}
		const results: LocationSearchResult[] = await response.json();
		return results[0] ?? null;
	} catch {
		return null;
	}
}
