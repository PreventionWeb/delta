import { useTranslation } from "react-i18next";
import { useViewContext } from "~/frontend/context";
import { Card } from "~/design-system/components/Card";
import { Table } from "~/design-system/components/Table";
import { TableColumn } from "~/design-system/components/TableColumn";
import { TableRow } from "~/design-system/components/TableRow";
import { TableCell } from "~/design-system/components/TableCell";
import type { HazardousEventDetailDto } from "~/domains/hazardous-events/application/dto/HazardousEventDetailDto";
import { attachmentLink, type AttachmentLink } from "./attachmentLink";
import { orDash } from "./orDash";
import { attachmentFileIconClass } from "./attachmentFileIconClass";
import { formatAttachmentFileSize } from "./formatAttachmentFileSize";

export interface HazardousEventAttachmentsCardProps {
	eventId: string;
	attachments: HazardousEventDetailDto["attachments"];
}

type Attachment = HazardousEventDetailDto["attachments"][number];

/** File/URL cell content, matching legacy's two branches (design.md Decision 14, Finding 5). */
function AttachmentLinkCellContent({
	attachment,
	link,
}: {
	attachment: Attachment;
	link: AttachmentLink;
}) {
	if (attachment.type === "Link") {
		return (
			<a
				href={link.href}
				target="_blank"
				rel="noopener noreferrer"
				className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-700 hover:text-blue-800 hover:underline"
			>
				{link.label}
				<i className="pi pi-external-link text-xs text-blue-500" />
			</a>
		);
	}

	const { fileSize } = attachment;

	return (
		<a
			href={link.href}
			target="_blank"
			rel="noopener noreferrer"
			className="inline-flex items-center gap-2 text-sm font-medium text-blue-700 hover:text-blue-800 hover:underline"
		>
			<i
				className={`${attachmentFileIconClass(attachment.fileName ?? "")} text-slate-500`}
			/>
			{link.label}
			{typeof fileSize === "number" && fileSize > 0 ? (
				<span className="text-xs text-slate-400">
					({formatAttachmentFileSize(fileSize)})
				</span>
			) : null}
		</a>
	);
}

/** Renders attachments from CA's own attachments pipeline, never legacy's JSONB/`parseAttachments`. */
export function HazardousEventAttachmentsCard({
	eventId,
	attachments,
}: HazardousEventAttachmentsCardProps) {
	const ctx = useViewContext();
	const { t } = useTranslation("hazardous-events");

	return (
		<Card
			title={t("detail.sections.attachments")}
			icon="pi-paperclip"
			titleSize="lg"
		>
			{attachments.length === 0 ? (
				<p>{t("detail.attachments_none")}</p>
			) : (
				<Table
					aria-label={t("detail.fields.attachments")}
					header={
						<>
							<TableColumn id="title" isRowHeader padding="cozy">
								{t("detail.attachments_table.columns.title")}
							</TableColumn>
							<TableColumn id="tags" padding="cozy">
								{t("detail.attachments_table.columns.tags")}
							</TableColumn>
							<TableColumn id="file-url" padding="cozy">
								{t("detail.attachments_table.columns.file_url")}
							</TableColumn>
						</>
					}
				>
					{attachments.map((attachment) => {
						const link = attachmentLink(eventId, attachment, ctx.url);
						return (
							<TableRow id={attachment.id} key={attachment.id}>
								<TableCell padding="cozy">{orDash(attachment.title)}</TableCell>
								<TableCell padding="cozy">
									{attachment.tag && attachment.tag.length > 0 ? (
										<div className="flex flex-wrap gap-1.5">
											{attachment.tag.map((tag) => (
												<span
													key={tag.id}
													className="inline-flex items-center rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700"
												>
													{tag.name}
												</span>
											))}
										</div>
									) : (
										"—"
									)}
								</TableCell>
								{/* focusChild: last interactive cell in the row, same as the list page's Actions column. */}
								<TableCell focusChild padding="cozy">
									<AttachmentLinkCellContent
										attachment={attachment}
										link={link}
									/>
								</TableCell>
							</TableRow>
						);
					})}
				</Table>
			)}
		</Card>
	);
}
