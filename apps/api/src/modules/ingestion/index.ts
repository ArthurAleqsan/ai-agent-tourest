import { NotImplementedError } from "../../core/errors";

/**
 * Ingestion module boundary.
 *
 * Responsible for turning collected items into deduplicated, retention-tagged
 * SourceItems. The pure dedupe/retention logic already lives in
 * @tourest/shared; the orchestration/persistence is added in a later step.
 */

export interface IngestionResult {
  sourceId: string;
  itemsSeen: number;
  itemsInserted: number;
  duplicatesSkipped: number;
}

export interface IngestionService {
  /** Ingest all currently collected items for a given source. */
  ingestSource(sourceId: string): Promise<IngestionResult>;
}

export class NotImplementedIngestionService implements IngestionService {
  async ingestSource(_sourceId: string): Promise<IngestionResult> {
    throw new NotImplementedError("ingestion.ingestSource");
  }
}

export function createIngestionService(): IngestionService {
  return new NotImplementedIngestionService();
}
