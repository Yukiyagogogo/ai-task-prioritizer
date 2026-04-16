import os
import uuid
from datetime import datetime
from typing import Optional, List
from pathlib import Path

from fastapi import FastAPI, HTTPException, Header
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from ai_agent import TaskAIAgent

app = FastAPI(title="AI Task Prioritizer", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory storage (demo — replace with DB for production)
tasks_db: dict = {}

agent = TaskAIAgent()


# ─── Pydantic Models ─────────────────────────────────────────────────────────

class TaskInput(BaseModel):
    title: str
    description: str
    deadline: Optional[str] = None
    stakeholders: Optional[str] = None


class RiskAssessment(BaseModel):
    overall_risk: str
    compliance_risk: str
    financial_impact: str
    reputation_risk: str
    operational_risk: str


class SubTask(BaseModel):
    step: int
    title: str
    description: str
    estimated_time: str
    owner: Optional[str] = None
    deliverable: Optional[str] = None
    tips: Optional[str] = None
    dependencies: Optional[str] = None


class Task(BaseModel):
    id: str
    title: str
    description: str
    deadline: Optional[str] = None
    stakeholders: Optional[str] = None
    quadrant: Optional[str] = None
    quadrant_label: Optional[str] = None
    priority_score: Optional[int] = None
    urgency_level: Optional[str] = None
    importance_level: Optional[str] = None
    risk_assessment: Optional[dict] = None
    key_points: Optional[List[str]] = None
    subtasks: Optional[List[dict]] = None
    recommendation: Optional[str] = None
    delegation_suggestion: Optional[str] = None
    created_at: str
    analysis_complete: bool = False


# ─── API Routes ───────────────────────────────────────────────────────────────

@app.get("/api/health")
def health_check():
    return {"status": "ok", "version": "1.0.0"}


@app.post("/api/tasks", response_model=Task)
def create_task(task_input: TaskInput, x_api_key: Optional[str] = Header(default=None)):
    task_id = str(uuid.uuid4())[:8]

    api_key = x_api_key or os.getenv("DEEPSEEK_API_KEY")
    if not api_key:
        raise HTTPException(status_code=401, detail="请提供 DeepSeek API Key")

    analysis = agent.analyze_task(
        title=task_input.title,
        description=task_input.description,
        deadline=task_input.deadline,
        stakeholders=task_input.stakeholders,
        api_key=api_key,
    )

    task = Task(
        id=task_id,
        title=task_input.title,
        description=task_input.description,
        deadline=task_input.deadline,
        stakeholders=task_input.stakeholders,
        quadrant=analysis.get("quadrant"),
        quadrant_label=analysis.get("quadrant_label"),
        priority_score=analysis.get("priority_score"),
        urgency_level=analysis.get("urgency_level"),
        importance_level=analysis.get("importance_level"),
        risk_assessment=analysis.get("risk_assessment"),
        key_points=analysis.get("key_points", []),
        subtasks=analysis.get("subtasks", []),
        recommendation=analysis.get("recommendation"),
        delegation_suggestion=analysis.get("delegation_suggestion"),
        created_at=datetime.now().isoformat(),
        analysis_complete=True,
    )

    tasks_db[task_id] = task.model_dump()
    return task


@app.get("/api/tasks")
def list_tasks():
    return list(tasks_db.values())


@app.get("/api/tasks/{task_id}")
def get_task(task_id: str):
    if task_id not in tasks_db:
        raise HTTPException(status_code=404, detail="Task not found")
    return tasks_db[task_id]


@app.post("/api/tasks/{task_id}/decompose")
def decompose_task(task_id: str, x_api_key: Optional[str] = Header(default=None)):
    if task_id not in tasks_db:
        raise HTTPException(status_code=404, detail="Task not found")
    task = tasks_db[task_id]
    api_key = x_api_key or os.getenv("DEEPSEEK_API_KEY")
    if not api_key:
        raise HTTPException(status_code=401, detail="请提供 DeepSeek API Key")
    subtasks = agent.decompose_task(task["title"], task["description"], api_key=api_key)
    tasks_db[task_id]["subtasks"] = subtasks
    return tasks_db[task_id]


@app.delete("/api/tasks/{task_id}")
def delete_task(task_id: str):
    if task_id not in tasks_db:
        raise HTTPException(status_code=404, detail="Task not found")
    del tasks_db[task_id]
    return {"message": "Task deleted successfully"}


# ─── Serve Frontend ───────────────────────────────────────────────────────────

frontend_dir = Path(__file__).parent.parent / "frontend"

if frontend_dir.exists():
    app.mount("/static", StaticFiles(directory=str(frontend_dir)), name="static")

    @app.get("/")
    def serve_index():
        return FileResponse(str(frontend_dir / "index.html"))

    @app.get("/{path:path}")
    def serve_frontend(path: str):
        file_path = frontend_dir / path
        if file_path.exists() and file_path.is_file():
            return FileResponse(str(file_path))
        return FileResponse(str(frontend_dir / "index.html"))
