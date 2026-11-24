import { useTranslation } from "react-i18next";
import { useViewContext } from "~/frontend/context";
import { Card } from "~/design-system/components/Card";
import { Link } from "~/design-system/components/Link";
import type { HazardousEventDetailDto } from "~/domains/hazardous-events/application/dto/HazardousEventDetailDto";
import { linkedEventSubtitle } from "./linkedEventSubtitle";

export interface HazardousEventLinkedEventsCardProps {
	cause: HazardousEventDetailDto["cause"];
	effects: HazardousEventDetailDto["effects"];
}

type LinkedEventEntry = NonNullable<HazardousEventDetailDto["cause"]>;

/** Renders "Caused by" (`cause`, at most one) and "Causing" (`effects`, zero or more), each with its own empty state. */
export function HazardousEventLinkedEventsCard({
	cause,
	effects,
}: HazardousEventLinkedEventsCardProps) {
	const ctx = useViewContext();
	const { t } = useTranslation("hazardous-events");
	const hipLabel = t("detail.linked_events.hip_label");
	const uuidLabel = t("detail.linked_events.uuid_label");
	const unresolvedEventLabel = t("detail.linked_events.unresolved_event");

	// Closure (not a nested component, to avoid remount churn) mirroring legacy's `renderLinkedCard`.
	function renderEntryCard(entry: LinkedEventEntry) {
		const { title, subtitle } = linkedEventSubtitle({
			specificHazardCode: entry.specificHazardCode,
			description: entry.description,
			displayName: entry.displayName,
			id: entry.id,
			hipLabel,
			uuidLabel,
			unresolvedEventLabel,
		});

		return (
			<div
				key={entry.id}
				className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-none"
			>
				<div>
					<Link
						href={ctx.url(`/he-preview/${entry.id}`)}
						className="text-[14px] font-semibold text-blue-700 hover:text-blue-800 hover:underline"
					>
						{title}
					</Link>
					{subtitle ? (
						<p className="mt-1 text-xs text-slate-500">{subtitle}</p>
					) : null}
					{entry.causalityExplanation ? (
						<p className="mt-1 text-xs text-slate-500">
							{entry.causalityExplanation}
						</p>
					) : null}
				</div>
			</div>
		);
	}

	return (
		<Card
			title={t("detail.sections.linked_events")}
			icon="pi-link"
			titleSize="lg"
		>
			<div className="space-y-4">
				<div className="space-y-2">
					<p className="text-[13px] font-semibold text-slate-700">
						{t("detail.linked_events.caused_by")}
					</p>
					{cause === null ? (
						<p>{t("detail.linked_events.no_cause")}</p>
					) : (
						renderEntryCard(cause)
					)}
				</div>
				<div className="space-y-2">
					<p className="text-[13px] font-semibold text-slate-700">
						{t("detail.linked_events.causing")}
					</p>
					{effects.length === 0 ? (
						<p>{t("detail.linked_events.no_effects")}</p>
					) : (
						<ul className="space-y-2">
							{effects.map((effect) => (
								<li key={effect.id}>{renderEntryCard(effect)}</li>
							))}
						</ul>
					)}
				</div>
			</div>
		</Card>
	);
}
