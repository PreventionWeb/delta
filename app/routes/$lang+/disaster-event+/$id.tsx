import { disasterEventById } from "~/backend.server/models/event";

import { DisasterEventView } from "~/frontend/events/disastereventform";

import { createViewLoaderPublicApproved } from "~/backend.server/handlers/form/form";

import { ViewScreenPublicApproved } from "~/frontend/form";
import {
	authActionGetAuth,
	authActionWithPerm,
	optionalUser,
} from "~/utils/auth";

// import { dr } from "~/db.server";
// import { sql } from "drizzle-orm";
import { getCountryAccountsIdFromSession } from "~/utils/session";
import { ViewContext } from "~/frontend/context";
import { useLoaderData } from "react-router";

import { LoaderFunctionArgs } from "react-router";
import { BackendContext } from "~/backend.server/context";
import { processApprovalStatusActionService } from "~/services/approvalStatusWorkflowService";
import { getUserIdFromSession } from "~/utils/session";
import { getReturnAssigneeUsers } from "~/db/queries/userCountryAccountsRepository";
import { DisasterEventAttachmentRepository } from "~/db/queries/disasterEventAttachmentRepository";

export const loader = async (args: LoaderFunctionArgs) => {
	const { request, params } = args;

	const { id } = params;
	if (!id) {
		throw new Response("ID is required", { status: 400 });
	}

	const userSession = await optionalUser(args);
	const countryAccountsId = await getCountryAccountsIdFromSession(request);
	const userId = userSession ? await getUserIdFromSession(request) : null;

	const loaderFunction = createViewLoaderPublicApproved({
		getById: disasterEventById,
	});

	const result = await loaderFunction(args);
	if (result.item.countryAccountsId !== countryAccountsId) {
		throw new Response("Unauthorized access", { status: 401 });
	}

	const disasterEventAttachments =
		await DisasterEventAttachmentRepository.getByDisasterEventId(
			result.item.id,
		);

	const returnAssignees =
		userSession && countryAccountsId
			? (await getReturnAssigneeUsers(countryAccountsId, userId)).map(
					(user) => ({
						label: `${user.firstName} ${user.lastName}`.trim(),
						value: user.id,
					}),
				)
			: [];

	return {
		...result,

		item: {
			...result.item,
			spatialFootprintsDataSource: [],
			attachments: disasterEventAttachments,
			returnAssignees,
		},
	};
};

export const action = authActionWithPerm("EditData", async (actionArgs) => {
	const { request, params } = actionArgs;

	const countryAccountsId = await getCountryAccountsIdFromSession(request);
	const userSession = authActionGetAuth(actionArgs);
	const formData = await request.formData();
	const ctx = new BackendContext(actionArgs);

	const result = await processApprovalStatusActionService({
		ctx,
		request,
		formData,
		routeRecordId: params.id,
		countryAccountsId,
		userId: userSession.user.id,
		recordType: "disaster_event",
	});

	return Response.json(result);
});

export default function Screen() {
	const ld = useLoaderData<typeof loader>();
	const ctx = new ViewContext();
	if (!ld.item) {
		throw new Error("no item");
	}
	return (
		<>
			<ViewScreenPublicApproved
				loaderData={ld}
				ctx={ctx}
				viewComponent={DisasterEventView}
			/>
		</>
	);
}
