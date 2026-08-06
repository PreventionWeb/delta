import { useEffect, useState } from "react";
import { Button } from "primereact/button";
import { Dialog } from "primereact/dialog";
import { InputText } from "primereact/inputtext";

export type DisasterEventLinkItem = {
	id: string;
	url: string;
	title: string | null;
	createdAt?: string | Date;
};

export type EditableDisasterEventLink = {
	id: string;
	url: string;
	title: string;
};

type DisasterEventLinkProps = {
	initialLinks: DisasterEventLinkItem[];
	onLinksChange: (links: EditableDisasterEventLink[]) => void;
};

export default function DisasterEventLink({
	initialLinks,
	onLinksChange,
}: DisasterEventLinkProps) {
	const [disasterEventLinks, setDisasterEventLinks] = useState<
		EditableDisasterEventLink[]
	>(() =>
		initialLinks.map((link) => ({
			id: link.id,
			url: link.url,
			title: link.title ?? "",
		})),
	);
	const [isLinkDialogVisible, setIsLinkDialogVisible] = useState(false);
	const [editingLinkId, setEditingLinkId] = useState<string | null>(null);
	const [linkUrlValue, setLinkUrlValue] = useState("");
	const [linkTitleValue, setLinkTitleValue] = useState("");
	const [linkUrlError, setLinkUrlError] = useState<string | null>(null);

	useEffect(() => {
		onLinksChange(disasterEventLinks);
	}, [disasterEventLinks, onLinksChange]);

	const closeLinkDialog = () => {
		setIsLinkDialogVisible(false);
		setEditingLinkId(null);
		setLinkUrlValue("");
		setLinkTitleValue("");
		setLinkUrlError(null);
	};

	const openAddLinkDialog = () => {
		setEditingLinkId(null);
		setLinkUrlValue("");
		setLinkTitleValue("");
		setLinkUrlError(null);
		setIsLinkDialogVisible(true);
	};

	const openEditLinkDialog = (link: EditableDisasterEventLink) => {
		setEditingLinkId(link.id);
		setLinkUrlValue(link.url);
		setLinkTitleValue(link.title);
		setLinkUrlError(null);
		setIsLinkDialogVisible(true);
	};

	const saveLink = () => {
		const trimmedUrl = linkUrlValue.trim();
		if (!trimmedUrl) {
			setLinkUrlError("URL is required");
			return;
		}

		try {
			new URL(trimmedUrl);
		} catch {
			setLinkUrlError("Enter a valid URL");
			return;
		}

		const trimmedTitle = linkTitleValue.trim();

		if (editingLinkId) {
			setDisasterEventLinks((current) =>
				current.map((link) =>
					link.id === editingLinkId
						? {
								...link,
								url: trimmedUrl,
								title: trimmedTitle,
							}
						: link,
				),
			);
		} else {
			setDisasterEventLinks((current) => [
				...current,
				{
					id: `new-link-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
					url: trimmedUrl,
					title: trimmedTitle,
				},
			]);
		}

		closeLinkDialog();
	};

	const deleteLink = (linkId: string) => {
		setDisasterEventLinks((current) =>
			current.filter((link) => link.id !== linkId),
		);
	};

	return (
		<>
			<div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
				<div className="flex flex-col gap-3">
					<div>
						<div className="flex items-center gap-2">
							<i className="pi pi-link text-blue-500" />
							<h3 className="text-[18px] font-semibold text-slate-800">
								Links
							</h3>
						</div>
						<p className="mt-2 text-[14px] leading-[22px] text-slate-500">
							Add related URLs for this disaster event.
						</p>
						<div className="mt-2.5">
							<Button
								type="button"
								label="Add link"
								icon="pi pi-plus"
								outlined
								onClick={openAddLinkDialog}
							/>
						</div>
					</div>
				</div>

				<div className="mt-4 space-y-2">
					{disasterEventLinks.length === 0 ? (
						<div className="rounded-lg border border-dashed border-slate-200 px-4 py-3 text-sm text-slate-500">
							No links added yet
						</div>
					) : (
						disasterEventLinks.map((link) => (
							<div
								key={link.id}
								className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 px-4 py-3"
							>
								<div className="min-w-0">
									<a
										href={link.url}
										target="_blank"
										rel="noreferrer"
										className="block break-all text-[14px] font-medium text-blue-700 hover:underline"
									>
										{link.title || link.url}
									</a>
									{link.title ? (
										<p className="mt-1 break-all text-[12px] text-slate-500">
											{link.url}
										</p>
									) : null}
								</div>
								<div className="flex items-center gap-1">
									<Button
										type="button"
										icon="pi pi-pencil"
										text
										aria-label="Edit link"
										onClick={() => openEditLinkDialog(link)}
									/>
									<Button
										type="button"
										icon="pi pi-trash"
										text
										severity="danger"
										aria-label="Delete link"
										onClick={() => deleteLink(link.id)}
									/>
								</div>
							</div>
						))
					)}
				</div>
			</div>

			<Dialog
				header={editingLinkId ? "Edit link" : "Add link"}
				visible={isLinkDialogVisible}
				onHide={closeLinkDialog}
				style={{ width: "36rem", maxWidth: "95vw" }}
				draggable={false}
				resizable={false}
			>
				<div className="grid gap-4">
					<div>
						<label
							htmlFor="event-link-url"
							className="mb-1 inline-flex items-center gap-2"
						>
							<span className="text-red-500">*</span> URL
						</label>
						<InputText
							id="event-link-url"
							type="url"
							value={linkUrlValue}
							onChange={(event) => {
								setLinkUrlValue(event.target.value);
								if (linkUrlError) {
									setLinkUrlError(null);
								}
							}}
							placeholder="https://example.org"
							className="w-full"
							required
						/>
						{linkUrlError ? (
							<p className="mt-1 text-xs text-red-600">{linkUrlError}</p>
						) : null}
					</div>

					<div>
						<label htmlFor="event-link-label" className="mb-1 block">
							Label
						</label>
						<InputText
							id="event-link-label"
							value={linkTitleValue}
							onChange={(event) => setLinkTitleValue(event.target.value)}
							placeholder="Optional"
							className="w-full"
						/>
					</div>
				</div>

				<div className="mt-5 flex items-center justify-end gap-2">
					<Button
						type="button"
						label="Cancel"
						outlined
						onClick={closeLinkDialog}
					/>
					<Button
						type="button"
						label={editingLinkId ? "Save link" : "Add link"}
						onClick={saveLink}
					/>
				</div>
			</Dialog>
		</>
	);
}
