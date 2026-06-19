import type { RefObject } from "react";
import type { Toast } from "primereact/toast";

type CopyTextToClipboardOptions = {
	value: string;
	toastRef: RefObject<Toast | null>;
	successSummary?: string;
	successDetail: string;
	errorSummary?: string;
	errorDetail: string;
	successLife?: number;
	errorLife?: number;
};

export async function copyTextToClipboardWithToast({
	value,
	toastRef,
	successSummary,
	successDetail,
	errorSummary,
	errorDetail,
	successLife = 2000,
	errorLife = 3000,
}: CopyTextToClipboardOptions): Promise<boolean> {
	if (!value) return false;

	try {
		await navigator.clipboard.writeText(value);
		toastRef.current?.show({
			severity: "success",
			summary: successSummary,
			detail: successDetail,
			life: successLife,
		});
		return true;
	} catch {
		toastRef.current?.show({
			severity: "error",
			summary: errorSummary,
			detail: errorDetail,
			life: errorLife,
		});
		return false;
	}
}
