import { beforeAll, describe, expect, it, vi } from "vitest";
import { parseAccessManagementQuery } from "~/routes/$lang+/settings+/access-mgmnt+/_layout";
import { isFetcherRequest } from "~/frontend/user/accessManagementAction";

beforeAll(() => {
	(globalThis as any).createTranslationGetter = () => () => null;
});

vi.mock("~/utils/auth", () => ({
	authLoaderWithPerm: (_perm: string, fn: any) => fn,
	authActionWithPerm: (_perm: string, fn: any) => fn,
}));

vi.mock("~/utils/session", () => ({
	getCountryAccountsIdFromSession: vi.fn().mockResolvedValue("tenant-1"),
	getCountrySettingsFromSession: vi
		.fn()
		.mockResolvedValue({ websiteName: "DELTA", countryName: "Haiti" }),
	getUserFromSession: vi
		.fn()
		.mockResolvedValue({ user: { id: "admin-1", email: "admin@example.org" } }),
	getUserRoleFromSession: vi.fn().mockResolvedValue("admin"),
	redirectWithMessage: vi
		.fn()
		.mockReturnValue(new Response(null, { status: 302 })),
}));

vi.mock("~/services/accessManagementService", async (importOriginal) => {
	const actual = await importOriginal<any>();
	return {
		...actual,
		AccessManagementService: {
			inviteUser: vi.fn().mockResolvedValue(undefined),
			updateUser: vi.fn().mockResolvedValue(undefined),
			deleteUser: vi.fn().mockResolvedValue(undefined),
			resendInvitation: vi.fn().mockResolvedValue(undefined),
		},
	};
});

import {
	AccessManagementService,
	AccessManagementServiceError,
} from "~/services/accessManagementService";
import { action as newAction } from "~/routes/$lang+/settings+/access-mgmnt+/new";
import { action as editAction } from "~/routes/$lang+/settings+/access-mgmnt+/edit.$id";
import { action as deleteAction } from "~/routes/$lang+/settings+/access-mgmnt+/delete.$id";
import { action as resendAction } from "~/routes/$lang+/settings+/access-mgmnt+/resend-invitation.$id";

describe("Access management route query parsing and fetcher actions", () => {
	it("parseAccessManagementQuery defaults page=1, pageSize=25, sort=added, dir=desc and sanitizes invalid params", () => {
		const defaults = parseAccessManagementQuery(
			new URL("http://localhost:3000/en/settings/access-mgmnt/"),
		);
		expect(defaults).toEqual({
			search: "",
			role: "all",
			sort: "added",
			dir: "desc",
			page: 1,
			pageSize: 25,
		});

		const invalid = parseAccessManagementQuery(
			new URL(
				"http://localhost:3000/en/settings/access-mgmnt/?sort=hacked&dir=sideways&page=-5&pageSize=999",
			),
		);
		expect(invalid).toEqual({
			search: "",
			role: "all",
			sort: "added",
			dir: "desc",
			page: 1,
			pageSize: 25,
		});

		const valid = parseAccessManagementQuery(
			new URL(
				"http://localhost:3000/en/settings/access-mgmnt/?search=marie&role=admin&sort=name&dir=asc&page=2&pageSize=50",
			),
		);
		expect(valid).toEqual({
			search: "marie",
			role: "admin",
			sort: "name",
			dir: "asc",
			page: 2,
			pageSize: 50,
		});
	});

	it("detects fetcher requests via _fetcher form field or header", () => {
		const fd = new FormData();
		fd.set("_fetcher", "1");
		expect(
			isFetcherRequest(
				new Request("http://localhost/test", { method: "POST" }),
				fd,
			),
		).toBe(true);
		expect(
			isFetcherRequest(
				new Request("http://localhost/test", {
					method: "POST",
					headers: { "X-Requested-With": "fetcher" },
				}),
				new FormData(),
			),
		).toBe(true);
		expect(
			isFetcherRequest(
				new Request("http://localhost/test", { method: "POST" }),
				new FormData(),
			),
		).toBe(false);
	});

	it("new.tsx action returns JSON ok:true on fetcher invite with optional empty organization", async () => {
		const fd = new FormData();
		fd.set("_fetcher", "1");
		fd.set("email", "new.user@example.org");
		fd.set("organization", "");
		fd.set("role", "data-collector");

		const req = new Request(
			"http://localhost:3000/en/settings/access-mgmnt/new",
			{
				method: "POST",
				body: fd,
			},
		);
		const res = (await newAction({
			request: req,
			params: { lang: "en" },
			context: {},
		} as any)) as Response;

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body).toEqual({ ok: true });
		expect(AccessManagementService.inviteUser).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				email: "new.user@example.org",
				organization: null,
				role: "data-collector",
				countryAccountsId: "tenant-1",
			}),
		);
	});

	it("edit.$id.tsx returns JSON fieldErrors when primary admin update is rejected", async () => {
		vi.mocked(AccessManagementService.updateUser).mockRejectedValueOnce(
			new AccessManagementServiceError("Validation error", {
				status: 400,
				fieldErrors: { email: "Cannot update primary admin account data" },
			}),
		);
		const fd = new FormData();
		fd.set("_fetcher", "1");
		fd.set("role", "data-viewer");
		fd.set("organization", "");

		const req = new Request(
			"http://localhost:3000/en/settings/access-mgmnt/edit/u1",
			{ method: "POST", body: fd },
		);
		const res = (await editAction({
			request: req,
			params: { lang: "en", id: "u1" },
			context: {},
		} as any)) as Response;

		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body).toEqual({
			ok: false,
			fieldErrors: { email: "Cannot update primary admin account data" },
		});
	});

	it("delete.$id.tsx returns JSON ok:true on fetcher delete", async () => {
		const fd = new FormData();
		fd.set("_fetcher", "1");
		const req = new Request(
			"http://localhost:3000/en/settings/access-mgmnt/delete/u2",
			{ method: "POST", body: fd },
		);
		const res = (await deleteAction({
			request: req,
			params: { lang: "en", id: "u2" },
			context: {},
		} as any)) as Response;

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ ok: true });
	});

	it("resend-invitation.$id.tsx returns JSON ok:true on one-click fetcher POST", async () => {
		const fd = new FormData();
		fd.set("_fetcher", "1");
		const req = new Request(
			"http://localhost:3000/en/settings/access-mgmnt/resend-invitation/u3",
			{ method: "POST", body: fd },
		);
		const res = (await resendAction({
			request: req,
			params: { lang: "en", id: "u3" },
			context: {},
		} as any)) as Response;

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ ok: true });
	});
});
