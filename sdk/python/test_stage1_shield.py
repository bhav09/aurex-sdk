"""Stage 1 Smoke & Unit Tests: Prefix Cache-Shield, 200k Cliff Guard, and Shared Pricing/State."""

import time
import unittest

from aurex_sdk import AurexAuditor, AurexConfig
from aurex_sdk.decisions import AurexDecision, apply_decision_to_call_params
from aurex_sdk.prefix_shield import canonicalize_json_keys, find_first_mutating_offset, inspect_pre_call_shield
from aurex_sdk.pricing import calculate_cost, check_cliff_status, count_request_tokens, get_model_pricing
from aurex_sdk.state_store import InMemoryStateStore


class TestStage1ShieldAndSharedCore(unittest.TestCase):
    def setUp(self):
        AurexAuditor.reset()

    def tearDown(self):
        AurexAuditor.reset()

    def test_canonicalize_json_keys_deterministic(self):
        schema_a = {"b": 1, "a": {"z": True, "m": [2, 1]}}
        schema_b = {"a": {"m": [2, 1], "z": True}, "b": 1}
        self.assertEqual(canonicalize_json_keys(schema_a), canonicalize_json_keys(schema_b))
        self.assertEqual(list(canonicalize_json_keys(schema_a).keys()), ["a", "b"])
        # List order must remain untouched
        self.assertEqual(canonicalize_json_keys(schema_a)["a"]["m"], [2, 1])

    def test_silent_timestamp_prefix_breaker_pinpointed(self):
        store = InMemoryStateStore()
        now = time.time()
        r1 = inspect_pre_call_shield(
            state_store=store,
            workflow_id="support-agent",
            model="claude-sonnet-4",
            estimated_tokens=2048,
            now=now,
            system_prompt="Current time: 2026-11-18 10:00:00. You are a helpful billing agent.",
        )
        self.assertFalse(r1.prefix_broken)

        r2 = inspect_pre_call_shield(
            state_store=store,
            workflow_id="support-agent",
            model="claude-sonnet-4",
            estimated_tokens=2048,
            now=now + 10,
            system_prompt="Current time: 2026-11-18 10:00:10. You are a helpful billing agent.",
        )
        self.assertTrue(r2.prefix_broken)
        self.assertEqual(r2.broken_layer, "system")
        self.assertEqual(r2.mutating_offset, 31)
        self.assertEqual(r2.mutation_kind, "timestamp_or_id")
        self.assertTrue(any("char 31" in w for w in r2.warnings))

    def test_anthropic_5m_idle_ttl_trap_detected(self):
        store = InMemoryStateStore()
        t0 = 1_700_000_000.0
        inspect_pre_call_shield(
            state_store=store,
            workflow_id="claude-code-wf",
            model="claude-3-5-sonnet",
            estimated_tokens=5000,
            now=t0,
            system_prompt="Static instructions",
        )
        # 6 minutes later (>300s default Anthropic cache TTL)
        r2 = inspect_pre_call_shield(
            state_store=store,
            workflow_id="claude-code-wf",
            model="claude-3-5-sonnet",
            estimated_tokens=5000,
            now=t0 + 360.0,
            system_prompt="Static instructions",
        )
        self.assertFalse(r2.prefix_broken)
        self.assertTrue(r2.idle_ttl_risk)
        self.assertAlmostEqual(r2.idle_gap_seconds or 0, 360.0, places=1)

    def test_200k_cliff_2x_whole_request_repricing(self):
        below = calculate_cost("claude-sonnet-4", input_tokens=200_000, output_tokens=1_000)
        above = calculate_cost("claude-sonnet-4", input_tokens=200_001, output_tokens=1_000)
        # Crossing 200,000 tokens doubles the entire request rate on Claude/Gemini!
        self.assertGreater(above, below * 1.99)

        near = check_cliff_status("gemini-2.5-pro", 190_000)
        self.assertTrue(near["near_cliff"])
        self.assertFalse(near["crossed_cliff"])

        crossed = check_cliff_status("gemini-2.5-pro", 210_000)
        self.assertTrue(crossed["crossed_cliff"])
        self.assertGreater(crossed["surcharge_usd"], 0)

    def test_cache_ttl_1h_vs_5m_multiplier(self):
        c_5m = calculate_cost("claude-sonnet-4", input_tokens=100_000, output_tokens=0, cache_write_tokens=100_000, cache_ttl="5m")
        c_1h = calculate_cost("claude-sonnet-4", input_tokens=100_000, output_tokens=0, cache_write_tokens=100_000, cache_ttl="1h")
        self.assertAlmostEqual(c_5m, 0.375, places=4)  # $3/1M * 0.1M * 1.25
        self.assertAlmostEqual(c_1h, 0.600, places=4)  # $3/1M * 0.1M * 2.00

    def test_hosted_vs_local_llama_pricing(self):
        # Local Ollama stays $0.00
        self.assertEqual(get_model_pricing("llama3.1:8b"), (0.0, 0.0))
        self.assertEqual(get_model_pricing("ollama/llama-4-scout"), (0.0, 0.0))
        # Paid cloud Llama hosts report real non-zero pricing!
        groq_in, groq_out = get_model_pricing("groq/llama-4-scout")
        self.assertGreater(groq_in, 0.0)
        self.assertGreater(groq_out, 0.0)
        together_in, _ = get_model_pricing("together_ai/meta-llama/llama-4-maverick")
        self.assertGreater(together_in, 0.0)

    def test_tail_only_instruction_never_busts_index_0_prefix(self):
        params = {
            "model": "gpt-4o",
            "tools": [{"function": {"z_param": 1, "a_param": 2}}],
            "messages": [
                {"role": "system", "content": "IMMUTABLE_CACHED_SYSTEM_PREFIX"},
                {"role": "user", "content": "Summarize ticket #42"},
            ],
        }
        dec = AurexDecision(
            action="downgrade",
            reason="Runaway growth",
            suggested_model="gpt-4o-mini",
            inject_system_instruction="Keep answer concise.",
        )
        updated = apply_decision_to_call_params(params, dec)
        # Index 0 system message MUST remain 100% untouched for prefix cache hits!
        self.assertEqual(updated["messages"][0], {"role": "system", "content": "IMMUTABLE_CACHED_SYSTEM_PREFIX"})
        self.assertIn("[Aurex Guidance: Keep answer concise.]", updated["messages"][-1]["content"])
        # Tools dict keys sorted deterministically
        self.assertEqual(list(updated["tools"][0]["function"].keys()), ["a_param", "z_param"])

    def test_multimodal_and_tools_token_counting(self):
        toks = count_request_tokens(
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "Describe this diagram"},
                        {"type": "image_url", "image_url": {"url": "https://example.com/a.png"}},
                    ],
                }
            ],
            tools=[{"type": "function", "function": {"name": "lookup_order", "parameters": {"type": "object"}}}],
        )
        self.assertGreater(toks, 770)


if __name__ == "__main__":
    unittest.main()
