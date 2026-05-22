# Agentic Runtime Platform — Blueprint v3
### Local-first · Team-ready · Open-model-first

---

## Product Vision

**"Your team's coding runtime — faster than Cline, works with any model, runs entirely on your infrastructure."**

Built to replace Cline and Claude Code for a team of 40 developers. Runs locally via WSL + Docker. Works with Ollama (local open models), Anthropic, OpenAI, and Gemini behind the same interface. No cloud dependency, no per-seat SaaS cost, no data leaving your network.

The core insight that makes this better than existing tools:

- Cline/Claude Code are chat-first. This is **runtime-first** — the agent has a structured execution engine, not a prompt loop.
- Existing tools are single-model. This is **model-agnostic** — route cheap tasks to a local Ollama model, hard tasks to Claude.
- Existing tools forget everything. This has **persistent workspace memory** — the agent knows your codebase, your patterns, your team's preferences.
- For a team, existing tools give 40 isolated agents. This gives **shared context** — shared memory, shared skills, shared policies across the whole team.

---

# 1. CORE ARCHITECTURE PRINCIPLES

## 1. Runtime First
Build an agent execution runtime. Chat is one interface into it. The VS Code extension is another. A CLI is another. The runtime is the product.

## 2. Event-Driven
Every state transition is a typed event on BullMQ:
```
task_created → context_resolved → tool_executed → reflection_completed → memory_updated
```
This enables: observability, replay, debugging, and team-level audit logs.

## 3. Modular Subsystems
Every subsystem is independently replaceable:
- LLM providers (swap Ollama for Claude with one config change)
- Vector store (Qdrant today, swap later)
- Tool runtime (add new tools without touching orchestration)
- Memory engine

## 4. Deterministic Orchestration
```
Planner → Executor → Validator → Reflector
```
LLM fills in decisions. The runtime defines the control flow. The LLM never owns the execution path.

## 5. Context Is the Product
Your biggest differentiator over Cline/Claude Code is context quality. They do naive retrieval. You do AST-indexed, symbol-aware, memory-augmented context assembly. This is where you invest the most engineering time.

## 6. Open-Model-First
Design every prompt, every context window, every tool schema to work well on a 7B–70B open model running locally via Ollama. If it works on Mistral or Qwen, it works great on Claude. Reverse is not true. This is your key advantage for a self-hosted team.

## 7. Team-Aware From Day One
40 developers sharing one platform means: shared workspace memory (the agent knows your codebase once, not 40 times), shared skill library (a debugging workflow defined once, used by everyone), and per-user isolation (my session doesn't pollute yours).

## 8. Security Is Infrastructure, Not a Phase
Every tool execution is sandboxed from the first prototype. Docker containers via WSL from Phase 1. No exceptions.

## 9. Testability Is a Design Constraint
Every execution is a replayable trace. Every subsystem is testable in isolation. You cannot improve what you cannot measure.

---

# 2. HIGH-LEVEL SYSTEM ARCHITECTURE

```
┌─────────────────────────────────────────────────────────────┐
│                        Clients                               │
│   VS Code Extension  ·  Web UI  ·  CLI  ·  REST API        │
└─────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                      API Gateway                             │
│         Fastify · Auth (JWT) · SSE Streaming                │
│              Rate limiting · Session management             │
└─────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                  Agent Runtime Engine                        │
│        Planner → Executor → Validator → Reflector           │
│                  BullMQ event bus (Redis)                   │
└─────────────────────────────────────────────────────────────┘
         │                    │                   │
         ▼                    ▼                   ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────────┐
│ Context      │    │ Tool Runtime │    │ Memory Engine    │
│ Engine       │    │ + Docker     │    │ (layered)        │
│              │    │ Sandbox      │    │                  │
└──────────────┘    └──────────────┘    └──────────────────┘
         │                    │                   │
         ▼                    ▼                   ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────────┐
│ Qdrant       │    │ MCP          │    │ PostgreSQL       │
│ (vectors)    │    │ Platform     │    │ (metadata)       │
└──────────────┘    └──────────────┘    └──────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                  Model Abstraction Layer                     │
│      Vercel AI SDK: Ollama · Anthropic · OpenAI · Gemini   │
└─────────────────────────────────────────────────────────────┘
```

### Cross-cutting internal engines (not phase-gated, built continuously)
```
Prompt Compiler · Token Budget Engine · Execution DAG · Reflection Engine · Eval Framework
```

---

# 3. TECHNOLOGY STACK

## Infrastructure (Docker Compose — zero manual installs)

```yaml
# docker-compose.yml — run with: docker compose up -d
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: agentruntime
      POSTGRES_USER: agent
      POSTGRES_PASSWORD: agent
    ports: ["5432:5432"]
    volumes: ["pgdata:/var/lib/postgresql/data"]

  qdrant:
    image: qdrant/qdrant
    ports: ["6333:6333"]
    volumes: ["qdrantdata:/qdrant/storage"]

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]

  ollama:
    image: ollama/ollama
    ports: ["11434:11434"]
    volumes: ["ollamadata:/root/.ollama"]
    deploy:
      resources:
        reservations:
          devices:
            - capabilities: [gpu]   # remove if no GPU

volumes:
  pgdata:
  qdrantdata:
  ollamadata:
```

`docker compose up -d` — everything running in under 3 minutes. Ollama included, so your team has a local model server immediately.

## Backend

| Concern | Package | Notes |
|---|---|---|
| HTTP + SSE | `fastify` | Faster than Express, built-in SSE for streaming |
| TypeScript | `tsx`, `typescript` | Run TS directly, no build step in dev |
| AI abstraction | `ai` (Vercel AI SDK) | Wraps Ollama/Anthropic/OpenAI/Gemini uniformly |
| Ollama | `ollama` npm package | Local model management |
| Job queue | `bullmq` | Redis-backed, persistent, retryable |
| Postgres ORM | `drizzle-orm` + `pg` | Type-safe, lightweight, no magic |
| Vector store | `@qdrant/js-client-rest` | Qdrant HTTP client |
| AST parsing | `tree-sitter` + language grammars | Symbol extraction per language |
| Auth | `@fastify/jwt` | JWT tokens, zero config |
| Validation | `zod` | Schema validation for tool inputs/outputs |
| Logging | `pino` | Structured JSON logs, fast |
| Testing | `vitest` | Fast, native TypeScript, no config |

## Frontend (Web UI)

| Concern | Package | Notes |
|---|---|---|
| Build | `vite` + React + TypeScript | `npm create vite@latest` |
| State | `zustand` | Lightweight, no boilerplate |
| Code editor | `@monaco-editor/react` | Same editor as VS Code |
| Terminal | `xterm` + `xterm-addon-fit` | Full terminal in browser |
| Graph UI | `reactflow` | Memory graph, execution DAG visualizer |
| Styling | `tailwindcss` | Utility-first, fast to prototype |

## VS Code Extension

| Concern | Package | Notes |
|---|---|---|
| Extension API | `@types/vscode` | Built-in VS Code APIs |
| Webview UI | React + Vite | Shared components with web UI |
| Communication | VS Code Extension API + fetch | Extension calls the same Fastify API |

This means you build the UI once and share it between the web app and the VS Code extension webview. No duplication.

## Database responsibilities

| Store | Technology | Used for |
|---|---|---|
| Primary metadata | PostgreSQL | Sessions, tasks, users, teams, policies, audit log |
| Hot state / queue | Redis | BullMQ jobs, session cache, rate limiting |
| Vector memory | Qdrant | Code embeddings, semantic search, long-term memory |
| Graph queries | PostgreSQL JSONB + recursive CTEs | Dependency relationships (sufficient through Phase 5) |

Neo4j is deferred. PostgreSQL handles graph-lite queries well enough for phases 1–5. Add Neo4j when you're doing complex multi-hop dependency traversal at scale.

## Model routing strategy (key differentiator)

Route tasks by complexity and cost:

```
Simple completions, docstrings, naming  → Ollama local (qwen2.5-coder:7b)
Code generation, refactoring            → Ollama local (qwen2.5-coder:32b) or DeepSeek
Multi-file reasoning, architecture      → Claude Sonnet or GPT-4o
Complex debugging, long context         → Claude Opus
Embeddings                              → Ollama (nomic-embed-text) — free, local
```

This is configurable per team and per task type. The Vercel AI SDK makes swapping transparent.

## Project structure

```
/agent-runtime
  /apps
    /api              ← Fastify backend (Node.js + TypeScript)
      /routes         ← HTTP + SSE endpoints
      /agents         ← Planner, Executor, Validator, Reflector
      /engines        ← Context, Memory, Prompt Compiler, Token Budget
      /tools          ← Tool registry + executors
      /queues         ← BullMQ job definitions
    /web              ← Vite + React web UI
    /vscode-ext       ← VS Code extension
  /packages
    /shared           ← Types, schemas (Zod), shared utilities
    /db               ← Drizzle schema + migrations
    /ai               ← Vercel AI SDK wrappers + model router
  docker-compose.yml
  package.json        ← npm workspaces
  turbo.json          ← Turborepo for monorepo builds (optional)
```

## Getting started (literally 4 commands)

```bash
# 1. Start all infrastructure
docker compose up -d

# 2. Install dependencies
npm install

# 3. Run migrations
npm run db:migrate

# 4. Start everything
npm run dev        # starts API + web UI concurrently
```

---

# 4. WHAT MAKES THIS BETTER THAN CLINE / CLAUDE CODE

Before the phase plan, here are the concrete product improvements that justify building this:

## 1. Open-model routing with quality fallback
Cline and Claude Code are effectively single-model tools. You configure one model and everything goes through it. This platform routes by task complexity — cheap local models for cheap tasks, powerful cloud models only when needed. For a team of 40, this alone can cut LLM costs by 60–80%.

## 2. Workspace memory that survives sessions
Cline has no persistent memory. Every session starts cold. This platform indexes your codebase once, stores it in Qdrant, and augments every request with relevant context the agent actually retrieved — not just the files you have open. After a week of use, the agent knows your architecture, your naming conventions, your common patterns.

## 3. Shared team context
40 developers all get the benefit of the same indexed codebase, the same skill library, the same memory of how your team solved hard problems before. One developer debugs a tricky auth issue; the reflection memory records the solution pattern; the next developer hits the same issue and the agent already knows the answer.

## 4. VS Code extension + Web UI from the same backend
Your developers work in VS Code. But you also get a web UI for team leads to review execution history, manage policies, inspect what the agent actually did. Both surfaces hit the same API.

## 5. Execution visibility
You can see exactly what context the agent assembled, what it decided, what tools it called, and why it failed. Cline is a black box. This is fully observable.

## 6. Behavioral policies per team/project
Define once: "when modifying auth code, always run tests, always require human approval." That policy applies to every developer on the team. No individual configuration drift.

## 7. Local-first, data never leaves your network
For a team working on proprietary code, this is non-negotiable. Everything — embeddings, memory, execution traces — stays on your infrastructure.

---

# 5. PHASE-BY-PHASE DEVELOPMENT PLAN

---

## PHASE 1 — FOUNDATION RUNTIME
**Goal:** A working local agent that can edit files, run terminal commands, and answer questions about your codebase. Better than Cline on day one.

**Build:**

**Model abstraction (Vercel AI SDK)**
```typescript
// packages/ai/src/router.ts
import { generateText, streamText } from 'ai'
import { createOllama } from 'ollama-ai-provider'
import { anthropic } from '@ai-sdk/anthropic'

export function getModel(taskComplexity: 'low' | 'medium' | 'high') {
  const ollama = createOllama({ baseURL: 'http://localhost:11434/api' })
  if (taskComplexity === 'low')    return ollama('qwen2.5-coder:7b')
  if (taskComplexity === 'medium') return ollama('qwen2.5-coder:32b')
  return anthropic('claude-sonnet-4-5')  // fallback for hard tasks
}
```

**Tool runtime**
- Tool registry: each tool has a Zod schema for inputs/outputs
- Built-in tools: read_file, write_file, run_terminal, search_files, git_diff, web_fetch
- Permission scoping: each session has an allowed tool set
- Retry with exponential backoff
- All tool calls logged to PostgreSQL

**Session runtime**
- Conversation + task state (PostgreSQL)
- BullMQ job per task — persistent, survives restarts
- SSE streaming to frontend: token chunks + tool events

**Session-layer memory (stub)**
- Context window management: track what's been sent, summarize when approaching limit
- Key-value store per session in Redis
- Foundation for Phase 6 full memory system

**Basic context assembly**
- File content inclusion by path
- Git diff inclusion
- Terminal output inclusion
- No semantic search yet (Phase 3) — just explicit inclusion

**Streaming UI**
- Chat panel with streaming tokens
- Tool call visualizer: show name, input, output, duration
- Context viewer: what exactly was sent to the model
- Token counter: live cost estimate per request

**Eval stub**
- Record every execution as JSON trace to PostgreSQL
- Replayable from day one — used for debugging before it's used for evals

**Stack:** Fastify, Drizzle + PostgreSQL, Redis + BullMQ, Vercel AI SDK, Ollama, Vite + React

**Deliverables:**
- ✅ Working agent with file/terminal/git tools
- ✅ Model routing (Ollama local + cloud fallback)
- ✅ Streaming UI with context viewer
- ✅ Session persistence — picks up where it left off
- ✅ All executions recorded as replayable traces

---

## PHASE 2 — VS CODE EXTENSION + SANDBOX

**Goal:** Meet developers where they work. Make execution safe.

**VS Code extension**
The extension is a thin webview wrapper around the same React components used in the web UI. It calls the same Fastify API. No duplication.

Key VS Code integrations beyond the webview:
- Active file context: automatically include open file + visible range in context
- Inline suggestions: ghost text completions via VS Code Inline Completion API
- Diff viewer: show agent-proposed changes in VS Code's native diff UI before applying
- Terminal integration: agent can run commands in VS Code's integrated terminal
- File watcher: detect when files change and update context accordingly
- `@workspace` mention: pull entire open workspace into context on demand

**Docker sandbox**
Every tool execution that touches the filesystem or runs commands goes through a Docker container:
- Isolated per-task container spun up from a base image
- Mounts only the project directory (read-write) and a temp output directory
- CPU and memory limits enforced via cgroups
- Network policy: no external egress by default (configurable per policy)
- Container torn down after task completion
- Artifacts (modified files) collected before teardown

```typescript
// apps/api/src/tools/sandbox.ts
async function runInSandbox(taskId: string, command: string, workdir: string) {
  const container = await docker.createContainer({
    Image: 'agent-sandbox:latest',      // minimal Node + common tools
    Cmd: ['sh', '-c', command],
    HostConfig: {
      Binds: [`${workdir}:/workspace:rw`],
      Memory: 512 * 1024 * 1024,        // 512MB
      CpuPeriod: 100000,
      CpuQuota: 50000,                  // 50% of one CPU
      NetworkMode: 'none',              // no network
    },
    WorkingDir: '/workspace',
  })
  // ...
}
```

**Deliverables:**
- ✅ VS Code extension with inline completions + diff UI
- ✅ All tool executions sandboxed in Docker containers
- ✅ Active file context injection
- ✅ Container resource limits enforced

---

## PHASE 3 — CONTEXT ENGINE + MCP

**Goal:** The agent stops being blind. It knows your codebase at the symbol level, not just the file level.

**AST indexing (tree-sitter)**
Index every file in the workspace on first open, then incrementally on save:

```typescript
// Extracts from each file:
{
  functions: [{ name, signature, docstring, startLine, endLine }],
  classes:   [{ name, methods, properties, startLine, endLine }],
  imports:   [{ source, symbols }],
  exports:   [{ name, type }],
  calls:     [{ caller, callee, line }],           // call graph edges
}
```

Supported languages from day one: TypeScript, JavaScript, Python, C#, Java, Go.

**Semantic search (Qdrant)**
Every function, class, and symbol gets an embedding (nomic-embed-text via Ollama — free, local). On every request, retrieve the top-k most relevant symbols by semantic similarity to the task description.

**Context pipeline**
```
Task description
 → Intent classifier (what kind of task? edit / debug / explain / refactor)
 → Symbol retrieval (AST index lookup for mentioned names)
 → Semantic retrieval (Qdrant similarity search)
 → Git context (current diff, recent commits)
 → Memory retrieval (relevant past executions — Phase 6)
 → Ranking (relevance × recency × confidence)
 → Compression (summarize older context, keep recent verbatim)
 → Token budget allocation
 → Final prompt
```

**Smart chunking**
Chunk at symbol boundaries. A function is one chunk. A class is one chunk. Never split mid-function. This is what makes semantic search actually useful — you retrieve complete, meaningful units.

**MCP platform**
- MCP Manager supporting stdio and HTTP/SSE transports
- Each MCP server runs in its own Docker container (isolated)
- Permission profile per server: what tools can it expose, what filesystem paths can it access
- Built-in MCP servers for: GitHub, filesystem, PostgreSQL, web search
- MCP tools registered into the tool registry automatically

**Deliverables:**
- ✅ AST indexing (6 languages)
- ✅ Semantic search over codebase
- ✅ Full context pipeline with token budgeting
- ✅ Incremental re-indexing on file save
- ✅ MCP platform with permission isolation
- ✅ GitHub + filesystem MCP servers

---

## PHASE 4 — ADVANCED RAG

**Goal:** The agent understands your codebase architecturally, not just lexically.

**Four-layer retrieval**

| Layer | How | What it finds |
|---|---|---|
| Semantic | Qdrant vector search | Functions/classes similar in meaning to the task |
| Symbol | AST index exact lookup | Exact references to named functions, types, interfaces |
| Structural | PostgreSQL JSONB graph traversal | What calls this function? What does this class depend on? |
| Behavioral | Stored test traces + log patterns | How this code behaves at runtime, known failure modes |

**Retrieval fusion**
Results from all four layers are merged and re-ranked:
- Exact symbol matches score highest
- Semantic matches scored by cosine similarity
- Structural context (callers/callees) added to round out direct matches
- Behavioral context added last if token budget allows

**Incremental indexing**
- File save → re-index changed file only (< 100ms)
- Git commit → re-index changed files, update call graph edges
- Branch switch → full re-index (background job via BullMQ)
- Index stored in Qdrant (vectors) + PostgreSQL (symbol metadata + graph edges)

**Deliverables:**
- ✅ Four-layer retrieval with fusion
- ✅ Call graph stored in PostgreSQL JSONB
- ✅ Incremental index on save + commit hooks
- ✅ Architecture map visualization in web UI

---

## PHASE 5 — BEHAVIORAL POLICY ENGINE

**Goal:** The agent follows your team's engineering standards automatically. Skills and rules as one unified system.

**Why unified:** A skill is a reusable workflow. A rule is a constraint on a workflow step. They belong in the same model.

**Policy definition**
```yaml
policy:
  name: implement_api_endpoint
  description: Build a new REST endpoint with tests
  tools: [file_editor, terminal, git]
  workflow:
    - step: understand_requirements
      constraints:
        - read_only: true
    - step: write_implementation
      constraints:
        - max_files_changed: 5
    - step: write_tests
      requires: [write_implementation]
      constraints:
        - require_test_file: true
    - step: run_tests
      requires: [write_tests]
      constraints:
        - require_passing: true          # cannot proceed if tests fail
    - step: create_pr
      requires: [run_tests]
      constraints:
        - require_approval: true         # pause for human sign-off
  exit_conditions:
    success: pr_created AND tests_passing
    failure: max_retries_exceeded OR human_rejection
```

**Constraint types**

| Constraint | Effect |
|---|---|
| `read_only` | No write tool calls permitted in this step |
| `max_files_changed` | Abort if agent tries to touch more than N files |
| `require_test_file` | Step incomplete unless a test file was written |
| `require_passing` | Step incomplete unless test suite passes |
| `require_approval` | Pause execution, notify user, wait for resume |
| `security_review` | Route step to security-focused model/prompt before proceeding |
| `max_tokens` | Abort if this step would exceed token budget |

**Team-level policies**
Policies are stored in PostgreSQL and shared across the team. A team lead defines `implement_api_endpoint` once. Every developer who asks the agent to build an endpoint gets that workflow automatically.

**Policy registry**
- CRUD API for policies (web UI + API)
- Version history + rollback
- Dry-run mode: simulate without executing, shows what the agent would do
- Import/export (YAML) for version controlling policies in Git

**Deliverables:**
- ✅ Unified skill + rule policy model
- ✅ Constraint enforcement at step boundaries
- ✅ Approval workflow (pause + resume)
- ✅ Team-shared policy library
- ✅ Dry-run simulation
- ✅ Policy versioning + Git export

---

## PHASE 6 — MEMORY SYSTEM

**Goal:** The agent remembers. Across sessions, across projects, across your team.

**Memory layers**

| Layer | Scope | Storage | Lifetime |
|---|---|---|---|
| Working | Current tool call | In-process | Duration of call |
| Session | Current task | Redis | Session duration |
| Workspace | This project | PostgreSQL + Qdrant | Indefinite, decay-weighted |
| Team | All projects, all developers | Qdrant | Permanent, relevance-decayed |
| Reflection | Failure + success patterns | PostgreSQL + Qdrant | Permanent |

**Write path (explicit — most systems get this wrong)**
- Session → Workspace: Reflector agent promotes at task completion, novelty-filtered (new information only; things the index doesn't already contain)
- Workspace → Team: scheduled job weekly, filtered by confidence threshold
- Reflection writes immediately after every failed execution and every unusually successful one
- Human can pin, delete, or annotate any memory entry via UI

**What gets remembered**
- How your team names things (detected from codebase patterns)
- Which libraries you use for which problems
- Common debugging patterns that worked
- Architecture decisions and their rationale (if documented in PRs/commits)
- Past task solutions that can be reused

**Memory provenance**
Every entry stores: source (task ID, file, developer), timestamp, confidence, retrieval count, outcome (did retrieval lead to success or failure).

**Memory conflict resolution**
Two entries that contradict each other: newer wins unless older has significantly higher confidence. Conflicts flagged in UI for human review.

**Memory decay**
Entries not retrieved in 90 days decay in relevance score (logarithmic). Entries retrieved but associated with failures decay faster. Entries associated with successes decay slower.

**Deliverables:**
- ✅ Five-layer memory system
- ✅ Explicit write path with novelty filtering
- ✅ Team-shared memory (all 40 developers benefit)
- ✅ Provenance and confidence tracking
- ✅ Memory UI (inspect, pin, delete, annotate)
- ✅ Decay and relevance scoring

---

## PHASE 7 — EVAL FRAMEWORK

**Goal:** Confidence that the system works as it evolves. Know before you deploy whether a change helped or hurt.

**Execution replay**
Every execution is a deterministic JSON trace. Replay any past task against the current codebase to see if behavior regressed.

**LLM output evals**
- Plan validity: did the planner produce a coherent workflow for the given task?
- Tool call validity: were tool inputs well-formed? Were permissions respected?
- Output correctness: assessed by a separate lightweight LLM call against a rubric
- Hallucination detection: agent referenced a file/function that doesn't exist

**Regression suite**
A curated set of canonical tasks with known-good outputs. Run automatically when:
- A new model is configured
- Context engine parameters change
- Memory system is updated
- Any prompt template changes

**Model comparison**
Run the same task suite against `qwen2.5-coder:32b` vs `claude-sonnet` vs `gpt-4o`. See pass rate, latency P50/P95, and token cost side by side. Make model routing decisions with data.

**Team analytics (web UI)**
- Per-developer task success rate
- Most common failure modes
- Token cost trends
- Which policies are used most
- Which memory entries are retrieved most

**Deliverables:**
- ✅ Deterministic replay
- ✅ LLM output eval framework
- ✅ Regression suite with canonical tasks
- ✅ Model comparison dashboard
- ✅ Team analytics

---

## PHASE 8 — MULTI-AGENT ORCHESTRATION

**Goal:** Larger tasks decomposed and executed by specialized cooperating agents.

Only start this phase after Phase 7 gives you confidence in single-agent behavior. Multi-agent amplifies both good and bad behaviors.

**Agent roles**

| Agent | Responsibility |
|---|---|
| Planner | Decomposes task into execution DAG, selects policy for each node |
| Executor | Runs one DAG node — tool calls, streaming, sandboxed |
| Verifier | Checks Executor output against success criteria; rejects if invalid |
| Reflector | Classifies failures, writes to reflection memory, proposes re-plans |
| Critic | Adversarially reviews the Planner's DAG before execution begins |

**Agent communication**
Via BullMQ job queue — not direct calls. Every agent interaction is a job with a defined schema. Any agent can be swapped independently.

**Coordination primitives**
- Fork: Planner dispatches parallel Executors for independent subtasks
- Join: wait for all upstream nodes before proceeding
- Checkpoint: pause for human review
- Rollback: Reflector rewinds to a checkpoint and re-plans from there

**Example: "Migrate this service from REST to GraphQL"**
```
Planner decomposes into:
  ├── Analyze existing endpoints (Executor 1)
  ├── Design GraphQL schema (Executor 2, after 1)
  ├── Implement resolvers (Executor 3, after 2)
  ├── Update tests (Executor 4, parallel with 3)
  ├── Verify (Verifier, after 3+4)
  └── Create PR (Executor 5, after Verifier passes)
```

Each node runs in its own sandboxed container. Planner holds the DAG state in PostgreSQL.

**Deliverables:**
- ✅ Five-agent system
- ✅ BullMQ-based agent communication
- ✅ Fork/join/checkpoint/rollback
- ✅ DAG state persistence + recovery on restart
- ✅ Multi-agent execution visualizer in web UI

---

## PHASE 9 — TEAM PLATFORM

**Goal:** Production-grade for 40 developers. Shared context, per-user isolation, usage visibility.

**Team workspaces**
- Shared workspace memory: indexed once, used by all 40 developers
- Shared policy library: team-defined workflows available to everyone
- Per-user session isolation: my task queue doesn't affect yours
- Team-level token budget: set a monthly limit per team or per developer

**User management**
- RBAC: admin, developer, reviewer, viewer
- JWT auth with configurable expiry
- Optional SSO (SAML 2.0 / OIDC) — one config block in Fastify
- Per-developer usage tracking

**Audit log**
- Every agent action, tool call, file modification, and approval decision
- Immutable (append-only PostgreSQL table with no delete permission)
- Searchable from web UI: "show me everything the agent did in the auth module this week"

**Model access control**
- Per-user or per-team model allowlist: junior devs on local Ollama only, seniors can use Claude
- Configurable cost caps per developer per day

**Secrets management**
- Per-project API key storage (encrypted in PostgreSQL)
- Environment variable injection into sandboxes at runtime
- Keys never exposed in logs or traces

**Self-hosted deployment**
Everything already runs in Docker. For team deployment: provide a single `docker-compose.prod.yml` that adds Nginx reverse proxy, TLS termination, and backup volumes. No Kubernetes required for 40 users.

**Deliverables:**
- ✅ Team workspaces with shared memory + policies
- ✅ RBAC + optional SSO
- ✅ Immutable audit log
- ✅ Per-developer usage + cost tracking
- ✅ Model access control
- ✅ `docker-compose.prod.yml` one-command team deployment

---

# 6. CRITICAL INTERNAL SYSTEMS

## A. Prompt Compiler

The single assembly point for every LLM call. Unit-testable in isolation.

```
Task description
 + Retrieved context (ranked, compressed, symbol-aware)
 + Active memory (session + workspace + team, relevance-ordered)
 + Active policy step + constraints
 + Tool schemas (only tools available to this step)
 + Execution state (what succeeded, what failed so far)
 + Output format spec (structured output schema if needed)
 + Model-specific formatting (open models need different prompting than Claude)
 = Final prompt, within token budget
```

The model-specific formatting point is critical for open-model support. Mistral and Qwen respond better to explicit chain-of-thought instructions. Claude responds better to direct task framing. The compiler handles this per provider.

## B. Token Budget Engine

- Pre-flight estimate before every LLM call
- Slot reservation: system (10%) + tool schemas (15%) + output (20%) = 45% reserved; 55% for context
- Compression: summarize older context before truncating; always prefer compression over dropping
- Context priority: recent > semantically relevant > structurally relevant > old
- Budget tracked per BullMQ job — total cost visible in eval dashboard

## C. Execution DAG Engine

Tasks are graphs, not loops. Stored as adjacency lists in PostgreSQL. BullMQ processes each node. On failure: retry the failed node only, not the whole task. On process restart: resume from last completed node.

## D. Reflection Engine

After every execution unit:
1. Evaluate output against task success criteria (structured check)
2. Classify failure: tool error / hallucination / bad plan / missing context / permissions
3. Retry strategy by failure class:
   - Tool error → retry same plan
   - Hallucination → retry with stronger grounding + more context
   - Bad plan → re-plan with Planner
   - Missing context → extend retrieval scope + retry
4. Write to reflection memory (success patterns and failure patterns)

## E. Model-Specific Prompt Adapter (new — critical for open models)

The prompt that works on Claude often fails on a 7B open model. The adapter normalizes this:

- Adds explicit chain-of-thought instruction for models that need it
- Simplifies tool call schemas for models with limited function-calling support
- Adds output format examples for models that don't follow JSON schema reliably
- Adjusts system prompt verbosity based on model context window size
- Falls back to a simpler prompt if the full prompt exceeds model limits

This is what makes "open-model-first" actually work in practice.

---

# 7. MVP — WHAT TO BUILD FIRST

Build Phases 1 and 2. Ship it to yourself. Use it for two weeks. Then proceed.

**MVP delivers:**
- Local agent in VS Code that replaces Cline for your daily workflow
- Works on Ollama (local, free) + Claude (cloud, for hard tasks)
- Can read/write files, run terminal commands, search codebase
- Sandboxed execution — safe to run autonomously
- Full execution visibility — you see exactly what it did and why
- Session persistence — picks up where it left off

**Explicitly out of scope for MVP:**
- Semantic search (Phase 3) — use grep-style search initially
- Team features — single user only
- Policies — simple tool permissions only
- Multi-agent — single agent only
- Memory persistence beyond session

**The two-week test**
After MVP, use it daily and track: how often does it produce correct output on first try? Where does it fail? What context was missing when it failed? The answers drive Phase 3 priorities.

---

# 8. ADDITIONAL IMPROVEMENTS FOR A TEAM OF 40

Beyond the phase plan, these are the non-obvious things that matter at team scale:

**Codebase onboarding time**
When a new developer joins, the agent should know the codebase on day one. Build an onboarding job: index the entire repo, generate architecture summaries, store team conventions in memory. New developer asks "how does auth work" and gets a real answer grounded in the actual code.

**Prompt library**
Let developers save and share prompts that work well. "The prompt I use to write integration tests in our codebase" becomes a team asset. Store in PostgreSQL, searchable from VS Code extension.

**Agent-generated documentation**
The agent knows the codebase better than any developer does after Phase 4. Use it to generate and keep up to date: architecture decision records, module READMEs, API documentation. Triggered on PR merge.

**Cost transparency**
At 40 developers, LLM costs add up fast. Show every developer their daily/weekly token spend in the VS Code extension status bar. Show team leads a breakdown by developer and by task type. This drives model routing decisions.

**Graceful degradation**
If the cloud model API is down or over budget: fall back to local Ollama automatically. The agent keeps working, slightly less capable. No interruption to the developer's flow.

**Git-native memory**
Store workspace memory as a `.agent-memory/` directory in the repo (gitignored by default, committed optionally). Team members who clone the repo get the accumulated memory immediately, without needing to re-index.

---

# 9. MOST IMPORTANT SUCCESS FACTORS

**1. Context quality over model quality.** A well-contextualized request to a 7B local model beats a poorly-contextualized request to Claude. This is where you win against Cline.

**2. Open-model compatibility.** Test every prompt template on `qwen2.5-coder:7b` before testing on Claude. If it only works on Claude, you've failed the primary goal.

**3. Observable execution.** Every developer should be able to see exactly what the agent saw, decided, and did. This builds trust and enables debugging.

**4. Sandbox from day one.** You cannot go back and add isolation later without breaking everything. Docker containers from Phase 1.

**5. Team memory compounds.** The value of shared workspace memory grows with team size and time. The 40th developer benefits from everything the first 39 learned. This is your moat against individual installs of Cline.

**6. Ship the MVP fast.** Two weeks to a working VS Code extension that replaces Cline for your own workflow. That is your north star for Phase 1.

---

# FINAL RECOMMENDATION

You are building a better Cline, not a better ChatGPT. The framing matters. Every decision should be evaluated against: "does this make a developer's coding session faster and more reliable?"

The three things that will make this genuinely better than existing tools, in order of impact:

**1. Open-model routing that actually works.** Most "open model support" tools just swap the API endpoint. You need the prompt adapter layer that makes open models reliable. That's the hard part and nobody has done it well yet.

**2. Persistent workspace memory shared across 40 developers.** No existing tool does this. After three months of use, your agent knows your codebase better than any individual developer. That's a compounding advantage that grows every day.

**3. Full execution visibility.** Developers don't trust what they can't see. Show them the context, the decision, the tool call, the result. That transparency is what converts a skeptic into a daily user.

Build those three things exceptionally well. Everything else is details.
