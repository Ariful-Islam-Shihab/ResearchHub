let isOnline = true;
let allProjects = [];
let currentFilter = 'all';
let currentUser = null;

document.addEventListener('DOMContentLoaded', () => {
    let isOnline = true;
    
    // 1. Authentication Check
    const userJson = localStorage.getItem('user');
    if (!userJson) {
        window.location.href = 'login.html';
        return;
    }
    
    currentUser = JSON.parse(userJson);
    const userNameDisplay = document.getElementById('userNameDisplay');
    if (userNameDisplay) {
        userNameDisplay.textContent = currentUser.name || currentUser.email || 'Researcher';
    }

    // Check for local_sync_path
    if (!currentUser.local_sync_path || currentUser.local_sync_path === 'null') {
        const syncPathModal = document.getElementById('syncPathModal');
        const syncPathModalContent = document.getElementById('syncPathModalContent');
        if (syncPathModal && syncPathModalContent) {
            syncPathModal.classList.remove('hidden');
            syncPathModal.classList.add('flex');
            // Remove opacity-0 permanently for testing just in case
            syncPathModalContent.classList.remove('opacity-0', 'scale-95');
            syncPathModalContent.classList.add('opacity-100', 'scale-100');
        } else {
            alert("Modal elements not found in HTML!");
        }
    }

    // Handle Sync Path Form Submission
    const syncPathForm = document.getElementById('syncPathForm');
    if (syncPathForm) {
        syncPathForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const path = document.getElementById('localSyncPathInput').value.trim();
            if (!path) return;
            
            try {
                const response = await fetch(`${API_CONFIG.BASE_URL}/users/${currentUser.id}/sync-path`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ local_sync_path: path })
                });
                const responseData = await response.json();
                if (responseData.success) {
                    // update local storage
                    currentUser.local_sync_path = path;
                    localStorage.setItem('user', JSON.stringify(currentUser));
                    
                    // Hide Modal
                    const syncPathModal = document.getElementById('syncPathModal');
                    const syncPathModalContent = document.getElementById('syncPathModalContent');
                    syncPathModalContent.classList.remove('scale-100', 'opacity-100');
                    syncPathModalContent.classList.add('scale-95', 'opacity-0');
                    
                    setTimeout(() => {
                        syncPathModal.classList.remove('flex');
                        syncPathModal.classList.add('hidden');
                    }, 200); // match transition duration
                } else {
                    alert('Error saving sync path: ' + response.message);
                }
            } catch (err) {
                console.error(err);
                alert('An error occurred while saving the sync path.');
            }
        });
    }



    // 2. Logout functionality
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('user');
            window.location.href = 'login.html';
        });
    }

    // 3. Gutter Resizing Logic
    const gutter = document.getElementById('gutter-1');
    const explorerPanel = document.getElementById('explorer-panel');
    
    let isResizing = false;

    if (gutter && explorerPanel) {
        gutter.addEventListener('mousedown', (e) => {
            isResizing = true;
            document.body.style.cursor = 'col-resize';
            explorerPanel.style.transition = 'none'; // Disable transition during drag
        });

        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            // Constrain width between min and max bounds for the explorer panel
            let newWidth = e.clientX - 48; // Subtract dock width
            if (newWidth > 150 && newWidth < 400) {
                explorerPanel.style.width = `${newWidth}px`;
            }
        });

        document.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false;
                document.body.style.cursor = 'default';
                explorerPanel.style.transition = 'all 0.3s ease'; // Re-enable transition
            }
        });
    }

    // 4. Modal Logic (3-Step Wizard)
    const createProjectModal = document.getElementById('createProjectModal');
    const createProjectModalContent = document.getElementById('createProjectModalContent');
    const createProjectBtn = document.getElementById('createProjectBtn');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const cancelProjectBtn = document.getElementById('cancelProjectBtn');
    const createProjectForm = document.getElementById('createProjectForm');
    
    // Step Containers
    const step1Container = document.getElementById('step-1-container');
    const step2Container = document.getElementById('step-2-container');
    const step3Container = document.getElementById('step-3-container');
    
    // Stepper UI
    const stepperSteps = [
        document.getElementById('stepper-step-1'),
        document.getElementById('stepper-step-2'),
        document.getElementById('stepper-step-3')
    ];
    
    // Navigation Buttons
    const nextStep1Btn = document.getElementById('nextStep1Btn');
    const prevStep2Btn = document.getElementById('prevStep2Btn');
    const nextStep2Btn = document.getElementById('nextStep2Btn');
    const prevStep3Btn = document.getElementById('prevStep3Btn');
    
    // State
    let currentStep = 1;
    let projectData = {
        title: '',
        description: '',
        domain: '',
        team: []
    };
    
    function updateStepperUI(step) {
        stepperSteps.forEach((stepper, index) => {
            if (!stepper) return;
            const stepNum = index + 1;
            const textEl = stepper.querySelector('.stepper-text');
            const circleEl = stepper.querySelector('.stepper-circle');
            const barEl = stepper.querySelector('.stepper-bar');
            
            if (stepNum < step) {
                // Completed
                stepper.classList.remove('opacity-50');
                textEl.classList.remove('text-primary', 'text-on-surface-variant');
                textEl.classList.add('text-on-surface');
                circleEl.classList.remove('bg-primary-container', 'text-on-primary-container');
                circleEl.classList.add('bg-surface-variant', 'text-on-surface');
                barEl.classList.remove('bg-primary');
                barEl.classList.add('bg-surface-variant');
            } else if (stepNum === step) {
                // Current
                stepper.classList.remove('opacity-50');
                textEl.classList.remove('text-on-surface-variant', 'text-on-surface');
                textEl.classList.add('text-primary');
                circleEl.classList.remove('bg-surface-variant', 'text-on-surface');
                circleEl.classList.add('bg-primary-container', 'text-on-primary-container');
                barEl.classList.remove('bg-surface-variant');
                barEl.classList.add('bg-primary');
            } else {
                // Future
                stepper.classList.add('opacity-50');
                textEl.classList.remove('text-primary', 'text-on-surface');
                textEl.classList.add('text-on-surface-variant');
                circleEl.classList.remove('bg-primary-container', 'text-on-primary-container');
                circleEl.classList.add('bg-surface-variant', 'text-on-surface');
                barEl.classList.remove('bg-primary');
                barEl.classList.add('bg-surface-variant');
            }
        });
    }

    function showStep(step) {
        currentStep = step;
        step1Container.classList.add('hidden');
        step1Container.classList.remove('flex');
        step2Container.classList.add('hidden');
        step2Container.classList.remove('flex');
        step3Container.classList.add('hidden');
        step3Container.classList.remove('flex');
        
        if (step === 1) {
            step1Container.classList.remove('hidden');
            step1Container.classList.add('flex');
        } else if (step === 2) {
            step2Container.classList.remove('hidden');
            step2Container.classList.add('flex');
        } else if (step === 3) {
            step3Container.classList.remove('hidden');
            step3Container.classList.add('flex');
            populateReview();
        }
        
        updateStepperUI(step);
    }
    
    function resetWizard() {
        projectData = { title: '', description: '', domain: '', team: [] };
        createProjectForm.reset();
        renderTeam();
        showStep(1);
    }

    function openModal() {
        if (!isOnline) {
            alert('Project creation requires an active internet connection to search for members.');
            return;
        }
        createProjectModal.classList.remove('hidden');
        createProjectModal.classList.add('flex');
        setTimeout(() => {
            createProjectModalContent.classList.remove('opacity-0', 'scale-95');
            createProjectModalContent.classList.add('opacity-100', 'scale-100');
        }, 10);
    }

    function closeModal() {
        createProjectModalContent.classList.remove('opacity-100', 'scale-100');
        createProjectModalContent.classList.add('opacity-0', 'scale-95');
        setTimeout(() => {
            createProjectModal.classList.add('hidden');
            createProjectModal.classList.remove('flex');
            resetWizard();
        }, 200); 
    }

    if (createProjectBtn) createProjectBtn.addEventListener('click', openModal);
    if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
    if (cancelProjectBtn) cancelProjectBtn.addEventListener('click', closeModal);
    
    // Navigation Events
    if (nextStep1Btn) {
        nextStep1Btn.addEventListener('click', () => {
            if (!createProjectForm.checkValidity()) {
                createProjectForm.reportValidity();
                return;
            }
            projectData.title = document.getElementById('projectTitle').value;
            projectData.description = document.getElementById('projectDescription').value;
            projectData.domain = document.getElementById('researchDomain').value;
            showStep(2);
        });
    }
    
    if (prevStep2Btn) prevStep2Btn.addEventListener('click', () => showStep(1));
    if (nextStep2Btn) nextStep2Btn.addEventListener('click', () => showStep(3));
    if (prevStep3Btn) prevStep3Btn.addEventListener('click', () => showStep(2));
    
    // Team Management
    const teamSearchInput = document.getElementById('teamSearchInput');
    const teamMembersList = document.getElementById('teamMembersList');
    
    function renderTeam() {
        const emptyMsg = document.getElementById('emptyTeamMsg');
        if (projectData.team.length === 0) {
            if (emptyMsg) emptyMsg.style.display = 'block';
            teamMembersList.querySelectorAll('.team-member-row').forEach(e => e.remove());
            return;
        }
        if (emptyMsg) emptyMsg.style.display = 'none';
        
        teamMembersList.querySelectorAll('.team-member-row').forEach(e => e.remove());
        
        projectData.team.forEach((member, index) => {
            const row = document.createElement('div');
            row.className = 'team-member-row h-[48px] border-b border-outline-variant flex items-center px-lg grid grid-cols-[3fr_2fr_1fr] gap-md hover:bg-surface-container transition-colors group';
            if (index % 2 !== 0) row.classList.add('bg-surface-container-low/50');
            
            row.innerHTML = `
                <div class="flex items-center gap-md truncate">
                    <div class="w-[28px] h-[28px] rounded-full bg-surface-variant flex items-center justify-center shrink-0 text-on-surface font-title-sm text-title-sm">
                        ${member.name.charAt(0).toUpperCase()}
                    </div>
                    <div class="flex flex-col truncate">
                        <span class="font-body-base text-body-base text-on-surface font-semibold truncate">${member.name}</span>
                        <span class="font-body-dense text-body-dense text-on-surface-variant truncate">${member.email}</span>
                    </div>
                </div>
                <div class="flex items-center">
                    <select class="role-select h-[32px] w-full bg-surface-container-lowest border border-outline-variant rounded px-sm font-body-base text-body-base text-on-surface focus:outline-none focus:border-primary-container transition-all py-1" data-index="${index}">
                        <option value="supervisor" ${member.role === 'supervisor' ? 'selected' : ''}>Supervisor</option>
                        <option value="teammate" ${member.role === 'teammate' ? 'selected' : ''}>Teammates</option>
                    </select>
                </div>
                <div class="flex items-center justify-end">
                    <button type="button" class="remove-member-btn w-[28px] h-[28px] flex items-center justify-center rounded hover:bg-surface-container-high text-on-surface-variant hover:text-error transition-colors" data-index="${index}">
                        <span class="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                </div>
            `;
            teamMembersList.appendChild(row);
        });
        
        // Bind role selects
        document.querySelectorAll('.role-select').forEach(select => {
            select.addEventListener('change', (e) => {
                const idx = parseInt(e.target.getAttribute('data-index'));
                projectData.team[idx].role = e.target.value;
            });
        });
        
        // Bind removes
        document.querySelectorAll('.remove-member-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(e.currentTarget.getAttribute('data-index'));
                projectData.team.splice(idx, 1);
                renderTeam();
            });
        });
    }

    let searchTimeout = null;
    let searchResultsDropdown = null;

    if (teamSearchInput) {
        // Create dropdown container
        searchResultsDropdown = document.createElement('ul');
        searchResultsDropdown.className = 'absolute z-50 w-full bg-surface border border-outline-variant rounded-md shadow-lg hidden max-h-48 overflow-y-auto mt-1';
        teamSearchInput.parentNode.appendChild(searchResultsDropdown);
        // Make the parent relative so the dropdown positions correctly
        teamSearchInput.parentNode.classList.add('relative');

        teamSearchInput.addEventListener('input', (e) => {
            const query = e.target.value.trim();
            if (searchTimeout) clearTimeout(searchTimeout);
            
            if (query.length < 2) {
                searchResultsDropdown.classList.add('hidden');
                return;
            }

            searchTimeout = setTimeout(async () => {
                try {
                    const res = await fetch(`${API_CONFIG.BASE_URL}/users/search?q=${encodeURIComponent(query)}`);
                    const data = await res.json();
                    
                    if (data.success && data.data.length > 0) {
                        searchResultsDropdown.innerHTML = '';
                        data.data.forEach(user => {
                            const li = document.createElement('li');
                            li.className = 'px-sm py-xs hover:bg-surface-container-high cursor-pointer flex flex-col border-b border-outline-variant/30 last:border-0';
                            li.innerHTML = `
                                <span class="font-body-base text-body-base text-on-surface font-semibold">${user.name}</span>
                                <span class="font-body-dense text-body-dense text-on-surface-variant">${user.email}</span>
                            `;
                            li.addEventListener('click', () => {
                                // Add to team
                                // Check if already in team
                                if (!projectData.team.find(m => m.id === user.id || m.email === user.email)) {
                                    projectData.team.push({ id: user.id, name: user.name, email: user.email, role: 'teammate' });
                                    renderTeam();
                                }
                                teamSearchInput.value = '';
                                searchResultsDropdown.classList.add('hidden');
                            });
                            searchResultsDropdown.appendChild(li);
                        });
                        searchResultsDropdown.classList.remove('hidden');
                    } else {
                        searchResultsDropdown.innerHTML = '<li class="px-sm py-xs text-on-surface-variant font-body-dense">No users found</li>';
                        searchResultsDropdown.classList.remove('hidden');
                    }
                } catch (error) {
                    console.error('Error searching users:', error);
                }
            }, 300);
        });

        // Hide dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (searchResultsDropdown && !teamSearchInput.contains(e.target) && !searchResultsDropdown.contains(e.target)) {
                searchResultsDropdown.classList.add('hidden');
            }
        });
    }

    function populateReview() {
        document.getElementById('reviewProjectName').textContent = projectData.title;
        document.getElementById('reviewProjectDesc').textContent = projectData.description || 'No description provided.';
        document.getElementById('reviewProjectDomain').textContent = projectData.domain || 'Not specified';
        
        const reviewTeamList = document.getElementById('reviewTeamList');
        reviewTeamList.innerHTML = '';
        
        // Add current user as Owner
        let totalCount = 1;
        const supervisorRow = document.createElement('div');
        supervisorRow.className = 'flex flex-col p-md bg-surface-container rounded border border-outline-variant/30';
        supervisorRow.innerHTML = `
            <span class="font-label-caps text-label-caps text-outline uppercase mb-xs">Creator (Owner)</span>
            <span class="font-title-sm text-title-sm text-on-surface">${currentUser.name || 'You'}</span>
        `;
        reviewTeamList.appendChild(supervisorRow);
        
        // Group by role
        const roles = {
            owner: [],
            supervisor: [],
            teammate: []
        };
        
        projectData.team.forEach(m => roles[m.role].push(m.name));
        totalCount += projectData.team.length;
        
        const roleLabels = {
            owner: 'Co-Owners',
            supervisor: 'Supervisors',
            teammate: 'Teammates'
        };
        
        for (const [role, names] of Object.entries(roles)) {
            if (names.length > 0) {
                const row = document.createElement('div');
                row.className = 'flex flex-col p-md bg-surface-container rounded border border-outline-variant/30 mt-md';
                row.innerHTML = `
                    <span class="font-label-caps text-label-caps text-outline uppercase mb-xs">${roleLabels[role]}</span>
                    <span class="font-body-base text-body-base text-on-surface">${names.join(', ')}</span>
                `;
                reviewTeamList.appendChild(row);
            }
        }
        
        document.getElementById('reviewTeamCount').textContent = `Total Personnel: ${totalCount}`;
    }

    // Handle form submit
    createProjectForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // Prevent submission if not on final step
        if (currentStep !== 3) return;
        
        const submitBtn = document.getElementById('submitProjectBtn');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="material-symbols-outlined animate-spin text-[18px]">progress_activity</span> <span>Creating...</span>';

        try {
            const response = await fetch(`${API_CONFIG.BASE_URL}/projects`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    userId: currentUser.id,
                    title: projectData.title,
                    description: projectData.description,
                    domain: projectData.domain,
                    team: projectData.team
                })
            });

            const result = await response.json();
            
            if (result.success) {
                // Initialize local directories if sync path is set
                if (currentUser.local_sync_path) {
                    try {
                        let localBaseUrl = API_CONFIG.getLocalBaseUrl();
                        const localRes = await fetch(localBaseUrl + '/init-project', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                basePath: currentUser.local_sync_path,
                                projectName: projectData.title
                            })
                        });
                        const localData = await localRes.json();
                        if (!localData.success) {
                            console.warn('Local initialization failed:', localData.message);
                        }
                    } catch (err) {
                        console.error('Could not connect to local backend for initialization:', err);
                    }
                }
                
                closeModal();
                fetchProjects(); // Refresh the list
            } else {
                alert(result.message || 'Failed to create project');
            }
        } catch (error) {
            console.error('Error creating project:', error);
            alert('An error occurred while creating the project.');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<span>Create Project</span><span class="material-symbols-outlined text-[18px]">rocket_launch</span>';
        }
    });

    // 5. Fetch Projects API
    fetchProjects();

    // 6. Network Status Logic
    const offlineBadge = document.getElementById('offlineBadge');
    
    async function updateOnlineStatus() {
        if (!offlineBadge) return;
        
        try {
            const response = await fetch(`${API_CONFIG.BASE_URL}/status`);
            const data = await response.json();
            
            if (data.centralOnline) {
                isOnline = true;
                offlineBadge.classList.add('hidden');
                offlineBadge.classList.remove('flex');
            } else {
                isOnline = false;
                offlineBadge.classList.remove('hidden');
                offlineBadge.classList.add('flex');
            }
        } catch (error) {
            // If local backend is down, we also consider it offline
            isOnline = false;
            offlineBadge.classList.remove('hidden');
            offlineBadge.classList.add('flex');
        }
    }

    // Check status every 10 seconds
    setInterval(updateOnlineStatus, 10000);
    
    // Initial check
    updateOnlineStatus();

    // 7. Tab Logic
    const tabAll = document.getElementById('tabAllProjects');
    const tabOwned = document.getElementById('tabOwnedProjects');
    const tabShared = document.getElementById('tabSharedProjects');
    const tabArchived = document.getElementById('tabArchivedProjects');
    const tabs = [tabAll, tabOwned, tabShared, tabArchived];

    function setActiveTab(activeTab) {
        tabs.forEach(tab => {
            if (!tab) return;
            tab.classList.remove('bg-primary-container/10', 'border-primary', 'text-primary');
            tab.classList.add('border-transparent', 'text-on-surface-variant');
            
            // Adjust icon styles
            const icon = tab.querySelector('span');
            if (icon) icon.style.fontVariationSettings = '';
        });
        
        if (activeTab) {
            activeTab.classList.remove('border-transparent', 'text-on-surface-variant');
            activeTab.classList.add('bg-primary-container/10', 'border-primary', 'text-primary');
            const icon = activeTab.querySelector('span');
            if (icon) icon.style.fontVariationSettings = "'FILL' 1";
        }
    }

    if (tabAll) tabAll.addEventListener('click', (e) => { e.preventDefault(); setActiveTab(tabAll); applyFilter('all'); });
    if (tabOwned) tabOwned.addEventListener('click', (e) => { e.preventDefault(); setActiveTab(tabOwned); applyFilter('owned'); });
    if (tabShared) tabShared.addEventListener('click', (e) => { e.preventDefault(); setActiveTab(tabShared); applyFilter('shared'); });
    if (tabArchived) tabArchived.addEventListener('click', (e) => { e.preventDefault(); setActiveTab(tabArchived); applyFilter('archived'); });

    // 8. Notifications Badge Logic
    const notificationBadge = document.getElementById('notificationBadge');

    // Fetch notifications initially to update badge
    fetchNotifications();
});

async function fetchProjects() {
    try {
        if (!currentUser) return;

        const response = await fetch(`${API_CONFIG.BASE_URL}/projects?userId=${currentUser.id}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const result = await response.json();
        
        if (result.success && result.data) {
            allProjects = result.data;
            applyFilter(currentFilter);
        } else {
            console.error('Failed to fetch projects:', result.message);
        }
    } catch (error) {
        console.error('Error fetching projects:', error);
    }
}

function applyFilter(filter) {
    currentFilter = filter;
    if (!currentUser) return;

    let filtered = [];
    if (filter === 'all') {
        filtered = allProjects.filter(p => p.status !== 'ARCHIVED');
    } else if (filter === 'owned') {
        filtered = allProjects.filter(p => p.owner_id === currentUser.id && p.status !== 'ARCHIVED');
    } else if (filter === 'shared') {
        filtered = allProjects.filter(p => p.owner_id !== currentUser.id && p.status !== 'ARCHIVED');
    } else if (filter === 'archived') {
        filtered = allProjects.filter(p => p.status === 'ARCHIVED');
    }

    renderProjects(filtered);
}

async function fetchNotifications() {
    if (!currentUser) return;
    
    try {
        const response = await fetch(`${API_CONFIG.BASE_URL}/member-requests/pending?userId=${currentUser.id}`);
        const result = await response.json();
        
        const badge = document.getElementById('notificationBadge');
        
        if (result.success && result.data) {
            const requests = result.data;
            
            // Update badge
            if (badge) {
                if (requests.length > 0) {
                    badge.classList.remove('hidden');
                } else {
                    badge.classList.add('hidden');
                }
            }
        }
    } catch (error) {
        console.error('Error fetching notifications:', error);
    }
}

function renderProjects(projects) {
    const projectsGrid = document.getElementById('projectsGrid');
    const projectCountDisplay = document.getElementById('projectCountDisplay');
    
    if (!projectsGrid || !projectCountDisplay) return;

    // Remove existing project cards, keep the "Initialize Analysis" widget
    const initWidget = projectsGrid.lastElementChild;
    projectsGrid.innerHTML = '';

    projects.forEach(project => {
        const article = document.createElement('article');
        article.className = 'bg-surface border border-outline-variant rounded-lg flex flex-col hover:border-primary/50 transition-colors group cursor-pointer';
        
        // When clicking a project, go to project workspace (to be built later)
        article.addEventListener('click', (e) => {
            // Prevent if clicked on menu button
            if(e.target.closest('button')) return;
            window.location.href = `project.html?id=${project.id}`;
        });

        article.innerHTML = `
            <!-- Header Strip -->
            <div class="h-[32px] bg-surface-container-high rounded-t-lg flex justify-between items-center px-md border-b border-outline-variant">
                <div class="flex items-center gap-sm">
                    <div class="w-2 h-2 rounded-full ${project.status === 'ACTIVE' ? 'bg-primary animate-pulse' : 'bg-surface-variant'}"></div>
                    <h3 class="font-title-sm text-title-sm text-on-surface">${project.title}</h3>
                </div>
                <div class="flex gap-xs relative z-50">
                    <button class="text-on-surface-variant hover:text-primary transition-colors p-xs flex items-center justify-center" onclick="window.location.href='project.html?id=${project.id}'">
                        <span class="material-symbols-outlined text-[16px]" data-icon="open_in_new">open_in_new</span>
                    </button>
                    <button class="text-on-surface-variant hover:text-on-surface transition-colors p-xs flex items-center justify-center" onclick="toggleDropdown(${project.id}, event)">
                        <span class="material-symbols-outlined text-[16px]" data-icon="more_vert">more_vert</span>
                    </button>
                    <!-- Dropdown Menu -->
                    <div id="dropdown-${project.id}" class="hidden absolute right-0 top-full mt-1 w-32 bg-surface-container border border-outline-variant rounded shadow-lg z-20 py-1 dropdown-menu">
                        ${project.status === 'ARCHIVED' ? `
                        <button class="w-full text-left px-4 py-2 text-sm hover:bg-surface-variant transition-colors text-on-surface flex items-center gap-2" onclick="unarchiveProject(${project.id}, event)">
                            <span class="material-symbols-outlined text-[16px]">unarchive</span> Unarchive
                        </button>
                        ` : `
                        <button class="w-full text-left px-4 py-2 text-sm hover:bg-surface-variant transition-colors text-on-surface flex items-center gap-2" onclick="archiveProject(${project.id}, event)">
                            <span class="material-symbols-outlined text-[16px]">archive</span> Archive
                        </button>
                        `}
                        ${project.owner_id === currentUser.id ? `
                        <button class="w-full text-left px-4 py-2 text-sm hover:bg-error/10 text-error transition-colors flex items-center gap-2" onclick="openDeleteModal(${project.id}, event)">
                            <span class="material-symbols-outlined text-[16px]">delete</span> Delete
                        </button>
                        ` : ''}
                    </div>
                </div>
            </div>
            <!-- Body -->
            <div class="p-md flex flex-col flex-1 gap-md">
                <p class="font-body-dense text-body-dense text-on-surface-variant line-clamp-3 leading-relaxed">
                    ${project.description || 'No description provided.'}
                </p>
                <!-- Telemetry / Status -->
                <div class="mt-auto pt-md border-t border-outline-variant/50 grid grid-cols-2 gap-sm">
                    <div class="flex flex-col gap-xs">
                        <span class="font-label-caps text-label-caps text-on-surface-variant">TEAM</span>
                        <div class="flex -space-x-2">
                            <div class="w-6 h-6 rounded-full border border-surface bg-surface-container-high flex items-center justify-center">
                                <span class="material-symbols-outlined text-[12px] text-on-surface-variant">person</span>
                            </div>
                        </div>
                    </div>
                    <div class="flex flex-col gap-xs items-end">
                        <span class="font-label-caps text-label-caps text-on-surface-variant">STATUS</span>
                        <span class="font-code-sm text-code-sm ${project.status === 'ACTIVE' ? 'text-primary' : 'text-on-surface-variant'}">${project.status}</span>
                    </div>
                </div>
            </div>
        `;
        
        projectsGrid.appendChild(article);
    });

    // Re-append the init widget at the end
    projectsGrid.appendChild(initWidget);

    // Update count
    projectCountDisplay.textContent = `Showing ${projects.length} active project${projects.length !== 1 ? 's' : ''}`;
}

// Click outside to close dropdowns
document.addEventListener('click', () => {
    document.querySelectorAll('.dropdown-menu').forEach(menu => {
        menu.classList.add('hidden');
    });
});

window.toggleDropdown = function(projectId, event) {
    event.stopPropagation();
    // Close others
    document.querySelectorAll('.dropdown-menu').forEach(menu => {
        if (menu.id !== `dropdown-${projectId}`) {
            menu.classList.add('hidden');
        }
    });
    const dropdown = document.getElementById(`dropdown-${projectId}`);
    if (dropdown) {
        dropdown.classList.toggle('hidden');
    }
};

window.archiveProject = async function(projectId, event) {
    event.stopPropagation();
    
    // Hide the dropdown immediately for visual feedback
    const dropdown = document.getElementById(`dropdown-${projectId}`);
    if (dropdown) dropdown.classList.add('hidden');
    
    try {
        const response = await fetch(`${API_CONFIG.BASE_URL}/projects/${projectId}/archive`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ userId: currentUser.id })
        });
        const result = await response.json();
        if (result.success) {
            // Refresh projects
            fetchProjects();
        } else {
            console.error('Error archiving project:', result.message);
            alert('Failed to archive project: ' + result.message);
        }
    } catch (error) {
        console.error('Error archiving project:', error);
    }
};

window.unarchiveProject = async function(projectId, event) {
    event.stopPropagation();
    
    // Hide the dropdown immediately for visual feedback
    const dropdown = document.getElementById(`dropdown-${projectId}`);
    if (dropdown) dropdown.classList.add('hidden');
    
    try {
        const response = await fetch(`${API_CONFIG.BASE_URL}/projects/${projectId}/unarchive`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ userId: currentUser.id })
        });
        const result = await response.json();
        if (result.success) {
            // Refresh projects
            fetchProjects();
        } else {
            console.error('Error unarchiving project:', result.message);
            alert('Failed to unarchive project: ' + result.message);
        }
    } catch (error) {
        console.error('Error unarchiving project:', error);
    }
};

// Start initialization

let projectToDelete = null;

window.openDeleteModal = function(projectId, event) {
    event.stopPropagation();
    projectToDelete = projectId;
    const modal = document.getElementById('deleteProjectModal');
    const content = document.getElementById('deleteProjectModalContent');
    if (modal && content) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        setTimeout(() => {
            content.classList.remove('scale-95', 'opacity-0');
            content.classList.add('scale-100', 'opacity-100');
        }, 10);
    }
};

window.closeDeleteModal = function() {
    projectToDelete = null;
    const modal = document.getElementById('deleteProjectModal');
    const content = document.getElementById('deleteProjectModalContent');
    if (modal && content) {
        content.classList.remove('scale-100', 'opacity-100');
        content.classList.add('scale-95', 'opacity-0');
        setTimeout(() => {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }, 200);
    }
};

document.addEventListener('DOMContentLoaded', () => {
    const cancelBtn = document.getElementById('cancelDeleteBtn');
    const confirmBtn = document.getElementById('confirmDeleteBtn');
    
    if (cancelBtn) {
        cancelBtn.addEventListener('click', closeDeleteModal);
    }
    
    if (confirmBtn) {
        confirmBtn.addEventListener('click', async () => {
            if (!projectToDelete) return;
            try {
                const response = await fetch(`${API_CONFIG.BASE_URL}/projects/${projectToDelete}`, {
                    method: 'DELETE',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ requesterId: currentUser.id })
                });
                const result = await response.json();
                if (result.success) {
                    closeDeleteModal();
                    fetchProjects();
                } else {
                    console.error('Error deleting project:', result.message);
                    alert('Failed to delete project: ' + result.message);
                }
            } catch (error) {
                console.error('Error deleting project:', error);
            }
        });
    }
});
