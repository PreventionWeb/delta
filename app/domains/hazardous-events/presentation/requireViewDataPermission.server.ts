import { getUserRoleFromSession } from "~/utils/session";
import { roleHasPermission } from "~/frontend/user/roles";
import { AuthorizationError } from "~/shared/errors/DomainError";
import { throwHazardousEventLoaderError } from "./throwHazardousEventLoaderError.server";

/**
 * Replicates legacy HE's `ViewData` gate (design.md Decision 2) via a direct per-loader call, not
 * the parent `_authenticated+` layout (parallel route loaders don't let it gate children, Decision
 * 1) or legacy's `as any`-casting `authLoaderWithPerm` HOC.
 *
 * MUST be called after `requireUser()`/`resolveTenantId()` — calling it first wrongly 403s an
 * authenticated user who simply hasn't picked a tenant yet, instead of redirecting them.
 *
 * Returns the resolved role so callers that also need it (the list loader, for its data-viewer
 * filter restriction) don't re-run `getUserRoleFromSession` a second time.
 */
export async function requireViewDataPermission(args: {
	request: Request;
}): Promise<string | undefined> {
	const role = await getUserRoleFromSession(args.request);
	if (!roleHasPermission(role, "ViewData")) {
		throwHazardousEventLoaderError(
			new AuthorizationError("ViewData permission required"),
			{
				logMsg: "ViewData permission denied in hazardous-event loader",
				url: args.request.url,
			},
		);
	}
	return role;
}
