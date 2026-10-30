import { NotImplementedError, ValidationError } from "../../core/errors";
import type { Logger } from "../../core/logger";
import type { AdapterRegistry } from "../sources/adapters/registry";
import type { SourceRepository } from "../sources/index";
import type { IngestionService, IngestSummary } from "./index";

/**
 * Orchestrates one source's ingestion through its adapter and the shared
 * pipeline. Manual triggers and scheduled jobs both funnel through here.
 */
export class IngestionCoordinator {
  constructor(
    private readonly registry: AdapterRegistry,
    private readonly ingestionService: IngestionService,
    private readonly sourceRepo: SourceRepository,
    private readonly logger: Logger,
  ) {}

  /** Scheduled/pull ingestion (e.g. Telegram polling). */
  async runScheduled(sourceId: string): Promise<IngestSummary> {
    const { source, adapter } = await this.resolve(sourceId);
    if (!adapter.capabilities.scheduledIngestion || !adapter.collectScheduled) {
      throw new ValidationError(
        `Source type "${source.type}" does not support scheduled ingestion`,
      );
    }
    const records = await adapter.collectScheduled(source);
    return this.ingestionService.ingestRecords(sourceId, records);
  }

  /** Manual ingestion with adapter-specific input (e.g. Facebook import). */
  async runManual(sourceId: string, input: unknown): Promise<IngestSummary> {
    const { source, adapter } = await this.resolve(sourceId);
    if (!adapter.capabilities.manualIngestion || !adapter.collectManual) {
      throw new ValidationError(
        `Source type "${source.type}" does not support manual ingestion`,
      );
    }
    const records = await adapter.collectManual(source, input);
    return this.ingestionService.ingestRecords(sourceId, records);
  }

  private async resolve(sourceId: string) {
    const source = await this.sourceRepo.findById(sourceId);
    if (!source) {
      throw new ValidationError(`Unknown sourceId: ${sourceId}`);
    }
    const adapter = this.registry.get(source.type);
    if (!adapter) {
      throw new NotImplementedError(
        `No adapter registered for source type "${source.type}"`,
      );
    }
    this.logger.debug("ingestion resolved adapter", {
      sourceId,
      type: source.type,
    });
    return { source, adapter };
  }
}
