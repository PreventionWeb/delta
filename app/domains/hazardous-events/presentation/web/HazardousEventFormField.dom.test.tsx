import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HazardousEventFormField } from "./HazardousEventFormField";

// task 9.10: every field built against this generic wrapper renders its own error list when
// its key is present in the action's returned per-field error map.
describe("HazardousEventFormField (task 9.9/9.10)", () => {
	it("renders the literal ' *' required-marker suffix when required", () => {
		render(
			<HazardousEventFormField label="Start date" required htmlFor="startDate">
				<input id="startDate" name="startDate" type="date" />
			</HazardousEventFormField>,
		);

		expect(screen.getByText("Start date *")).toBeTruthy();
	});

	it("renders no suffix when not required", () => {
		render(
			<HazardousEventFormField label="Magnitude" htmlFor="magnitude">
				<input id="magnitude" name="magnitude" type="text" />
			</HazardousEventFormField>,
		);

		expect(screen.getByText("Magnitude")).toBeTruthy();
	});

	it("renders no error list when no errors are given", () => {
		render(
			<HazardousEventFormField label="Start date" htmlFor="startDate">
				<input id="startDate" name="startDate" type="date" />
			</HazardousEventFormField>,
		);

		expect(screen.queryByRole("list")).toBeNull();
	});

	it("renders its own visible error list when its field key is present in the error map", () => {
		render(
			<HazardousEventFormField
				label="Start date"
				htmlFor="startDate"
				errors={["startDate must not be later than endDate"]}
			>
				<input id="startDate" name="startDate" type="date" />
			</HazardousEventFormField>,
		);

		expect(
			screen.getByText("startDate must not be later than endDate"),
		).toBeTruthy();
	});
});
