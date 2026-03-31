export {
	AGENT_SQL_VALIDATION_ERROR as SQL_VALIDATION_ERROR,
	requiresTenantFilter,
	validateAgentSQL,
} from "@databuddy/db";

import { validateAgentSQL } from "@databuddy/db";

/**
 * Backwards-compatible boolean wrapper around validateAgentSQL.
 * Prefer using validateAgentSQL directly for the structured reason.
 */
export function validateSQL(sql: string): boolean {
	const { valid } = validateAgentSQL(sql);
	return valid;
}
