import * as path from "path";
import { ValidationError } from "~/shared/errors";

// Windows reserved device names are invalid even with an extension (`NUL.txt` -> NUL device).
// Not reachable today, but guards future non-HE callers (Gate 10 finding).
const RESERVED_DEVICE_NAME_PATTERN =
	/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)/i;

/** Keeps only the final path segment, neutralizing ".." regardless of separator (Decision 1).
 * Shared by the adapter and the HE parser so there's one basename implementation, not two
 * (Gate 8 finding). */
export function sanitizeBasename(name: string): string {
	if (name.includes("\0")) {
		throw new ValidationError("Invalid attachment file name");
	}
	const normalized = name.replace(/\\/g, "/");
	const base = path.posix.basename(normalized);
	if (
		base === "" ||
		base === "." ||
		base === ".." ||
		RESERVED_DEVICE_NAME_PATTERN.test(base)
	) {
		throw new ValidationError("Invalid attachment file name");
	}
	return base;
}
