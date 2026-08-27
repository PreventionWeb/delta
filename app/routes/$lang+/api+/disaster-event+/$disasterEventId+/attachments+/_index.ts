import { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { apiAuth } from "~/backend.server/models/api_key";
import { authLoaderApi } from "~/utils/auth";
import { isValidUUID } from "~/utils/id";
import {
	createDisasterEventAttachment,
	getMultipartFiles,
	isMultipartRequest,
	listDisasterEventAttachments,
	uploadDisasterEventAttachmentFile,
} from "./attachments_api.server";

function getParams(params: LoaderFunctionArgs["params"]) {
	const disasterEventId = params.disasterEventId as string;
	if (!disasterEventId || !isValidUUID(disasterEventId)) {
		throw new Response("Invalid disasterEventId", { status: 400 });
	}
	return { disasterEventId };
}

export const loader = authLoaderApi(async (args: LoaderFunctionArgs) => {
	const { disasterEventId } = getParams(args.params);
	const apiKey = await apiAuth(args.request);
	const countryAccountsId = apiKey.countryAccountsId;
	if (!countryAccountsId) {
		throw new Response("Unauthorized", { status: 401 });
	}

	const data = await listDisasterEventAttachments({
		countryAccountsId,
		disasterEventId,
	});
	return Response.json(data);
});

export const action = async (args: ActionFunctionArgs) => {
	if (args.request.method !== "POST") {
		throw new Response("Method Not Allowed: Only POST requests are supported", {
			status: 405,
		});
	}

	const { disasterEventId } = getParams(args.params);
	const apiKey = await apiAuth(args.request);
	const countryAccountsId = apiKey.countryAccountsId;
	if (!countryAccountsId) {
		throw new Response("Unauthorized", { status: 401 });
	}

	if (isMultipartRequest(args.request)) {
		const formData = await args.request.formData();
		const uploadedFiles = getMultipartFiles(formData);
		if (uploadedFiles.length === 0) {
			throw new Response("file is required", { status: 400 });
		}

		const existing = await listDisasterEventAttachments({
			countryAccountsId,
			disasterEventId,
		});
		const existingBytes = existing.reduce(
			(total, attachment) => total + Number(attachment.fileSize ?? 0),
			0,
		);
		const incomingBytes = uploadedFiles.reduce(
			(total, uploadedFile) => total + uploadedFile.size,
			0,
		);
		if (existingBytes + incomingBytes > 10 * 1024 * 1024) {
			throw new Response(
				"Total attachments size exceeds max allowed size (10MB) for this disaster event",
				{ status: 400 },
			);
		}

		const created = [] as Array<
			Awaited<ReturnType<typeof createDisasterEventAttachment>>
		>;
		for (const uploadedFile of uploadedFiles) {
			const payload = await uploadDisasterEventAttachmentFile({
				countryAccountsId,
				disasterEventId,
				uploadedFile,
			});
			const record = await createDisasterEventAttachment({
				countryAccountsId,
				disasterEventId,
				payload,
			});
			created.push(record);
		}
		return Response.json(created, { status: 201 });
	}

	const payload = await args.request.json();
	const created = await createDisasterEventAttachment({
		countryAccountsId,
		disasterEventId,
		payload,
	});
	return Response.json(created, { status: 201 });
};
