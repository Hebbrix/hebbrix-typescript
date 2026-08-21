# Hebbrix TypeScript SDK

[![npm version](https://img.shields.io/npm/v/hebbrix.svg)](https://www.npmjs.com/package/hebbrix)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Official TypeScript/JavaScript SDK for the Hebbrix api - **the only memory API with Reinforcement Learning**.

## 🚀 Features

- ✅ **Complete API Coverage** - All 50+ endpoints supported
- ✅ **Reinforcement Learning** - Train AI agents to optimize memory operations
- ✅ **Temporal Knowledge Graphs** - Track facts over time with bi-temporal model
- ✅ **Procedural Memory** - Store and execute learned skills
- ✅ **Working Memory** - Short-term context buffer for conversations
- ✅ **Memory Consolidation** - Automatic compression of episodic memories
- ✅ **ProofLoop** - Learn from outcomes with automatic, verifiable evidence receipts
- ✅ **Promise-based** - Native async/await support
- ✅ **Type-safe** - Complete TypeScript type definitions
- ✅ **Universal** - Works in Node.js and browsers
- ✅ **Clean API** - Intuitive, developer-friendly interface

## 📦 Installation

```bash
npm install hebbrix
# or
yarn add hebbrix
# or
pnpm add hebbrix
```

## 🔥 Quick Start

```typescript
import { MemoryClient } from 'hebbrix';

const main = async () => {
  // Initialize client
  const client = new MemoryClient({ apiKey: 'hbx_your_api_key' });

  // Create a collection
  const collection = await client.collections.create({
    name: 'My AI Agent',
    description: 'Personal memory for my chatbot',
  });

  // Store a memory
  const memory = await client.memories.create({
    collection_id: collection.id,
    content: 'User prefers dark mode and loves TypeScript',
    importance: 0.9,
  });

  // Search memories
  const results = await client.search({
    query: 'What programming language does user like?',
    collection_id: collection.id,
    limit: 5,
  });

  console.log(results);

  // Reason over memories
  const answer = await client.reason({
    query: 'What are user preferences?',
    provider: 'gemini',
  });

  console.log(answer.answer);
  console.log(answer.sources);
};

main();
```

## ProofLoop: search → decision → outcome → proof

```typescript
const search = await client.searchWithProof({
  query: 'What should the agent do next?',
  collection_id: 'collection-42',
  user_id: 'customer-7',
});
const decision = await client.proofloop.decide({
  policy_key: 'agent.next_action',
  candidates: [{ action_key: 'act' }, { action_key: 'ask' }],
  collection_id: 'collection-42',
  user_id: 'customer-7',
  proof_context: search.proof_context,
});
await client.proofloop.recordOutcome(decision.decision_id, {
  success: true,
  idempotency_key: 'run-123-result',
});
const proof = await client.proofloop.proof(decision.decision_id);
```

## 📚 Complete API Guide

### 1. Authentication

```typescript
import { MemoryClient } from 'hebbrix';

// Using API key
const client = new MemoryClient({ apiKey: 'hbx_...' });

// Or register a new user
const authResponse = await client.auth.register(
  'user@example.com',
  'secure_password',
  'John Doe'
);

// Login
const loginResponse = await client.auth.login(
  'user@example.com',
  'secure_password'
);

// Create API key
const apiKey = await client.auth.createApiKey('My App Key');
console.log(apiKey.api_key); // hbx_...

// Get current user
const user = await client.auth.getMe();
console.log(user.email);
```

### 2. Collections

```typescript
// Create collection
const collection = await client.collections.create({
  name: 'Research Notes',
  description: 'AI research papers and notes',
  metadata: { category: 'research' },
});

// List collections
const collections = await client.collections.list({ limit: 10, skip: 0 });

// Get collection
const retrieved = await client.collections.get(collection.id);

// Update collection
const updated = await client.collections.update(collection.id, {
  name: 'Updated Name',
  description: 'New description',
});

// Delete collection
await client.collections.delete(collection.id);
```

### 3. Memories (Episodic)

```typescript
// Create memory
const memory = await client.memories.create({
  collection_id: collection.id,
  content: 'User completed onboarding tutorial',
  importance: 0.7,
  metadata: { event: 'onboarding', timestamp: new Date().toISOString() },
});

// List memories
const memories = await client.memories.list({
  collection_id: collection.id,
  limit: 50,
  skip: 0,
});

// Get memory with metadata
const retrieved = await client.memories.get(memory.id);
console.log(retrieved.content);
console.log(retrieved.importance);
console.log(retrieved.metadata);

// Update memory
const updated = await client.memories.update(memory.id, {
  content: 'Updated content',
  importance: 0.9,
});

// Delete memory
await client.memories.delete(memory.id);
```

### 4. Search & Retrieval

```typescript
// Hybrid search (Vector + BM25)
const results = await client.search({
  query: 'machine learning concepts',
  collection_id: collection.id,
  limit: 10,
  search_type: 'hybrid', // 'vector' | 'bm25' | 'hybrid' | 'graph'
  filters: { category: 'research' },
});

// Vector-only search
const vectorResults = await client.search({
  query: 'neural networks',
  search_type: 'vector',
});

// BM25 keyword search
const keywordResults = await client.search({
  query: 'specific technical terms',
  search_type: 'bm25',
});

// Knowledge graph search
const graphResults = await client.search({
  query: 'related concepts',
  search_type: 'graph',
});
```

### 5. Reasoning (RAG)

```typescript
// Reason over memories with Gemini
const answer = await client.reason({
  query: 'Summarize what I learned about reinforcement learning',
  collection_id: collection.id,
  provider: 'gemini',
  include_steps: true,
});

console.log(answer.answer);
console.log(answer.sources); // Source memories used
console.log(answer.reasoning_context); // Reasoning steps (if include_steps=true)

// Use different LLM providers
const openaiAnswer = await client.reason({
  query: 'Explain the key concepts',
  provider: 'openai', // 'gemini' | 'openai' | 'anthropic'
});

const anthropicAnswer = await client.reason({
  query: 'What are the main takeaways?',
  provider: 'anthropic',
});
```

### 6. Reinforcement Learning

**The only memory API with RL training!**

```typescript
// Train Memory Manager agent (decides what to remember/forget)
const training = await client.rl.trainMemoryManager({
  collection_id: collection.id,
  num_episodes: 100,
});

console.log(training.metrics); // Training metrics

// Train Answer Agent (optimizes retrieval strategy)
const answerTraining = await client.rl.trainAnswerAgent({
  collection_id: collection.id,
  num_episodes: 50,
});

// Get RL training metrics
const metrics = await client.rl.getMetrics();
console.log(metrics.memory_manager_performance);
console.log(metrics.answer_agent_performance);

// Evaluate trained agent
const evaluation = await client.rl.evaluate('memory-manager', collection.id);
console.log(evaluation.accuracy);
console.log(evaluation.recall);
```

### 7. Procedural Memory

Store and execute learned procedures.

```typescript
// Create a procedure
const procedure = await client.procedural.create({
  name: 'Daily Summary',
  description: 'Generate daily summary of important events',
  trigger_condition: 'time.hour == 18', // 6 PM daily
  action_sequence: [
    'search(query="today", limit=20)',
    'consolidate(threshold=0.7)',
    'generate_summary()',
  ],
  collection_id: collection.id,
  category: 'automation',
  metadata: { frequency: 'daily' },
});

// List procedures
const procedures = await client.procedural.list({
  collection_id: collection.id,
  category: 'automation',
  limit: 50,
});

// Get procedure
const retrieved = await client.procedural.get(procedure.id);

// Execute procedure
const result = await client.procedural.execute(procedure.id, {
  context: { user_id: 'user_123' },
});

console.log(result.output);
console.log(result.execution_time);

// Update procedure
const updated = await client.procedural.update(procedure.id, {
  name: 'Updated Daily Summary',
  action_sequence: ['search(query="important", limit=10)', 'summarize()'],
});

// Delete procedure
await client.procedural.delete(procedure.id);
```

### 8. Temporal Knowledge Graphs

Track facts over time with bi-temporal modeling.

```typescript
// Add temporal fact
const fact = await client.temporal.addFact({
  subject: 'User_123',
  predicate: 'works_at',
  object: 'TechCorp',
  valid_from: '2024-01-01',
  valid_until: '2024-12-31',
  confidence: 0.95,
  source_memory_id: memory.id,
  metadata: { position: 'Engineer' },
});

// Query facts (current state)
const facts = await client.temporal.queryFacts({
  subject: 'User_123',
  predicate: 'works_at',
});

// Query facts at specific time
const historicalFacts = await client.temporal.queryFacts({
  subject: 'User_123',
  at_time: '2024-06-15',
});

// Point-in-time query (knowledge state at timestamp)
const snapshot = await client.temporal.pointInTime(
  '2024-06-15T10:00:00Z',
  'User_123'
);

console.log(snapshot.facts); // All facts valid at that time
console.log(snapshot.relationships); // Graph relationships
```

### 9. Working Memory

Short-term context buffer for conversations.

```typescript
// Add to working memory
await client.workingMemory.add({
  role: 'user',
  content: 'I want to learn about machine learning',
  metadata: { timestamp: new Date().toISOString() },
});

await client.workingMemory.add({
  role: 'assistant',
  content: 'I can help you with that! What aspect interests you?',
  metadata: { timestamp: new Date().toISOString() },
});

// Get current context (last N items)
const context = await client.workingMemory.getContext();
console.log(context.items); // Recent conversation items
console.log(context.buffer_size); // Current buffer size

// Compress working memory (convert to episodic)
const compressed = await client.workingMemory.compress();
console.log(compressed.compressed_memories); // New episodic memories created
console.log(compressed.compression_ratio);

// Clear working memory
await client.workingMemory.clear();
```

### 10. Memory Consolidation

Automatic compression of episodic memories.

```typescript
// Trigger consolidation
const consolidation = await client.consolidation.consolidate(collection.id, 100);

console.log(consolidation.original_count); // Before consolidation
console.log(consolidation.consolidated_count); // After consolidation
console.log(consolidation.compression_ratio);

// Get consolidation statistics
const stats = await client.consolidation.getStats(collection.id);
console.log(stats.total_memories);
console.log(stats.consolidation_eligible);
console.log(stats.last_consolidation);

// Archive old memories
const archived = await client.consolidation.archive(
  collection.id,
  '2024-01-01' // Archive memories before this date
);

console.log(archived.archived_count);
console.log(archived.archived_ids);
```

### 11. Memory Tools (Self-Editing)

Advanced memory manipulation tools.

```typescript
// Replace memory content
const replaced = await client.memoryTools.replace({
  memory_id: memory.id,
  new_content: 'Updated information with corrections',
  reason: 'Fixed inaccurate information',
});

// Insert memory at specific position
const inserted = await client.memoryTools.insert({
  collection_id: collection.id,
  content: 'Important context that was missing',
  position: 5,
  reason: 'Adding missing context',
});

// Rethink memory in light of new information
const rethought = await client.memoryTools.rethink(
  memory.id,
  'New evidence suggests different interpretation'
);

console.log(rethought.original_content);
console.log(rethought.updated_content);
console.log(rethought.changes);
```

### 12. World Model & Planning

Simulate retrieval and plan memory operations.

```typescript
// Imagine retrieval without actually retrieving
const imagination = await client.worldModel.imagineRetrieval(
  'machine learning papers',
  collection.id
);

console.log(imagination.expected_results); // Predicted results
console.log(imagination.confidence); // Prediction confidence
console.log(imagination.should_retrieve); // Recommendation

// Plan memory operations to achieve goal
const plan = await client.worldModel.plan(
  'Prepare comprehensive summary of Q1 research',
  collection.id
);

console.log(plan.steps); // Planned operations
console.log(plan.estimated_time); // Time estimate
console.log(plan.required_resources); // Resources needed

// Example plan output:
// {
//   steps: [
//     { action: 'search', params: { query: 'Q1 research', limit: 50 } },
//     { action: 'consolidate', params: { threshold: 0.8 } },
//     { action: 'reason', params: { query: 'summarize findings' } }
//   ],
//   estimated_time: 2.5,
//   required_resources: { tokens: 5000, api_calls: 3 }
// }
```

## 🎯 Advanced Examples

### Building a Smart Chatbot

```typescript
import { MemoryClient } from 'hebbrix';

class SmartChatbot {
  private client: MemoryClient;
  private collectionId: string;

  constructor(apiKey: string) {
    this.client = new MemoryClient({ apiKey });
  }

  async initialize() {
    const collection = await this.client.collections.create({
      name: 'Chatbot Memory',
      description: 'User interactions and preferences',
    });
    this.collectionId = collection.id;
  }

  async chat(userMessage: string): Promise<string> {
    // Add to working memory
    await this.client.workingMemory.add({
      role: 'user',
      content: userMessage,
    });

    // Search relevant memories
    const relevantMemories = await this.client.search({
      query: userMessage,
      collection_id: this.collectionId,
      limit: 5,
    });

    // Generate response using reasoning
    const response = await this.client.reason({
      query: userMessage,
      collection_id: this.collectionId,
      provider: 'gemini',
    });

    // Store interaction
    await this.client.memories.create({
      collection_id: this.collectionId,
      content: `User asked: "${userMessage}". Bot responded: "${response.answer}"`,
      importance: 0.6,
    });

    // Add response to working memory
    await this.client.workingMemory.add({
      role: 'assistant',
      content: response.answer,
    });

    return response.answer;
  }

  async trainOnConversations() {
    // Train RL agent to optimize memory management
    await this.client.rl.trainMemoryManager({
      collection_id: this.collectionId,
      num_episodes: 100,
    });
  }
}

// Usage
const bot = new SmartChatbot('hbx_...');
await bot.initialize();

const answer = await bot.chat('What did we discuss yesterday?');
console.log(answer);

await bot.trainOnConversations();
```

### Knowledge Graph Construction

```typescript
// Build temporal knowledge graph from documents
async function buildKnowledgeGraph(client: MemoryClient, collectionId: string) {
  // Add entities and relationships
  await client.temporal.addFact({
    subject: 'GPT-5',
    predicate: 'developed_by',
    object: 'OpenAI',
    valid_from: '2025-08-01',
    confidence: 1.0,
  });

  await client.temporal.addFact({
    subject: 'GPT-5',
    predicate: 'is_a',
    object: 'Large Language Model',
    valid_from: '2025-08-01',
    confidence: 1.0,
  });

  await client.temporal.addFact({
    subject: 'OpenAI',
    predicate: 'founded_in',
    object: '2015',
    valid_from: '2015-12-11',
    confidence: 1.0,
  });

  // Query relationships
  const facts = await client.temporal.queryFacts({
    subject: 'GPT-5',
  });

  console.log(facts); // All facts about GPT-5

  // Historical query
  const snapshot = await client.temporal.pointInTime(
    '2025-01-01T00:00:00Z',
    'OpenAI'
  );

  console.log(snapshot); // OpenAI's state before GPT-5 release
}
```

## 🛡️ Error Handling

```typescript
import {
  HebbrixError,
  AuthenticationError,
  ValidationError,
  NotFoundError,
  RateLimitError,
  ServerError,
} from '@hebbrix/sdk';

try {
  const memory = await client.memories.get('invalid_id');
} catch (error) {
  if (error instanceof NotFoundError) {
    console.log('Memory not found');
  } else if (error instanceof AuthenticationError) {
    console.log('Invalid API key');
  } else if (error instanceof RateLimitError) {
    console.log('Rate limit exceeded, retry after:', error.retryAfter);
  } else if (error instanceof ValidationError) {
    console.log('Validation errors:', error.errors);
  } else if (error instanceof ServerError) {
    console.log('Server error:', error.message);
  } else if (error instanceof HebbrixError) {
    console.log('API error:', error.statusCode, error.message);
  }
}
```

## ⚙️ Configuration

```typescript
const client = new MemoryClient({
  // Required: API key
  apiKey: 'hbx_...',

  // Optional: Custom base URL (default: https://api.hebbrix.com)
  baseUrl: 'https://api.yourdomain.com',

  // Optional: Request timeout in milliseconds (default: 30000)
  timeout: 60000,
});
```

## 🌐 Browser Usage

The SDK works in browsers with native Fetch API support:

```html
<script type="module">
  import { MemoryClient } from 'https://cdn.jsdelivr.net/npm/hebbrix/dist/index.mjs';

  const client = new MemoryClient({ apiKey: 'hbx_...' });

  const results = await client.search({ query: 'test' });
  console.log(results);
</script>
```

## 📊 Comparison with Competitors

| Feature | Hebbrix | Mem0 | Zep | Letta | Supermemory |
|---------|-----------|------|-----|-------|-------------|
| Reinforcement Learning | ✅ | ❌ | ❌ | ❌ | ❌ |
| Temporal Knowledge Graphs | ✅ | ❌ | ✅ | ❌ | ❌ |
| Procedural Memory | ✅ | ❌ | ❌ | ✅ | ❌ |
| Working Memory Buffer | ✅ | ❌ | ✅ | ✅ | ❌ |
| Memory Consolidation | ✅ | ❌ | ❌ | ❌ | ❌ |
| Hybrid Search | ✅ | ✅ | ✅ | ❌ | ✅ |
| Graph Search | ✅ | ❌ | ❌ | ❌ | ❌ |
| Self-Editing Tools | ✅ | ❌ | ❌ | ❌ | ❌ |
| World Model Planning | ✅ | ❌ | ❌ | ❌ | ❌ |
| Multi-LLM Support | ✅ | ✅ | ✅ | ✅ | ✅ |

**Hebbrix is the only memory API with:**
- RL-based memory optimization (Memory-R1 framework)
- Bi-temporal knowledge graphs
- Full memory consolidation pipeline
- Self-editing capabilities
- World model-based planning

## 🏗️ Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Development mode with watch
npm run dev

# Run tests
npm test

# Lint code
npm run lint

# Format code
npm run format
```

## 📘 TypeScript Support

The SDK is written in TypeScript and includes complete type definitions:

```typescript
import type {
  MemoryClient,
  Memory,
  Collection,
  SearchResult,
  ReasoningResponse,
} from '@hebbrix/sdk';

const client = new MemoryClient({ apiKey: 'hbx_...' });

// Full type inference
const memory: Memory = await client.memories.create({
  collection_id: 'col_123',
  content: 'Typed content',
});

// Type-safe search results
const results: SearchResult[] = await client.search({
  query: 'test',
});

// Type-safe reasoning response
const answer: ReasoningResponse = await client.reason({
  query: 'question',
});
```

## 🔗 Links

- **Documentation**: https://docs.hebbrix.com
- **API Reference**: https://api.hebbrix.com/docs
- **GitHub**: https://github.com/hebbrix/hebbrix
- **Examples**: https://github.com/hebbrix/examples
- **npm Package**: https://www.npmjs.com/package/hebbrix

## 📄 License

MIT License - see [LICENSE](LICENSE) for details

---

**Built with ❤️ by the Hebbrix team**
