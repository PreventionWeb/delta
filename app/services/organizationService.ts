import { BackendContext } from "~/backend.server/context";
import { OrganizationRepository } from "~/db/queries/organizationRepository";
import { dr } from "~/db.server";
import { parseOrganizationsQuery } from "~/frontend/organizationAction";

export { parseOrganizationsQuery };

interface GetOrganizationsPageDataArgs {
	request: Request;
	countryAccountsId: string;
}

interface OrganizationActionServiceArgs {
	backendCtx: BackendContext;
	countryAccountsId: string;
	formData: FormData;
}

export type OrganizationActionResult =
	| {
			ok: true;
			intent: "create" | "update" | "delete";
	  }
	| {
			ok: false;
			fieldErrors?: { name?: string };
			error: string;
	  };

function readFormString(formData: FormData, key: string): string {
	const value = formData.get(key);
	return typeof value === "string" ? value.trim() : "";
}

export const OrganizationService = {
	async getOrganizationsPageData({
		request,
		countryAccountsId,
	}: GetOrganizationsPageDataArgs) {
		const url = new URL(request.url);
		const query = parseOrganizationsQuery(url);
		const filters = {
			search: query.search,
			sort: query.sort,
			dir: query.dir,
		};

		const data = await OrganizationRepository.listByCountryAccountsId({
			countryAccountsId,
			search: query.search,
			sort: query.sort,
			dir: query.dir,
			pagination: {
				page: query.page,
				pageSize: query.pageSize,
			},
		});

		return {
			filters,
			data,
		};
	},

	async organizationAction({
		backendCtx,
		countryAccountsId,
		formData,
	}: OrganizationActionServiceArgs): Promise<OrganizationActionResult> {
		const intent = readFormString(formData, "intent");

		try {
			if (intent === "create") {
				const name = readFormString(formData, "name");

				if (!name) {
					const msg = backendCtx.t({
						code: "organizations.enter_name",
						msg: "Enter a name.",
					});
					return { ok: false, fieldErrors: { name: msg }, error: msg };
				}

				const duplicate =
					await OrganizationRepository.getByNameAndCountryAccountsId(
						name,
						countryAccountsId,
					);
				if (duplicate) {
					const msg = backendCtx.t({
						code: "organizations.duplicate_name",
						msg: "An organization with this name already exists.",
					});
					return { ok: false, fieldErrors: { name: msg }, error: msg };
				}

				const result = await dr.transaction((tx) =>
					OrganizationRepository.create(
						{
							name,
							countryAccountsId,
						},
						tx,
					),
				);

				if (!result) {
					return {
						ok: false,
						error: backendCtx.t({
							code: "organizations.unable_to_create",
							msg: "Unable to create organization",
						}),
					};
				}

				return { ok: true, intent };
			}

			if (intent === "update") {
				const id = readFormString(formData, "id");
				const name = readFormString(formData, "name");

				if (!id) {
					return {
						ok: false,
						error: backendCtx.t({
							code: "organizations.id_required",
							msg: "Organization id is required",
						}),
					};
				}

				if (!name) {
					const msg = backendCtx.t({
						code: "organizations.enter_name",
						msg: "Enter a name.",
					});
					return { ok: false, fieldErrors: { name: msg }, error: msg };
				}

				const existing = await OrganizationRepository.getById(id);
				if (!existing || existing.countryAccountsId !== countryAccountsId) {
					throw new Response("Not Found", { status: 404 });
				}

				const duplicate =
					await OrganizationRepository.getByNameAndCountryAccountsId(
						name,
						countryAccountsId,
					);
				if (duplicate && duplicate.id !== id) {
					const msg = backendCtx.t({
						code: "organizations.duplicate_name",
						msg: "An organization with this name already exists.",
					});
					return { ok: false, fieldErrors: { name: msg }, error: msg };
				}

				const result = await dr.transaction((tx) =>
					OrganizationRepository.updateById(id, { name }, tx),
				);

				if (!result) {
					return {
						ok: false,
						error: backendCtx.t({
							code: "organizations.unable_to_update",
							msg: "Unable to update organization",
						}),
					};
				}

				return { ok: true, intent };
			}

			if (intent === "delete") {
				const id = readFormString(formData, "id");

				if (!id) {
					return {
						ok: false,
						error: backendCtx.t({
							code: "organizations.id_required",
							msg: "Organization id is required",
						}),
					};
				}

				const existing = await OrganizationRepository.getById(id);
				if (!existing || existing.countryAccountsId !== countryAccountsId) {
					throw new Response("Not Found", { status: 404 });
				}

				const result = await OrganizationRepository.deleteById(id);
				if (!result) {
					return {
						ok: false,
						error: backendCtx.t({
							code: "organizations.unable_to_delete",
							msg: "Unable to delete organization",
						}),
					};
				}

				return { ok: true, intent };
			}

			return {
				ok: false,
				error: backendCtx.t({
					code: "common.invalid_action",
					msg: "Invalid action",
				}),
			};
		} catch (err: unknown) {
			if (err instanceof Response) {
				throw err;
			}

			const errObj =
				typeof err === "object" && err !== null
					? (err as {
							code?: unknown;
							message?: unknown;
							cause?: { code?: unknown; message?: unknown };
						})
					: null;
			const dbCode = errObj?.code ?? errObj?.cause?.code;
			const dbMessage = String(errObj?.message ?? errObj?.cause?.message ?? "");

			if (
				dbCode === "23503" ||
				/foreign key constraint|violates foreign key/i.test(dbMessage)
			) {
				return {
					ok: false,
					error: backendCtx.t({
						code: "organization.delete_blocked_by_dependencies",
						msg: "This organization cannot be deleted because it is still being used by one or more records. Remove those assignments first.",
					}),
				};
			}

			if (dbCode === "23505") {
				const msg = backendCtx.t({
					code: "organizations.duplicate_name",
					msg: "An organization with this name already exists.",
				});
				return { ok: false, fieldErrors: { name: msg }, error: msg };
			}

			return {
				ok: false,
				error:
					err instanceof Error
						? err.message
						: backendCtx.t({
								code: "common.unknown_error",
								msg: "Unknown error",
							}),
			};
		}
	},
};
