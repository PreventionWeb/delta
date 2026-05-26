import {
	useLoaderData,
	useNavigate,
	useNavigation,
	useParams,
} from "react-router";
import { disasterEventById } from "~/backend.server/models/event";
import { BackendContext } from "~/backend.server/context";
import DeleteDisasterEventDialog from "~/frontend/disaster-event/DeleteDisasterEventDialog";
import { authActionWithPerm, authLoaderWithPerm } from "~/utils/auth";
import {
	getCountryAccountsIdFromSession,
	redirectWithMessage,
} from "~/utils/session";
import { DisasterEventRepository } from "~/db/queries/disasterEventRepository";

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

		await DisasterEventRepository.delete(id);

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
