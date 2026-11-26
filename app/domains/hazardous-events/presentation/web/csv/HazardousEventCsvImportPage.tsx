import { useEffect, useRef } from "react";
import { Form } from "react-router";
import { useTranslation } from "react-i18next";
import { LegacyButton as Button } from "~/design-system/components/LegacyButton";
import { Select } from "~/design-system/components/Select";
import { BackLink } from "~/domains/hazardous-events/presentation/web/BackLink";
import type {
	HazardousEventCsvFileError,
	HazardousEventCsvImportResult,
	HazardousEventCsvRowError,
} from "~/domains/hazardous-events/application/dto/HazardousEventCsvImportResult";
import {
	CSV_IMPORT_MODES,
	type CsvImportMode,
} from "~/domains/hazardous-events/application/csv/hazardousEventCsvColumns";

export interface HazardousEventCsvImportPageProps {
	lang: string;
	result?: HazardousEventCsvImportResult;
	submitting: boolean;
}

type CsvError = HazardousEventCsvFileError | HazardousEventCsvRowError;

// Legacy select order (ground-truth item 5); template links follow CSV_IMPORT_MODES.
const SELECT_ORDER: readonly CsvImportMode[] = ["update", "create", "upsert"];

function ErrorItem({ error }: { error: CsvError }) {
	const { t } = useTranslation("hazardous-events");
	const { line, column } = error;
	// React escapes the rendered text; i18next escaping too would show `R&D` as `R&amp;D`.
	const raw = { escapeValue: false };
	const location =
		line !== undefined && column !== undefined
			? t("csv.location.line_column", { line, column, interpolation: raw })
			: line !== undefined
				? t("csv.location.line", { line, interpolation: raw })
				: column !== undefined
					? t("csv.location.column", { column, interpolation: raw })
					: t("csv.location.file");
	const value = "value" in error ? error.value : undefined;
	return (
		<li>
			{t("csv.error_item", {
				location,
				message: t(`csv.error.${error.code}`),
				interpolation: { escapeValue: false },
			})}
			{value !== undefined ? (
				<>
					{" "}
					{/* Echoed as text, untranslated (ADR-008). */}
					<span>
						{t("csv.value", { value, interpolation: { escapeValue: false } })}
					</span>
				</>
			) : null}
		</li>
	);
}

function ImportOutcome({ result }: { result: HazardousEventCsvImportResult }) {
	const { t } = useTranslation("hazardous-events");
	const alertRef = useRef<HTMLDivElement>(null);

	// Move focus to the error summary so keyboard and screen-reader users land on it.
	useEffect(() => {
		if (!result.ok) alertRef.current?.focus();
	}, [result]);

	const ignored =
		result.ignoredColumns.length > 0 ? (
			<p>
				{t("csv.ignored_columns", {
					columns: result.ignoredColumns.join(", "),
					interpolation: { escapeValue: false },
				})}
			</p>
		) : null;

	if (result.ok) {
		return (
			<div role="status">
				<p>
					{/* One plural key per count: each number needs its own plural form (NR1). */}
					{t("csv.success", {
						created: t("csv.success_parts.created", { count: result.created }),
						updated: t("csv.success_parts.updated", { count: result.updated }),
						unchanged: t("csv.success_parts.unchanged", {
							count: result.unchanged,
						}),
						interpolation: { escapeValue: false },
					})}
				</p>
				{result.skippedDataNotice !== undefined ? (
					<p>
						{t("csv.skipped_data_notice", {
							count: result.skippedDataNotice.rows,
						})}
					</p>
				) : null}
				{ignored}
			</div>
		);
	}

	const errors: CsvError[] = [...result.fileErrors, ...result.rowErrors];
	const unlisted = result.errorCount - errors.length;
	return (
		<div
			role="alert"
			tabIndex={-1}
			ref={alertRef}
			className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dts-action"
		>
			<p>
				<strong>
					{t("csv.failure_summary", { count: result.errorCount })}
				</strong>
			</p>
			<ul className="list-disc pl-6">
				{errors.map((error, index) => (
					<ErrorItem key={index} error={error} />
				))}
			</ul>
			{unlisted > 0 ? <p>{t("csv.more_errors", { count: unlisted })}</p> : null}
			{ignored}
		</div>
	);
}

/** Legacy csvImportScreen re-created on the design-system components (OD-13, legacy-exempt). */
export function HazardousEventCsvImportPage({
	lang,
	result,
	submitting,
}: HazardousEventCsvImportPageProps) {
	const { t } = useTranslation("hazardous-events");
	const formRef = useRef<HTMLFormElement>(null);

	// Clears the chosen file after a success, so a second click cannot re-import the same rows.
	useEffect(() => {
		if (result?.ok) formRef.current?.reset();
	}, [result]);

	return (
		<div className="mg-container flex flex-col gap-6">
			<Form
				ref={formRef}
				method="post"
				encType="multipart/form-data"
				className="dts-form"
			>
				{result !== undefined ? <ImportOutcome result={result} /> : null}
				<div className="dts-form-component">
					<label>
						<div className="dts-form-component__label">
							<span>{t("csv.file_label")}</span>
						</div>
						{/* accept is a picker hint only; the server never trusts it. */}
						<input type="file" name="file" accept=".csv,text/csv" />
					</label>
				</div>
				<div className="dts-form-component mg-grid mg-grid__col-6">
					<Select
						name="import_type"
						label={t("csv.mode_label")}
						defaultSelectedKey="create"
						options={SELECT_ORDER.map((mode) => ({
							id: mode,
							name: t(`csv.mode.${mode}`),
						}))}
					/>
				</div>
				<Button variant="system-primary" type="submit" pending={submitting}>
					{submitting ? t("csv.submitting") : t("csv.submit")}
				</Button>
			</Form>

			<div>
				<BackLink href={`/${lang}/he-preview`} label={t("csv.back")} />
			</div>

			<section>
				<h3>{t("csv.templates.title")}</h3>
				<ul>
					{CSV_IMPORT_MODES.map((mode) => (
						<li key={mode}>
							{/* Plain anchor: a client-side router link cannot download a resource route. */}
							<a
								className="inline-block min-h-6 py-0.5 text-dts-action underline"
								href={`/${lang}/he-preview/csv-template?mode=${mode}`}
							>
								{t(`csv.templates.${mode}`)}
							</a>
						</li>
					))}
				</ul>
			</section>
		</div>
	);
}
