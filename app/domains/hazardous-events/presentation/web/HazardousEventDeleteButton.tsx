import { useEffect, useState } from "react";
import { useFetcher, useRevalidator } from "react-router";
import { useTranslation } from "react-i18next";
import { Button } from "~/design-system/components/Button";
import { Dialog } from "~/design-system/components/Dialog";
import type { ToastQueue } from "~/design-system/components/Toast";
import type { DeleteHazardousEventFailure } from "./mapDeleteErrorToMessageKey";

// Legacy delete-dialog.tsx's error toast life.
const ERROR_TOAST_TIMEOUT_MS = 5000;

// Legacy's dialogActionButtonClass: 2.5rem tall, 6.5rem minimum width.
const DIALOG_ACTION_CLASS = "h-10 min-w-26";

export interface HazardousEventDeleteButtonProps {
	/** Lang-prefixed delete route, e.g. `/en/he-preview/delete/:id`. */
	action: string;
	/** Owned by the list page so a toast outlives this row (design.md D3). */
	toastQueue: ToastQueue;
}

const TRASH_SPRITE = "/assets/icons/trash-alt.svg#delete";

// Sized by legacy's .mg-button svg rules, like the row's Edit/View icons.
function RowTrashIcon() {
	return (
		<svg aria-hidden="true" focusable="false" role="img">
			<use href={TRASH_SPRITE} />
		</svg>
	);
}

// Outside .mg-button the sprite needs a viewBox; cropped to the path so it fills like pi-trash.
function ButtonTrashIcon() {
	return (
		<svg
			aria-hidden="true"
			focusable="false"
			viewBox="5 3 14 18"
			className="size-4"
		>
			<use href={TRASH_SPRITE} />
		</svg>
	);
}

/** Legacy's list-row HazardousEventDeleteButton on design-system primitives: confirm, then a
 * fetcher POST; a blocked delete is toasted in place, success redirects with a root flash. */
export function HazardousEventDeleteButton({
	action,
	toastQueue,
}: HazardousEventDeleteButtonProps) {
	const { t } = useTranslation("hazardous-events");
	const fetcher = useFetcher<DeleteHazardousEventFailure>();
	const revalidator = useRevalidator();
	const [isOpen, setIsOpen] = useState(false);
	const submitting = fetcher.state !== "idle";

	useEffect(() => {
		if (fetcher.data?.ok === false) {
			toastQueue.add(
				{
					variant: "error",
					message: fetcher.data.messageKeys.map((key) => t(key)).join("\n"),
				},
				{ timeout: ERROR_TOAST_TIMEOUT_MS },
			);
			// A 4xx skips React Router's own revalidation; legacy's 200 refreshed the list (stale row, icon).
			revalidator.revalidate();
		}
		// Only a new response raises a toast, not a re-render or language change.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [fetcher.data]);

	function confirmDelete() {
		setIsOpen(false);
		fetcher.submit(null, { method: "post", action });
	}

	return (
		<>
			<Button
				variant="icon"
				// pointer-events-none: legacy's only surviving :disabled effect (no hover) while pending.
				className="mg-button mg-button-table data-[pending]:pointer-events-none"
				aria-label={t("delete.label")}
				pending={submitting}
				onPress={() => setIsOpen(true)}
			>
				{submitting ? <span className="dts-spinner" /> : <RowTrashIcon />}
			</Button>
			<Dialog
				isOpen={isOpen}
				onOpenChange={setIsOpen}
				variant="confirm"
				outsideClickDismissDisabled
				title={t("delete.dialog.title")}
				closeLabel={t("delete.dialog.close")}
				footer={
					<>
						<Button
							variant="accent"
							className={DIALOG_ACTION_CLASS}
							onPress={() => setIsOpen(false)}
						>
							{t("delete.dialog.cancel")}
						</Button>
						<Button
							variant="danger-outline"
							className={DIALOG_ACTION_CLASS}
							onPress={confirmDelete}
						>
							<ButtonTrashIcon />
							{t("delete.dialog.confirm")}
						</Button>
					</>
				}
			>
				<p>{t("delete.dialog.message")}</p>
			</Dialog>
		</>
	);
}
