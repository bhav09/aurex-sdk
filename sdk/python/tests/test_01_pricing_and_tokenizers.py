"""Real-usage tests for tiktoken counting, Pydantic schemas, 200k cliffs, 1h/5m cache splits & open-weight pricing."""

from __future__ import annotations

from typing import List
from pydantic import BaseModel, Field
import pytest

from aurex_sdk.pricing import (
    calculate_cost,
    check_cliff_status,
    count_request_tokens,
    count_text_tokens,
    get_model_pricing,
)


class LineItem(BaseModel):
    sku: str = Field(..., description="Hardware SKU identifier")
    qty: int = Field(..., ge=1)
    unit_usd: float


class InvoiceExtractionSchema(BaseModel):
    invoice_id: str
    vendor: str
    line_items: List[LineItem]
    total_usd: float


def test_real_tiktoken_multilingual_code_multimodal_and_pydantic_schema(corpus):
    samples = corpus["multilingual_samples"]
    for lang, text in samples.items():
        toks = count_text_tokens(text)
        assert toks >= 8, f"Expected realistic BPE token count for {lang}, got {toks}"

    # Verify Pydantic v2 BaseModel class passed as response_format adds real schema tokens
    base_msgs = [
        {"role": "developer", "content": corpus["developer_prompt"]},
        {"role": "user", "content": "Extract the invoice fields from this receipt."},
    ]
    without_schema = count_request_tokens(messages=base_msgs)
    with_pydantic = count_request_tokens(messages=base_msgs, response_format=InvoiceExtractionSchema)
    with_tools = count_request_tokens(
        messages=base_msgs,
        tools=corpus["coding_agent_tools"],
        response_format=InvoiceExtractionSchema,
    )
    assert with_pydantic > without_schema + 35
    assert with_tools > with_pydantic + 250

    # Verify developer role inside messages prevents double-counting system_prompt
    deduped = count_request_tokens(messages=base_msgs, system_prompt=corpus["developer_prompt"])
    assert deduped == without_schema

    # Multimodal image block adds standard vision tile budget (765 tokens)
    vision_msgs = [
        {
            "role": "user",
            "content": [
                {"type": "text", "text": "Inspect this architecture diagram"},
                {"type": "image_url", "image_url": {"url": "https://example.com/arch.png"}},
            ],
        }
    ]
    assert count_request_tokens(messages=vision_msgs) >= 768


def test_exact_200k_cliff_boundary_and_provider_specificity():
    # Claude Sonnet 4: $3/1M input, $15/1M output up to 200,000; 2x ($6/$30) at >=200,001
    c_199999 = calculate_cost("claude-sonnet-4", input_tokens=199_999, output_tokens=1_000)
    c_200000 = calculate_cost("claude-sonnet-4", input_tokens=200_000, output_tokens=1_000)
    c_200001 = calculate_cost("claude-sonnet-4", input_tokens=200_001, output_tokens=1_000)

    assert c_200000 == pytest.approx(200_000 / 1e6 * 3.0 + 1_000 / 1e6 * 15.0, rel=1e-6)
    assert c_199999 < c_200000
    assert c_200001 == pytest.approx(200_001 / 1e6 * 6.0 + 1_000 / 1e6 * 30.0, rel=1e-6)
    assert c_200001 > c_200000 * 1.99

    # Gemini 2.5 Pro also doubles >200k
    s_near = check_cliff_status("gemini-2.5-pro", 185_000)
    s_exact = check_cliff_status("gemini-2.5-pro", 200_000)
    s_over = check_cliff_status("gemini-2.5-pro", 200_001)
    assert s_near["near_cliff"] is True and s_near["crossed_cliff"] is False
    assert s_exact["near_cliff"] is True and s_exact["crossed_cliff"] is False
    assert s_over["crossed_cliff"] is True and s_over["multiplier"] == 2.0

    # OpenAI GPT-4o does NOT have a 200k 2x cliff
    gpt_200k = calculate_cost("gpt-4o", input_tokens=200_000, output_tokens=1_000)
    gpt_201k = calculate_cost("gpt-4o", input_tokens=201_000, output_tokens=1_000)
    assert gpt_201k < gpt_200k * 1.02


def test_anthropic_mixed_5m_and_1h_cache_creation_and_batch_discount():
    # Base Claude Sonnet 4 input = $3.00 / 1M, output = $15.00 / 1M
    # 10,000 uncached ($0.03) + 20,000 cache_read at 0.1x ($0.006)
    # + 5,000 5m write at 1.25x ($0.01875) + 10,000 1h write at 2.0x ($0.06)
    # + 1,000 output ($0.015) = $0.12975
    total_in = 10_000 + 20_000 + 15_000
    cost = calculate_cost(
        "claude-sonnet-4",
        input_tokens=total_in,
        output_tokens=1_000,
        cached_tokens=20_000,
        cache_write_tokens=15_000,
        cache_write_1h_tokens=10_000,
    )
    assert cost == pytest.approx(0.12975, rel=1e-6)

    batch_cost = calculate_cost(
        "claude-sonnet-4",
        input_tokens=total_in,
        output_tokens=1_000,
        cached_tokens=20_000,
        cache_write_tokens=15_000,
        cache_write_1h_tokens=10_000,
        is_batch=True,
    )
    assert batch_cost == pytest.approx(0.12975 * 0.5, rel=1e-6)


def test_hosted_cloud_vs_local_ollama_open_weight_pricing():
    assert get_model_pricing("llama-4-scout", provider="ollama") == (0.0, 0.0)
    assert get_model_pricing("ollama/llama-3.3-70b") == (0.0, 0.0)

    for prov in ("groq", "together", "fireworks", "openrouter", "bedrock"):
        inp, outp = get_model_pricing("llama-4-scout", provider=prov)
        assert inp > 0.0 and outp > 0.0
