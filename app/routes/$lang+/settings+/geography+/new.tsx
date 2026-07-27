import { Form, useActionData, useLoaderData, useNavigate, useNavigation } from "react-router";
import { Button } from "primereact/button";
import { Card } from "primereact/card";
import { Divider } from "primereact/divider";
import { InputText } from "primereact/inputtext";
import { Message } from "primereact/message";
import { BreadCrumb as PrimeBreadCrumb } from "primereact/breadcrumb";
import { MenuItem } from "primereact/menuitem";

import { authActionWithPerm, authLoaderWithPerm } from "~/utils/auth";
import { formStringData } from "~/utils/httputil";
import {
	getCountryAccountsIdFromSession,
	getUserRoleFromSession,
	redirectWithMessage,
} from "~/utils/session";
import { ViewContext } from "~/frontend/context";
import { NavSettings } from "~/frontend/components/NavSettings";
import { MainContainer } from "~/frontend/container";
import {
	DivisionBreadcrumbRow,
	createDivision,
} from "~/backend.server/models/division";
import { DivisionRepository } from "~/db/queries/divisonRepository";
import { LangLink } from "~/utils/link";
import { InsertDivision } from "~/drizzle/schema/divisionTable";
import { BackendContext } from "~/backend.server/context";
import { isValidUUID } from "~/utils/id";

type DivisionBreadcrumbSourceRow = {
	id: string;
	parentId: string | null;
	name: Record<string, string> | null;
};

async function getTopLevelParentInTenant(
	parentId: string,
	countryAccountsId: string,
) {
	let currentId: string | null = parentId;
	let current: Awaited<
		ReturnType<typeof DivisionRepository.getById>
	> | null = null;

	while (currentId) {
		current = await DivisionRepository.getById(currentId, countryAccountsId);
		if (!current) {
			return null;
		}
		currentId = current.parentId;
	}

	return current;
}

function buildDivisionBreadcrumbRows(
	rows: DivisionBreadcrumbSourceRow[],
	divisionId: string,
): DivisionBreadcrumbRow[] {
	const byId = new Map(rows.map((row) => [row.id, row]));
	const breadcrumbs: DivisionBreadcrumbRow[] = [];
	let currentId: string | null = divisionId;

	while (currentId) {
		const row = byId.get(currentId);
		if (!row) {
			break;
		}

		const nameMap = (row.name || {}) as Record<string, string>;
		const nameLang = nameMap.en ? "en" : (Object.keys(nameMap)[0] || "");

		breadcrumbs.unshift({
			id: row.id,
			parentId: row.parentId,
			nameLang,
			name: nameLang ? nameMap[nameLang] || "" : "",
		});

		currentId = row.parentId;
	}

	return breadcrumbs;
}

type LoaderData = {
	initialParentId: string;
	initialLangs: string[];
	breadcrumbs: DivisionBreadcrumbRow[] | null;
	userRole: string | null;
};

export const loader = authLoaderWithPerm(
	"ManageCountrySettings",
	async (loaderArgs) => {
		const { request } = loaderArgs;
		const countryAccountsId = await getCountryAccountsIdFromSession(request);
		const url = new URL(request.url);
		const initialParentId = url.searchParams.get("parent") || "";

		const allRows = await DivisionRepository.getByCountryAccountsId(
			countryAccountsId,
		);

		let breadcrumbs: DivisionBreadcrumbRow[] | null = null;
		if (initialParentId) {
			breadcrumbs = buildDivisionBreadcrumbRows(
				allRows as DivisionBreadcrumbSourceRow[],
				initialParentId,
			);
		}

		const langCounts: Record<string, number> = {};
		for (const row of allRows) {
			const nameMap = (row.name || {}) as Record<string, string>;
			for (const lang of Object.keys(nameMap)) {
				langCounts[lang] = (langCounts[lang] || 0) + 1;
			}
		}

		let initialLangs = Object.entries(langCounts)
			.sort(([ak, ac], [bk, bc]) => {
				if (bc !== ac) {
					return bc - ac;
				}
				return ak.localeCompare(bk);
			})
			.slice(0, 3)
			.map(([lang]) => lang)
			.sort();

		if (initialLangs.length === 0) {
			initialLangs = ["en"];
		}

		const userRole = await getUserRoleFromSession(request);

		return {
			initialParentId,
			initialLangs,
			breadcrumbs,
			userRole: userRole ?? null,
		} satisfies LoaderData;
	},
);

type ActionData = {
	ok: boolean;
	data?: {
		parentId: string;
		names: Record<string, string>;
	};
	errors?: string[];
};

export const action = authActionWithPerm(
	"ManageCountrySettings",
	async (actionArgs) => {
		const { request } = actionArgs;
		const countryAccountsId = await getCountryAccountsIdFromSession(request);
		const formData = await request.formData();
		const rawForm = formStringData(formData);

		const parentId = (rawForm.parentId || "").trim();
		const names = Object.entries(rawForm)
			.filter(([key]) => key.startsWith("names[") && key.endsWith("]"))
			.reduce(
				(acc, [key, value]) => {
					acc[key.slice(6, -1)] = (value || "").trim();
					return acc;
				},
				{} as Record<string, string>,
			);

		const nonEmptyNames = Object.fromEntries(
			Object.entries(names).filter(([, value]) => value.length > 0),
		);

		if (Object.keys(nonEmptyNames).length === 0) {
			return {
				ok: false,
				data: { parentId, names },
				errors: ["Please provide at least one name."],
			} satisfies ActionData;
		}

		if (parentId) {
			if (!isValidUUID(parentId)) {
				return {
					ok: false,
					data: { parentId, names },
					errors: ["Parent ID must be a valid UUID."],
				} satisfies ActionData;
			}

			const parent = await DivisionRepository.getById(
				parentId,
				countryAccountsId,
			);
			if (!parent) {
				return {
					ok: false,
					data: { parentId, names },
					errors: ["Parent division was not found."],
				} satisfies ActionData;
			}

			const topLevelParent = await getTopLevelParentInTenant(
				parentId,
				countryAccountsId,
			);
			if (!topLevelParent) {
				return {
					ok: false,
					data: { parentId, names },
					errors: [
						"The top-level parent division was not found in this tenant.",
					],
				} satisfies ActionData;
			}
		}

		const data: InsertDivision = {
			parentId: parentId || null,
			name: nonEmptyNames,
			countryAccountsId,
		};

		const result = await createDivision(data, countryAccountsId);
		if (!result.ok) {
			return {
				ok: false,
				data: { parentId, names },
				errors: result.errors,
			} satisfies ActionData;
		}

		const backendCtx = new BackendContext(actionArgs);
		const parentParam = parentId
			? `?parent=${encodeURIComponent(parentId)}&view=table`
			: "?view=table";
		return redirectWithMessage(actionArgs, `/settings/geography${parentParam}`, {
			type: "success",
			text: backendCtx.t({
				code: "common.new_record_created",
				msg: "New record created",
			}),
		});
	},
);

type BreadcrumbProps = {
	ctx: ViewContext;
	rows: DivisionBreadcrumbRow[] | null;
};

function Breadcrumb({ ctx, rows }: BreadcrumbProps) {
	if (!rows) {
		return null;
	}

	const home: MenuItem = {
		label: ctx.t({ code: "geographies.geographic_levels", msg: "Geographic levels" }),
		template: (item, options) => (
			<LangLink
				lang={ctx.lang}
				to="/settings/geography?view=table"
				className={options.className}
			>
				{item.label}
			</LangLink>
		),
	};

	const model: MenuItem[] = rows.map((row) => ({
		label: row.name,
		template: (item, options) => (
			<LangLink
				lang={ctx.lang}
				to={`/settings/geography?parent=${row.id}&view=table`}
				className={options.className}
			>
				{item.label}
			</LangLink>
		),
	}));

	return (
		<PrimeBreadCrumb
			className="mb-4"
			home={home}
			model={model}
		/>
	);
}

export default function NewGeographyPage() {
	const ld = useLoaderData<typeof loader>();
	const actionData = useActionData<typeof action>();
	const navigation = useNavigation();
	const navigate = useNavigate();
	const ctx = new ViewContext();

	const isSubmitting = navigation.state === "submitting";
	const navSettings = <NavSettings ctx={ctx} userRole={ld.userRole ?? undefined} />;

	const fields = actionData?.data ?? {
		parentId: ld.initialParentId,
		names: Object.fromEntries(ld.initialLangs.map((lang) => [lang, ""])),
	};

	const langs = Object.keys(fields.names).length > 0
		? Object.keys(fields.names).sort()
		: ld.initialLangs;

	const parentParam = fields.parentId
		? `?parent=${encodeURIComponent(fields.parentId)}&view=table`
		: "?view=table";

	return (
		<MainContainer
			title={ctx.t({
				code: "geographies.geographic_levels",
				msg: "Geographic levels",
			})}
			headerExtra={navSettings}
		>
			<div className="mx-auto w-full max-w-2xl">
				<Breadcrumb ctx={ctx} rows={ld.breadcrumbs} />

				<Card className="shadow-sm">
					<div className="mb-1 flex items-center gap-3">
						<div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
							<i className="pi pi-plus text-lg text-primary" />
						</div>
						<div>
							<h2 className="text-lg font-semibold text-gray-800">
								{ctx.t({
									code: "geographies.add_division",
									msg: "Add division",
								})}
							</h2>
							<p className="text-sm text-gray-500">
								{ctx.t({
									code: "geographies.add_division_subtitle",
									msg: "Create a new administrative division.",
								})}
							</p>
						</div>
					</div>

					<Divider className="my-4" />

					{actionData && !actionData.ok && (
						<Message
							className="mb-4 w-full"
							severity="error"
							text={actionData.errors?.[0] || "Failed to create division"}
						/>
					)}

					<Form method="post" className="flex flex-col gap-5">
						<div className="flex flex-col gap-1">
							<label htmlFor="field-parentId" className="text-sm font-medium text-gray-700">
								{ctx.t({ code: "common.parent_id", msg: "Parent ID" })}
							</label>
							<InputText
								id="field-parentId"
								name="parentId"
								defaultValue={fields.parentId}
								placeholder={ctx.t({
									code: "geographies.parent_id_placeholder",
									msg: "Leave empty for top-level division",
								})}
								className="w-full"
							/>
						</div>

						<div className="flex flex-col gap-4">
							<p className="text-sm font-medium text-gray-700">
								{ctx.t({
									code: "geographies.names_by_language",
									msg: "Names by language",
								})}
							</p>
							{langs.map((lang) => (
								<div key={lang} className="flex flex-col gap-1">
									<label
										htmlFor={`field-name-${lang}`}
										className="flex items-center gap-2 text-sm font-medium text-gray-700"
									>
										<span className="inline-flex items-center rounded bg-gray-100 px-2 py-0.5 text-xs font-semibold uppercase text-gray-600">
											{lang}
										</span>
										{ctx.t(
											{
												code: "geographies.name_with_lang",
												msg: "Name ({lang})",
											},
											{ lang },
										)}
									</label>
									<InputText
										id={`field-name-${lang}`}
										name={`names[${lang}]`}
										defaultValue={fields.names[lang] || ""}
										className="w-full"
									/>
								</div>
							))}
						</div>

						<Divider className="my-1" />

						<div className="flex flex-wrap items-center justify-between gap-3">
							<Button
								type="button"
								outlined
								icon="pi pi-arrow-left"
								label={ctx.t({ code: "common.back_to_list", msg: "Back to list" })}
								onClick={() => navigate(ctx.url(`/settings/geography${parentParam}`))}
							/>
							<Button
								type="submit"
								icon="pi pi-check"
								label={ctx.t({
									code: "common.save",
									msg: "Save",
								})}
								loading={isSubmitting}
								disabled={isSubmitting}
							/>
						</div>
					</Form>
				</Card>
			</div>
		</MainContainer>
	);
}
