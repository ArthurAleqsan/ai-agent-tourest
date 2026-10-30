import type {
  GetUpdatesParams,
  TelegramClient,
  TelegramUpdate,
} from "../../src/modules/sources/adapters/telegram/index";

/**
 * In-memory Telegram Bot API client for tests. It serves a queued batch of
 * updates and honors the `offset` param the adapter sends, so polling twice
 * behaves like the real long-poll (already-acked updates are not re-served).
 * No network, no token.
 */
export class MockTelegramClient implements TelegramClient {
  public calls: GetUpdatesParams[] = [];

  constructor(private readonly updates: TelegramUpdate[]) {}

  async getUpdates(params: GetUpdatesParams): Promise<TelegramUpdate[]> {
    this.calls.push(params);
    const offset = params.offset ?? 0;
    const batch = this.updates.filter((u) => u.update_id >= offset);
    const limit = params.limit ?? batch.length;
    return batch.slice(0, limit);
  }
}
