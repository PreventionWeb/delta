import { fieldsDefApi } from "~/frontend/events/disastereventform";
import { authLoaderApiDocs } from "~/utils/auth";
import { jsonApiDocs } from "~/backend.server/handlers/form/form_api";
import { BackendContext } from "~/backend.server/context";

export const loader = authLoaderApiDocs(async (requestArgs) => {
	const ctx = new BackendContext(requestArgs);

	let docs = await jsonApiDocs({
		ctx,
		baseUrl: "disaster-event",
		fieldsDef: await fieldsDefApi(ctx),
	});

	docs += `

	## Declarations Resource
	/en/api/disaster-event/{disasterEventId}/declarations

	- POST /en/api/disaster-event/{disasterEventId}/declarations
		Create declaration. Preferred input is multipart/form-data:
		- type, effects, declarationDate, issuingOrganization, coverage
		- declarationStatusId or declarationStatus
		- one or more file/files/files[] fields for uploaded attachments

		When files are uploaded, the server automatically stores each file and creates attachment metadata. You do not need to send title, fileKey, fileName, fileType, or fileSize manually.

		Legacy JSON payload is still accepted for metadata-only operations, but for true uploads use multipart/form-data.

	- GET /en/api/disaster-event/{disasterEventId}/declarations
		List all declarations for the authenticated tenant.

	- GET /en/api/disaster-event/{disasterEventId}/declarations/<id>
		Read one declaration.

	- PUT /en/api/disaster-event/{disasterEventId}/declarations/<id>
		Update one declaration. If attachments are provided, they replace existing values.

	- DELETE /en/api/disaster-event/{disasterEventId}/declarations/<id>
		Delete one declaration.

	### Declaration Attachments Subresource
	/en/api/disaster-event/{disasterEventId}/declarations/<id>/attachments

	- POST /en/api/disaster-event/{disasterEventId}/declarations/<id>/attachments
		Add one attachment per request using multipart/form-data.
		Preferred key: file
		The server generates the file metadata automatically.
		For multiple attachments, repeat the request as needed.

	- GET /en/api/disaster-event/{disasterEventId}/declarations/<id>/attachments
		List attachments for one declaration.

	- GET /en/api/disaster-event/{disasterEventId}/declarations/<id>/attachments/<attachmentId>
		Read one attachment.

	- PUT /en/api/disaster-event/{disasterEventId}/declarations/<id>/attachments/<attachmentId>
		Replace/update one attachment using multipart/form-data.
		Required: file
		The server replaces the stored file and regenerates the attachment metadata.

	- DELETE /en/api/disaster-event/{disasterEventId}/declarations/<id>/attachments/<attachmentId>
		Delete one attachment.


	## Responses Resource
	/en/api/disaster-event/{disasterEventId}/responses

	- POST /en/api/disaster-event/{disasterEventId}/responses
		Create response. Preferred input is multipart/form-data:
		- responseTypeId or responseType (required)
		- coverage, responseDate, description
		- one or more file/files/files[] fields for uploaded attachments

		When files are uploaded, the server automatically stores each file and creates attachment metadata. You do not need to send title, fileKey, fileName, fileType, or fileSize manually.

		Legacy JSON payload is still accepted for metadata-only operations, but for true uploads use multipart/form-data.

	- GET /en/api/disaster-event/{disasterEventId}/responses
		List all responses for the authenticated tenant.

	- GET /en/api/disaster-event/{disasterEventId}/responses/<id>
		Read one response.

	- PUT /en/api/disaster-event/{disasterEventId}/responses/<id>
		Update one response. If attachments are provided, they replace existing values.

	- DELETE /en/api/disaster-event/{disasterEventId}/responses/<id>
		Delete one response.

	### Response Attachments Subresource
	/en/api/disaster-event/{disasterEventId}/responses/<id>/attachments

	- POST /en/api/disaster-event/{disasterEventId}/responses/<id>/attachments
		Add one attachment per request using multipart/form-data.
		Preferred key: file
		The server generates the file metadata automatically.
		For multiple attachments, repeat the request as needed.

	- GET /en/api/disaster-event/{disasterEventId}/responses/<id>/attachments
		List attachments for one response.

	- GET /en/api/disaster-event/{disasterEventId}/responses/<id>/attachments/<attachmentId>
		Read one attachment.

	- PUT /en/api/disaster-event/{disasterEventId}/responses/<id>/attachments/<attachmentId>
		Replace/update one attachment using multipart/form-data.
		Required: file
		The server replaces the stored file and regenerates the attachment metadata.

	- DELETE /en/api/disaster-event/{disasterEventId}/responses/<id>/attachments/<attachmentId>
		Delete one attachment.


## Assessments Resource
/en/api/disaster-event/{disasterEventId}/assessments

- POST /en/api/disaster-event/{disasterEventId}/assessments
	Create assessment. Preferred input is multipart/form-data:
	- assessmentTypeId or assessmentType (required)
	- coverage, assessmentDate, description, otherSectors
	- sectorIds: string[] or comma-separated list
	- one or more file/files/files[] fields for uploaded attachments
	
	When files are uploaded, the server automatically stores each file and creates attachment metadata. You do not need to send title, fileKey, fileName, fileType, or fileSize manually.
	
	Legacy JSON payload is still accepted for metadata-only operations, but for true uploads use multipart/form-data.

- GET /en/api/disaster-event/{disasterEventId}/assessments
	List all assessments for the authenticated tenant.

- GET /en/api/disaster-event/{disasterEventId}/assessments/<id>
	Read one assessment.

- PUT /en/api/disaster-event/{disasterEventId}/assessments/<id>
	Update one assessment. If sectorIds or attachments are provided,
	they replace existing values.

- DELETE /en/api/disaster-event/{disasterEventId}/assessments/<id>
	Delete one assessment.

### Assessment Attachments Subresource
/en/api/disaster-event/{disasterEventId}/assessments/<id>/attachments

- POST /en/api/disaster-event/{disasterEventId}/assessments/<id>/attachments
	Add one attachment per request using multipart/form-data.
	Preferred key: file
	The server generates the file metadata automatically.
	For multiple attachments, repeat the request as needed.

- GET /en/api/disaster-event/{disasterEventId}/assessments/<id>/attachments
	List attachments for one assessment.

- GET /en/api/disaster-event/{disasterEventId}/assessments/<id>/attachments/<attachmentId>
	Read one attachment.

- PUT /en/api/disaster-event/{disasterEventId}/assessments/<id>/attachments/<attachmentId>
	Replace/update one attachment using multipart/form-data.
	Required: file
	The server replaces the stored file and regenerates the attachment metadata.

- DELETE /en/api/disaster-event/{disasterEventId}/assessments/<id>/attachments/<attachmentId>
	Delete one attachment.

### Assessment Sectors Subresource
/en/api/disaster-event/{disasterEventId}/assessments/<id>/sectors

- POST /en/api/disaster-event/{disasterEventId}/assessments/<id>/sectors
	Add one assessment sector per request.
	Preferred payload:
	- { sectorId: "uuid" }
	
	For multiple sectors, repeat the same request as needed.

- GET /en/api/disaster-event/{disasterEventId}/assessments/<id>/sectors
	List sectors attached to one assessment.

- GET /en/api/disaster-event/{disasterEventId}/assessments/<id>/sectors/<sectorId>
	Read one assessment-sector relation.

- PUT /en/api/disaster-event/{disasterEventId}/assessments/<id>/sectors
	Replace the full sector list for the assessment.
	Accepted payloads are the same as POST.

- DELETE /en/api/disaster-event/{disasterEventId}/assessments/<id>/sectors/<sectorId>
	Delete one sector from the assessment.
`;

	return new Response(docs, {
		status: 200,
		headers: { "Content-Type": "text/plain" },
	});
});
