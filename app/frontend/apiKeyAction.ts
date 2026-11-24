export { isFetcherRequest } from "~/frontend/user/accessManagementAction";

export type ApiKeyActionResult =
	| {
			ok: true;
			key?: {
				id: string;
				name: string;
				secret: string;
			};
	  }
	| {
			ok: false;
			fieldErrors?: { name?: string };
			error?: string;
	  };
