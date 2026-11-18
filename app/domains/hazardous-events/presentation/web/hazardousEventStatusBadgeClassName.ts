import type { HazardousEventDetailDto } from "~/domains/hazardous-events/application/dto/HazardousEventDetailDto";

/** Legacy's exact Tailwind classes for the Hazardous event status pill (ported from HazardousEventReviewStep.tsx); distinct from workflowStatusDisplay's Record status pill. */
export function hazardousEventStatusBadgeClassName(
	status: HazardousEventDetailDto["hazardousEventStatus"],
): string {
	if (status === "ongoing") return "bg-amber-100 text-amber-800";
	if (status === "passed") return "bg-emerald-100 text-emerald-800";
	return "bg-blue-100 text-blue-800";
}
