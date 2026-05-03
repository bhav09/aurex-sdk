# Aurex

> **Your AI is bleeding money. We'll show you where.**

Aurex analyzes your LLM usage and finds hidden cost inefficiencies. Upload your CSV, get a Token Credit Score (0-100), and save thousands per month.

## The Problem

You're using GPT-4 for everything. Even simple tasks that could run on GPT-3.5 Turbo at 1/60th the cost.

**Real example:** $8,000/month → $1,200/month (85% savings)

## What Aurex Does

1. **Upload** your OpenAI/Anthropic/Bedrock usage CSV
2. **Analyze** with 5 detection algorithms
3. **Get** your Token Credit Score + actionable fixes
4. **Save** money immediately

## Quick Start

```bash
# Backend
cd backend
pip install -r requirements.txt
python main.py

# Frontend
cd frontend
npm install
npm run dev
```

Visit `http://localhost:3000` and upload your usage data.

## What We Detect

- **Agent Loops** - Same prompt repeating with growing context
- **Context Explosion** - Token usage doubling unnecessarily  
- **Redundant Prompts** - System prompts sent 1000x times
- **Model Misuse** - GPT-4 for 50-token tasks
- **Cost Drivers** - Top 20% events = 80% of your bill

## Architecture

```
frontend/          Next.js 14 + TypeScript + Tailwind
backend/           FastAPI + SQLAlchemy + Pandas
├── ingestion/     CSV/JSON parsers
├── detection/     5 cost detection algorithms
└── api/           REST endpoints
```

## Sample Output

```
Token Credit Score: 73/100
Current Spend: $450/week
Wasted: $122/week (27%)
Potential Savings: $6,344/year

Top Issue: System Prompt Waste
→ Sending 14,500 tokens 4,200 times
→ Fix: Cache system prompts
→ Save: $152/week
```

## Tech Stack

**Frontend:** Next.js • React • Framer Motion • Shadcn UI  
**Backend:** FastAPI • SQLAlchemy • Pandas • Python 3.10+

