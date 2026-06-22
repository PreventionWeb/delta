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

	const handleSave = () => {
		setSpatialFootprintValue(Array.isArray(draftValue) ? draftValue : []);
		navigate("..", { replace: true });
	};

	return (
		<div
			style={{
				position: "fixed",
				inset: 0,
				zIndex: 40,
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				background: "rgba(0, 0, 0, 0.35)",
				padding: "1rem",
			}}
		>
			<div className="w-full max-w-6xl rounded-xl bg-white p-5 shadow-xl">
				<div className="mb-4 flex items-center justify-between">
					<h3 className="text-[18px] font-semibold text-slate-800">
						Edit spatial footprint
					</h3>
					<Button
						type="button"
						label="Close"
						text
						onClick={() => navigate("..", { replace: true })}
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

				<div className="mt-4 flex justify-end gap-2">
					<Button
						type="button"
						label="Cancel"
						outlined
						onClick={() => navigate("..", { replace: true })}
					/>
					<Button type="button" label="Apply" onClick={handleSave} />
				</div>
			</div>
		</div>
	);
}
