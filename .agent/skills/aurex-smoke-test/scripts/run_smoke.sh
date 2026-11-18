#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
echo "=== [Aurex Smoke Test] Workspace: $ROOT_DIR ==="

# 1. Python SDK smoke check
echo "-> [1/3] Checking Python SDK imports & unit/smoke tests..."
PYTHON_BIN="python3"
if [ -x "$ROOT_DIR/backend/.venv/bin/python" ]; then
  PYTHON_BIN="$ROOT_DIR/backend/.venv/bin/python"
elif [ -x "$ROOT_DIR/.venv/bin/python" ]; then
  PYTHON_BIN="$ROOT_DIR/.venv/bin/python"
fi

PYTHONPATH="$ROOT_DIR/sdk/python" "$PYTHON_BIN" -c "
import aurex_sdk
from aurex_sdk import AurexAuditor, AurexConfig
AurexAuditor.reset()
auditor = AurexAuditor(AurexConfig(storage_mode='memory', local_only=True))
assert auditor.get_health()['status'] == 'healthy'
AurexAuditor.reset()
print('   Python SDK core import & lifecycle OK')
"

if ls "$ROOT_DIR/sdk/python"/test_*.py >/dev/null 2>&1; then
  (cd "$ROOT_DIR/sdk/python" && PYTHONPATH="$ROOT_DIR/sdk/python" "$PYTHON_BIN" -m pytest -q)
fi

# 2. Node.js SDK build & smoke check
echo "-> [2/3] Checking Node.js SDK..."
if [ -d "$ROOT_DIR/sdk/node/node_modules" ]; then
  (cd "$ROOT_DIR/sdk/node" && npm run build)
fi
if [ -f "$ROOT_DIR/sdk/node/scripts/run-smoke.mjs" ]; then
  (cd "$ROOT_DIR/sdk/node" && node scripts/run-smoke.mjs)
fi

# 3. Backend smoke check
echo "-> [3/3] Checking Backend syntax & unit tests..."
if [ -d "$ROOT_DIR/backend/tests" ] && "$PYTHON_BIN" -c "import fastapi, sqlalchemy, pytest_asyncio, aiosqlite" >/dev/null 2>&1; then
  (cd "$ROOT_DIR/backend" && PYTHONPATH="$ROOT_DIR/backend:$ROOT_DIR/sdk/python" "$PYTHON_BIN" -m pytest tests/unit -q)
else
  find "$ROOT_DIR/backend/src" -name "*.py" -exec "$PYTHON_BIN" -m py_compile {} +
  "$PYTHON_BIN" -m py_compile "$ROOT_DIR/backend/main.py"
  PYTHONPATH="$ROOT_DIR/backend:$ROOT_DIR/sdk/python" "$PYTHON_BIN" -c "
import logging, sys, types, pydantic.networks
for mod_name, attrs in [
    ('aiosqlite', {}),
    ('jwt', {'decode': lambda *a, **k: {}, 'encode': lambda *a, **k: 'tok', 'ExpiredSignatureError': Exception, 'PyJWTError': Exception}),
    ('email_validator', {'validate_email': lambda e, **k: types.SimpleNamespace(normalized=e, email=e), 'EmailNotValidError': ValueError}),
]:
    try:
        __import__(mod_name)
    except ImportError:
        sys.modules[mod_name] = types.SimpleNamespace(**attrs)
if getattr(pydantic.networks, 'email_validator', None) is None:
    pydantic.networks.email_validator = sys.modules['email_validator']
    pydantic.networks.import_email_validator = lambda: None
sys.modules['src.database'] = types.SimpleNamespace(get_db=lambda: None, AsyncSessionLocal=None, init_db=None, engine=None)
sys.modules['src.utils.logger'] = types.SimpleNamespace(get_logger=lambda name='aurex': logging.getLogger(name))
sys.modules['src.api'] = types.ModuleType('src.api')
sys.modules['src.api'].__path__ = ['$ROOT_DIR/backend/src/api']
sys.modules['src.api.auth'] = types.SimpleNamespace(_verify_api_key_obj=None)
from src.api.policies import router as policies_router
from src.api.dashboard import _overview_from_events
from src.api.savings import _aggregate_workflows_sql
policy_methods = {m for r in policies_router.routes for m in getattr(r, 'methods', set())}
assert {'GET', 'PUT'}.issubset(policy_methods), f'Missing GET/PUT on /policies: {policy_methods}'
class _E:
    def __init__(self, **kw): self.__dict__.update(kw)
ov = _overview_from_events([
    _E(cost=0.05, outcome='success', cost_type='inference', retry_count=0, model='gpt-4o', provider='openai', workflow_id='w1'),
    _E(cost=0.05, outcome='success', cost_type='inference', retry_count=0, model='gpt-4o', provider='openai', workflow_id='w1'),
    _E(cost=0.0, outcome='success', cost_type='outcome_signal', retry_count=0, model='aurex-outcome', provider='aurex', workflow_id='w1'),
    _E(cost=0.02, outcome='degraded', cost_type='unfulfilled_spend', retry_count=0, model='o3', provider='openai', workflow_id='w1'),
])
assert ov['success_count'] == 1, f'Expected 1 workflow success, got {ov[\"success_count\"]}'
assert ov['turns_per_success'] == 3.0
assert abs(ov['cost_per_successful_outcome'] - 0.12) < 1e-6
assert abs(ov['billed_but_failed_cost'] - 0.02) < 1e-6
print('   Backend Stage 3 outcome accounting & /api/v1/policies router OK')
"
  echo "   Backend syntax compilation across all backend/src/*.py OK"
fi

echo "=== [Aurex Smoke Test] ALL CHECKS PASSED ==="
