import csv
import random
import uuid
from datetime import datetime, timedelta
import json
import urllib.request
import os

# Ensure sample_data directory exists
os.makedirs("sample_data", exist_ok=True)

# Common data pools for randomness
SYSTEM_PROMPTS = [
    "You are a helpful assistant.",
    "You are an expert programmer.",
    "You are a friendly customer support agent.",
    "You are a concise data analyst.",
    "You are a creative writer."
]

USER_PROMPTS = [
    "How do I write a loop in Python?",
    "What is the capital of France?",
    "Explain recursion.",
    "Translate 'Hello' to Spanish.",
    "Summarize the plot of Romeo and Juliet.",
    "Write a poem about the sea.",
    "How do I fix a NullPointerException?",
    "What are the benefits of cloud computing?",
    "Give me a recipe for chocolate chip cookies.",
    "Explain quantum computing to a 5 year old."
]

ASSISTANT_RESPONSES = [
    "Here is how you do it: [Code Example]",
    "The capital of France is Paris.",
    "Recursion is when a function calls itself.",
    "Hola.",
    "It's a tragic love story between two young people from feuding families.",
    "The sea is deep and blue, it holds secrets old and new.",
    "Check if the object is null before accessing its methods.",
    "Scalability, cost-effectiveness, and flexibility.",
    "Mix flour, sugar, butter, and chocolate chips. Bake at 350F for 10 mins.",
    "Imagine a magical coin that can be heads and tails at the same time."
]

MODELS = ["gpt-4", "gpt-3.5-turbo", "claude-3-opus", "claude-3-sonnet", "gemini-1.5-pro", "llama-3-70b"]
ENVIRONMENTS = ["production", "staging", "development"]
STATUSES = ["success", "success", "success", "success", "error"] # 80% success rate
ERROR_MESSAGES = ["", "", "", "", "Connection timeout", "Rate limit exceeded", "Invalid API key"]

def generate_openai_finetuning(num_rows=50000):
    print(f"Generating OpenAI Fine-tuning data ({num_rows} rows)...")
    with open('sample_data/openai_finetuning.csv', 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['system', 'user', 'assistant'])
        for _ in range(num_rows):
            writer.writerow([
                random.choice(SYSTEM_PROMPTS),
                random.choice(USER_PROMPTS) + f" (ID: {random.randint(1, 10000)})",
                random.choice(ASSISTANT_RESPONSES)
            ])

def generate_gemini_finetuning(num_rows=50000):
    print(f"Generating Gemini Fine-tuning data ({num_rows} rows)...")
    with open('sample_data/gemini_finetuning.csv', 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['input_text', 'output_text'])
        for _ in range(num_rows):
            writer.writerow([
                random.choice(USER_PROMPTS) + f" (Context: {random.choice(['urgent', 'normal', 'low priority'])})",
                random.choice(ASSISTANT_RESPONSES)
            ])

def generate_vertex_classification(num_rows=50000):
    print(f"Generating Vertex AI Classification data ({num_rows} rows)...")
    labels = ["positive", "negative", "neutral"]
    texts = [
        "The movie was absolutely fantastic!",
        "Terrible customer service.",
        "The product arrived on time.",
        "I will never buy from this store again.",
        "Highly recommended, great quality!",
        "It was okay, nothing special.",
        "Worst experience ever.",
        "Loved the new update.",
        "Needs improvement in the UI.",
        "Five stars!"
    ]
    with open('sample_data/vertex_ai_classification.csv', 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['text', 'label'])
        for _ in range(num_rows):
            text = random.choice(texts)
            # Assign somewhat logical labels based on text for realism, with some noise
            if "fantastic" in text or "recommended" in text or "Loved" in text or "stars" in text:
                label = random.choices(["positive", "neutral"], weights=[0.9, 0.1])[0]
            elif "Terrible" in text or "never" in text or "Worst" in text:
                label = random.choices(["negative", "neutral"], weights=[0.9, 0.1])[0]
            else:
                label = random.choice(labels)
                
            writer.writerow([
                text + f" [User: {random.randint(1000, 9999)}]",
                label
            ])

def generate_langfuse_export(num_rows=50000):
    print(f"Generating Langfuse Export data ({num_rows} rows)...")
    start_date = datetime(2023, 1, 1)
    with open('sample_data/langfuse_export.csv', 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['id', 'trace_id', 'project_id', 'environment', 'type', 'parent_observation_id', 
                         'start_time', 'end_time', 'name', 'metadata', 'level', 'status_message', 
                         'version', 'input', 'output', 'provided_model_name'])
        
        for i in range(num_rows):
            trace_id = f"tr-{uuid.uuid4()}"
            obs_id = f"obs-{uuid.uuid4()}"
            time_offset = timedelta(minutes=random.randint(0, 500000))
            current_time = start_date + time_offset
            duration = timedelta(seconds=random.uniform(0.5, 15.0))
            end_time = current_time + duration
            
            status = random.choice(STATUSES)
            msg = "success" if status == "success" else random.choice([e for e in ERROR_MESSAGES if e])
            
            writer.writerow([
                obs_id,
                trace_id,
                f"proj-{random.randint(1, 5)}",
                random.choice(ENVIRONMENTS),
                random.choice(["generation", "span", "event"]),
                "", # parent_observation_id
                current_time.isoformat() + "Z",
                end_time.isoformat() + "Z",
                random.choice(["chat_completion", "summarize_doc", "extract_entities", "rag_query"]),
                json.dumps({"cost": round(random.uniform(0.001, 0.05), 4), "tokens": random.randint(50, 1000)}),
                "DEFAULT",
                msg,
                f"1.{random.randint(0, 5)}",
                random.choice(USER_PROMPTS),
                random.choice(ASSISTANT_RESPONSES) if status == "success" else "",
                random.choice(MODELS)
            ])

def generate_langsmith_export(num_rows=50000):
    print(f"Generating LangSmith Export data ({num_rows} rows)...")
    start_date = datetime(2023, 1, 1)
    with open('sample_data/langsmith_export.csv', 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['run_id', 'name', 'run_type', 'start_time', 'end_time', 'status', 'inputs', 'outputs', 'error'])
        
        for i in range(num_rows):
            run_id = f"run-{uuid.uuid4()}"
            time_offset = timedelta(minutes=random.randint(0, 500000))
            current_time = start_date + time_offset
            duration = timedelta(seconds=random.uniform(0.1, 20.0))
            end_time = current_time + duration
            
            status = random.choice(STATUSES)
            error_msg = "" if status == "success" else random.choice([e for e in ERROR_MESSAGES if e])
            
            writer.writerow([
                run_id,
                random.choice(["LLMChain", "OpenAI", "RetrievalQA", "ChatAnthropic", "AgentExecutor"]),
                random.choice(["chain", "llm", "tool", "agent"]),
                current_time.isoformat() + "Z",
                end_time.isoformat() + "Z",
                status,
                json.dumps({"input": random.choice(USER_PROMPTS)}),
                json.dumps({"output": random.choice(ASSISTANT_RESPONSES)}) if status == "success" else "",
                error_msg
            ])

if __name__ == "__main__":
    NUM_ROWS = 50000
    generate_openai_finetuning(NUM_ROWS)
    generate_gemini_finetuning(NUM_ROWS)
    generate_vertex_classification(NUM_ROWS)
    generate_langfuse_export(NUM_ROWS)
    generate_langsmith_export(NUM_ROWS)
    print("All data generation complete!")
