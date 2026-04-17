import json
import os
import time
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

# ── Phase 1: Quick classify (fast, ~1-2s) ─────────────────
QUICK_PROMPT = """判断任务优先级，只返回JSON，不要其他文字：

标题: {title}
描述: {description}
截止: {deadline}
相关方: {stakeholders}

{{"quadrant":"Q1","quadrant_label":"紧急且重要","priority_score":85,"urgency_level":"高","importance_level":"高"}}"""

# ── Phase 2: Full analysis ─────────────────────────────────
FULL_PROMPT = """你是企业任务优先级助手。对以下任务做深度分析，只返回JSON：

标题: {title}
描述: {description}
截止: {deadline}
相关方: {stakeholders}

{{"quadrant":"Q1","quadrant_label":"紧急且重要","priority_score":85,"urgency_level":"高","importance_level":"高","risk_assessment":{{"overall_risk":"高","compliance_risk":"说明","financial_impact":"说明","reputation_risk":"说明","operational_risk":"说明"}},"key_points":["点1","点2","点3"],"subtasks":[{{"step":1,"title":"步骤","description":"说明","estimated_time":"时间","owner":"负责人"}}],"recommendation":"建议","delegation_suggestion":"授权建议"}}"""


class TaskAIAgent:
    def __init__(self):
        self.model = "deepseek-chat"

    def _get_client(self, api_key: str) -> OpenAI:
        return OpenAI(api_key=api_key, base_url="https://api.deepseek.com")

    def parse_json(self, text: str):
        content = text.strip()
        if "```" in content:
            content = content.split("```")[1]
            if content.startswith("json"):
                content = content[4:]
            content = content.strip()
        try:
            return json.loads(content)
        except Exception:
            return None

    def _fallback(self) -> dict:
        return {
            "quadrant": "Q2", "quadrant_label": "不紧急但重要",
            "priority_score": 50, "urgency_level": "中", "importance_level": "中",
            "risk_assessment": {"overall_risk": "中", "compliance_risk": "需评估",
                                "financial_impact": "需评估", "reputation_risk": "需评估",
                                "operational_risk": "需评估"},
            "key_points": ["请提供更多任务细节"], "subtasks": [],
            "recommendation": "建议补充更多细节以获得精确分析。",
            "delegation_suggestion": "待分析"
        }

    def quick_classify(self, title: str, description: str,
                       deadline: str = None, stakeholders: str = None,
                       api_key: str = None) -> dict:
        """Phase 1: just quadrant + score, very fast."""
        client = self._get_client(api_key or os.getenv("DEEPSEEK_API_KEY"))
        prompt = QUICK_PROMPT.format(
            title=title, description=description,
            deadline=deadline or "未指定", stakeholders=stakeholders or "未指定"
        )
        for attempt in range(3):
            try:
                resp = client.chat.completions.create(
                    model=self.model, max_tokens=80,
                    messages=[{"role": "user", "content": prompt}]
                )
                result = self.parse_json(resp.choices[0].message.content)
                return result if result else {}
            except Exception as e:
                if attempt < 2:
                    time.sleep(1.5)
                else:
                    raise e
        return {}

    def full_analyze_stream(self, title: str, description: str,
                            deadline: str = None, stakeholders: str = None,
                            api_key: str = None):
        """Phase 2: full streaming analysis, with up to 2 retries on connection error."""
        client = self._get_client(api_key or os.getenv("DEEPSEEK_API_KEY"))
        prompt = FULL_PROMPT.format(
            title=title, description=description,
            deadline=deadline or "未指定", stakeholders=stakeholders or "未指定"
        )
        for attempt in range(3):
            try:
                stream = client.chat.completions.create(
                    model=self.model, max_tokens=900, stream=True,
                    messages=[{"role": "user", "content": prompt}]
                )
                for chunk in stream:
                    delta = chunk.choices[0].delta.content
                    if delta:
                        yield delta
                return  # success
            except Exception as e:
                if attempt < 2:
                    time.sleep(1.5)
                else:
                    raise e

    def analyze_task(self, title: str, description: str,
                     deadline: str = None, stakeholders: str = None,
                     api_key: str = None) -> dict:
        client = self._get_client(api_key or os.getenv("DEEPSEEK_API_KEY"))
        prompt = FULL_PROMPT.format(
            title=title, description=description,
            deadline=deadline or "未指定", stakeholders=stakeholders or "未指定"
        )
        try:
            resp = client.chat.completions.create(
                model=self.model, max_tokens=900,
                messages=[{"role": "user", "content": prompt}]
            )
            result = self.parse_json(resp.choices[0].message.content)
            return result if result else self._fallback()
        except Exception:
            return self._fallback()

    def decompose_task(self, title: str, description: str, api_key: str = None) -> list:
        client = self._get_client(api_key or os.getenv("DEEPSEEK_API_KEY"))
        prompt = f"""将以下任务拆解为可执行步骤，最多6步，只返回JSON数组：
任务: {title}
描述: {description}
[{{"step":1,"title":"步骤","description":"说明","estimated_time":"时长","deliverable":"产出","tips":"注意","dependencies":"依赖"}}]"""
        try:
            resp = client.chat.completions.create(
                model=self.model, max_tokens=800,
                messages=[{"role": "user", "content": prompt}]
            )
            result = self.parse_json(resp.choices[0].message.content)
            return result if isinstance(result, list) else []
        except Exception:
            return []
