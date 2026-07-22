import { DataTable } from "primereact/datatable";
import { Column } from "primereact/column";
import { Button } from "primereact/button";
import { useTranslation } from "react-i18next";
import type { NoticeDto } from "~/domains/notices/application/dto/NoticeDto";
import type { PageProps } from "~/frontend/page-props";
import type { LocaleMap } from "~/domains/notices/domain/Notice";
import { useViewContext } from "~/frontend/context";
import { formatDateDisplay } from "~/utils/date";
import { LangLink } from "~/utils/link";

// $lang-segment lookup, not the Phase 5c Accept-Language resolveLocale() (design.md Decision 7).
function resolveLocale(map: LocaleMap | null, lang: string): string {
	if (!map) return "";
	return map[lang] ?? map["en"] ?? "";
}

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
			emptyMessage={t("list.empty")}
		>
			<Column
				field="titleJson"
				header={t("list.columns.title")}
				body={(n: NoticeDto) => resolveLocale(n.titleJson, lang)}
			/>
			<Column
				field="isPublished"
				header={t("list.columns.status")}
				body={(n: NoticeDto) =>
					n.isPublished ? t("status.published") : t("status.draft")
				}
			/>
			<Column
				field="publishedAt"
				header={t("list.columns.published_at")}
				body={(n: NoticeDto) =>
					n.publishedAt ? formatDateDisplay(n.publishedAt) : "—"
				}
			/>
			<Column
				field="updatedAt"
				header={t("list.columns.updated_at")}
				body={(n: NoticeDto) => formatDateDisplay(n.updatedAt)}
			/>
			<Column
				header={t("list.columns.actions")}
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
