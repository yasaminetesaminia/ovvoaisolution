/**
 * @lavora/core — domain logic.
 *
 * Pure-ish business code: slot calculation, capacity rules, booking
 * validation, language helpers. Calls into @lavora/db for persistence
 * but is otherwise framework-free so it can be reused from Hono, Next,
 * workers, or tests without dragging in HTTP plumbing.
 */

export * from "./slots.js";
export * from "./booking.js";
export * from "./time.js";
export * from "./language.js";
