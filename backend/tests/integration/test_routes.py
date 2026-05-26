import pytest
from httpx import AsyncClient
from src.models import LLMEvent, AuditSession
import json

class TestApiRoutes:
    @pytest.mark.asyncio
    async def test_health_check(self, client: AsyncClient):
        response = await client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "healthy"}

    @pytest.mark.asyncio
    async def test_get_events_unauthenticated(self, client: AsyncClient):
        response = await client.get("/api/v1/events")
        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_create_audit_session(self, client: AsyncClient, monkeypatch):
        # Mock redis_client.get to return a verified OTP
        async def mock_get(*args, **kwargs):
            return json.dumps({"verified": True})
        
        from src.api.auth import redis_client
        monkeypatch.setattr(redis_client, "get", mock_get)
        
        payload = {
            "user_name": "John Doe",
            "email": "john@example.com",
            "company_name": "Acme",
            "file_name": "test.csv",
            "file_type": "csv"
        }
        response = await client.post("/api/v1/audit/sessions", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == "john@example.com"
        assert "id" in data

    @pytest.mark.asyncio
    async def test_get_executive_summary_unauthenticated(self, client: AsyncClient):
        response = await client.get("/api/v1/executive-summary")
        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_clear_data(self, client: AsyncClient):
        response = await client.delete("/api/v1/clear-data?confirm=true")
        assert response.status_code == 403
        assert "detail" in response.json()
        assert response.json()["detail"] == "Disabled in production"

    @pytest.mark.asyncio
    async def test_create_audit_session_with_jwt_bypasses_otp(self, client: AsyncClient, monkeypatch):
        from src.api.auth import create_access_token, redis_client
        
        async def mock_get(*args, **kwargs):
            return None
        monkeypatch.setattr(redis_client, "get", mock_get)
        
        email = "session_user@example.com"
        token = create_access_token(data={"sub": email})
        
        payload = {
            "user_name": "Session User",
            "email": email,
            "company_name": "Session Corp",
            "file_name": "test.csv",
            "file_type": "csv"
        }
        
        headers = {"Authorization": f"Bearer {token}"}
        response = await client.post("/api/v1/audit/sessions", json=payload, headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == email
        assert "id" in data

    @pytest.mark.asyncio
    async def test_create_audit_session_with_jwt_mismatched_email_fails(self, client: AsyncClient, monkeypatch):
        from src.api.auth import create_access_token
        email = "session_user@example.com"
        token = create_access_token(data={"sub": email})
        
        payload = {
            "user_name": "Other User",
            "email": "other_user@example.com",
            "company_name": "Other Corp",
            "file_name": "test.csv",
            "file_type": "csv"
        }
        
        headers = {"Authorization": f"Bearer {token}"}
        response = await client.post("/api/v1/audit/sessions", json=payload, headers=headers)
        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_auth_session_endpoint(self, client: AsyncClient):
        from src.api.auth import create_access_token
        email = "session_user@example.com"
        token = create_access_token(data={"sub": email})
        
        headers = {"Authorization": f"Bearer {token}"}
        response = await client.get("/api/v1/auth/session", headers=headers)
        assert response.status_code == 200
        assert response.json()["email"] == email
        assert response.json()["status"] == "active"

    @pytest.mark.asyncio
    async def test_auth_session_endpoint_unauthenticated(self, client: AsyncClient):
        response = await client.get("/api/v1/auth/session")
        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_upload_csv(self, client: AsyncClient):
        from src.api.auth import create_access_token
        email = "uploader@example.com"
        token = create_access_token(data={"sub": email})
        
        csv_content = (
            "timestamp,model,prompt_tokens,completion_tokens,cost\n"
            "2026-05-21T10:00:00Z,gpt-4o,100,50,0.015\n"
            "2026-05-21T10:05:00Z,claude-3-5-sonnet,200,100,0.03\n"
        )
        
        files = {
            "file": ("test_upload.csv", csv_content, "text/csv")
        }
        
        headers = {"Authorization": f"Bearer {token}"}
        response = await client.post(
            "/api/v1/upload/csv?session_id=mock-session-id",
            files=files,
            headers=headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert data["events_ingested"] == 2
        assert data["upload_session_id"] == "mock-session-id"

    @pytest.mark.asyncio
    async def test_upload_csv_sanitized_and_nested(self, client: AsyncClient):
        from src.api.auth import create_access_token
        email = "uploader@example.com"
        token = create_access_token(data={"sub": email})
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Test CSV with stringified numbers containing commas and spaces
        csv_content = (
            "timestamp,model,prompt_tokens,completion_tokens,cost\n"
            "2026-05-21T10:00:00Z,gpt-4o,\" 1,000 \",\" 500 \",\" 0.015 \"\n"
        )
        files = {"file": ("test_sanitize.csv", csv_content, "text/csv")}
        response = await client.post(
            "/api/v1/upload/csv?session_id=session-sanitize",
            files=files,
            headers=headers
        )
        assert response.status_code == 200
        assert response.json()["events_ingested"] == 1

        # 2. Test JSON with nested metadata (e.g. Vertex AI logs)
        vertex_json = json.dumps([
            {
                "logging_time": "2026-05-20T21:30:00Z",
                "model": "publishers/google/models/gemini-1.5-pro-001",
                "metadata": {
                    "input_token_count": " 600 ",
                    "output_token_count": " 700 "
                }
            }
        ])
        files = {"file": ("vertex.json", vertex_json, "application/json")}
        response = await client.post(
            "/api/v1/upload/csv?session_id=session-nested",
            files=files,
            headers=headers
        )
        assert response.status_code == 200
        assert response.json()["events_ingested"] == 1

        # 3. Test AWS Bedrock schema (no model column, but bedrock indicators)
        bedrock_csv = (
            "Timestamp,InputTokenCount,InvocationLatency,Invocations,OutputTokenCount\n"
            "2026-05-15T10:00:01Z,387,1543,1,120\n"
        )
        files = {"file": ("bedrock.csv", bedrock_csv, "text/csv")}
        response = await client.post(
            "/api/v1/upload/csv?session_id=session-bedrock",
            files=files,
            headers=headers
        )
        assert response.status_code == 200
        assert response.json()["events_ingested"] == 1

    @pytest.mark.asyncio
    async def test_track_click(self, client: AsyncClient):
        payload = {
            "button_id": "test_cta_button",
            "email": "test@example.com",
            "session_id": "session-123"
        }
        response = await client.post("/api/v1/analytics/click", json=payload)
        assert response.status_code == 200
        assert response.json() == {"status": "success"}

    @pytest.mark.asyncio
    async def test_generate_optimization(self, client: AsyncClient, monkeypatch):
        from src.api.auth import create_access_token, redis_client
        
        async def mock_get(*args, **kwargs):
            return json.dumps({"verified": True})
        monkeypatch.setattr(redis_client, "get", mock_get)
        
        email = "user@example.com"
        token = create_access_token(data={"sub": email})
        headers = {"Authorization": f"Bearer {token}"}
        
        payload = {
            "issue_type": "expensive_model_misuse",
            "issue_title": "Expensive Model Misuse",
            "weekly_cost": 150.0,
            "one_line_summary": "Low complexity tasks run on GPT-4o instead of GPT-4o-mini",
            "message": "Give me code snippet to resolve this",
            "chat_history": []
        }
        
        response = await client.post("/api/v1/optimization/generate", json=payload, headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert "response" in data
        assert "Dynamic Router Middleware" in data["response"]

    @pytest.mark.asyncio
    async def test_sso_login_integration(self, client: AsyncClient):
        payload = {
            "email": "integration.sso@heyaurex.com",
            "user_name": "Integration Tester",
            "company_name": "Integration Org",
            "provider": "google"
        }
        response = await client.post("/api/v1/auth/sso-login", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        assert data["user_info"]["email"] == "integration.sso@heyaurex.com"
        assert data["user_info"]["company_name"] == "Integration Org"

    @pytest.mark.asyncio
    async def test_pricing_overrides_endpoints(self, client: AsyncClient):
        from src.api.auth import create_access_token
        email = "override-tester@example.com"
        token = create_access_token(data={"sub": email})
        headers = {"Authorization": f"Bearer {token}"}
        company = "Override Corp"

        # 1. Create an audit session first
        session_payload = {
            "user_name": "Override Tester",
            "email": email,
            "company_name": company,
            "file_name": "test_overrides.csv",
            "file_type": "csv"
        }
        session_resp = await client.post("/api/v1/audit/sessions", json=session_payload, headers=headers)
        assert session_resp.status_code == 200
        session_id = session_resp.json()["id"]

        # 2. Upload events for this session
        csv_content = (
            "timestamp,model,prompt_tokens,completion_tokens,cost\n"
            "2026-05-21T10:00:00Z,gpt-4o,1000000,1000000,12.50\n"  # 1M input & 1M output -> standard cost is 2.50 + 10.00 = 12.50
        )
        files = {"file": ("test_overrides.csv", csv_content, "text/csv")}
        upload_resp = await client.post(
            f"/api/v1/upload/csv?session_id={session_id}",
            files=files,
            headers=headers
        )
        assert upload_resp.status_code == 200
        
        # 3. Retrieve events and verify initial cost
        events_resp = await client.get("/api/v1/events", headers=headers)
        assert events_resp.status_code == 200
        events = events_resp.json()
        test_event = next(e for e in events if e["model"] == "gpt-4o")
        assert abs(test_event["cost"] - 12.50) < 1e-4

        # 4. Upload pricing overrides (POST /pricing/overrides)
        overrides_json = json.dumps([
            {"model": "gpt-4o", "input": 1.00, "output": 4.00}  # overridden input = 1.00, output = 4.00 (Total: 5.00)
        ])
        override_files = {"file": ("overrides.json", overrides_json, "application/json")}
        override_resp = await client.post(
            f"/api/v1/pricing/overrides?company_name={company}",
            files=override_files,
            headers=headers
        )
        assert override_resp.status_code == 200
        assert override_resp.json()["status"] == "success"
        assert override_resp.json()["overrides_added"] == 1

        # 5. Verify overrides GET endpoint
        overrides_get_resp = await client.get(
            f"/api/v1/pricing/overrides?company_name={company}",
            headers=headers
        )
        assert overrides_get_resp.status_code == 200
        overrides_list = overrides_get_resp.json()
        assert len(overrides_list) == 1
        assert overrides_list[0]["model_name"] == "gpt-4o"
        assert overrides_list[0]["input_price_per_1m"] == 1.00
        assert overrides_list[0]["output_price_per_1m"] == 4.00

        # 6. Verify that the event cost was recalculated with overridden pricing in the database
        events_recalculated_resp = await client.get("/api/v1/events", headers=headers)
        assert events_recalculated_resp.status_code == 200
        recalculated_events = events_recalculated_resp.json()
        recalculated_event = next(e for e in recalculated_events if e["model"] == "gpt-4o")
        assert abs(recalculated_event["cost"] - 5.00) < 1e-4

    @pytest.mark.asyncio
    async def test_alert_rules_endpoints(self, client: AsyncClient):
        from src.api.auth import create_access_token
        email = "rules-tester@example.com"
        token = create_access_token(data={"sub": email})
        headers = {"Authorization": f"Bearer {token}"}
        company = "Rules Corp"

        # 1. Configure the alert rule
        rule_payload = {
            "company_name": company,
            "trigger_type": "waste_percentage",
            "threshold": 10.0,
            "channel": "slack",
            "channel_config": {"webhook_url": "https://hooks.slack.com/services/test"}
        }
        rule_resp = await client.post("/api/v1/alerts/configure", json=rule_payload, headers=headers)
        assert rule_resp.status_code == 200
        data = rule_resp.json()
        assert data["company_name"] == company
        assert data["trigger_type"] == "waste_percentage"
        assert data["threshold"] == 10.0
        assert data["channel"] == "slack"
        assert data["channel_config"] == {"webhook_url": "https://hooks.slack.com/services/test"}
        assert data["enabled"] is True

        # 2. Retrieve alert rules
        get_resp = await client.get(f"/api/v1/alerts/rules?company_name={company}", headers=headers)
        assert get_resp.status_code == 200
        rules = get_resp.json()
        assert len(rules) == 1
        assert rules[0]["company_name"] == company
        assert rules[0]["trigger_type"] == "waste_percentage"

    @pytest.mark.asyncio
    async def test_alert_and_crm_triggers_on_patch(self, client: AsyncClient, monkeypatch):
        from src.api.auth import create_access_token
        email = "alert-tester@example.com"
        token = create_access_token(data={"sub": email})
        headers = {"Authorization": f"Bearer {token}"}
        company = "Alert Corp"

        # 1. Configure the alert rule first
        rule_payload = {
            "company_name": company,
            "trigger_type": "waste_percentage",
            "threshold": 15.0,
            "channel": "slack",
            "channel_config": {"webhook_url": "https://hooks.slack.com/services/mock_webhook"}
        }
        rule_resp = await client.post("/api/v1/alerts/configure", json=rule_payload, headers=headers)
        assert rule_resp.status_code == 200

        # 2. Create the audit session
        session_payload = {
            "user_name": "Alert Tester",
            "email": email,
            "company_name": company,
            "file_name": "test_alerts.csv",
            "file_type": "csv"
        }
        session_resp = await client.post("/api/v1/audit/sessions", json=session_payload, headers=headers)
        assert session_resp.status_code == 200
        session_id = session_resp.json()["id"]

        # Mock slack and crm calls
        slack_called = []
        crm_called = []

        async def mock_send_slack_alert(webhook_url, session_id, company_name, user_name, email, credit_score, total_cost, wasted_cost, waste_percentage, top_issues=None):
            slack_called.append({
                "webhook_url": webhook_url,
                "session_id": session_id,
                "company_name": company_name,
                "waste_percentage": waste_percentage
            })
            return True

        async def mock_sync_lead_to_crm(email, user_name, company_name, credit_score, waste_percentage, total_cost, wasted_cost, annual_savings):
            crm_called.append({
                "email": email,
                "company_name": company_name,
                "waste_percentage": waste_percentage,
                "annual_savings": annual_savings
            })
            return True

        monkeypatch.setattr("src.utils.slack.send_slack_alert", mock_send_slack_alert)
        monkeypatch.setattr("src.integrations.crm.sync_lead_to_crm", mock_sync_lead_to_crm)

        # 3. Patch/Update session with waste_percentage = 20.0 (which triggers the rule threshold of 15.0)
        patch_payload = {
            "waste_percentage": 20.0,
            "credit_score": 80,
            "total_cost": 1000.0,
            "wasted_cost": 200.0,
            "analysis_results": {
                "executive_summary": {
                    "annual_savings_projection": 2400.0
                },
                "top_issues": []
            }
        }
        patch_resp = await client.patch(f"/api/v1/audit/sessions/{session_id}", json=patch_payload, headers=headers)
        assert patch_resp.status_code == 200

        # Verify mock assertions
        assert len(slack_called) == 1
        assert slack_called[0]["webhook_url"] == "https://hooks.slack.com/services/mock_webhook"
        assert slack_called[0]["company_name"] == company
        assert slack_called[0]["waste_percentage"] == 20.0

        assert len(crm_called) == 1
        assert crm_called[0]["email"] == email
        assert crm_called[0]["company_name"] == company
        assert crm_called[0]["waste_percentage"] == 20.0
        assert crm_called[0]["annual_savings"] == 2400.0

    @pytest.mark.asyncio
    async def test_savings_realization_endpoint(self, client: AsyncClient):
        from src.api.auth import create_access_token
        email = "savings-tester@example.com"
        token = create_access_token(data={"sub": email})
        headers = {"Authorization": f"Bearer {token}"}
        company = "Savings Corp"

        # 1. Create first session (baseline)
        session1_payload = {
            "user_name": "Savings Tester",
            "email": email,
            "company_name": company,
            "file_name": "baseline.csv",
            "file_type": "csv"
        }
        resp1 = await client.post("/api/v1/audit/sessions", json=session1_payload, headers=headers)
        assert resp1.status_code == 200
        sid1 = resp1.json()["id"]

        patch1_payload = {
            "waste_percentage": 40.0,
            "credit_score": 60,
            "total_cost": 500.0,
            "wasted_cost": 200.0,
            "analysis_results": {
                "executive_summary": {
                    "annual_savings_projection": 10400.0
                },
                "top_issues": [
                    {"issue_type": "expensive_model_misuse", "weekly_cost": 200.0}
                ]
            }
        }
        patch_resp1 = await client.patch(f"/api/v1/audit/sessions/{sid1}", json=patch1_payload, headers=headers)
        assert patch_resp1.status_code == 200

        # 2. Create second session (improved)
        session2_payload = {
            "user_name": "Savings Tester",
            "email": email,
            "company_name": company,
            "file_name": "improved.csv",
            "file_type": "csv"
        }
        resp2 = await client.post("/api/v1/audit/sessions", json=session2_payload, headers=headers)
        assert resp2.status_code == 200
        sid2 = resp2.json()["id"]

        patch2_payload = {
            "waste_percentage": 20.0,
            "credit_score": 80,
            "total_cost": 600.0,
            "wasted_cost": 120.0,
            "analysis_results": {
                "executive_summary": {
                    "annual_savings_projection": 6240.0
                },
                "top_issues": [
                    {"issue_type": "expensive_model_misuse", "weekly_cost": 120.0}
                ]
            }
        }
        patch_resp2 = await client.patch(f"/api/v1/audit/sessions/{sid2}", json=patch2_payload, headers=headers)
        assert patch_resp2.status_code == 200

        # 3. Request savings realization metrics
        savings_resp = await client.get(
            f"/api/v1/analytics/savings-realization?company_name={company}",
            headers=headers
        )
        assert savings_resp.status_code == 200
        data = savings_resp.json()

        # Expected realized savings = (40.0 - 20.0) / 100 * 600 = 120.0
        assert data["total_realized_savings"] == 120.0
        assert data["annualized_savings_run_rate"] == 6240.0
        assert len(data["timeline"]) == 2
        assert data["timeline"][0]["realized_savings"] == 0.0
        assert data["timeline"][1]["realized_savings"] == 120.0
        assert "expensive_model_misuse" in data["category_breakdown"]
        # expected expensive_model_misuse category savings = 120.0 * 52 = 6240.0
        assert data["category_breakdown"]["expensive_model_misuse"] == 6240.0

    @pytest.mark.asyncio
    async def test_pdf_report_export_endpoint(self, client: AsyncClient):
        from src.api.auth import create_access_token
        email = "pdf-tester@example.com"
        token = create_access_token(data={"sub": email})
        headers = {"Authorization": f"Bearer {token}"}
        company = "PDF Corp"

        # 1. Create audit session
        session_payload = {
            "user_name": "PDF Tester",
            "email": email,
            "company_name": company,
            "file_name": "pdf_test.csv",
            "file_type": "csv"
        }
        resp = await client.post("/api/v1/audit/sessions", json=session_payload, headers=headers)
        assert resp.status_code == 200
        session_id = resp.json()["id"]

        # 2. Patch audit session with some results
        patch_payload = {
            "waste_percentage": 25.0,
            "credit_score": 75,
            "total_cost": 400.0,
            "wasted_cost": 100.0,
            "analysis_results": {
                "executive_summary": {
                    "annual_savings_projection": 5200.0
                },
                "top_issues": [
                    {"title": "Redundant System Prompts", "severity": "HIGH", "weekly_cost": 100.0, "description": "Duplicate system prompts are sent."}
                ]
            }
        }
        patch_resp = await client.patch(f"/api/v1/audit/sessions/{session_id}", json=patch_payload, headers=headers)
        assert patch_resp.status_code == 200

        # 3. Export PDF
        pdf_resp = await client.get(f"/api/v1/audit/sessions/{session_id}/report", headers=headers)
        assert pdf_resp.status_code == 200
        assert pdf_resp.headers["Content-Type"] == "application/pdf"
        assert "Content-Disposition" in pdf_resp.headers
        assert "attachment" in pdf_resp.headers["Content-Disposition"]
        
        content = pdf_resp.content
        assert content.startswith(b"%PDF-1.4")
        assert b"AUREX" in content.upper()
        assert b"PDF Corp" in content

    @pytest.mark.asyncio
    async def test_api_key_lifecycle(self, client: AsyncClient):
        from src.api.auth import create_access_token
        email = "keymaster@example.com"
        token = create_access_token(data={"sub": email})
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Create key
        create_payload = {
            "name": "Production SDK Key",
            "company_name": "Key Corp"
        }
        resp = await client.post("/api/v1/auth/api-keys", json=create_payload, headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "key" in data
        assert data["key"].startswith("ax_live_")
        assert data["name"] == "Production SDK Key"
        assert data["company_name"] == "Key Corp"
        key_id = data["id"]

        # 2. List keys
        list_resp = await client.get("/api/v1/auth/api-keys", headers=headers)
        assert list_resp.status_code == 200
        keys_list = list_resp.json()
        assert len(keys_list) == 1
        assert keys_list[0]["id"] == key_id
        assert keys_list[0]["name"] == "Production SDK Key"

        # 3. Revoke key
        revoke_resp = await client.delete(f"/api/v1/auth/api-keys/{key_id}", headers=headers)
        assert revoke_resp.status_code == 200
        assert revoke_resp.json()["status"] == "success"

        # 4. List keys again (should be empty/inactive)
        list_resp2 = await client.get("/api/v1/auth/api-keys", headers=headers)
        assert list_resp2.status_code == 200
        assert len(list_resp2.json()) == 0





