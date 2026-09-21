import { ConflictError, ValidationError } from "~/shared/errors";

/** A directed cause -> effect edge in `hazardous_event_causality`'s graph (design.md Decision 6 — plain in-memory shape, no port/DB). */
export interface CausalEdge {
	readonly causeId: string;
	readonly effectId: string;
}

/** Runaway-traversal safety cap in distinct nodes visited, not path depth (design.md Decision 4, Risks). */
export const CAUSAL_CHAIN_TRAVERSAL_CAP = 500;

/** Forward adjacency (cause -> effect) built once so traversal doesn't re-filter `existingEdges` per node (O(V+E), not O(V*E)). */
function buildForwardAdjacency(
	existingEdges: readonly CausalEdge[],
): Map<string, string[]> {
	const adjacency = new Map<string, string[]>();
	for (const edge of existingEdges) {
		const effects = adjacency.get(edge.causeId);
		if (effects) {
			effects.push(edge.effectId);
		} else {
			adjacency.set(edge.causeId, [edge.effectId]);
		}
	}
	return adjacency;
}

/**
 * Asserts that linking `causeId -> effectId` would not close a cycle in `existingEdges`.
 *
 * @throws {ConflictError} for the trivial self-cause case, or when `causeId` is reachable by
 *   following existing edges forward from `effectId` (design.md Decisions 2/3/5).
 * @throws {ValidationError} when traversal needs to visit more than `CAUSAL_CHAIN_TRAVERSAL_CAP`
 *   distinct nodes before resolving either way — distinct from a confirmed cycle (design.md Decision 4/5).
 */
export function assertCausalLinkDoesNotCreateCycle(
	existingEdges: readonly CausalEdge[],
	causeId: string,
	effectId: string,
): void {
	// Checked before any traversal so it holds even with existingEdges empty (design.md Decision 3).
	if (causeId === effectId) {
		throw new ConflictError(
			"A hazardous event cannot be its own cause and effect",
			{ causeId, effectId },
		);
	}

	const adjacency = buildForwardAdjacency(existingEdges);

	// effectId is the traversal start and counts as the first visited node (design.md Decision 4).
	const visited = new Set<string>([effectId]);
	const queue: string[] = [effectId];
	// Head-index pointer instead of queue.shift(): shift() is O(n) per call, which would make
	// this loop O(V^2) if CAUSAL_CHAIN_TRAVERSAL_CAP is ever retuned upward (Gate 10 finding).
	let head = 0;

	while (head < queue.length) {
		const current = queue[head++];
		for (const next of adjacency.get(current) ?? []) {
			// Cycle confirmation is checked before the cap, so it's never misreported as
			// cap-exceeded, even on what would be the (cap + 1)th visited node (design.md Decision 4/5).
			if (next === causeId) {
				throw new ConflictError(
					"Linking this cause and effect would close a cycle in the causal chain",
					{ causeId, effectId },
				);
			}
			if (visited.has(next)) {
				continue;
			}
			if (visited.size >= CAUSAL_CHAIN_TRAVERSAL_CAP) {
				throw new ValidationError(
					"Causal chain traversal exceeded the safety cap before it could be verified acyclic",
					{ causeId, effectId, cap: CAUSAL_CHAIN_TRAVERSAL_CAP },
				);
			}
			visited.add(next);
			queue.push(next);
		}
	}
}
