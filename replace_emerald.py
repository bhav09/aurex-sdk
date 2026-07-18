import os
import re

directories = [
    "/Users/aakritiaggarwal/Documents/lumina-token/frontend/app/docs",
    "/Users/aakritiaggarwal/Documents/lumina-token/frontend/components/docs",
    "/Users/aakritiaggarwal/Documents/lumina-token/frontend/app/layout.tsx"
]

replacements = {
    "emerald-": "teal-"
}

for directory in directories:
    if os.path.isfile(directory):
        files_to_process = [directory]
    else:
        files_to_process = []
        for root, dirs, files in os.walk(directory):
            for file in files:
                if file.endswith((".tsx", ".ts")):
                    files_to_process.append(os.path.join(root, file))
                    
    for filepath in files_to_process:
        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read()
        
        new_content = content
        for old, new in replacements.items():
            new_content = new_content.replace(old, new)
        
        if new_content != content:
            with open(filepath, "w", encoding="utf-8") as f:
                f.write(new_content)
            print(f"Updated {filepath}")
