import { useTranslation } from "react-i18next";
import { Dialog } from "~/design-system/components/Dialog";
import { Button } from "~/design-system/components/Button";

export interface HazardousEventDiscardModalProps {
	visible: boolean;
	onHide: () => void;
	onSaveAsDraft: () => void;
	onDiscard: () => void;
}

/** Discard-confirmation modal (design.md Decision 9): "Save as draft" -> submit-draft,
 * "Discard work and exit" -> navigate away unsaved. Migrated off PrimeReact onto the new
 * design-system Dialog/Button (design.md Decision 12) -- same behavior, new chrome. */
export function HazardousEventDiscardModal({
	visible,
	onHide,
	onSaveAsDraft,
	onDiscard,
}: HazardousEventDiscardModalProps) {
	const { t } = useTranslation("hazardous-events");

	return (
		<Dialog
			isOpen={visible}
			onOpenChange={(open) => {
				if (!open) onHide();
			}}
			title={t("form.discard.title")}
			closeLabel={t("form.close")}
			footer={
				<div className="flex flex-col gap-3">
					<Button variant="primary" onPress={onSaveAsDraft}>
						{t("form.discard.save_as_draft")}
					</Button>
					<Button variant="outline" onPress={onDiscard}>
						{t("form.discard.discard_and_exit")}
					</Button>
				</div>
			}
		>
			<p>{t("form.discard.confirm_message")}</p>
		</Dialog>
	);
}
