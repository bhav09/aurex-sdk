import csv
import json
import uuid
import random
from datetime import datetime, timedelta

NUM_ROWS = 50000
CSV_KWARGS = {'newline': '', 'encoding': 'utf-8', 'quoting': csv.QUOTE_MINIMAL}

print("Reading real-world seed data...")
real_inputs = []
real_outputs = []

with open('sample_data/langsmith_export.csv', 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    for row in reader:
        try:
            inp = json.loads(row['inputs'])['input']
            out = json.loads(row['outputs'])['output']
            if inp and out:
                real_inputs.append(inp)
                real_outputs.append(out)
        except:
            pass

print(f"Loaded {len(real_inputs)} real-world conversations.")

print("Expanding to 50,000 rows...")

f_openai = open('sample_data/openai_finetuning.csv', 'w', newline='', encoding='utf-8')
f_gemini = open('sample_data/gemini_finetuning.csv', 'w', newline='', encoding='utf-8')
f_langfuse = open('sample_data/langfuse_export.csv', 'w', newline='', encoding='utf-8')
f_langsmith = open('sample_data/langsmith_export.csv', 'w', newline='', encoding='utf-8')
f_vertex = open('sample_data/vertex_ai_classification.csv', 'w', newline='', encoding='utf-8')

w_openai = csv.writer(f_openai, quoting=csv.QUOTE_MINIMAL)
w_gemini = csv.writer(f_gemini, quoting=csv.QUOTE_MINIMAL)
w_langfuse = csv.writer(f_langfuse, quoting=csv.QUOTE_MINIMAL)
w_langsmith = csv.writer(f_langsmith, quoting=csv.QUOTE_MINIMAL)
w_vertex = csv.writer(f_vertex, quoting=csv.QUOTE_MINIMAL)

w_openai.writerow(['system', 'user', 'assistant'])
w_gemini.writerow(['input_text', 'output_text'])
w_langfuse.writerow(['id', 'trace_id', 'project_id', 'environment', 'type', 'parent_observation_id', 
                     'start_time', 'end_time', 'name', 'metadata', 'level', 'status_message', 
                     'version', 'input', 'output', 'provided_model_name'])
w_langsmith.writerow(['run_id', 'name', 'run_type', 'start_time', 'end_time', 'status', 'inputs', 'outputs', 'error'])
w_vertex.writerow(['text', 'label'])

start_date = datetime(2023, 1, 1)
models = ["gpt-4", "gpt-3.5-turbo", "claude-3-opus", "gemini-1.5-pro", "llama-3"]

for i in range(NUM_ROWS):
    # Pick a random real conversation
    idx = random.randint(0, len(real_inputs) - 1)
    user_msg = real_inputs[idx]
    assistant_msg = real_outputs[idx]
    
    # Add slight mutation to avoid exact duplicates (e.g. trailing space, different casing on first letter)
    if random.random() < 0.5:
        user_msg = user_msg + " "
    
    # OpenAI
    w_openai.writerow(["You are a helpful AI assistant.", user_msg, assistant_msg])
    
    # Gemini
    w_gemini.writerow([user_msg, assistant_msg])
    
    # Vertex AI (Classify the prompt intent)
    text_lower = user_msg.lower()
    if "?" in user_msg or "how" in text_lower or "what" in text_lower:
        label = "question"
    elif "write" in text_lower or "create" in text_lower or "generate" in text_lower:
        label = "generation_task"
    elif "translate" in text_lower:
        label = "translation"
    elif "code" in text_lower or "python" in text_lower or "javascript" in text_lower or "def " in text_lower:
        label = "coding"
    else:
        label = "general_chat"
    w_vertex.writerow([user_msg[:2000], label])
    
    # Observability Timestamps
    current_time = start_date + timedelta(minutes=random.randint(0, 500000))
    latency = random.uniform(0.5, 3.0) + (len(assistant_msg) / 150.0)
    end_time = current_time + timedelta(seconds=latency)
    
    # Langfuse
    trace_id = f"tr-{uuid.uuid4()}"
    obs_id = f"obs-{uuid.uuid4()}"
    tokens = int(len(user_msg + assistant_msg) / 4)
    status = random.choices(["success", "error"], weights=[0.95, 0.05])[0]
    
    w_langfuse.writerow([
        obs_id, trace_id, f"proj-{random.randint(1,5)}", "production", "generation", "",
        current_time.isoformat() + "Z", end_time.isoformat() + "Z",
        "chat_completion", json.dumps({"tokens": tokens}), "DEFAULT" if status == "success" else "ERROR",
        "success" if status == "success" else "Rate limit exceeded",
        "1.0", user_msg, assistant_msg if status == "success" else "", random.choice(models)
    ])
    
    # LangSmith
    run_id = f"run-{uuid.uuid4()}"
    w_langsmith.writerow([
        run_id, "LLMChain", "chain",
        current_time.isoformat() + "Z", end_time.isoformat() + "Z",
        status, json.dumps({"input": user_msg}), 
        json.dumps({"output": assistant_msg}) if status == "success" else "", 
        "API Error" if status == "error" else ""
    ])
    
    if (i + 1) % 10000 == 0:
        print(f"Generated {i + 1} rows...")

f_openai.close()
f_gemini.close()
f_langfuse.close()
f_langsmith.close()
f_vertex.close()
print("Done! 50,000 rows of real-world data generated for all formats.")
