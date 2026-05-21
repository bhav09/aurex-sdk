import os
import random
import json
import uuid
from datetime import datetime, timedelta

# Create output directories if they don't exist
os.makedirs("model provider usage data/OpenAI", exist_ok=True)
os.makedirs("model provider usage data/Anthropic", exist_ok=True)

def generate_waste_heavy_openai(filepath, target_rows=40000):
    print(f"Generating WASTE-HEAVY OpenAI dataset at {filepath}...")
    
    # We want these columns:
    # timestamp,request_id,model,prompt,prompt_tokens,completion_tokens,cost,status,workflow_id,session_id,metadata
    headers = "timestamp,request_id,model,prompt,prompt_tokens,completion_tokens,cost,status,workflow_id,session_id,metadata\n"
    
    start_time = datetime(2026, 5, 15, 10, 0, 0)
    current_time = start_time
    
    # Pre-generate some system prompt hashes for redundant prompt waste
    sys_prompt_hash_1 = "hash_c0ffee129b8c"
    sys_prompt_tokens_1 = 3500  # large system prompt
    
    sys_prompt_hash_2 = "hash_deadbeef554a"
    sys_prompt_tokens_2 = 1800
    
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(headers)
        
        # 1. Generate REDUNDANT SYSTEM PROMPTS (CRITICAL severity issue)
        # We will create 8,000 requests using gpt-4o with the exact same system prompt hash
        print("Generating redundant system prompt records...")
        for _ in range(8000):
            current_time += timedelta(seconds=random.randint(1, 3))
            req_id = f"req_{uuid.uuid4().hex[:12]}"
            model = "gpt-4o"
            prompt = "Short query to agent"
            in_t = sys_prompt_tokens_1 + random.randint(10, 30)
            out_t = random.randint(10, 50)
            
            # gpt-4o: $5/1M input, $15/1M output
            cost = (in_t * 0.000005) + (out_t * 0.000015)
            cost = round(cost, 6)
            
            meta_json = json.dumps({
                "system_prompt_hash": sys_prompt_hash_1,
                "system_prompt_tokens": sys_prompt_tokens_1
            })
            # Escape double quotes for CSV
            escaped_meta = meta_json.replace('"', '""')
            escaped_prompt = prompt.replace('"', '""')
            
            f.write(f"{current_time.isoformat()}Z,{req_id},{model},\"{escaped_prompt}\",{in_t},{out_t},{cost},success,wf_support_agent,,\"{escaped_meta}\"\n")

        # 2. Generate AGENT RUNAWAY LOOPS (CRITICAL severity issue)
        # We will create 15 distinct runaway loops with exponential context growth
        print("Generating agent runaway loop records...")
        for loop_idx in range(15):
            wf_id = f"wf_runaway_loop_{loop_idx}"
            session_id = f"session_loop_{loop_idx}_{uuid.uuid4().hex[:6]}"
            
            # Start with a base context, doubling each step
            in_t = 100
            out_t = 50
            for step in range(8):  # 8 doubling steps = doublings = 7 (exponential growth)
                current_time += timedelta(seconds=random.randint(10, 20))
                req_id = f"req_{uuid.uuid4().hex[:12]}"
                model = "gpt-4o"
                prompt = f"Runaway loop step {step}"
                
                cost = (in_t * 0.000005) + (out_t * 0.000015)
                cost = round(cost, 6)
                
                meta_json = json.dumps({
                    "session_id": session_id,
                    "request_id": req_id
                })
                escaped_meta = meta_json.replace('"', '""')
                escaped_prompt = prompt.replace('"', '""')
                
                f.write(f"{current_time.isoformat()}Z,{req_id},{model},\"{escaped_prompt}\",{in_t},{out_t},{cost},success,{wf_id},{session_id},\"{escaped_meta}\"\n")
                
                # Double input tokens for exponential growth
                in_t = int(in_t * 2.1)
                out_t = int(out_t * 1.9)

        # 3. Generate EXPENSIVE MODEL MISUSE (HIGH severity issue)
        # Using gpt-4o for simple tasks (avg 8 input / 11 output tokens)
        print("Generating expensive model misuse records...")
        for _ in range(12000):
            current_time += timedelta(seconds=random.randint(1, 4))
            req_id = f"req_{uuid.uuid4().hex[:12]}"
            model = "gpt-4o"
            prompt = random.choice(["hi", "ping", "test", "Hello", "How are you?"])
            in_t = random.randint(5, 12)
            out_t = random.randint(8, 15)
            
            cost = (in_t * 0.000005) + (out_t * 0.000015)
            cost = round(cost, 6)
            
            meta_json = json.dumps({"source": "simple_task"})
            escaped_meta = meta_json.replace('"', '""')
            escaped_prompt = prompt.replace('"', '""')
            
            f.write(f"{current_time.isoformat()}Z,{req_id},{model},\"{escaped_prompt}\",{in_t},{out_t},{cost},success,wf_simple_check,,\"{escaped_meta}\"\n")

        # 4. Generate some regular baseline traffic to balance the file size/row count
        print("Generating OpenAI baseline records...")
        for _ in range(target_rows - 20000):
            current_time += timedelta(seconds=random.randint(1, 8))
            req_id = f"req_{uuid.uuid4().hex[:12]}"
            
            # Use gpt-4o-mini to show what optimized spend looks like, but keep some misuse
            model = random.choices(["gpt-4o-mini", "o1-mini"], weights=[0.90, 0.10])[0]
            prompt = "Standard production query"
            in_t = random.randint(100, 300)
            out_t = random.randint(50, 150)
            
            if model == "gpt-4o-mini":
                cost = (in_t * 0.00000015) + (out_t * 0.0000006)
            else:
                cost = (in_t * 0.000003) + (out_t * 0.000012)
                
            cost = round(cost, 6)
            escaped_prompt = prompt.replace('"', '""')
            
            f.write(f"{current_time.isoformat()}Z,{req_id},{model},\"{escaped_prompt}\",{in_t},{out_t},{cost},success,wf_regular,,\"{{\}}\"\n")
            
    print("OpenAI waste-heavy dataset completed.")

def generate_waste_heavy_anthropic(filepath, target_rows=40000):
    print(f"Generating WASTE-HEAVY Anthropic dataset at {filepath}...")
    
    headers = "timestamp,request_id,model,prompt,prompt_tokens,completion_tokens,cost,status,cache_creation_input_tokens,cache_read_input_tokens,workflow_id,session_id,metadata\n"
    
    start_time = datetime(2026, 5, 15, 10, 0, 0)
    current_time = start_time
    
    # Pre-generate system prompt hashes for redundant prompt waste
    sys_prompt_hash = "hash_anthropic_c0ffee99b"
    sys_prompt_tokens = 3500  # large system prompt
    
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(headers)
        
        # 1. Generate REDUNDANT SYSTEM PROMPTS (CRITICAL severity issue)
        # We will create 6,000 requests using Claude 3.5 Sonnet with the exact same system prompt hash
        print("Generating redundant system prompt records (Anthropic)...")
        for _ in range(6000):
            current_time += timedelta(seconds=random.randint(1, 3))
            req_id = f"req_{uuid.uuid4().hex[:12]}"
            model = "claude-3-5-sonnet-20241022"
            prompt = "Quick helper request to Claude agent"
            in_t = sys_prompt_tokens + random.randint(10, 30)
            out_t = random.randint(10, 50)
            
            # Sonnet pricing: $3/1M input, $15/1M output
            cost = (in_t * 0.000003) + (out_t * 0.000015)
            cost = round(cost, 6)
            
            meta_json = json.dumps({
                "system_prompt_hash": sys_prompt_hash,
                "system_prompt_tokens": sys_prompt_tokens
            })
            escaped_meta = meta_json.replace('"', '""')
            escaped_prompt = prompt.replace('"', '""')
            
            f.write(f"{current_time.isoformat()}Z,{req_id},{model},\"{escaped_prompt}\",{in_t},{out_t},{cost},success,0,0,wf_customer_support,,\"{escaped_meta}\"\n")
            
        # 2. Generate AGENT RUNAWAY LOOPS (CRITICAL severity issue)
        # 12 distinct runaway sessions using Claude 3.5 Sonnet
        print("Generating agent runaway loop records (Anthropic)...")
        for loop_idx in range(12):
            wf_id = f"wf_anthropic_loop_{loop_idx}"
            session_id = f"session_anth_loop_{loop_idx}_{uuid.uuid4().hex[:6]}"
            
            in_t = 120
            out_t = 60
            for step in range(8):
                current_time += timedelta(seconds=random.randint(10, 20))
                req_id = f"req_{uuid.uuid4().hex[:12]}"
                model = "claude-3-5-sonnet-20241022"
                prompt = f"Anthropic runaway agent step {step}"
                
                cost = (in_t * 0.000003) + (out_t * 0.000015)
                cost = round(cost, 6)
                
                meta_json = json.dumps({
                    "session_id": session_id,
                    "request_id": req_id
                })
                escaped_meta = meta_json.replace('"', '""')
                escaped_prompt = prompt.replace('"', '""')
                
                f.write(f"{current_time.isoformat()}Z,{req_id},{model},\"{escaped_prompt}\",{in_t},{out_t},{cost},success,0,0,{wf_id},{session_id},\"{escaped_meta}\"\n")
                
                # Exponential doubling growth
                in_t = int(in_t * 2.1)
                out_t = int(out_t * 1.9)
                
        # 3. Generate EXPENSIVE MODEL MISUSE (HIGH severity issue)
        # Using claude-3-opus-20240229 for simple tasks (avg 10 input / 14 output tokens)
        print("Generating expensive model misuse records (Claude 3 Opus)...")
        for _ in range(15000):
            current_time += timedelta(seconds=random.randint(1, 3))
            req_id = f"req_{uuid.uuid4().hex[:12]}"
            model = "claude-3-opus-20240229"
            prompt = random.choice(["hi", "ping", "test", "Hello", "How is the weather?"])
            in_t = random.randint(6, 14)
            out_t = random.randint(10, 18)
            
            # Opus pricing: $15/1M input, $75/1M output
            cost = (in_t * 0.000015) + (out_t * 0.000075)
            cost = round(cost, 6)
            
            meta_json = json.dumps({"source": "simple_task"})
            escaped_meta = meta_json.replace('"', '""')
            escaped_prompt = prompt.replace('"', '""')
            
            f.write(f"{current_time.isoformat()}Z,{req_id},{model},\"{escaped_prompt}\",{in_t},{out_t},{cost},success,0,0,wf_simple_check,,\"{escaped_meta}\"\n")
            
        # 4. Generate regular baseline traffic for Anthropic
        print("Generating Anthropic baseline records...")
        for _ in range(target_rows - 21000 - (12 * 8)):
            current_time += timedelta(seconds=random.randint(1, 8))
            req_id = f"req_{uuid.uuid4().hex[:12]}"
            
            # Use Sonnet or Haiku
            model = random.choices(["claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022"], weights=[0.40, 0.60])[0]
            prompt = "Standard helper task prompt"
            in_t = random.randint(200, 800)
            out_t = random.randint(100, 400)
            
            if model == "claude-3-5-sonnet-20241022":
                cost = (in_t * 0.000003) + (out_t * 0.000015)
            else:
                cost = (in_t * 0.0000008) + (out_t * 0.000004)
                
            cost = round(cost, 6)
            escaped_prompt = prompt.replace('"', '""')
            
            f.write(f"{current_time.isoformat()}Z,{req_id},{model},\"{escaped_prompt}\",{in_t},{out_t},{cost},success,0,0,wf_regular,,\"{{\}}\"\n")
            
    print("Anthropic waste-heavy dataset completed.")

if __name__ == "__main__":
    generate_waste_heavy_openai("model provider usage data/OpenAI/openai_realistic_large_usage.csv", 45000)
    generate_waste_heavy_anthropic("model provider usage data/Anthropic/anthropic_realistic_large_usage.csv", 45000)
    print("Done! Waste-heavy datasets successfully generated.")
