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
        assert input_price == 1.50
        assert output_price == 6.00

    def test_calculate_cost(self):
        # 1M input tokens + 1M output tokens for gpt-4o
        cost = calculate_cost("gpt-4o", 1_000_000, 1_000_000)
        assert cost == 2.50 + 10.00 # 2.5 input, 10.0 output
        
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
        assert extract_provider_from_model("gemini-1.5-pro") == "google"

    def test_get_model_pricing_provider_median_fallback(self):
        # Fallback to general median fallback pricing
        input_price, output_price = get_model_pricing("claude-unknown-999")
        assert input_price == 1.50
        assert output_price == 6.00
        
        input_price_oa, output_price_oa = get_model_pricing("gpt-unknown-999")
        assert input_price_oa == 1.50
        assert output_price_oa == 6.00

    def test_calculate_cost_with_prompt_caching(self):
        # Test Anthropic Claude Sonnet with cache read & creation
        # Claude 3.5 Sonnet base: input = 3.0, output = 15.0
        # cache_read multiplier = 0.1 (0.3/1M), cache_creation multiplier = 1.25 (3.75/1M)
        # 1M input (including 200k read, 100k creation) -> standard input = 700k
        # Standard input cost = 700k * 3.0 = 2.10
        # Cache read cost = 200k * 0.3 = 0.06
        # Cache creation cost = 100k * 3.75 = 0.375
        # Output cost = 1M * 15.0 = 15.0
        # Total cost = 2.10 + 0.06 + 0.375 + 15.0 = 17.535
        cost = calculate_cost(
            model="claude-3-5-sonnet",
            input_tokens=1_000_000,
            output_tokens=1_000_000,
            cache_read_tokens=200_000,
            cache_creation_tokens=100_000
        )
        assert abs(cost - 17.535) < 1e-4

        # Test OpenAI GPT-4o cache read (0.50x) & creation (1.00x)
        cost_openai = calculate_cost(
            model="gpt-4o",
            input_tokens=1_000_000,
            output_tokens=1_000_000,
            cache_read_tokens=200_000,
            cache_creation_tokens=100_000
        )
        assert abs(cost_openai - 12.25) < 1e-4

        # Test Google Gemini 1.5 Pro cache read (0.25x) & creation (1.00x)
        cost_google = calculate_cost(
            model="gemini-1.5-pro",
            input_tokens=1_000_000,
            output_tokens=1_000_000,
            cache_read_tokens=200_000,
            cache_creation_tokens=100_000
        )
        assert abs(cost_google - 6.0625) < 1e-4

    def test_pricing_overrides_integration(self):
        overrides = {
            "gpt-4o": (1.00, 4.00),
            "claude-3-5-sonnet": (2.00, 8.00)
        }
        
        # Test override matches
        input_price, output_price = get_model_pricing("gpt-4o", pricing_overrides=overrides)
        assert input_price == 1.00
        assert output_price == 4.00
        
        # Test substring override matches
        input_price_sub, output_price_sub = get_model_pricing("claude-3-5-sonnet-20241022", pricing_overrides=overrides)
        assert input_price_sub == 2.00
        assert output_price_sub == 8.00
        
        # Test cost calculation uses override
        cost = calculate_cost("gpt-4o", 1_000_000, 1_000_000, pricing_overrides=overrides)
        assert cost == 1.00 + 4.00



