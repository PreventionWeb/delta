import { useMemo, useRef, useState } from "react";
import { Button } from "primereact/button";
import { FileUpload, type FileUploadSelectEvent } from "primereact/fileupload";
import { ViewContext } from "~/frontend/context";

type DisasterEventAttachmentProps = {
	ctx: ViewContext;
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
}: DisasterEventAttachmentProps) {
	const [rows, setRows] = useState<AttachmentRow[]>([]);
	const fileUploadRef = useRef<FileUpload | null>(null);
	const totalAttachmentSize = rows.reduce((sum, row) => sum + row.file.size, 0);
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
				msg: "Maximum 10 MB per file and 10 MB total.",
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
			}));

			return assignValidation([...currentRows, ...newRows], ctx);
		});

		fileUploadRef.current?.clear();
	};

	const removeRow = (rowId: string) => {
		setRows((currentRows) =>
			assignValidation(currentRows.filter((row) => row.id !== rowId), ctx),
		);
	};

	return (
		<div className="col-span-12 mb-4">
			<h2 className="text-[18px] leading-[24px] font-semibold text-slate-800 tracking-[-0.01em]">
				{ctx.t({
					code: "attachments",
					msg: "Attachments",
				})}
			</h2>
			<p className="mt-2 text-[14px] leading-[22px] text-slate-500">
				{ctx.t({
					code: "upload_supporting_documents",
					msg: "Upload supporting documents for this disaster event.",
				})}
			</p>

			<div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
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
							code: "disaster_event.attachments.choose",
							msg: "Choose",
						}),
						icon: "pi pi-upload",
					}}
					headerTemplate={(options) => (
						<div className={options.className}>
							{options.chooseButton}
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

			<div className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
				<div className="mb-1 flex items-center justify-between gap-3 text-xs text-slate-500">
					<span>{`${formatFileSize(totalAttachmentSize)} / ${formatFileSize(MAX_TOTAL_SIZE_BYTES)}`}</span>
					<span>
						{ctx.t({
							code: "disaster_event.attachments.total_size",
							msg: "Total size",
						})}
					</span>
				</div>
				<div className="h-2 overflow-hidden rounded-full bg-slate-200">
					<div
						className="h-full rounded-full bg-sky-500 transition-all"
						style={{ width: `${totalAttachmentSizePercent}%` }}
					/>
				</div>
			</div>

			<div className="mt-4 space-y-2">
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
					</div>
				))}
			</div>
		</div>
	);
}
