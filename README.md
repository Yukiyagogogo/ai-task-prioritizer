# AI 任务优先级助手

基于 Claude AI 的智能任务管理系统，通过**艾森豪威尔四象限矩阵**自动分类任务优先级，并提供企业级风险评估与执行策略拆解。

## 功能特性

- **AI 智能分析** — 自动判断任务紧急度与重要度，归入四象限
- **企业风险评估** — 评估合规、财务、声誉、运营四维度风险
- **关键行动点提取** — 高亮最需要关注的核心事项
- **任务自动拆解** — 将复杂任务拆解为可执行的步骤
- **可视化矩阵** — 实时四象限看板，直观展示任务分布

## 技术架构

```
ai-task-prioritizer/
├── backend/
│   ├── main.py          # FastAPI 服务
│   ├── ai_agent.py      # Claude AI 分析引擎
│   └── requirements.txt
├── frontend/
│   ├── index.html       # 主页面
│   ├── style.css        # 样式
│   └── app.js           # 前端逻辑
└── .env.example
```

## 快速启动

### 1. 配置 API Key

```bash
cp .env.example .env
# 编辑 .env 文件，填入你的 Anthropic API Key
```

### 2. 安装后端依赖

```bash
cd backend
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 3. 启动后端服务

```bash
cd backend
uvicorn main:app --reload --port 8000
```

### 4. 打开浏览器

访问 [http://localhost:8000](http://localhost:8000)

## API 文档

启动后访问 [http://localhost:8000/docs](http://localhost:8000/docs) 查看完整 API 文档。

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/tasks | 创建并分析任务 |
| GET | /api/tasks | 获取所有任务 |
| GET | /api/tasks/{id} | 获取单个任务 |
| POST | /api/tasks/{id}/decompose | AI 拆解任务步骤 |
| DELETE | /api/tasks/{id} | 删除任务 |

## 获取 Anthropic API Key

1. 访问 [console.anthropic.com](https://console.anthropic.com)
2. 注册/登录账号
3. 创建 API Key 并复制到 `.env` 文件
