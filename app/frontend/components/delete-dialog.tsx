import { useEffect, useRef, useState } from "react";
import { Button } from "primereact/button";
import { ConfirmDialog } from "primereact/confirmdialog";
import { Toast } from "primereact/toast";
import { useFetcher } from "react-router";
import { ViewContext } from "../context";

interface DeleteButtonProps {
	ctx: ViewContext;
	action: string;
	label?: string;
	useIcon?: boolean;
	confirmMessage?: string;
	title?: string;
	confirmLabel?: string;
	cancelLabel?: string;
	confirmButtonFirst?: boolean;
	confirmIcon?: React.ReactNode;
	cancelIcon?: React.ReactNode;
}

/**
 * Generic delete button component that can be customized
 */
export function DeleteButton(props: DeleteButtonProps) {
	const ctx = props.ctx;
	let fetcher = useFetcher();
	const toast = useRef<Toast>(null);
	const [dialogVisible, setDialogVisible] = useState(false);

	useEffect(() => {
		let data = fetcher.data as any;
		if (fetcher.state === "idle" && data && !data.ok) {
			console.error(`Delete failed`, data);
			toast.current?.show({
				severity: "error",
				detail: data.error || "Delete failed",
				life: 5000,
			});
		}
	}, [fetcher.state, fetcher.data]);

	function showDialog(e: React.MouseEvent) {
		e.preventDefault();
		setDialogVisible(true);
	}

	function confirmDelete() {
		console.log("Submitting to:", props.action);
		setDialogVisible(false);
		fetcher.submit(null, { method: "post", action: props.action });
	}

	function hideDialog() {
		setDialogVisible(false);
	}

	let submitting = fetcher.state !== "idle";
	const confirmButtonFirst = props.confirmButtonFirst ?? true;
	const confirmLabel =
		props.confirmLabel ?? ctx.t({ code: "common.yes", msg: "Yes" });
	const cancelLabel =
		props.cancelLabel ?? ctx.t({ code: "common.no", msg: "No" });

	const confirmButton = (
		<Button
			type="button"
			onClick={confirmDelete}
			severity={confirmButtonFirst ? undefined : "danger"}
			outlined={!confirmButtonFirst}
			icon={props.confirmIcon as any}
			label={confirmLabel}
			disabled={submitting}
			loading={submitting}
		/>
	);

	const cancelButton = (
		<Button
			type="button"
			onClick={hideDialog}
			severity={confirmButtonFirst ? undefined : undefined}
			outlined={confirmButtonFirst}
			icon={props.cancelIcon as any}
			label={cancelLabel}
			disabled={submitting}
		/>
	);

	return (
		<>
			<Toast ref={toast} position="top-center" />
			{props.useIcon ? (
				<button
					type="button"
					className="mg-button mg-button-table"
					aria-label={ctx.t({ code: "common.delete", msg: "Delete" })}
					disabled={submitting}
					onClick={showDialog}
				>
					{submitting ? (
						<span className="dts-spinner" />
					) : (
						<svg aria-hidden="true" focusable="false" role="img">
							<use href="/assets/icons/trash-alt.svg#delete" />
						</svg>
					)}
				</button>
			) : (
				<button type="button" disabled={submitting} onClick={showDialog}>
					{submitting
						? ctx.t({ code: "common.deleting", msg: "Deleting..." })
						: props.label || ctx.t({ code: "common.delete", msg: "Delete" })}
				</button>
			)}

			<ConfirmDialog
				visible={dialogVisible}
				onHide={hideDialog}
				message={
					props.confirmMessage ||
					ctx.t({
						code: "common.confirm_deletion",
						msg: "Please confirm deletion.",
					})
				}
				header={
					props.title ||
					ctx.t({ code: "common.record_deletion", msg: "Record Deletion" })
				}
				footer={
					<div className="flex justify-end gap-2">
						{confirmButtonFirst ? (
							<>
								{confirmButton}
								{cancelButton}
							</>
						) : (
							<>
								{cancelButton}
								{confirmButton}
							</>
						)}
					</div>
				}
				className="w-[32rem] max-w-full"
				closable={!submitting}
				closeOnEscape={!submitting}
				draggable={false}
				modal
			/>
		</>
	);
}

/**
 * Specialized delete button for hazardous events that meets the specific business requirements:
 * - Title: "Are you sure you want to delete this event?"
 * - Warning text: "This data cannot be recovered after being deleted."
 * - Primary button: "Do not delete"
 * - Secondary button: "Delete permanently" with trash icon
 */
export function HazardousEventDeleteButton({
	ctx,
	action,
	useIcon = true,
}: {
	ctx: ViewContext;
	action: string;
	useIcon?: boolean;
}) {
	return (
		<DeleteButton
			ctx={ctx}
			action={action}
			useIcon={useIcon}
			title={ctx.t({
				code: "record.delete_confirmation",
				desc: "Confirmation message shown when deleting a record",
				msg: "Are you sure you want to delete this record?",
			})}
			confirmMessage={ctx.t({
				code: "record.delete_confirmation_message",
				desc: "Message explaining that deleted data cannot be recovered",
				msg: "This data cannot be recovered after being deleted.",
			})}
			confirmLabel={ctx.t({
				code: "record.delete_permanently",
				desc: "Label for the permanent delete confirmation button",
				msg: "Delete permanently",
			})}
			cancelLabel={ctx.t({
				code: "record.cancel_delete",
				desc: "Label for the cancel delete button",
				msg: "Do not delete",
			})}
			confirmButtonFirst={false} // Put the cancel button first (as primary)
			confirmIcon="pi pi-trash"
		/>
	);
}
