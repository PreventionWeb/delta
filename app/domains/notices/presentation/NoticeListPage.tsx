import { DataTable } from "primereact/datatable";
import { Column } from "primereact/column";
import { Button } from "primereact/button";
import { useTranslation } from "react-i18next";
import type { NoticeDto } from "~/domains/notices/application/dto/NoticeDto";
import type { PageProps } from "~/frontend/page-props";
import { useViewContext } from "~/frontend/context";
import { formatDateDisplay } from "~/utils/date";
import { LangLink } from "~/utils/link";

export function NoticeListPage({ data }: PageProps<NoticeDto[]>) {
	const { lang } = useViewContext();
	const { t } = useTranslation("notices");
	const { t: tCommon } = useTranslation("common");

	return (
		<DataTable
			value={data}
			dataKey="id"
			stripedRows
			size="small"
			className="w-full"
			tableStyle={{ tableLayout: "fixed" }}
			emptyMessage={t("list.empty")}
		>
			<Column
				field="title"
				header={t("list.columns.title")}
				body={(n: NoticeDto) => (
					<span className="block truncate" title={n.title}>
						{n.title}
					</span>
				)}
			/>
			<Column
				field="isPublished"
				header={t("list.columns.status")}
				style={{ width: "12%" }}
				body={(n: NoticeDto) =>
					n.isPublished ? t("status.published") : t("status.draft")
				}
			/>
			<Column
				field="publishedAt"
				header={t("list.columns.published_at")}
				style={{ width: "15%" }}
				body={(n: NoticeDto) =>
					n.publishedAt ? formatDateDisplay(n.publishedAt) : "—"
				}
			/>
			<Column
				field="updatedAt"
				header={t("list.columns.updated_at")}
				style={{ width: "15%" }}
				body={(n: NoticeDto) => formatDateDisplay(n.updatedAt)}
			/>
			<Column
				header={t("list.columns.actions")}
				style={{ width: "8%" }}
				body={(n: NoticeDto) => (
					<LangLink lang={lang} to={`/notices/${n.id}`}>
						<Button
							type="button"
							icon="pi pi-eye"
							text
							size="small"
							aria-label={tCommon("view")}
						/>
					</LangLink>
				)}
			/>
		</DataTable>
	);
}
