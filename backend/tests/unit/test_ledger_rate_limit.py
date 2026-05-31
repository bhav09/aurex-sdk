from unittest.mock import MagicMock

from src.api.ledger import _ledger_ingest_rate_limit_key


def test_ledger_rate_limit_key_uses_api_key_prefix():
    request = MagicMock()
    request.headers = {"Authorization": "Bearer aux_dev_testkey1234567890"}
    key = _ledger_ingest_rate_limit_key(request)
    assert key.startswith("apikey:aux_dev_test")


def test_ledger_rate_limit_key_falls_back_to_ip():
    request = MagicMock()
    request.headers = {"Authorization": "Bearer eyJhbGciOiJIUzI1NiJ9.test"}
    request.client = MagicMock()
    request.client.host = "203.0.113.10"
    key = _ledger_ingest_rate_limit_key(request)
    assert key == "203.0.113.10"
