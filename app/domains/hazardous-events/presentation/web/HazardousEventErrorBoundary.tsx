import { useState } from "react";
import { useRouteError } from "react-router";
import { useTranslation } from "react-i18next";
import { TriangleAlert } from "lucide-react";
import { LegacyButton as Button } from "~/design-system/components/LegacyButton";
import { MainContainer } from "~/frontend/container";
import { BackLink } from "./BackLink";
import { mapRouteErrorToView } from "./mapRouteErrorToView";

function TraceReference({
	traceId,
	onCopyStart,
	onCopied,
}: {
	traceId: string;
	onCopyStart: () => void;
	onCopied: () => void;
}) {
	const { t } = useTranslation("hazardous-events");

	async function copy() {
		// Cleared first so a repeat copy changes the live region and is announced again.
		onCopyStart();
		try {
			await navigator.clipboard.writeText(traceId);
			onCopied();
		} catch {
			// No or denied clipboard: the id stays visible and selectable.
		}
	}

	return (
		<div className="flex flex-wrap items-center gap-2">
			<span>{t("error.trace.label")}</span>
			<span className="font-mono break-all select-all">{traceId}</span>
			<Button variant="outline" onPress={copy}>
				{t("error.trace.copy")}
			</Button>
		</div>
	);
}

/** Route ErrorBoundary for every he-preview page: status-keyed copy, never server text. */
export function HazardousEventErrorBoundary() {
	const { t, i18n } = useTranslation("hazardous-events");
	const { kind, traceId } = mapRouteErrorToView(useRouteError());
	const [announcement, setAnnouncement] = useState("");

	return (
		<MainContainer title={t("title")}>
			<div className="flex flex-col gap-6">
				<div role="alert" className="dts-alert dts-alert--error">
					<div className="dts-alert__icon">
						<TriangleAlert aria-hidden="true" className="size-5" />
					</div>
					<div className="flex min-w-0 grow flex-col gap-2">
						<h2 className="text-xl font-bold">{t(`error.${kind}.title`)}</h2>
						<p className="dts-body-text">{t(`error.${kind}.body`)}</p>
						{traceId !== null ? (
							<TraceReference
								traceId={traceId}
								onCopyStart={() => setAnnouncement("")}
								onCopied={() => setAnnouncement(t("error.trace.copied"))}
							/>
						) : null}
					</div>
				</div>
				{/* Sibling of the alert so a copy announcement doesn't re-read it. */}
				<div role="status" aria-live="polite" className="sr-only">
					{announcement}
				</div>
				<div>
					{/* i18n.language is the validated request language; avoids useViewContext's legacy translator. */}
					<BackLink
						href={`/${i18n.language}/he-preview`}
						label={t("detail.back_to_list")}
					/>
				</div>
			</div>
		</MainContainer>
	);
}
