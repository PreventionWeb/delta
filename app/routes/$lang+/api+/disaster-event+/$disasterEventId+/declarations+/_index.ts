import { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { apiAuth } from "~/backend.server/models/api_key";
import { authLoaderApi } from "~/utils/auth";
import { isValidUUID } from "~/utils/id";
import {
	createDeclarationAttachment,
	isMultipartRequest,
	uploadDeclarationAttachmentFile,
} from "~/routes/$lang+/api+/disaster-event+/$disasterEventId+/declarations+/$id+/attachments+/attachments_api.server";
import {
	createDeclarationForTenant,
	getDeclarationForTenantById,
	listDeclarationsForTenant,
} from "~/routes/$lang+/api+/disaster-event+/declarations+/declaration_api.server";

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

	const data = await listDeclarationsForTenant({
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
			type: String(formData.get("type") ?? "").trim(),
			effects: String(formData.get("effects") ?? "").trim(),
			declarationDate: String(formData.get("declarationDate") ?? "").trim(),
			issuingOrganization: String(
				formData.get("issuingOrganization") ?? "",
			).trim(),
			coverage: String(formData.get("coverage") ?? "").trim(),
			declarationStatusId: String(
				formData.get("declarationStatusId") ?? "",
			).trim(),
			declarationStatus: String(formData.get("declarationStatus") ?? "").trim(),
		};

		const created = await createDeclarationForTenant({
			countryAccountsId,
			payload,
		});
		if (!created) {
			throw new Response("Failed to create declaration", { status: 500 });
		}

		const uploadedFiles = parseAttachmentFiles(formData);
		for (const uploadedFile of uploadedFiles) {
			const attachmentPayload = await uploadDeclarationAttachmentFile({
				countryAccountsId,
				disasterEventId,
				declarationId: created.id,
				uploadedFile,
				title: String(formData.get("title") ?? ""),
			});
			await createDeclarationAttachment({
				countryAccountsId,
				disasterEventId,
				declarationId: created.id,
				payload: attachmentPayload,
			});
		}

		const hydrated = await getDeclarationForTenantById({
			countryAccountsId,
			id: created.id,
		});
		return Response.json(hydrated, { status: 201 });
	}

	const payload = await args.request.json();
	const created = await createDeclarationForTenant({
		countryAccountsId,
		payload: {
			...payload,
			disasterEventId,
		},
	});
	return Response.json(created, { status: 201 });
};
