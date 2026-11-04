interface HazardLabelFields {
	specificHazardLocalName: string | null;
	specificHazardNationalName: string | null;
	/** Resolved taxonomy name (design.md's reversed hazard-name scope decision). */
	specificHazardName: string | null;
	specificHazardId: string;
}

export interface HazardLabel {
	text: string;
	/** True when `text` is the raw id -- callers render this distinctly (design.md Decision 7). */
	isFallback: boolean;
}

/** First non-null hazard name (user override, then resolved taxonomy name), falling back to the
 * raw id only when neither resolves. Shared by both HE page components. */
export function hazardLabel(item: HazardLabelFields): HazardLabel {
	const name =
		item.specificHazardLocalName ??
		item.specificHazardNationalName ??
		item.specificHazardName;
	return name !== null
		? { text: name, isFallback: false }
		: { text: item.specificHazardId, isFallback: true };
}
