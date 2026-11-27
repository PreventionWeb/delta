import { Outlet } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { optionalUser } from "~/utils/auth";
import {
	toSafeClientUserSession,
	type SafeClientUserSession,
} from "./_authenticated";

// Resolves an optional session so child routes can personalise rendering without enforcing auth.
// TOTP-incomplete sessions are redirected by optionalUser — do not suppress that throw.
export type PublicLayoutData = {
	userSession: SafeClientUserSession | null;
};

export async function loader(args: LoaderFunctionArgs) {
	const userSession = await optionalUser({
		request: args.request,
		params: args.params,
	});
	return Response.json({
		userSession: userSession ? toSafeClientUserSession(userSession) : null,
	} satisfies PublicLayoutData);
}

export default function PublicLayout() {
	return <Outlet />;
}
