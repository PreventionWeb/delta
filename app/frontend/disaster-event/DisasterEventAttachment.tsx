import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "primereact/button";
import { FileUpload, type FileUploadSelectEvent } from "primereact/fileupload";
import { ViewContext } from "~/frontend/context";
import {
	preUploadDisasterEventAttachment,
	type PreUploadedAttachmentFile,
} from "~/frontend/disaster-event/attachmentUpload";

type DisasterEventAttachmentProps = {
	ctx: ViewContext;
	initialAttachments: Array<{
		id: string;
		fileName: string;
		fileType: string;
		fileSize: number;
	}>;
	keptAttachmentIds: string[];
	onKeptAttachmentIdsChange: (attachmentIds: string[]) => void;
	onNewAttachmentUploadsChange: (
		uploads: Array<{
			fileName: string;
			fileType: string;
			fileSize: number;
			tempFilePath: string;
			tenantPath?: string;
		}>,
	) => void;
};

type AttachmentErrorCode =
	| "unsupported_type"
	| "file_too_large"
	| "total_size_exceeded";

type AttachmentRow = {
	id: string;
	file: File;
	errorCode: AttachmentErrorCode | null;
	errorMessage: string | null;
	uploadStatus: "idle" | "uploading" | "uploaded" | "failed";
	uploadError: string | null;
	uploadedFile: {
		name: string;
		content_type: string;
		tenantPath?: string;
	} | null;
};

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_SIZE_BYTES = 10 * 1024 * 1024;

const ACCEPTED_EXTENSIONS = [
	"pdf",
	"doc",
	"docx",
	"xls",
	"xlsx",
	"ppt",
	"pptx",
	"jpg",
	"png",
	"gif",
	"webp",
	"mp3",
	"wav",
	"m4a",
	"mp4",
	"mov",
] as const;

const ACCEPT_ATTRIBUTE = ACCEPTED_EXTENSIONS.map((ext) => `.${ext}`).join(",");

function extensionFromName(fileName: string): string {
	const segments = fileName.split(".");
	if (segments.length < 2) return "";
	return segments[segments.length - 1].toLowerCase();
}

function formatFileSize(fileSize: number): string {
	if (!Number.isFinite(fileSize) || fileSize <= 0) {
		return "0 B";
	}

	const units = ["B", "KB", "MB", "GB"];
	let unitIndex = 0;
	let value = fileSize;

	while (value >= 1024 && unitIndex < units.length - 1) {
		value /= 1024;
		unitIndex += 1;
	}

	const fixed = value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1);
	return `${fixed} ${units[unitIndex]}`;
}

function getFileIconClass(fileName: string): string {
	const ext = extensionFromName(fileName);

	if (["pdf"].includes(ext)) return "pi pi-file-pdf";
	if (["doc", "docx"].includes(ext)) return "pi pi-file-word";
	if (["xls", "xlsx"].includes(ext)) return "pi pi-file-excel";
	if (["ppt", "pptx"].includes(ext)) return "pi pi-file";
	if (["jpg", "png", "gif", "webp"].includes(ext)) return "pi pi-image";
	if (["mp3", "wav", "m4a"].includes(ext)) return "pi pi-volume-up";
	if (["mp4", "mov"].includes(ext)) return "pi pi-video";

	return "pi pi-file";
}

function isAllowedType(fileName: string): boolean {
	const ext = extensionFromName(fileName);
	return ACCEPTED_EXTENSIONS.includes(ext as (typeof ACCEPTED_EXTENSIONS)[number]);
}

function assignValidation(rows: AttachmentRow[], ctx: ViewContext): AttachmentRow[] {
	let validated: AttachmentRow[] = rows.map((row): AttachmentRow => {
		if (!isAllowedType(row.file.name)) {
			return {
				...row,
				errorCode: "unsupported_type",
				errorMessage: ctx.t({
					code: "disaster_event.attachments.error.unsupported_type",
					msg: "Unsupported file type.",
				}),
			};
		}

		if (row.file.size > MAX_FILE_SIZE_BYTES) {
			return {
				...row,
				errorCode: "file_too_large",
				errorMessage: ctx.t({
					code: "disaster_event.attachments.error.file_too_large",
					msg: "File size exceeds 10 MB.",
				}),
			};
		}

		return {
			...row,
			errorCode: null,
			errorMessage: null,
		};
	});

	const validIndexes: number[] = [];
	let validTotal = 0;

	for (let index = 0; index < validated.length; index += 1) {
		const row = validated[index];
		if (!row.errorCode) {
			validIndexes.push(index);
			validTotal += row.file.size;
		}
	}

	let overflow = validTotal - MAX_TOTAL_SIZE_BYTES;

	for (let i = validIndexes.length - 1; i >= 0 && overflow > 0; i -= 1) {
		const rowIndex = validIndexes[i];
		const row = validated[rowIndex];

		validated[rowIndex] = {
			...row,
			errorCode: "total_size_exceeded",
			errorMessage: ctx.t({
				code: "disaster_event.attachments.error.total_size_exceeded",
				msg: "Total attachment size exceeds 10 MB.",
			}),
		};

		overflow -= row.file.size;
	}

	return validated;
}

export default function DisasterEventAttachment({
	ctx,
	initialAttachments,
	keptAttachmentIds,
	onKeptAttachmentIdsChange,
	onNewAttachmentUploadsChange,
}: DisasterEventAttachmentProps) {
	const [rows, setRows] = useState<AttachmentRow[]>([]);
	const [existingRows, setExistingRows] = useState(
		initialAttachments.filter((attachment) => keptAttachmentIds.includes(attachment.id)),
	);
	const fileUploadRef = useRef<FileUpload | null>(null);
	const totalExistingAttachmentSize = existingRows.reduce(
		(sum, row) => sum + row.fileSize,
		0,
	);
	const totalNewAttachmentSize = rows.reduce(
		(sum, row) => sum + row.file.size,
		0,
	);
	const totalAttachmentSize =
		totalExistingAttachmentSize + totalNewAttachmentSize;
	const totalAttachmentSizePercent = Math.min(
		100,
		(totalAttachmentSize / MAX_TOTAL_SIZE_BYTES) * 100,
	);

	const acceptedTypesText = useMemo(
		() =>
			ctx.t({
				code: "disaster_event.attachments.helper.accepted_types",
				msg: "Accepted: PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, JPG, PNG, GIF, WEBP, MP3, WAV, M4A, MP4, MOV.",
			}),
		[ctx],
	);

	const sizeLimitsText = useMemo(
		() =>
			ctx.t({
				code: "disaster_event.attachments.helper.size_limits",
				msg: "Maximum attachment size: 10 MB.",
			}),
		[ctx],
	);

	const onSelect = (event: FileUploadSelectEvent) => {
		const selectedFiles = (event.files || []) as File[];
		if (selectedFiles.length === 0) return;

		setRows((currentRows) => {
			const newRows: AttachmentRow[] = selectedFiles.map((file) => ({
				id: `${Date.now()}-${file.name}-${Math.random().toString(36).slice(2, 8)}`,
				file,
				errorCode: null,
				errorMessage: null,
				uploadStatus: "idle",
				uploadError: null,
				uploadedFile: null,
			}));

			const validatedRows = assignValidation([...currentRows, ...newRows], ctx);
			return validatedRows.map((row) =>
				row.errorCode
					? {
						...row,
						uploadStatus: "failed",
						uploadError: row.errorMessage,
					}
					: row,
			);
		});

		for (const file of selectedFiles) {
			setRows((currentRows) =>
				currentRows.map((row) => {
					if (row.file !== file || row.errorCode) {
						return row;
					}

					return {
						...row,
						uploadStatus: "uploading",
						uploadError: null,
					};
				}),
			);

			preUploadDisasterEventAttachment(
				file,
				ctx.url("/disaster-event/file-pre-upload"),
				ctx.t({
					code: "content_repeater.file_upload_error",
					msg: "An error occurred while processing the file upload.",
				}),
			)
				.then((uploadedFile) => {
					setRows((currentRows) =>
						currentRows.map((row) => {
							if (row.file !== file) {
								return row;
							}

							return {
								...row,
								uploadStatus: "uploaded",
								uploadError: null,
								uploadedFile: uploadedFile as PreUploadedAttachmentFile,
							};
						}),
					);
				})
				.catch((error: unknown) => {
					const errorMessage =
						error instanceof Error
							? error.message
							: ctx.t({
								code: "content_repeater.file_upload_error",
								msg: "An error occurred while processing the file upload.",
							});

					setRows((currentRows) =>
						currentRows.map((row) => {
							if (row.file !== file) {
								return row;
							}

							return {
								...row,
								uploadStatus: "failed",
								uploadError: errorMessage,
							};
						}),
					);
				});
		}

		fileUploadRef.current?.clear();
	};

	const removeRow = (rowId: string) => {
		setRows((currentRows) =>
			assignValidation(currentRows.filter((row) => row.id !== rowId), ctx),
		);
	};

	const removeExistingRow = (rowId: string) => {
		setExistingRows((currentRows) =>
			currentRows.filter((row) => row.id !== rowId),
		);
	};

	useEffect(() => {
		onKeptAttachmentIdsChange(existingRows.map((attachment) => attachment.id));
	}, [existingRows, onKeptAttachmentIdsChange]);

	useEffect(() => {
		onNewAttachmentUploadsChange(
			rows
				.filter(
					(row) =>
						row.errorCode === null &&
						row.uploadStatus === "uploaded" &&
						row.uploadedFile,
				)
				.map((row) => ({
					fileName: row.file.name,
					fileType: row.uploadedFile?.content_type || row.file.type,
					fileSize: row.file.size,
					tempFilePath: row.uploadedFile?.name || "",
					tenantPath: row.uploadedFile?.tenantPath,
				}))
				.filter((upload) => upload.tempFilePath.length > 0),
		);
	}, [rows, onNewAttachmentUploadsChange]);

	return (
		<div className="col-span-12 mb-4">
			<div className="flex items-center gap-2">
				<i className="pi pi-file text-blue-500" />
				<h2 className="text-[18px] leading-[24px] font-semibold text-slate-800 tracking-[-0.01em]">
					{ctx.t({
						code: "attachments",
						msg: "Attachments",
					})}
				</h2>
			</div>
			<p className="mt-2 text-[14px] leading-[22px] text-slate-500">
				{ctx.t({
					code: "upload_supporting_documents",
					msg: "Upload supporting documents for this disaster event.",
				})}
			</p>

			<div className="mt-4">
				<FileUpload
					ref={fileUploadRef}
					name="disasterEventAttachments"
					multiple
					accept={ACCEPT_ATTRIBUTE}
					customUpload
					uploadHandler={() => {
						// no-op: this story keeps files local to the step component
					}}
					auto={false}
					chooseOptions={{
						label: ctx.t({
							code: "upload_files",
							msg: "Upload files",
						}),
						icon: "pi pi-upload",
						className: "p-button-outlined",
					}}
					headerTemplate={(options) => (
						<div
							className={`${options.className} flex items-start justify-between gap-4`}
						>
							{options.chooseButton}
							<div className="ms-auto w-full max-w-64">
								<div className="mb-1 flex items-center justify-end gap-3 text-xs text-slate-500">
									<span>
										{ctx.t({
											code: "disaster_event.attachments.total_size",
											msg: "Total size",
										})}
									</span>
									<span>{`${formatFileSize(totalAttachmentSize)} / ${formatFileSize(MAX_TOTAL_SIZE_BYTES)}`}</span>
								</div>
								<div className="h-2 overflow-hidden rounded-full bg-slate-200">
									<div
										className="h-full rounded-full bg-sky-500 transition-all"
										style={{ width: `${totalAttachmentSizePercent}%` }}
									/>
								</div>
							</div>
						</div>
					)}
					onSelect={onSelect}
					emptyTemplate={
						<div className="py-6 text-center text-slate-600">
							<p className="text-sm font-medium">
								{ctx.t({
									code: "disaster_event.attachments.cta",
									msg: "Drag and drop or click to upload",
								})}
							</p>
							<p className="mt-2 text-xs text-slate-500">
								{acceptedTypesText}
							</p>
							<p className="mt-1 text-xs text-slate-500">
								{sizeLimitsText}
							</p>
						</div>
					}
				/>
			</div>

			<div className="mt-4 space-y-2">
				{existingRows.map((attachment) => (
					<div
						key={attachment.id}
						className="rounded-md border border-slate-200 bg-white px-3 py-2"
					>
						<div className="flex items-center justify-between gap-3">
							<div className="flex min-w-0 items-center gap-3">
								<i
									className={`${getFileIconClass(attachment.fileName)} text-slate-500`}
								/>
								<div className="min-w-0">
									<p className="truncate text-sm font-medium text-slate-800">
										{attachment.fileName}
									</p>
									<p className="text-xs text-slate-500">
										{`${formatFileSize(attachment.fileSize)}${attachment.fileType ? ` • ${attachment.fileType}` : ""
											}`}
									</p>
								</div>
							</div>
							<Button
								type="button"
								text
								severity="danger"
								icon="pi pi-trash"
								onClick={() => removeExistingRow(attachment.id)}
								aria-label={ctx.t({
									code: "disaster_event.attachments.remove_existing_file",
									msg: `Remove ${attachment.fileName}`,
								})}
							/>
						</div>
					</div>
				))}

				{rows.map((row) => (
					<div
						key={row.id}
						className="rounded-md border border-slate-200 bg-white px-3 py-2"
					>
						<div className="flex items-center justify-between gap-3">
							<div className="flex min-w-0 items-center gap-3">
								<i className={`${getFileIconClass(row.file.name)} text-slate-500`} />
								<div className="min-w-0">
									<p className="truncate text-sm font-medium text-slate-800">
										{row.file.name}
									</p>
									<p className="text-xs text-slate-500">
										{formatFileSize(row.file.size)}
									</p>
								</div>
							</div>
							<Button
								type="button"
								text
								severity="danger"
								icon="pi pi-trash"
								onClick={() => removeRow(row.id)}
								aria-label={ctx.t({
									code: "disaster_event.attachments.remove_file",
									msg: `Remove ${row.file.name}`,
								})}
							/>
						</div>
						{row.errorMessage ? (
							<p className="mt-2 text-xs text-red-600">{row.errorMessage}</p>
						) : null}
						{row.uploadStatus === "uploading" ? (
							<p className="mt-2 text-xs text-slate-500">
								{ctx.t({
									code: "common.uploading_please_wait",
									msg: "Uploading, please wait...",
								})}
							</p>
						) : null}
						{row.uploadError ? (
							<p className="mt-2 text-xs text-red-600">{row.uploadError}</p>
						) : null}
					</div>
				))}
			</div>
		</div>
	);
}
