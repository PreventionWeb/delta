import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import DisasterRecordReviewStep from "~/frontend/disaster-record/DisasterRecordReviewStep";

describe("DisasterRecordReviewStep", () => {
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
		id: "9aedab2f-e424-414c-b62c-fdc7385d1e7c",
		disasterEventId: "de-1234",
		cpDisplayName: "Eastern Valley Earthquake 2026",
		locationDesc: "Highland District Valley",
		startDate: "2026-10-10",
		endDate: "2026-10-12",
		localWarnInst: "Evacuation to higher ground",
		primaryDataSource: "National Disaster Management Agency",
		otherDataSource: "Red Cross Rapid Assessment",
		fieldAssessDate: "2026-10-14",
		assessmentModes: "Satellite imagery and door-to-door survey",
		originatorRecorderInst: "Ministry of Interior",
		validatedBy: "Dr. A. Taylor",
		checkedBy: "M. Smith",
		dataCollector: "J. Doe",
		createdAt: "2026-10-10T06:00:00Z",
		updatedAt: "2026-10-12T08:00:00Z",
		hipType: { name: { en: "Geological" } },
		hipCluster: { name: { en: "Earthquake" } },
		hipHazard: { code: "EQ001", name: { en: "Ground shaking" } },
		spatialFootprint: [
			{
				map_option: "Geographic level",
				geographic_level: "Highland District",
			},
		],
		attachments: [
			{
				id: "att-1",
				fileName: "Field_Damage_Report.pdf",
				fileType: "application/pdf",
				fileSize: 2097152,
			},
		],
		disasterRecord: [],
	};

	const sampleHumanEffectsTotals = {
		deaths: 14,
		injured: 45,
		missing: 2,
		directlyAffected: 1200,
		indirectlyAffected: 3400,
		displaced: 350,
	};

	const sampleHumanEffectsDisaggregation = [
		{
			tableId: "Deaths",
			label: "Deaths Disaggregation",
			defs: [
				{ dbName: "gender", uiName: "Gender" },
				{ dbName: "count", uiName: "Count" },
			],
			rows: [
				["Female", 8],
				["Male", 6],
			],
		},
	];

	const sampleSectors = [
		{
			catId: "sec-1",
			categoryTreeDisplay: "Social / Housing",
		},
	];

	const sampleNonecoLosses = [
		{
			categoryTreeDisplay: "Cultural Heritage",
			noneccoDesc: "Damage to ancient historic shrine",
		},
	];

	const sampleAuditLogs = [
		{
			id: "log-1",
			action: "Create disaster record",
			by: "Field Agent",
			organization: "UNDRR",
			timestamp: new Date("2026-10-10T06:00:00Z"),
		},
	];

	it("renders all harmonized card headers matching Disaster Events basis", () => {
		const html = renderInRouter(
			<DisasterRecordReviewStep
				ctx={mockCtx}
				item={sampleItem}
				humanEffectsTotals={sampleHumanEffectsTotals}
				humanEffectsDisaggregation={sampleHumanEffectsDisaggregation}
				recordsDisRecSectors={sampleSectors}
				recordsNonecoLosses={sampleNonecoLosses}
				auditLogs={sampleAuditLogs}
			/>,
		);

		expect(html).toContain("Basic information");
		expect(html).toContain("Hazard details");
		expect(html).toContain("Location");
		expect(html).toContain("Human effects");
		expect(html).toContain("Sector effects");
		expect(html).toContain("Non-economic losses");
		expect(html).toContain("Attachments");
		expect(html).toContain("Audit log history");
	});

	it("renders basic info fields and linked disaster event name", () => {
		const html = renderInRouter(
			<DisasterRecordReviewStep ctx={mockCtx} item={sampleItem} />,
		);

		expect(html).toContain("9aedab2f-e424-414c-b62c-fdc7385d1e7c");
		expect(html).toContain("Eastern Valley Earthquake 2026");
		expect(html).toContain("Ministry of Interior");
		expect(html).toContain("National Disaster Management Agency");
		expect(html).toContain("Red Cross Rapid Assessment");
		expect(html).toContain("Dr. A. Taylor");
	});

	it("renders hazard details and location description", () => {
		const html = renderInRouter(
			<DisasterRecordReviewStep ctx={mockCtx} item={sampleItem} />,
		);

		expect(html).toContain("Geological");
		expect(html).toContain("Earthquake");
		expect(html).toContain("Ground shaking");
		expect(html).toContain("EQ001");
		expect(html).toContain("Highland District Valley");
	});

	it("renders summary KPI metric chips at the top of Human effects and formats false as '-'", () => {
		const html = renderInRouter(
			<DisasterRecordReviewStep
				ctx={mockCtx}
				item={sampleItem}
				humanEffectsTotals={{
					deaths: false,
					injured: false,
					missing: false,
					directlyAffected: false,
					indirectlyAffected: false,
					displaced: 2,
				}}
			/>,
		);

		expect(html).toContain("Deaths");
		expect(html).toContain("Injured");
		expect(html).toContain("Missing");
		expect(html).toContain("Directly");
		expect(html).toContain("Indirectly");
		expect(html).toContain("Displaced");
		expect(html).toContain("2");
		expect(html).not.toContain("false");
		expect(html).not.toContain("Affected (Old DesInventar)");
	});

	it("renders disaggregation details in Human effects", () => {
		const html = renderInRouter(
			<DisasterRecordReviewStep
				ctx={mockCtx}
				item={sampleItem}
				humanEffectsDisaggregation={sampleHumanEffectsDisaggregation}
			/>,
		);

		expect(html).toContain("Deaths Disaggregation");
		expect(html).toContain("Female");
		expect(html).toContain("Male");
	});

	it("renders non-economic losses table and preserves newlines in description", () => {
		const multilineLosses = [
			{
				categoryTreeDisplay: "Biodiversity > Species diversity",
				noneccoDesc:
					"First line of loss description\nSecond line after newline",
			},
		];

		const html = renderInRouter(
			<DisasterRecordReviewStep
				ctx={mockCtx}
				item={sampleItem}
				recordsNonecoLosses={multilineLosses}
			/>,
		);

		expect(html).toContain("Biodiversity &gt; Species diversity");
		expect(html).toContain("First line of loss description");
		expect(html).toContain("Second line after newline");
		expect(html).toContain("<br");
	});

	it("renders attachments with file size and icon", () => {
		const html = renderInRouter(
			<DisasterRecordReviewStep ctx={mockCtx} item={sampleItem} />,
		);

		expect(html).toContain("Field_Damage_Report.pdf");
		expect(html).toContain("2.0 MB");
	});

	it("renders form-style attachments table with title, tags, and links", () => {
		const itemWithFormAttachments = {
			...sampleItem,
			attachments: [
				{
					id: "att-link",
					title: "xxx",
					tag: [
						{ name: "Agriculture (Productive)" },
						{ name: "Community infrastructure (Infrastructures)" },
					],
					file_option: "Link",
					url: "www.google.com",
				},
				{
					id: "att-file",
					title: "yyy",
					tag: [
						{ name: "Commerce and Trade (Productive)" },
						{ name: "Agriculture (Productive)" },
					],
					file_option: "File",
					file: {
						name: "GitHub CoPilot Onboarding.pdf",
						size: 1048576,
					},
				},
			],
		};

		const html = renderInRouter(
			<DisasterRecordReviewStep ctx={mockCtx} item={itemWithFormAttachments} />,
		);

		// Check table headers
		expect(html).toContain("Title");
		expect(html).toContain("Tags");
		expect(html).toContain("File/URL");

		// Check row 1: link
		expect(html).toContain("xxx");
		expect(html).toContain("Agriculture (Productive)");
		expect(html).toContain("Community infrastructure (Infrastructures)");
		expect(html).toContain("www.google.com");
		expect(html).toContain("https://www.google.com");

		// Check row 2: file
		expect(html).toContain("yyy");
		expect(html).toContain("Commerce and Trade (Productive)");
		expect(html).toContain("GitHub CoPilot Onboarding.pdf");
		expect(html).toContain("1.0 MB");
	});

	it("handles JSON-stringified attachments correctly", () => {
		const itemWithJsonAttachments = {
			...sampleItem,
			attachments: JSON.stringify([
				{
					id: "att-json",
					title: "Resource Document",
					tag: [{ name: "Environment" }],
					file_option: "Link",
					url: "https://example.org/report",
				},
			]),
		};

		const html = renderInRouter(
			<DisasterRecordReviewStep ctx={mockCtx} item={itemWithJsonAttachments} />,
		);

		expect(html).toContain("Resource Document");
		expect(html).toContain("Environment");
		expect(html).toContain("https://example.org/report");
	});
});
