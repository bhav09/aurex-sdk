import pytest
from src.utils.pricing import (
    get_model_pricing,
    calculate_cost,
    extract_provider_from_model,
)

class TestPricingUtils:
    def test_get_model_pricing_known_model(self):
        input_price, output_price = get_model_pricing("gpt-4o")
        assert input_price == 2.50
        assert output_price == 10.00

    def test_get_model_pricing_unknown_model_fallback(self):
        input_price, output_price = get_model_pricing("unknown-model-xyz")
        assert input_price == 15.00
        assert output_price == 60.00

    def test_calculate_cost(self):
        # 1M input tokens + 1M output tokens for gpt-4o
        cost = calculate_cost("gpt-4o", 1_000_000, 1_000_000)
        assert cost == 12.50
        
        # 500k input, 0 output for claude-3-5-sonnet-20241022 (input: 3.0, output: 15.0)
        cost2 = calculate_cost("claude-3-5-sonnet-20241022", 500_000, 0)
        assert cost2 == 1.50

    def test_extract_provider_from_model(self):
        assert extract_provider_from_model("claude-3-opus-20240229") == "anthropic"
        assert extract_provider_from_model("gpt-4-turbo") == "openai"
        assert extract_provider_from_model("o1-preview") == "openai"
        assert extract_provider_from_model("llama3.1:70b") == "ollama"
        assert extract_provider_from_model("mistral:7b") == "ollama"
        assert extract_provider_from_model("qwen2.5:72b") == "ollama"
        assert extract_provider_from_model("gemini-1.5-pro") == "unknown"
