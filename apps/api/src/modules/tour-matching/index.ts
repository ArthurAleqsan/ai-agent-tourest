import type { Lead, Qualification, TourMatch } from "@tourest/shared";
import { NotImplementedError } from "../../core/errors";

/**
 * Tour-matching module boundary.
 *
 * Ranks relevant Tourest tours for a qualified lead. The matching strategy
 * (keyword/embedding/AI) is implemented in a later step.
 */

export interface TourMatcher {
  match(lead: Lead, qualification: Qualification): Promise<TourMatch[]>;
}

export class NotImplementedTourMatcher implements TourMatcher {
  async match(_lead: Lead, _qualification: Qualification): Promise<TourMatch[]> {
    throw new NotImplementedError("tourMatching.match");
  }
}

export function createTourMatcher(): TourMatcher {
  return new NotImplementedTourMatcher();
}
