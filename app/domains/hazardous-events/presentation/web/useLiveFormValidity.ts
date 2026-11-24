import { useLayoutEffect, useState, type RefObject } from "react";

/** Tracks `formRef`'s own native validity live, for the "Save or submit" button's `disabled` prop
 * (design.md Decision 18). Extracted from HazardousEventFormPage (SOLID review finding) -- same
 * logic, unchanged. */
export function useLiveFormValidity(
	formRef: RefObject<HTMLFormElement | null>,
): boolean {
	// Defaults to disabled (never true) -- a genuinely-invalid pre-filled edit form must start
	// disabled, not briefly render as submittable before this effect's first real check runs
	// (design.md Decision 18, the live-reproduced bug).
	const [isFormValid, setIsFormValid] = useState(false);

	// useLayoutEffect (not useEffect) so the mount-time validity check lands before the browser
	// paints -- no one-frame disabled/enabled flash either way (design.md Decision 18).
	useLayoutEffect(() => {
		const form = formRef.current;
		if (!form) return;
		setIsFormValid(form.checkValidity());

		// Deferred, not read synchronously: a native "input"/"change" listener on the <form> fires
		// in the bubble phase before React's own root-level synthetic-event listener (higher up the
		// tree, visited later) has committed that event's re-render. HazardousEventHazardPicker's own
		// filter-by-name field is the concrete case -- typing into it resets the controlled
		// specificHazardId <select>'s value via React state, so a synchronous read here would see the
		// pre-commit (still-valid) DOM. queueMicrotask lets that commit finish first, same mechanism
		// already used by submitWithAction()'s own requestSubmit() defer below. Verified empirically
		// (design.md Decision 18's addendum): removing this defer makes the button stay enabled
		// indefinitely after that interaction.
		const recheck = () =>
			queueMicrotask(() => setIsFormValid(form.checkValidity()));
		form.addEventListener("input", recheck);
		form.addEventListener("change", recheck);
		return () => {
			form.removeEventListener("input", recheck);
			form.removeEventListener("change", recheck);
		};
	}, []);

	return isFormValid;
}
