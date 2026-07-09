import {
	useLoaderData,
	useNavigate,
	useNavigation,
	useParams,
} from "react-router";
import fs from "fs";
import path from "path";
import { disasterEventById } from "~/backend.server/models/event";
import { BackendContext } from "~/backend.server/context";
import DeleteDisasterEventDialog from "~/frontend/disaster-event/DeleteDisasterEventDialog";
import { authActionWithPerm, authLoaderWithPerm } from "~/utils/auth";
import {
	getCountryAccountsIdFromSession,
	redirectWithMessage,
} from "~/utils/session";
import { DisasterEventRepository } from "~/db/queries/disasterEventRepository";
import { DisasterRecordsRepository } from "~/db/queries/disasterRecordsRepository";
import { BASE_UPLOAD_PATH, DISASTER_EVENT_UPLOAD_PATH } from "~/utils/paths";
import { dr } from "~/db.server";

export const loader = authLoaderWithPerm(
	"DeleteDisasterEvent",
	async (loaderArgs) => {
		const { request, params } = loaderArgs;
		const id = params.id;
		if (!id) {
			throw new Response("Missing item ID", { status: 400 });
		}

		const countryAccountsId = await getCountryAccountsIdFromSession(request);
		if (!countryAccountsId) {
			throw new Response("Unauthorized", { status: 401 });
		}

		const ctx = new BackendContext(loaderArgs);
		const item = await disasterEventById(ctx, id);
		if (!item) {
			throw new Response("Not Found", { status: 404 });
		}
		if (item.countryAccountsId !== countryAccountsId) {
			throw new Response("Unauthorized", { status: 401 });
		}

		return {
			item: {
				id: item.id,
				name:
					item.nameNational ||
					item.nameGlobalOrRegional ||
					item.id,
			},
		};
	},
);

export const action = authActionWithPerm(
	"DeleteDisasterEvent",
	async (actionArgs) => {
		const { request, params } = actionArgs;
		const id = params.id;
		if (!id) {
			throw new Response("Missing item ID", { status: 400 });
		}

		const countryAccountsId = await getCountryAccountsIdFromSession(request);
		if (!countryAccountsId) {
			throw new Response("Unauthorized", { status: 401 });
		}

		const ctx = new BackendContext(actionArgs);
		const item = await disasterEventById(ctx, id);
		if (!item) {
			throw new Response("Not Found", { status: 404 });
		}
		if (item.countryAccountsId !== countryAccountsId) {
			throw new Response("Unauthorized", { status: 401 });
		}

		const deletedEvents = await dr.transaction(async (tx) => {
			await DisasterRecordsRepository.unlinkByDisasterEventIdAndCountryAccountsId(
				id,
				countryAccountsId,
				tx,
			);

			return DisasterEventRepository.deleteByIdAndCountryAccountsId(
				id,
				countryAccountsId,
				tx,
			);
		});

		if (deletedEvents.length !== 1 || deletedEvents[0]?.id !== id) {
			throw new Response("Failed to delete disaster event", { status: 500 });
		}

		const attachmentDirectory = path.resolve(
			process.cwd(),
			BASE_UPLOAD_PATH,
			`tenant-${countryAccountsId}`,
			path.relative(BASE_UPLOAD_PATH, DISASTER_EVENT_UPLOAD_PATH),
			id,
		);

		fs.rmSync(attachmentDirectory, { recursive: true, force: true });

		return redirectWithMessage(actionArgs, "/disaster-event", {
			type: "info",
			text: ctx.t({
				code: "common.record_deleted",
				msg: "Record deleted",
			}),
		});
	},
);

export default function DeleteDisasterEventRoute() {
	const { item } = useLoaderData<typeof loader>();
	const navigation = useNavigation();
	const navigate = useNavigate();
	const { lang } = useParams();
	const isSubmitting = navigation.state === "submitting";

	return (
		<DeleteDisasterEventDialog
			itemName={item.name}
			isSubmitting={isSubmitting}
			onCancel={() => navigate(`/${lang}/disaster-event`)}
		/>
	);
}
