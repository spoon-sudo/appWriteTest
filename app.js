// Initialize Appwrite SDK
const { Client, Account, ID } = Appwrite;

// Check if we're using 127.0.0.1 instead of localhost and redirect if needed
function checkAndRedirectToLocalhost() {
    if (window.location.hostname === '127.0.0.1') {
        const newUrl = window.location.href.replace('127.0.0.1', 'localhost');
        window.location.replace(newUrl);
    }
}

// Run the check immediately
checkAndRedirectToLocalhost();

const client = new Client()
    .setEndpoint('https://cloud.appwrite.io/v1') // Replace with your Appwrite endpoint
    .setProject('67eea53e001c4b06d031');              // Replace with your project ID

const account = new Account(client);

// Check if user is already logged in
async function checkUserSession() {
    try {
        const user = await account.get();
        showUserProfile(user);
    } catch (error) {
        console.log('User is not logged in');
    }
}

// Function to show user profile
function showUserProfile(user) {
    document.getElementById('login-section').style.display = 'none';
    document.getElementById('signup-section').style.display = 'none';
    document.getElementById('user-section').style.display = 'block';
    
    document.getElementById('user-name').textContent = user.name;
    document.getElementById('user-email').textContent = user.email;
}

// Event listener for login form
document.getElementById('login-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    
    try {
        const session = await account.createEmailSession(email, password);
        const user = await account.get();
        showUserProfile(user);
    } catch (error) {
        console.error('Login failed', error);
        alert('Login failed: ' + error.message);
    }
});

// Event listener for signup form
document.getElementById('signup-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const name = document.getElementById('signup-name').value;
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;
    
    try {
        const user = await account.create(ID.unique(), email, password, name);
        await account.createEmailSession(email, password);
        showUserProfile(user);
    } catch (error) {
        console.error('Signup failed', error);
        alert('Signup failed: ' + error.message);
    }
});

// Event listener for logout button
document.getElementById('logout-btn').addEventListener('click', async function() {
    try {
        await account.deleteSession('current');
        document.getElementById('login-section').style.display = 'block';
        document.getElementById('user-section').style.display = 'none';
    } catch (error) {
        console.error('Logout failed', error);
    }
});

// Toggle between login and signup forms
document.getElementById('show-signup').addEventListener('click', function(e) {
    e.preventDefault();
    document.getElementById('login-section').style.display = 'none';
    document.getElementById('signup-section').style.display = 'block';
});

document.getElementById('show-login').addEventListener('click', function(e) {
    e.preventDefault();
    document.getElementById('login-section').style.display = 'block';
    document.getElementById('signup-section').style.display = 'none';
});

// Check user session on page load
document.addEventListener('DOMContentLoaded', checkUserSession);