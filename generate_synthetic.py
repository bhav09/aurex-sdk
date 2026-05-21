import csv
import random
from datetime import datetime, timedelta

output_file = "synthetic_edge_cases.csv"

current_time = datetime(2026, 5, 21, 10, 0, 0)

def advance_time(minutes=1, seconds=0):
    global current_time
    current_time += timedelta(minutes=minutes, seconds=seconds)
    return current_time.strftime("%Y-%m-%dT%H:%M:%S.%fZ")

rows = []
rows.append(["Date", "User", "Cloud Agent ID", "Automation ID", "Kind", "Model", "Max Mode", "Input (w/ Cache Write)", "Input (w/o Cache Write)", "Cache Read", "Output Tokens", "Total Tokens", "Requests"])

def add_row(date, user, agent_id, auto_id, kind, model, max_mode, in_cw, in_wo_cw, cache_read, out_tok, total_tok, reqs):
    rows.append([date, user, agent_id, auto_id, kind, model, max_mode, str(in_cw), str(in_wo_cw), str(cache_read), str(out_tok), str(total_tok), str(reqs)])

user = "test.founder@startup.com"

# Edge Case 1: Extreme Runaway Loop (No Automation ID)
context = 100
for i in range(12):
    date = advance_time(minutes=0, seconds=30)
    add_row(date, user, "", "", "On-Demand", "gemini-3.5-flash", "No", 0, context, 0, 50, context + 50, 1)
    context = int(context * 1.9)

# Edge Case 2: Redundant System Prompts (Exact match)
advance_time(minutes=10)
for i in range(15):
    date = advance_time(minutes=0, seconds=15)
    add_row(date, user, "", "", "On-Demand", "gpt-4o", "No", 0, 8540, 0, 15, 8555, 1)

# Edge Case 3: Expensive Model Misuse (Tiny outputs)
advance_time(minutes=5)
for i in range(8):
    date = advance_time(minutes=1)
    add_row(date, user, "", "workflow_expensive", "On-Demand", "claude-3-opus-20240229", "No", 0, 500, 0, 5, 505, 1)

# Edge Case 4: Missing Date entirely
add_row("", user, "", "", "On-Demand", "gpt-3.5-turbo", "No", 0, 10, 0, 10, 20, 1)

# Edge Case 5: Malformed Date
add_row("NOT-A-DATE", user, "", "", "On-Demand", "gpt-3.5-turbo", "No", 0, 10, 0, 10, 20, 1)

# Edge Case 6: Negative Tokens
date = advance_time(minutes=1)
add_row(date, user, "", "", "On-Demand", "gpt-4o", "No", 0, -500, 0, -10, -510, 1)

# Edge Case 7: Unknown/Empty model
date = advance_time(minutes=1)
add_row(date, user, "", "", "On-Demand", "", "No", 0, 100, 0, 100, 200, 1)

# Edge Case 8: Huge number of requests in single row (batch)
date = advance_time(minutes=1)
add_row(date, user, "", "batch_job_1", "Batch", "gemini-1.5-pro", "No", 0, 50000, 0, 10000, 60000, 5000)

with open(output_file, 'w', newline='') as f:
    writer = csv.writer(f, quoting=csv.QUOTE_MINIMAL)
    writer.writerows(rows)

print(f"Generated {len(rows)-1} synthetic events in {output_file}")
