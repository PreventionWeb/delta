import type { RoleId } from "~/frontend/user/roles";

/**
 * Structural typing for Express request decorated with auth and tenant context.
 *
 * Avoids `@types/express` import. Used across all NestJS auth and authz guards.
 */
export interface AuthenticatedRequest {
	url: string;
	headers: {
		cookie?: string;
		"x-auth"?: string;
		"accept-language"?: string;
		[key: string]: string | undefined;
	};
	tenantId: string;
	userId: string;
	role?: RoleId;
}
