/* =========================================================
   latex.js — CodeMirror Editor + LaTeX Compilation
   ========================================================= */

let editor = null;
let editorView = null;
let autoSaveTimer = null;
let isPdfVisible = false;
let availableCompilers = [];
let currentCompiler = 'pdflatex';
let currentMainFile = 'main.tex';

// Local backend URL (for /local/* routes that aren't proxied via /api)
function getLocalUrl() {
    return window.location.origin;
}

let docSyncWs = null;
let myClientId = Math.random().toString(36).substring(7);

function initDocSyncWs() {
    if (docSyncWs) docSyncWs.close();
    const centralHost = window.location.hostname || 'localhost';
    docSyncWs = new WebSocket(`ws://${centralHost}:8080/ws/latex`);
    docSyncWs.onopen = () => {
        console.log('Connected to real-time doc sync');
        joinDocSync();
    };
    docSyncWs.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            if (data.type === 'CHANGE' && typeof activeFileId !== 'undefined' && activeFileId && data.fileId === activeFileId.toString()) {
                if (editorView) {
                    const change = data.change;
                    editorView.replaceRange(change.text, change.from, change.to, 'remote');
                }
            } else if (data.type === 'USER_JOINED' && data.clientId !== myClientId) {
                // Someone joined, send them our current state ONLY if we have local unsaved changes
                // or if we are the 'host' (the one who has been here longer)
                const file = typeof openFiles !== 'undefined' ? openFiles.find(f => f.id === activeFileId) : null;
                if (editorView && typeof activeFileId !== 'undefined' && activeFileId) {
                    if (file && file.isDirty) {
                        docSyncWs.send(JSON.stringify({
                            type: 'SYNC_FULL',
                            fileId: activeFileId.toString(),
                            projectId: projectId.toString(),
                            targetClientId: data.clientId,
                            content: editorView.getValue()
                        }));
                    }
                }
            } else if (data.type === 'SYNC_FULL' && data.targetClientId === myClientId) {
                // Received full state from another user
                if (editorView && data.content !== editorView.getValue()) {
                    const cursor = editorView.getCursor();
                    editorView.setValue(data.content);
                    editorView.setCursor(cursor);
                }
            }
        } catch(e) {}
    };
    docSyncWs.onclose = () => {
        setTimeout(initDocSyncWs, 3000); // reconnect after 3 seconds
    };
}

function joinDocSync() {
    if (docSyncWs && docSyncWs.readyState === WebSocket.OPEN && typeof activeFileId !== 'undefined' && activeFileId) {
        docSyncWs.send(JSON.stringify({ type: 'JOIN', fileId: activeFileId.toString(), projectId: projectId.toString(), clientId: myClientId }));
    }
}

// ─── Initialize CodeMirror ───────────────────────────────────────────────────
function initEditor() {
    const editorContainer = document.getElementById('editorContainer');
    if (!editorContainer || editorView) return;
    
    initDocSyncWs(); // Start real-time sync

    // Create a basic textarea-based editor with syntax highlighting via CodeMirror 5
    // Using CodeMirror 5 CDN for simplicity and stability
    const textarea = document.createElement('textarea');
    textarea.id = 'latexEditorTextarea';
    textarea.style.display = 'none';
    editorContainer.appendChild(textarea);

    if (typeof CodeMirror !== 'undefined') {
        editorView = CodeMirror.fromTextArea(textarea, {
            mode: 'stex',
            theme: 'material-darker',
            lineNumbers: true,
            lineWrapping: true,
            matchBrackets: true,
            autoCloseBrackets: true,
            indentUnit: 4,
            tabSize: 4,
            indentWithTabs: false,
            styleActiveLine: true,
            foldGutter: true,
            gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter'],
            extraKeys: {
                'Ctrl-S': function() { saveCurrentFile(); },
                'Ctrl-B': function() { compileLatex(); },
                'Ctrl-P': function() { togglePdfPreview(); },
                'Ctrl-/': 'toggleComment'
            }
        });

        editorView.setSize('100%', '100%');

        // Listen for changes
        editorView.on('change', function(cm, changeObj) {
            if (activeFileId) {
                const file = openFiles.find(f => f.id === activeFileId);
                if (file) {
                    file.isDirty = true;
                    file.content = editorView.getValue();
                    renderFileTabs();

                    // Send change to real-time socket
                    if (changeObj.origin !== 'remote' && docSyncWs && docSyncWs.readyState === WebSocket.OPEN) {
                        docSyncWs.send(JSON.stringify({
                            type: 'CHANGE',
                            projectId: projectId.toString(),
                            fileId: activeFileId.toString(),
                            change: changeObj
                        }));
                    }
                }
            }
        });
    } else {
        // Fallback: plain textarea
        const fallbackTA = document.createElement('textarea');
        fallbackTA.id = 'fallbackEditor';
        fallbackTA.className = 'w-full h-full bg-surface-container-lowest text-on-surface font-mono text-sm p-md resize-none focus:outline-none';
        fallbackTA.style.fontFamily = "'JetBrains Mono', monospace";
        fallbackTA.placeholder = 'Open a file from the file tree to start editing...';
        editorContainer.innerHTML = '';
        editorContainer.appendChild(fallbackTA);

        fallbackTA.addEventListener('input', function() {
            if (activeFileId) {
                const file = openFiles.find(f => f.id === activeFileId);
                if (file) {
                    file.isDirty = true;
                    file.content = fallbackTA.value;
                    renderFileTabs();
                }
            }
        });

        fallbackTA.addEventListener('keydown', function(e) {
            if (e.ctrlKey && e.key === 's') { e.preventDefault(); saveCurrentFile(); }
            if (e.ctrlKey && e.key === 'b') { e.preventDefault(); compileLatex(); }
        });
    }

    showEditorPlaceholder();
}

function showEditorPlaceholder() {
    const placeholder = document.getElementById('editorPlaceholder');
    const editorWrap = document.getElementById('editorContainer');
    if (placeholder) placeholder.style.display = openFiles.length === 0 ? 'flex' : 'none';
    if (editorView) {
        editorView.getWrapperElement().style.display = openFiles.length === 0 ? 'none' : '';
    }
}

function setEditorContent(content, fileName) {
    if (editorView) {
        editorView.setValue(content || '');
        // Set mode based on file extension
        const ext = (fileName || '').split('.').pop().toLowerCase();
        const modeMap = {
            'tex': 'stex', 'sty': 'stex', 'cls': 'stex',
            'bib': 'stex', 'txt': 'text/plain', 'md': 'markdown',
            'json': 'application/json', 'csv': 'text/plain'
        };
        editorView.setOption('mode', modeMap[ext] || 'text/plain');
        editorView.clearHistory();
        editorView.getWrapperElement().style.display = '';
        const placeholder = document.getElementById('editorPlaceholder');
        if (placeholder) placeholder.style.display = 'none';
        setTimeout(() => editorView.refresh(), 10);
    } else {
        const ta = document.getElementById('fallbackEditor');
        if (ta) ta.value = content || '';
    }
}

function getEditorContent() {
    if (editorView) return editorView.getValue();
    const ta = document.getElementById('fallbackEditor');
    return ta ? ta.value : '';
}

function clearEditor() {
    if (editorView) {
        editorView.setValue('');
        editorView.getWrapperElement().style.display = 'none';
    } else {
        const ta = document.getElementById('fallbackEditor');
        if (ta) ta.value = '';
    }
    showEditorPlaceholder();
}

// ─── Detect compilers ────────────────────────────────────────────────────────
async function detectCompilers() {
    try {
        const res = await fetch(`${getLocalUrl()}/local/latex/compilers`);
        const result = await res.json();
        if (result.success) {
            availableCompilers = result.data || [];
            updateCompilerUI();
        }
    } catch (err) {
        console.log('Could not detect compilers (local backend may be offline)');
    }
}

function updateCompilerUI() {
    const select = document.getElementById('compilerSelect');
    if (!select) return;

    select.innerHTML = '';
    if (availableCompilers.length === 0) {
        select.innerHTML = '<option value="">No compiler found</option>';
        return;
    }

    availableCompilers.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.name;
        opt.textContent = c.name;
        if (c.name === currentCompiler) opt.selected = true;
        select.appendChild(opt);
    });
}

// ─── Compile LaTeX ───────────────────────────────────────────────────────────
async function compileLatex() {
    const compileBtn = document.getElementById('compileBtn');
    const logPanel = document.getElementById('compilerLogPanel');
    const logContent = document.getElementById('compilerLogContent');
    const statusBadge = document.getElementById('compileStatusBadge');

    if (compileBtn) {
        compileBtn.disabled = true;
        compileBtn.innerHTML = '<span class="material-symbols-outlined text-[14px] animate-spin">progress_activity</span> Compiling...';
    }
    if (statusBadge) {
        statusBadge.className = 'flex items-center gap-xs font-label-caps text-label-caps text-tertiary';
        statusBadge.innerHTML = '<span class="w-[6px] h-[6px] rounded-full bg-tertiary animate-pulse"></span>COMPILING';
    }

    // Show log panel
    if (logPanel) logPanel.classList.remove('hidden');
    if (logContent) logContent.textContent = 'Starting compilation...\n';

    // Save current file first if dirty
    if (activeFileId) {
        const file = openFiles.find(f => f.id === activeFileId);
        if (file && file.isDirty) {
            await saveCurrentFile();
        }
    }

    // Gather all open file contents as additional files
    let additionalFiles = {};
    for (const f of openFiles) {
        if (f.content && f.name !== currentMainFile) {
            additionalFiles[f.name] = f.content;
        }
    }

    // Also gather non-open files from the tree
    // Find the main file content
    let mainContent = '';
    const mainFileObj = openFiles.find(f => f.name === currentMainFile);
    if (mainFileObj) {
        mainContent = mainFileObj.content;
    } else {
        // Try to load it
        try {
            const mainInTree = fileTree.find(f => f.name === currentMainFile && !f.is_directory);
            if (mainInTree) {
                const res = await fetch(`${API_CONFIG.BASE_URL}/projects/${projectId}/files/${mainInTree.id}`);
                const result = await res.json();
                if (result.success) {
                    mainContent = result.data.content || '';
                }
            }
        } catch (e) {}
    }

    // Gather all .tex, .bib, .sty files from the tree for compilation
    for (const f of fileTree) {
        if (!f.is_directory && f.name !== currentMainFile) {
            const ext = f.name.split('.').pop().toLowerCase();
            if (['tex', 'bib', 'sty', 'cls'].includes(ext)) {
                // Check if we already have it open
                const openF = openFiles.find(of => of.id === f.id);
                if (openF) {
                    // Build the path considering parent folders
                    let path = buildFilePath(f);
                    additionalFiles[path] = openF.content;
                } else if (f.content) {
                    let path = buildFilePath(f);
                    additionalFiles[path] = f.content;
                }
            }
        }
    }

    try {
        const compiler = document.getElementById('compilerSelect')?.value || currentCompiler;
        const res = await fetch(`${getLocalUrl()}/local/latex/compile`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                projectId: projectId,
                compiler: compiler,
                mainFile: currentMainFile,
                content: mainContent,
                additionalFiles: additionalFiles,
                basePath: currentUser ? currentUser.local_sync_path : '',
                projectName: projectData ? projectData.title : ''
            })
        });
        const result = await res.json();

        if (logContent) {
            logContent.textContent = result.data?.log || result.message || 'Compilation completed';
            logContent.scrollTop = logContent.scrollHeight;
        }

        if (result.success) {
            if (statusBadge) {
                statusBadge.className = 'flex items-center gap-xs font-label-caps text-label-caps text-primary';
                statusBadge.innerHTML = '<span class="w-[6px] h-[6px] rounded-full bg-primary"></span>SUCCESS';
            }
            showToast(`Compiled in ${result.data?.duration || 0}ms`, 'success');

            // Always show the PDF on successful compile
            isPdfVisible = true;
            refreshPdfPreview();
        } else {
            if (statusBadge) {
                statusBadge.className = 'flex items-center gap-xs font-label-caps text-label-caps text-error';
                statusBadge.innerHTML = '<span class="w-[6px] h-[6px] rounded-full bg-error"></span>ERROR';
            }
            showToast('Compilation failed', 'error');
        }
    } catch (err) {
        if (logContent) logContent.textContent = 'Error: Could not reach local backend for compilation.\n' + err.message;
        if (statusBadge) {
            statusBadge.className = 'flex items-center gap-xs font-label-caps text-label-caps text-error';
            statusBadge.innerHTML = '<span class="w-[6px] h-[6px] rounded-full bg-error"></span>ERROR';
        }
    }

    if (compileBtn) {
        compileBtn.disabled = false;
        compileBtn.innerHTML = '<span class="material-symbols-outlined text-[14px]">play_arrow</span> Compile';
    }
}

function buildFilePath(file) {
    // Build relative path for files in subdirectories
    if (file.parent_id) {
        const parent = fileTree.find(f => f.id === file.parent_id);
        if (parent) {
            return parent.name + '/' + file.name;
        }
    }
    return file.name;
}

// ─── PDF Preview ─────────────────────────────────────────────────────────────
function togglePdfPreview() {
    const panel = document.getElementById('pdfPreviewPanel');
    if (!panel) return;

    isPdfVisible = !isPdfVisible;
    panel.classList.toggle('hidden', !isPdfVisible);

    if (isPdfVisible) {
        refreshPdfPreview();
    }

    // Update toggle button
    const btn = document.getElementById('togglePdfBtn');
    if (btn) {
        btn.classList.toggle('text-primary', isPdfVisible);
        btn.classList.toggle('bg-primary-container/10', isPdfVisible);
    }
}

function refreshPdfPreview() {
    const iframe = document.getElementById('pdfPreviewFrame');
    const placeholder = document.getElementById('pdfPlaceholder');
    if (!iframe) return;

    if (placeholder) placeholder.style.display = 'none';
    iframe.classList.remove('hidden');

    let pdfUrl = `${getLocalUrl()}/local/latex/pdf/${projectId}?mainFile=${encodeURIComponent(currentMainFile)}&t=${Date.now()}`;
    if (currentUser && currentUser.local_sync_path && projectData) {
        pdfUrl += `&basePath=${encodeURIComponent(currentUser.local_sync_path)}&projectName=${encodeURIComponent(projectData.title)}`;
    }
    iframe.src = pdfUrl;
}

// ─── Compiler log toggle ────────────────────────────────────────────────────
function toggleCompilerLog() {
    const panel = document.getElementById('compilerLogPanel');
    if (panel) panel.classList.toggle('hidden');
}

// ─── Load LaTeX settings ─────────────────────────────────────────────────────
async function loadLatexSettings() {
    try {
        const res = await fetch(`${getLocalUrl()}/local/latex/settings/${projectId}`);
        const result = await res.json();
        if (result.success && result.data) {
            currentCompiler = result.data.compiler || result.data.main_file ? undefined : 'pdflatex';
            currentCompiler = result.data.compiler || 'pdflatex';
            currentMainFile = result.data.main_file || result.data.mainFile || 'main.tex';
        }
    } catch (err) {
        // Use defaults
    }
}

// ─── Initialize the files tab ────────────────────────────────────────────────
function initFilesTab() {
    initEditor();
    detectCompilers();
    loadLatexSettings();
    loadFileTree();
}
