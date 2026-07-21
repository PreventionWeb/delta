import { isRouteErrorResponse, useRouteError } from "react-router";
import { useTranslation } from "react-i18next";
import type { ErrorResponse } from "~/shared/errors/ErrorResponse";

// Shared ErrorBoundary for the notices list and detail routes (design.md Decision 4).
export function NoticeErrorBoundary() {
	const error = useRouteError();
	const { t } = useTranslation("common");

	if (isRouteErrorResponse(error)) {
		const body = error.data as ErrorResponse | undefined;
		const message = body?.error?.message ?? t("error.generic");
		const traceId = body?.error?.traceId;

		return (
			<div role="alert">
				<p>{message}</p>
				{traceId ? (
					<button
						type="button"
						onClick={() => navigator.clipboard?.writeText(traceId)}
					>
						{traceId}
					</button>
				) : null}
			</div>
		);
	}

	// Non-Response error: never render .message/.stack here (ADR-003 Rule 4).
	return (
		<div role="alert">
			<p>{t("error.generic_retry")}</p>
		</div>
	);
}
