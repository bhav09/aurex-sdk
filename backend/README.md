# Aurex Backend API

The high-performance FastAPI backend for Aurex AI cost-optimization. Handles CSV ingestion, team metrics aggregation, real-time alert configurations, SSO authentication, database ORM, and dashboard API endpoints.

---

## 🏗️ Project Structure

```
backend/
├── app/
│   └── config.py        # Settings and environment variable loaders
├── src/
│   ├── api/             # API Router mounts and sub-routers
│   │   ├── auth.py         # OTP & SSO Login authentication
│   │   ├── keys.py         # API key generation/management
│   │   ├── projects.py     # Team/Project workspaces
│   │   ├── ledger.py       # Telemetry log syncing
│   │   ├── dashboard.py    # Analytical metrics endpoints
│   │   ├── routes.py       # Ingestions, audit sessions & general routes
│   │   └── savings.py      # Saving baseline computations
│   ├── database.py      # SQLAlchemy engine/session config
│   ├── models/          # SQLAlchemy Database Models
│   ├── schemas/         # Pydantic Schemas for validation
│   ├── middleware/      # CORSMiddleware & Rate-limiting
│   └── utils/           # Logger, SMTP, rate limit helpers
├── main.py              # Application main entry point (uvicorn runner)
├── requirements.txt     # Python backend dependencies
└── aurex.db             # SQLite local database (generated in dev)
```

---

## ⚡ Development Setup

### 1. Initialize Virtual Environment

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # macOS / Linux
# or: .venv\Scripts\activate on Windows
```

### 2. Install Dependencies

```bash
pip install -r requirements.txt
```

### 3. Run Development Server

```bash
python main.py
```
- Server launches at [http://localhost:8000](http://localhost:8000)
- Swagger interactive documentation is at [http://localhost:8000/docs](http://localhost:8000/docs)
- Redoc API docs at [http://localhost:8000/redoc](http://localhost:8000/redoc)

---

## 📡 API Endpoints Reference

All routes are mounted under `/api/v1`.

### 🔐 Authentication & Access Control
| Method | Route | Description | Auth Required |
| :--- | :--- | :--- | :---: |
| `POST` | `/api/v1/auth/request-otp` | Request a verification OTP code via email. | No |
| `POST` | `/api/v1/auth/verify-otp` | Verify OTP code and receive JWT auth token. | No |
| `POST` | `/api/v1/auth/sso-login` | Authenticate using SSO login. | No |
| `POST` | `/api/v1/auth/google-login` | Authenticate using Google OAuth token. | No |
| `GET` | `/api/v1/auth/session` | Get active user session info. | Yes |

### 🔑 Client API Keys
| Method | Route | Description | Auth Required |
| :--- | :--- | :--- | :---: |
| `POST` | `/api/v1/auth/api-keys` | Generate a new SDK Client API key. | Yes |
| `GET` | `/api/v1/auth/api-keys` | Retrieve all active SDK Client API keys. | Yes |
| `DELETE` | `/api/v1/auth/api-keys/{key_id}`| Deactivate/Delete an API key. | Yes |
| `POST` | `/api/v1/auth/api-keys/{key_id}/rotate`| Rotate an existing API key. | Yes |

### 📁 Data Ingestion & Offline Audits
| Method | Route | Description | Auth Required |
| :--- | :--- | :--- | :---: |
| `POST` | `/api/v1/upload/csv` | Ingest CSV telemetry dump (from OpenAI/Anthropic/Bedrock). | Yes |
| `POST` | `/api/v1/sdk/events` | Sync batched SDK telemetry events asynchronously. | Yes (API Key) |
| `POST` | `/api/v1/audit/sessions` | Create a new offline audit session. | Yes |
| `PATCH`| `/api/v1/audit/sessions/{id}`| Update audit session parameters. | Yes |
| `GET` | `/api/v1/audit/sessions/{id}`| Retrieve audit session status/metadata. | Yes |
| `GET` | `/api/v1/audit/sessions/{id}/report`| Generate full JSON analysis report for audit. | Yes |
| `GET` | `/api/v1/audit/history/{email}`| List all past audits run by a user email. | Yes |
| `DELETE`| `/api/v1/audit/sessions/{id}`| Clear/Delete an audit session. | Yes |

### 📊 Metrics & Savings Dashboards
| Method | Route | Description | Auth Required |
| :--- | :--- | :--- | :---: |
| `GET` | `/api/v1/executive-summary` | Overall executive summaries (spend, score, waste). | Yes |
| `GET` | `/api/v1/workflows` | List all tracked logic workflows. | Yes |
| `GET` | `/api/v1/insights` | Fetch top cost leaks and actions. | Yes |
| `GET` | `/api/v1/stats` | Overviews of tokens, cached tokens, and costs. | Yes |
| `GET` | `/api/v1/analytics/savings-realization` | Historical savings realization metrics. | Yes |
| `POST` | `/api/v1/pricing/overrides` | Create a custom provider/model pricing override. | Yes |
| `GET` | `/api/v1/pricing/overrides` | View all active custom pricing overrides. | Yes |

---

## 🎛️ Configuration & Env Variables

You can configure the backend via the following environment variables or a `.env` file in the root `backend/` directory:

| Key | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `DATABASE_URL` | `string` | `sqlite:///./aurex.db` | SQLAlchemy database connection URI. (e.g. `postgresql://user:pass@localhost/db`) |
| `API_HOST` | `string` | `0.0.0.0` | Host IP address to bind Uvicorn server to. |
| `API_PORT` | `integer`| `8000` | Port to bind Uvicorn server to. |
| `DEBUG` | `boolean`| `True` | Set to `False` in production to enforce strict security checks. |
| `JWT_SECRET` | `string` | `dev-secret-key-change-in-prod` | Secret key for signing JWT tokens. Must be changed in production. |
| `JWT_EXPIRATION_MINUTES`| `integer`| `10080` (7 Days) | Duration before generated JWT tokens expire. |
| `RESEND_API_KEY` | `string` | `""` | SMTP key for email OTP codes via Resend. |
| `GOOGLE_OAUTH_CLIENT_ID`| `string` | `""` | Google OAuth Client ID for SSO. |
| `FRONTEND_URL` | `string` | `http://localhost:3000` | Redirect target URL for web frontend authentication. |

---

## 🔒 Security Practices & Tenancy Checks

1. **Production JWT Key Enforcer**: If `DEBUG=False` and `JWT_SECRET` is the default `dev-secret-key-change-in-prod`, the backend will intentionally crash on startup to prevent running with compromised secrets.
2. **Multi-Tenant Invalidation**: Custom Pricing Overrides, Audit Records, and Alert Rules are strictly partitioned. Every database fetch validates the workspace's tenancy domain or active user profile to prevent cross-tenant data leaks.
3. **Rate Limiting**: Critical endpoints (such as OTP generation and SSO logins) are protected by IP-based sliding window rate-limiters.