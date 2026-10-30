/**
 * Public surface of the @tourest/shared package.
 * Consumed by both the API (Node/tsx) and the Web app (Vite).
 */
export * from "./enums";
export * from "./schemas";
export * from "./domain/index";

/** Package/app version surfaced in the health endpoint. */
export const APP_NAME = "Tourest AI Lead Hunter";
export const APP_VERSION = "0.1.0";
