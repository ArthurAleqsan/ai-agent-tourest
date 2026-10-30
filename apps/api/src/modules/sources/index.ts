import type { Source, SourceType } from "@tourest/shared";
import { NotImplementedError } from "../../core/errors";

/**
 * Sources module boundary.
 *
 * A {@link SourceCollector} knows how to fetch public content / authorized
 * messages from one kind of source. Concrete collectors (scraping, feeds, etc.)
 * are NOT implemented in this step - only the abstraction and a registry.
 */

export interface CollectedItem {
  externalId: string | null;
  url: string | null;
  rawContent: string;
  language: string | null;
  collectedAt: string; // ISO timestamp
}

export interface SourceCollector {
  readonly type: SourceType;
  /** Collect raw items from the given source. */
  collect(source: Source): Promise<CollectedItem[]>;
}

export interface SourceCollectorRegistry {
  register(collector: SourceCollector): void;
  get(type: SourceType): SourceCollector | undefined;
  list(): SourceCollector[];
}

export class InMemorySourceCollectorRegistry implements SourceCollectorRegistry {
  private readonly collectors = new Map<SourceType, SourceCollector>();

  register(collector: SourceCollector): void {
    this.collectors.set(collector.type, collector);
  }

  get(type: SourceType): SourceCollector | undefined {
    return this.collectors.get(type);
  }

  list(): SourceCollector[] {
    return [...this.collectors.values()];
  }
}

/**
 * Placeholder collector used until real collectors are built. It is registered
 * nowhere by default; kept here to document the contract and fail loudly if
 * invoked prematurely.
 */
export class NotImplementedCollector implements SourceCollector {
  constructor(public readonly type: SourceType) {}

  async collect(_source: Source): Promise<CollectedItem[]> {
    throw new NotImplementedError(`sources.collect for type "${this.type}"`);
  }
}

export function createSourceCollectorRegistry(): SourceCollectorRegistry {
  // No collectors registered yet (no scraping in this step).
  return new InMemorySourceCollectorRegistry();
}
