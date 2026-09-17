let currentUser = null;

document.addEventListener('DOMContentLoaded', () => {
    const userJson = localStorage.getItem('user');
    if (!userJson) {
        window.location.href = 'login.html';
        return;
    }

    currentUser = JSON.parse(userJson);

    // Logout functionality
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('user');
            window.location.href = 'login.html';
        });
    }

    const profileAvatar = document.getElementById('profileAvatar');
    const profileName = document.getElementById('profileName');
    const profileEmail = document.getElementById('profileEmail');
    const profileViewName = document.getElementById('profileViewName');
    const profileViewEmail = document.getElementById('profileViewEmail');

    if (profileAvatar) {
        profileAvatar.textContent = (currentUser.full_name || currentUser.name || currentUser.email || 'U').charAt(0).toUpperCase();
    }
    if (profileName) {
        profileName.textContent = currentUser.full_name || currentUser.name || 'User';
    }
    if (profileEmail) {
        profileEmail.textContent = currentUser.email || 'No email provided';
    }
    if (profileViewName) {
        profileViewName.textContent = currentUser.full_name || currentUser.name || 'User';
    }
    if (profileViewEmail) {
        profileViewEmail.textContent = currentUser.email || 'No email provided';
    }

    // Initial online status check
    updateOnlineStatus();

    // Edit Profile Logic
    const editProfileBtn = document.getElementById('editProfileBtn');
    const cancelEditBtn = document.getElementById('cancelEditBtn');
    const profileEditForm = document.getElementById('profileEditForm');
    const profileViewMode = document.getElementById('profileViewMode');
    const profileEditMode = document.getElementById('profileEditMode');
    const editNameInput = document.getElementById('editName');

    if (editProfileBtn) {
        editProfileBtn.addEventListener('click', () => {
            profileViewMode.classList.add('hidden');
            profileEditMode.classList.remove('hidden');
            editProfileBtn.classList.add('hidden');
            // currentUser has full_name, not name
            editNameInput.value = currentUser.full_name || currentUser.name || '';
        });
    }

    if (cancelEditBtn) {
        cancelEditBtn.addEventListener('click', () => {
            profileEditMode.classList.add('hidden');
            profileViewMode.classList.remove('hidden');
            editProfileBtn.classList.remove('hidden');
        });
    }

    if (profileEditForm) {
        profileEditForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            if (!navigator.onLine) {
                alert('You must be online to update your profile.');
                return;
            }

            const newName = document.getElementById('editName').value;
            const currentPassword = document.getElementById('currentPassword').value;
            const newPassword = document.getElementById('editPassword').value;

            if (!currentPassword.trim()) {
                alert('Current password is required to save changes.');
                return;
            }

            const hasName = newName.trim() !== '' && newName.trim() !== currentUser.full_name && newName.trim() !== currentUser.name;
            const hasPassword = newPassword.trim() !== '';

            if (!hasName && !hasPassword) {
                alert('Please provide a new name or a new password to update.');
                return;
            }

            try {
                const response = await fetch(`${API_CONFIG.BASE_URL}/users/${currentUser.id}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        name: hasName ? newName : '',
                        currentPassword: currentPassword,
                        password: newPassword
                    })
                });

                const result = await response.json();

                if (result.success) {
                    // Update current user locally if name was changed
                    if (newName.trim()) {
                        currentUser.full_name = newName;
                        localStorage.setItem('user', JSON.stringify(currentUser));

                        // Update UI
                        const profileNameEl = document.getElementById('profileName');
                        const profileAvatarEl = document.getElementById('profileAvatar');
                        const profileViewNameEl = document.getElementById('profileViewName');
                        
                        if (profileNameEl) profileNameEl.textContent = newName;
                        if (profileViewNameEl) profileViewNameEl.textContent = newName;
                        if (profileAvatarEl) profileAvatarEl.textContent = newName.charAt(0).toUpperCase();
                    }
                    
                    // Switch back to view mode
                    profileEditMode.classList.add('hidden');
                    profileViewMode.classList.remove('hidden');
                    editProfileBtn.classList.remove('hidden');
                    document.getElementById('currentPassword').value = '';
                    document.getElementById('editPassword').value = '';

                    alert('Profile updated successfully!');
                } else {
                    alert(result.message || 'Failed to update profile');
                }
            } catch (error) {
                console.error('Error updating profile:', error);
                alert('An error occurred while updating the profile.');
            }
        });
    }
});

window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);

function updateOnlineStatus() {
    const offlineBadge = document.getElementById('offlineBadge');
    if (offlineBadge) {
        if (!navigator.onLine) {
            offlineBadge.classList.remove('hidden');
            offlineBadge.classList.add('flex');
        } else {
            offlineBadge.classList.add('hidden');
            offlineBadge.classList.remove('flex');
        }
    }
}
