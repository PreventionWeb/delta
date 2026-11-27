import { Outlet } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { requireUser } from "~/utils/auth";
import type { UserSession } from "~/utils/session";

export type SafeClientUserSession = {
	user: {
		id: string;
		email: string;
		firstName: string;
		lastName: string;
		emailVerified: boolean;
		totpEnabled: boolean;
	};
};

export function toSafeClientUserSession(
	userSession: UserSession,
): SafeClientUserSession {
	return {
		user: {
			id: userSession.user.id,
			email: userSession.user.email,
			firstName: userSession.user.firstName,
			lastName: userSession.user.lastName,
			emailVerified: userSession.user.emailVerified,
			totpEnabled: userSession.user.totpEnabled,
		},
	};
}

// Centralises auth enforcement so child routes do not need to duplicate it — Strangler Fig migration.
// Does not validate countryAccountsId: some authenticated routes (e.g. select-instance) don't need it.
export type AuthenticatedLayoutData = {
	userSession: SafeClientUserSession;
};

export async function loader(args: LoaderFunctionArgs) {
	const userSession = await requireUser({
		request: args.request,
		params: args.params,
	});
	return Response.json({
		userSession: toSafeClientUserSession(userSession),
	} satisfies AuthenticatedLayoutData);
}

export default function AuthenticatedLayout() {
	return <Outlet />;
}
