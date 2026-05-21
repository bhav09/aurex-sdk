import csv
import random
from datetime import datetime, timedelta

def generate_test_data(filename="sample_data/real_world_test_data.csv"):
    # Base prompts representing real-world intents
    base_prompts = [
        ("Write a python script to reverse a string", 10, 40),
        ("Translate 'hello' to French", 6, 5),
        ("Summarize this article: The quick brown fox jumps over the lazy dog.", 15, 20),
        ("What is the capital of France?", 7, 5),
        ("Explain quantum computing like I'm 5", 8, 150),
    ]

    # Semantic bloat (near duplicates for clustering tests)
    semantic_bloat = [
        ("Fix this code: def foo(): return 1/0", 12, 30),
        ("Can you fix this code: def foo(): return 1/0", 14, 30),
        ("Find the bug in this code: def foo(): return 1/0", 14, 30),
        ("Why is this code throwing an error: def foo(): return 1/0", 15, 30),
    ]

    models = ["gpt-4o", "gpt-4-turbo", "gpt-3.5-turbo", "claude-3-opus-20240229", "claude-3-haiku-20240307"]
    
    rows = []
    start_time = datetime.utcnow() - timedelta(days=1)

    # 1. Generate normal varied traffic
    for i in range(50):
        prompt, in_tok, out_tok = random.choice(base_prompts)
        model = random.choice(models)
        timestamp = start_time + timedelta(minutes=i*5)
        rows.append([timestamp.isoformat() + "Z", model, prompt, in_tok, out_tok])

    # 2. Inject "No-Cache" Anti-Pattern (Exact duplicates in a short window)
    # E.g., a script running in a loop asking the exact same thing
    burst_time = start_time + timedelta(hours=2)
    for i in range(20):
        timestamp = burst_time + timedelta(seconds=i*2)
        rows.append([timestamp.isoformat() + "Z", "gpt-4o", "Summarize this article: The quick brown fox jumps over the lazy dog.", 15, 20])

    # 3. Inject "Over-powered Model" Anti-Pattern
    # Using expensive models for trivial tasks
    for i in range(15):
        timestamp = start_time + timedelta(hours=4, minutes=i*10)
        rows.append([timestamp.isoformat() + "Z", "claude-3-opus-20240229", "Translate 'hello' to French", 6, 5])
        
    # 4. Inject "Semantic Bloat" (Near duplicates)
    for i, (prompt, in_tok, out_tok) in enumerate(semantic_bloat):
        timestamp = start_time + timedelta(hours=6, minutes=i*15)
        rows.append([timestamp.isoformat() + "Z", "gpt-4-turbo", prompt, in_tok, out_tok])

    # Sort by timestamp
    rows.sort(key=lambda x: x[0])

    # Write to CSV
    with open(filename, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(["timestamp", "model", "prompt", "input_tokens", "output_tokens"])
        writer.writerows(rows)
        
    print(f"Successfully generated {len(rows)} rows of test data at {filename}")

if __name__ == "__main__":
    import os
    os.makedirs("sample_data", exist_ok=True)
    generate_test_data()
