import os
import glob

files = [
    "app/services/exam_service.py",
    "app/services/analytics_service.py",
    "app/routes/sessions.py",
    "app/routes/proctoring.py",
]

for filepath in files:
    if os.path.exists(filepath):
        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read()
        
        # Replace variable / field references
        content = content.replace("trust_score", "integrity_score")
        # Replace display strings
        content = content.replace("Trust Score", "Integrity Score")
        
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(content)
        print(f"Updated {filepath}")
    else:
        print(f"File not found: {filepath}")
