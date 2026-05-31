import os
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from aurex_sdk import AurexAuditor, AurexConfig, AurexBudgetExceeded
from aurex_sdk.cloud_sync import sync_batch_with_retry
from aurex_sdk.ledger_utils import prepare_ledger_storage


class TestLedgerUtils(unittest.TestCase):
    def test_prepare_ledger_storage_uses_writable_directory(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "ledger.jsonl")
            resolved, mode, warning = prepare_ledger_storage(path, "file", False)
            self.assertEqual(resolved, path)
            self.assertEqual(mode, "file")
            self.assertIsNone(warning)

    def test_prepare_ledger_storage_falls_back_to_memory(self):
        path = "/definitely/not/writable/.aurex/ledger.jsonl"
        with unittest.mock.patch(
            "aurex_sdk.ledger_utils._probe_writable_directory",
            return_value=False,
        ):
            resolved, mode, warning = prepare_ledger_storage(path, "file", False)
        self.assertEqual(mode, "memory")
        self.assertIsNotNone(warning)


class TestCloudSyncRetry(unittest.TestCase):
    @patch("aurex_sdk.cloud_sync.urllib.request.urlopen")
    @patch("aurex_sdk.cloud_sync.time.sleep", return_value=None)
    def test_sync_batch_retries_on_429(self, _sleep, urlopen):
        import urllib.error

        def side_effect(req, timeout=10.0):
            if urlopen.call_count == 1:
                raise urllib.error.HTTPError(
                    req.full_url,
                    429,
                    "Too Many Requests",
                    hdrs={"Retry-After": "0"},
                    fp=None,
                )
            return unittest.mock.MagicMock()

        urlopen.side_effect = side_effect

        ok, err = sync_batch_with_retry(
            "http://localhost:8000/api/v1/ledger/events",
            {"events": []},
            "aux_test_key1234567890",
            timeout_seconds=1.0,
            max_retries=2,
        )
        self.assertTrue(ok)
        self.assertIsNone(err)
        self.assertEqual(urlopen.call_count, 2)


class TestAuditorCloudIntegration(unittest.TestCase):
    def setUp(self):
        AurexAuditor.reset()

    def tearDown(self):
        AurexAuditor.reset()

    def test_bounded_queue_drops_when_full(self):
        with tempfile.TemporaryDirectory() as tmp:
            auditor = AurexAuditor(
                AurexConfig(
                    ledger_path=os.path.join(tmp, "ledger.jsonl"),
                    storage_mode="memory",
                    local_only=True,
                    max_queue_size=1,
                    flush_interval_seconds=3600,
                )
            )
            auditor.log_event(model="gpt-4o-mini", input_tokens=1, output_tokens=1)
            auditor.log_event(model="gpt-4o-mini", input_tokens=1, output_tokens=1)
            health = auditor.get_health()
            self.assertGreaterEqual(health["events_dropped"], 1)

    def test_flush_drains_queue(self):
        with tempfile.TemporaryDirectory() as tmp:
            ledger = os.path.join(tmp, "ledger.jsonl")
            auditor = AurexAuditor(
                AurexConfig(
                    ledger_path=ledger,
                    storage_mode="file",
                    local_only=True,
                    per_process_ledger=False,
                    flush_interval_seconds=3600,
                )
            )
            auditor.log_event(model="gpt-4o-mini", input_tokens=10, output_tokens=5)
            auditor.flush()
            self.assertEqual(auditor.get_health()["queue_size"], 0)
            self.assertTrue(os.path.exists(ledger))

    def test_budget_guard_raises_typed_error(self):
        auditor = AurexAuditor(
            AurexConfig(
                storage_mode="memory",
                local_only=True,
                budget_guard={
                    "max_cost_per_minute": 0.000001,
                    "on_budget_exceeded": "throw",
                },
            )
        )
        with self.assertRaises(AurexBudgetExceeded):
            auditor.log_event(model="gpt-4o", input_tokens=10000, output_tokens=5000)

    def test_reset_allows_reconfiguration(self):
        AurexAuditor(AurexConfig(storage_mode="memory", local_only=True, project="first"))
        AurexAuditor.reset()
        auditor = AurexAuditor(
            AurexConfig(storage_mode="memory", local_only=True, project="second")
        )
        self.assertEqual(auditor.config.project, "second")

    def test_get_health_includes_extended_fields(self):
        auditor = AurexAuditor(AurexConfig(storage_mode="memory", local_only=True))
        health = auditor.get_health()
        self.assertIn("status", health)
        self.assertIn("events_logged", health)
        self.assertIn("events_dropped", health)
        self.assertIn("patch_status", health)


if __name__ == "__main__":
    unittest.main()
