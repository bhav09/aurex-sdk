# LiteLLM Pricing Scheduler

Automated weekly updates of model pricing from LiteLLM's community-maintained catalog.

## Overview

The pricing scheduler fetches the latest model pricing data from [LiteLLM's GitHub repository](https://github.com/BerriAI/litellm) and updates the local pricing cache. This ensures cost calculations remain accurate as providers update their pricing.

**Data Source**: `https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json`

**Coverage**: 2,000+ models from OpenAI, Anthropic, Google, AWS, Azure, and 100+ other providers

**Update Frequency**: Weekly (Sunday 2am UTC)

## Quick Start

### Manual Update

Run the pricing update script manually:

```bash
cd backend
python scripts/update_pricing.py
```

Expected output:
```
============================================================
LiteLLM Pricing Update
============================================================
Fetching pricing from https://raw.githubusercontent.com/...
✓ Fetched 2720 entries from LiteLLM
✓ Transformed 1964 chat models
✅ Saved 1964 models to backend/data/model_pricing.json

Sample models: gpt-4o, claude-3-5-sonnet-20241022, ...

✅ Pricing update complete!
```

### Automated Updates (Cron)

Set up weekly automatic updates:

```bash
bash backend/scripts/setup_cron.sh
```

This creates a cron job that runs every Sunday at 2am UTC.

**Verify installation:**
```bash
crontab -l
```

**View logs:**
```bash
tail -f /tmp/lumina-pricing-update.log
```

**Remove cron job:**
```bash
crontab -e
# Delete the line containing 'update_pricing.py'
```

## Data Format

### LiteLLM Format (Input)

Per-token pricing:
```json
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
```

### Our Format (Output)

Per-1M-tokens pricing:
```json
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
  "source": "litellm",
  "model_count": 1964
}
```

## Integration with Pricing Catalog

The pricing catalog (`backend/src/utils/pricing_catalog.py`) automatically loads the latest pricing data from `backend/data/model_pricing.json` on startup.

**Fallback behavior:**
- If `model_pricing.json` doesn't exist, falls back to provider-specific JSON files in `backend/data/pricing/`
- If a model isn't found, returns default pricing (warns in logs)

**To use updated pricing:**
1. Run `python scripts/update_pricing.py`
2. Restart the backend server
3. New pricing is automatically loaded

## Production Deployment

### Docker

Add to your Dockerfile:
```dockerfile
# Copy pricing scripts
COPY scripts/update_pricing.py /app/scripts/
RUN chmod +x /app/scripts/update_pricing.py

# Run pricing update during build
RUN python /app/scripts/update_pricing.py
```

### Kubernetes CronJob

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: pricing-update
spec:
  schedule: "0 2 * * 0"  # Sunday 2am UTC
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: pricing-updater
            image: your-backend-image
            command: ["python", "scripts/update_pricing.py"]
          restartPolicy: OnFailure
```

### Cloud Functions

**AWS Lambda:**
```python
# lambda_function.py
import sys
sys.path.append('/opt/python')
from scripts.update_pricing import main

def lambda_handler(event, context):
    return main()
```

**Google Cloud Functions:**
```python
# main.py
from scripts.update_pricing import main

def update_pricing(request):
    result = main()
    return f"Pricing update {'succeeded' if result == 0 else 'failed'}"
```

## Monitoring

### Success Indicators

- Exit code 0
- Log shows "✅ Pricing update complete!"
- `model_pricing.json` file updated
- `updated_at` timestamp is recent

### Failure Scenarios

| Error | Cause | Solution |
|-------|-------|----------|
| `httpx.ConnectError` | Network issue | Check internet connectivity |
| `httpx.HTTPStatusError` | GitHub API down | Retry later |
| `json.JSONDecodeError` | Invalid JSON from source | Check LiteLLM repo status |
| `PermissionError` | Can't write to file | Check file permissions |

### Alerting

Set up monitoring for:
- Cron job failures (exit code != 0)
- Stale pricing data (updated_at > 8 days old)
- Missing pricing file

Example health check:
```python
from pathlib import Path
from datetime import datetime, timedelta
import json

def check_pricing_freshness():
    pricing_file = Path("backend/data/model_pricing.json")
    
    if not pricing_file.exists():
        return False, "Pricing file missing"
    
    data = json.loads(pricing_file.read_text())
    updated_at = datetime.fromisoformat(data["updated_at"].replace("Z", "+00:00"))
    age = datetime.now(updated_at.tzinfo) - updated_at
    
    if age > timedelta(days=8):
        return False, f"Pricing data is {age.days} days old"
    
    return True, f"Pricing data is fresh ({data['model_count']} models)"
```

## Why LiteLLM?

1. **Community-Maintained**: 100+ contributors keep pricing current
2. **Comprehensive**: 2,000+ models from all major providers
3. **Reliable**: Used by thousands of production applications
4. **Up-to-Date**: Updated within hours of provider announcements
5. **Open Source**: Transparent, auditable, free

## Troubleshooting

### Pricing data not updating

1. Check cron job is running: `crontab -l`
2. Check logs: `tail -f /tmp/lumina-pricing-update.log`
3. Run manually: `python scripts/update_pricing.py`
4. Verify file permissions: `ls -la backend/data/model_pricing.json`

### Models missing from pricing data

LiteLLM only includes chat models. Excluded:
- Embedding models (text-embedding-ada-002, etc.)
- Image generation models (dall-e-3, etc.)
- Audio models (whisper, tts, etc.)

For these, maintain custom pricing in `backend/data/pricing/` files.

### Cost calculations seem wrong

1. Check pricing data freshness: `cat backend/data/model_pricing.json | grep updated_at`
2. Verify model name matches exactly (case-sensitive)
3. Check logs for "Using default pricing" warnings
4. Compare with provider's official pricing page

## Support

- **LiteLLM Issues**: https://github.com/BerriAI/litellm/issues
- **Pricing Data**: https://github.com/BerriAI/litellm/blob/main/model_prices_and_context_window.json
- **Provider Pricing Pages**:
  - OpenAI: https://openai.com/pricing
  - Anthropic: https://anthropic.com/pricing
  - Google: https://cloud.google.com/vertex-ai/pricing
  - AWS: https://aws.amazon.com/bedrock/pricing/