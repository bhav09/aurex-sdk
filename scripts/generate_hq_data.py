import csv
import random
import uuid
import json
from datetime import datetime, timedelta
import os
import re

os.makedirs("sample_data", exist_ok=True)

# --- High Quality Seed Data ---

TOPIC_MAPPING = {
    "Python loop": "python",
    "pandas dataframe": "python",
    "FastAPI routing": "python",
    "React useEffect": "react",
    "React state management": "react",
    "Next.js routing": "react",
    "database migration": "sql",
    "SQL inner join": "sql",
    "Postgres indexing": "sql",
    "Docker container": "bash",
    "bash script for backups": "bash",
    "Kubernetes deployment": "yaml",
    "CSS flexbox": "css",
    "CSS grid layout": "css",
    "Tailwind configuration": "javascript",
    "Node.js express server": "javascript",
    "Promise.all usage": "javascript",
    "TypeScript interfaces": "typescript",
    "Go goroutines": "go",
    "Rust channels": "rust"
}

TOPICS = list(TOPIC_MAPPING.keys()) + [
    "password reset flow", "billing issue", "API rate limit", 
    "machine learning model", "financial report", "marketing copy", 
    "sales email", "resume formatting", "translation to French",
    "SEO optimization", "Agile methodology", "system architecture"
]

CODE_SNIPPETS = {
    "python": [
        "def calculate_fibonacci(n):\n    if n <= 0: return []\n    elif n == 1: return [0]\n    res = [0, 1]\n    while len(res) < n:\n        res.append(res[-1] + res[-2])\n    return res",
        "import pandas as pd\n\ndef process_data(df):\n    return df.dropna().groupby('category').mean()",
        "import requests\n\nresponse = requests.get('https://api.example.com/data')\nif response.status_code == 200:\n    print(response.json())",
        "from fastapi import FastAPI\n\napp = FastAPI()\n\n@app.get('/')\ndef read_root():\n    return {'Hello': 'World'}",
        "with open('file.txt', 'r') as f:\n    lines = f.readlines()\n    for line in lines:\n        print(line.strip())"
    ],
    "react": [
        "import { useState, useEffect } from 'react';\n\nexport default function App() {\n  const [data, setData] = useState(null);\n  useEffect(() => {\n    fetch('/api').then(r => r.json()).then(setData);\n  }, []);\n  return <div>{data ? data.title : 'Loading...'}</div>;\n}",
        "const handleToggle = () => setIsActive(prev => !prev);\n\nreturn <button onClick={handleToggle} className=\"btn\">Toggle State</button>;",
        "import { useMemo } from 'react';\n\nconst memoizedValue = useMemo(() => computeExpensiveValue(a, b), [a, b]);"
    ],
    "sql": [
        "SELECT u.id, u.name, COUNT(o.id) as order_count\nFROM users u\nLEFT JOIN orders o ON u.id = o.user_id\nGROUP BY u.id, u.name\nHAVING COUNT(o.id) > 5;",
        "UPDATE inventory SET stock = stock - 1 WHERE product_id = 123 AND stock > 0;",
        "CREATE INDEX idx_users_email ON users(email);",
        "WITH RankedSales AS (\n  SELECT id, amount, ROW_NUMBER() OVER(PARTITION BY region ORDER BY amount DESC) as rn\n  FROM sales\n)\nSELECT * FROM RankedSales WHERE rn <= 3;"
    ],
    "bash": [
        "#!/bin/bash\nfor file in *.txt; do\n  mv \"$file\" \"${file%.txt}.md\"\ndone",
        "docker build -t myapp:latest .\ndocker run -d -p 8080:80 myapp:latest",
        "tar -czvf backup-$(date +%Y%m%d).tar.gz /var/www/html",
        "find . -type f -name \"*.log\" -mtime +30 -exec rm {} \\;"
    ],
    "css": [
        ".container {\n  display: flex;\n  justify-content: center;\n  align-items: center;\n  height: 100vh;\n}",
        "@media (max-width: 768px) {\n  .sidebar { display: none; }\n  .main-content { width: 100%; }\n}",
        ".grid-layout {\n  display: grid;\n  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));\n  gap: 1rem;\n}"
    ],
    "javascript": [
        "const results = await Promise.all([fetch('/api/1'), fetch('/api/2')]);\nconst data = await Promise.all(results.map(r => r.json()));",
        "const express = require('express');\nconst app = express();\napp.use(express.json());\napp.post('/data', (req, res) => res.send(req.body));",
        "module.exports = {\n  theme: {\n    extend: {\n      colors: {\n        primary: '#1da1f2',\n      }\n    }\n  }\n}"
    ],
    "typescript": [
        "interface User {\n  id: number;\n  name: string;\n  email?: string;\n}\n\nfunction getUser(id: number): User {\n  return { id, name: 'Test' };\n}",
        "type Result<T> = { success: true; data: T } | { success: false; error: string };"
    ],
    "go": [
        "package main\n\nimport \"fmt\"\n\nfunc main() {\n    ch := make(chan int)\n    go func() {\n        ch <- 42\n    }()\n    fmt.Println(<-ch)\n}",
        "func handler(w http.ResponseWriter, r *http.Request) {\n    fmt.Fprintf(w, \"Hello, World!\")\n}"
    ],
    "rust": [
        "use std::thread;\nuse std::sync::mpsc;\n\nfn main() {\n    let (tx, rx) = mpsc::channel();\n    thread::spawn(move || {\n        tx.send(10).unwrap();\n    });\n    println!(\"Got: {}\", rx.recv().unwrap());\n}",
        "fn is_even(n: i32) -> bool {\n    n % 2 == 0\n}"
    ],
    "yaml": [
        "apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: nginx-deployment\nspec:\n  replicas: 3\n  selector:\n    matchLabels:\n      app: nginx\n  template:\n    metadata:\n      labels:\n        app: nginx\n    spec:\n      containers:\n      - name: nginx\n        image: nginx:1.14.2\n        ports:\n        - containerPort: 80"
    ]
}

INTENTS = [
    "How do I fix", "Can you explain", "Please write a script for", 
    "I need help with", "Why is my", "What is the best way to", 
    "Summarize this", "Translate this", "Debug my", "Optimize this"
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

QWERTY_ADJACENT = {
    'a': 'qwsz', 'b': 'vghn', 'c': 'xdfv', 'd': 'sfcx', 'e': 'wsdr',
    'f': 'rtgvcd', 'g': 'tyhbvf', 'h': 'yujnbg', 'i': 'ujko', 'j': 'uikmhn',
    'k': 'jiolm', 'l': 'kop', 'm': 'njk', 'n': 'bhjm', 'o': 'iklp',
    'p': 'ol', 'q': 'wa', 'r': 'edft', 's': 'awedxz', 't': 'rfgy',
    'u': 'yhij', 'v': 'cfgb', 'w': 'qase', 'x': 'zsdc', 'y': 'tghu', 'z': 'asx'
}

def introduce_typos(text, severity=0.05):
    if random.random() > severity:
        return text
    chars = list(text)
    num_errors = max(1, int(len(chars) * random.uniform(0.01, 0.03)))
    for _ in range(num_errors):
        if not chars: break
        idx = random.randint(0, len(chars) - 1)
        char = chars[idx].lower()
        error_type = random.choice(['swap', 'drop', 'adjacent'])
        if error_type == 'swap' and idx < len(chars) - 1:
            chars[idx], chars[idx+1] = chars[idx+1], chars[idx]
        elif error_type == 'drop':
            chars.pop(idx)
        elif error_type == 'adjacent' and char in QWERTY_ADJACENT:
            chars[idx] = random.choice(QWERTY_ADJACENT[char])
    return "".join(chars)

def introduce_grammar_errors(text, severity=0.1):
    if random.random() > severity:
        return text
    replacements = {
        r'\byour\b': "you're", r"\byou're\b": "your",
        r'\btheir\b': "there", r'\bthere\b': "their",
        r'\bits\b': "it's", r"\bit's\b": "its"
    }
    for pattern, replacement in replacements.items():
        if random.random() < 0.2:
            text = re.sub(pattern, replacement, text, flags=re.IGNORECASE)
    return text

def generate_prompt_and_topic():
    topic = random.choice(TOPICS)
    length_type = random.choices(['short', 'medium', 'long'], weights=[0.3, 0.5, 0.2])[0]
    
    if length_type == 'short':
        base = f"{random.choice(INTENTS)} {topic}"
    elif length_type == 'medium':
        base = f"{random.choice(FILLERS)} {random.choice(INTENTS)} {topic}? {random.choice(CONTEXTS)}"
    else:
        base = f"{random.choice(FILLERS)} {random.choice(INTENTS)} {topic}. "
        base += f"{random.choice(CONTEXTS)} I have tried looking at the docs but I am still confused. "
        base += f"Can you provide a detailed example? Thanks in advance!"
        
    base = introduce_grammar_errors(base, severity=0.15)
    base = introduce_typos(base, severity=0.1)
    
    if random.random() < 0.05:
        base = base.lower().replace("?", "").replace(".", "")
        
    return base.strip(), topic

def generate_response(topic):
    code_type = TOPIC_MAPPING.get(topic)
    
    if code_type and random.random() > 0.1: # 90% chance to include code if applicable
        snippet = random.choice(CODE_SNIPPETS[code_type])
        templates = [
            f"Here is how you can do that:\n\n```{code_type}\n{snippet}\n```\n\nLet me know if you need any further explanation!",
            f"Sure, here is an example snippet that should help:\n\n```{code_type}\n{snippet}\n```",
            f"The best approach is to use the following code:\n\n```{code_type}\n{snippet}\n```\n\nMake sure to adapt it to your specific use case.",
            f"I can help with that. Here is a standard implementation:\n\n```{code_type}\n{snippet}\n```\n\nThis follows best practices for {code_type}."
        ]
        return random.choice(templates)
    else:
        templates = [
            "I can certainly help with that. First, you need to understand the core concepts. Then, apply the standard practices recommended in the documentation.",
            "That's a great question. The solution depends on your specific environment, but generally, you want to ensure all dependencies are updated and configurations are correct.",
            "Based on your description, it sounds like a configuration issue. Please check your settings, review the logs for specific error codes, and try again.",
            "To solve this, I recommend breaking the problem down into smaller parts. Test each component individually to isolate the root cause."
        ]
        return random.choice(templates)

def generate_vertex_review():
    sentiment = random.choice(["positive", "negative", "neutral"])
    if sentiment == "positive":
        templates = ["Absolutely loved it!", "Great experience, highly recommend.", "Works perfectly for my needs.", "Five stars, no complaints.", "Exceeded my expectations."]
    elif sentiment == "negative":
        templates = ["Terrible, broke after one day.", "Customer service was awful.", "Do not buy this.", "Waste of money and time.", "Very disappointed with the quality."]
    else:
        templates = ["It's okay, nothing special.", "Does the job but could be better.", "Average quality for the price.", "Arrived fine, standard product.", "Met expectations, nothing more."]
        
    base = random.choice(templates)
    if random.random() < 0.4:
        base += " " + random.choice(["I bought this last week.", "My friend told me about it.", "I was expecting something different.", "Shipping was fast though.", "Will update this review later."])
        
    base = introduce_typos(base, severity=0.15)
    base = introduce_grammar_errors(base, severity=0.15)
    
    if random.random() < 0.05:
        base = base.upper()
        
    return base, sentiment

# --- File Generators ---

# Use QUOTE_MINIMAL to strictly adhere to standard CSV formatting, safely wrapping newlines
CSV_KWARGS = {'newline': '', 'encoding': 'utf-8', 'quoting': csv.QUOTE_MINIMAL}

def generate_openai(num_rows):
    print(f"Generating OpenAI data ({num_rows} rows)...")
    with open('sample_data/openai_finetuning.csv', 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f, quoting=csv.QUOTE_MINIMAL)
        writer.writerow(['system', 'user', 'assistant'])
        for _ in range(num_rows):
            system = random.choice(["You are a helpful AI.", "You are a coding expert.", "You are a concise assistant.", "You are a senior software engineer."])
            prompt, topic = generate_prompt_and_topic()
            writer.writerow([system, prompt, generate_response(topic)])

def generate_gemini(num_rows):
    print(f"Generating Gemini data ({num_rows} rows)...")
    with open('sample_data/gemini_finetuning.csv', 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f, quoting=csv.QUOTE_MINIMAL)
        writer.writerow(['input_text', 'output_text'])
        for _ in range(num_rows):
            prompt, topic = generate_prompt_and_topic()
            writer.writerow([prompt, generate_response(topic)])

def generate_vertex(num_rows):
    print(f"Generating Vertex AI data ({num_rows} rows)...")
    with open('sample_data/vertex_ai_classification.csv', 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f, quoting=csv.QUOTE_MINIMAL)
        writer.writerow(['text', 'label'])
        for _ in range(num_rows):
            text, label = generate_vertex_review()
            writer.writerow([text, label])

def generate_langfuse(num_rows):
    print(f"Generating Langfuse data ({num_rows} rows)...")
    start_date = datetime(2023, 1, 1)
    models = ["gpt-4-turbo", "gpt-3.5-turbo", "claude-3-opus", "gemini-1.5-pro", "llama-3"]
    
    with open('sample_data/langfuse_export.csv', 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f, quoting=csv.QUOTE_MINIMAL)
        writer.writerow(['id', 'trace_id', 'project_id', 'environment', 'type', 'parent_observation_id', 
                         'start_time', 'end_time', 'name', 'metadata', 'level', 'status_message', 
                         'version', 'input', 'output', 'provided_model_name'])
        
        for _ in range(num_rows):
            prompt, topic = generate_prompt_and_topic()
            response = generate_response(topic)
            
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
        writer = csv.writer(f, quoting=csv.QUOTE_MINIMAL)
        writer.writerow(['run_id', 'name', 'run_type', 'start_time', 'end_time', 'status', 'inputs', 'outputs', 'error'])
        
        for _ in range(num_rows):
            prompt, topic = generate_prompt_and_topic()
            response = generate_response(topic)
            
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
    print("All high quality data generation complete!")
