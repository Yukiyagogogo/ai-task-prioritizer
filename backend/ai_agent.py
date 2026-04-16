import anthropic
import json
import os
from dotenv import load_dotenv

load_dotenv()


class TaskAIAgent:
    def __init__(self):
        self.client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
        self.model = "claude-sonnet-4-6"

    def analyze_task(self, title: str, description: str, deadline: str = None, stakeholders: str = None) -> dict:
        prompt = f"""你是一个企业任务优先级AI助手。请深度分析以下任务，并严格按JSON格式返回分析结果。

任务标题: {title}
任务描述: {description}
截止日期: {deadline or "未指定"}
相关方/客户: {stakeholders or "未指定"}

## 分析要求

### 1. 四象限分类（艾森豪威尔矩阵）
- Q1: 紧急且重要 — 危机、deadline紧迫、重要客户问题
- Q2: 不紧急但重要 — 战略规划、能力建设、预防性工作
- Q3: 紧急但不重要 — 临时性会议、他人要求的非核心事务
- Q4: 不紧急也不重要 — 可以删除或推迟的事项

### 2. 企业风险评估维度
- 合规风险、财务影响、声誉风险、运营风险

### 3. 关键行动点
提取3-5个最需要关注的核心行动点

### 4. 子任务拆解
将任务拆解为3-6个可执行步骤

请只返回以下JSON格式，不要任何其他文字：
{{
    "quadrant": "Q1",
    "quadrant_label": "紧急且重要",
    "priority_score": 85,
    "urgency_level": "高",
    "importance_level": "高",
    "risk_assessment": {{
        "overall_risk": "高",
        "compliance_risk": "涉及合规风险说明",
        "financial_impact": "财务影响说明",
        "reputation_risk": "声誉风险说明",
        "operational_risk": "运营风险说明"
    }},
    "key_points": [
        "关键行动点1",
        "关键行动点2",
        "关键行动点3"
    ],
    "subtasks": [
        {{
            "step": 1,
            "title": "子任务标题",
            "description": "具体执行内容",
            "estimated_time": "预计用时",
            "owner": "建议负责人类型"
        }}
    ],
    "recommendation": "总体优化建议，说明如何最有效地处理这个任务（2-3句话）",
    "delegation_suggestion": "是否建议授权他人，以及原因"
}}"""

        message = self.client.messages.create(
            model=self.model,
            max_tokens=2000,
            messages=[{"role": "user", "content": prompt}]
        )

        content = message.content[0].text.strip()

        # Strip markdown code blocks if present
        if content.startswith("```"):
            content = content.split("```")[1]
            if content.startswith("json"):
                content = content[4:]
            content = content.strip()

        try:
            return json.loads(content)
        except json.JSONDecodeError:
            return {
                "quadrant": "Q2",
                "quadrant_label": "不紧急但重要",
                "priority_score": 50,
                "urgency_level": "中",
                "importance_level": "中",
                "risk_assessment": {
                    "overall_risk": "中",
                    "compliance_risk": "需进一步评估",
                    "financial_impact": "需进一步评估",
                    "reputation_risk": "需进一步评估",
                    "operational_risk": "需进一步评估"
                },
                "key_points": ["请提供更详细的任务描述以获得准确分析"],
                "subtasks": [],
                "recommendation": "建议补充更多任务细节以进行精确分析。",
                "delegation_suggestion": "待分析"
            }

    def decompose_task(self, title: str, description: str) -> list:
        prompt = f"""你是一个项目管理AI助手。请将以下任务拆解为详细的、可立即执行的步骤。

任务: {title}
描述: {description}

要求：
1. 每个步骤必须具体可操作
2. 按照执行顺序排列
3. 包含每步的注意事项
4. 最多8个步骤

只返回JSON数组，不要其他文字：
[
    {{
        "step": 1,
        "title": "步骤标题",
        "description": "具体操作说明",
        "estimated_time": "预计用时（如：2小时）",
        "deliverable": "该步骤产出物",
        "tips": "执行注意事项",
        "dependencies": "依赖的前置步骤（无则填'无'）"
    }}
]"""

        message = self.client.messages.create(
            model=self.model,
            max_tokens=1500,
            messages=[{"role": "user", "content": prompt}]
        )

        content = message.content[0].text.strip()

        if content.startswith("```"):
            content = content.split("```")[1]
            if content.startswith("json"):
                content = content[4:]
            content = content.strip()

        try:
            return json.loads(content)
        except json.JSONDecodeError:
            return []
