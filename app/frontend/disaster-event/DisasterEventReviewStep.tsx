import { Button } from "primereact/button";
import { Card } from "primereact/card";
import { DataView } from "primereact/dataview";

type LinkedEventOption = {
    id: string;
    name: string;
    code: string;
    hip?: string;
};

type SelectedDivisionItem = {
    key: string;
    label: string;
};

type AdditionalDetailMeta = {
    declarationStatus?: "unknown" | "yes" | "no";
    hadOfficialWarningOrWeatherAdvisory?: boolean;
    officialWarningAffectedAreas?: string;
};

type AdditionalDetailItem = {
    id: string;
    type: string;
    date: string;
    description: string;
    meta?: AdditionalDetailMeta;
};

type ReviewAttachmentItem = {
    id: string;
    fileName: string;
    fileType?: string;
    fileSize?: number;
};

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

type DisasterEventReviewStepProps = {
    form: {
        nameNational: string;
        nameGlobalOrRegional: string;
        nationalDisasterId: string;
        glide: string;
        id: string;
        recordingOrganizationName: string;
    };
    selectedHazardTypeName: string;
    selectedHazardClusterName: string;
    selectedSpecificHazardName: string;
    startTimingValue: string;
    endTimingValue: string;
    selectedDivisionItems: SelectedDivisionItem[];
    reviewSpatialFootprintItems: string[];
    reviewAttachments: ReviewAttachmentItem[];
    triggeringHazardousEventTarget: LinkedEventOption[];
    triggeredHazardousEventTarget: LinkedEventOption[];
    triggeringDisasterEventTarget: LinkedEventOption[];
    triggeredDisasterEventTarget: LinkedEventOption[];
    linkedDisasterRecordTarget: LinkedEventOption[];
    responses: AdditionalDetailItem[];
    assessments: AdditionalDetailItem[];
    declarations: AdditionalDetailItem[];
    getDetailTypeLabel: (value: string) => string;
    getDetailDescriptionValue: (item: AdditionalDetailItem) => string;
    onCancel: () => void;
    onBack: () => void;
    onSendForValidation: () => void;
};

const renderReviewItem = (label: string, value: string) => (
    <div className="space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
            {label}
        </p>
        <p className="text-[14px] leading-[14px] font-semibold text-slate-800">
            {value || "-"}
        </p>
    </div>
);

const renderStep4SectionCard = (
    title: string,
    iconClass: string,
    emptyLabel: string,
    content: React.ReactNode,
    hasItems: boolean,
) => (
    <Card
        className="rounded-2xl border border-slate-200 shadow-none"
        pt={{ body: { style: { padding: "18px 20px" } } }}
    >
        <div className="space-y-4">
            <div className="flex items-center gap-2 text-slate-800">
                <i className={iconClass} />
                <h4 className="text-[18px] leading-[24px] font-semibold">{title}</h4>
            </div>
            {hasItems ? (
                <div className="space-y-5">{content}</div>
            ) : (
                <p className="text-[14px] italic text-slate-400">{emptyLabel}</p>
            )}
        </div>
    </Card>
);

const renderStep4DetailRow = (
    category: "response" | "assessment" | "declaration",
    item: AdditionalDetailItem,
    getDetailTypeLabel: (value: string) => string,
    getDetailDescriptionValue: (item: AdditionalDetailItem) => string,
) => {
    const badgeClass =
        category === "response"
            ? "bg-blue-100 text-blue-700"
            : category === "assessment"
                ? "bg-violet-100 text-violet-700"
                : "bg-amber-100 text-amber-700";
    const typeLabel = getDetailTypeLabel(item.type);
    const descriptionValue = getDetailDescriptionValue(item);

    return (
        <div key={item.id} className="space-y-2">
            <div className="flex items-center gap-3">
                <span
                    className={`rounded-full px-2 py-1 text-[11px] font-semibold ${badgeClass}`}
                >
                    {typeLabel}
                </span>
                {item.date ? (
                    <span className="text-[12px] text-slate-500">{item.date}</span>
                ) : null}
            </div>
            {descriptionValue ? (
                <p className="text-[14px] text-slate-500">
                    {descriptionValue.split(/\r?\n/).map((line, index, lines) => (
                        <span key={`${item.id}-review-line-${index}`}>
                            {line}
                            {index < lines.length - 1 ? <br /> : null}
                        </span>
                    ))}
                </p>
            ) : null}
        </div>
    );
};

const linkedEventItemTemplate = (
    item: LinkedEventOption,
    layout?: "list" | "grid",
) => {
    const wrapperClass =
        layout === "grid" ? "linked-disaster-record-grid-item" : "w-full";

    return (
        <div className={wrapperClass}>
            <div className="flex items-start justify-between rounded-lg border border-slate-200 px-4 py-3">
                <div className="flex w-full items-start justify-between gap-4">
                    <div>
                        <p className="text-[14px] font-semibold text-slate-700">{item.name}</p>
                        {item.hip ? (
                            <p className="mt-1 text-[12px] text-slate-500">{item.hip}</p>
                        ) : item.code ? (
                            <p>{item.code}</p>
                        ) : null}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default function DisasterEventReviewStep({
    form,
    selectedHazardTypeName,
    selectedHazardClusterName,
    selectedSpecificHazardName,
    startTimingValue,
    endTimingValue,
    selectedDivisionItems,
    reviewSpatialFootprintItems,
    reviewAttachments,
    triggeringHazardousEventTarget,
    triggeredHazardousEventTarget,
    triggeringDisasterEventTarget,
    triggeredDisasterEventTarget,
    linkedDisasterRecordTarget,
    responses,
    assessments,
    declarations,
    getDetailTypeLabel,
    getDetailDescriptionValue,
    onCancel,
    onBack,
    onSendForValidation,
}: DisasterEventReviewStepProps) {
    return (
        <>
            <div className="space-y-5">
                <div>
                    <h3 className="text-[18px] leading-[24px] font-semibold text-slate-800">
                        Review and save
                    </h3>
                    <p className="mt-1 text-[14px] leading-[22px] text-slate-500">
                        Verify the information before saving.
                    </p>
                </div>

                <Card
                    className="rounded-2xl border border-slate-200 shadow-none"
                    pt={{ body: { style: { padding: "5px 20px 5px 20px" } } }}
                >
                    <div className="space-y-6">
                        <div className="flex items-center gap-2 text-slate-800">
                            <i className="pi pi-info-circle text-blue-600" />
                            <h4 className="text-[16px] leading-[16px] font-semibold">
                                Basic information
                            </h4>
                        </div>
                        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                            {renderReviewItem("Disaster name - national", form.nameNational)}
                            {renderReviewItem(
                                "Disaster name - global/regional",
                                form.nameGlobalOrRegional,
                            )}
                            {renderReviewItem("National event ID", form.nationalDisasterId)}
                            {renderReviewItem("GLIDE number", form.glide)}
                            {renderReviewItem("Disaster event UUID", form.id)}
                            {renderReviewItem(
                                "Recording organisation",
                                form.recordingOrganizationName,
                            )}
                        </div>
                    </div>
                </Card>

                <Card
                    className="rounded-2xl border border-slate-200 shadow-none"
                    pt={{ body: { style: { padding: "5px 20px 5px 20px" } } }}
                >
                    <div className="space-y-6">
                        <div className="flex items-center gap-2 text-slate-800">
                            <i className="pi pi-map-marker text-blue-600" />
                            <h4 className="text-[16px] leading-[16px] font-semibold">
                                Hazard details
                            </h4>
                        </div>
                        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                            {renderReviewItem("Hazard type", selectedHazardTypeName)}
                            {renderReviewItem("Hazard cluster", selectedHazardClusterName)}
                            {renderReviewItem("Specific hazard", selectedSpecificHazardName)}
                        </div>
                        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                            {renderReviewItem("Start", startTimingValue)}
                            {renderReviewItem("End", endTimingValue)}
                        </div>
                    </div>
                </Card>

                {renderStep4SectionCard(
                    "Location",
                    "pi pi-map-marker text-blue-600",
                    "No location details available",
                    <>
                        <div className="space-y-2">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                                Geographic levels
                            </p>
                            {selectedDivisionItems.length > 0 ? (
                                <div className="flex flex-wrap gap-2">
                                    {selectedDivisionItems.map((item) => (
                                        <span
                                            key={`review-division-${item.key}`}
                                            className="rounded-md bg-blue-50 px-2 py-1 text-[12px] text-blue-700"
                                        >
                                            {item.label}
                                        </span>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-[14px] italic text-slate-400">
                                    No geographic levels selected
                                </p>
                            )}
                        </div>

                        <div className="space-y-2">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                                Spatial footprint
                            </p>
                            {reviewSpatialFootprintItems.length > 0 ? (
                                <ul className="list-disc pl-5 text-[14px] text-slate-500">
                                    {reviewSpatialFootprintItems.map((title, index) => (
                                        <li key={`review-footprint-${index}`}>{title}</li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="text-[14px] italic text-slate-400">
                                    No spatial data defined
                                </p>
                            )}
                        </div>
                    </>,
                    selectedDivisionItems.length > 0 ||
                    reviewSpatialFootprintItems.length > 0,
                )}

                {reviewAttachments.length > 0
                    ? renderStep4SectionCard(
                        "Attachments",
                        "pi pi-paperclip text-blue-600",
                        "No attachments",
                        <div className="space-y-3">
                            {reviewAttachments.map((attachment) => (
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
                                                    {`${formatFileSize(attachment.fileSize ?? 0)}${attachment.fileType ? ` • ${attachment.fileType}` : ""
                                                        }`}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>,
                        true,
                    )
                    : null}

                {renderStep4SectionCard(
                    "Linked events",
                    "pi pi-link text-blue-600",
                    "No linked hazardous or disaster events selected yet",
                    <>
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <div className="rounded-xl border border-slate-200 bg-white p-4">
                                <div className="space-y-3">
                                    <p className="text-[14px] font-semibold text-slate-700">
                                        Triggering (causal) hazardous events
                                    </p>
                                    <DataView
                                        className="linked-disaster-event-grid"
                                        value={triggeringHazardousEventTarget}
                                        itemTemplate={linkedEventItemTemplate}
                                        emptyMessage="No linked triggering (causal) hazardous events"
                                        layout="grid"
                                    />
                                </div>
                            </div>
                            <div className="rounded-xl border border-slate-200 bg-white p-4">
                                <div className="space-y-3">
                                    <p className="text-[14px] font-semibold text-slate-700">
                                        Triggered (subsequent) hazardous events
                                    </p>
                                    <DataView
                                        className="linked-disaster-event-grid"
                                        value={triggeredHazardousEventTarget}
                                        itemTemplate={linkedEventItemTemplate}
                                        emptyMessage="No linked triggered (subsequent) hazardous events"
                                        layout="grid"
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <div className="rounded-xl border border-slate-200 bg-white p-4">
                                <div className="space-y-3">
                                    <p className="text-[14px] font-semibold text-slate-700">
                                        Triggering (causal) disaster events
                                    </p>
                                    <DataView
                                        className="linked-disaster-event-grid"
                                        value={triggeringDisasterEventTarget}
                                        itemTemplate={linkedEventItemTemplate}
                                        emptyMessage="No linked triggering (causal) disaster events"
                                        layout="grid"
                                    />
                                </div>
                            </div>
                            <div className="rounded-xl border border-slate-200 bg-white p-4">
                                <div className="space-y-3">
                                    <p className="text-[14px] font-semibold text-slate-700">
                                        Triggered (subsequent) disaster events
                                    </p>
                                    <DataView
                                        className="linked-disaster-event-grid"
                                        value={triggeredDisasterEventTarget}
                                        itemTemplate={linkedEventItemTemplate}
                                        emptyMessage="No linked triggered (subsequent) disaster events"
                                        layout="grid"
                                    />
                                </div>
                            </div>
                        </div>
                    </>,
                    triggeringHazardousEventTarget.length > 0 ||
                    triggeredHazardousEventTarget.length > 0 ||
                    triggeringDisasterEventTarget.length > 0 ||
                    triggeredDisasterEventTarget.length > 0,
                )}

                {renderStep4SectionCard(
                    "Linked disaster records",
                    "pi pi-file text-blue-600",
                    "No disaster records linked yet",
                    <DataView
                        className="linked-disaster-records-grid"
                        value={linkedDisasterRecordTarget}
                        itemTemplate={linkedEventItemTemplate}
                        layout="grid"
                    />,
                    linkedDisasterRecordTarget.length > 0,
                )}

                {renderStep4SectionCard(
                    "Responses",
                    "pi pi-file-edit text-blue-600",
                    "No responses recorded yet",
                    responses.map((item) =>
                        renderStep4DetailRow(
                            "response",
                            item,
                            getDetailTypeLabel,
                            getDetailDescriptionValue,
                        ),
                    ),
                    responses.length > 0,
                )}

                {renderStep4SectionCard(
                    "Assessments",
                    "pi pi-clipboard text-violet-600",
                    "No assessments recorded yet",
                    assessments.map((item) =>
                        renderStep4DetailRow(
                            "assessment",
                            item,
                            getDetailTypeLabel,
                            getDetailDescriptionValue,
                        ),
                    ),
                    assessments.length > 0,
                )}

                {renderStep4SectionCard(
                    "Official declarations",
                    "pi pi-send text-amber-600",
                    "No declarations recorded yet",
                    declarations.map((item) =>
                        renderStep4DetailRow(
                            "declaration",
                            item,
                            getDetailTypeLabel,
                            getDetailDescriptionValue,
                        ),
                    ),
                    declarations.length > 0,
                )}
            </div>

            <div className="col-span-12 mt-30 mb-6 h-[2px] w-full bg-slate-200" />

            <div className="flex items-center justify-between w-full">
                <Button type="button" label="Cancel" outlined onClick={onCancel} />
                <div className="flex gap-2">
                    <Button
                        type="button"
                        label="Back"
                        outlined
                        icon="pi pi-chevron-left"
                        iconPos="left"
                        onClick={onBack}
                    />
                    <Button
                        type="button"
                        label="Send for validation"
                        icon="pi pi-send"
                        iconPos="right"
                        onClick={onSendForValidation}
                    />
                </div>
            </div>
        </>
    );
}
