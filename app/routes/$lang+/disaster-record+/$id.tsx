import { DisasterRecordsView } from "~/frontend/disaster-record/form";

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
import {
	lossesTypeCategoryEnum,
	typeEnumAgriculture,
	typeEnumNotAgriculture,
} from "~/frontend/losses_enums";
import { unitName } from "~/frontend/unit_picker";
import { getCurrencySymbol } from "~/utils/currency";

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

	const getLossesTypeLabel = (
		typeKey: string | null | undefined,
		sectorIsAgriculture: boolean | null | undefined,
	) => {
		if (!typeKey) return "-";

		const entry = lossesTypeCategoryEnum(ctx, Boolean(sectorIsAgriculture)).find(
			(item) => item.key === typeKey,
		);

		return entry?.label || typeKey;
	};

	const getLossesRelatedToLabel = (
		relatedToKey: string | null | undefined,
		typeKey: string | null | undefined,
		sectorIsAgriculture: boolean | null | undefined,
	) => {
		if (!relatedToKey) return "-";

		const enumSource = Boolean(sectorIsAgriculture)
			? typeEnumAgriculture
			: typeEnumNotAgriculture;

		const entries = enumSource(ctx);
		const filteredEntries = typeKey
			? entries.filter((entry) => entry.type === typeKey)
			: entries;

		const match =
			filteredEntries.find((entry) => entry.key === relatedToKey) ||
			entries.find((entry) => entry.key === relatedToKey);

		return match?.label || relatedToKey;
	};

	const getLossesUnitLabel = (unitKey: string | null | undefined) => {
		if (!unitKey) return "-";
		return unitName(unitKey);
	};

	const formatLocalizedNumber = (value: string | number | null | undefined) => {
		if (value === null || value === undefined || value === "") return "-";

		const numberValue =
			typeof value === "string" ? Number.parseFloat(value) : value;
		if (!Number.isFinite(numberValue)) return "-";

		return numberValue.toLocaleString(navigator.language, {
			minimumFractionDigits: 0,
		});
	};

	const formatLocalizedCurrency = (
		value: string | number | null | undefined,
		currencyCode: string | null | undefined,
	) => {
		const formattedNumber = formatLocalizedNumber(value);
		if (formattedNumber === "-") return "-";
		if (!currencyCode) return formattedNumber;

		return `${getCurrencySymbol(currencyCode)} ${formattedNumber}`;
	};

	const renderMultilineText = (value: string | null | undefined) => {
		if (!value) return "-";

		return value.split(/\r?\n/).map((line, index) => (
			<Fragment key={`${index}-${line}`}>
				{index > 0 && <br />}
				<span>{line}</span>
			</Fragment>
		));
	};

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
											ld.recordsDisRecSectors.map((item, index) => (<>
												<table className="w-full border border-gray-300 text-sm">
													<thead className="bg-gray-700 text-gray-100">
														<tr>
															<th key="th-sectorname"
																className="border border-gray-300 px-3 py-2 font-medium text-left"
																>
																{ctx.t({ code: "sector_effects.sector", msg: "Sector" })}
															</th>
															
															<th key="th-damage-recovery_cost"
																className="border border-gray-300 px-3 py-2 font-medium text-left"
																>
																{ctx.t({
																	code: "sector_effects.damage",
																	msg: "Damage",
																})}
																{' '}
																{ctx.t({ code: "recovery_cost.sector", msg: "Recovery cost" })}
															</th>
															
															<th key="th-damage-cost"
																className="border border-gray-300 px-3 py-2 font-medium text-left"
																>
																{ctx.t({
																	code: "sector_effects.damage",
																	msg: "Damage",
																})}
																{' '}
																{ctx.t({ code: "sector_effects.cost", msg: "Cost" })}
															</th>

															<th key="th-losses-cost"
																className="border border-gray-300 px-3 py-2 font-medium text-left"
																>
																{ctx.t({
																	code: "sector_effects.losses", 
																	msg: "Losses"
																})}
																{' '}
																{ctx.t({ code: "sector_effects.cost", msg: "Cost" })}
															</th>

															<th key="th-disruption-cost"
																className="border border-gray-300 px-3 py-2 font-medium text-left"
																>
																{ctx.t({
																	code: "sector_effects.disruption",
																	msg: "Disruption",
																})}
																{' '}
																{ctx.t({ code: "sector_effects.cost", msg: "Cost" })}
															</th>
														</tr>
													</thead>
													<tbody>
														<tr key={index} className="hover:bg-gray-50">
															<td className="border border-gray-300 px-3 py-2">
																{item.sectorTreeDisplay}
															</td>
															<td className="border border-gray-300 px-3 py-2">
																{item.disRecSectorsWithDamage && item.disRecSectorsDamageRecoveryCost ? (
																	<div title="Sector damages recovery total cost">
																		{formatLocalizedCurrency(
																			item.disRecSectorsDamageRecoveryCost,
																			item.disRecSectorsDamageRecoveryCostCurrency,
																		)}
																	</div>
																) : item.disRecSectorsWithDamage && item.sectorDamagesRecoveryTotal && item.sectorDamagesRecoveryTotal > 0 ? (
																	<div title="Sector disaggregation damages recovery total cost">
																		{formatLocalizedCurrency(
																			item.sectorDamagesRecoveryTotal,
																			item.disRecSectorsDamageRecoveryCostCurrency,
																		)}
																	</div>
																) : (
																	<div>-</div>
																)}
															</td>
															<td className="border border-gray-300 px-3 py-2">
																{item.disRecSectorsWithDamage && item.disRecSectorsDamageCost ? (
																	<div title="Sector damages total cost">
																		{formatLocalizedCurrency(
																			item.disRecSectorsDamageCost,
																			item.disRecSectorsDamageCostCurrency,
																		)}
																	</div>
																) : item.disRecSectorsWithDamage && item.sectorDamagesTotal && item.sectorDamagesTotal > 0 ? (
																	<div title="Sector disaggregation damages total cost">
																		{formatLocalizedCurrency(
																			item.sectorDamagesTotal,
																			item.disRecSectorsDamageCostCurrency,
																		)}
																	</div>
																) : (
																	<div>-</div>
																)}
															</td>
															<td className="border border-gray-300 px-3 py-2">
																{item.disRecSectorsWithLosses && item.disRecSectorsLossesCost ? (
																	<div title="Sector losses total cost">
																		{formatLocalizedCurrency(
																			item.disRecSectorsLossesCost,
																			item.disRecSectorsLossesCostCurrency,
																		)}
																	</div>
																) : item.disRecSectorsWithLosses && item.sectorLossesTotal && item.sectorLossesTotal > 0 ? (
																	<div title="Sector disaggregation losses total cost">
																		{formatLocalizedCurrency(
																			item.sectorLossesTotal,
																			item.disRecSectorsLossesCostCurrency,
																		)}
																	</div>
																) : (
																	<div>-</div>
																)}
															</td>
															<td className="border border-gray-300 px-3 py-2">
																{item.disRecSectorsWithDisruption && item.sectorDisruptionTotal && item.sectorDisruptionTotal > 0 ? (
																	<div title="Sector disaggregation disruption response total cost">
																		{formatLocalizedCurrency(
																			item.sectorDisruptionTotal,
																			item.sectorDisruptionTotalCurrency,
																		)}
																	</div>
																) : (
																	<div>-</div>
																)}
															</td>
														</tr>
														<tr>
															<td colSpan={9} className="border border-gray-300 px-3 py-2">
																{(() => {
																	const disruptions = (ld.item.disasterRecord || []).filter(
																		(rec: any) =>
																			rec.kind === "disruption" &&
																			rec.sectorId === item.disRecSectorsSectorId,
																	);
																	const losses = (ld.item.disasterRecord || []).filter(
																		(rec: any) =>
																			rec.kind === "losses" &&
																			rec.sectorId === item.disRecSectorsSectorId,
																	);
																	const damages = (ld.item.disasterRecord || []).filter(
																		(rec: any) =>
																			rec.kind === "damages" &&
																			rec.sectorId === item.disRecSectorsSectorId,
																	);

																	if (
																		disruptions.length === 0 &&
																		losses.length === 0 &&
																		damages.length === 0
																	) {
																		return (
																			<div className="text-gray-500 text-sm">-</div>
																		);
																	}

																	return (
																		<div className="space-y-3">
																			{damages.length > 0 && (
																				<div>
																					<div className="mb-1 text-sm font-medium text-gray-700">
																						{ctx.t({ code: "sector_effects.damage", msg: "Damage" })}
																					</div>
																					<table className="w-full border border-gray-200 text-xs">
																						<thead className="bg-gray-100 text-gray-700">
																							<tr>
																								<th rowSpan={2} className="border border-gray-200 px-2 py-1 text-left">{ctx.t({ code: "assets.asset", msg: "Asset" })}</th>
																								<th colSpan={5} className="border border-gray-200 px-2 py-1 text-center">
																									{ctx.t({ code: "disaster_records.damages.partially_damaged", msg: "Partially damaged" })}
																								</th>
																								<th colSpan={5} className="border border-gray-200 px-2 py-1 text-center">
																									{ctx.t({ code: "disaster_records.damages.totally_destroyed", msg: "Totally destroyed" })}
																								</th>
																								<th colSpan={3} className="border border-gray-200 px-2 py-1 text-center">
																									{ctx.t({ code: "common.total", msg: "Total" })}
																								</th>
																							</tr>
																							<tr>
																								<th className="border border-gray-200 px-2 py-1 text-left">
																									{ctx.t({ code: "disaster_record.damages.amount_of_units", msg: "Amount of units" })}
																								</th>
																								<th className="border border-gray-200 px-2 py-1 text-left">
																									{ctx.t({ code: "disaster_record.damages.unit_repair_cost", msg: "Unit repair cost" })}
																								</th>
																								<th className="border border-gray-200 px-2 py-1 text-left">
																									{ctx.t({ code: "disaster_record.damages.total_repair_cost", msg: "Total repair cost" })}
																								</th>

																								<th className="border border-gray-200 px-2 py-1 text-left">
																									{ctx.t({ code: "disaster_record.damages.unit_recovery_cost", msg: "Unit recovery cost" })}
																								</th>
																								<th className="border border-gray-200 px-2 py-1 text-left">
																									{ctx.t({ code: "disaster_record.damages.total_recovery_cost", msg: "Total recovery cost" })}
																								</th>

																								<th className="border border-gray-200 px-2 py-1 text-left">
																									{ctx.t({ code: "disaster_record.damages.amount_of_units", msg: "Amount of units" })}
																								</th>
																								<th className="border border-gray-200 px-2 py-1 text-left">
																									{ctx.t({ code: "disaster_record.damages.unit_repair_cost", msg: "Unit repair cost" })}
																								</th>
																								<th className="border border-gray-200 px-2 py-1 text-left">
																									{ctx.t({ code: "disaster_record.damages.total_repair_cost", msg: "Total repair cost" })}
																								</th>

																								<th className="border border-gray-200 px-2 py-1 text-left">
																									{ctx.t({ code: "disaster_record.damages.unit_recovery_cost", msg: "Unit recovery cost" })}
																								</th>
																								<th className="border border-gray-200 px-2 py-1 text-left">
																									{ctx.t({ code: "disaster_record.damages.total_recovery_cost", msg: "Total recovery cost" })}
																								</th>

																								<th className="border border-gray-200 px-2 py-1 text-left">
																									{ctx.t({
																										code: "disaster_record.damages.total_damage_amount",
																										msg: "Total number of assets affected (partially damaged + totally destroyed)",
																									})}
																								</th>
																								<th className="border border-gray-200 px-2 py-1 text-left">
																									{ctx.t(
																										{
																											code: "disaster_record.damages.total_recovery",
																											msg: "Total recovery cost ({currency})",
																										},
																										{ currency: "" },
																									)}
																								</th>
																								<th className="border border-gray-200 px-2 py-1 text-left">
																									{ctx.t(
																										{
																											code: "disaster_record.damages.total_repair_replacement",
																											msg: "Total damage in monetary terms (total repair + replacement cost) ({currency})",
																										},
																										{ currency: "" },
																									)}
																								</th>
																							</tr>
																						</thead>
																						<tbody>
																							{damages.map((rec: any) => (
																								<tr key={`damages-${rec.id}`}>
																									<td className="border border-gray-200 px-2 py-1">{rec.assetName || "-"}</td>

																									<td className="border border-gray-200 px-2 py-1">
																										{[formatLocalizedNumber(rec.pdDamageAmount), getLossesUnitLabel(rec.unit)]
																											.filter((value) => value && value !== "-")
																											.join(" ") || "-"}
																									</td>
																									<td className="border border-gray-200 px-2 py-1">
																										{formatLocalizedCurrency(rec.pdRepairCostUnit, rec.pdRepairCostUnitCurrency)}
																									</td>
																									<td className="border border-gray-200 px-2 py-1">
																										{formatLocalizedCurrency(
																											rec.pdRepairCostTotal,
																											rec.pdRepairCostUnitCurrency,
																										)}
																									</td>
																									<td className="border border-gray-200 px-2 py-1">
																										{formatLocalizedCurrency(
																											rec.pdRecoveryCostUnit,
																											rec.pdRecoveryCostUnitCurrency,
																										)}
																									</td>
																									<td className="border border-gray-200 px-2 py-1">
																										{formatLocalizedCurrency(
																											rec.pdRecoveryCostTotal,
																											rec.pdRecoveryCostUnitCurrency,
																										)}
																									</td>

																									<td className="border border-gray-200 px-2 py-1">
																										{[formatLocalizedNumber(rec.tdDamageAmount), getLossesUnitLabel(rec.unit)]
																											.filter((value) => value && value !== "-")
																											.join(" ") || "-"}
																									</td>
																									<td className="border border-gray-200 px-2 py-1">
																										{formatLocalizedCurrency(rec.tdRepairCostUnit, rec.tdRepairCostUnitCurrency)}
																									</td>
																									<td className="border border-gray-200 px-2 py-1">
																										{formatLocalizedCurrency(
																											rec.tdRepairCostTotal,
																											rec.tdRepairCostUnitCurrency,
																										)}
																									</td>
																									<td className="border border-gray-200 px-2 py-1">
																										{formatLocalizedCurrency(
																											rec.tdRecoveryCostUnit,
																											rec.tdRecoveryCostUnitCurrency,
																										)}
																									</td>
																									<td className="border border-gray-200 px-2 py-1">
																										{formatLocalizedCurrency(
																											rec.tdRecoveryCostTotal,
																											rec.tdRecoveryCostUnitCurrency,
																										)}
																									</td>

																									
																									<td className="border border-gray-200 px-2 py-1">
																										{ rec.totalDamageAmount || "-" }
																									</td>
																									<td className="border border-gray-200 px-2 py-1">
																										{formatLocalizedCurrency(
																											rec.totalRecovery,
																											rec.tdRecoveryCostUnitCurrency,
																										)}
																									</td>
																									<td className="border border-gray-200 px-2 py-1">
																										{formatLocalizedCurrency(
																											rec.totalRepairReplacement,
																											rec.tdRecoveryCostUnitCurrency,
																										)}
																									</td>
																								</tr>
																							))}
																						</tbody>
																					</table>
																				</div>
																			)}

																			{losses.length > 0 && (
																				<div>
																					<div className="mb-1 text-sm font-medium text-gray-700">
																						{ctx.t({ code: "sector_effects.losses", msg: "Losses" })}
																					</div>
																					<table className="w-full border border-gray-200 text-xs">
																						<thead className="bg-gray-100 text-gray-700">
																							<tr>
																								<th rowSpan={2} className="border border-gray-200 px-2 py-1 text-left">{ctx.t({ code: "common.type", msg: "Type" })}</th>
																								<th rowSpan={2} className="border border-gray-200 px-2 py-1 text-left">{ctx.t({ code: "disaster_records.losses.related_to", msg: "Related To" })}</th>
																								<th rowSpan={2} className="border border-gray-200 px-2 py-1 text-left">{ctx.t({ code: "common.description", msg: "Description" })}</th>
																								<th colSpan={3} className="border border-gray-200 px-2 py-1 text-center bg-gray-200">{ctx.t({ code: "disaster_records.public", msg: "Public" })}</th>
																								<th colSpan={3} className="border border-gray-200 px-2 py-1 text-center bg-gray-300">{ctx.t({ code: "disaster_records.private", msg: "Private" })}</th>
																							</tr>
																							<tr>
																								<th className="border border-gray-200 px-2 py-1 text-left bg-gray-200">{ctx.t({ code: "disaster_record.losses.unit_value", msg: "Unit value" })}</th>
																								<th className="border border-gray-200 px-2 py-1 text-left bg-gray-200">{ctx.t({ code: "disaster_records.losses.cost_per_unit", msg: "Cost per unit" })}</th>
																								<th className="border border-gray-200 px-2 py-1 text-left bg-gray-200">{ctx.t({ code: "disaster_records.losses.total_cost", msg: "Total cost" })}</th>

																								<th className="border border-gray-200 px-2 py-1 text-left bg-gray-300">{ctx.t({ code: "disaster_record.losses.unit_value", msg: "Unit value" })}</th>
																								<th className="border border-gray-200 px-2 py-1 text-left bg-gray-300">{ctx.t({ code: "disaster_records.losses.cost_per_unit", msg: "Cost per unit" })}</th>
																								<th className="border border-gray-200 px-2 py-1 text-left bg-gray-300">{ctx.t({ code: "disaster_records.losses.total_cost", msg: "Total cost" })}</th>
																							</tr>
																						</thead>
																						<tbody>
																							{losses.map((rec: any) => (
																								<tr key={`losses-${rec.id}`}>
																									<td className="border border-gray-200 px-2 py-1">{getLossesTypeLabel(rec.type, rec.sectorIsAgriculture)}</td>
																									<td className="border border-gray-200 px-2 py-1">
																										{getLossesRelatedToLabel(
																											rec.relatedTo,
																											rec.type,
																											rec.sectorIsAgriculture,
																										)}
																									</td>
																									<td className="border border-gray-200 px-2 py-1">
																										{renderMultilineText(rec.description)}
																									</td>
																									<td className="border border-gray-200 px-2 py-1">
																										{[formatLocalizedNumber(rec.publicUnits), getLossesUnitLabel(rec.publicUnit)]
																											.filter((value) => value && value !== "-")
																											.join(" ") || "-"}
																									</td>
																									<td className="border border-gray-200 px-2 py-1">
																										{formatLocalizedCurrency(
																											rec.publicCostUnit,
																											rec.publicCostUnitCurrency,
																										)}
																									</td>
																									<td className="border border-gray-200 px-2 py-1">
																										{formatLocalizedCurrency(
																											rec.publicCostTotal,
																											rec.publicCostUnitCurrency,
																										)}
																									</td>
																									<td className="border border-gray-200 px-2 py-1">
																										{[formatLocalizedNumber(rec.privateUnits), getLossesUnitLabel(rec.privateUnit)]
																											.filter((value) => value && value !== "-")
																											.join(" ") || "-"}
																									</td>
																									<td className="border border-gray-200 px-2 py-1">
																										{formatLocalizedCurrency(
																											rec.privateCostUnit,
																											rec.privateCostUnitCurrency,
																										)}
																									</td>
																									<td className="border border-gray-200 px-2 py-1">
																										{formatLocalizedCurrency(
																											rec.privateCostTotal,
																											rec.privateCostUnitCurrency,
																										)}
																									</td>
																								</tr>
																							))}
																						</tbody>
																					</table>
																				</div>
																			)}

																			{disruptions.length > 0 && (
																				<div>
																					<div className="mb-1 text-sm font-medium text-gray-700">
																						{ctx.t({ code: "sector_effects.disruption", msg: "Disruption" })}
																					</div>
																					<table className="w-full border border-gray-200 text-xs">
																						<thead className="bg-gray-100 text-gray-700">
																							<tr>
																								<th className="border border-gray-200 px-2 py-1 text-left">{ctx.t({ code: "disruption.duration_days", msg: "Duration (days)" })}</th>
																								<th className="border border-gray-200 px-2 py-1 text-left">{ctx.t({ code: "disruption.duration_hours", msg: "Duration (hours)" })}</th>
																								<th className="border border-gray-200 px-2 py-1 text-left">{ctx.t({ code: "disruption.users_affected", msg: "Users affected" })}</th>
																								<th className="border border-gray-200 px-2 py-1 text-left">{ctx.t({ code: "disruption.people_affected", msg: "People affected" })}</th>
																								<th className="border border-gray-200 px-2 py-1 text-left">{ctx.t({ code: "disruption.response_operation", msg: "Response operation" })}</th>
																								<th className="border border-gray-200 px-2 py-1 text-left">{ctx.t({ code: "common.description", msg: "Description" })}</th>
																								<th className="border border-gray-200 px-2 py-1 text-left">{ctx.t({ code: "sector_effects.cost", msg: "Cost" })}</th>
																							</tr>
																						</thead>
																						<tbody>
																							{disruptions.map((rec: any) => (
																								<tr key={`disruption-${rec.id}`}>
																									<td className="border border-gray-200 px-2 py-1">{rec.durationDays ?? "-"}</td>
																									<td className="border border-gray-200 px-2 py-1">{rec.durationHours ?? "-"}</td>
																									<td className="border border-gray-200 px-2 py-1">{formatLocalizedNumber(rec.usersAffected)}</td>
																									<td className="border border-gray-200 px-2 py-1">{formatLocalizedNumber(rec.peopleAffected)}</td>
																									<td className="border border-gray-200 px-2 py-1">{renderMultilineText(rec.responseOperation) || "-"}</td>
																									<td className="border border-gray-200 px-2 py-1">{renderMultilineText(rec.comment) || "-"}</td>
																									<td className="border border-gray-200 px-2 py-1">{formatLocalizedCurrency(rec.responseCost, rec.responseCurrency)}</td>
																								</tr>
																							))}
																						</tbody>
																					</table>
																				</div>
																			)}
																		</div>
																	);
																})()}
															</td>
														</tr>
													</tbody>
												</table>
										</>))}
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
