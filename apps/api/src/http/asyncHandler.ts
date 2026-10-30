import type { NextFunction, Request, RequestHandler, Response } from "express";

/**
 * Wrap an async route handler so rejected promises are forwarded to Express's
 * error middleware (Express 4 does not catch async errors automatically).
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
