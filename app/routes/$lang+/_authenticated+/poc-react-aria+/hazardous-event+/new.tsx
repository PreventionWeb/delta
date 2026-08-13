// POC placeholder route (openspec/changes/poc-react-aria-hazardous-event, task 1.3).
// Confirms remix-flat-routes registers this isolated route tree correctly.
// Real auth wiring (replicating production new.tsx's manual requireUser ->
// getCountryAccountsIdFromSession -> hasPermission pattern, design.md Decision 2),
// fixture-backed loader data, and the React Aria Components stepper are built in
// Section 3 — intentionally not present yet.
import { useLoaderData } from "react-router";

export async function loader() {
	return { message: "POC placeholder" };
}

export default function PocHazardousEventCreatePlaceholder() {
	const { message } = useLoaderData<typeof loader>();
	return <div>{message}</div>;
}
