/**
 * Structural typing for Express request decorated with auth context.
 *
 * Avoids `@types/express` import. Used across all NestJS auth guards
 * (`SessionAuthGuard`, `ApiKeyAuthGuard`, `ApiKeyOrSessionAuthGuard`).
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
}
