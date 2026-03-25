import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { DrainContext } from "evlog";
import { createAxiomDrain } from "evlog/axiom";
import { createFsDrain } from "evlog/fs";
import { createDrainPipeline } from "evlog/pipeline";

const pipeline = createDrainPipeline<DrainContext>({
	batch: { size: 50, intervalMs: 5000 },
	maxBufferSize: 2000,
});

const axiomDrain = createAxiomDrain();

const batchedAxiomDrain = pipeline(axiomDrain);

const devFsLogsDir = join(
	dirname(fileURLToPath(import.meta.url)),
	"..",
	"..",
	".evlog",
	"logs"
);

const useLocalEvlogFiles =
	process.env.NODE_ENV === "development" || process.env.LINKS_EVLOG_FS === "1";

const devFsDrain = useLocalEvlogFiles
	? createFsDrain({ dir: devFsLogsDir, pretty: false })
	: null;

/**
 * In development, writes NDJSON wide events to `apps/links/.evlog/logs/`
 * and still sends to Axiom via the batched pipeline. Production: Axiom only.
 */
export async function linksLoggerDrain(ctx: DrainContext): Promise<void> {
	if (devFsDrain) {
		await devFsDrain(ctx);
	}
	batchedAxiomDrain(ctx);
}

export async function flushBatchedLinksDrain(): Promise<void> {
	await batchedAxiomDrain.flush();
}
