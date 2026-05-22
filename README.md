# Agentic Runtime Platform (ARP)

ARP is a **Composable Agentic Engineering Runtime** designed for building, running, and observing autonomous software engineering agents. Unlike simple "chat apps with tools," ARP is an execution runtime that provides deterministic task orchestration, deep codebase context indexing, semantic memory, and real-time execution observability.

---

## Architecture Overview

ARP utilizes a modern event-driven architecture structured around a high-performance backend API and an interactive, real-time developer workspace UI:

```
┌──────────────────────────────────────────────┐
│                 React Web UI                 │
│      Monaco Editor + XTerm + Flow Graph      │
└──────────────────────────────────────────────┘
                        │
                        ▼ (WebSockets / REST)
┌──────────────────────────────────────────────┐
│              Fastify API Server              │
│       Session, Tasks, Queueing, Tools        │
└──────────────────────────────────────────────┘
            │           │            │
            ▼           ▼            ▼
   ┌─────────────┐ ┌──────────┐ ┌────────────┐
   │ PostgreSQL  │ │  Redis   │ │   Qdrant   │
   │  Metadata   │ │  Queue   │ │ Vector Mem │
   └─────────────┘ └──────────┘ └────────────┘
```

*   **Frontend**: React + TypeScript + Vite + TailwindCSS, utilizing Monaco for inline file reviews, XTerm.js for interactive terminal logs, and a custom chronological task execution timeline.
*   **Backend Gateway**: Fastify server handling WebSocket streaming, file management, task routing, and model routing.
*   **Message/Task Queue**: Redis and BullMQ managing asynchronous background tool executions and agent runs.
*   **Database Layers**:
    *   **PostgreSQL**: Keeps track of persistent records (sessions, tasks, steps, rules, and telemetry).
    *   **Qdrant**: High-performance vector database storing embeddings for semantic codebase search and memory retrieval.

---

## Prerequisites

Ensure you have the following installed on your machine:
- **Node.js** (v20.0.0 or higher)
- **npm** (v10.0.0 or higher)
- **Docker** and **Docker Compose**
- *(Optional for Windows users)* **WSL** (Windows Subsystem for Linux) with Docker integration enabled.

---

## Getting Started

### 1. Environment Configuration
Clone this repository, go to the project root directory, and copy the environment template to create your `.env` file:
```bash
cp .env.example .env
```
Open `.env` and fill in the necessary API keys (e.g., Anthropic, OpenAI, Gemini, or local Ollama URL configurations).

### 2. Install Project Dependencies
ARP is managed as a monorepo using **Turborepo** and npm workspaces. Run the following command at the root directory to install all package dependencies:
```bash
npm install
```

### 3. Start Backend Services (Docker Compose)
ARP requires PostgreSQL, Redis, and Qdrant to run. These services are pre-configured in `docker-compose.yml`.

#### Using standard Docker Compose:
```bash
docker compose up -d --wait
```

#### Using Docker inside Windows WSL:
If your Docker daemon runs inside a WSL distribution, execute:
```bash
wsl docker compose up -d --wait
```

### 4. Run Database Migrations
Once PostgreSQL is running, initialize the database schema and apply migrations using **Drizzle ORM**:
```bash
# Generate the migration files (if schemas are updated)
npm run db:generate

# Apply migrations to your running PostgreSQL instance
npm run db:migrate
```

### 5. Running the Application
Start both the Fastify backend API and the Vite React frontend concurrently in development mode:
```bash
npm run dev
```

*   **Frontend Workspace**: `http://localhost:5173`
*   **Backend API Gateway**: `http://localhost:3001`

---

## ⚡ Quick Start for Windows (One-Click Setup)
If you are developing on Windows with WSL Docker setup, you can launch the entire system using the provided batch script. Simply run:
```bash
start.bat
```
This script will automatically:
1. Verify WSL and Docker services are up.
2. Spin up your backend services (`PostgreSQL`, `Redis`, `Qdrant`) inside Docker and wait for them to report healthy status.
3. Launch the development workspace server (`npm run dev`).

---

## Key Features & Observability

- **Real-Time Timeline**: Observe your agent's thought process and execution states (`Reasoning` ➔ `Tool Execution` ➔ `Validation` ➔ `Final Response`) unfold in real time under each message.
- **Collapsible Tool Logs**: Expand the collapsed timeline headers to review individual tool executions (e.g., `Read file`, `Edited file`, `Ran command`).
- **Interactive Inspection**: Click on any execution pill inside the timeline to inspect the raw JSON inputs and outputs inside `JetBrains Mono` code blocks, complete with line addition/deletion metrics.
- **Auto-Grow Textarea**: Type multi-line inputs smoothly with zero input transition latency in the prompt editor.
