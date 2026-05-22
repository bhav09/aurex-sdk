import sys
import os
import unittest
import time
import types
import json
from unittest.mock import MagicMock, AsyncMock, patch

# Add the directory to path so it can import aurex_sdk
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

# Create mock modules to satisfy import checks in auditor
if 'anthropic' not in sys.modules:
    anthropic_mock = types.ModuleType('anthropic')
    anthropic_mock.resources = types.ModuleType('resources')
    anthropic_mock.resources.messages = types.ModuleType('messages')
    
    class MockMessages:
        @staticmethod
        def create(*args, **kwargs):
            pass
            
    class MockAsyncMessages:
        @staticmethod
        async def create(*args, **kwargs):
            pass
            
    anthropic_mock.resources.messages.Messages = MockMessages
    anthropic_mock.resources.messages.AsyncMessages = MockAsyncMessages
    sys.modules['anthropic'] = anthropic_mock

if 'google' not in sys.modules:
    google_mock = types.ModuleType('google')
    google_mock.generativeai = types.ModuleType('generativeai')
    
    class MockGenerativeModel:
        def __init__(self, model_name="gemini-1.5-flash", system_instruction=None):
            self.model_name = model_name
            self.system_instruction = system_instruction
            self._system_instruction = system_instruction
            
        def generate_content(self, *args, **kwargs):
            pass
            
        async def generate_content_async(self, *args, **kwargs):
            pass
            
    google_mock.generativeai.GenerativeModel = MockGenerativeModel
    sys.modules['google'] = google_mock
    sys.modules['google.generativeai'] = google_mock.generativeai

from aurex_sdk.auditor import AurexAuditor, AurexConfig
from aurex_sdk.heuristics import LocalHeuristicsEngine
from aurex_sdk.cli import run_cli


class TestAurexPatchersAndMemory(unittest.TestCase):
    def setUp(self):
        # Reset the singleton instance of AurexAuditor
        AurexAuditor._instance = None

    def test_memory_storage_mode(self):
        config = AurexConfig(storage_mode="memory", local_only=True)
        auditor = AurexAuditor(config)
        
        # Verify it initializes empty
        self.assertEqual(auditor.get_local_events(), [])
        
        # Log an event
        auditor.log_event(
            model="gpt-4o",
            prompt="Hello world",
            response="Hi there",
            input_tokens=10,
            output_tokens=5,
            system_prompt="Be concise"
        )
        
        # Wait for the background queue to flush (interval is 1.0s)
        time.sleep(1.2)
        
        events = auditor.get_local_events()
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["model"], "gpt-4o")
        self.assertEqual(events[0]["input_tokens"], 10)
        self.assertEqual(events[0]["output_tokens"], 5)
        
        # Test heuristics running on memory events list
        engine = LocalHeuristicsEngine(events)
        report = engine.analyze()
        self.assertEqual(report["total_events"], 1)
        self.assertEqual(report["total_cost"], round(events[0]["cost"], 4))
        
        # Clear memory events
        auditor.clear_local_events()
        self.assertEqual(auditor.get_local_events(), [])

    def test_anthropic_patcher_sync(self):
        import anthropic
        
        # Create a mock response
        mock_resp = MagicMock()
        mock_resp.usage = MagicMock(
            input_tokens=100,
            output_tokens=50,
            cache_read_input_tokens=20,
            cache_creation_input_tokens=10
        )
        mock_resp.content = [MagicMock(text="Hello from Claude", type="text")]
        
        # Mock the raw Messages.create call FIRST
        original_create = MagicMock(return_value=mock_resp)
        anthropic.resources.messages.Messages.create = original_create
        
        # Patch AFTER the target function has been mocked
        config = AurexConfig(storage_mode="memory", local_only=True)
        auditor = AurexAuditor(config)
        auditor.clear_local_events()
        auditor.patch_anthropic()
        
        # Call the patched method
        client_mock = MagicMock()
        resp = anthropic.resources.messages.Messages.create(
            client_mock,
            model="claude-3-5-sonnet-20241022",
            system="System Instructions",
            messages=[{"role": "user", "content": "How are you?"}]
        )
        
        self.assertEqual(resp, mock_resp)
        
        # Wait for worker
        time.sleep(1.2)
        
        events = auditor.get_local_events()
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["model"], "claude-3-5-sonnet-20241022")
        self.assertEqual(events[0]["input_tokens"], 100)
        self.assertEqual(events[0]["output_tokens"], 50)
        self.assertEqual(events[0]["cached_tokens"], 20)
        self.assertEqual(events[0]["cache_write_tokens"], 10)

    def test_google_patcher_sync(self):
        import google.generativeai as genai
        
        # Create a mock response
        mock_resp = MagicMock()
        mock_resp.usage_metadata = MagicMock(
            prompt_token_count=80,
            candidates_token_count=40
        )
        mock_resp.text = "Hello from Gemini"
        
        # Mock original generate_content call FIRST
        original_generate = MagicMock(return_value=mock_resp)
        genai.GenerativeModel.generate_content = original_generate
        
        # Patch AFTER target function mock
        config = AurexConfig(storage_mode="memory", local_only=True)
        auditor = AurexAuditor(config)
        auditor.clear_local_events()
        auditor.patch_google()
        
        # Create instance of Model
        model = genai.GenerativeModel(model_name="gemini-1.5-flash", system_instruction="Gemini instructions")
        
        # Call the patched method
        resp = model.generate_content("Hello Gemini")
        
        self.assertEqual(resp, mock_resp)
        
        # Wait for worker
        time.sleep(1.2)
        
        events = auditor.get_local_events()
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["model"], "gemini-1.5-flash")
        self.assertEqual(events[0]["input_tokens"], 80)
        self.assertEqual(events[0]["output_tokens"], 40)

    def test_heuristics_clustering_and_severity_capping(self):
        # Create unassigned events with no user_id or workflow_id (low confidence clustering fallback)
        # We will trigger a runaway agent loop in a low-confidence (inferred) session
        now = "2026-05-22T10:00:00Z"
        now_plus_1 = "2026-05-22T10:00:01Z"
        now_plus_2 = "2026-05-22T10:00:02Z"
        events = [
            {"id": "e1", "timestamp": now, "provider": "openai", "model": "gpt-4o", "input_tokens": 60, "output_tokens": 50, "total_tokens": 110, "cost": 0.1, "context_length": 60},
            {"id": "e2", "timestamp": now_plus_1, "provider": "openai", "model": "gpt-4o", "input_tokens": 160, "output_tokens": 50, "total_tokens": 210, "cost": 0.2, "context_length": 160},
            {"id": "e3", "timestamp": now_plus_2, "provider": "openai", "model": "gpt-4o", "input_tokens": 410, "output_tokens": 50, "total_tokens": 460, "cost": 0.4, "context_length": 410}
        ]
        
        engine = LocalHeuristicsEngine(events)
        report = engine.analyze()
        
        # Find the agent loop issue
        agent_loop_issues = [issue for issue in report["issues"] if issue["issue_type"] == "agent_loop"]
        self.assertEqual(len(agent_loop_issues), 1)
        # The severity should be capped at MEDIUM instead of CRITICAL because it's a low confidence session!
        self.assertEqual(agent_loop_issues[0]["severity"], "MEDIUM")

    @patch("sys.exit")
    def test_cli_missing_ledger_policy(self, mock_exit):
        # Configure the mock to raise SystemExit so execution terminates
        mock_exit.side_effect = SystemExit(1)
        
        import sys
        test_args = [
            "cli.py",
            "--ledger", "non_existent_ledger.jsonl",
            "--fail-under", "80"
        ]
        
        with patch.object(sys, 'argv', test_args):
            with self.assertRaises(SystemExit) as context:
                run_cli()
            self.assertEqual(context.exception.code, 1)

    def test_circuit_breaker_throw(self):
        config = AurexConfig(storage_mode="memory", local_only=True)
        auditor = AurexAuditor(config)
        auditor.configure_circuit_breaker({
            "maxCostPerMinute": 0.0001,
            "onBudgetExceeded": "throw"
        })
        
        # This logging should exceed the budget of $0.0001 and throw an exception
        with self.assertRaises(Exception) as context:
            auditor.log_event(
                model="gpt-4o",
                input_tokens=100000,
                output_tokens=50000
            )
        self.assertIn("Cost per minute limit exceeded", str(context.exception))

    def test_circuit_breaker_warn(self):
        config = AurexConfig(storage_mode="memory", local_only=True)
        auditor = AurexAuditor(config)
        auditor.configure_circuit_breaker({
            "maxCostPerMinute": 0.0001,
            "onBudgetExceeded": "warn"
        })
        
        with patch("sys.stderr.write") as mock_stderr:
            auditor.log_event(
                model="gpt-4o",
                input_tokens=100000,
                output_tokens=50000
            )
            # Should not throw, but should log a warning to stderr
            self.assertTrue(mock_stderr.called)

    def test_circuit_breaker_dry_run(self):
        config = AurexConfig(storage_mode="memory", local_only=True)
        auditor = AurexAuditor(config)
        auditor.configure_circuit_breaker({
            "maxCostPerMinute": 0.0001,
            "onBudgetExceeded": "throw",
            "dryRun": True
        })
        
        # With dryRun=True, it should not throw even if budget is exceeded
        try:
            auditor.log_event(
                model="gpt-4o",
                input_tokens=100000,
                output_tokens=50000
            )
        except Exception as e:
            self.fail(f"log_event raised Exception unexpectedly with dryRun=True: {e}")

    def test_crash_recovery_lifecycle(self):
        import shutil
        test_dir = ".test_aurex_recovery"
        if os.path.exists(test_dir):
            shutil.rmtree(test_dir)
        os.makedirs(test_dir, exist_ok=True)
        
        ledger_path = os.path.join(test_dir, "ledger.jsonl")
        pending_path = os.path.join(test_dir, "pending.jsonl")
        
        config = AurexConfig(
            storage_mode="file",
            ledger_path=ledger_path,
            local_only=True
        )
        
        # 1. Start auditor, simulate thread crash/exit, log event, shutdown to persist pending
        auditor1 = AurexAuditor(config)
        auditor1._stop_event.set()
        auditor1._thread.join()
        
        auditor1.log_event(
            model="gpt-4o",
            prompt="recovery test",
            input_tokens=100,
            output_tokens=200
        )
        auditor1.persist_pending_and_shutdown()
        
        # 2. Verify pending.jsonl was created and ledger is empty (since it was shutdown immediately and queue didn't flush)
        self.assertTrue(os.path.exists(pending_path))
        with open(pending_path, "r", encoding="utf-8") as f:
            lines = f.readlines()
            self.assertEqual(len(lines), 1)
            event = json.loads(lines[0])
            self.assertEqual(event["model"], "gpt-4o")
            self.assertEqual(event["input_tokens"], 100)
            
        # 3. Instantiate a new auditor with the same config - should recover the pending events
        AurexAuditor._instance = None  # reset singleton
        auditor2 = AurexAuditor(config)
        
        # 4. Verify pending.jsonl was cleaned up and events appended to ledger
        self.assertFalse(os.path.exists(pending_path))
        self.assertTrue(os.path.exists(ledger_path))
        with open(ledger_path, "r", encoding="utf-8") as f:
            lines = f.readlines()
            self.assertEqual(len(lines), 1)
            event = json.loads(lines[0])
            self.assertEqual(event["model"], "gpt-4o")
            self.assertEqual(event["input_tokens"], 100)
            
        # Clean up
        auditor2.shutdown()
        if os.path.exists(test_dir):
            shutil.rmtree(test_dir)


if __name__ == "__main__":
    unittest.main()
