#!/usr/bin/env python3
"""
LiteLLM Pricing Scheduler
Fetches latest model pricing from LiteLLM's community-maintained catalog
and updates the local pricing cache.

Run weekly via cron: 0 2 * * 0 (Sunday 2am UTC)
"""

import json
import httpx
from pathlib import Path
from datetime import datetime
from typing import Dict, Any

LITELLM_PRICING_URL = "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json"
OUTPUT_FILE = Path(__file__).parent.parent / "data" / "model_pricing.json"

def fetch_litellm_pricing() -> Dict[str, Any]:
    """Fetch pricing data from LiteLLM GitHub"""
    print(f"Fetching pricing from {LITELLM_PRICING_URL}...")
    response = httpx.get(LITELLM_PRICING_URL, timeout=30.0)
    response.raise_for_status()
    return response.json()

def transform_pricing_data(raw_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Transform LiteLLM format to our internal format
    
    LiteLLM format (per token):
    {
      "gpt-4o": {
        "input_cost_per_token": 0.0000025,
        "output_cost_per_token": 0.00001,
        "cache_read_input_token_cost": 0.00000125,
        "cache_creation_input_token_cost": 0.00000625,
        "litellm_provider": "openai",
        "mode": "chat",
        "max_tokens": 128000
      }
    }
    
    Our format (per 1M tokens):
    {
      "models": {
        "gpt-4o": {
          "input_per_1m": 2.50,
          "output_per_1m": 10.00,
          "cached_input_per_1m": 1.25,
          "cache_write_per_1m": 6.25,
          "provider": "openai",
          "context_window": 128000
        }
      },
      "updated_at": "2026-05-21T16:00:00Z",
      "source": "litellm"
    }
    """
    models = {}
    
    for model_name, model_data in raw_data.items():
        # Skip non-chat models (embeddings, image generation, etc.)
        if model_data.get("mode") != "chat":
            continue
        
        # Skip if missing required pricing fields
        if "input_cost_per_token" not in model_data or "output_cost_per_token" not in model_data:
            continue
        
        # Convert per-token to per-1M-tokens
        transformed = {
            "input_per_1m": round(model_data["input_cost_per_token"] * 1_000_000, 4),
            "output_per_1m": round(model_data["output_cost_per_token"] * 1_000_000, 4),
            "provider": model_data.get("litellm_provider", "unknown"),
            "context_window": model_data.get("max_tokens", 0)
        }
        
        # Add cache pricing if available
        if "cache_read_input_token_cost" in model_data:
            transformed["cached_input_per_1m"] = round(
                model_data["cache_read_input_token_cost"] * 1_000_000, 4
            )
        
        if "cache_creation_input_token_cost" in model_data:
            transformed["cache_write_per_1m"] = round(
                model_data["cache_creation_input_token_cost"] * 1_000_000, 4
            )
        
        models[model_name] = transformed
    
    return {
        "models": models,
        "updated_at": datetime.utcnow().isoformat() + "Z",
        "source": "litellm",
        "model_count": len(models)
    }

def save_pricing_data(data: Dict[str, Any]) -> None:
    """Save pricing data to local cache file"""
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    
    with open(OUTPUT_FILE, 'w') as f:
        json.dump(data, f, indent=2)
    
    print(f"✅ Saved {data['model_count']} models to {OUTPUT_FILE}")

def main():
    """Main execution"""
    try:
        print("=" * 60)
        print("LiteLLM Pricing Update")
        print("=" * 60)
        
        # Fetch raw data
        raw_data = fetch_litellm_pricing()
        print(f"✓ Fetched {len(raw_data)} entries from LiteLLM")
        
        # Transform to our format
        transformed_data = transform_pricing_data(raw_data)
        print(f"✓ Transformed {transformed_data['model_count']} chat models")
        
        # Save to file
        save_pricing_data(transformed_data)
        
        # Show sample
        sample_models = list(transformed_data["models"].keys())[:5]
        print(f"\nSample models: {', '.join(sample_models)}")
        
        print("\n✅ Pricing update complete!")
        return 0
        
    except Exception as e:
        print(f"\n❌ Error updating pricing: {e}")
        import traceback
        traceback.print_exc()
        return 1

if __name__ == "__main__":
    exit(main())


