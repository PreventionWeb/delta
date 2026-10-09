import { useState } from "react";
import { useLoaderData, useNavigate, useOutletContext } from "react-router";
import { Button } from "primereact/button";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { dr } from "~/db.server";
import { divisionTable } from "~/drizzle/schema/divisionTable";
import type { DisasterEventFormOutletContext } from "~/frontend/disaster-event/DisasterEventForm";
import { ViewContext } from "~/frontend/context";
import { SpatialFootprintFormView2 } from "~/frontend/spatialFootprintFormView2";
import { authLoaderWithPerm } from "~/utils/auth";
import {
	getCountryAccountsIdFromSession,
	getCountrySettingsFromSession,
} from "~/utils/session";

export const loader = authLoaderWithPerm("EditData", async ({ request }) => {
	const countryAccountsId = await getCountryAccountsIdFromSession(request);
	if (!countryAccountsId) {
		throw new Response("Unauthorized", { status: 401 });
	}

	const settings = await getCountrySettingsFromSession(request);
	const ctryIso3 = settings?.dtsInstanceCtryIso3 || "";

	const divisions = await dr
		.select({
			id: divisionTable.id,
			name: divisionTable.name,
			geojson: divisionTable.geojson,
		})
		.from(divisionTable)
		.where(
			and(
				isNull(divisionTable.parentId),
				isNotNull(divisionTable.geojson),
				eq(divisionTable.countryAccountsId, countryAccountsId),
			),
		);

	return {
		ctryIso3,
		divisions,
	};
});

export default function SpatialFootprintModalRoute() {
	const ld = useLoaderData<typeof loader>();
	const navigate = useNavigate();
	const ctx = new ViewContext();
	const { spatialFootprintValue, setSpatialFootprintValue } =
		useOutletContext<DisasterEventFormOutletContext>();
	const [draftValue, setDraftValue] = useState<any[]>(
		Array.isArray(spatialFootprintValue) ? spatialFootprintValue : [],
	);
	const [pendingExitAction, setPendingExitAction] = useState<
		"close" | "cancel" | "apply" | null
	>(null);

	const handleSave = () => {
		if (pendingExitAction) {
			return;
		}

		setPendingExitAction("apply");
		setSpatialFootprintValue(Array.isArray(draftValue) ? draftValue : []);
		navigate("..", { replace: true });
	};

	const handleClose = () => {
		if (pendingExitAction) {
			return;
		}

		setPendingExitAction("close");
		navigate("..", { replace: true });
	};

	const handleCancel = () => {
		if (pendingExitAction) {
			return;
		}

		setPendingExitAction("cancel");
		navigate("..", { replace: true });
	};

	return (
		<div
			className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/35 p-2 sm:p-4"
			style={{
				padding: 0,
			}}
		>
			<div
				className="w-full max-w-6xl rounded-xl bg-white p-3 shadow-xl sm:p-5"
				style={{
					maxHeight: "calc(100vh - 1rem)",
					overflowY: "auto",
				}}
			>
				<div className="mb-4 flex items-center justify-between">
					<h3 className="text-[18px] font-semibold text-slate-800">
						{ctx.t({
							code: "disaster_event.form.edit_spatial_footprint",
							msg: "Edit spatial footprint",
						})}
					</h3>
					<Button
						type="button"
						icon="pi pi-times"
						text
						aria-label={ctx.t({ code: "common.close", msg: "Close" })}
						loading={pendingExitAction === "close"}
						disabled={Boolean(pendingExitAction)}
						onClick={handleClose}
					/>
				</div>

				<SpatialFootprintFormView2
					ctx={ctx}
					divisions={ld.divisions}
					ctryIso3={ld.ctryIso3}
					initialData={draftValue}
					onChange={(items) => {
						setDraftValue(Array.isArray(items) ? items : []);
					}}
				/>

				<div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
					<Button
						type="button"
						label={ctx.t({ code: "common.cancel", msg: "Cancel" })}
						outlined
						loading={pendingExitAction === "cancel"}
						disabled={Boolean(pendingExitAction)}
						onClick={handleCancel}
					/>
					<Button
						type="button"
						label={ctx.t({ code: "common.apply", msg: "Apply" })}
						loading={pendingExitAction === "apply"}
						disabled={Boolean(pendingExitAction)}
						onClick={handleSave}
					/>
					<span className="sr-only" aria-live="polite">
						{pendingExitAction
							? ctx.t({
									code: "disaster_event.form.closing_dialog",
									msg: "Closing dialog",
								})
							: ""}
					</span>
				</div>
			</div>
		</div>
	);
}
