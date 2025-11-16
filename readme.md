# **SmartProctor – Setup Guide**

SmartProctor is a secure, mobile-optimized examination platform designed to enforce academic integrity.  
This document explains how one should set up the project, follow coding standards, and collaborate efficiently.

---

# **1. Project Structure**
```
SmartProctor/
│
├── backend/                     # FastAPI app
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py              # FastAPI entry point
│   │   ├── core/                # Core configs
│   │   │   ├── config.py        # DB, OAuth, CORS setup
│   │   │   └── security.py      # JWT, password hashing
│   │   ├── models/              # SQLAlchemy or Pydantic models
│   │   │   ├── user.py
│   │   │   ├── quiz.py
│   │   │   └── response.py
│   │   ├── schemas/             # Pydantic request/response schemas
│   │   │   ├── user_schema.py
│   │   │   ├── quiz_schema.py
│   │   │   └── response_schema.py
│   │   ├── routes/              # API endpoints
│   │   │   ├── auth_routes.py
│   │   │   ├── teacher_routes.py
│   │   │   ├── student_routes.py
│   │   │   └── exam_routes.py
│   │   ├── services/            # Business logic
│   │   │   ├── auth_service.py
│   │   │   ├── quiz_service.py
│   │   │   └── monitor_service.py
│   │   ├── database/
│   │   │   ├── connection.py    # MySQL/Mongo connection
│   │   │   └── init_db.py
│   │   └── utils/
│   │       ├── anti_cheat.py    # tab-switch, focus tracking validation
│   │       └── oauth_client.py  # OAuth (Google/Institutional)
│   │
│   ├── tests/
│   │   ├── test_auth.py
│   │   ├── test_exam.py
│   │   └── test_quiz.py
│   ├── requirements.txt
│   ├── .env.example
│   └── README.md
│
├── frontend/                    # React app
│   ├── public/
│   ├── src/
│   │   ├── api/                 # Axios calls to backend
│   │   │   ├── authApi.js
│   │   │   ├── quizApi.js
│   │   │   └── examApi.js
│   │   ├── components/
│   │   │   ├── common/          # Navbar, footer, protected route
│   │   │   ├── teacher/         # Quiz builder, results
│   │   │   └── student/         # Quiz interface, timer, warnings
│   │   ├── context/             # Auth, Theme, Exam state
│   │   │   ├── AuthContext.js
│   │   │   └── ExamContext.js
│   │   ├── hooks/               # Custom React hooks
│   │   │   └── useAntiCheat.js
│   │   ├── pages/
│   │   │   ├── LoginPage.jsx
│   │   │   ├── TeacherDashboard.jsx
│   │   │   ├── StudentDashboard.jsx
│   │   │   ├── QuizPage.jsx
│   │   │   └── ResultPage.jsx
│   │   ├── styles/
│   │   │   └── global.css
│   │   ├── App.js
│   │   ├── main.jsx
│   │   └── config.js            # Base URLs, constants
│   ├── .env.example
│   ├── package.json
│   └── README.md
│
├── docs/                        # Project documentation
│   ├── architecture.md
│   ├── api_reference.md
│   ├── setup_guide.md
│   └── demo_plan.md
│
├── .gitignore
├── .vscode/
│   └── extensions.json
└── README.md                    # Overview, setup, and usage

```

---

# **2. Getting Started**

## **2.1 Clone the Repository**
```bash
git clone https://github.com/chinmay161/SmartProctor.git
cd SmartProctor
```

---

## **2.2 Backend Setup (FastAPI)**
```bash
cd backend
python -m venv venv
venv\Scripts\activate    # Windows
pip install -r requirements.txt
```

Run backend:
```bash
uvicorn app.main:app --reload
```

Open in browser:
```
http://127.0.0.1:8000
```

Expected response:
```json
{"message": "SmartProctor backend is running"}
```

---

## **2.3 Frontend Setup (React + Vite)**
```bash
cd ../frontend
npm install
npm run dev
```

Open:
```
http://localhost:5173
```

---

# **3. Git Workflow (Important)**

## **Branch Model**
| Branch | Purpose |
|--------|----------|
| `main` | Fully stable, demo-ready code |
| `dev` | Active development |
| `feature/<name>` | Individual features |

---

## **Daily Workflow**
```bash
git checkout dev
git pull origin dev

git checkout -b feature-login
# Code...

git add .
git commit -m "Added login UI"
git push origin feature-login
```

Then open a **Pull Request** into `dev`.  
A teammate reviews it before merging.

**Never commit directly to `main` or `dev`.**

---

# **4. VS Code Setup**

Create `.vscode/extensions.json`:

```json
{
  "recommendations": [
    "ms-vsliveshare.vsliveshare",
    "eamodio.gitlens",
    "github.vscode-pull-request-github",
    "esbenp.prettier-vscode",
    "editorconfig.editorconfig",
    "humao.rest-client",
    "ms-python.python",
    "ritwickdey.liveserver"
  ]
}
```

---

# **5. Coding Standards**

### **General**
- Prettier must format everything.
- Use `.env` files for secrets (never push to GitHub).
- Use clear naming conventions:
  - Components → `PascalCase`
  - Variables → `camelCase`

### **Backend**
- Routes go inside `/app/routes/`
- Services inside `/app/services/`
- Use Pydantic schemas

### **Frontend**
- Place API calls in `src/api/`
- Use React Context for auth/exam state
- Anti-cheat logic in custom hooks

---

# **6. Collaboration Do’s & Don’ts**

### **Do**
- Pull latest work before starting.
- Commit small and descriptive changes.
- Use feature branches.
- Review PRs for teammates.
- Update documentation when APIs change.

### **Don’t**
- Push directly to `main` or `dev`.
- Commit `venv/`, `node_modules/`, or `.env`.
- Override someone else’s code without talking to them.
- Ignore merge conflicts.

---

# **7. Running Both Apps Together**

Backend:
```bash
uvicorn app.main:app --reload
```

Frontend:
```bash
npm run dev
```

Ensure CORS is configured in FastAPI:

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

---