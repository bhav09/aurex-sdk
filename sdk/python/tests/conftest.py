"""Shared pytest fixtures for real-usage Aurex SDK tests."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict, Generator

import pytest

from aurex_sdk import AurexAuditor
from wire_server import WireServer

REPO_ROOT = Path(__file__).resolve().parents[3]
CORPUS_PATH = REPO_ROOT / "tests" / "fixtures" / "payloads" / "real_world_corpus.json"


def _load_dotenv_defaults() -> None:
    for env_path in (REPO_ROOT / ".env", REPO_ROOT / "backend" / ".env"):
        if not env_path.is_file():
            continue
        for raw_line in env_path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, val = line.split("=", 1)
            key = key.strip()
            val = val.strip().strip('"').strip("'")
            if key and key not in os.environ and val:
                os.environ[key] = val


_load_dotenv_defaults()


@pytest.fixture(autouse=True)
def reset_aurex_singleton() -> Generator[None, None, None]:
    AurexAuditor.reset()
    yield
    AurexAuditor.reset()


@pytest.fixture(scope="session")
def corpus() -> Dict[str, Any]:
    return json.loads(CORPUS_PATH.read_text(encoding="utf-8"))


@pytest.fixture()
def wire_server() -> Generator[WireServer, None, None]:
    srv = WireServer().start()
    try:
        yield srv
    finally:
        srv.stop()
