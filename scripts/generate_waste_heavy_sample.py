import os
import random
import json
import uuid
from datetime import datetime, timedelta

# Create output directories if they don't exist
os.makedirs("model provider usage data/OpenAI", exist_ok=True)
os.makedirs("model provider usage data/Anthropic", exist_ok=True)
os.makedirs("model provider usage data/Bedrock", exist_ok=True)

def generate_waste_heavy_openai(filepath, target_rows=40000):
    print(f"Generating WASTE-HEAVY OpenAI dataset at {filepath}...")
    
    headers = "Timestamp,Organization ID,Project ID,API Key ID,Model,Prompt Tokens,Completion Tokens,Cost,Request Count,Status,Prompt,Workflow ID,Session ID,Metadata\n"
    
    start_time = datetime(2026, 5, 15, 10, 0, 0)
    current_time = start_time
    
    sys_prompt_hash_1 = "hash_c0ffee129b8c"
    sys_prompt_tokens_1 = 3500
    
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(headers)
        
        # 1. Generate REDUNDANT SYSTEM PROMPTS (Prompt Caching)
        print("Generating redundant system prompt records (OpenAI)...")
        for i in range(8000):
            current_time += timedelta(seconds=random.randint(1, 3))
            req_id = f"req_{uuid.uuid4().hex[:12]}"
            # Mix 2026 models like o3-mini and gpt-4o
            model = random.choice(["gpt-4o", "o3-mini"])
            prompt = "Short query to agent"
            user_tokens = random.randint(10, 30)
            in_t = sys_prompt_tokens_1 + user_tokens
            out_t = random.randint(10, 50)
            
            # First request creates cache, subsequent read cache
            if i == 0:
                meta = {
                    "system_prompt_hash": sys_prompt_hash_1,
                    "cache_creation_input_tokens": sys_prompt_tokens_1,
                    "cache_read_input_tokens": 0
                }
                if model == "o3-mini":
                    cost = (in_t * 0.0000011) + (out_t * 0.0000044)
                else:
                    cost = (in_t * 0.0000025) + (out_t * 0.000010)
            else:
                meta = {
                    "system_prompt_hash": sys_prompt_hash_1,
                    "cache_creation_input_tokens": 0,
                    "cache_read_input_tokens": sys_prompt_tokens_1
                }
                # cached input is cheaper (usually 50% discount in OpenAI)
                if model == "o3-mini":
                    cost = (sys_prompt_tokens_1 * 0.00000055) + (user_tokens * 0.0000011) + (out_t * 0.0000044)
                else:
                    cost = (sys_prompt_tokens_1 * 0.00000125) + (user_tokens * 0.0000025) + (out_t * 0.000010)
                
            cost = round(cost, 6)
            escaped_meta = json.dumps(meta).replace('"', '""')
            escaped_prompt = prompt.replace('"', '""')
            
            f.write(f"{current_time.isoformat()}Z,org_123,proj_456,key_789,{model},{in_t},{out_t},{cost},1,success,\"{escaped_prompt}\",wf_support_agent,,\"{escaped_meta}\"\n")

        # 2. Generate AGENT RUNAWAY LOOPS
        print("Generating agent runaway loop records (OpenAI)...")
        for loop_idx in range(15):
            wf_id = f"wf_runaway_loop_{loop_idx}"
            session_id = f"session_loop_{loop_idx}_{uuid.uuid4().hex[:6]}"
            
            in_t = 100
            out_t = 50
            for step in range(8):
                current_time += timedelta(seconds=random.randint(10, 20))
                req_id = f"req_{uuid.uuid4().hex[:12]}"
                model = "gpt-4o"
                prompt = f"Runaway loop step {step}"
                
                cost = (in_t * 0.0000025) + (out_t * 0.000010)
                cost = round(cost, 6)
                
                meta = {"session_id": session_id, "request_id": req_id}
                
                # Add reasoning tokens for some of them using 2026 o3-mini/o1
                if random.random() < 0.3:
                    model = "o3-mini"
                    cost = (in_t * 0.0000011) + (out_t * 0.0000044)
                    cost = round(cost, 6)
                    meta["reasoning_tokens"] = int(out_t * 0.8)
                    
                escaped_meta = json.dumps(meta).replace('"', '""')
                escaped_prompt = prompt.replace('"', '""')
                
                f.write(f"{current_time.isoformat()}Z,org_123,proj_456,key_789,{model},{in_t},{out_t},{cost},1,success,\"{escaped_prompt}\",{wf_id},{session_id},\"{escaped_meta}\"\n")
                
                in_t = int(in_t * 2.1)
                out_t = int(out_t * 1.9)

        # 3. Generate EXPENSIVE MODEL MISUSE & TOOL BLOAT
        print("Generating expensive model misuse & tool bloat records (OpenAI)...")
        for _ in range(12000):
            current_time += timedelta(seconds=random.randint(1, 4))
            req_id = f"req_{uuid.uuid4().hex[:12]}"
            model = random.choice(["gpt-4o", "gpt-5"])
            prompt = random.choice(["hi", "ping", "test", "Hello", "How are you?"])
            in_t = random.randint(5, 12)
            out_t = random.randint(8, 15)
            
            meta = {"source": "simple_task"}
            
            # Introduce Tool Bloat: provide 50 tools, use none or 1
            if random.random() < 0.2:
                in_t += 8000 # huge tool definition context
                meta["tools_available_count"] = 50
                meta["tool_definitions_tokens"] = 8000
                meta["tool_invocations"] = json.dumps([])
                
            if model == "gpt-5":
                cost = (in_t * 0.000005) + (out_t * 0.000015)
            else:
                cost = (in_t * 0.0000025) + (out_t * 0.000010)
            cost = round(cost, 6)
            
            escaped_meta = json.dumps(meta).replace('"', '""')
            escaped_prompt = prompt.replace('"', '""')
            
            f.write(f"{current_time.isoformat()}Z,org_123,proj_456,key_789,{model},{in_t},{out_t},{cost},1,success,\"{escaped_prompt}\",wf_simple_check,,\"{escaped_meta}\"\n")

        # 4. Generate regular baseline traffic
        print("Generating OpenAI baseline records...")
        for _ in range(target_rows - 20000):
            current_time += timedelta(seconds=random.randint(1, 8))
            req_id = f"req_{uuid.uuid4().hex[:12]}"
            
            model = random.choices(["gpt-4o-mini", "o3-mini", "gemini-2.5-flash"], weights=[0.60, 0.20, 0.20])[0]
            prompt = "Standard production query"
            in_t = random.randint(100, 300)
            out_t = random.randint(50, 150)
            
            meta = {}
            if model == "o3-mini":
                meta["reasoning_tokens"] = int(out_t * random.uniform(0.3, 0.9))
                cost = (in_t * 0.0000011) + (out_t * 0.0000044)
            elif model == "gemini-2.5-flash":
                cost = (in_t * 0.0000001) + (out_t * 0.0000004)
            else:
                cost = (in_t * 0.00000015) + (out_t * 0.0000006)
                
            cost = round(cost, 6)
            escaped_meta = json.dumps(meta).replace('"', '""')
            escaped_prompt = prompt.replace('"', '""')
            
            f.write(f"{current_time.isoformat()}Z,org_123,proj_456,key_789,{model},{in_t},{out_t},{cost},1,success,\"{escaped_prompt}\",wf_regular,,\"{escaped_meta}\"\n")
            
    print("OpenAI waste-heavy dataset completed.")

def generate_waste_heavy_anthropic(filepath, target_rows=40000):
    print(f"Generating WASTE-HEAVY Anthropic dataset at {filepath}...")
    
    headers = "Date,Model,Input Tokens,Output Tokens,Cache Creation Input Tokens,Cache Read Input Tokens,Total Cost (USD),Request ID,Prompt,Workflow ID,Session ID,Metadata\n"
    
    start_time = datetime(2026, 5, 15, 10, 0, 0)
    current_time = start_time
    
    sys_prompt_hash = "hash_anthropic_c0ffee99b"
    sys_prompt_tokens = 3500
    
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(headers)
        
        print("Generating redundant system prompt records (Anthropic)...")
        for i in range(6000):
            current_time += timedelta(seconds=random.randint(1, 3))
            req_id = f"req_{uuid.uuid4().hex[:12]}"
            # Mix claude-3-5-sonnet and claude-3-7-sonnet
            model = random.choice(["claude-3-5-sonnet-20241022", "claude-3-7-sonnet-20250219"])
            prompt = "Quick helper request to Claude agent"
            user_tokens = random.randint(10, 30)
            out_t = random.randint(10, 50)
            
            meta = {
                "system_prompt_hash": sys_prompt_hash,
            }
            
            if i == 0:
                cache_create = sys_prompt_tokens
                cache_read = 0
                prompt_tokens = user_tokens
                cost = (cache_create * 0.00000375) + (prompt_tokens * 0.000003) + (out_t * 0.000015)
            else:
                cache_create = 0
                cache_read = sys_prompt_tokens
                prompt_tokens = user_tokens
                cost = (cache_read * 0.0000003) + (prompt_tokens * 0.000003) + (out_t * 0.000015)
            
            cost = round(cost, 6)
            escaped_meta = json.dumps(meta).replace('"', '""')
            escaped_prompt = prompt.replace('"', '""')
            
            f.write(f"{current_time.isoformat()}Z,{model},{prompt_tokens},{out_t},{cache_create},{cache_read},{cost},{req_id},\"{escaped_prompt}\",wf_customer_support,,\"{escaped_meta}\"\n")
            
        print("Generating agent runaway loop records (Anthropic)...")
        for loop_idx in range(12):
            wf_id = f"wf_anthropic_loop_{loop_idx}"
            session_id = f"session_anth_loop_{loop_idx}_{uuid.uuid4().hex[:6]}"
            
            in_t = 120
            out_t = 60
            for step in range(8):
                current_time += timedelta(seconds=random.randint(10, 20))
                req_id = f"req_{uuid.uuid4().hex[:12]}"
                model = random.choice(["claude-3-5-sonnet-20241022", "claude-3-7-sonnet-20250219"])
                prompt = f"Anthropic runaway agent step {step}"
                
                cost = (in_t * 0.000003) + (out_t * 0.000015)
                cost = round(cost, 6)
                
                meta = {"session_id": session_id, "request_id": req_id}
                escaped_meta = json.dumps(meta).replace('"', '""')
                escaped_prompt = prompt.replace('"', '""')
                
                f.write(f"{current_time.isoformat()}Z,{model},{in_t},{out_t},0,0,{cost},{req_id},\"{escaped_prompt}\",{wf_id},{session_id},\"{escaped_meta}\"\n")
                
                in_t = int(in_t * 2.1)
                out_t = int(out_t * 1.9)
                
        print("Generating expensive model misuse records & tool bloat (Claude 3 Opus)...")
        for _ in range(15000):
            current_time += timedelta(seconds=random.randint(1, 3))
            req_id = f"req_{uuid.uuid4().hex[:12]}"
            model = "claude-3-opus-20240229"
            prompt = random.choice(["hi", "ping", "test", "Hello", "How is the weather?"])
            in_t = random.randint(6, 14)
            out_t = random.randint(10, 18)
            
            meta = {"source": "simple_task"}
            if random.random() < 0.2:
                in_t += 5000 
                meta["tools_available_count"] = 30
                meta["tool_definitions_tokens"] = 5000
                meta["tool_invocations"] = json.dumps(["hello_world"])
            
            cost = (in_t * 0.000015) + (out_t * 0.000075)
            cost = round(cost, 6)
            
            escaped_meta = json.dumps(meta).replace('"', '""')
            escaped_prompt = prompt.replace('"', '""')
            
            f.write(f"{current_time.isoformat()}Z,{model},{in_t},{out_t},0,0,{cost},{req_id},\"{escaped_prompt}\",wf_simple_check,,\"{escaped_meta}\"\n")
            
        print("Generating Anthropic baseline records...")
        for _ in range(target_rows - 21000 - (12 * 8)):
            current_time += timedelta(seconds=random.randint(1, 8))
            req_id = f"req_{uuid.uuid4().hex[:12]}"
            
            model = random.choices(["claude-3-5-sonnet-20241022", "claude-3-7-sonnet-20250219", "claude-3-5-haiku-20241022"], weights=[0.20, 0.30, 0.50])[0]
            prompt = "Standard helper task prompt"
            in_t = random.randint(200, 800)
            out_t = random.randint(100, 400)
            
            if model == "claude-3-5-haiku-20241022":
                cost = (in_t * 0.0000008) + (out_t * 0.000004)
            else:
                cost = (in_t * 0.000003) + (out_t * 0.000015)
                
            cost = round(cost, 6)
            escaped_prompt = prompt.replace('"', '""')
            
            f.write(f"{current_time.isoformat()}Z,{model},{in_t},{out_t},0,0,{cost},{req_id},\"{escaped_prompt}\",wf_regular,,\"" + "{}" + "\"\n")
            
    print("Anthropic waste-heavy dataset completed.")

def generate_waste_heavy_bedrock(filepath, target_rows=40000):
    print(f"Generating WASTE-HEAVY Bedrock dataset at {filepath}...")
    headers = "Timestamp,InputTokenCount,InvocationLatency,Invocations,OutputTokenCount\n"
    
    start_time = datetime(2026, 5, 15, 10, 0, 0)
    current_time = start_time
    
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(headers)
        
        for _ in range(target_rows):
            current_time += timedelta(seconds=random.randint(1, 5))
            
            # Introduce tool bloat / large inputs for some of them
            if random.random() < 0.2:
                in_t = random.randint(5000, 15000)
                out_t = random.randint(10, 50)
                latency = random.randint(2000, 5000)
                invocations = 1
            else:
                in_t = random.randint(100, 500)
                out_t = random.randint(50, 200)
                latency = random.randint(500, 2000)
                # Bedrock can roll up invocations
                invocations = random.choices([1, 2, 5, 10], weights=[0.8, 0.1, 0.05, 0.05])[0]
                
            f.write(f"{current_time.isoformat()}Z,{in_t},{latency},{invocations},{out_t}\n")

    print("Bedrock waste-heavy dataset completed.")

if __name__ == "__main__":
    generate_waste_heavy_openai("model provider usage data/OpenAI/openai_realistic_large_usage.csv", 45000)
    generate_waste_heavy_anthropic("model provider usage data/Anthropic/anthropic_realistic_large_usage.csv", 45000)
    generate_waste_heavy_bedrock("model provider usage data/Bedrock/bedrock_realistic_large_usage.csv", 20000)
    print("Done! Waste-heavy datasets successfully generated.")
