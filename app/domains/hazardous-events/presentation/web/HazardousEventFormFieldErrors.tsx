/** Per-field server-error list -- mirrors legacy's FieldErrors2 visible-list behavior
 * (form_components.tsx:166-180), via the shared .dts-field-error-list class (no-inline-styles rule). */
export function HazardousEventFormFieldErrors({
	errors,
}: {
	errors: readonly string[] | undefined;
}) {
	if (!errors || errors.length === 0) {
		return null;
	}
	return (
		<ul className="dts-field-error-list" aria-live="assertive">
			{errors.map((error) => (
				<li key={error}>{error}</li>
			))}
		</ul>
	);
}
