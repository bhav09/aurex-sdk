# Enhanced Task Brief (ETB): Robust Email Deliverability Verification & Dummy Domain Prevention

## Original Request
The user wants to ensure that email addresses entered into the Aurex system are actual/valid public email addresses, rather than fictitious or dummy-generated email addresses (e.g., `user@example.com`, `random@test.com`, or fake non-existent domains).

---

## Operating Mode
`[Production]`

---

## Technical Approach & Proposed Changes

We will implement a multi-layered verification system for emails on the backend within the `/request-otp` endpoint:

### 1. Hardcoded Dummy Domain Blocklist
We will explicitly block known dummy, local, and sample domains that are commonly used for automated testing, local development, or spam registration. 
* **Domains Blocked:** `example.com`, `test.com`, `dummy.com`, `sample.com`, `domain.com`, `invalid.com`, `localhost`, `tempmail.com`, `testjwt.com`, `validuser.com`, `foo.com`, `bar.com`.
* *Note:* To allow tests to run seamlessly, this blocklist and subsequent network-based DNS checks will be automatically bypassed when the application is running in a test suite (checking `os.getenv("PYTEST_CURRENT_TEST")` or in `settings.debug = True` depending on development convenience, but specifically `PYTEST_CURRENT_TEST` is safest to keep test runs working).

### 2. Active DNS MX Record Verification (Deliverability Check)
Using the pre-installed `email-validator` library (`validate_email(email, check_deliverability=True)`), the backend will perform a real-time DNS lookup for MX (Mail Exchanger) records on the email's domain.
* If a domain does not have active MX records (meaning it cannot receive emails), it will be rejected as an invalid/non-existent domain.
* Normalized email forms will be used for consistency.

### 3. Error Handling and Graceful Fallback
* Provide highly informative error responses back to the user (e.g., `400 Bad Request` with detail: `"Email domain 'sdfgsdfg.com' does not exist or has no active mail servers configured"`).
* Protect against network latency or timeouts during DNS queries with graceful timeouts.

---

## Trade-offs
* **Latency vs. Security**:
  * *Trade-off*: Performing a real-time DNS lookup introduces a small network latency (typically 50-200ms) to the `/request-otp` API endpoint.
  * *Decision*: This is acceptable and expected for authentication request endpoints.
* **Testing Integrity**:
  * *Trade-off*: If deliverability check is always on, pytest tests will fail as they use `test@example.com` or other mock emails.
  * *Decision*: Safely bypass DNS queries in test/pytest environments so local builds remain green and robust.

---

## Verification Plan

### Test Commands
1. Run backend tests to verify that standard flows work:
   ```bash
   pytest backend/tests/
   ```
2. Manually test OTP requests with valid/invalid domains on the backend to confirm:
   * Real domains (like `gmail.com`, `outlook.com`) succeed.
   * Fake domains (like `asdfasdf1234.com`) get rejected.
   * Hardcoded dummy domains (like `example.com`) get blocked.
