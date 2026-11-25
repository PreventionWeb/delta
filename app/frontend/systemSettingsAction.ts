export const INSTANCE_NAME_MAX_LENGTH = 50;

export type SystemSettingsActionResult =
	| { ok: true }
	| {
			ok: false;
			fieldErrors?: Record<string, string>;
			error?: string;
	  };
