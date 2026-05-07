import csv
import json
import uuid
import random
from datetime import datetime, timedelta
from datasets import load_dataset

NUM_ROWS = 50000
CSV_KWARGS = {'newline': '', 'encoding': 'utf-8', 'quoting': csv.QUOTE_MINIMAL}

print("Loading WildChat dataset (streaming)...")
# WildChat contains real ChatGPT conversations
wildchat = load_dataset("allenai/WildChat-1M", split="train", streaming=True)

print("Loading IMDB dataset (streaming)...")
# IMDB contains real movie reviews for classification
imdb = load_dataset("imdb", split="train+test", streaming=True)

# Open all files
f_openai = open('sample_data/openai_finetuning.csv', 'w', **CSV_KWARGS)
f_gemini = open('sample_data/gemini_finetuning.csv', 'w', **CSV_KWARGS)
f_langfuse = open('sample_data/langfuse_export.csv', 'w', **CSV_KWARGS)
f_langsmith = open('sample_data/langsmith_export.csv', 'w', **CSV_KWARGS)
f_vertex = open('sample_data/vertex_ai_classification.csv', 'w', **CSV_KWARGS)

w_openai = csv.writer(f_openai)
w_gemini = csv.writer(f_gemini)
w_langfuse = csv.writer(f_langfuse)
w_langsmith = csv.writer(f_langsmith)
w_vertex = csv.writer(f_vertex)

# Write headers
w_openai.writerow(['system', 'user', 'assistant'])
w_gemini.writerow(['input_text', 'output_text'])
w_langfuse.writerow(['id', 'trace_id', 'project_id', 'environment', 'type', 'parent_observation_id', 
                     'start_time', 'end_time', 'name', 'metadata', 'level', 'status_message', 
                     'version', 'input', 'output', 'provided_model_name'])
w_langsmith.writerow(['run_id', 'name', 'run_type', 'start_time', 'end_time', 'status', 'inputs', 'outputs', 'error'])
w_vertex.writerow(['text', 'label'])

# Process WildChat
print("Processing WildChat for OpenAI, Gemini, Langfuse, LangSmith...")
count = 0
for row in wildchat:
    if count >= NUM_ROWS:
        break
        
    conv = row.get('conversation', [])
    if not conv or len(conv) < 2:
        continue
        
    # Extract first user message and first assistant message
    user_msg = ""
    assistant_msg = ""
    for msg in conv:
        if msg['role'] == 'user' and not user_msg:
            user_msg = msg['content']
        elif msg['role'] == 'assistant' and not assistant_msg:
            assistant_msg = msg['content']
            
    if not user_msg or not assistant_msg:
        continue
        
    # Truncate extremely long messages to keep CSV manageable
    user_msg = user_msg[:3000]
    assistant_msg = assistant_msg[:3000]
        
    model = row.get('model', 'gpt-3.5-turbo')
    timestamp_str = row.get('timestamp')
    try:
        if timestamp_str:
            start_time = datetime.fromisoformat(timestamp_str.replace('Z', '+00:00')).replace(tzinfo=None)
        else:
            start_time = datetime.utcnow()
    except:
        start_time = datetime.utcnow()
        
    # Add realistic latency based on response length
    latency = random.uniform(0.5, 3.0) + (len(assistant_msg) / 150.0)
    end_time = start_time + timedelta(seconds=latency)
    
    # OpenAI
    w_openai.writerow(["You are a helpful AI assistant.", user_msg, assistant_msg])
    
    # Gemini
    w_gemini.writerow([user_msg, assistant_msg])
    
    # Langfuse
    trace_id = f"tr-{uuid.uuid4()}"
    obs_id = f"obs-{uuid.uuid4()}"
    tokens = int(len(user_msg + assistant_msg) / 4)
    w_langfuse.writerow([
        obs_id, trace_id, "proj-wildchat", "production", "generation", "",
        start_time.isoformat() + "Z", end_time.isoformat() + "Z",
        "chat_completion", json.dumps({"tokens": tokens}), "DEFAULT", "success",
        "1.0", user_msg, assistant_msg, model
    ])
    
    # LangSmith
    run_id = f"run-{uuid.uuid4()}"
    w_langsmith.writerow([
        run_id, "LLMChain", "chain",
        start_time.isoformat() + "Z", end_time.isoformat() + "Z",
        "success", json.dumps({"input": user_msg}), json.dumps({"output": assistant_msg}), ""
    ])
    
    count += 1
    if count % 5000 == 0:
        print(f"Processed {count} WildChat rows...")

# Process IMDB for Vertex
print("Processing IMDB for Vertex AI...")
count = 0
for row in imdb:
    if count >= NUM_ROWS:
        break
    text = row['text'][:2000] # Truncate extremely long reviews
    label = "positive" if row['label'] == 1 else "negative"
    w_vertex.writerow([text, label])
    count += 1
    if count % 5000 == 0:
        print(f"Processed {count} IMDB rows...")

f_openai.close()
f_gemini.close()
f_langfuse.close()
f_langsmith.close()
f_vertex.close()
print("Done! Real-world datasets successfully generated.")
