import csv
import random
import os
from datetime import datetime, timedelta

output_file = "synthetic_edge_cases_15mb.csv"
target_size_mb = 14
target_size_bytes = target_size_mb * 1024 * 1024

current_time = datetime(2026, 5, 21, 10, 0, 0)

def advance_time(minutes=0, seconds=1):
    global current_time
    current_time += timedelta(minutes=minutes, seconds=seconds)
    return current_time.strftime("%Y-%m-%dT%H:%M:%S.%fZ")

header = ["Date", "User", "Cloud Agent ID", "Automation ID", "Kind", "Model", "Max Mode", "Input (w/ Cache Write)", "Input (w/o Cache Write)", "Cache Read", "Output Tokens", "Total Tokens", "Requests"]

user = "test.founder@startup.com"
normal_models = ["gpt-4o-mini", "gemini-1.5-flash", "claude-3-haiku-20240307"]
expensive_models = ["gpt-4o", "claude-3-opus-20240229", "gemini-1.5-pro"]

def generate_edge_cases():
    edge_rows = []
    
    # Edge Case 1: Runaway Loop
    context = 100
    for _ in range(12):
        date = advance_time(seconds=30)
        edge_rows.append([date, user, "", "", "On-Demand", "gemini-3.5-flash", "No", 0, context, 0, 50, context + 50, 1])
        context = int(context * 1.9)
        
    # Edge Case 2: Redundant System Prompts
    for _ in range(15):
        date = advance_time(seconds=15)
        edge_rows.append([date, user, "", "", "On-Demand", "gpt-4o", "No", 0, 8540, 0, 15, 8555, 1])
        
    # Edge Case 3: Expensive Model Misuse
    for _ in range(8):
        date = advance_time(minutes=1)
        edge_rows.append([date, user, "", f"workflow_expensive_{random.randint(1, 100)}", "On-Demand", "claude-3-opus-20240229", "No", 0, 500, 0, 5, 505, 1])
        
    # Edge Case 4: Malformed Date / Missing Date
    edge_rows.append(["", user, "", "", "On-Demand", "gpt-3.5-turbo", "No", 0, 10, 0, 10, 20, 1])
    edge_rows.append(["NOT-A-DATE", user, "", "", "On-Demand", "gpt-3.5-turbo", "No", 0, 10, 0, 10, 20, 1])
    
    # Edge Case 5: Negative Tokens
    date = advance_time(seconds=10)
    edge_rows.append([date, user, "", "", "On-Demand", "gpt-4o", "No", 0, -500, 0, -10, -510, 1])
    
    return edge_rows

def generate_normal_row():
    date = advance_time(seconds=random.randint(1, 10))
    model = random.choice(normal_models)
    in_tok = random.randint(100, 2000)
    out_tok = random.randint(50, 500)
    return [date, user, "", f"normal_wf_{random.randint(1, 100)}", "On-Demand", model, "No", 0, in_tok, 0, out_tok, in_tok + out_tok, 1]

with open(output_file, 'w', newline='') as f:
    writer = csv.writer(f, quoting=csv.QUOTE_MINIMAL)
    writer.writerow(header)
    
    bytes_written = 0
    row_count = 0
    
    while bytes_written < target_size_bytes:
        batch = []
        if random.random() < 0.05:
            batch.extend(generate_edge_cases())
        else:
            for _ in range(500):
                batch.append(generate_normal_row())
                
        writer.writerows(batch)
        row_count += len(batch)
        f.flush()
        bytes_written = os.path.getsize(output_file)

print(f"Generated {row_count} synthetic events in {output_file}. File size: {bytes_written / (1024*1024):.2f} MB")
