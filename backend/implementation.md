You are building the backend for a product called **Aurix**.

## Goal

Build a backend system that:

1. Ingests LLM usage data from:
   * JSON session logs (from llm-use)
   * CSV exports (from OpenAI / Anthropic via llm-cost-optimizer)
2. Normalizes the data into a unified schema
3. Detects cost inefficiencies (core feature)
4. Exposes APIs for insights + recommendations

---

# Step 1: Project Setup

* Use Python (FastAPI) or Node.js (Express + TypeScript)
* Folder structure:

backend/
├── llm-use/                  # cloned repo
├── llm-cost-optimizer/       # cloned repo
├── src/
│    ├── ingestion/
│    ├── normalization/
│    ├── detection/
│    ├── api/
│    ├── utils/
│    └── models/
├── database/
└── main.py (or index.ts)

---

# Step 2: Define Unified Data Schema (CRITICAL)

Create a single schema called `LLMEvent`:

Fields:

* id (uuid)
* timestamp
* provider (openai | anthropic)
* model
* workflow_id
* step_id
* parent_step_id
* input_tokens
* output_tokens
* total_tokens
* cost
* prompt
* response
* system_prompt_hash
* context_length
* metadata (json)

Store in:

* PostgreSQL OR SQLite (for MVP)

---

# Step 3: JSON Ingestion (llm-use integration)

Goal: Parse session logs

Steps:

1. Locate llm-use session directory

2. Read JSON files

3. Extract:

   * steps in execution
   * prompt / response
   * token usage
   * cost per run

4. Map each step → LLMEvent

Important:

* Maintain parent-child relationships (workflow graph)
* Assign workflow_id per session

Output:

* Store normalized events in DB

---

# Step 4: CSV Ingestion (llm-cost-optimizer integration)

Goal: Upload + process CSV files

Steps:

1. Create API endpoint:
   POST /upload/csv

2. Parse CSV:

   * timestamp
   * model
   * tokens
   * cost

3. Convert rows → LLMEvent

4. Add derived fields:

   * total_tokens = input + output
   * context_length (estimate if missing)

Store in DB

---

# Step 5: Cost Calculation Layer

If cost not present:

* Use model pricing table
* Compute:
  cost = (input_tokens * input_price + output_tokens * output_price)

(Optional: use external pricing JSON like llm-prices repo)

---

# Step 6: Detection Engine (CORE LOGIC)

Create a module: detection/engine.py

Implement these detectors:

---

### 1. Agent Loop Detection

Logic:

* Same prompt repeats
* context_length increasing each step

Flag if:

* repeated > 3 times
* tokens increasing

---

### 2. Context Explosion

Logic:

* context_length grows monotonically

Flag if:

* increase > 2x within same workflow

---

### 3. Redundant System Prompts

Logic:

* identical system_prompt_hash across events

Flag:

* repeated system prompts consuming >20% tokens

---

### 4. Expensive Model Misuse

Logic:

* high-cost model used for low token/simple tasks

Example:

* GPT-4 used for <200 tokens repeatedly

---

### 5. Top Cost Drivers

Group by:

* workflow_id
* model
* feature (if metadata available)

Return:

* top 20% events contributing to 80% cost

---

# Step 7: Recommendation Engine

For each issue detected, generate fixes:

Examples:

Agent Loop:
→ "Add termination condition"
→ "Avoid re-sending full conversation"

Context Explosion:
→ "Summarize history"
→ "Trim context window"

Redundant Prompts:
→ "Move system prompt to shared memory"

Expensive Model:
→ "Downgrade to cheaper model"

---

# Step 8: API Layer

Create endpoints:

GET /events
GET /workflows
GET /insights
GET /insights/{workflow_id}

POST /upload/csv
POST /ingest/json

Response format:

{
"total_cost": ...,
"wasted_cost": ...,
"issues": [
{
"type": "agent_loop",
"severity": "high",
"cost_impact": ...,
"recommendation": "..."
}
]
}

---

# Step 9: Basic Dashboard Support

Add aggregation queries:

* cost per day
* cost per model
* cost per workflow
* token usage trends

---

# Step 10: MVP Success Criteria

System should:

* ingest JSON + CSV
* normalize data
* detect at least 3 inefficiency patterns
* return actionable recommendations

---

# Important Constraints

* Keep everything modular
* Do NOT tightly couple to llm-use internals
* Treat both sources as "data providers"

---

# Bonus (if time permits)

* Add caching detection
* Add prompt deduplication detection
* Add anomaly detection (sudden cost spikes)
