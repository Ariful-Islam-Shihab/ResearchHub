// Authentication related javascript
// Will be used for Login/Signup interactions and API calls

document.addEventListener('DOMContentLoaded', () => {
    console.log("Auth JS loaded.");

    // Password visibility toggle logic
    const toggleButtons = document.querySelectorAll('button');
    toggleButtons.forEach(btn => {
        const icon = btn.querySelector('.material-symbols-outlined');
        if (icon && (icon.textContent.trim() === 'visibility' || icon.textContent.trim() === 'visibility_off')) {
            btn.addEventListener('click', () => {
                // Find the input field relative to the button
                // In our markup, the input is in the same relative container
                const input = btn.parentElement.querySelector('input');
                if (input) {
                    if (input.type === 'password') {
                        input.type = 'text';
                        icon.textContent = 'visibility_off';
                    } else {
                        input.type = 'password';
                        icon.textContent = 'visibility';
                    }
                }
            });
        }
    });

    // --- Signup Form Handler ---
    const signupForm = document.getElementById('signupForm');
    if (signupForm) {
        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const fullName = document.getElementById('signupName').value;
            const email = document.getElementById('signupEmail').value;
            const password = document.getElementById('signupPassword').value;
            const confirm = document.getElementById('signupConfirm').value;
            const university = document.getElementById('signupUniversity').value;
            const researchInterests = document.getElementById('signupInterests').value;

            if (password !== confirm) {
                alert("Passwords do not match!");
                return;
            }

            try {
                const response = await fetch(`${API_CONFIG.BASE_URL}/auth/signup`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ fullName, email, password, university, researchInterests })
                });
                
                const data = await response.json();
                if (data.success) {
                    alert(data.message);
                    window.location.href = 'login.html';
                } else {
                    alert("Error: " + data.message);
                }
            } catch (error) {
                console.error("Signup error:", error);
                alert("Failed to connect to the server. Is it running?");
            }
        });
    }

    // --- Login Form Handler ---
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;

            try {
                const response = await fetch(`${API_CONFIG.BASE_URL}/auth/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });
                
                const data = await response.json();
                if (data.success) {
                    alert(data.message + " Welcome, " + (data.data.full_name || data.data.email) + "!");
                    localStorage.setItem('user', JSON.stringify(data.data));
                    window.location.href = 'dashboard.html'; 
                } else {
                    alert("Error: " + data.message);
                }
            } catch (error) {
                console.error("Login error:", error);
                alert("Failed to connect to the server. Is it running?");
            }
        });
    }
});
