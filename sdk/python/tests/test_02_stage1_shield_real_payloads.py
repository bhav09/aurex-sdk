"""Stage 1 real-usage tests: 25-turn coding agent traces, developer role, Anthropic cache_control, wire-key stripping & >200k cliff."""

from __future__ import annotations

import copy
import json
from typing import Any, Dict, List

import anthropic
import openai

from aurex_sdk import AurexAuditor, AurexConfig


def _build_25_turn_agent_messages(dev_prompt: str) -> List[Dict[str, Any]]:
    msgs: List[Dict[str, Any]] = [{"role": "developer", "content": dev_prompt}]
    tool_rotation = [
        "read_file",
        "grep_search",
        "query_postgres",
        "edit_file",
        "lint_code",
        "run_pytest",
        "git_diff",
        "check_ci",
    ]
    for i in range(1, 9):
        call_id = f"call_step_{i}"
        t_name = tool_rotation[i - 1]
        msgs.append({"role": "user", "content": f"Turn {i}: inspect connection pool metrics for shard {i}."})
        msgs.append(
            {
                "role": "assistant",
                "content": None,
                "tool_calls": [
                    {
                        "id": call_id,
                        "type": "function",
                        "function": {"name": t_name, "arguments": json.dumps({"shard": i, "limit": 50})},
                    }
                ],
            }
        )
        msgs.append(
            {
                "role": "tool",
                "tool_call_id": call_id,
                "content": json.dumps({"shard": i, "active_conns": 94, "idle_in_tx": 12, "sample_query": "SELECT FOR UPDATE " * 40}),
            }
        )
    msgs.append({"role": "user", "content": "Summarize the root cause across all 8 shards."})
    return msgs  # 1 + 8*3 + 1 = 26 messages


def test_25_turn_openai_developer_prompt_tool_canonicalization_and_wire_stripping(wire_server, corpus):
    auditor = AurexAuditor(AurexConfig(storage_mode="memory", local_only=True, flush_interval_seconds=0.05))
    auditor.patch_openai()

    client = openai.OpenAI(api_key="sk-test-real-client", base_url=f"{wire_server.base_url}/v1")
    tools_t1 = copy.deepcopy(corpus["coding_agent_tools"])
    # Scramble dict key insertion order on Turn 2
    tools_t2 = [
        {"function": {"parameters": t["function"]["parameters"], "description": t["function"]["description"], "name": t["function"]["name"]}, "type": "function"}
        for t in corpus["coding_agent_tools"]
    ]

    dev_t1 = f"[ts=2026-11-18T10:00:00Z] {corpus['developer_prompt']}"
    msgs_t1 = _build_25_turn_agent_messages(dev_t1)

    # Turn 1: pass Aurex-only kwargs + mixed metadata -> WireServer returns 400 if anything leaks!
    r1 = client.chat.completions.create(
        model="o4-mini",
        messages=msgs_t1,
        tools=tools_t1,
        workflow_id="swe-agent-session-1",
        tags={"env": "staging", "team": "core-infra"},
        quality_score=0.98,
        tenant_id="tenant-acme",
        metadata={"trace_env": "canary", "workflow_id": "swe-agent-session-1", "tags": {"nested": "strip-me"}},
    )
    assert r1.choices[0].message.content == "OpenAI wire OK"
    sent_body_1 = wire_server.requests[-1]["body"]
    assert "workflow_id" not in sent_body_1
    assert "tags" not in sent_body_1
    assert "quality_score" not in sent_body_1
    assert "extra_metadata" not in sent_body_1
    assert sent_body_1["metadata"] == {"trace_env": "canary"}

    # Verify tool keys were canonicalized on the wire
    raw_wire_t1 = json.dumps(sent_body_1["tools"])

    # Turn 2: identical developer prompt, scrambled tool key order -> NO false prefix break!
    client.chat.completions.create(
        model="o4-mini",
        messages=msgs_t1 + [{"role": "assistant", "content": "Checking..."}, {"role": "user", "content": "Next step"}],
        tools=tools_t2,
        workflow_id="swe-agent-session-1",
    )
    raw_wire_t2 = json.dumps(wire_server.requests[-1]["body"]["tools"])
    assert raw_wire_t1 == raw_wire_t2

    auditor.flush()
    evs = auditor.get_local_events()
    assert len(evs) == 2
    assert "prefix_broken" not in evs[1]["extra_metadata"].get("stage1_shield", {})
    assert evs[0]["tenant_id"] == "tenant-acme"
    assert evs[0]["tags"]["team"] == "core-infra"

    # Turn 3: mutate timestamp at offset 18 inside developer prompt -> Stage 1 pinpoints exact offset!
    dev_t3 = f"[ts=2026-11-18T10:00:09Z] {corpus['developer_prompt']}"
    msgs_t3 = _build_25_turn_agent_messages(dev_t3)
    client.chat.completions.create(
        model="o4-mini",
        messages=msgs_t3,
        tools=tools_t2,
        workflow_id="swe-agent-session-1",
    )
    auditor.flush()
    ev3 = auditor.get_local_events()[-1]
    shield3 = ev3["extra_metadata"]["stage1_shield"]
    assert shield3["prefix_broken"] is True
    assert shield3["broken_layer"] == "system"
    assert shield3["mutating_offset"] == 22
    assert shield3["mutation_kind"] == "timestamp_or_id"


def test_anthropic_block_array_cache_control_and_metadata_sanitization(wire_server, corpus):
    auditor = AurexAuditor(AurexConfig(storage_mode="memory", local_only=True))
    auditor.patch_anthropic()

    client = anthropic.Anthropic(api_key="sk-ant-real", base_url=wire_server.base_url)
    sys_blocks_1h = copy.deepcopy(corpus["anthropic_claude_code"]["system_blocks_1h"])

    # Pass metadata containing both Anthropic-valid user_id and Aurex-only keys
    resp = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=512,
        system=sys_blocks_1h,
        messages=[{"role": "user", "content": "Check pool.py"}],
        metadata={"user_id": "usr_42", "workflow_id": "claude-wf-1", "tags": {"repo": "ledger"}},
    )
    assert resp.content[0].text == "Anthropic wire OK"
    wire_meta = wire_server.requests[-1]["body"].get("metadata")
    assert wire_meta == {"user_id": "usr_42"}

    # Mutate cache_control TTL from 1h -> 5m without changing prompt text -> Stage 1 catches cache_control drift!
    sys_blocks_mutated = copy.deepcopy(sys_blocks_1h)
    sys_blocks_mutated[0]["cache_control"] = {"type": "ephemeral", "ttl": "5m"}
    client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=512,
        system=sys_blocks_mutated,
        messages=[{"role": "user", "content": "Check models.py"}],
        workflow_id="claude-wf-1",
    )
    auditor.flush()
    ev2 = auditor.get_local_events()[-1]
    assert ev2["extra_metadata"]["stage1_shield"]["prefix_broken"] is True
    assert ev2["extra_metadata"]["stage1_shield"]["broken_layer"] == "system"


def test_tail_guidance_preserves_prefix_bytes_and_real_205k_token_cliff_triggers(wire_server):
    auditor = AurexAuditor(
        AurexConfig(storage_mode="memory", local_only=True, runaway_context_multiplier=2.0)
    )
    auditor.patch_openai()
    client = openai.OpenAI(api_key="sk-test", base_url=f"{wire_server.base_url}/v1")

    static_dev = "STATIC_PREFIX_DO_NOT_TOUCH: Follow all production SQL rules."
    # 3 exponentially growing turns (>2.0x each) trigger runaway downgrade + tail instruction
    for mult in (30, 80, 220):
        client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "developer", "content": static_dev},
                {"role": "user", "content": "analyze log line " * mult},
            ],
            workflow_id="wf-runaway-tail",
        )

    third_wire = wire_server.requests[-1]["body"]
    assert third_wire["model"] == "gpt-4o-mini"
    # Prefix message[0] MUST remain 100% untouched; guidance appended at tail of last user message
    assert third_wire["messages"][0] == {"role": "developer", "content": static_dev}
    assert "[Aurex Guidance:" in third_wire["messages"][-1]["content"]

    # Real >200,000 BPE token payload check on Claude Sonnet 4
    chunk_unit = "alpha beta gamma delta epsilon zeta eta theta iota kappa "  # ~10 tokens
    huge_prompt = chunk_unit * 21_000  # >205,000 real tiktoken tokens
    dec = auditor.pre_call_check(
        model="claude-sonnet-4",
        prompt=huge_prompt,
        workflow_id="wf-cliff-205k",
    )
    assert dec.shield_meta["crossed_200k_cliff"] is True
    assert dec.shield_meta["cliff_surcharge_usd"] > 0.60
