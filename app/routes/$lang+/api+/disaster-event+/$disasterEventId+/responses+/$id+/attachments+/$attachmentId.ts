import { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { apiAuth } from "~/backend.server/models/api_key";
import { authLoaderApi } from "~/utils/auth";
import { isValidUUID } from "~/utils/id";
import {
	deleteResponseAttachment,
	getResponseAttachmentById,
	isMultipartRequest,
	updateResponseAttachment,
	uploadResponseAttachmentFile,
} from "./attachments_api.server";

function getParams(params: LoaderFunctionArgs["params"]) {
	const disasterEventId = params.disasterEventId as string;
	const responseId = params.id as string;
	const attachmentId = params.attachmentId as string;
	if (!disasterEventId || !isValidUUID(disasterEventId)) {
		throw new Response("Invalid disasterEventId", { status: 400 });
	}
	if (!responseId || !isValidUUID(responseId)) {
		throw new Response("Invalid response id", { status: 400 });
	}
	if (!attachmentId || !isValidUUID(attachmentId)) {
		throw new Response("Invalid attachment id", { status: 400 });
	}
	return { disasterEventId, responseId, attachmentId };
}

export const loader = authLoaderApi(async (args: LoaderFunctionArgs) => {
	const { disasterEventId, responseId, attachmentId } = getParams(args.params);
	const apiKey = await apiAuth(args.request);
	const countryAccountsId = apiKey.countryAccountsId;
	if (!countryAccountsId) {
		throw new Response("Unauthorized", { status: 401 });
	}

	const record = await getResponseAttachmentById({
		countryAccountsId,
		disasterEventId,
		responseId,
		attachmentId,
	});
	if (!record) {
		throw new Response("Attachment not found", { status: 404 });
	}
	return Response.json(record);
});

export const action = async (args: ActionFunctionArgs) => {
	const { disasterEventId, responseId, attachmentId } = getParams(args.params);
	const apiKey = await apiAuth(args.request);
	const countryAccountsId = apiKey.countryAccountsId;
	if (!countryAccountsId) {
		throw new Response("Unauthorized", { status: 401 });
	}

	if (args.request.method === "PUT") {
		let payload: any = null;
		if (isMultipartRequest(args.request)) {
			const formData = await args.request.formData();
			const uploadedFile = formData.get("file");
			if (!(uploadedFile instanceof File)) {
				throw new Response("file is required", { status: 400 });
			}

			payload = await uploadResponseAttachmentFile({
				countryAccountsId,
				disasterEventId,
				responseId,
				uploadedFile,
				title: String(formData.get("title") ?? ""),
			});
		} else {
			payload = await args.request.json();
		}

		const updated = await updateResponseAttachment({
			countryAccountsId,
			disasterEventId,
			responseId,
			attachmentId,
			payload,
		});
		return Response.json(updated);
	}

	if (args.request.method === "DELETE") {
		await deleteResponseAttachment({
			countryAccountsId,
			disasterEventId,
			responseId,
			attachmentId,
		});
		return new Response(null, { status: 204 });
	}

	throw new Response("Method Not Allowed: Only PUT or DELETE are supported", {
		status: 405,
	});
};
