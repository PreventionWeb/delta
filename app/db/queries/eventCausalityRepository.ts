import { and, eq, sql } from "drizzle-orm";
import { dr, Tx } from "~/db.server";
import { disasterEventTable } from "~/drizzle/schema/disasterEventTable";
import { eventCausalityTable } from "~/drizzle/schema/eventCausalityTable";

type InsertEventCausality = typeof eventCausalityTable.$inferInsert;

export const EventCausalityRepository = {
	createMany: (data: InsertEventCausality[], tx?: Tx) => {
		return (tx ?? dr)
			.insert(eventCausalityTable)
			.values(data)
			.returning()
			.execute();
	},
	deleteById: (id: string, tx?: Tx) => {
		return (tx ?? dr)
			.delete(eventCausalityTable)
			.where(eq(eventCausalityTable.id, id));
	},
	getLinkedHazardousEventIds: async (eventId: string, tx?: Tx) => {
		const db = tx ?? dr;
		const [linkedTriggeringRows, linkedTriggeredRows] = await Promise.all([
			db
				.select({
					linkedId: eventCausalityTable.triggeringHazardousEventId,
				})
				.from(eventCausalityTable)
				.where(
					and(
						eq(eventCausalityTable.triggeringEntityType, "HE"),
						eq(eventCausalityTable.triggeredEntityType, "DE"),
						eq(eventCausalityTable.triggeredDisasterEventId, eventId),
					),
				),
			db
				.select({
					linkedId: eventCausalityTable.triggeredHazardousEventId,
				})
				.from(eventCausalityTable)
				.where(
					and(
						eq(eventCausalityTable.triggeringEntityType, "DE"),
						eq(eventCausalityTable.triggeredEntityType, "HE"),
						eq(eventCausalityTable.triggeringDisasterEventId, eventId),
					),
				),
		]);

		return {
			linkedTriggeringHazardousEventIds: linkedTriggeringRows
				.map((row) => row.linkedId)
				.filter((id): id is string => Boolean(id)),
			linkedTriggeredHazardousEventIds: linkedTriggeredRows
				.map((row) => row.linkedId)
				.filter((id): id is string => Boolean(id)),
		};
	},
	getLinkedDisasterEventIds: async (eventId: string, tx?: Tx) => {
		const { currentTriggeringRows, currentTriggeredRows } =
			await EventCausalityRepository.listCurrentDisasterEventLinks(eventId, tx);

		return {
			linkedTriggeringDisasterEventIds: currentTriggeringRows
				.map((row) => row.linkedId)
				.filter((id): id is string => Boolean(id)),
			linkedTriggeredDisasterEventIds: currentTriggeredRows
				.map((row) => row.linkedId)
				.filter((id): id is string => Boolean(id)),
		};
	},
	listCurrentDisasterEventLinks: async (eventId: string, tx?: Tx) => {
		const db = tx ?? dr;

		const [currentTriggeringRows, currentTriggeredRows] = await Promise.all([
			db
				.select({
					id: eventCausalityTable.id,
					linkedId: eventCausalityTable.triggeringDisasterEventId,
				})
				.from(eventCausalityTable)
				.where(
					and(
						eq(eventCausalityTable.triggeringEntityType, "DE"),
						eq(eventCausalityTable.triggeredEntityType, "DE"),
						eq(eventCausalityTable.triggeredDisasterEventId, eventId),
					),
				),
			db
				.select({
					id: eventCausalityTable.id,
					linkedId: eventCausalityTable.triggeredDisasterEventId,
				})
				.from(eventCausalityTable)
				.where(
					and(
						eq(eventCausalityTable.triggeringEntityType, "DE"),
						eq(eventCausalityTable.triggeredEntityType, "DE"),
						eq(eventCausalityTable.triggeringDisasterEventId, eventId),
					),
				),
		]);

		return { currentTriggeringRows, currentTriggeredRows };
	},
	getDescendantDisasterEventIds: async (
		eventId: string,
		countryAccountsId: string,
		tx?: Tx,
	) => {
		const db = tx ?? dr;
		const descendantsResult = await db.execute(sql`
			WITH RECURSIVE descendants AS (
				SELECT ${eventCausalityTable.triggeredDisasterEventId} AS id
				FROM ${eventCausalityTable}
				INNER JOIN ${disasterEventTable}
					ON ${disasterEventTable.id} = ${eventCausalityTable.triggeredDisasterEventId}
				WHERE
					${eventCausalityTable.triggeringEntityType} = 'DE'
					AND ${eventCausalityTable.triggeredEntityType} = 'DE'
					AND ${eventCausalityTable.triggeringDisasterEventId} = ${eventId}
					AND ${disasterEventTable.countryAccountsId} = ${countryAccountsId}

				UNION

				SELECT ${eventCausalityTable.triggeredDisasterEventId} AS id
				FROM ${eventCausalityTable}
				INNER JOIN descendants
					ON ${eventCausalityTable.triggeringDisasterEventId} = descendants.id
				INNER JOIN ${disasterEventTable}
					ON ${disasterEventTable.id} = ${eventCausalityTable.triggeredDisasterEventId}
				WHERE
					${eventCausalityTable.triggeringEntityType} = 'DE'
					AND ${eventCausalityTable.triggeredEntityType} = 'DE'
					AND ${disasterEventTable.countryAccountsId} = ${countryAccountsId}
			)
			SELECT DISTINCT id
			FROM descendants
			WHERE id IS NOT NULL
		`);

		return new Set(
			descendantsResult.rows
				.map((row) => String((row as { id?: string | null }).id || ""))
				.filter(Boolean),
		);
	},
	getAncestorDisasterEventIds: async (
		eventId: string,
		countryAccountsId: string,
		tx?: Tx,
	) => {
		const db = tx ?? dr;
		const ancestorsResult = await db.execute(sql`
			WITH RECURSIVE ancestors AS (
				SELECT ${eventCausalityTable.triggeringDisasterEventId} AS id
				FROM ${eventCausalityTable}
				INNER JOIN ${disasterEventTable}
					ON ${disasterEventTable.id} = ${eventCausalityTable.triggeringDisasterEventId}
				WHERE
					${eventCausalityTable.triggeringEntityType} = 'DE'
					AND ${eventCausalityTable.triggeredEntityType} = 'DE'
					AND ${eventCausalityTable.triggeredDisasterEventId} = ${eventId}
					AND ${disasterEventTable.countryAccountsId} = ${countryAccountsId}

				UNION

				SELECT ${eventCausalityTable.triggeringDisasterEventId} AS id
				FROM ${eventCausalityTable}
				INNER JOIN ancestors
					ON ${eventCausalityTable.triggeredDisasterEventId} = ancestors.id
				INNER JOIN ${disasterEventTable}
					ON ${disasterEventTable.id} = ${eventCausalityTable.triggeringDisasterEventId}
				WHERE
					${eventCausalityTable.triggeringEntityType} = 'DE'
					AND ${eventCausalityTable.triggeredEntityType} = 'DE'
					AND ${disasterEventTable.countryAccountsId} = ${countryAccountsId}
			)
			SELECT DISTINCT id
			FROM ancestors
			WHERE id IS NOT NULL
		`);

		return new Set(
			ancestorsResult.rows
				.map((row) => String((row as { id?: string | null }).id || ""))
				.filter(Boolean),
		);
	},
};
