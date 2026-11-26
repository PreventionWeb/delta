import type { ILogger } from "~/shared/logging/ILogger";
import type { IHazardousEventRepository } from "../ports/IHazardousEventRepository";
import { EXPORT_HEADER } from "../csv/hazardousEventCsvColumns";
import { exportRowValues } from "../csv/exportRowCells";

/** No role: every ViewData role exports every row of the tenant, as legacy (OD-9, W1). */
export interface ExportHazardousEventsCsvQuery {
	tenantId: string;
}

export interface HazardousEventsCsvExport {
	header: readonly string[];
	/** Formatted but unguarded; the serializer applies the formula guard (D8). */
	rows: string[][];
	count: number;
}

/** Legacy export header plus `parent`, values from the CA model with legacy fallbacks (D9). */
export class ExportHazardousEventsCsvUseCase {
	constructor(
		private readonly logger: ILogger,
		private readonly hazardousEventRepository: Pick<
			IHazardousEventRepository,
			"findExportRows"
		>,
	) {}

	async execute(
		query: ExportHazardousEventsCsvQuery,
	): Promise<HazardousEventsCsvExport> {
		const exportRows = await this.hazardousEventRepository.findExportRows(
			query.tenantId,
		);
		const rows = exportRows.map(exportRowValues);
		this.logger.info({
			msg: "hazardous_events.csv_exported",
			tenantId: query.tenantId,
			count: rows.length,
		});
		return { header: EXPORT_HEADER, rows, count: rows.length };
	}
}
