import { relations } from "drizzle-orm";
import {
	pgTable,
	uuid,
	AnyPgColumn,
	text,
	jsonb,
	unique,
	index,
	time,
	foreignKey,
} from "drizzle-orm/pg-core";
import {
	createdUpdatedTimestamps,
	approvalFields,
	approvalWorkflowFields,
	apiImportIdField,
	hipRelationColumnsOptional,
	zeroText,
	ourBigint,
	zeroBool,
	ourMoney,
} from "../../utils/drizzleUtil";
import { eventTable } from "./eventTable";
import { hazardousEventTable } from "./hazardousEventTable";
import { countryAccountsTable } from "./countryAccountsTable";
import { hipHazardTable } from "./hipHazardTable";
import { hipClusterTable } from "./hipClusterTable";
import { hipTypeTable } from "./hipTypeTable";
import { userTable } from "./userTable";
import { organizationTable } from "./organizationTable";

export const disasterEventTable = pgTable(
	"disaster_event",
	{
		...createdUpdatedTimestamps,
		...approvalFields,
		...approvalWorkflowFields,
		...apiImportIdField(),
		...hipRelationColumnsOptional(),
		countryAccountsId: uuid("country_accounts_id").references(
			() => countryAccountsTable.id,
			{
				onDelete: "cascade",
			},
		),
		id: uuid("id")
			.primaryKey()
			.references((): AnyPgColumn => eventTable.id),
		hazardousEventId: uuid("hazardous_event_id").references(
			(): AnyPgColumn => hazardousEventTable.id,
		),
		disasterEventId: uuid("disaster_event_id").references(
			(): AnyPgColumn => disasterEventTable.id,
		),
		recordingOrganizationId: uuid("recording_organization_id"),
		nationalDisasterId: zeroText("national_disaster_id"),
		// multiple other ids
		otherId1: zeroText("other_id1"),
		otherId2: zeroText("other_id2"),
		otherId3: zeroText("other_id3"),
		nameNational: zeroText("name_national"),
		glide: zeroText("glide"),
		nameGlobalOrRegional: zeroText("name_global_or_regional"),
		// yyyy or yyyy-mm or yyyy-mm-dd
		startDate: zeroText("start_date"),
		startDateTime: time("start_date_time"),
		endDate: zeroText("end_date"),
		endDateTime: time("end_date_time"),
		startDateLocal: text("start_date_local"),
		endDateLocal: text("end_date_local"),
		durationDays: ourBigint("duration_days"),

		hadOfficialWarningOrWeatherAdvisory: zeroBool(
			"had_official_warning_or_weather_advisory",
		),
		officialWarningAffectedAreas: zeroText("official_warning_affected_areas"),

		dataSource: zeroText("data_source"),
		effectsTotalUsd: ourMoney("effects_total_usd"),
		nonEconomicLosses: zeroText("non_economic_losses"),
		damagesSubtotalLocalCurrency: ourMoney("damages_subtotal_local_currency"),
		lossesSubtotalUSD: ourMoney("losses_subtotal_usd"),
		responseOperationsDescription: zeroText("response_operations_description"),
		responseOperationsCostsLocalCurrency: ourMoney(
			"response_operations_costs_local_currency",
		),
		responseCostTotalLocalCurrency: ourMoney(
			"response_cost_total_local_currency",
		),
		responseCostTotalUSD: ourMoney("response_cost_total_usd"),
		humanitarianNeedsDescription: zeroText("humanitarian_needs_description"),
		humanitarianNeedsLocalCurrency: ourMoney(
			"humanitarian_needs_local_currency",
		),
		humanitarianNeedsUSD: ourMoney("humanitarian_needs_usd"),

		rehabilitationCostsLocalCurrencyCalc: ourMoney(
			"rehabilitation_costs_local_currency_calc",
		),
		rehabilitationCostsLocalCurrencyOverride: ourMoney(
			"rehabilitation_costs_local_currency_override",
		),
		//rehabilitationCostsUSD: ourMoney("rehabilitation_costs_usd"),
		repairCostsLocalCurrencyCalc: ourMoney("repair_costs_local_currency_calc"),
		repairCostsLocalCurrencyOverride: ourMoney(
			"repair_costs_local_currency_override",
		),
		//repairCostsUSD: ourMoney("repair_costs_usd"),
		replacementCostsLocalCurrencyCalc: ourMoney(
			"replacement_costs_local_currency_calc",
		),
		replacementCostsLocalCurrencyOverride: ourMoney(
			"replacement_costs_local_currency_override",
		),
		//replacementCostsUSD: ourMoney("replacement_costs_usd"),
		recoveryNeedsLocalCurrencyCalc: ourMoney(
			"recovery_needs_local_currency_calc",
		),
		recoveryNeedsLocalCurrencyOverride: ourMoney(
			"recovery_needs_local_currency_override",
		),
		//recoveryNeedsUSD: ourMoney("recovery_needs_usd"),

		legacyData: jsonb("legacy_data"),
	},
	(table) => [
		// Composite unique constraint for tenant-scoped api_import_id
		unique("disaster_event_api_import_id_tenant_unique").on(
			table.apiImportId,
			table.countryAccountsId,
		),
		index("disaster_event_hazardous_event_id_idx").on(table.hazardousEventId),
		index("disaster_event_disaster_event_id_idx").on(table.disasterEventId),
		foreignKey({
			columns: [table.recordingOrganizationId, table.countryAccountsId],
			foreignColumns: [
				organizationTable.id,
				organizationTable.countryAccountsId,
			],
			name: "fk_disaster_event_recording_org",
		}),
	],
);

export type SelectDisasterEvent = typeof disasterEventTable.$inferSelect;
export type InsertDisasterEvent = typeof disasterEventTable.$inferInsert;

export const disasterEventTableConstrains = {
	hazardousEventId: "disaster_event_hazardous_event_id_hazardous_event_id_fk",
	countryAccountsId:
		"disaster_event_country_accounts_id_country_accounts_id_fk",
};

export const disasterEventRel = relations(disasterEventTable, ({ one }) => ({
	event: one(eventTable, {
		fields: [disasterEventTable.id],
		references: [eventTable.id],
	}),
	countryAccount: one(countryAccountsTable, {
		fields: [disasterEventTable.countryAccountsId],
		references: [countryAccountsTable.id],
	}),
	hazardousEvent: one(hazardousEventTable, {
		fields: [disasterEventTable.hazardousEventId],
		references: [hazardousEventTable.id],
	}),
	disasterEvent: one(disasterEventTable, {
		fields: [disasterEventTable.disasterEventId],
		references: [disasterEventTable.id],
	}),
	hipHazard: one(hipHazardTable, {
		fields: [disasterEventTable.hipHazardId],
		references: [hipHazardTable.id],
	}),
	hipCluster: one(hipClusterTable, {
		fields: [disasterEventTable.hipClusterId],
		references: [hipClusterTable.id],
	}),
	hipType: one(hipTypeTable, {
		fields: [disasterEventTable.hipTypeId],
		references: [hipTypeTable.id],
	}),
	userSubmittedBy: one(userTable, {
		fields: [disasterEventTable.submittedByUserId],
		references: [userTable.id],
	}),
	userValidatedBy: one(userTable, {
		fields: [disasterEventTable.validatedByUserId],
		references: [userTable.id],
	}),
	userPublishedBy: one(userTable, {
		fields: [disasterEventTable.publishedByUserId],
		references: [userTable.id],
	}),
}));
