/**
 * Hebbrix TypeScript SDK - Advanced Memory API for AI Agents
 *
 * Official TypeScript/JavaScript client library for the Hebbrix Memory API.
 * The only memory API with Reinforcement Learning for AI agents.
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
 *   collectionId: collection.id,
 *   content: 'User prefers dark mode and loves TypeScript',
 *   importance: 0.9
 * });
 *
 * // Search memories with 6-layer hybrid search
 * const results = await client.search({
 *   query: 'What programming language does user like?',
 *   collectionId: collection.id,
 *   limit: 5
 * });
 *
 * // AI-powered reasoning over memories
 * const answer = await client.reason({
 *   query: 'Explain what I learned about the user',
 *   collectionId: collection.id
 * });
 * ```
 *
 * @packageDocumentation
 * @module hebbrix
 * @version 2.1.0
 */

export { MemoryClient } from "./client";
export * from "./types";
export * from "./errors";
export * from "./resources";
