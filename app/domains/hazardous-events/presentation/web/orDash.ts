/** Legacy shows "-" for an empty field value; the DTO carries "" for an unset string field.
 * Shared by every Card on the detail page. */
export function orDash(value: string): string {
	return value === "" ? "-" : value;
}
