import { DisasterRecordsView } from "~/frontend/disaster-record/form";
import { SectorEffectsTable } from "~/frontend/disaster-record/SectorEffectsTable";

import {
	createViewLoaderPublicApproved,
	createViewLoaderPublicApprovedWithAuditLog,
} from "~/backend.server/handlers/form/form";

import { ViewScreenPublicApproved } from "~/frontend/form";
import { disasterRecordsById } from "~/backend.server/models/disaster_record";
import { nonecoLossesFilderBydisasterRecordsId } from "~/backend.server/models/noneco_losses";
import { sectorsFilterByDisasterRecordId } from "~/backend.server/models/disaster_record__sectors";
import { getAffectedByDisasterRecord } from "~/backend.server/models/analytics/affected-people-by-disaster-record";
import AuditLogHistory from "~/components/AuditLogHistory";
import { disasterRecordsTable } from "~/drizzle/schema/disasterRecordsTable";
import { getTableName } from "drizzle-orm";

import { dr } from "~/db.server";
import { contentPickerConfig } from "./content-picker-config";
import {
	authActionGetAuth,
	authActionWithPerm,
	optionalUser,
} from "~/utils/auth";
import { getCountryAccountsIdFromSession } from "~/utils/session";
import { getUserIdFromSession } from "~/utils/session";
import { useLoaderData } from "react-router";
import { Fragment } from "react";
import { ViewContext } from "~/frontend/context";

import { LoaderFunctionArgs } from "react-router";
import { BackendContext } from "~/backend.server/context";
import { processApprovalStatusActionService } from "~/services/approvalStatusWorkflowService";
import { getReturnAssigneeUsers } from "~/db/queries/userCountryAccountsRepository";
import { queryHipEntity } from "~/backend.server/models/hip";
import { DisasterRecordsGeomRepository } from "~/db/queries/disasterRecordsGeomRepository";
import { DisasterRecordsDivisionRepository } from "~/db/queries/disasterRecordsDivisionRepository";
import { DisruptionRepository } from "~/db/queries/disruptionRepository";
import { DisruptionGeomRepository } from "~/db/queries/disruptionGeomRepository";
import { DisruptionDivisionRepository } from "~/db/queries/disruptionDivisionRepository";
import { LossesRepository } from "~/db/queries/lossesRepository";
import { LossesGeomRepository } from "~/db/queries/lossesGeomRepository";
import { LossesDivisionRepository } from "~/db/queries/lossesDivisionRepository";
import { DamagesRepository } from "~/db/queries/damagesRepository";
import { DamagesGeomRepository } from "~/db/queries/damagesGeomRepository";
import { DamagesDivisionRepository } from "~/db/queries/damagesDivisionRepository";

export const loader = async (args: LoaderFunctionArgs) => {
	const { request, params } = args;
	const ctx = new BackendContext(args);
	const { id } = params;
	if (!id) {
		throw new Response("ID is required", { status: 400 });
	}

	const userSession = await optionalUser(args);
	const countryAccountsId = await getCountryAccountsIdFromSession(request);
	const userId = userSession ? await getUserIdFromSession(request) : null;
	if (!countryAccountsId) {
		throw new Response("Unauthorized, no selected instance", { status: 401 });
	}

	// Create a wrapper function that includes tenant context
	const getByIdWithTenant = async (_ctx: BackendContext, idStr: string) => {
		return disasterRecordsById(idStr, countryAccountsId);
	};

	const loaderFunction = userSession
		? createViewLoaderPublicApprovedWithAuditLog({
				getById: getByIdWithTenant,
				recordId: id,
				tableName: getTableName(disasterRecordsTable),
			})
		: createViewLoaderPublicApproved({
				getById: getByIdWithTenant,
			});

	const result = await loaderFunction(args);
	if (result.item.countryAccountsId !== countryAccountsId) {
		throw new Response("Unauthorized access", { status: 403 });
	}

	const cpDisplayName =
		(await contentPickerConfig(ctx).selectedDisplay(
			ctx,
			dr,
			result.item.disasterEventId,
		)) ?? "";
	const [disasterRecordGeoms, disasterRecordDivisions] = await Promise.all([
		DisasterRecordsGeomRepository.getByDisasterRecordId(id),
		DisasterRecordsDivisionRepository.getByDisasterRecordId(id),
	]);
	const [
		disruptions,
		losses,
		damages,
	] = await Promise.all([
		DisruptionRepository.getByRecordIdWithInfo(id, ctx.lang),
		LossesRepository.getByRecordIdWithInfo(id, ctx.lang),
		DamagesRepository.getByRecordIdWithInfo(id, ctx.lang),
	]);

	const [
		disruptionGeoms,
		disruptionDivisions,
		lossesGeoms,
		lossesDivisions,
		damagesGeoms,
		damagesDivisions,
	] = await Promise.all([
		DisruptionGeomRepository.getByDisruptionIds(
			((result.item as any).children || []).map((child: any) => child.id),
		),
		DisruptionDivisionRepository.getByDisruptionIds(
			((result.item as any).children || []).map((child: any) => child.id),
		),
		LossesGeomRepository.getByLossIds(
			((result.item as any).losses || []).map((item: any) => item.id),
		),
		LossesDivisionRepository.getByLossIds(
			((result.item as any).losses || []).map((item: any) => item.id),
		),
		DamagesGeomRepository.getByDamageIds(
			((result.item as any).damages || []).map((item: any) => item.id),
		),
		DamagesDivisionRepository.getByDamageIds(
			((result.item as any).damages || []).map((item: any) => item.id),
		),
	]);
	const disasterRecord = [
		...disasterRecordGeoms.map((row) => ({
			kind: "disaster_record_geom",
			...row,
		})),
		...disasterRecordDivisions.map((row) => ({
			kind: "disaster_record_division",
			...row,
		})),
		...disruptions.map((row) => ({
			kind: "disruption",
			...row,
		})),
		...disruptionGeoms.map((row) => ({
			kind: "disruption_geom",
			...row,
		})),
		...disruptionDivisions.map((row) => ({
			kind: "disruption_division",
			...row,
		})),
		...losses.map((row) => ({
			kind: "losses",
			...row,
		})),
		...lossesGeoms.map((row) => ({
			kind: "losses_geom",
			...row,
		})),
		...lossesDivisions.map((row) => ({
			kind: "losses_division",
			...row,
		})),
		...damages.map((row) => ({
			kind: "damages",
			...row,
		})),
		...damagesGeoms.map((row) => ({
			kind: "damages_geom",
			...row,
		})),
		...damagesDivisions.map((row) => ({
			kind: "damages_division",
			...row,
		})),
	];

	const returnAssignees = userSession
		? (await getReturnAssigneeUsers(countryAccountsId, userId)).map((user) => ({
				label: `${user.firstName} ${user.lastName}`.trim(),
				value: user.id,
			}))
		: [];

	const dbNonecoLosses = await nonecoLossesFilderBydisasterRecordsId(ctx, id);
	const dbDisRecSectors = await sectorsFilterByDisasterRecordId(ctx, id);
	const dbDisRecHumanEffectsSummaryTable = await getAffectedByDisasterRecord(
		dr,
		id,
	);
	const hipEntity = await queryHipEntity(
		ctx,
		result.item.hipHazardId,
		result.item.hipClusterId,
		result.item.hipTypeId,
	);

	const hipHazard =
		result.item.hipHazardId && hipEntity ? hipEntity : undefined;
	const hipCluster =
		!result.item.hipHazardId && result.item.hipClusterId && hipEntity
			? hipEntity
			: undefined;
	const hipType =
		!result.item.hipHazardId &&
		!result.item.hipClusterId &&
		result.item.hipTypeId &&
		hipEntity
			? hipEntity
			: undefined;

	const extendedItem = {
		...result.item,
		cpDisplayName,
		disasterRecord,
		returnAssignees,
		hipHazard: hipHazard || undefined,
		hipCluster: hipCluster || undefined,
		hipType: hipType || undefined,
	};

	return {
		...result,

		item: extendedItem,
		recordsNonecoLosses: dbNonecoLosses,
		recordsDisRecSectors: dbDisRecSectors,
		dbDisRecHumanEffectsSummaryTable,
	};
};

export const action = authActionWithPerm("EditData", async (actionArgs) => {
	const { request, params } = actionArgs;
	const ctx = new BackendContext(actionArgs);
	const countryAccountsId = await getCountryAccountsIdFromSession(request);
	const userSession = authActionGetAuth(actionArgs);
	const formData = await request.formData();

	const result = await processApprovalStatusActionService({
		ctx,
		request,
		formData,
		routeRecordId: params.id,
		countryAccountsId,
		userId: userSession.user.id,
		recordType: "disaster_records",
	});

	return Response.json(result);
});

export default function Screen() {
	const ld = useLoaderData<typeof loader>();
	const ctx = new ViewContext();
	const auditLogs = (ld as any).auditLogs as any[] | undefined;

	return (
		<>
			<ViewScreenPublicApproved
				loaderData={ld}
				ctx={ctx}
				viewComponent={DisasterRecordsView}
			/>
			{ld.item && (
				<div className="mg-container">
					<div>&nbsp;</div>
					<section>
						<div className="mx-auto px-4">
							<fieldset className="mb-6">
								<div className="mb-4">
									<legend className="text-xl font-semibold text-gray-800">
										{ctx.t({ code: "human_effects", msg: "Human effects" })}
									</legend>
								</div>

								<div className="border-0">
									<div className="overflow-x-auto">
										<table className="w-full border border-gray-300 text-sm">
											<thead className="bg-gray-50 text-gray-700">
												<tr>
													<th className="border border-gray-300 px-3 py-2"></th>
													<th className="border border-gray-300 px-3 py-2"></th>
													<th className="border border-gray-300 px-3 py-2"></th>
													<th
														className="border border-gray-300 px-3 py-2 text-center"
														colSpan={2}
													>
														{ctx.t({
															code: "human_effects.affected_old_desinventar",
															desc: "Human effects Affected (DesInventar is an older system used for tracking disaster data)",
															msg: "Affected (Old DesInventar)",
														})}
													</th>
													<th className="border border-gray-300 px-3 py-2"></th>
												</tr>
												<tr>
													{[
														{ code: "human_effects.deaths", msg: "Deaths" },
														{ code: "human_effects.injured", msg: "Injured" },
														{ code: "human_effects.missing", msg: "Missing" },
														{
															code: "human_effects.directly_affected",
															msg: "Directly",
														},
														{
															code: "human_effects.indirectly_affected",
															msg: "Indirectly",
														},
														{
															code: "human_effects.displaced",
															msg: "Displaced",
														},
													].map(({ code, msg }) => (
														<th
															key={code}
															className="border border-gray-300 px-3 py-2 font-medium text-left"
														>
															{ctx.t({ code, msg })}
														</th>
													))}
												</tr>
											</thead>
											<tbody>
												<tr className="hover:bg-gray-50">
													{(
														[
															{ key: "deaths", tbl: "Deaths" },
															{ key: "injured", tbl: "Injured" },
															{ key: "missing", tbl: "Missing" },
															{ key: "directlyAffected", tbl: "Affected" },
															{ key: "indirectlyAffected", tbl: "Affected" },
															{ key: "displaced", tbl: "Displaced" },
														] as const
													).map(({ key }) => {
														const value =
															ld.dbDisRecHumanEffectsSummaryTable[key];
														return (
															<td
																key={key}
																className="border border-gray-300 px-3 py-2"
															>
																{typeof value === "number" ? (
																	<span>{value}</span>
																) : value === true ? (
																	<span>
																		{ctx.t({ code: "common.yes", msg: "Yes" })}
																	</span>
																) : (
																	<span className="text-gray-400">-</span>
																)}
															</td>
														);
													})}
												</tr>
											</tbody>
										</table>
									</div>
								</div>
							</fieldset>
						</div>
					</section>
					<section>
						<div className="mx-auto px-4">
							<fieldset className="mb-6">
								<div className="mb-4">
									<legend className="text-xl font-semibold text-gray-800">
										{ctx.t({ code: "sector_effects", msg: "Sector effects" })}
									</legend>
								</div>

								<div className="border-0">
									<div className="overflow-x-auto">
										{Array.isArray(ld.recordsDisRecSectors) &&
											ld.recordsDisRecSectors.map((item, index) => (<Fragment key={item.catId ?? index}>
												<SectorEffectsTable
													item={item}
													disasterRecord={ld.item.disasterRecord ?? []}
													ctx={ctx}
												/>
										</Fragment>))}
									</div>
								</div>
							</fieldset>
						</div>
					</section>
					<section>
						<div className="mx-auto px-4">
							<fieldset className="mb-6">
								<div className="mb-4">
									<legend className="text-xl font-semibold text-gray-800">
										{ctx.t({
											code: "non_economic_losses",
											msg: "Non-economic losses",
										})}
									</legend>
								</div>

								<div className="border-0">
									<div className="overflow-x-auto">
										<table className="w-full border border-gray-300 text-sm">
											<thead className="bg-gray-50 text-gray-700">
												<tr>
													{[
														{ code: "common.category", msg: "Category" },
														{ code: "common.description", msg: "Description" },
													].map(({ code, msg }) => (
														<th
															key={code}
															className="border border-gray-300 px-3 py-2 font-medium text-left"
														>
															{ctx.t({ code, msg })}
														</th>
													))}
												</tr>
											</thead>
											<tbody>
												{Array.isArray(ld.recordsNonecoLosses) &&
													ld.recordsNonecoLosses.map((item, index) => (
														<tr key={index} className="hover:bg-gray-50">
															<td className="border border-gray-300 px-3 py-2">
																{item.categoryTreeDisplay}
															</td>
															<td className="border border-gray-300 px-3 py-2 text-gray-700">
																{item.noneccoDesc.slice(0, 300)}
															</td>
														</tr>
													))}
											</tbody>
										</table>
									</div>
								</div>
							</fieldset>
						</div>
					</section>
				</div>
			)}

			{auditLogs && auditLogs.length > 0 && (
				<>
					<div className="mg-container">
						<div>&nbsp;</div>
						<section>
							<div className="mx-auto px-4">
								<fieldset className="mb-6">
									<div className="mb-4">
										<legend className="text-xl font-semibold text-gray-800">
											{ctx.t({
												code: "audit_log.history",
												msg: "Audit log history",
											})}
										</legend>
									</div>

									<div className="border-0">
										<AuditLogHistory ctx={ctx} auditLogs={auditLogs} />
									</div>
								</fieldset>
							</div>
						</section>
					</div>
				</>
			)}
		</>
	);
}
