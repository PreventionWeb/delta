import { Dialog } from "primereact/dialog";
import { Button } from "primereact/button";
import { useTranslation } from "react-i18next";

export interface HazardousEventDiscardModalProps {
	visible: boolean;
	onHide: () => void;
	onSaveAsDraft: () => void;
	onDiscard: () => void;
}

/** Discard-confirmation modal (design.md Decision 9): "Save as draft" -> submit-draft,
 * "Discard work and exit" -> navigate away unsaved. */
export function HazardousEventDiscardModal({
	visible,
	onHide,
	onSaveAsDraft,
	onDiscard,
}: HazardousEventDiscardModalProps) {
	const { t } = useTranslation("hazardous-events");

	return (
		<Dialog
			visible={visible}
			modal
			header={t("form.discard.title")}
			onHide={onHide}
			className="w-full max-w-md"
			footer={
				<div className="flex flex-col gap-3">
					<Button
						type="button"
						className="mg-button mg-button-primary"
						label={t("form.discard.save_as_draft")}
						onClick={onSaveAsDraft}
					/>
					<Button
						type="button"
						className="mg-button mg-button-outline"
						label={t("form.discard.discard_and_exit")}
						onClick={onDiscard}
					/>
				</div>
			}
		>
			<p>{t("form.discard.confirm_message")}</p>
		</Dialog>
	);
}
