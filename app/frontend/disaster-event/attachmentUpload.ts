export type PreUploadedAttachmentFile = {
	name: string;
	content_type: string;
	tenantPath?: string;
};

export async function preUploadDisasterEventAttachment(
	file: File,
	uploadUrl: string,
	fallbackErrorMessage: string,
): Promise<PreUploadedAttachmentFile> {
	const formData = new FormData();
	formData.append("file", file);
	formData.append("filename", file.name);

	const response = await fetch(uploadUrl, {
		method: "POST",
		body: formData,
	});

	if (!response.ok) {
		let errorMessage = fallbackErrorMessage;

		try {
			const errorData = await response.json();
			if (typeof errorData?.error === "string" && errorData.error.length > 0) {
				errorMessage = errorData.error;
			}
		} catch {
			// keep fallback message
		}

		throw new Error(errorMessage);
	}

	return (await response.json()) as PreUploadedAttachmentFile;
}
