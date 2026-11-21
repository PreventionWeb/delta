import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { TFunction } from "i18next";
import { useViewContext } from "~/frontend/context";
import {
	cachedDivisionTree,
	fetchDivisionTree,
	findNode,
	subscribeDivisionTree,
	type DivisionTreeNode,
} from "./divisionTree";

export interface DivisionTreeState {
	status: "loading" | "ready" | "error";
	/** Empty until ready. */
	tree: readonly DivisionTreeNode[];
}

const LOADING: DivisionTreeState = { status: "loading", tree: [] };

/** The tenant's division tree via the per-URL cached `fetchDivisionTree`; fetches only while
 * `enabled`. */
export function useDivisionTree(enabled = true): DivisionTreeState {
	const ctx = useViewContext();
	const url = ctx.url("/api/division/tree");
	// Subscribed, so a tree another instance caches reaches one that errored or mounted disabled.
	const cached = useSyncExternalStore(
		subscribeDivisionTree,
		() => cachedDivisionTree(url),
		() => null,
	);
	const [state, setState] = useState<DivisionTreeState>(LOADING);
	const [stateUrl, setStateUrl] = useState(url);

	// A new URL (language) must never show the previous URL's tree; reset during render.
	if (url !== stateUrl) {
		setStateUrl(url);
		setState(LOADING);
	}

	useEffect(() => {
		if (!enabled) {
			return;
		}
		let cancelled = false;
		// A failed fetch isn't cached, so this retries it.
		setState((prev) => (prev.status === "error" ? LOADING : prev));
		fetchDivisionTree(url).then(
			(tree) => {
				if (!cancelled) setState({ status: "ready", tree });
			},
			() => {
				if (!cancelled) setState({ status: "error", tree: [] });
			},
		);
		return () => {
			cancelled = true;
		};
	}, [enabled, url]);

	return useMemo<DivisionTreeState>(
		() => (cached ? { status: "ready", tree: cached } : state),
		[cached, state],
	);
}

/** A division's breadcrumb path, or "Unknown division (id)" -- the one label rows, chips, the
 * entry dialog and the detail page all show. */
export function divisionLabel(
	tree: readonly DivisionTreeNode[],
	id: string,
	t: TFunction<"hazardous-events">,
): string {
	return (
		findNode(tree, id)?.path ??
		t("form.spatial_footprint.division_dialog.unknown_division", { id })
	);
}
