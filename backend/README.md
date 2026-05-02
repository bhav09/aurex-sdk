# Aurix Backend

> **Stop wasting money on LLM API calls.** Aurix finds hidden cost leaks in your AI infrastructure.

## ⚡ Quick Start

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Run the server
python main.py

# 3. Upload your usage data
# Visit http://localhost:8000/docs for API playground
```

## What It Does

- **Ingests** CSV/JSON from OpenAI, Anthropic, AWS Bedrock, llm-use
- **Detects** 5 types of cost inefficiencies (agent loops, context explosion, etc.)
- **Calculates** your Token Credit Score (0-100)
- **Saves** $1000s/month with actionable recommendations

## API Endpoints

```
POST   /api/v1/upload/csv              # Upload usage data
GET    /api/v1/executive-summary       # Get cost analysis
GET    /api/v1/audit/history/{email}   # View past audits
```

## Database

SQLite by default. Set `DATABASE_URL` for PostgreSQL:
```bash
export DATABASE_URL="postgresql://user:pass@localhost/aurix"
```

## Test with Sample Data

```bash
python main.py
# Upload: backend/supportbot_ai_usage.csv
```

## Tech Stack

FastAPI • SQLAlchemy • Pandas • Python 3.10+

---

**Built for developers who care about their AI budget** 💰