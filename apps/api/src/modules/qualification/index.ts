import type { Lead, Qualification } from "@tourest/shared";
import { NotImplementedError } from "../../core/errors";
import type { AiClient } from "../ai/index";

/**
 * Qualification module boundary.
 *
 * Assesses travel/booking intent for a Lead using the local AI client.
 * The scoring prompt/flow is implemented in a later step.
 */

export interface QualificationService {
  qualify(lead: Lead): Promise<Qualification>;
}

export class NotImplementedQualificationService implements QualificationService {
  constructor(private readonly ai: AiClient) {}

  async qualify(_lead: Lead): Promise<Qualification> {
    void this.ai;
    throw new NotImplementedError("qualification.qualify");
  }
}

export function createQualificationService(ai: AiClient): QualificationService {
  return new NotImplementedQualificationService(ai);
}
