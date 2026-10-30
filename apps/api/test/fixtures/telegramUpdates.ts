import type { TelegramUpdate } from "../../src/modules/sources/adapters/telegram/index";

/**
 * Mock Telegram getUpdates payload. Mixes:
 *  - relevant Egypt-excursion messages in an authorized chat (kept)
 *  - an off-topic message in the authorized chat (dropped by prefilter)
 *  - a relevant message in a NON-allowlisted chat (dropped by allowlist)
 *  - an empty/no-text update (dropped)
 *  - a duplicate of the first message (dropped by dedup downstream)
 */
export const AUTHORIZED_CHAT_ID = 1001;
export const OTHER_CHAT_ID = 2002;

export const telegramUpdatesFixture: TelegramUpdate[] = [
  {
    update_id: 10,
    message: {
      message_id: 1,
      date: 1_730_000_000,
      chat: { id: AUTHORIZED_CHAT_ID, type: "supergroup", title: "Sharm Excursions" },
      text: "Looking for a diving excursion in Sharm el Sheikh next week, what's the price?",
    },
  },
  {
    update_id: 11,
    message: {
      message_id: 2,
      date: 1_730_000_100,
      chat: { id: AUTHORIZED_CHAT_ID, type: "supergroup", title: "Sharm Excursions" },
      text: "Доброе утро всем! Какая сегодня погода?",
    },
  },
  {
    update_id: 12,
    message: {
      message_id: 3,
      date: 1_730_000_200,
      chat: { id: OTHER_CHAT_ID, type: "supergroup", title: "Random Group" },
      text: "Любые экскурсии в Хургаде посоветуйте пожалуйста",
    },
  },
  {
    update_id: 13,
    message: {
      message_id: 4,
      date: 1_730_000_300,
      chat: { id: AUTHORIZED_CHAT_ID, type: "supergroup", title: "Sharm Excursions" },
      text: "   ",
    },
  },
  {
    update_id: 14,
    message: {
      message_id: 1,
      date: 1_730_000_000,
      chat: { id: AUTHORIZED_CHAT_ID, type: "supergroup", title: "Sharm Excursions" },
      text: "Looking for a diving excursion in Sharm el Sheikh next week, what's the price?",
    },
  },
];
