import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import HazardousEventReviewStep from "~/frontend/events/HazardousEventReviewStep";

describe("HazardousEventReviewStep", () => {
	const mockCtx: any = {
		lang: "en",
		user: null,
		t: (item: any) => item.msg || item.code,
		url: (path: string) => `/en${path}`,
	};

	const renderInRouter = (ui: React.ReactElement) => {
		return renderToString(<MemoryRouter>{ui}</MemoryRouter>);
	};

	const sampleItem = {
		id: "5f1d8e42-e220-451c-aef6-e3e035ebcf2d",
		status: "approved",
		nationalSpecification: "Localized seismic tremors in eastern zone",
		startDate: "2026-10-10",
		endDate: "2026-10-11",
		description: "Shallow crustal earthquake",
		chainsExplanation: "Triggered secondary rockfall along highway",
		magnitude: "6.2 Richter",
		recordOriginator: "Dept of Geophysics",
		hazardousEventStatus: "ongoing" as const,
		dataSource: "National Seismic Station Network",
		createdAt: "2026-10-10T05:00:00Z",
		updatedAt: "2026-10-10T06:00:00Z",
		hipType: { name: { en: "Geological" } },
		hipCluster: { name: { en: "Earthquake" } },
		hipHazard: { code: "EQ001", name: { en: "Ground shaking" } },
		spatialFootprint: [
			{
				map_option: "Geographic level",
				geographic_level: "Highland District",
			},
			{
				map_option: "Map coordinates",
				title: "Epicenter Buffer",
				geojson: { type: "Point", coordinates: [100.5, 13.7] },
			},
		],
		attachments: [
			{
				id: "att-1",
				fileName: "Seismic_Report.pdf",
				fileType: "application/pdf",
				fileSize: 1048576,
				fileKey: "5f1d8e42-e220-451c-aef6-e3e035ebcf2d/Seismic_Report.pdf",
			},
		],
		parent: {
			id: "parent-1",
			description: "Tectonic Subsea Fault",
			hipHazard: { name: "Subsea Fault", code: "TF01" },
		},
		children: [
			{
				id: "child-1",
				description: "Rockfall along valley road",
				hipHazard: { name: "Rockfall", code: "RF02" },
			},
		],
	};

	it("renders all harmonized card headers matching Disaster Events basis", () => {
		const html = renderInRouter(
			<HazardousEventReviewStep
				ctx={mockCtx}
				item={sampleItem}
				auditLogs={[
					{
						id: "log-1",
						action: "Create hazardous event",
						by: "Admin User",
						organization: "UNDRR",
						timestamp: new Date("2026-10-10T05:00:00Z"),
					},
				]}
			/>,
		);

		expect(html).toContain("Basic information");
		expect(html).toContain("Hazard details");
		expect(html).toContain("Location");
		expect(html).toContain("Attachments");
		expect(html).toContain("Linked events");
		expect(html).toContain("Audit log history");
	});

	it("renders basic info fields and status badge correctly", () => {
		const html = renderInRouter(
			<HazardousEventReviewStep ctx={mockCtx} item={sampleItem} />,
		);

		expect(html).toContain("Dept of Geophysics");
		expect(html).toContain("6.2 Richter");
		expect(html).toContain("National Seismic Station Network");
		expect(html).toContain("5f1d8e42-e220-451c-aef6-e3e035ebcf2d");
		expect(html).toContain("Ongoing");
	});

	it("renders hazard taxonomy, timing, and explanations", () => {
		const html = renderInRouter(
			<HazardousEventReviewStep ctx={mockCtx} item={sampleItem} />,
		);

		expect(html).toContain("Geological");
		expect(html).toContain("Earthquake");
		expect(html).toContain("Ground shaking");
		expect(html).toContain("EQ001");
		expect(html).toContain("Localized seismic tremors in eastern zone");
		expect(html).toContain("Shallow crustal earthquake");
		expect(html).toContain("Triggered secondary rockfall along highway");
	});

	it("renders location divisions and spatial footprint list", () => {
		const html = renderInRouter(
			<HazardousEventReviewStep ctx={mockCtx} item={sampleItem} />,
		);

		expect(html).toContain("Highland District");
		expect(html).toContain("Epicenter Buffer");
	});

	it("renders attachment card with file size and icon", () => {
		const html = renderInRouter(
			<HazardousEventReviewStep ctx={mockCtx} item={sampleItem} />,
		);

		expect(html).toContain("Seismic_Report.pdf");
		expect(html).toContain("1.0 MB");
	});

	it("renders form-style attachments table with title, tags, and links", () => {
		const itemWithFormAttachments = {
			...sampleItem,
			attachments: [
				{
					id: "att-link",
					title: "Situation Map",
					tag: [{ name: "Geology" }],
					file_option: "Link",
					url: "www.usgs.gov",
				},
				{
					id: "att-file",
					title: "Fault Analysis",
					tag: [{ name: "Seismology" }],
					file_option: "File",
					file: {
						name: "Fault_Analysis.pdf",
						size: 2097152,
					},
				},
			],
		};

		const html = renderInRouter(
			<HazardousEventReviewStep ctx={mockCtx} item={itemWithFormAttachments} />,
		);

		expect(html).toContain("Title");
		expect(html).toContain("Tags");
		expect(html).toContain("File/URL");
		expect(html).toContain("Situation Map");
		expect(html).toContain("Geology");
		expect(html).toContain("www.usgs.gov");
		expect(html).toContain("https://www.usgs.gov");
		expect(html).toContain("Fault Analysis");
		expect(html).toContain("Seismology");
		expect(html).toContain("Fault_Analysis.pdf");
		expect(html).toContain("2.0 MB");
	});

	it("handles JSON-stringified attachments correctly", () => {
		const itemWithJsonAttachments = {
			...sampleItem,
			attachments: JSON.stringify([
				{
					id: "att-json",
					title: "Sensor Feed",
					tag: [{ name: "Sensors" }],
					file_option: "Link",
					url: "https://sensors.example.org",
				},
			]),
		};

		const html = renderInRouter(
			<HazardousEventReviewStep ctx={mockCtx} item={itemWithJsonAttachments} />,
		);

		expect(html).toContain("Sensor Feed");
		expect(html).toContain("Sensors");
		expect(html).toContain("https://sensors.example.org");
	});

	it("renders parent and child events without the add button", () => {
		const html = renderInRouter(
			<HazardousEventReviewStep ctx={mockCtx} item={sampleItem} />,
		);

		expect(html).toContain("Tectonic Subsea Fault");
		expect(html).toContain("Rockfall along valley road");
		// Ensure the add button is omitted
		expect(html).not.toContain("Add hazardous event caused by this event");
		expect(html).not.toContain("hazardous_event.add_cause");
	});
});
