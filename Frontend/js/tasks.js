// ─── Tasks ───────────────────────────────────────────────────────────────────
let tasks = [];

async function loadTasks() {
    try {
        const res = await fetch(`${API_CONFIG.BASE_URL}/projects/${projectId}/tasks`);
        const result = await res.json();
        if (result.success) {
            tasks = result.data || [];
            renderTasks();
        }
    } catch (err) {
        console.error('Failed to load tasks:', err);
    }
}

function renderTasks() {
    // Clear all columns
    const columns = ['todo', 'in_progress', 'review', 'done'];
    columns.forEach(status => {
        const col = document.getElementById(`col-${status}`);
        if(col) col.innerHTML = '';
        const count = document.getElementById(`count-${status}`);
        if(count) count.textContent = '0';
    });

    const taskCountEl = document.getElementById('taskCount');
    if(taskCountEl) taskCountEl.textContent = `${tasks.length} tasks`;

    tasks.forEach(task => {
        const status = task.status || 'todo';
        const col = document.getElementById(`col-${status}`);
        if (col) {
            col.appendChild(createTaskElement(task));
        }
    });

    // Update counts
    columns.forEach(status => {
        const countStr = tasks.filter(t => t.status === status).length;
        const countEl = document.getElementById(`count-${status}`);
        if(countEl) countEl.textContent = countStr;
    });
}

function getPriorityColor(priority) {
    switch (priority) {
        case 'urgent': return 'bg-error text-on-error';
        case 'high': return 'bg-tertiary-container text-on-tertiary-container';
        case 'medium': return 'bg-secondary-container text-on-secondary-container';
        case 'low': return 'bg-surface-container-highest text-on-surface-variant';
        default: return 'bg-surface-container-highest text-on-surface-variant';
    }
}

function createTaskElement(task) {
    const el = document.createElement('div');
    el.className = 'bg-surface-container-lowest border border-outline-variant p-sm rounded cursor-pointer hover:border-primary/50 hover:shadow-md transition-all group flex flex-col gap-xs';
    el.draggable = true;
    el.dataset.taskId = task.id;
    el.onclick = () => openTaskDetail(task.id);

    const priorityBadge = `<span class="px-[6px] py-[2px] rounded text-[10px] font-label-caps uppercase ${getPriorityColor(task.priority)}">${task.priority}</span>`;
    
    let assigneeHtml = '';
    if (task.assigned_to_name) {
        assigneeHtml = `
            <div class="w-6 h-6 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center font-code-sm text-[10px]" title="${escapeHtml(task.assigned_to_name)}">
                ${getInitials(task.assigned_to_name)}
            </div>
        `;
    }

    let dueDateHtml = '';
    if (task.due_date) {
        const isOverdue = new Date(task.due_date) < new Date() && task.status !== 'done';
        dueDateHtml = `
            <div class="flex items-center gap-[2px] text-[11px] font-code-sm ${isOverdue ? 'text-error' : 'text-on-surface-variant'}">
                <span class="material-symbols-outlined text-[14px]">calendar_today</span>
                ${formatDate(task.due_date)}
            </div>
        `;
    }

    el.innerHTML = `
        <div class="flex justify-between items-start gap-xs">
            <h4 class="font-body-base text-body-base text-on-surface leading-tight break-words">${escapeHtml(task.title)}</h4>
            <div class="shrink-0 flex gap-xs items-center opacity-0 group-hover:opacity-100 transition-opacity">
                <button onclick="deleteTask(event, ${task.id})" class="text-on-surface-variant hover:text-error transition-colors p-[2px]">
                    <span class="material-symbols-outlined text-[14px]">delete</span>
                </button>
            </div>
        </div>
        ${task.description ? `<p class="font-body-dense text-body-dense text-on-surface-variant line-clamp-2">${escapeHtml(task.description)}</p>` : ''}
        <div class="flex items-center justify-between mt-xs pt-xs border-t border-outline-variant/30">
            <div class="flex items-center gap-xs">
                ${priorityBadge}
                ${dueDateHtml}
            </div>
            ${assigneeHtml}
        </div>
    `;

    // Drag events
    el.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', task.id);
        el.classList.add('opacity-50');
    });
    el.addEventListener('dragend', () => {
        el.classList.remove('opacity-50');
    });

    return el;
}

// ─── Drag & Drop ─────────────────────────────────────────────────────────────
document.querySelectorAll('.dropzone').forEach(zone => {
    zone.addEventListener('dragover', e => {
        e.preventDefault(); // Necessary to allow dropping
        zone.classList.add('bg-surface-container-high');
    });
    zone.addEventListener('dragleave', () => {
        zone.classList.remove('bg-surface-container-high');
    });
    zone.addEventListener('drop', async e => {
        e.preventDefault();
        zone.classList.remove('bg-surface-container-high');
        
        const taskId = e.dataTransfer.getData('text/plain');
        if (!taskId) return;
        
        const newStatus = zone.dataset.status;
        const taskIndex = tasks.findIndex(t => t.id == taskId);
        if (taskIndex === -1) return;
        
        if (tasks[taskIndex].status !== newStatus) {
            const oldStatus = tasks[taskIndex].status;
            tasks[taskIndex].status = newStatus;
            renderTasks(); // Optimistic update
            
            try {
                const res = await fetch(`${API_CONFIG.BASE_URL}/projects/${projectId}/tasks/${taskId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: newStatus })
                });
                const result = await res.json();
                if (!result.success) {
                    throw new Error(result.message);
                }
            } catch (err) {
                // Revert
                tasks[taskIndex].status = oldStatus;
                renderTasks();
                showToast('Failed to move task: ' + err.message, 'error');
            }
        }
    });
});

// ─── Task Modals ─────────────────────────────────────────────────────────────
function populateAssigneeSelect() {
    const select = document.getElementById('taskAssigneeInput');
    if(!select) return;
    const options = activeMembers.map(m => `<option value="${m.user_id}">${escapeHtml(m.full_name)}</option>`);
    select.innerHTML = '<option value="">Unassigned</option>' + options.join('');
}

function openCreateTaskModal() {
    populateAssigneeSelect();
    document.getElementById('createTaskForm').reset();
    const modal = document.getElementById('createTaskModal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeCreateTaskModal() {
    const modal = document.getElementById('createTaskModal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

async function submitCreateTask(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.textContent;
    btn.textContent = 'Creating...';
    btn.disabled = true;

    const payload = {
        title: document.getElementById('taskTitleInput').value.trim(),
        description: document.getElementById('taskDescInput').value.trim(),
        priority: document.getElementById('taskPriorityInput').value,
        dueDate: document.getElementById('taskDateInput').value,
        assignedTo: document.getElementById('taskAssigneeInput').value,
        createdBy: currentUser.id,
        status: 'todo'
    };

    try {
        const res = await fetch(`${API_CONFIG.BASE_URL}/projects/${projectId}/tasks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await res.json();
        
        if (result.success) {
            tasks.unshift(result.data);
            renderTasks();
            closeCreateTaskModal();
            showToast('Task created successfully');
        } else {
            showToast('Failed to create task: ' + result.message, 'error');
        }
    } catch (err) {
        console.error('Error creating task:', err);
        showToast('An error occurred while creating the task', 'error');
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

async function deleteTask(e, taskId) {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this task?')) return;

    try {
        const res = await fetch(`${API_CONFIG.BASE_URL}/projects/${projectId}/tasks/${taskId}`, {
            method: 'DELETE'
        });
        const result = await res.json();
        
        if (result.success) {
            tasks = tasks.filter(t => t.id !== taskId);
            renderTasks();
            showToast('Task deleted');
        } else {
            showToast('Failed to delete task: ' + result.message, 'error');
        }
    } catch (err) {
        showToast('An error occurred while deleting the task', 'error');
    }
}

// ─── Task Details & Subtasks ──────────────────────────────────────────────────
let currentDetailTaskId = null;

function openTaskDetail(taskId) {
    currentDetailTaskId = taskId;
    
    // Populate Assignee dropdown
    const select = document.getElementById('detailTaskAssignee');
    const options = activeMembers.map(m => `<option value="${m.user_id}">${escapeHtml(m.full_name)}</option>`);
    select.innerHTML = '<option value="">Unassigned</option>' + options.join('');

    // Open panel
    const panel = document.getElementById('taskDetailPanel');
    panel.classList.remove('translate-x-full');

    loadTaskDetails(taskId);
}

function closeTaskDetail() {
    const panel = document.getElementById('taskDetailPanel');
    panel.classList.add('translate-x-full');
    currentDetailTaskId = null;
}

async function loadTaskDetails(taskId) {
    try {
        const res = await fetch(`${API_CONFIG.BASE_URL}/projects/${projectId}/tasks/${taskId}/details`);
        const result = await res.json();
        
        if (result.success) {
            renderTaskDetails(result.data);
        } else {
            showToast('Failed to load task details: ' + result.message, 'error');
        }
    } catch (err) {
        console.error('Error loading task details:', err);
        showToast('Error loading task details', 'error');
    }
}

function renderTaskDetails(data) {
    // Populate metadata
    document.getElementById('detailTaskTitle').value = data.title || '';
    document.getElementById('detailTaskDesc').value = data.description || '';
    document.getElementById('detailTaskStatus').value = data.status || 'todo';
    document.getElementById('detailTaskPriority').value = data.priority || 'medium';
    document.getElementById('detailTaskAssignee').value = data.assigned_to || '';
    document.getElementById('detailTaskDate').value = data.due_date ? data.due_date.split('T')[0] : '';

    // Setup auto-save listeners for inputs
    const fields = [
        { id: 'detailTaskTitle', key: 'title' },
        { id: 'detailTaskDesc', key: 'description' },
        { id: 'detailTaskStatus', key: 'status' },
        { id: 'detailTaskPriority', key: 'priority' },
        { id: 'detailTaskAssignee', key: 'assignedTo' },
        { id: 'detailTaskDate', key: 'dueDate' }
    ];

    fields.forEach(f => {
        const el = document.getElementById(f.id);
        el.onchange = (e) => updateTaskField(f.key, e.target.value);
    });

    // Subtasks
    const subtaskList = document.getElementById('subtaskList');
    subtaskList.innerHTML = '';
    
    let completedCount = 0;
    const subtasks = data.subtasks || [];
    subtasks.forEach(st => {
        if (st.is_completed) completedCount++;
        const div = document.createElement('div');
        div.className = 'flex items-center justify-between gap-sm p-xs hover:bg-surface-container rounded group transition-colors';
        div.innerHTML = `
            <label class="flex items-center gap-sm cursor-pointer flex-1">
                <input type="checkbox" ${st.is_completed ? 'checked' : ''} onchange="toggleSubtask(${st.id}, this.checked)" class="w-4 h-4 text-primary bg-surface-container border-outline-variant rounded focus:ring-primary">
                <span class="font-body-base text-body-base ${st.is_completed ? 'text-on-surface-variant line-through' : 'text-on-surface'} transition-all">${escapeHtml(st.title)}</span>
            </label>
            <button onclick="deleteSubtask(${st.id})" class="text-on-surface-variant hover:text-error opacity-0 group-hover:opacity-100 transition-all p-xs">
                <span class="material-symbols-outlined text-[16px]">close</span>
            </button>
        `;
        subtaskList.appendChild(div);
    });

    const totalSubtasks = subtasks.length;
    const progressText = document.getElementById('subtaskProgressText');
    const progressBar = document.getElementById('subtaskProgressBar');
    
    progressText.textContent = `${completedCount}/${totalSubtasks}`;
    const percent = totalSubtasks === 0 ? 0 : (completedCount / totalSubtasks) * 100;
    progressBar.style.width = `${percent}%`;

    // Updates/Activity
    const updatesList = document.getElementById('updatesList');
    updatesList.innerHTML = '';
    const updates = data.updates || [];
    updates.forEach(u => {
        const div = document.createElement('div');
        div.className = 'bg-surface-container-lowest border border-outline-variant rounded p-sm flex flex-col gap-xs';
        
        let statusBadge = '';
        if (u.status_change) {
            statusBadge = `<span class="px-[6px] py-[2px] rounded bg-primary-container text-on-primary-container text-[10px] font-label-caps uppercase ml-xs">Moved to ${u.status_change.replace('_', ' ')}</span>`;
        }

        div.innerHTML = `
            <div class="flex items-center justify-between">
                <div class="flex items-center gap-xs">
                    <div class="w-6 h-6 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center font-code-sm text-[10px]">
                        ${getInitials(u.user_name)}
                    </div>
                    <span class="font-title-sm text-title-sm text-on-surface">${escapeHtml(u.user_name)}</span>
                    ${statusBadge}
                </div>
                <span class="font-body-sm text-body-sm text-on-surface-variant">${new Date(u.created_at).toLocaleString()}</span>
            </div>
            ${u.message ? `<p class="font-body-base text-body-base text-on-surface-variant mt-xs pl-8 whitespace-pre-wrap">${escapeHtml(u.message)}</p>` : ''}
        `;
        updatesList.appendChild(div);
    });
}

async function updateTaskField(fieldKey, value) {
    if (!currentDetailTaskId) return;

    try {
        const payload = {};
        payload[fieldKey] = value;
        
        const res = await fetch(`${API_CONFIG.BASE_URL}/projects/${projectId}/tasks/${currentDetailTaskId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const result = await res.json();
        if (result.success) {
            // Find task in local array and update it so Kanban reflects changes
            const taskIndex = tasks.findIndex(t => t.id == currentDetailTaskId);
            if (taskIndex !== -1) {
                tasks[taskIndex] = result.data;
                renderTasks();
            }
        } else {
            showToast('Failed to save field: ' + result.message, 'error');
        }
    } catch (err) {
        console.error('Error updating task field:', err);
        showToast('Error saving changes', 'error');
    }
}

async function addSubtask() {
    if (!currentDetailTaskId) return;
    const input = document.getElementById('newSubtaskInput');
    const title = input.value.trim();
    if (!title) return;

    try {
        const res = await fetch(`${API_CONFIG.BASE_URL}/projects/${projectId}/tasks/${currentDetailTaskId}/subtasks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title })
        });
        const result = await res.json();
        if (result.success) {
            input.value = '';
            loadTaskDetails(currentDetailTaskId);
        } else {
            showToast('Failed to add subtask', 'error');
        }
    } catch (err) {
        showToast('Error adding subtask', 'error');
    }
}

async function toggleSubtask(subtaskId, isCompleted) {
    if (!currentDetailTaskId) return;
    try {
        const res = await fetch(`${API_CONFIG.BASE_URL}/projects/${projectId}/tasks/${currentDetailTaskId}/subtasks/${subtaskId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_completed: isCompleted })
        });
        const result = await res.json();
        if (result.success) {
            loadTaskDetails(currentDetailTaskId);
        } else {
            showToast('Failed to update subtask', 'error');
        }
    } catch (err) {
        showToast('Error updating subtask', 'error');
    }
}

async function deleteSubtask(subtaskId) {
    if (!currentDetailTaskId) return;
    try {
        const res = await fetch(`${API_CONFIG.BASE_URL}/projects/${projectId}/tasks/${currentDetailTaskId}/subtasks/${subtaskId}`, {
            method: 'DELETE'
        });
        const result = await res.json();
        if (result.success) {
            loadTaskDetails(currentDetailTaskId);
        } else {
            showToast('Failed to delete subtask', 'error');
        }
    } catch (err) {
        showToast('Error deleting subtask', 'error');
    }
}

async function postUpdate() {
    if (!currentDetailTaskId) return;
    
    const msgInput = document.getElementById('newUpdateMessage');
    const statusInput = document.getElementById('newUpdateStatus');
    
    const message = msgInput.value.trim();
    const statusChange = statusInput.value;
    
    if (!message && !statusChange) return;

    const btn = event.target;
    btn.disabled = true;

    try {
        const res = await fetch(`${API_CONFIG.BASE_URL}/projects/${projectId}/tasks/${currentDetailTaskId}/updates`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                userId: currentUser.id,
                message: message,
                statusChange: statusChange
            })
        });
        const result = await res.json();
        if (result.success) {
            msgInput.value = '';
            statusInput.value = '';
            
            if (statusChange) {
                const taskIndex = tasks.findIndex(t => t.id == currentDetailTaskId);
                if (taskIndex !== -1) {
                    tasks[taskIndex].status = statusChange;
                    renderTasks();
                }
            }

            loadTaskDetails(currentDetailTaskId);
        } else {
            showToast('Failed to post update', 'error');
        }
    } catch (err) {
        showToast('Error posting update', 'error');
    } finally {
        btn.disabled = false;
    }
}
