// ── State ──────────────────────────────────────────────────
const API = 'http://localhost:8000';
let tasks = [];
let selectedTaskId = null;
let completedIds = new Set(JSON.parse(localStorage.getItem('completed_ids') || '[]'));
let deletedBuffer = null;   // { task, timer }
let toastTimer = null;

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

// ── Theme ──────────────────────────────────────────────────
function getTheme() { return localStorage.getItem('theme') || 'dark'; }

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  document.getElementById('theme-icon').textContent = theme === 'dark' ? '☀️' : '🌙';
  localStorage.setItem('theme', theme);
}

function toggleTheme() {
  applyTheme(getTheme() === 'dark' ? 'light' : 'dark');
}

// ── Init ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('task-form').addEventListener('submit', handleSubmit);
  updateKeyStatus();
  applyTheme(getTheme());
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

// ── Submit Handler (streaming) ─────────────────────────────
async function handleSubmit(e) {
  e.preventDefault();
  const title = document.getElementById('f-title').value.trim();
  const description = document.getElementById('f-desc').value.trim();
  const deadline = document.getElementById('f-deadline').value;
  const stakeholders = document.getElementById('f-stakeholders').value.trim();

  if (!title || !description) return;

  const apiKey = getKey();
  if (!apiKey) { openKeyModal(); return; }

  setSubmitState(true);

  // Show placeholder chip immediately — no blocking overlay
  const placeholderId = 'ph-' + Date.now();
  showPlaceholderChip(placeholderId, title);
  document.getElementById('task-form').reset();

  try {
    const res = await fetch(`${API}/api/tasks/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
      body: JSON.stringify({ title, description, deadline: deadline || null, stakeholders: stakeholders || null })
    });

    if (!res.ok) {
      removePlaceholderChip(placeholderId);
      const err = await res.json();
      alert('分析失败: ' + (err.detail || '请检查 API Key 是否配置正确'));
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let charCount = 0;

    // Start real stopwatch on chip
    startChipStopwatch(placeholderId);

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = JSON.parse(line.slice(6));

        if (data.type === 'placed') {
          // Phase 1 done: move chip to correct quadrant immediately
          placeChipInQuadrant(placeholderId, data.quadrant, data.quadrant_label, data.priority_score);
        }

        if (data.type === 'chunk') {
          charCount++;
          updateChipProgress(placeholderId);
        }

        if (data.type === 'done') {
          removePlaceholderChip(placeholderId);
          const task = data.task;
          tasks.push(task);
          renderAll();
          showTaskDetail(task);
          selectedTaskId = task.id;
        }

        if (data.type === 'error') {
          removePlaceholderChip(placeholderId);
          alert('分析出错: ' + data.message);
        }
      }
    }
  } catch (err) {
    removePlaceholderChip(placeholderId);
    alert('无法连接到后端服务，请确认后端已启动 (port 8000)');
  } finally {
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
  const hasSteps = task.subtasks && task.subtasks.length > 0;
  const isDone = completedIds.has(task.id);

  div.innerHTML = `
    <div class="chip-main">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px">
        <input type="checkbox" class="chip-check" ${isDone ? 'checked' : ''}
          onclick="toggleComplete(event,'${task.id}')" title="标记完成" />
        <div class="chip-title" title="${task.title}">${task.title}</div>
      </div>
      <div class="chip-meta">
        <span class="chip-score" style="color:${scoreColor}">优先级 ${task.priority_score || '--'}</span>
        <span class="chip-deadline">${task.deadline || ''}</span>
        <button class="chip-steps-btn" onclick="toggleSteps(event,'${task.id}')" title="查看步骤">
          ${hasSteps ? '📋 步骤' : '✦ 拆解'}
        </button>
        <button class="chip-edit" onclick="openEditModal(event,'${task.id}')" title="编辑">✏️</button>
        <button class="chip-delete" onclick="deleteTask(event,'${task.id}')" title="删除">✕</button>
      </div>
    </div>
    <div class="chip-steps hidden" id="steps-${task.id}">
      ${hasSteps ? renderStepsHtml(task.subtasks) : '<div class="steps-loading">AI 正在拆解步骤...</div>'}
    </div>
  `;
  if (isDone) div.classList.add('completed');

  div.addEventListener('click', (e) => {
    if (e.target.closest('.chip-steps-btn') || e.target.closest('.chip-delete') || e.target.closest('.chip-steps')) return;
    selectedTaskId = task.id;
    document.querySelectorAll('.task-chip').forEach(c => c.classList.remove('active'));
    div.classList.add('active');
    showTaskDetail(task);
  });

  return div;
}

function renderStepsHtml(subtasks) {
  if (!subtasks || subtasks.length === 0) return '<div class="steps-empty">暂无步骤</div>';
  return subtasks.map(st => `
    <div class="chip-step-item">
      <div class="chip-step-num">${st.step}</div>
      <div class="chip-step-body">
        <div class="chip-step-title">${st.title}</div>
        <div class="chip-step-desc">${st.description || ''}</div>
        ${st.estimated_time ? `<div class="chip-step-time">⏱ ${st.estimated_time}</div>` : ''}
      </div>
    </div>
  `).join('');
}

async function toggleSteps(e, taskId) {
  e.stopPropagation();
  const stepsEl = document.getElementById(`steps-${taskId}`);
  const btn = e.target.closest('.chip-steps-btn');
  const isHidden = stepsEl.classList.contains('hidden');

  if (!isHidden) {
    stepsEl.classList.add('hidden');
    return;
  }

  stepsEl.classList.remove('hidden');

  const task = tasks.find(t => t.id === taskId);
  if (!task) return;

  // Already has steps — just show
  if (task.subtasks && task.subtasks.length > 0) {
    stepsEl.innerHTML = renderStepsHtml(task.subtasks);
    return;
  }

  // No steps yet — call decompose API
  btn.textContent = '⏳';
  btn.disabled = true;
  stepsEl.innerHTML = '<div class="steps-loading">AI 正在拆解步骤...</div>';

  try {
    const res = await fetch(`${API}/api/tasks/${taskId}/decompose`, {
      method: 'POST',
      headers: { 'X-API-Key': getKey() }
    });
    if (res.ok) {
      const updated = await res.json();
      const idx = tasks.findIndex(t => t.id === taskId);
      if (idx !== -1) tasks[idx] = updated;
      stepsEl.innerHTML = renderStepsHtml(updated.subtasks);
      btn.textContent = '📋 步骤';
    } else {
      stepsEl.innerHTML = '<div class="steps-empty">拆解失败，请重试</div>';
      btn.textContent = '✦ 拆解';
    }
  } catch {
    stepsEl.innerHTML = '<div class="steps-empty">网络错误，请重试</div>';
    btn.textContent = '✦ 拆解';
  } finally {
    btn.disabled = false;
  }
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

// ── Complete Toggle ────────────────────────────────────────
function toggleComplete(e, taskId) {
  e.stopPropagation();
  const chip = document.getElementById(`chip-${taskId}`);
  if (completedIds.has(taskId)) {
    completedIds.delete(taskId);
    chip.classList.remove('completed');
  } else {
    completedIds.add(taskId);
    chip.classList.add('completed');
  }
  localStorage.setItem('completed_ids', JSON.stringify([...completedIds]));
}

// ── Delete Task (with undo) ────────────────────────────────
async function deleteTask(e, taskId) {
  e.stopPropagation();
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;

  // Soft-delete: remove from UI first
  tasks = tasks.filter(t => t.id !== taskId);
  if (selectedTaskId === taskId) {
    selectedTaskId = null;
    document.getElementById('detail-empty').classList.remove('hidden');
    document.getElementById('detail-content').classList.add('hidden');
  }
  renderAll();

  // Store for undo (10s window)
  if (deletedBuffer?.timer) clearTimeout(deletedBuffer.timer);
  deletedBuffer = {
    task,
    timer: setTimeout(async () => {
      // Actually delete from backend after 10s
      try { await fetch(`${API}/api/tasks/${taskId}`, { method: 'DELETE' }); } catch {}
      deletedBuffer = null;
      hideToast();
    }, 10000)
  };

  showToast(`已删除「${task.title.slice(0, 12)}${task.title.length > 12 ? '…' : ''}」`);
}

async function undoDelete() {
  if (!deletedBuffer) return;
  clearTimeout(deletedBuffer.timer);
  const task = deletedBuffer.task;
  deletedBuffer = null;
  hideToast();
  tasks.push(task);
  renderAll();
}

function showToast(msg) {
  clearTimeout(toastTimer);
  document.getElementById('toast-msg').textContent = msg;
  document.getElementById('toast').classList.remove('hidden');
  toastTimer = setTimeout(hideToast, 10000);
}
function hideToast() {
  clearTimeout(toastTimer);
  document.getElementById('toast').classList.add('hidden');
}

// ── Edit Modal ─────────────────────────────────────────────
function openEditModal(e, taskId) {
  e.stopPropagation();
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;
  document.getElementById('edit-task-id').value = taskId;
  document.getElementById('edit-title').value = task.title;
  document.getElementById('edit-desc').value = task.description;
  document.getElementById('edit-deadline').value = task.deadline || '';
  document.getElementById('edit-stakeholders').value = task.stakeholders || '';
  document.getElementById('edit-modal').classList.remove('hidden');
}
function closeEditModal() {
  document.getElementById('edit-modal').classList.add('hidden');
}

async function saveEdit() {
  const taskId = document.getElementById('edit-task-id').value;
  const title = document.getElementById('edit-title').value.trim();
  const description = document.getElementById('edit-desc').value.trim();
  const deadline = document.getElementById('edit-deadline').value;
  const stakeholders = document.getElementById('edit-stakeholders').value.trim();
  if (!title || !description) { alert('请填写标题和描述'); return; }

  closeEditModal();

  // Remove old task from list + UI
  tasks = tasks.filter(t => t.id !== taskId);
  if (selectedTaskId === taskId) {
    selectedTaskId = null;
    document.getElementById('detail-empty').classList.remove('hidden');
    document.getElementById('detail-content').classList.add('hidden');
  }
  // Also delete on backend
  try { await fetch(`${API}/api/tasks/${taskId}`, { method: 'DELETE' }); } catch {}

  // Re-analyze with new data (reuse submit flow)
  const apiKey = getKey();
  if (!apiKey) { openKeyModal(); return; }

  setSubmitState(true);
  const placeholderId = 'ph-edit-' + Date.now();
  showPlaceholderChip(placeholderId, title);

  try {
    const res = await fetch(`${API}/api/tasks/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
      body: JSON.stringify({ title, description, deadline: deadline || null, stakeholders: stakeholders || null })
    });
    if (!res.ok) { removePlaceholderChip(placeholderId); alert('重新分析失败'); return; }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    startChipCountdown(placeholderId);

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n'); buffer = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = JSON.parse(line.slice(6));
        if (data.type === 'quick') movePlaceholderToQuadrant(placeholderId, data.quadrant);
        if (data.type === 'chunk') updateChipProgress(placeholderId, Math.min(90, data.text.length));
        if (data.type === 'done') {
          stopChipCountdown(placeholderId);
          removePlaceholderChip(placeholderId);
          tasks.push(data.task);
          renderAll();
          showTaskDetail(data.task);
          selectedTaskId = data.task.id;
        }
        if (data.type === 'error') { stopChipCountdown(placeholderId); removePlaceholderChip(placeholderId); alert('分析失败'); }
      }
    }
  } catch { removePlaceholderChip(placeholderId); alert('连接失败'); }
  finally { setSubmitState(false); }
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

// ── Placeholder Chip (real stopwatch) ─────────────────────
const chipTimers = {};

function showPlaceholderChip(id, title) {
  const div = document.createElement('div');
  div.className = 'task-chip placeholder-chip';
  div.id = id;
  div.innerHTML = `
    <div class="chip-main">
      <div class="chip-title">${title}</div>
      <div class="chip-meta">
        <span class="chip-ph-label">AI 判断象限中</span>
        <span class="chip-stopwatch" id="sw-${id}">0.0s</span>
      </div>
    </div>
    <div class="chip-ph-bar-track">
      <div class="chip-ph-bar" id="bar-${id}"></div>
    </div>
  `;
  // Always start in Q2 staging area until Phase 1 tells us real quadrant
  document.getElementById('tasks-Q2').appendChild(div);
}

function startChipStopwatch(id) {
  const startTime = Date.now();
  chipTimers[id] = { startTime, phase: 1, chunks: 0 };

  const tick = setInterval(() => {
    const entry = chipTimers[id];
    if (!entry) { clearInterval(tick); return; }
    const elapsed = (Date.now() - startTime) / 1000;
    const swEl = document.getElementById(`sw-${id}`);
    const barEl = document.getElementById(`bar-${id}`);

    if (swEl) {
      if (entry.phase === 1) {
        swEl.textContent = `${elapsed.toFixed(1)}s`;
        swEl.style.color = 'var(--accent)';
      } else {
        swEl.textContent = `详情 ${elapsed.toFixed(1)}s`;
        swEl.style.color = 'var(--text-muted)';
      }
    }
    if (barEl && entry.phase === 1) {
      // Phase 1 bar pulses between 10–40%
      const pulse = 25 + 15 * Math.sin(elapsed * 3);
      barEl.style.width = pulse + '%';
    }
  }, 100);

  chipTimers[id].tick = tick;
}

function placeChipInQuadrant(id, quadrant, quadrantLabel, score) {
  const entry = chipTimers[id];
  if (!entry) return;

  // Freeze phase 1 stopwatch, show actual elapsed in green
  const elapsed = ((Date.now() - entry.startTime) / 1000).toFixed(1);
  const swEl = document.getElementById(`sw-${id}`);
  const barEl = document.getElementById(`bar-${id}`);
  const labelEl = document.querySelector(`#${id} .chip-ph-label`);

  if (swEl) {
    swEl.textContent = `✓ ${elapsed}s`;
    swEl.style.color = '#22c55e';
  }

  const color = quadrant === 'Q1' ? '#ef4444' : quadrant === 'Q2' ? '#3b82f6' : quadrant === 'Q3' ? '#f59e0b' : '#6b7280';
  if (labelEl) {
    labelEl.textContent = `${quadrantLabel || quadrant} · 优先级 ${score || '--'}`;
    labelEl.style.color = color;
  }
  if (barEl) {
    barEl.style.width = '30%';
    barEl.style.background = color;
    barEl.style.transition = 'width 0.4s ease';
  }

  // Move chip to correct quadrant
  const el = document.getElementById(id);
  if (el) {
    document.getElementById(`tasks-${quadrant}`).appendChild(el);
    el.classList.add('placeholder-placed');
  }

  // Enter phase 2: reset stopwatch origin, keep ticking
  entry.phase = 2;
  entry.startTime = Date.now();
  entry.chunks = 0;
}

function updateChipProgress(id) {
  const entry = chipTimers[id];
  if (!entry || entry.phase !== 2) return;
  entry.chunks = (entry.chunks || 0) + 1;
  const barEl = document.getElementById(`bar-${id}`);
  if (barEl) {
    // Grow from 30% → 90% over ~200 chunks
    const pct = 30 + Math.min(60, entry.chunks * 0.3);
    barEl.style.width = pct + '%';
  }
}

function removePlaceholderChip(id) {
  const entry = chipTimers[id];
  if (entry) {
    clearInterval(entry.tick);
    delete chipTimers[id];
  }
  const el = document.getElementById(id);
  if (el) el.remove();
}

// ── UI Helpers ─────────────────────────────────────────────
function showOverlay(show) {
  document.getElementById('overlay').classList.toggle('hidden', !show);
  if (show) setStreamProgress(0, '正在连接 AI...');
}
function setSubmitState(loading) {
  const btn = document.getElementById('submit-btn');
  const label = document.getElementById('btn-label');
  btn.disabled = loading;
  label.textContent = loading ? 'AI 分析中...' : 'AI 分析并排序';
}
function setStreamProgress(pct, text) {
  const bar = document.getElementById('stream-bar');
  const status = document.getElementById('stream-status');
  if (bar) bar.style.width = pct + '%';
  if (status && text) status.textContent = text;
}
