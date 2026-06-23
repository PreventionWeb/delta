import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "primereact/button";
import { Dialog } from "primereact/dialog";
import { InputText } from "primereact/inputtext";
import { ContentRepeater } from "~/components/ContentRepeater";
import { previewGeoJSON } from "~/components/ContentRepeater/controls/mapper";
import { TreeView } from "~/components/TreeView";
import { rewindGeoJSON } from "~/utils/spatialUtils";
import { ViewContext } from "./context";

type ContentRepeaterTableColumn = NonNullable<
	React.ComponentProps<typeof ContentRepeater>["table_columns"]
>[number];

type ContentRepeaterDialogField = NonNullable<
	React.ComponentProps<typeof ContentRepeater>["dialog_fields"]
>[number];

export function SpatialFootprintFormView({
	ctx,
	divisions = [],
	ctryIso3 = "",
	treeData = [],
	initialData = [],
	onChange,
}: {
	ctx: ViewContext;
	divisions: any;
	ctryIso3: string;
	treeData: any[];
	initialData: any;
	geographicLevel?: boolean;
	onChange?: (items: any) => void;
}) {
	const dialogTreeViewRef = useRef<any>(null);
	const treeViewRef = useRef<any>(null);
	const contentRepeaterRef = useRef<any>(null);
	const [isTreeDialogOpen, setIsTreeDialogOpen] = useState(false);
	const [lazyTreeData, setLazyTreeData] = useState<any[] | null>(null);
	const treeViewDiscard = useCallback((e?: any) => {
		if (e) e.preventDefault();
		setIsTreeDialogOpen(false);
		treeViewRef.current?.treeViewClear();
	}, []);
	const hasTreeDataRef = useRef<boolean>((treeData?.length ?? 0) > 0);

	useEffect(() => {
		if ((treeData?.length ?? 0) > 0) {
			hasTreeDataRef.current = true;
		}
	}, [treeData]);

	const ensureTreeDataLoaded = useCallback(async () => {
		if (hasTreeDataRef.current) {
			return;
		}

		const response = await fetch(ctx.url("/api/division/tree"));
		if (!response.ok) {
			throw new Error("Failed to load division tree");
		}

		const data = await response.json();
		const nextTreeData = Array.isArray(data) ? data : [];
		if (nextTreeData.length > 0) {
			hasTreeDataRef.current = true;
		}
		setLazyTreeData(nextTreeData);
	}, [ctx]);

	const treeViewOpen = useCallback((e: any) => {
		e.preventDefault();
		treeViewRef.current?.treeViewClear();
		setIsTreeDialogOpen(true);
	}, []);

	useEffect(() => {
		if (!isTreeDialogOpen) {
			return;
		}

		ensureTreeDataLoaded().catch((error) => {
			console.error("Failed to load geographic level tree", error);
		});
	}, [isTreeDialogOpen, ensureTreeDataLoaded]);

	const handleTreeDialogShow = useCallback(() => {
		setTimeout(() => {
			dialogTreeViewRef.current?.focus();
		}, 10);

		const contHeight = [
			dialogTreeViewRef.current?.closest(".p-dialog")?.offsetHeight || 0,
			dialogTreeViewRef.current
				?.closest(".p-dialog")
				?.querySelector(".p-dialog-header")?.offsetHeight || 0,
			dialogTreeViewRef.current?.querySelector(".tree-filters")?.offsetHeight ||
			0,
			dialogTreeViewRef.current?.querySelector(".tree-footer")?.offsetHeight ||
			0,
		];
		const getHeight =
			contHeight[0] - contHeight[1] - contHeight[2] - contHeight[3] - 16;
		const dtsFormBody =
			dialogTreeViewRef.current?.querySelector(".dts-form__body");

		if (dtsFormBody) {
			dtsFormBody.style.height = `${window.innerHeight - getHeight}px`;
		}
	}, []);

	const tableColumns = useMemo<ContentRepeaterTableColumn[]>(
		() => [
			{
				type: "dialog_field",
				dialog_field_id: "title",
				caption: ctx.t({
					code: "common.title",
					msg: "Title",
				}),
				width: "40%",
			},
			{
				type: "custom",
				caption: ctx.t({
					code: "common.option",
					msg: "Option",
				}),
				render: (item: any) => {
					if (item.map_option === "Map coordinates") {
						return (
							<span>
								{ctx.t({
									code: "spatial_footprint.map_coordinates",
									msg: "Map coordinates",
								})}
							</span>
						);
					} else if (item.map_option === "Geographic level") {
						return (
							<span>
								{ctx.t({
									code: "spatial_footprint.geographic_level",
									msg: "Geographic level",
								})}
							</span>
						);
					}
					return null;
				},
				width: "40%",
			},
			{
				type: "action",
				caption: ctx.t({
					code: "common.action",
					msg: "Action",
				}),
				width: "20%",
			},
		],
		[ctx],
	);

	const dialogFields = useMemo<ContentRepeaterDialogField[]>(
		() => [
			{
				id: "title",
				caption: ctx.t({
					code: "common.title",
					msg: "Title",
				}),
				type: "input",
				required: true,
			},
			{
				id: "map_option",
				caption: ctx.t({
					code: "spatial_footprint.item_type",
					msg: "Item type",
				}),
				type: "option",
				options: [
					{
						value: "Map coordinates",
						label: ctx.t({
							code: "geographies.map_coordinates",
							msg: "Map coordinates",
						}),
					},
					{
						value: "Geographic level",
						label: ctx.t({
							code: "geographies.geographic_level",
							msg: "Geographic level",
						}),
					},
				],
				onChange: (
					e: any,
					_formData: any,
					_setFormData: any,
					dialogFieldsArg?: any[] | null,
					setDialogFields?:
						| React.Dispatch<React.SetStateAction<any[]>>
						| null,
				) => {
					const value = e.target.value;

					if (setDialogFields && dialogFieldsArg?.length) {
						setDialogFields(
							dialogFieldsArg.map((field) => {
								if (field.id === "map_coords") {
									return {
										...field,
										show: value === "Map coordinates",
									};
								}

								if (field.id === "geographic_level") {
									return {
										...field,
										show: value === "Geographic level",
									};
								}

								return field;
							}),
						);
					}
				},
			},
			{
				id: "map_coords",
				caption: ctx.t({
					code: "spatial_footprint.map_coordinates",
					msg: "Map coordinates",
				}),
				type: "mapper",
				placeholder: "",
				mapperGeoJSONField: "geojson",
			},
			{
				id: "geographic_level",
				caption: ctx.t({
					code: "spatial_footprint.geographic_level",
					msg: "Geographic level",
				}),
				type: "custom",
				render: (data: any, _handleFieldChange: any, formData: any) => {
					return (
						<div className="space-y-3">
							<div
								id="spatialFootprint_geographic_level_container"
								className="space-y-3"
							>
								<div className="p-inputgroup">
									<InputText
										value={data || ""}
										readOnly
										className="w-full"
										placeholder={ctx.t({
											code: "spatial_footprint.select_geographic_level",
											msg: "Select geographic level",
										})}
										onClick={() => {
											if (formData["geojson"]) {
												previewGeoJSON(formData["geojson"]);
											}
										}}
									/>
									<Button
										type="button"
										label={ctx.t({
											code: "common.select",
											msg: "Select",
										})}
										icon="pi pi-globe"
										outlined
										onClick={treeViewOpen}
									/>
								</div>
							</div>
							<textarea
								id="spatialFootprint_geographic_level"
								name="spatialFootprint_geographic_level"
								className="dts-hidden-textarea"
								style={{ display: "none" }}
							></textarea>
						</div>
					);
				},
			},
			{
				id: "geojson",
				caption: ctx.t({
					code: "common.map_coordinates_geographic_level",
					msg: "Map coordinates / Geographic level",
				}),
				type: "hidden",
				required: true,
			},
		],
		[ctx, treeViewOpen],
	);

	const parsedData = (() => {
		try {
			if (Array.isArray(initialData)) return initialData;
			if (typeof initialData === "string") return JSON.parse(initialData) || [];
			return [];
		} catch {
			return [];
		}
	})();

	const effectiveTreeData = lazyTreeData ?? treeData ?? [];

	return (
		<>
			<ContentRepeater
				ctx={ctx}
				divisions={divisions}
				ctryIso3={ctryIso3}
				caption={ctx.t({
					code: "record.spatial_footprint",
					msg: "Spatial footprint",
				})}
				ref={contentRepeaterRef}
				id="spatialFootprint"
				mapper_preview={true}
				table_columns={tableColumns}
				dialog_fields={dialogFields}
				data={parsedData}
				onChange={(items: any) => {
					try {
						onChange?.(Array.isArray(items) ? items : []);
					} catch {
						console.error("Failed to process items.");
					}
				}}
			/>
			<Dialog
				visible={isTreeDialogOpen}
				onHide={treeViewDiscard}
				onShow={handleTreeDialogShow}
				modal
				baseZIndex={4000}
				className="tree-dialog"
				header={ctx.t({
					code: "spatial_footprint.select_geographic_level",
					msg: "Select geographic level",
				})}
				style={{ width: "min(92vw, 64rem)" }}
				breakpoints={{
					"1199px": "90vw",
					"767px": "95vw",
				}}
			>
				<div ref={dialogTreeViewRef}>
					<TreeView
						ctx={ctx}
						dialogMode={false}
						ref={treeViewRef}
						treeData={effectiveTreeData}
						caption={ctx.t({
							code: "spatial_footprint.select_geographic_level",
							msg: "Select geographic level",
						})}
						rootCaption={ctx.t({
							code: "spatial_footprint.geographic_levels",
							msg: "Geographic levels",
						})}
						onApply={async (selectedItems: any) => {
							if (contentRepeaterRef.current?.handleFieldChange) {
								await Promise.all(
									selectedItems.data.map(async (item: any) => {
										if (item.id == selectedItems.selectedId) {
											try {
												const res = await fetch(
													`/${ctx.lang}/api/geojson/${item.id}`,
												);
												if (!res.ok) throw new Error("Failed to fetch GeoJSON");

												const { geojson } = await res.json();
												let arrValue = {
													type: "Feature",
													geometry: geojson,
													properties: {
														division_id: selectedItems.selectedId || null,
														division_ids: selectedItems.dataIds
															? selectedItems.dataIds.split(",")
															: [],
														import_id:
															item?.importId || null
																? JSON.parse(item.importId)
																: null,
														level:
															item?.level || null
																? JSON.parse(item.level)
																: null,
														name:
															item?.name || null ? JSON.parse(item.name) : null,
														national_id:
															item?.nationalId || null
																? JSON.parse(item.nationalId)
																: null,
													},
												};
												arrValue = rewindGeoJSON(arrValue);
												const setField = { id: "geojson", value: arrValue };
												contentRepeaterRef.current.handleFieldChange(
													setField,
													arrValue,
												);
												const setFieldGoeLevel = {
													id: "geographic_level",
													value: selectedItems.names,
												};
												contentRepeaterRef.current.handleFieldChange(
													setFieldGoeLevel,
													selectedItems.names,
												);
											} catch (err) {
												console.error("Error fetching GEoJSON", err);
											}
										}
									}),
								);

								treeViewDiscard();
							}
						}}
						onClose={() => {
							treeViewDiscard();
						}}
						appendCss={`
                            ul.tree li div[disable="true"] {
                                color: #ccc;
                            }
                            ul.tree li div[disable="true"] .btn-face.select {
                                display: none;
                            }
                        `}
						disableButtonSelect={true}
						showActionFooter={true}
					/>
				</div>
			</Dialog>
		</>
	);
}
