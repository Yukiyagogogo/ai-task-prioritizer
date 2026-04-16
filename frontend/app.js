// ── State ──────────────────────────────────────────────────
const API = 'http://localhost:8000';
let tasks = [];
let selectedTaskId = null;

// ── API Key Management ─────────────────────────────────────
function getKey() { return localStorage.getItem('deepseek_api_key') || ''; }

function openKeyModal() {
  document.getElementById('key-input').value = getKey();
  document.getElementById('key-modal').classList.remove('hidden');
}
function closeKeyModal() {
  document.getElementById('key-modal').classList.add('hidden');
}
function saveKey() {
  const key = document.getElementById('key-input').value.trim();
  if (!key) { alert('请输入 API Key'); return; }
  localStorage.setItem('deepseek_api_key', key);
  updateKeyStatus();
  closeKeyModal();
}
function updateKeyStatus() {
  const key = getKey();
  const dot = document.getElementById('key-dot');
  const label = document.getElementById('key-label');
  if (key) {
    dot.className = 'key-dot green';
    label.textContent = 'API Key 已设置 ✓';
  } else {
    dot.className = 'key-dot red';
    label.textContent = '未设置 API Key';
  }
}

// ── Demo Data ──────────────────────────────────────────────
const DEMOS = {
  crisis: {
    title: '线上核心服务宕机处理',
    description: '生产环境数据库主节点发生故障，导致用户无法登录，订单系统完全不可用。影响超过10万活跃用户，每分钟损失预估5万元。需要立即组织技术团队进行故障排查和恢复，同时需要向监管部门和大客户进行说明。',
    deadline: new Date(Date.now() + 86400000).toISOString().split('T')[0],
    stakeholders: 'CTO、监管部门、大客户、技术团队'
  },
  strategy: {
    title: 'Q3年度战略规划与OKR制定',
    description: '需要制定公司下一年度的产品战略规划，包括市场分析、竞品研究、产品路线图制定、资源分配计划和OKR目标拆解。这将影响公司未来一年的方向和团队工作重点，需要与各部门负责人充分沟通对齐。',
    deadline: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
    stakeholders: 'CEO、各部门负责人、投资方'
  },
  meeting: {
    title: '周五下午例行部门汇报会议',
    description: '每周固定的部门进展汇报会议，整理各组本周工作进展PPT，准备数据报告。会议时长约2小时，主要是信息同步，无需决策。内容较为常规，可以让组员协助准备材料。',
    deadline: new Date(Date.now() + 5 * 86400000).toISOString().split('T')[0],
    stakeholders: '部门同事'
  }
};

// ── Init ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('task-form').addEventListener('submit', handleSubmit);
  updateKeyStatus();
  // Auto-open key modal if no key set
  if (!getKey()) openKeyModal();
  loadTasks();
});

// ── Load Existing Tasks ────────────────────────────────────
async function loadTasks() {
  try {
    const res = await fetch(`${API}/api/tasks`);
    if (res.ok) {
      tasks = await res.json();
      renderAll();
    }
  } catch (e) {
    console.log('Backend not connected, starting fresh.');
  }
}

// ── Demo Loader ────────────────────────────────────────────
function loadDemo(key) {
  const d = DEMOS[key];
  document.getElementById('f-title').value = d.title;
  document.getElementById('f-desc').value = d.description;
  document.getElementById('f-deadline').value = d.deadline || '';
  document.getElementById('f-stakeholders').value = d.stakeholders || '';
}

// ── Submit Handler ─────────────────────────────────────────
async function handleSubmit(e) {
  e.preventDefault();
  const title = document.getElementById('f-title').value.trim();
  const description = document.getElementById('f-desc').value.trim();
  const deadline = document.getElementById('f-deadline').value;
  const stakeholders = document.getElementById('f-stakeholders').value.trim();

  if (!title || !description) return;

  const apiKey = getKey();
  if (!apiKey) { openKeyModal(); return; }

  showOverlay(true);
  setSubmitState(true);

  try {
    const res = await fetch(`${API}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
      body: JSON.stringify({ title, description, deadline: deadline || null, stakeholders: stakeholders || null })
    });

    if (!res.ok) {
      const err = await res.json();
      alert('分析失败: ' + (err.detail || '请检查 API Key 是否配置正确'));
      return;
    }

    const task = await res.json();
    tasks.push(task);
    renderAll();
    showTaskDetail(task);
    selectedTaskId = task.id;

    // Reset form
    document.getElementById('task-form').reset();
  } catch (err) {
    alert('无法连接到后端服务，请确认后端已启动 (port 8000)');
  } finally {
    showOverlay(false);
    setSubmitState(false);
  }
}

// ── Render All ─────────────────────────────────────────────
function renderAll() {
  // Clear quadrants
  ['Q1', 'Q2', 'Q3', 'Q4'].forEach(q => {
    document.getElementById(`tasks-${q}`).innerHTML = '';
    document.getElementById(`cnt-${q}`).textContent = '0';
  });

  // Count per quadrant
  const counts = { Q1: 0, Q2: 0, Q3: 0, Q4: 0 };

  // Sort by priority_score desc
  const sorted = [...tasks].sort((a, b) => (b.priority_score || 0) - (a.priority_score || 0));

  sorted.forEach(task => {
    const q = task.quadrant || 'Q4';
    counts[q]++;
    document.getElementById(`tasks-${q}`).appendChild(buildChip(task));
  });

  ['Q1', 'Q2', 'Q3', 'Q4'].forEach(q => {
    document.getElementById(`cnt-${q}`).textContent = counts[q];
  });

  // Update header stats
  document.getElementById('stat-total').textContent = tasks.length;
  document.getElementById('stat-q1').textContent = counts.Q1;
  document.getElementById('stat-q2').textContent = counts.Q2;
}

// ── Build Task Chip ────────────────────────────────────────
function buildChip(task) {
  const div = document.createElement('div');
  div.className = 'task-chip';
  div.id = `chip-${task.id}`;
  if (task.id === selectedTaskId) div.classList.add('active');

  const scoreColor = task.quadrant === 'Q1' ? '#ef4444' : task.quadrant === 'Q2' ? '#3b82f6' : task.quadrant === 'Q3' ? '#f59e0b' : '#6b7280';

  div.innerHTML = `
    <div class="chip-title" title="${task.title}">${task.title}</div>
    <div class="chip-meta">
      <span class="chip-score" style="color:${scoreColor}">优先级 ${task.priority_score || '--'}</span>
      <span class="chip-deadline">${task.deadline ? task.deadline : ''}</span>
      <button class="chip-delete" onclick="deleteTask(event, '${task.id}')" title="删除">✕</button>
    </div>
  `;

  div.addEventListener('click', (e) => {
    if (e.target.classList.contains('chip-delete')) return;
    selectedTaskId = task.id;
    document.querySelectorAll('.task-chip').forEach(c => c.classList.remove('active'));
    div.classList.add('active');
    showTaskDetail(task);
  });

  return div;
}

// ── Show Task Detail ───────────────────────────────────────
function showTaskDetail(task) {
  const emptyEl = document.getElementById('detail-empty');
  const contentEl = document.getElementById('detail-content');

  emptyEl.classList.add('hidden');
  contentEl.classList.remove('hidden');

  const q = task.quadrant || 'Q4';
  const risk = task.risk_assessment || {};
  const score = task.priority_score || 0;
  const barColor = q === 'Q1' ? '#ef4444' : q === 'Q2' ? '#3b82f6' : q === 'Q3' ? '#f59e0b' : '#6b7280';

  const riskClass = (level) => {
    if (!level) return '';
    const l = level.toLowerCase();
    if (l === '高' || l === 'high') return 'risk-high';
    if (l === '中' || l === 'medium') return 'risk-medium';
    return 'risk-low';
  };

  const keyPointsHtml = (task.key_points || []).map(pt => `
    <div class="key-point">
      <div class="key-point-dot"></div>
      <span>${pt}</span>
    </div>
  `).join('');

  const subtasksHtml = (task.subtasks || []).map(st => `
    <div class="subtask-item">
      <div class="subtask-header">
        <div class="subtask-step">${st.step}</div>
        <div class="subtask-title">${st.title}</div>
      </div>
      <div class="subtask-desc">${st.description || ''}</div>
      ${st.estimated_time ? `<div class="subtask-time">⏱ ${st.estimated_time}${st.deliverable ? ' · 产出: ' + st.deliverable : ''}</div>` : ''}
    </div>
  `).join('');

  const hasSubtasks = task.subtasks && task.subtasks.length > 0;

  contentEl.innerHTML = `
    <!-- Title -->
    <div class="detail-title-row">
      <div class="detail-title">${task.title}</div>
      <div class="detail-meta">
        <span class="tag tag-${q.toLowerCase()}">${task.quadrant_label || q}</span>
        ${task.urgency_level ? `<span class="tag tag-neutral">紧急度: ${task.urgency_level}</span>` : ''}
        ${task.importance_level ? `<span class="tag tag-neutral">重要度: ${task.importance_level}</span>` : ''}
      </div>
    </div>

    <!-- Priority Bar -->
    <div class="priority-bar-wrap">
      <div class="priority-bar-label">
        <span>优先级评分</span>
        <span style="color:${barColor}">${score} / 100</span>
      </div>
      <div class="priority-bar-track">
        <div class="priority-bar-fill" style="width:${score}%;background:${barColor}"></div>
      </div>
    </div>

    <!-- Risk Assessment -->
    <div class="detail-section">
      <div class="detail-section-title">⚠️ 企业风险评估</div>
      <div class="risk-grid">
        <div class="risk-item">
          <div class="risk-item-label">整体风险</div>
          <div class="risk-item-value ${riskClass(risk.overall_risk)}">${risk.overall_risk || '--'}</div>
        </div>
        <div class="risk-item">
          <div class="risk-item-label">财务影响</div>
          <div class="risk-item-value" style="font-size:11px;color:var(--text-muted)">${risk.financial_impact || '--'}</div>
        </div>
        <div class="risk-item">
          <div class="risk-item-label">合规风险</div>
          <div class="risk-item-value" style="font-size:11px;color:var(--text-muted)">${risk.compliance_risk || '--'}</div>
        </div>
        <div class="risk-item">
          <div class="risk-item-label">声誉风险</div>
          <div class="risk-item-value" style="font-size:11px;color:var(--text-muted)">${risk.reputation_risk || '--'}</div>
        </div>
      </div>
    </div>

    <!-- Key Points -->
    ${keyPointsHtml ? `
    <div class="detail-section">
      <div class="detail-section-title">📌 关键行动点</div>
      <div class="key-points-list">${keyPointsHtml}</div>
    </div>` : ''}

    <!-- Subtasks -->
    <div class="detail-section">
      <div class="detail-section-title">📋 执行步骤</div>
      ${hasSubtasks ? `<div class="subtask-list">${subtasksHtml}</div>` : ''}
      <button class="btn-decompose" style="margin-top:${hasSubtasks?'10px':'0'}" onclick="decomposeTask('${task.id}')">
        ✦ ${hasSubtasks ? '重新拆解任务步骤' : 'AI 智能拆解任务步骤'}
      </button>
    </div>

    <!-- Recommendation -->
    ${task.recommendation ? `
    <div class="detail-section">
      <div class="detail-section-title">💡 AI 优化建议</div>
      <div class="recommendation-box">${task.recommendation}</div>
      ${task.delegation_suggestion ? `<div style="margin-top:8px;font-size:12px;color:var(--text-muted)">授权建议: ${task.delegation_suggestion}</div>` : ''}
    </div>` : ''}
  `;
}

// ── Decompose Task ─────────────────────────────────────────
async function decomposeTask(taskId) {
  showOverlay(true);
  try {
    const res = await fetch(`${API}/api/tasks/${taskId}/decompose`, {
      method: 'POST',
      headers: { 'X-API-Key': getKey() }
    });
    if (!res.ok) throw new Error();
    const updated = await res.json();
    const idx = tasks.findIndex(t => t.id === taskId);
    if (idx !== -1) tasks[idx] = updated;
    showTaskDetail(updated);
  } catch {
    alert('拆解失败，请重试');
  } finally {
    showOverlay(false);
  }
}

// ── Delete Task ────────────────────────────────────────────
async function deleteTask(e, taskId) {
  e.stopPropagation();
  if (!confirm('确认删除此任务？')) return;
  try {
    await fetch(`${API}/api/tasks/${taskId}`, { method: 'DELETE' });
    tasks = tasks.filter(t => t.id !== taskId);
    if (selectedTaskId === taskId) {
      selectedTaskId = null;
      document.getElementById('detail-empty').classList.remove('hidden');
      document.getElementById('detail-content').classList.add('hidden');
    }
    renderAll();
  } catch {
    alert('删除失败');
  }
}

// ── Filter by Quadrant (UI feedback only) ──────────────────
function filterQuadrant(q) {
  // Highlight clicked quadrant
  ['Q1', 'Q2', 'Q3', 'Q4'].forEach(qq => {
    document.getElementById(`quad-${qq}`).style.opacity = qq === q ? '1' : '0.6';
  });
  setTimeout(() => {
    ['Q1', 'Q2', 'Q3', 'Q4'].forEach(qq => {
      document.getElementById(`quad-${qq}`).style.opacity = '1';
    });
  }, 600);
}

// ── Clear All ──────────────────────────────────────────────
async function clearAll() {
  if (!tasks.length || !confirm('确认清空所有任务？')) return;
  for (const t of tasks) {
    try { await fetch(`${API}/api/tasks/${t.id}`, { method: 'DELETE' }); } catch {}
  }
  tasks = [];
  selectedTaskId = null;
  document.getElementById('detail-empty').classList.remove('hidden');
  document.getElementById('detail-content').classList.add('hidden');
  renderAll();
}

// ── UI Helpers ─────────────────────────────────────────────
function showOverlay(show) {
  document.getElementById('overlay').classList.toggle('hidden', !show);
}
function setSubmitState(loading) {
  const btn = document.getElementById('submit-btn');
  const label = document.getElementById('btn-label');
  btn.disabled = loading;
  label.textContent = loading ? 'AI 分析中...' : 'AI 分析并排序';
}
