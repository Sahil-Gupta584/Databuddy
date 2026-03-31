const FORBIDDEN_KEYWORDS = [
	"INSERT INTO",
	"UPDATE SET",
	"DELETE FROM",
	"DROP TABLE",
	"DROP DATABASE",
	"CREATE TABLE",
	"CREATE DATABASE",
	"ALTER TABLE",
	"EXEC ",
	"EXECUTE ",
	"TRUNCATE",
	"MERGE",
	"BULK",
	"RESTORE",
	"BACKUP",
	"GRANT ",
	"REVOKE ",
	"KILL QUERY",
	"KILL MUTATION",
	"INTO OUTFILE",
	"INTO TEMPORARY",
	"ATTACH ",
	"DETACH ",
] as const;

/**
 * Broader single-word commands that are never valid in a read-only context.
 * Checked as whole-word matches at the start of a statement (after WITH/SELECT is
 * already validated) or as standalone tokens.
 */
const FORBIDDEN_STATEMENT_STARTS = [
	"SET ",
	"SYSTEM ",
	"OPTIMIZE ",
	"RENAME ",
	"EXCHANGE ",
] as const;

const DANGEROUS_PATTERNS = [
	/\$\{[^}]+\}/,
	/'[^']*\+[^']*'/,
	/"[^"]*\+[^"]*"/,
] as const;

/**
 * Databases that must never appear in queries.
 * Covers ClickHouse system catalogs that expose internal metadata.
 */
const BLOCKED_DATABASES = [
	"system.",
	"information_schema.",
	"_temporary_and_external_tables.",
] as const;

const ALLOWED_TABLE_PREFIX = "analytics.";

/**
 * Extracts `database.table` references from FROM / JOIN clauses.
 * Handles backtick-quoted and unquoted identifiers.
 */
function extractTableReferences(sql: string): string[] {
	const refs: string[] = [];
	const pattern = /(?:FROM|JOIN)\s+`?(\w+\.\w+)`?/gi;
	let match = pattern.exec(sql);
	while (match) {
		refs.push(match.at(1) as string);
		match = pattern.exec(sql);
	}
	return refs;
}

/**
 * Validates that a SQL query is safe for agent execution.
 *
 * Enforces:
 * - SELECT / WITH only
 * - Keyword blocklist (DDL, DML, admin commands)
 * - Dangerous interpolation pattern detection
 * - Table reference allowlist (analytics.* only)
 * - System database access block
 */
export function validateAgentSQL(sql: string): {
	valid: boolean;
	reason: string | null;
} {
	const upperSQL = sql.toUpperCase();
	const trimmed = upperSQL.trim();

	if (!(trimmed.startsWith("SELECT") || trimmed.startsWith("WITH"))) {
		return {
			valid: false,
			reason: "Only SELECT and WITH statements are allowed.",
		};
	}

	for (const keyword of FORBIDDEN_KEYWORDS) {
		if (upperSQL.includes(keyword)) {
			return {
				valid: false,
				reason: `Forbidden keyword detected: ${keyword.trim()}`,
			};
		}
	}

	for (const start of FORBIDDEN_STATEMENT_STARTS) {
		if (upperSQL.includes(start)) {
			return {
				valid: false,
				reason: `Forbidden command detected: ${start.trim()}`,
			};
		}
	}

	for (const pattern of DANGEROUS_PATTERNS) {
		if (pattern.test(sql)) {
			return {
				valid: false,
				reason: "Dangerous string interpolation pattern detected.",
			};
		}
	}

	const lowerSQL = sql.toLowerCase();
	for (const db of BLOCKED_DATABASES) {
		if (lowerSQL.includes(db)) {
			return {
				valid: false,
				reason: `Access to ${db.replace(".", "")} database is not allowed.`,
			};
		}
	}

	const tableRefs = extractTableReferences(sql);
	for (const ref of tableRefs) {
		if (!ref.toLowerCase().startsWith(ALLOWED_TABLE_PREFIX)) {
			return {
				valid: false,
				reason: `Table "${ref}" is outside the allowed analytics database.`,
			};
		}
	}

	return { valid: true, reason: null };
}

const TENANT_FILTER_PATTERN = /client_id\s*=\s*\{websiteId\s*:\s*String\}/i;

/**
 * Verifies that the SQL references the `websiteId` parameter for tenant isolation.
 * This is a structural check — it ensures `client_id` is filtered by the parameterized
 * websiteId, not just mentioned in a string.
 */
export function requiresTenantFilter(sql: string): boolean {
	return TENANT_FILTER_PATTERN.test(sql);
}

export const AGENT_SQL_VALIDATION_ERROR =
	"Query failed security validation. Only SELECT/WITH against analytics.* tables are allowed. " +
	"Use parameterized queries with {paramName:Type} syntax and include WHERE client_id = {websiteId:String}.";
