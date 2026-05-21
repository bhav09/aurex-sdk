# Enhanced Task Brief (ETB): Session-Aware OTP Reuse, Realistic Data Exports, and Google-Backed Analytics

## Original Request
The user wants a highly realistic, production-ready implementation of:
1. **Session-Aware OTP Reuse**: Users with an active/valid session (same browser session) must skip OTP verification and be asked directly to upload their file when clicking "Analyze another file".
2. **Realistic Provider Usage Data**: Sample data under `model provider usage data/` and `sample_data/` should resemble real-world raw CSV logs of OpenAI, Anthropic, and AWS Bedrock (e.g. Activity or Cost Reports) with all industry-standard columns, showing non-compliance/inefficiency patterns.
3. **Google-Backed Usage Analytics**: Store unique email addresses, session lifecycle events, and record every single application CTA button-click (using the service account file `aurex-495417-8ed2dc84792c.json` for storage like BigQuery or Google Cloud Storage).

---

## Operating Mode
`[Production]`

---

## Scope of Changes

### 1. Backend/Python (Auth & Sessions & Ingestion)
- **JWT & Session ID (`sid`) Tracking**: Add a server-side generated session ID inside JWT claims (`sid`) and/or a Redis-backed session lookup mapping.
- **OTP Verification Bypass**: Maintain active sessions so that if a user submits a valid JWT bearer token, they can create new audit sessions without a fresh OTP check. Update `POST /audit/sessions` to use standard `get_current_user` dependencies instead of checking Redis OTP directly.
- **Upload Endpoint Support**: Ensure `POST /upload/csv` and other parsing/ingestion endpoints support passing the active `session_id` and are authenticated.
- **Centralized Environment Configuration**: Load Google Cloud configuration (`GOOGLE_APPLICATION_CREDENTIALS` path, dataset name, bigquery logging options) cleanly through `Settings` in `backend/app/config.py`.

### 2. Frontend/TypeScript (API Client & Upload Zone)
- **sessionStorage Auth Persistence**: Save the JWT access token and user session details in `sessionStorage` (which persists per tab/session) so that same-session uploads can read the token and bypass OTP.
- **Same-Session Upload Flow**: Modify `UploadZone` and `AuditPage` so that if an active session token is present, the username, email, company, and OTP fields are hidden or pre-filled, and the file-upload interface is displayed directly.
- **Analyze Another File Transition**: Maintain the session when transitioning from results back to the upload screen, enabling frictionless multi-file re-analysis.

### 3. Google-Backed Analytics
- **Analytics Event Schema**: Write structured log records to Google BigQuery (or a safe Cloud Storage fallback if BigQuery is unprovisioned) tracking:
  - `unique_email_id` (recorded and safely hashed/tracked)
  - `button_click_count` (how many times the application was used / primary CTA was clicked)
  - `session_id` and `timestamp`
  - `event_type` (`otp_request`, `otp_verify`, `audit_start`, `file_upload`, `analysis_complete`)
- **Safe Service Account Usage**: Use `@aurex-495417-8ed2dc84792c.json` as a local credential via `GOOGLE_APPLICATION_CREDENTIALS` (do NOT hardcode paths or commit the private key to git).

### 4. Realistic Provider Data Exports & Normalizers
- **Realistic Dataset Generators**: Update `scripts/generate_test_data.py` to create raw, messy CSV files simulating real-world exports for:
  - **OpenAI**: `timestamp,organization_id,project_id,api_key_id,model,prompt_tokens,completion_tokens,cost,request_count,status`
  - **Anthropic**: `starting_at,ending_at,model,workspace_id,api_key_id,input_tokens,output_tokens,cache_read_input_tokens,cache_creation_tokens,cost_type,amount,currency`
  - **Bedrock**: `Timestamp,modelId,requestId,operation,inputTokenCount,outputTokenCount,latencyMs`
- **Updated Normalizers**: Check and ensure `OpenAiCsvNormalizer`, `AnthropicCsvNormalizer`, and `BedrockCsvNormalizer` process these realistic formats smoothly, using robust substring matching and snake_case normalization.

---

## Trade-offs
- **sessionStorage vs. localStorage vs. Cookies**:
  - *Trade-off*: sessionStorage isolates auth tokens to the active browser tab, protecting against cross-tab access and expiring when the tab closes. localStorage survives tab closure but exposes tokens longer.
  - *Decision*: sessionStorage matches the request of "same session" perfectly without storing credentials permanently.
- **BigQuery vs. local/SQL DB**:
  - *Trade-off*: BigQuery is the industry standard for analytical queries but adds an external network dependency.
  - *Decision*: Run BigQuery logging in a background thread or asynchronous task, failing gracefully if GCP credentials/resources are missing.

---

## Verification Plan

### Test Commands
1. Run backend tests to verify session-aware OTP and routes:
   ```bash
   pytest backend/tests/
   ```
2. Run frontend unit/integration tests:
   ```bash
   npm run test --prefix frontend
   ```
3. Run normalizer and generator verification scripts.
