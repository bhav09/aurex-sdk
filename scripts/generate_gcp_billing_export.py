#!/usr/bin/env python3
"""
Generate realistic GCP Cloud Billing export CSV data for Vertex AI / Gemini token usage.
Follows the official gcp_billing_export_v1_* schema.
"""

import csv
import random
import uuid
import json
from datetime import datetime, timedelta
import os

os.makedirs("sample_data", exist_ok=True)

# --- Configuration ---
NUM_ROWS = 1000
OUTPUT_FILE = "sample_data/gcp_billing_export_vertex_ai.csv"

# --- Realistic GCP Constants ---

BILLING_ACCOUNTS = [
    "012345-6789AB-CDEF01",
    "01A2B3-456C7D-89E0FG",
    "0AB1CD-2EF3GH-4IJ5KL"
]

PROJECTS = [
    {"id": "ai-prod-001", "number": "123456789012", "name": "AI Production"},
    {"id": "ai-dev-team", "number": "234567890123", "name": "AI Development"},
    {"id": "ml-platform", "number": "345678901234", "name": "ML Platform"},
    {"id": "genai-experiments", "number": "456789012345", "name": "GenAI Experiments"},
    {"id": "vertex-ai-prod", "number": "567890123456", "name": "Vertex AI Production"},
]

# Vertex AI / Gemini SKUs with realistic pricing info
# SKU IDs follow GCP pattern: service ID + specific SKU
VERTEX_SKUS = [
    # Gemini 2.5 Flash
    {
        "sku_id": "6F81-5844-456A-D345",
        "description": "Gemini 2.5 Flash Input Tokens (0-128k)",
        "service_id": "6F81-5844-456A",
        "service_desc": "Vertex AI",
        "unit": "count",
        "pricing_unit": "Million Tokens",
        "unit_price": 0.10,  # $0.10 per 1M tokens
        "is_input": True,
    },
    {
        "sku_id": "6F81-5844-456A-D346",
        "description": "Gemini 2.5 Flash Output Tokens (0-128k)",
        "service_id": "6F81-5844-456A",
        "service_desc": "Vertex AI",
        "unit": "count",
        "pricing_unit": "Million Tokens",
        "unit_price": 0.40,  # $0.40 per 1M tokens
        "is_input": False,
    },
    # Gemini 2.5 Pro
    {
        "sku_id": "6F81-5844-456A-D347",
        "description": "Gemini 2.5 Pro Input Tokens (0-128k)",
        "service_id": "6F81-5844-456A",
        "service_desc": "Vertex AI",
        "unit": "count",
        "pricing_unit": "Million Tokens",
        "unit_price": 1.25,
        "is_input": True,
    },
    {
        "sku_id": "6F81-5844-456A-D348",
        "description": "Gemini 2.5 Pro Output Tokens (0-128k)",
        "service_id": "6F81-5844-456A",
        "service_desc": "Vertex AI",
        "unit": "count",
        "pricing_unit": "Million Tokens",
        "unit_price": 5.00,
        "is_input": False,
    },
    # Gemini 1.5 Flash
    {
        "sku_id": "6F81-5844-456A-D349",
        "description": "Gemini 1.5 Flash Input Tokens",
        "service_id": "6F81-5844-456A",
        "service_desc": "Vertex AI",
        "unit": "count",
        "pricing_unit": "Million Tokens",
        "unit_price": 0.075,
        "is_input": True,
    },
    {
        "sku_id": "6F81-5844-456A-D350",
        "description": "Gemini 1.5 Flash Output Tokens",
        "service_id": "6F81-5844-456A",
        "service_desc": "Vertex AI",
        "unit": "count",
        "pricing_unit": "Million Tokens",
        "unit_price": 0.30,
        "is_input": False,
    },
    # Vertex AI Prediction (general)
    {
        "sku_id": "6F81-5844-456A-1234",
        "description": "Vertex AI Online Prediction",
        "service_id": "6F81-5844-456A",
        "service_desc": "Vertex AI",
        "unit": "count",
        "pricing_unit": "Requests",
        "unit_price": 0.0001,
        "is_input": None,  # Not token-based
    },
    # Cache tokens
    {
        "sku_id": "6F81-5844-456A-D351",
        "description": "Gemini Cache Storage (per 1M tokens/hour)",
        "service_id": "6F81-5844-456A",
        "service_desc": "Vertex AI",
        "unit": "count",
        "pricing_unit": "Million Token Hours",
        "unit_price": 0.025,
        "is_input": None,
    },
]

REGIONS = [
    {"location": "us-central1", "country": "US", "region": "us-central1", "zone": ""},
    {"location": "us-east4", "country": "US", "region": "us-east4", "zone": ""},
    {"location": "us-west1", "country": "US", "region": "us-west1", "zone": ""},
    {"location": "europe-west1", "country": "BE", "region": "europe-west1", "zone": ""},
    {"location": "europe-west4", "country": "NL", "region": "europe-west4", "zone": ""},
    {"location": "asia-northeast1", "country": "JP", "region": "asia-northeast1", "zone": ""},
    {"location": "asia-southeast1", "country": "SG", "region": "asia-southeast1", "zone": ""},
    {"location": "global", "country": "", "region": "", "zone": ""},
]

COST_TYPES = ["regular", "tax", "adjustment", "rounding_error"]
CURRENCIES = ["USD", "EUR", "GBP", "JPY"]

# Labels for cost attribution
LABEL_KEYS = ["env", "team", "project", "service", "cost-center", "app"]
LABEL_VALUES = {
    "env": ["prod", "staging", "dev", "test"],
    "team": ["ml-platform", "search-team", "chatbot-squad", "data-science", "infra"],
    "project": ["recommendation-engine", "customer-support-bot", "content-generation", "analytics"],
    "service": ["gemini-api", "vertex-endpoint", "batch-prediction"],
    "cost-center": ["cc-12345", "cc-67890", "cc-engineering", "cc-research"],
    "app": ["web-app", "mobile-api", "batch-job", "realtime-service"],
}

# Credit types
CREDIT_TYPES = [
    "PROMOTION",
    "FREE_TIER",
    "COMMITTED_USAGE_DISCOUNT",
    "COMMITTED_USAGE_DISCOUNT_DOLLAR_BASE",
    "SPEND_BASED_DISCOUNT",
    "DISCOUNT",
    "FEE_UTILIZATION_OFFSET",
]

def generate_timestamp(base_date=None, hour_offset=0):
    """Generate a realistic GCP timestamp."""
    if base_date is None:
        # Last 90 days
        base_date = datetime.utcnow() - timedelta(days=random.randint(0, 90))
    
    hour = (base_date.hour + hour_offset) % 24
    minute = random.randint(0, 59)
    second = random.randint(0, 59)
    microsecond = random.randint(0, 999999)
    
    ts = base_date.replace(hour=hour, minute=minute, second=second, microsecond=microsecond)
    return ts.strftime("%Y-%m-%dT%H:%M:%S.%fZ")

def generate_labels():
    """Generate realistic GCP resource labels as JSON string."""
    num_labels = random.randint(0, 4)
    labels = []
    selected_keys = random.sample(LABEL_KEYS, min(num_labels, len(LABEL_KEYS)))
    
    for key in selected_keys:
        labels.append({
            "key": key,
            "value": random.choice(LABEL_VALUES[key])
        })
    
    return json.dumps(labels) if labels else ""

def generate_credits(cost):
    """Generate realistic credits structure."""
    credits = []
    
    # 30% chance of having credits
    if random.random() < 0.3 and cost > 0:
        credit_amount = round(cost * random.uniform(0.1, 0.5), 6)
        credits.append({
            "id": f"CREDIT-{uuid.uuid4().hex[:8].upper()}",
            "full_name": random.choice([
                "Committed Use Discount",
                "Sustained Use Discount",
                "Free Tier Credit",
                "Promotional Credit",
                "Custom Contract Discount"
            ]),
            "type": random.choice(CREDIT_TYPES),
            "name": "Discount credit",
            "amount": -abs(credit_amount)  # Credits are negative
        })
    
    return json.dumps(credits) if credits else ""

def generate_tags():
    """Generate GCP tags as JSON."""
    if random.random() < 0.4:
        tags = [{
            "key": random.choice(["cost-center", "department", "project-code"]),
            "value": f"tag-{random.randint(1000, 9999)}",
            "inherited": random.choice([True, False]),
            "namespace": f"organizations/{random.randint(100000000, 999999999)}"
        }]
        return json.dumps(tags)
    return ""

def generate_token_amount():
    """Generate realistic token usage amounts."""
    # Log-normal distribution for realistic token counts
    import math
    mean = 12  # ~16k tokens median
    sigma = 1.5
    log_tokens = random.gauss(mean, sigma)
    return int(math.exp(log_tokens))

def generate_row(row_num, base_date):
    """Generate a single GCP billing export row."""
    
    # Select SKU (weighted toward token-based SKUs)
    sku = random.choice(VERTEX_SKUS)
    
    # Determine usage amount based on SKU type
    if sku["is_input"] is True:
        # Input tokens - typically larger
        usage_amount = generate_token_amount()
    elif sku["is_input"] is False:
        # Output tokens - typically smaller
        usage_amount = int(generate_token_amount() * random.uniform(0.1, 0.5))
    else:
        # Non-token usage
        usage_amount = random.randint(1, 10000)
    
    # Calculate cost
    if sku["pricing_unit"] == "Million Tokens":
        cost = round((usage_amount / 1_000_000) * sku["unit_price"], 6)
    elif sku["pricing_unit"] == "Million Token Hours":
        cost = round((usage_amount / 1_000_000) * sku["unit_price"] * random.uniform(0.5, 24), 6)
    else:
        cost = round(usage_amount * sku["unit_price"], 6)
    
    # Small random adjustment to make it look real
    cost = round(cost * random.uniform(0.98, 1.02), 6)
    
    # Select project and region
    project = random.choice(PROJECTS)
    region = random.choice(REGIONS)
    
    # Timestamps - hourly granularity as per GCP billing
    hour_offset = row_num % 24
    usage_start = generate_timestamp(base_date, hour_offset)
    usage_end = generate_timestamp(base_date, hour_offset + 1)
    export_time = generate_timestamp(datetime.utcnow(), 0)
    
    # Invoice month (YYYYMM format)
    invoice_month = base_date.strftime("%Y%m")
    
    # Cost type (mostly regular, occasional adjustments)
    cost_type = random.choices(COST_TYPES, weights=[0.95, 0.03, 0.015, 0.005])[0]
    
    # Currency
    currency = random.choice(CURRENCIES)
    fx_rate = 1.0 if currency == "USD" else round(random.uniform(0.7, 150), 6)
    
    # Convert cost if not USD
    if currency != "USD":
        cost = round(cost * fx_rate, 6)
    
    # Generate credits (often zero)
    credits_json = generate_credits(cost)
    
    # Calculate cost_at_list (usually same as cost, occasionally higher)
    cost_at_list = round(cost * random.uniform(1.0, 1.2), 6)
    
    # Cost at effective price (with discounts applied)
    cost_at_effective = cost
    
    return {
        "billing_account_id": random.choice(BILLING_ACCOUNTS),
        "invoice.month": invoice_month,
        "invoice.publisher_type": "GOOGLE",
        "cost_type": cost_type,
        "service.id": sku["service_id"],
        "service.description": sku["service_desc"],
        "sku.id": sku["sku_id"],
        "sku.description": sku["description"],
        "usage_start_time": usage_start,
        "usage_end_time": usage_end,
        "project.id": project["id"],
        "project.number": project["number"],
        "project.name": project["name"],
        "project.ancestry_numbers": f"/0/{random.randint(100000000, 999999999)}/{project['number']}/",
        "project.ancestors": json.dumps([
            {
                "resource_name": f"organizations/{random.randint(100000000, 999999999)}",
                "display_name": "My Organization"
            },
            {
                "resource_name": f"folders/{random.randint(1000000000, 9999999999)}",
                "display_name": "Cloud Engineering"
            }
        ]),
        "labels": generate_labels(),
        "system_labels": "",  # Simplified
        "location.location": region["location"],
        "location.country": region["country"],
        "location.region": region["region"],
        "location.zone": region["zone"],
        "cost": cost,
        "currency": currency,
        "currency_conversion_rate": fx_rate,
        "usage.amount": usage_amount,
        "usage.unit": sku["unit"],
        "usage.amount_in_pricing_units": round(usage_amount / 1_000_000, 6) if "Million" in sku["pricing_unit"] else usage_amount,
        "usage.pricing_unit": sku["pricing_unit"],
        "credits": credits_json,
        "adjustment_info": "",  # Usually empty
        "export_time": export_time,
        "tags": generate_tags(),
        "cost_at_list": cost_at_list,
        "transaction_type": "GOOGLE",
        "seller_name": "",
        "price.list_price": sku["unit_price"],
        "price.effective_price_default": sku["unit_price"],
        "price.list_price_consumption_model": sku["unit_price"],
        "price.effective_price": sku["unit_price"] * random.uniform(0.8, 1.0),
        "price.tier_start_amount": 0,
        "price.unit": sku["unit"],
        "price.pricing_unit_quantity": 1_000_000 if "Million" in sku["pricing_unit"] else 1,
        "cost_at_effective_price_default": cost_at_effective,
        "cost_at_list_consumption_model": cost_at_list,
        "consumption_model.id": "",
        "consumption_model.description": "",
    }

def main():
    print(f"Generating {NUM_ROWS} rows of GCP Cloud Billing export data...")
    
    # Determine date range (last 90 days, distributed)
    base_dates = [datetime.utcnow() - timedelta(days=random.randint(0, 90)) for _ in range(NUM_ROWS)]
    base_dates.sort()  # Chronological order
    
    # Define columns (flattened BigQuery schema)
    columns = [
        "billing_account_id",
        "invoice.month",
        "invoice.publisher_type",
        "cost_type",
        "service.id",
        "service.description",
        "sku.id",
        "sku.description",
        "usage_start_time",
        "usage_end_time",
        "project.id",
        "project.number",
        "project.name",
        "project.ancestry_numbers",
        "project.ancestors",
        "labels",
        "system_labels",
        "location.location",
        "location.country",
        "location.region",
        "location.zone",
        "cost",
        "currency",
        "currency_conversion_rate",
        "usage.amount",
        "usage.unit",
        "usage.amount_in_pricing_units",
        "usage.pricing_unit",
        "credits",
        "adjustment_info",
        "export_time",
        "tags",
        "cost_at_list",
        "transaction_type",
        "seller_name",
        "price.list_price",
        "price.effective_price_default",
        "price.list_price_consumption_model",
        "price.effective_price",
        "price.tier_start_amount",
        "price.unit",
        "price.pricing_unit_quantity",
        "cost_at_effective_price_default",
        "cost_at_list_consumption_model",
        "consumption_model.id",
        "consumption_model.description",
    ]
    
    rows_written = 0
    total_cost = 0.0
    
    with open(OUTPUT_FILE, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=columns)
        writer.writeheader()
        
        for i in range(NUM_ROWS):
            row = generate_row(i, base_dates[i])
            writer.writerow(row)
            rows_written += 1
            total_cost += float(row["cost"])
            
            if (i + 1) % 100 == 0:
                print(f"  ... generated {i + 1} rows")
    
    print(f"\n✅ Generated {rows_written} rows")
    print(f"📁 Output: {OUTPUT_FILE}")
    print(f"💰 Total cost in export: ${total_cost:,.2f} USD equivalent")
    print(f"📊 Unique SKUs: {len(VERTEX_SKUS)}")
    print(f"🌍 Date range: {base_dates[0].strftime('%Y-%m-%d')} to {base_dates[-1].strftime('%Y-%m-%d')}")
    
    # Show sample row
    print("\n📋 Sample row (first row):")
    sample = generate_row(0, base_dates[0])
    for key in ["usage_start_time", "project.id", "sku.description", "usage.amount", "cost", "currency"]:
        print(f"  {key}: {sample[key]}")

if __name__ == "__main__":
    main()
