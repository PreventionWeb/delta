import { Fragment } from "react";
import { ViewContext } from "~/frontend/context";
import {
	lossesTypeCategoryEnum,
	typeEnumAgriculture,
	typeEnumNotAgriculture,
} from "~/frontend/losses_enums";
import { unitName } from "~/frontend/unit_picker";
import { getCurrencySymbol } from "~/utils/currency";

type DisasterRecordEntry = {
	kind: string;
	sectorId?: string | null;
	[key: string]: unknown;
};

type SectorItem = {
	catId?: string | null;
	disRecSectorsSectorId?: string | null;
	sectorTreeDisplay?: string | null;
	disRecSectorsWithDamage?: boolean | null;
	disRecSectorsDamageRecoveryCost?: number | null;
	disRecSectorsDamageRecoveryCostCurrency?: string | null;
	sectorDamagesRecoveryTotal?: number | null;
	disRecSectorsDamageCost?: number | null;
	disRecSectorsDamageCostCurrency?: string | null;
	sectorDamagesTotal?: number | null;
	disRecSectorsWithLosses?: boolean | null;
	disRecSectorsLossesCost?: number | null;
	disRecSectorsLossesCostCurrency?: string | null;
	sectorLossesTotal?: number | null;
	disRecSectorsWithDisruption?: boolean | null;
	sectorDisruptionTotal?: number | null;
	sectorDisruptionTotalCurrency?: string | null;
};

type Props = {
	item: SectorItem;
	disasterRecord: DisasterRecordEntry[];
	ctx: ViewContext;
};

function formatLocalizedNumber(value: string | number | null | undefined): string {
	if (value === null || value === undefined || value === "") return "-";
	const n = typeof value === "string" ? Number.parseFloat(value) : value;
	if (!Number.isFinite(n)) return "-";
	return n.toLocaleString(navigator.language, { minimumFractionDigits: 0 });
}

function formatLocalizedCurrency(
	value: string | number | null | undefined,
	currencyCode: string | null | undefined,
): string {
	const formatted = formatLocalizedNumber(value);
	if (formatted === "-") return "-";
	if (!currencyCode) return formatted;
	return `${getCurrencySymbol(currencyCode)} ${formatted}`;
}

function getLossesUnitLabel(unitKey: string | null | undefined): string {
	if (!unitKey) return "-";
	return unitName(unitKey);
}

function renderMultilineText(value: string | null | undefined) {
	if (!value) return "-";
	return value.split(/\r?\n/).map((line, index) => (
		<Fragment key={`${index}-${line}`}>
			{index > 0 && <br />}
			<span>{line}</span>
		</Fragment>
	));
}

export function SectorEffectsTable({ item, disasterRecord, ctx }: Props) {
	const getLossesTypeLabel = (
		typeKey: string | null | undefined,
		sectorIsAgriculture: boolean | null | undefined,
	) => {
		if (!typeKey) return "-";
		const entry = lossesTypeCategoryEnum(ctx, Boolean(sectorIsAgriculture)).find(
			(e) => e.key === typeKey,
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
		const filtered = typeKey ? entries.filter((e) => e.type === typeKey) : entries;
		const match =
			filtered.find((e) => e.key === relatedToKey) ||
			entries.find((e) => e.key === relatedToKey);
		return match?.label || relatedToKey;
	};

	const disruptions = disasterRecord.filter(
		(rec) => rec.kind === "disruption" && rec.sectorId === item.disRecSectorsSectorId,
	);
	const losses = disasterRecord.filter(
		(rec) => rec.kind === "losses" && rec.sectorId === item.disRecSectorsSectorId,
	);
	const damages = disasterRecord.filter(
		(rec) => rec.kind === "damages" && rec.sectorId === item.disRecSectorsSectorId,
	);

	return (
		<table className="w-full border border-gray-300 text-sm">
			<thead className="bg-gray-700 text-gray-100">
				<tr>
					<th className="border border-gray-300 px-3 py-2 font-medium text-left">
						{ctx.t({ code: "sector_effects.sector", msg: "Sector" })}
					</th>
					<th className="border border-gray-300 px-3 py-2 font-medium text-left">
						{ctx.t({ code: "sector_effects.damage", msg: "Damage" })}
						{' '}
						{ctx.t({ code: "recovery_cost.sector", msg: "Recovery cost" })}
					</th>
					<th className="border border-gray-300 px-3 py-2 font-medium text-left">
						{ctx.t({ code: "sector_effects.damage", msg: "Damage" })}
						{' '}
						{ctx.t({ code: "sector_effects.cost", msg: "Cost" })}
					</th>
					<th className="border border-gray-300 px-3 py-2 font-medium text-left">
						{ctx.t({ code: "sector_effects.losses", msg: "Losses" })}
						{' '}
						{ctx.t({ code: "sector_effects.cost", msg: "Cost" })}
					</th>
					<th className="border border-gray-300 px-3 py-2 font-medium text-left">
						{ctx.t({ code: "sector_effects.disruption", msg: "Disruption" })}
						{' '}
						{ctx.t({ code: "sector_effects.cost", msg: "Cost" })}
					</th>
				</tr>
			</thead>
			<tbody>
				<tr className="hover:bg-gray-50">
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
						{disruptions.length === 0 && losses.length === 0 && damages.length === 0 ? (
							<div className="text-gray-500 text-sm">-</div>
						) : (
							<div className="space-y-3">
								{damages.length > 0 && (
									<div>
										<div className="mb-1 text-sm font-medium text-gray-700">
											{ctx.t({ code: "sector_effects.damage", msg: "Damage" })}
										</div>
										<div className="overflow-x-auto">
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
																{ code: "disaster_record.damages.total_recovery", msg: "Total recovery cost ({currency})" },
																{ currency: "" },
															)}
														</th>
														<th className="border border-gray-200 px-2 py-1 text-left">
															{ctx.t(
																{ code: "disaster_record.damages.total_repair_replacement", msg: "Total damage in monetary terms (total repair + replacement cost) ({currency})" },
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
																	.filter((v) => v && v !== "-").join(" ") || "-"}
															</td>
															<td className="border border-gray-200 px-2 py-1">
																{formatLocalizedCurrency(rec.pdRepairCostUnit, rec.pdRepairCostUnitCurrency)}
															</td>
															<td className="border border-gray-200 px-2 py-1">
																{formatLocalizedCurrency(rec.pdRepairCostTotal, rec.pdRepairCostUnitCurrency)}
															</td>
															<td className="border border-gray-200 px-2 py-1">
																{formatLocalizedCurrency(rec.pdRecoveryCostUnit, rec.pdRecoveryCostUnitCurrency)}
															</td>
															<td className="border border-gray-200 px-2 py-1">
																{formatLocalizedCurrency(rec.pdRecoveryCostTotal, rec.pdRecoveryCostUnitCurrency)}
															</td>
															<td className="border border-gray-200 px-2 py-1">
																{[formatLocalizedNumber(rec.tdDamageAmount), getLossesUnitLabel(rec.unit)]
																	.filter((v) => v && v !== "-").join(" ") || "-"}
															</td>
															<td className="border border-gray-200 px-2 py-1">
																{formatLocalizedCurrency(rec.tdRepairCostUnit, rec.tdRepairCostUnitCurrency)}
															</td>
															<td className="border border-gray-200 px-2 py-1">
																{formatLocalizedCurrency(rec.tdRepairCostTotal, rec.tdRepairCostUnitCurrency)}
															</td>
															<td className="border border-gray-200 px-2 py-1">
																{formatLocalizedCurrency(rec.tdRecoveryCostUnit, rec.tdRecoveryCostUnitCurrency)}
															</td>
															<td className="border border-gray-200 px-2 py-1">
																{formatLocalizedCurrency(rec.tdRecoveryCostTotal, rec.tdRecoveryCostUnitCurrency)}
															</td>
															<td className="border border-gray-200 px-2 py-1">
																{rec.totalDamageAmount || "-"}
															</td>
															<td className="border border-gray-200 px-2 py-1">
																{formatLocalizedCurrency(rec.totalRecovery, rec.tdRecoveryCostUnitCurrency)}
															</td>
															<td className="border border-gray-200 px-2 py-1">
																{formatLocalizedCurrency(rec.totalRepairReplacement, rec.tdRecoveryCostUnitCurrency)}
															</td>
														</tr>
													))}
												</tbody>
											</table>
										</div>
									</div>
								)}

								{losses.length > 0 && (
									<div>
										<div className="mb-1 text-sm font-medium text-gray-700">
											{ctx.t({ code: "sector_effects.losses", msg: "Losses" })}
										</div>
										<div className="overflow-x-auto">
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
																{getLossesRelatedToLabel(rec.relatedTo, rec.type, rec.sectorIsAgriculture)}
															</td>
															<td className="border border-gray-200 px-2 py-1">
																{renderMultilineText(rec.description)}
															</td>
															<td className="border border-gray-200 px-2 py-1">
																{[formatLocalizedNumber(rec.publicUnits), getLossesUnitLabel(rec.publicUnit)]
																	.filter((v) => v && v !== "-").join(" ") || "-"}
															</td>
															<td className="border border-gray-200 px-2 py-1">
																{formatLocalizedCurrency(rec.publicCostUnit, rec.publicCostUnitCurrency)}
															</td>
															<td className="border border-gray-200 px-2 py-1">
																{formatLocalizedCurrency(rec.publicCostTotal, rec.publicCostUnitCurrency)}
															</td>
															<td className="border border-gray-200 px-2 py-1">
																{[formatLocalizedNumber(rec.privateUnits), getLossesUnitLabel(rec.privateUnit)]
																	.filter((v) => v && v !== "-").join(" ") || "-"}
															</td>
															<td className="border border-gray-200 px-2 py-1">
																{formatLocalizedCurrency(rec.privateCostUnit, rec.privateCostUnitCurrency)}
															</td>
															<td className="border border-gray-200 px-2 py-1">
																{formatLocalizedCurrency(rec.privateCostTotal, rec.privateCostUnitCurrency)}
															</td>
														</tr>
													))}
												</tbody>
											</table>
										</div>
									</div>
								)}

								{disruptions.length > 0 && (
									<div>
										<div className="mb-1 text-sm font-medium text-gray-700">
											{ctx.t({ code: "sector_effects.disruption", msg: "Disruption" })}
										</div>
										<div className="overflow-x-auto">
											<table className="w-full border border-gray-200 text-xs">
												<thead className="bg-gray-100 text-gray-700">
													<tr>
														<th className="border border-gray-200 px-2 py-1 text-left">{ctx.t({ code: "disruption.duration_days", msg: "Duration (days)" })}</th>
														<th className="border border-gray-200 px-2 py-1 text-left">{ctx.t({ code: "disruption.duration_hours", msg: "Duration (hours)" })}</th>
														<th className="border border-gray-200 px-2 py-1 text-left">{ctx.t({ code: "disruption.users_affected", msg: "Users affected" })}</th>
														<th className="border border-gray-200 px-2 py-1 text-left">{ctx.t({ code: "disruption.people_affected", msg: "People affected" })}</th>
														<th className="border border-gray-200 px-2 py-1 text-left">{ctx.t({ code: "disruption.response_operation", msg: "Response operation" })}</th>
														<th className="border border-gray-200 px-2 py-1 text-left">{ctx.t({ code: "common.description", msg: "Description" })}</th>
														<th className="border border-gray-200 px-2 py-1 text-left">{ctx.t({ code: "analysis.response_cost", msg: "Response cost" })}</th>
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
									</div>
								)}
							</div>
						)}
					</td>
				</tr>
			</tbody>
		</table>
	);
}
