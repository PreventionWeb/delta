import { Button } from "primereact/button";
import { Dialog } from "primereact/dialog";
import { Message } from "primereact/message";
import { Form } from "react-router";
import { ViewContext } from "~/frontend/context";

type DeleteDisasterEventDialogProps = {
    itemName: string;
    onCancel: () => void;
    error?: string;
    isSubmitting?: boolean;
};

export default function DeleteDisasterEventDialog({
    itemName,
    onCancel,
    error,
    isSubmitting = false,
}: DeleteDisasterEventDialogProps) {
    const ctx = new ViewContext();

    return (
        <Dialog
            header={ctx.t({
                code: "record.delete_confirmation",
                msg: "Are you sure you want to delete this record?",
            })}
            visible
            modal
            onHide={onCancel}
            className="w-[32rem] max-w-full"
        >
            <div
                className="flex flex-col"
                role="dialog"
                aria-describedby="delete-disaster-event-confirmation"
            >
                <Form method="post" className="flex flex-col" noValidate>
                    <p className="mb-2">
                        {ctx.t({
                            code: "record.delete_confirmation_message",
                            msg: "This data cannot be recovered after being deleted.",
                        })}
                    </p>
                    <p
                        id="delete-disaster-event-confirmation"
                        className="mb-3 font-semibold"
                    >
                        {itemName}
                    </p>

                    {error ? (
                        <Message severity="error" text={error} className="mb-3" />
                    ) : null}

                    <div className="mt-4 flex justify-end gap-2">
                        <Button
                            type="button"
                            outlined
                            icon="pi pi-times"
                            label={ctx.t({
                                code: "record.cancel_delete",
                                msg: "Do not delete",
                            })}
                            onClick={onCancel}
                            disabled={isSubmitting}
                        />
                        <Button
                            type="submit"
                            label={ctx.t({
                                code: "record.delete_permanently",
                                msg: "Delete permanently",
                            })}
                            icon="pi pi-trash"
                            severity="danger"
                            loading={isSubmitting}
                            disabled={isSubmitting}
                        />
                    </div>
                </Form>
            </div>
        </Dialog>
    );
}
