import { useCallback } from "react";
import {
	Form as RRForm,
	MetaFunction,
	useActionData,
	useLoaderData,
	useNavigate,
	useNavigation,
} from "react-router";
import { Dialog } from "primereact/dialog";
import { Button } from "primereact/button";
import { Message } from "primereact/message";
import { authActionWithPerm, authLoaderWithPerm } from "~/utils/auth";
import {
	getCountryAccountsIdFromSession,
	redirectWithMessage,
} from "~/utils/session";
import { BackendContext } from "~/backend.server/context";
import { DivisionRepository } from "~/db/queries/divisonRepository";
import { ViewContext } from "~/frontend/context";
import { htmlTitle } from "~/utils/htmlmeta";

type ActionResult = {
	ok: boolean;
	error?: string;
};

type DeleteConstraints = {
	canDelete: boolean;
	blockMessage: string | null;
};

function getDeleteBlockMessage(
	ctx: ViewContext,
	descendantCount: number,
	linkedSelf: boolean,
	linkedChildren: boolean,
) {
	if (descendantCount > 0) {
		return ctx.t(
			{
				code: "geographies.cannot_delete_parent_division",
				msg: "This division has child divisions. Delete or move child divisions first.",
			},
		);
	}

	if (linkedSelf) {
		return ctx.t({
			code: "geographies.cannot_delete_linked_division",
			msg: "This division is linked to existing geospatial records and cannot be deleted.",
		});
	}

	if (linkedChildren) {
		return ctx.t({
			code: "geographies.cannot_delete_division_linked_children",
			msg: "One or more child divisions are linked to existing geospatial records.",
		});
	}

	return null;
}

async function getDeleteConstraints(args: {
	id: string;
	countryAccountsId: string;
	ctx: ViewContext;
}): Promise<DeleteConstraints> {
	const descendantIds = await DivisionRepository.getDescendantIds(
		args.id,
		args.countryAccountsId,
	);
	const scopedIds = [args.id, ...descendantIds];
	const inUseIds = await DivisionRepository.getInUseDivisionIds(scopedIds);
	const blockMessage = getDeleteBlockMessage(
		args.ctx,
		descendantIds.length,
		inUseIds.has(args.id),
		descendantIds.some((divisionId) => inUseIds.has(divisionId)),
	);

	return {
		canDelete: blockMessage === null,
		blockMessage,
	};
}

function listPathWithQuery(divisionParentId: string | null, searchParams: URLSearchParams) {
	const params = new URLSearchParams();
	params.set("view", searchParams.get("view") || "table");
	const parent = searchParams.get("parent") || divisionParentId;
	if (parent) {
		params.set("parent", parent);
	}
	return `/settings/geography?${params.toString()}`;
}

export const meta: MetaFunction = ({ params }) => {
	const ctx = new ViewContext({ lang: params.lang || "en" });

	return [
		{
			title: htmlTitle(
				ctx,
				ctx.t({
					code: "geographies.delete_division_title",
					msg: "Delete Division",
				}),
			),
		},
	];
};

// ── Loader ───────────────────────────────────────────────────────────────────

export const loader = authLoaderWithPerm(
	"ManageCountrySettings",
	async (args) => {
		const { request, params } = args;
		const { id } = params;

		if (!id) {
			throw new Response("Missing division ID", { status: 400 });
		}

		const countryAccountsId = await getCountryAccountsIdFromSession(request);
		const division = await DivisionRepository.getById(id, countryAccountsId);
		if (!division) {
			throw new Response("Division not found", { status: 404 });
		}
		const ctx = new ViewContext({ lang: params.lang || "en" });
		const constraints = await getDeleteConstraints({
			id,
			countryAccountsId,
			ctx,
		});

		const url = new URL(request.url);

		return {
			id,
			division,
			canDelete: constraints.canDelete,
			blockMessage: constraints.blockMessage,
			backPath: listPathWithQuery(division.parentId, url.searchParams),
		};
	},
);

// ── Action ───────────────────────────────────────────────────────────────────

export const action = authActionWithPerm(
	"ManageCountrySettings",
	async (args) => {
		const backendCtx = new BackendContext(args);
		const viewCtx = new ViewContext({ lang: args.params.lang || "en" });
		const { request, params } = args;
		const { id } = params;

		if (!id) {
			return { ok: false, error: "Missing division ID" } satisfies ActionResult;
		}

		const countryAccountsId = await getCountryAccountsIdFromSession(request);
		const division = await DivisionRepository.getById(id, countryAccountsId);
		if (!division) {
			return { ok: false, error: "Division not found" } satisfies ActionResult;
		}

		const constraints = await getDeleteConstraints({
			id,
			countryAccountsId,
			ctx: viewCtx,
		});
		if (!constraints.canDelete) {
			return {
				ok: false,
				error: constraints.blockMessage ||
					viewCtx.t({
						code: "geographies.failed_delete_division",
						msg: "Unable to delete this division due to related data. Remove links or child divisions first.",
					}),
			} satisfies ActionResult;
		}

		try {
			const deleted = await DivisionRepository.deleteById(id, countryAccountsId);
			if (!deleted) {
				return {
					ok: false,
					error: "Division not found",
				} satisfies ActionResult;
			}
		} catch (error: any) {
			if (error?.code === "23503") {
				return {
					ok: false,
					error: viewCtx.t({
						code: "geographies.cannot_delete_parent_division",
						msg: "This division has child divisions. Delete or move child divisions first.",
					}),
				} satisfies ActionResult;
			}

			return {
				ok: false,
				error: viewCtx.t({
					code: "geographies.failed_delete_division",
					msg: "Unable to delete this division due to related data. Remove links or child divisions first.",
				}),
			} satisfies ActionResult;
		}

		const requestUrl = new URL(request.url);
		const redirectPath = listPathWithQuery(
			division.parentId,
			requestUrl.searchParams,
		);

		return redirectWithMessage(args, redirectPath, {
			type: "info",
			text: backendCtx.t({
				code: "geographies.division_deleted_successfully",
				msg: "Division deleted successfully.",
			}),
		});
	},
);

// ── Component ─────────────────────────────────────────────────────────────────

export default function DeleteDivisionDialog() {
	const loaderData = useLoaderData<typeof loader>();
	const actionData = useActionData<typeof action>();
	const ctx = new ViewContext();
	const navigate = useNavigate();
	const navigation = useNavigation();
	const isSubmitting = navigation.state === "submitting";
	const onHide = useCallback(
		() => navigate(ctx.url(loaderData.backPath)),
		[navigate, ctx, loaderData.backPath],
	);

	const footer = (
		<div className="flex justify-end gap-2">
			<Button
				type="button"
				outlined
				label={ctx.t({ code: "common.cancel", msg: "Cancel" })}
				onClick={onHide}
				disabled={isSubmitting}
			/>
			<Button
				type="submit"
				form="delete-division-form"
				icon="pi pi-trash"
				severity="danger"
				label={ctx.t({ code: "common.delete", msg: "Delete" })}
				disabled={!loaderData.canDelete || isSubmitting}
				loading={isSubmitting}
			/>
		</div>
	);

	return (
		<Dialog
			visible
			onHide={onHide}
			header={ctx.t({
				code: "geographies.delete_division_title",
				msg: "Delete division",
			})}
			footer={footer}
			style={{ width: "440px" }}
			closable={!isSubmitting}
		>
			{actionData && !actionData.ok && actionData.error && (
				<Message
					className="mb-4 w-full"
					severity="error"
					text={actionData.error}
				/>
			)}

			<p className="text-gray-700">
				{ctx.t({
					code: "geographies.delete_division_confirmation",
					msg: "This data cannot be recovered after being deleted.",
				})}
			</p>
			<p className="mt-2 font-semibold text-gray-800">
				{loaderData.division.nationalId || loaderData.division.id}
			</p>

			{!loaderData.canDelete && loaderData.blockMessage && (
				<Message
					className="mt-4 w-full"
					severity="warn"
					text={loaderData.blockMessage}
				/>
			)}

			<RRForm method="post" id="delete-division-form" />
		</Dialog>
	);
}
