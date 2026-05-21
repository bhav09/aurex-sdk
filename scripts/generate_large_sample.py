import os
import random
import uuid
from datetime import datetime, timedelta

# Create output directories if they don't exist
os.makedirs("model provider usage data/OpenAI", exist_ok=True)
os.makedirs("model provider usage data/Anthropic", exist_ok=True)

# Realistic prompt library to simulate diverse usage patterns
COMMON_PROMPTS = [
    # Redundant / basic prompts (great for duplicate & mismatch detection)
    ("Hello, how are you?", 5, 10),
    ("hi", 1, 2),
    ("ping", 1, 1),
    ("test", 1, 1),
    ("How is the weather today?", 6, 12),
    ("What is the capital of France?", 7, 10),
    ("Help me debug this syntax error", 6, 15),
    # Medium complexity prompts
    ("Explain the difference between REST and GraphQL APIs in detail.", 12, 180),
    ("Write a python script to reverse a string and explain the time complexity.", 15, 220),
    ("What are the core concepts of React hooks?", 9, 140),
    ("How does the virtual DOM work in modern frontend frameworks?", 11, 280),
    ("Can you write a SQL query to join users and orders, showing the total spend?", 16, 190),
    # High complexity / long prompts (heavy reasoning)
    ("Evaluate the scalability of a microservices architecture vs monorepo for a high-growth fintech startup.", 250, 850),
    ("Compare the performance metrics of PostgreSQL, MongoDB, and Redis for caching session storage at scale.", 300, 950),
    ("Analyze this server log for memory leaks and provide an optimization plan with step by step formal proof.", 850, 1500),
]

# Repeated templates to trigger duplicate waste detection
REPEATED_TEMPLATES = [
    "Write a python script to reverse a string",
    "Explain the difference between SQL and NoSQL databases.",
    "Generate a mock user login page using tailwind css.",
    "Analyze this server log for memory leaks and provide an optimization plan.",
    "Can you write a SQL query to join users and orders, showing the total spend?"
]

# Model distributions
OPENAI_MODELS = ["gpt-4o", "gpt-4o-mini", "o1-mini", "o1-preview"]
ANTHROPIC_MODELS = ["claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022", "claude-3-opus-20240229"]

def generate_openai_data(filepath, target_rows):
    print(f"Generating OpenAI dataset at {filepath} ({target_rows} rows)...")
    headers = "timestamp,request_id,model,prompt,prompt_tokens,completion_tokens,cost,status\n"
    
    start_time = datetime(2026, 5, 15, 10, 0, 0)
    current_time = start_time
    
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(headers)
        
        for i in range(target_rows):
            # Advance time slightly
            current_time += timedelta(seconds=random.randint(1, 10))
            
            # Formulate runaway burst loop (100+ requests in 1 minute) every 10000 rows
            if i > 0 and i % 10000 == 0:
                burst_time = current_time
                for _ in range(120):
                    burst_time += timedelta(milliseconds=random.randint(100, 400))
                    req_id = f"req_{uuid.uuid4().hex[:12]}"
                    model = "gpt-4o"
                    prompt = "Analyze this memory leak burst loop request"
                    in_t = 15000
                    out_t = 800
                    cost = round((in_t * 0.000005) + (out_t * 0.000015), 6)
                    f.write(f"{burst_time.isoformat()}Z,{req_id},{model},\"{prompt}\",{in_t},{out_t},{cost},success\n")
            
            req_id = f"req_{uuid.uuid4().hex[:12]}"
            
            # Select model
            model = random.choices(
                OPENAI_MODELS, 
                weights=[0.35, 0.50, 0.10, 0.05], 
                k=1
            )[0]
            
            # Select prompt structure
            if random.random() < 0.22:
                # Direct duplicates
                prompt = random.choice(REPEATED_TEMPLATES)
                in_t = len(prompt.split()) + random.randint(10, 30)
                out_t = random.randint(100, 350)
            else:
                p_tmpl, base_in, base_out = random.choice(COMMON_PROMPTS)
                prompt = p_tmpl
                in_t = base_in * random.randint(1, 3)
                out_t = base_out * random.randint(1, 2)
            
            # Mismatch generation: running cheap simple prompts on expensive models
            if model in ["gpt-4o", "o1-preview"] and len(prompt.split()) < 5:
                # highly likely to trigger mismatch suggestions
                pass
                
            # Compute cost based on OpenAI prices
            # gpt-4o: $5 / 1M input, $15 / 1M output
            # gpt-4o-mini: $0.150 / 1M input, $0.600 / 1M output
            # o1-mini: $3 / 1M input, $12 / 1M output
            # o1-preview: $15 / 1M input, $60 / 1M output
            if model == "gpt-4o":
                cost = (in_t * 0.000005) + (out_t * 0.000015)
            elif model == "gpt-4o-mini":
                cost = (in_t * 0.00000015) + (out_t * 0.0000006)
            elif model == "o1-mini":
                cost = (in_t * 0.000003) + (out_t * 0.000012)
            else: # o1-preview
                cost = (in_t * 0.000015) + (out_t * 0.00006)
                
            cost = round(cost, 6)
            
            # Escape prompt quotes for CSV format
            escaped_prompt = prompt.replace('"', '""')
            status = "success" if random.random() < 0.98 else "error"
            
            f.write(f"{current_time.isoformat()}Z,{req_id},{model},\"{escaped_prompt}\",{in_t},{out_t},{cost},{status}\n")

def generate_anthropic_data(filepath, target_rows):
    print(f"Generating Anthropic dataset at {filepath} ({target_rows} rows)...")
    headers = "timestamp,request_id,model,prompt,prompt_tokens,completion_tokens,cost,status\n"
    
    start_time = datetime(2026, 5, 15, 10, 0, 0)
    current_time = start_time
    
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(headers)
        
        for i in range(target_rows):
            current_time += timedelta(seconds=random.randint(1, 12))
            
            # Formulate burst loop (100+ requests in 1 minute) every 12000 rows
            if i > 0 and i % 12000 == 0:
                burst_time = current_time
                for _ in range(80):
                    burst_time += timedelta(milliseconds=random.randint(200, 500))
                    req_id = f"req_{uuid.uuid4().hex[:12]}"
                    model = "claude-3-5-sonnet-20241022"
                    prompt = "Analyze this memory leak burst loop request"
                    in_t = 12000
                    out_t = 600
                    cost = round((in_t * 0.000003) + (out_t * 0.000015), 6)
                    f.write(f"{burst_time.isoformat()}Z,{req_id},{model},\"{prompt}\",{in_t},{out_t},{cost},success\n")
                    
            req_id = f"req_{uuid.uuid4().hex[:12]}"
            
            # Select model
            model = random.choices(
                ANTHROPIC_MODELS,
                weights=[0.60, 0.35, 0.05],
                k=1
            )[0]
            
            # Select prompt
            if random.random() < 0.25:
                prompt = random.choice(REPEATED_TEMPLATES)
                in_t = len(prompt.split()) + random.randint(10, 45)
                out_t = random.randint(150, 400)
            else:
                p_tmpl, base_in, base_out = random.choice(COMMON_PROMPTS)
                prompt = p_tmpl
                in_t = base_in * random.randint(1, 4)
                out_t = base_out * random.randint(1, 3)
                
            # Compute cost based on Anthropic prices
            # claude-3-5-sonnet: $3 / 1M input, $15 / 1M output
            # claude-3-5-haiku: $0.80 / 1M input, $4 / 1M output
            # claude-3-opus: $15 / 1M input, $75 / 1M output
            if model == "claude-3-5-sonnet-20241022":
                cost = (in_t * 0.000003) + (out_t * 0.000015)
            elif model == "claude-3-5-haiku-20241022":
                cost = (in_t * 0.0000008) + (out_t * 0.000004)
            else: # claude-3-opus-20240229
                cost = (in_t * 0.000015) + (out_t * 0.000075)
                
            cost = round(cost, 6)
            escaped_prompt = prompt.replace('"', '""')
            status = "success" if random.random() < 0.99 else "error"
            
            f.write(f"{current_time.isoformat()}Z,{req_id},{model},\"{escaped_prompt}\",{in_t},{out_t},{cost},{status}\n")

if __name__ == "__main__":
    # 50,000 rows generates ~5.0 - 5.5 MB file depending on exact strings
    generate_openai_data("model provider usage data/OpenAI/openai_realistic_large_usage.csv", 48000)
    generate_anthropic_data("model provider usage data/Anthropic/anthropic_realistic_large_usage.csv", 48000)
    print("Done! Realistic test files generated successfully.")
