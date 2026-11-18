export interface LinkedEventSubtitleInput {
	specificHazardCode: string | null;
	description: string;
	displayName: string;
	id: string;
	hipLabel: string;
	uuidLabel: string;
	unresolvedEventLabel: string;
}

export interface LinkedEventTitleSubtitle {
	title: string;
	subtitle: string;
}

/** Mirrors legacy's `renderLinkedCard` title/subtitle recipe (`HazardousEventReviewStep.tsx:460-474`),
 * including its `evDesc && evHazard` condition for the description part. */
export function linkedEventSubtitle({
	specificHazardCode,
	description,
	displayName,
	id,
	hipLabel,
	uuidLabel,
	unresolvedEventLabel,
}: LinkedEventSubtitleInput): LinkedEventTitleSubtitle {
	const shortId = id.slice(0, 8);
	const title =
		displayName || description || `${unresolvedEventLabel}: ${shortId}`;

	const subtitle = [
		specificHazardCode ? `${hipLabel}: ${specificHazardCode}` : "",
		description && displayName ? description : "",
		`${uuidLabel}: ${shortId}`,
	]
		.filter(Boolean)
		.join(" • ");

	return { title, subtitle };
}
