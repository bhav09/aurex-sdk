import os
import re

directory = "/Users/aakritiaggarwal/Documents/lumina-token/frontend"

# We want to replace specific hex codes
replacements = {
    # Replace the specific pink #eca8d6 with teal-400 #2dd4bf
    "eca8d6": "2dd4bf",
    "#eca8d6": "#2dd4bf",
    "violet-": "teal-",
    "indigo-": "teal-",
    "purple-": "teal-"
}

for root, dirs, files in os.walk(directory):
    if "node_modules" in root or ".next" in root:
        continue
    for file in files:
        if file.endswith((".tsx", ".ts", ".css")):
            filepath = os.path.join(root, file)
            with open(filepath, "r", encoding="utf-8") as f:
                content = f.read()
            
            new_content = content
            for old, new in replacements.items():
                new_content = new_content.replace(old, new)
            
            if new_content != content:
                with open(filepath, "w", encoding="utf-8") as f:
                    f.write(new_content)
                print(f"Updated {filepath}")
