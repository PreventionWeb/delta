import { Outlet, useLoaderData } from "react-router";
import { loadDisasterEventLayoutData } from "~/backend.server/handlers/events/disasterEventLayoutListing";
import DisasterEventsPage from "~/frontend/disaster-event/DisasterEventsPage";
import { authLoaderWithPerm } from "~/utils/auth";

export const loader = authLoaderWithPerm(
    "ViewDisasterEvents",
    async ({ request, url }) => loadDisasterEventLayoutData({ request, url }),
);

export default function DisasterEventLayoutRoute() {
    const {
        showListing,
        items,
        hipTypes,
        hipClusters,
        hipHazards,
        pagination,
        canDeleteDisasterEvent,
        canEditDisasterEvent,
        loggedInUserRoleName,
        countryName,
        filters,
    } =
        useLoaderData<typeof loader>();

    if (!showListing) {
        return <Outlet />;
    }

    return (
        <>
            <DisasterEventsPage
                data={items}
                hipTypes={hipTypes}
                hipClusters={hipClusters}
                hipHazards={hipHazards}
                pagination={pagination}
                canDelete={canDeleteDisasterEvent}
                canEdit={canEditDisasterEvent}
                loggedInUserRoleName={loggedInUserRoleName}
                countryName={countryName}
                filters={filters}
            />
            <Outlet />
        </>
    );
}
