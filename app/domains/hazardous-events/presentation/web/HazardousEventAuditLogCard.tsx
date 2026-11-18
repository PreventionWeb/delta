import { useTranslation } from "react-i18next";
import { Card } from "~/design-system/components/Card";
import { Table } from "~/design-system/components/Table";
import { TableColumn } from "~/design-system/components/TableColumn";
import { TableRow } from "~/design-system/components/TableRow";
import { TableCell } from "~/design-system/components/TableCell";
import type { HazardousEventDetailDto } from "~/domains/hazardous-events/application/dto/HazardousEventDetailDto";
import { translateAuditLogAction } from "./translateAuditLogAction";

export interface HazardousEventAuditLogCardProps {
	auditLog: HazardousEventDetailDto["auditLog"];
}

/** CA's own table replacing `~/components/AuditLogHistory` (Decision 15, Fix 8); Date/Time unchanged (`toDateString()`/`toTimeString()`). */
export function HazardousEventAuditLogCard({
	auditLog,
}: HazardousEventAuditLogCardProps) {
	const { t } = useTranslation("hazardous-events");

	return (
		<Card
			title={t("detail.sections.audit_log_history")}
			icon="pi-history"
			titleSize="lg"
		>
			{auditLog.length === 0 ? (
				<p>{t("detail.audit_log.empty")}</p>
			) : (
				<Table
					aria-label={t("detail.sections.audit_log_history")}
					header={
						<>
							<TableColumn id="action-taken" isRowHeader padding="cozy">
								{t("detail.audit_log.columns.action_taken")}
							</TableColumn>
							<TableColumn id="by" padding="cozy">
								{t("detail.audit_log.columns.by")}
							</TableColumn>
							<TableColumn id="organisation" padding="cozy">
								{t("detail.audit_log.columns.organisation")}
							</TableColumn>
							<TableColumn id="date" padding="cozy">
								{t("detail.audit_log.columns.date")}
							</TableColumn>
							<TableColumn id="time" padding="cozy">
								{t("detail.audit_log.columns.time")}
							</TableColumn>
						</>
					}
				>
					{auditLog.map((entry) => {
						const timestamp = new Date(entry.timestamp);
						return (
							<TableRow id={entry.id} key={entry.id}>
								<TableCell padding="cozy">
									{translateAuditLogAction(entry.action, t)}
								</TableCell>
								<TableCell padding="cozy">{entry.actorName}</TableCell>
								<TableCell padding="cozy">{null}</TableCell>
								<TableCell padding="cozy">{timestamp.toDateString()}</TableCell>
								<TableCell padding="cozy">{timestamp.toTimeString()}</TableCell>
							</TableRow>
						);
					})}
				</Table>
			)}
		</Card>
	);
}
