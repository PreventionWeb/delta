import { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { apiAuth } from "~/backend.server/models/api_key";
import { authLoaderApi } from "~/utils/auth";
import { isValidUUID } from "~/utils/id";
import {
	createDeclarationAttachment,
	getMultipartFiles,
	isMultipartRequest,
	listDeclarationAttachments,
	uploadDeclarationAttachmentFile,
} from "./attachments_api.server";

function getParams(params: LoaderFunctionArgs["params"]) {
	const disasterEventId = params.disasterEventId as string;
	const declarationId = params.id as string;
	if (!disasterEventId || !isValidUUID(disasterEventId)) {
		throw new Response("Invalid disasterEventId", { status: 400 });
	}
	if (!declarationId || !isValidUUID(declarationId)) {
		throw new Response("Invalid declaration id", { status: 400 });
	}
	return { disasterEventId, declarationId };
}

export const loader = authLoaderApi(async (args: LoaderFunctionArgs) => {
	const { disasterEventId, declarationId } = getParams(args.params);
	const apiKey = await apiAuth(args.request);
	const countryAccountsId = apiKey.countryAccountsId;
	if (!countryAccountsId) {
		throw new Response("Unauthorized", { status: 401 });
	}

	const data = await listDeclarationAttachments({
		countryAccountsId,
		disasterEventId,
		declarationId,
	});
	return Response.json(data);
});

export const action = async (args: ActionFunctionArgs) => {
	if (args.request.method !== "POST") {
		throw new Response("Method Not Allowed: Only POST requests are supported", {
			status: 405,
		});
	}

	const { disasterEventId, declarationId } = getParams(args.params);
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

		const created = [] as Array<
			Awaited<ReturnType<typeof createDeclarationAttachment>>
		>;
		for (const uploadedFile of uploadedFiles) {
			const payload = await uploadDeclarationAttachmentFile({
				countryAccountsId,
				disasterEventId,
				declarationId,
				uploadedFile,
				title: String(formData.get("title") ?? ""),
			});
			const record = await createDeclarationAttachment({
				countryAccountsId,
				disasterEventId,
				declarationId,
				payload,
			});
			created.push(record);
		}
		return Response.json(created, { status: 201 });
	}

	const payload = await args.request.json();
	const created = await createDeclarationAttachment({
		countryAccountsId,
		disasterEventId,
		declarationId,
		payload,
	});
	return Response.json(created, { status: 201 });
};
