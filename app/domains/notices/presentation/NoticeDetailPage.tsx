import { useTranslation } from "react-i18next";
import type { NoticeDto } from "~/domains/notices/application/dto/NoticeDto";
import type { PageProps } from "~/frontend/page-props";
import { formatDateDisplay } from "~/utils/date";

export function NoticeDetailPage({ data }: PageProps<NoticeDto>) {
	const { t } = useTranslation("notices");

	return (
		<div>
			<h1 className="dts-heading-2">{data.title}</h1>
			<p>
				{data.isPublished ? t("status.published") : t("status.draft")}
				{data.publishedAt ? ` — ${formatDateDisplay(data.publishedAt)}` : ""}
			</p>
			<div>{data.body}</div>
		</div>
	);
}
