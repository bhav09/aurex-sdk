import csv
import random
import uuid
import json
from datetime import datetime, timedelta
import os
import re

os.makedirs("sample_data", exist_ok=True)

# --- LLM-Generated Rich Seed Data ---
# To avoid a 10-hour runtime and massive API costs for 250,000 rows, 
# we use a rich set of base components and programmatically mutate them.

TOPICS = [
    "Python loop", "React useEffect", "database migration", "password reset", 
    "billing issue", "API rate limit", "Docker container", "CSS flexbox",
    "Kubernetes deployment", "machine learning model", "financial report",
    "marketing copy", "sales email", "resume formatting", "translation to French"
]

INTENTS = [
    "How do I fix", "Can you explain", "Please write a script for", 
    "I need help with", "Why is my", "What is the best way to", 
    "Summarize this", "Translate this", "Debug my"
]

CONTEXTS = [
    "I'm a beginner.", "This is for production.", "It needs to be highly optimized.",
    "I keep getting a 500 error.", "My boss needs this by tomorrow.", 
    "I've been stuck on this for hours.", "Make it sound professional.",
    "Keep it under 100 words.", ""
]

FILLERS = [
    "Umm,", "Hey there,", "Hi AI,", "Quick question:", "Pls help,", 
    "I was wondering if", "So basically,", "Urgent:"
]

# Keyboard layout for realistic typos
QWERTY_ADJACENT = {
    'a': 'qwsz', 'b': 'vghn', 'c': 'xdfv', 'd': 'sfcx', 'e': 'wsdr',
    'f': 'rtgvcd', 'g': 'tyhbvf', 'h': 'yujnbg', 'i': 'ujko', 'j': 'uikmhn',
    'k': 'jiolm', 'l': 'kop', 'm': 'njk', 'n': 'bhjm', 'o': 'iklp',
    'p': 'ol', 'q': 'wa', 'r': 'edft', 's': 'awedxz', 't': 'rfgy',
    'u': 'yhij', 'v': 'cfgb', 'w': 'qase', 'x': 'zsdc', 'y': 'tghu', 'z': 'asx'
}

def introduce_typos(text, severity=0.1):
    """Introduces realistic keyboard typos, missing chars, and case errors."""
    if random.random() > severity:
        return text
        
    chars = list(text)
    num_errors = max(1, int(len(chars) * random.uniform(0.01, 0.05)))
    
    for _ in range(num_errors):
        if not chars: break
        idx = random.randint(0, len(chars) - 1)
        char = chars[idx].lower()
        
        error_type = random.choice(['swap', 'drop', 'adjacent', 'case'])
        
        if error_type == 'swap' and idx < len(chars) - 1:
            chars[idx], chars[idx+1] = chars[idx+1], chars[idx]
        elif error_type == 'drop':
            chars.pop(idx)
        elif error_type == 'adjacent' and char in QWERTY_ADJACENT:
            chars[idx] = random.choice(QWERTY_ADJACENT[char])
        elif error_type == 'case':
            chars[idx] = chars[idx].upper() if chars[idx].islower() else chars[idx].lower()
            
    return "".join(chars)

def introduce_grammar_errors(text, severity=0.15):
    """Introduces common grammatical mistakes."""
    if random.random() > severity:
        return text
        
    replacements = {
        r'\byour\b': "you're", r"\byou're\b": "your",
        r'\btheir\b': "there", r'\bthere\b': "their",
        r'\bits\b': "it's", r"\bit's\b": "its",
        r'\bthe\b ': "", r'\ba\b ': "", # Drop articles
        r'\bis\b': "are", r'\bare\b': "is"
    }
    
    for pattern, replacement in replacements.items():
        if random.random() < 0.3: # 30% chance to apply this specific error if it exists
            text = re.sub(pattern, replacement, text, flags=re.IGNORECASE)
            
    return text

def generate_prompt():
    """Generates a prompt with varying length, tone, and potential errors."""
    length_type = random.choices(['short', 'medium', 'long'], weights=[0.2, 0.6, 0.2])[0]
    
    if length_type == 'short':
        base = f"{random.choice(INTENTS)} {random.choice(TOPICS)}"
    elif length_type == 'medium':
        base = f"{random.choice(FILLERS)} {random.choice(INTENTS)} {random.choice(TOPICS)}? {random.choice(CONTEXTS)}"
    else:
        base = f"{random.choice(FILLERS)} {random.choice(INTENTS)} {random.choice(TOPICS)}. "
        base += f"{random.choice(CONTEXTS)} I have tried looking at the docs but I am still confused. "
        base += f"Can you provide a detailed example? Thanks in advance!"
        
    # Apply mutations
    base = introduce_grammar_errors(base, severity=0.2)
    base = introduce_typos(base, severity=0.15)
    
    # Sometimes remove punctuation or make it all lowercase
    if random.random() < 0.1:
        base = base.lower().replace("?", "").replace(".", "")
        
    return base.strip()

def generate_response(prompt):
    """Generates a realistic response based on prompt length/complexity."""
    if len(prompt) < 30:
        return "Here is a brief answer to your question. Let me know if you need more details."
    elif "code" in prompt.lower() or "script" in prompt.lower() or "python" in prompt.lower():
        return "Certainly! Here is the code snippet you requested:\n```\n# Example code\ndef solution():\n    pass\n```\nHope this helps!"
    else:
        return "I understand you need help with this. Based on your context, here is a detailed breakdown of the solution. First, ensure your environment is set up correctly. Second, apply the following changes..."

def generate_vertex_review():
    """Generates realistic classification data (e.g., reviews) with noise."""
    sentiment = random.choice(["positive", "negative", "neutral"])
    
    if sentiment == "positive":
        templates = ["Absolutely loved it!", "Great experience, highly recommend.", "Works perfectly for my needs.", "Five stars, no complaints."]
    elif sentiment == "negative":
        templates = ["Terrible, broke after one day.", "Customer service was awful.", "Do not buy this.", "Waste of money and time."]
    else:
        templates = ["It's okay, nothing special.", "Does the job but could be better.", "Average quality for the price.", "Arrived fine, standard product."]
        
    base = random.choice(templates)
    
    # Add rambling
    if random.random() < 0.3:
        base += " " + random.choice(["I bought this last week.", "My friend told me about it.", "I was expecting something different."])
        
    base = introduce_typos(base, severity=0.2)
    base = introduce_grammar_errors(base, severity=0.2)
    
    if random.random() < 0.1:
        base = base.upper() # Angry/Excited caps
        
    return base, sentiment

# --- File Generators ---

def generate_openai(num_rows):
    print(f"Generating OpenAI data ({num_rows} rows)...")
    with open('sample_data/openai_finetuning.csv', 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['system', 'user', 'assistant'])
        for _ in range(num_rows):
            system = random.choice(["You are a helpful AI.", "You are a coding expert.", "You are a concise assistant."])
            prompt = generate_prompt()
            writer.writerow([system, prompt, generate_response(prompt)])

def generate_gemini(num_rows):
    print(f"Generating Gemini data ({num_rows} rows)...")
    with open('sample_data/gemini_finetuning.csv', 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['input_text', 'output_text'])
        for _ in range(num_rows):
            prompt = generate_prompt()
            writer.writerow([prompt, generate_response(prompt)])

def generate_vertex(num_rows):
    print(f"Generating Vertex AI data ({num_rows} rows)...")
    with open('sample_data/vertex_ai_classification.csv', 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['text', 'label'])
        for _ in range(num_rows):
            text, label = generate_vertex_review()
            writer.writerow([text, label])

def generate_langfuse(num_rows):
    print(f"Generating Langfuse data ({num_rows} rows)...")
    start_date = datetime(2023, 1, 1)
    models = ["gpt-4-turbo", "gpt-3.5-turbo", "claude-3-opus", "gemini-1.5-pro", "llama-3"]
    
    with open('sample_data/langfuse_export.csv', 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['id', 'trace_id', 'project_id', 'environment', 'type', 'parent_observation_id', 
                         'start_time', 'end_time', 'name', 'metadata', 'level', 'status_message', 
                         'version', 'input', 'output', 'provided_model_name'])
        
        for _ in range(num_rows):
            prompt = generate_prompt()
            response = generate_response(prompt)
            
            # Correlate latency and tokens with text length
            prompt_len = len(prompt)
            latency = random.uniform(0.5, 2.0) + (prompt_len / 100)
            tokens = int(prompt_len / 4) + random.randint(10, 50)
            
            current_time = start_date + timedelta(minutes=random.randint(0, 500000))
            end_time = current_time + timedelta(seconds=latency)
            
            status = random.choices(["success", "error"], weights=[0.9, 0.1])[0]
            
            writer.writerow([
                f"obs-{uuid.uuid4()}", f"tr-{uuid.uuid4()}", f"proj-{random.randint(1,3)}",
                random.choice(["production", "staging", "development"]),
                "generation", "",
                current_time.isoformat() + "Z", end_time.isoformat() + "Z",
                random.choice(["chat", "completion", "agent_step"]),
                json.dumps({"tokens": tokens, "cost": round(tokens * 0.00001, 5)}),
                "DEFAULT" if status == "success" else "ERROR",
                "success" if status == "success" else random.choice(["Rate limit", "Timeout", "Context length exceeded"]),
                "1.0", prompt, response if status == "success" else "",
                random.choice(models)
            ])

def generate_langsmith(num_rows):
    print(f"Generating LangSmith data ({num_rows} rows)...")
    start_date = datetime(2023, 1, 1)
    
    with open('sample_data/langsmith_export.csv', 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['run_id', 'name', 'run_type', 'start_time', 'end_time', 'status', 'inputs', 'outputs', 'error'])
        
        for _ in range(num_rows):
            prompt = generate_prompt()
            response = generate_response(prompt)
            
            latency = random.uniform(0.2, 5.0)
            current_time = start_date + timedelta(minutes=random.randint(0, 500000))
            end_time = current_time + timedelta(seconds=latency)
            
            status = random.choices(["success", "error"], weights=[0.85, 0.15])[0]
            
            writer.writerow([
                f"run-{uuid.uuid4()}",
                random.choice(["LLMChain", "AgentExecutor", "RetrievalQA"]),
                random.choice(["chain", "llm"]),
                current_time.isoformat() + "Z", end_time.isoformat() + "Z",
                status,
                json.dumps({"input": prompt}),
                json.dumps({"output": response}) if status == "success" else "",
                random.choice(["API Error", "Timeout"]) if status == "error" else ""
            ])

if __name__ == "__main__":
    NUM_ROWS = 50000
    generate_openai(NUM_ROWS)
    generate_gemini(NUM_ROWS)
    generate_vertex(NUM_ROWS)
    generate_langfuse(NUM_ROWS)
    generate_langsmith(NUM_ROWS)
    print("All realistic data generation complete!")
