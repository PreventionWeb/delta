type DetailTypeTranslator = {
	t: (
		config: {
			code: string;
			msg?: string;
			desc?: string;
			msgs?: Record<string, string>;
		},
		args?: Record<string, unknown>,
	) => string;
};

const legacyDetailTypeToKey: Record<string, string> = {
	"Early action": "early_action",
	"Response operation": "response_operation",
	Coordination: "coordination",
	Evacuation: "evacuation",
	Assessment: "assessment",
	"Rapid assessment": "rapid_assessment",
	"Needs assessment": "needs_assessment",
	"Sector assessment": "sector_assessment",
	"Rapid/Preliminary assessment": "rapid_preliminary_assessment",
	"Post-disaster assessment": "post_disaster_assessment",
	"Other assessment": "other_assessment",
	"Disaster declaration": "disaster_declaration",
	"Disaster declaration effects": "disaster_declaration_effects",
	"Official Warning": "official_warning",
};

export function normalizeDetailTypeValue(value: string): string {
	return legacyDetailTypeToKey[value] ?? value;
}

export function resolveDetailTypeLabel(
	ctx: DetailTypeTranslator,
	value: string,
	fallbackLabel?: string,
): string {
	const normalizedValue = normalizeDetailTypeValue(value);

	switch (normalizedValue) {
		case "early_action":
			return ctx.t({
				code: "disaster_event.early_action",
				msg: "Early action",
			});
		case "response_operation":
			return ctx.t({
				code: "disaster_event.review.response_operation",
				msg: "Response operation",
			});
		case "rapid_preliminary_assessment":
			return ctx.t({
				code: "disaster_event.rapid_preliminary_assessment",
				msg: "Rapid/Preliminary assessment",
			});
		case "post_disaster_assessment":
			return ctx.t({
				code: "disaster_event.post_disaster_assessment",
				msg: "Post-disaster assessment",
			});
		case "other_assessment":
			return ctx.t({
				code: "disaster_event.other_assessment",
				msg: "Other assessment",
			});
		case "disaster_declaration":
			return ctx.t({
				code: "disaster_event.disaster_declaration",
				msg: "Disaster declaration",
			});
		case "disaster_declaration_effects":
			return ctx.t({
				code: "disaster_event.review.disaster_declaration_effects",
				msg: "Disaster declaration effects",
			});
		case "official_warning":
			return ctx.t({
				code: "common.official_warning",
				msg: "Official Warning",
			});
		default:
			return fallbackLabel ?? value;
	}
}
