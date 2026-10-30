import type {
  Lead,
  MessageDraft,
  OutreachChannel as Channel,
  TourMatch,
} from "@tourest/shared";
import { NotImplementedError } from "../../core/errors";
import type { AiClient } from "../ai/index";

/**
 * Outreach module boundary.
 *
 * Two responsibilities, both human-in-the-loop:
 *  - Drafting personalized messages (AI-assisted) for human approval.
 *  - Sending approved messages via a channel integration.
 *
 * NEITHER AI drafting NOR messaging integrations are implemented in this step.
 */

export interface DraftRequest {
  lead: Lead;
  match?: TourMatch;
  channel: Channel;
  language: string;
}

export interface MessageDraftService {
  draft(request: DraftRequest): Promise<MessageDraft>;
}

export interface OutreachSendResult {
  draftId: string;
  channel: Channel;
  deliveredAt: string;
}

/** A messaging integration. Implementations are added later (opt-in, consented). */
export interface OutreachChannelSender {
  readonly channel: Channel;
  send(draft: MessageDraft): Promise<OutreachSendResult>;
}

export class NotImplementedMessageDraftService implements MessageDraftService {
  constructor(private readonly ai: AiClient) {}

  async draft(_request: DraftRequest): Promise<MessageDraft> {
    void this.ai;
    throw new NotImplementedError("outreach.draft");
  }
}

export class NotImplementedChannelSender implements OutreachChannelSender {
  constructor(public readonly channel: Channel) {}

  async send(_draft: MessageDraft): Promise<OutreachSendResult> {
    throw new NotImplementedError(`outreach.send via "${this.channel}"`);
  }
}

export function createMessageDraftService(ai: AiClient): MessageDraftService {
  return new NotImplementedMessageDraftService(ai);
}
