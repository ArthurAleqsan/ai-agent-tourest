import type { SourceType } from "@tourest/shared";
import type { SourceAdapter } from "./types";

/** Registry mapping a SourceType to its (optional) SourceAdapter. */
export class AdapterRegistry {
  private readonly adapters = new Map<SourceType, SourceAdapter>();

  register(adapter: SourceAdapter): void {
    this.adapters.set(adapter.type, adapter);
  }

  get(type: SourceType): SourceAdapter | undefined {
    return this.adapters.get(type);
  }

  has(type: SourceType): boolean {
    return this.adapters.has(type);
  }

  list(): SourceAdapter[] {
    return [...this.adapters.values()];
  }
}

export function createAdapterRegistry(): AdapterRegistry {
  return new AdapterRegistry();
}
