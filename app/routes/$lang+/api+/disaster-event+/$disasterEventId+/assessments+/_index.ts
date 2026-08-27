import { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authLoaderApi } from "~/utils/auth";
import { apiAuth } from "~/backend.server/models/api_key";
import { isValidUUID } from "~/utils/id";
import {
	getAssessmentForTenantById,
	createAssessmentForTenant,
	listAssessmentsForTenant,
} from "~/routes/$lang+/api+/disaster-event+/assessments+/assessment_api.server";
import {
	createAssessmentAttachment,
	getMultipartFiles,
	isMultipartRequest,
	uploadAssessmentAttachmentFile,
} from "~/routes/$lang+/api+/disaster-event+/$disasterEventId+/assessments+/$id+/attachments+/attachments_api.server";

function getDisasterEventId(params: LoaderFunctionArgs["params"]) {
	const disasterEventId = params.disasterEventId as string;
	if (!disasterEventId || !isValidUUID(disasterEventId)) {
		throw new Response("Invalid disasterEventId", { status: 400 });
	}
	return disasterEventId;
}

function parseSectorIds(raw: string): string[] {
	if (!raw.trim()) {
		return [];
	}

	try {
		const parsed = JSON.parse(raw);
		if (Array.isArray(parsed)) {
			return parsed
				.filter((value): value is string => typeof value === "string")
				.map((value) => value.trim())
				.filter(Boolean);
		}
	} catch {
		// Fallback to comma-separated values.
	}

	return raw
		.split(",")
		.map((value) => value.trim())
		.filter(Boolean);
}

export const loader = authLoaderApi(async (args: LoaderFunctionArgs) => {
	const disasterEventId = getDisasterEventId(args.params);
	const apiKey = await apiAuth(args.request);
	const countryAccountsId = apiKey.countryAccountsId;
	if (!countryAccountsId) {
		throw new Response("Unauthorized", { status: 401 });
	}

	const data = await listAssessmentsForTenant({
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
			assessmentTypeId: String(formData.get("assessmentTypeId") ?? "").trim(),
			assessmentType: String(formData.get("assessmentType") ?? "").trim(),
			coverage: String(formData.get("coverage") ?? "").trim(),
			assessmentDate: String(formData.get("assessmentDate") ?? "").trim(),
			description: String(formData.get("description") ?? "").trim(),
			otherSectors: String(formData.get("otherSectors") ?? "").trim(),
			sectorIds: parseSectorIds(String(formData.get("sectorIds") ?? "")),
		};

		const created = await createAssessmentForTenant({
			countryAccountsId,
			payload,
		});
		if (!created) {
			throw new Response("Failed to create assessment", { status: 500 });
		}

		const uploadedFiles = getMultipartFiles(formData);
		for (const uploadedFile of uploadedFiles) {
			const attachmentPayload = await uploadAssessmentAttachmentFile({
				countryAccountsId,
				disasterEventId,
				assessmentId: created.id,
				uploadedFile,
				title: String(formData.get("title") ?? ""),
			});
			await createAssessmentAttachment({
				countryAccountsId,
				disasterEventId,
				assessmentId: created.id,
				payload: attachmentPayload,
			});
		}

		const hydrated = await getAssessmentForTenantById({
			countryAccountsId,
			id: created.id,
		});
		return Response.json(hydrated, { status: 201 });
	}

	const payload = await args.request.json();
	const created = await createAssessmentForTenant({
		countryAccountsId,
		payload: {
			...payload,
			disasterEventId,
		},
	});

	return Response.json(created, { status: 201 });
};
