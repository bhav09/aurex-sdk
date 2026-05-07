import urllib.request
import json
import csv
import uuid
import random
from datetime import datetime, timedelta
import time

NUM_ROWS = 50000
BATCH_SIZE = 100

def fetch_hf_rows(dataset, split, offset, length):
    url = f"https://datasets-server.huggingface.co/rows?dataset={dataset}&config=default&split={split}&offset={offset}&length={length}"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    max_retries = 3
    for _ in range(max_retries):
        try:
            with urllib.request.urlopen(req, timeout=10) as response:
                data = json.loads(response.read().decode('utf-8'))
                return [row['row'] for row in data['rows']]
        except Exception as e:
            print(f"Error fetching {dataset} offset {offset}: {e}. Retrying...")
            time.sleep(2)
    return []

print("Starting real-world dataset generation via HF API...")

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

# Process WildChat
print("Fetching and processing WildChat-1M...")
count = 0
offset = 0
while count < NUM_ROWS:
    rows = fetch_hf_rows("allenai/WildChat-1M", "train", offset, BATCH_SIZE)
    if not rows:
        break
        
    for row in rows:
        if count >= NUM_ROWS: break
        
        conv = row.get('conversation', [])
        if not conv or len(conv) < 2: continue
            
        user_msg = ""
        assistant_msg = ""
        for msg in conv:
            if msg['role'] == 'user' and not user_msg:
                user_msg = msg['content']
            elif msg['role'] == 'assistant' and not assistant_msg:
                assistant_msg = msg['content']
                
        if not user_msg or not assistant_msg: continue
            
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
            
        latency = random.uniform(0.5, 3.0) + (len(assistant_msg) / 150.0)
        end_time = start_time + timedelta(seconds=latency)
        
        w_openai.writerow(["You are a helpful AI assistant.", user_msg, assistant_msg])
        w_gemini.writerow([user_msg, assistant_msg])
        
        trace_id = f"tr-{uuid.uuid4()}"
        obs_id = f"obs-{uuid.uuid4()}"
        tokens = int(len(user_msg + assistant_msg) / 4)
        w_langfuse.writerow([
            obs_id, trace_id, "proj-wildchat", "production", "generation", "",
            start_time.isoformat() + "Z", end_time.isoformat() + "Z",
            "chat_completion", json.dumps({"tokens": tokens}), "DEFAULT", "success",
            "1.0", user_msg, assistant_msg, model
        ])
        
        run_id = f"run-{uuid.uuid4()}"
        w_langsmith.writerow([
            run_id, "LLMChain", "chain",
            start_time.isoformat() + "Z", end_time.isoformat() + "Z",
            "success", json.dumps({"input": user_msg}), json.dumps({"output": assistant_msg}), ""
        ])
        
        count += 1
        
    offset += BATCH_SIZE
    if count % 1000 == 0:
        print(f"Processed {count} WildChat rows...")

# Process IMDB
print("Fetching and processing IMDB...")
count = 0
offset = 0
while count < NUM_ROWS:
    rows = fetch_hf_rows("imdb", "unsupervised", offset, BATCH_SIZE)
    if not rows:
        break
        
    for row in rows:
        if count >= NUM_ROWS: break
        text = row['text'][:2000]
        label = "positive" if "good" in text.lower() or "great" in text.lower() or "excellent" in text.lower() else "negative"
        w_vertex.writerow([text, label])
        count += 1
        
    offset += BATCH_SIZE
    if count % 1000 == 0:
        print(f"Processed {count} IMDB rows...")

f_openai.close()
f_gemini.close()
f_langfuse.close()
f_langsmith.close()
f_vertex.close()
print("Done! Real-world datasets successfully generated.")
