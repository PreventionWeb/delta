import { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authLoaderApi } from "~/utils/auth";
import { apiAuth } from "~/backend.server/models/api_key";
import { isValidUUID } from "~/utils/id";
import {
	createResponseForTenant,
	getResponseForTenantById,
	listResponsesForTenant,
} from "~/routes/$lang+/api+/disaster-event+/responses+/response_api.server";
import {
	createResponseAttachment,
	isMultipartRequest,
	uploadResponseAttachmentFile,
} from "~/routes/$lang+/api+/disaster-event+/$disasterEventId+/responses+/$id+/attachments+/attachments_api.server";

function getDisasterEventId(params: LoaderFunctionArgs["params"]) {
	const disasterEventId = params.disasterEventId as string;
	if (!disasterEventId || !isValidUUID(disasterEventId)) {
		throw new Response("Invalid disasterEventId", { status: 400 });
	}
	return disasterEventId;
}

function parseAttachmentFiles(formData: FormData) {
	const fileFields = ["file", "files", "files[]"];
	const uploadedFiles: File[] = [];
	for (const fieldName of fileFields) {
		for (const value of formData.getAll(fieldName)) {
			if (value instanceof File) {
				uploadedFiles.push(value);
			}
		}
	}
	return uploadedFiles;
}

export const loader = authLoaderApi(async (args: LoaderFunctionArgs) => {
	const disasterEventId = getDisasterEventId(args.params);
	const apiKey = await apiAuth(args.request);
	const countryAccountsId = apiKey.countryAccountsId;
	if (!countryAccountsId) {
		throw new Response("Unauthorized", { status: 401 });
	}

	const data = await listResponsesForTenant({
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

	const disasterEventId = getDisasterEventId(args.params);
	const apiKey = await apiAuth(args.request);
	const countryAccountsId = apiKey.countryAccountsId;
	if (!countryAccountsId) {
		throw new Response("Unauthorized", { status: 401 });
	}

	if (isMultipartRequest(args.request)) {
		const formData = await args.request.formData();
		const payload = {
			disasterEventId,
			responseTypeId: String(formData.get("responseTypeId") ?? "").trim(),
			responseType: String(formData.get("responseType") ?? "").trim(),
			coverage: String(formData.get("coverage") ?? "").trim(),
			responseDate: String(formData.get("responseDate") ?? "").trim(),
			description: String(formData.get("description") ?? "").trim(),
		};

		const created = await createResponseForTenant({
			countryAccountsId,
			payload,
		});
		if (!created) {
			throw new Response("Failed to create response", { status: 500 });
		}

		const uploadedFiles = parseAttachmentFiles(formData);
		for (const uploadedFile of uploadedFiles) {
			const attachmentPayload = await uploadResponseAttachmentFile({
				countryAccountsId,
				disasterEventId,
				responseId: created.id,
				uploadedFile,
				title: String(formData.get("title") ?? ""),
			});
			await createResponseAttachment({
				countryAccountsId,
				disasterEventId,
				responseId: created.id,
				payload: attachmentPayload,
			});
		}

		const hydrated = await getResponseForTenantById({
			countryAccountsId,
			id: created.id,
		});
		return Response.json(hydrated, { status: 201 });
	}

	const payload = await args.request.json();
	const created = await createResponseForTenant({
		countryAccountsId,
		payload: {
			...payload,
			disasterEventId,
		},
	});
	return Response.json(created, { status: 201 });
};
