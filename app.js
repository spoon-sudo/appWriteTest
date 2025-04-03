// Initialize Appwrite SDK
const { Client, Account, ID } = Appwrite;

// Configure allowed origins for Appwrite
const ALLOWED_ORIGINS = [
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'https://gsmeuav.tech'
];

// Check if current origin is allowed or redirect to a preferred origin
function handleOrigin() {
    const currentOrigin = window.location.origin;
    
    // If we're on the custom domain, it's already fine
    if (currentOrigin === 'https://gsmeuav.tech') {
        return;
    }
    
    // If we're on 127.0.0.1, redirect to localhost
    if (currentOrigin === 'http://127.0.0.1:5500') {
        const newUrl = window.location.href.replace('127.0.0.1', 'localhost');
        window.location.replace(newUrl);
        return;
    }
    
    // Check if we're on an allowed origin
    if (!ALLOWED_ORIGINS.includes(currentOrigin)) {
        console.warn('Running on an origin not configured in Appwrite:', currentOrigin);
    }
}

// Run the origin check immediately
handleOrigin();

const client = new Client()
    .setEndpoint('https://cloud.appwrite.io/v1') // Replace with your Appwrite endpoint
    .setProject('67eea53e001c4b06d031');              // Replace with your project ID

// Create a function to check the connection to Appwrite
async function checkAppwriteConnection() {
    try {
        console.log("Testing connection to Appwrite...");
        
        // Instead of checking with account.get(), which requires auth,
        // use a public API endpoint like locale
        const response = await fetch('https://cloud.appwrite.io/v1/locale', {
            method: 'GET',
            headers: {
                'X-Appwrite-Project': '67eea53e001c4b06d031',
            }
        });
        
        if (response.ok) {
            console.log("Connection to Appwrite successful!");
            return true;
        } else {
            const errorData = await response.json();
            console.error("Appwrite API error:", errorData);
            return false;
        }
    } catch (error) {
        console.error("Appwrite connection error:", error);
        
        // Show different messages based on error type
        if (error.message && error.message.includes('Failed to fetch')) {
            alert("Connection to Appwrite failed due to a CORS issue. Please make sure your domain is registered in the Appwrite console.");
        } else {
            alert("Connection to Appwrite failed: " + error.message);
        }
        
        return false;
    }
}

// Create the account object after checking connection
const account = new Account(client);

// Check if user is already logged in
async function checkUserSession() {
    try {
        // First check if we can connect to Appwrite
        const connectionOk = await checkAppwriteConnection();
        if (!connectionOk) {
            console.log("Couldn't establish connection to Appwrite");
            return;
        }
        
        // Then try to get the current user (may fail if not logged in)
        try {
            const user = await account.get();
            
            // Check if email is verified
            if (!user.emailVerification) {
                showVerificationNeeded(user);
            } else {
                showUserProfile(user);
            }
            console.log("User is logged in:", user);
        } catch (error) {
            if (error.code === 401) {
                console.log("User is not logged in (expected behavior)");
                // This is normal for not logged in users, don't show an error
            } else {
                console.error("Error getting user session:", error);
            }
        }
    } catch (error) {
        console.error("Error in checkUserSession:", error);
    }
}

// Show verification needed screen
function showVerificationNeeded(user) {
    document.getElementById('login-section').style.display = 'none';
    document.getElementById('signup-section').style.display = 'none';
    document.getElementById('user-section').style.display = 'none';
    document.getElementById('verification-section').style.display = 'block';
    
    document.getElementById('verification-email').textContent = user.email;
}

// Function to show user profile
function showUserProfile(user) {
    document.getElementById('login-section').style.display = 'none';
    document.getElementById('signup-section').style.display = 'none';
    document.getElementById('verification-section').style.display = 'none';
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
        // Check connection before attempting login
        if (await checkAppwriteConnection()) {
            const session = await account.createEmailSession(email, password);
            const user = await account.get();
            
            // Check if email is verified
            if (!user.emailVerification) {
                showVerificationNeeded(user);
                alert("Please verify your email before logging in.");
            } else {
                showUserProfile(user);
            }
        }
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
        // Check connection before attempting signup
        if (await checkAppwriteConnection()) {
            // Create user account
            const user = await account.create(ID.unique(), email, password, name);
            
            // Create session
            await account.createEmailSession(email, password);
            
            // Send verification email
            await account.createVerification(window.location.origin + '/verification-success.html');
            
            // Show verification needed screen
            showVerificationNeeded(user);
            alert("We've sent a verification email to your inbox. Please verify your email address to continue.");
        }
    } catch (error) {
        console.error('Signup failed', error);
        alert('Signup failed: ' + error.message + (error.code ? ` (code: ${error.code})` : ''));
    }
});

// Event listener for resend verification email
document.getElementById('resend-verification').addEventListener('click', async function() {
    try {
        await account.createVerification(window.location.origin + '/verification-success.html');
        alert("Verification email has been resent. Please check your inbox.");
    } catch (error) {
        console.error('Failed to resend verification email', error);
        alert('Failed to resend verification email: ' + error.message);
    }
});

// Event listener for logout button
document.getElementById('logout-btn').addEventListener('click', async function() {
    try {
        await account.deleteSession('current');
        document.getElementById('login-section').style.display = 'block';
        document.getElementById('user-section').style.display = 'none';
        document.getElementById('verification-section').style.display = 'none';
    } catch (error) {
        console.error('Logout failed', error);
    }
});

// Event listener for verification logout button
document.getElementById('verification-logout-btn').addEventListener('click', async function() {
    try {
        await account.deleteSession('current');
        document.getElementById('login-section').style.display = 'block';
        document.getElementById('verification-section').style.display = 'none';
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