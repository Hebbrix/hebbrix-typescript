/**
 * Hebbrix TypeScript SDK
 *
 * Typed TypeScript/JavaScript client for Hebbrix memory, retrieval, and
 * outcome-learning APIs. Plan and role restrictions are authoritative at
 * `/v1/users/me/capabilities`. The experimental World Model is intentionally
 * absent from this public release.
 *
 * @example
 * ```typescript
 * import { MemoryClient } from 'hebbrix';
 *
 * const client = new MemoryClient({ apiKey: 'hbx_...' });
 *
 * // Create a collection
 * const collection = await client.collections.create({
 *   name: 'My AI Agent',
 *   description: 'Personal memory for my chatbot'
 * });
 *
 * // Store a memory
 * const memory = await client.memories.create({
 *   collection_id: collection.id,
 *   content: 'User prefers dark mode and loves TypeScript',
 *   importance: 0.9
 * });
 *
 * // Search memories
 * const results = await client.search({
 *   query: 'What programming language does user like?',
 *   collection_id: collection.id,
 *   limit: 5
 * });
 *
 * // AI-powered reasoning over memories
 * const answer = await client.reason({
 *   query: 'Explain what I learned about the user',
 *   collection_id: collection.id
 * });
 * ```
 *
 * @packageDocumentation
 * @module hebbrix
 * @version 2.3.1
 */

export { MemoryClient } from "./client";
export * from "./types";
export * from "./errors";
export * from "./resources";
export * from "./safety";
