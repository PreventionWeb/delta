import { HazardousEventFormFieldErrors } from "./HazardousEventFormFieldErrors";

/** Generic row wrapper for every form field -- mirrors legacy's WrapInput (input.tsx:14-30):
 * label + " *" suffix for required fields, then the control and its error list. */
export function HazardousEventFormField({
	label,
	required,
	htmlFor,
	errors,
	children,
}: {
	label: string;
	required?: boolean;
	htmlFor: string;
	errors?: readonly string[];
	children: React.ReactNode;
}) {
	return (
		<div className="dts-form-component">
			{/* Empty label renders nothing -- same as legacy (attachments/spatialFootprint pass
			 * label="" too), since those widgets render their own heading. */}
			{label !== "" && (
				<label htmlFor={htmlFor}>
					{label}
					{required ? " *" : ""}
				</label>
			)}
			{/* .dts-form-component is display:grid, so a direct grid-item control stretches full-width;
			 * this plain div reproduces legacy's own non-grid wrapper effect (Decision 9 Addendum 2, Gap 4/5). */}
			<div>{children}</div>
			<HazardousEventFormFieldErrors errors={errors} />
		</div>
	);
}
