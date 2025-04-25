// Initialize Appwrite SDK
const { Client, Account, ID, Databases, Query, Permission, Role } = Appwrite;

// App config
const config = {
    endpoint: 'https://cloud.appwrite.io/v1',
    projectId: '67eea53e001c4b06d031',
    databaseId: 'cloudchat-db',
    friendsCollectionId: 'friends',
    messagesCollectionId: 'messages',
    usersCollectionId: 'users',
    callsCollectionId: 'calls'
};

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

// Initialize Appwrite client
const client = new Client()
    .setEndpoint(config.endpoint)
    .setProject(config.projectId);

// Create service instances
const account = new Account(client);
const databases = new Databases(client);

// App state
const state = {
    currentUser: null,
    friends: [],
    friendRequests: [],
    currentChat: null,
    messages: [],
    darkMode: localStorage.getItem('theme') === 'dark',
    savedAccounts: JSON.parse(localStorage.getItem('savedAccounts') || '[]'),
    // Call state
    localStream: null,
    peerConnection: null,
    callDocId: null
};

// Persist saved accounts
function persistAccounts() {
    localStorage.setItem('savedAccounts', JSON.stringify(state.savedAccounts));
}

// DOM elements
const elements = {
    authContainer: document.getElementById('auth-container'),
    chatContainer: document.getElementById('chat-container'),
    loginForm: document.getElementById('login-form'),
    signupForm: document.getElementById('signup-form'),
    currentUserName: document.getElementById('current-user-name'),
    friendsList: document.getElementById('friends-list'),
    friendRequestsList: document.getElementById('friend-requests-list'),
    messageInput: document.getElementById('message-input'),
    sendMessage: document.getElementById('send-message'),
    chatMessages: document.getElementById('chat-messages'),
    chatInterface: document.getElementById('chat-interface'),
    emptyChat: document.getElementById('empty-chat-state'),
    chatWithName: document.getElementById('chat-with-name'),
    friendSearch: document.getElementById('friend-search'),
    addFriendModal: document.getElementById('add-friend-modal'),
    friendEmail: document.getElementById('friend-email'),
    sendFriendRequest: document.getElementById('send-friend-request'),
    logoutBtn: document.getElementById('logout-btn'),
    switchAccountBtn: document.getElementById('switch-account-btn'),
    switchAccountModal: document.getElementById('switch-account-modal'),
    savedAccountsList: document.getElementById('saved-accounts-list'),
    closeSwitchAccountModal: document.getElementById('close-switch-account-modal'),
    addAccountBtn: document.getElementById('add-account-btn'),
    // Save current account UI
    saveCurrentContainer: document.getElementById('save-current-account-container'),
    saveCurrentPassword: document.getElementById('save-current-password'),
    saveCurrentAccountBtn: document.getElementById('save-current-account-btn'),
    remoteAudio: document.getElementById('remote-audio')
};

// Initialize app
async function initApp() {
    try {
        // Check if user is already logged in
        const user = await account.get();
        state.currentUser = user;
        // Ensure user document exists or update permissions
        await createUserDocument(state.currentUser);
        showChatInterface();
        await loadUserData();
        // Subscribe to signaling documents for calls
        client.subscribe(
            [`databases.${config.databaseId}.collections.${config.callsCollectionId}.documents`],
            (response) => handleCallSignal(response.payload)
        );
    } catch (error) {
        // User is not logged in, show auth interface
        console.log('User is not logged in:', error.message);
        showAuthInterface();
    }
}

// Show auth interface
function showAuthInterface() {
    elements.authContainer.style.display = 'flex';
    elements.chatContainer.style.display = 'none';
}

// Show chat interface
function showChatInterface() {
    elements.authContainer.style.display = 'none';
    elements.chatContainer.style.display = 'flex';
    elements.currentUserName.textContent = state.currentUser.name;
}

// Handle incoming signaling messages
async function handleCallSignal(payload) {
    const { $id, from, to, offer, answer, candidate } = payload;
    // Only handle calls where this user is the target
    if (to !== state.currentUser.$id) return;
    // If offer arrives, prompt to accept
    if (offer && !state.peerConnection) {
        if (!confirm(`Incoming call from ${from}. Accept?`)) return;
        // Create PeerConnection
        state.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        state.peerConnection = new RTCPeerConnection();
        state.localStream.getTracks().forEach(track => state.peerConnection.addTrack(track, state.localStream));
        state.peerConnection.ontrack = e => { elements.remoteAudio.srcObject = e.streams[0]; elements.remoteAudio.style.display = 'block'; };
        state.peerConnection.onicecandidate = e => {
            if (e.candidate) {
                databases.createDocument(
                    config.databaseId,
                    config.callsCollectionId,
                    ID.unique(),
                    { from: state.currentUser.$id, to: from, candidate: e.candidate, callId: $id }
                );
            }
        };
        await state.peerConnection.setRemoteDescription(offer);
        const ans = await state.peerConnection.createAnswer();
        await state.peerConnection.setLocalDescription(ans);
        // Send answer
        await databases.updateDocument(
            config.databaseId,
            config.callsCollectionId,
            $id,
            { answer: ans },
            []
        );
    }
    // Handle answer
    if (answer && state.peerConnection) {
        await state.peerConnection.setRemoteDescription(answer);
    }
    // Handle candidate
    if (candidate && state.peerConnection) {
        await state.peerConnection.addIceCandidate(candidate);
    }
}

// Replace initiateCall stub with real function
async function initiateCall() {
    if (!state.currentChat) {
        alert('Please select a friend to call.');
        return;
    }
    const to = state.currentChat;
    // Get audio stream
    state.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    state.peerConnection = new RTCPeerConnection();
    state.localStream.getTracks().forEach(track => state.peerConnection.addTrack(track, state.localStream));
    state.peerConnection.ontrack = e => { elements.remoteAudio.srcObject = e.streams[0]; elements.remoteAudio.style.display = 'block'; };
    state.peerConnection.onicecandidate = e => {
        if (e.candidate) {
            databases.createDocument(
                config.databaseId,
                config.callsCollectionId,
                ID.unique(),
                { from: state.currentUser.$id, to: to, candidate: e.candidate, callId: state.callDocId }
            );
        }
    };
    // Create offer
    const offer = await state.peerConnection.createOffer();
    await state.peerConnection.setLocalDescription(offer);
    // Create signaling doc
    state.callDocId = ID.unique();
    await databases.createDocument(
        config.databaseId,
        config.callsCollectionId,
        state.callDocId,
        { from: state.currentUser.$id, to: to, offer: offer, callId: state.callDocId },
        []
    );
}

// Load user data (friends, messages, etc.)
async function loadUserData() {
    try {
        await Promise.all([
            loadFriends(),
            loadFriendRequests()
        ]);
        
        // Set up real-time listeners
        setupRealtimeListeners();
    } catch (error) {
        console.error('Error loading user data:', error);
    }
}

// Load friends list
async function loadFriends() {
    try {
        // Fetch accepted friendships where current user is user1 or user2
        const resp1 = await databases.listDocuments(
            config.databaseId,
            config.friendsCollectionId,
            [
                Query.equal('status', 'accepted'),
                Query.equal('user1Id', [state.currentUser.$id])
            ]
        );
        const resp2 = await databases.listDocuments(
            config.databaseId,
            config.friendsCollectionId,
            [
                Query.equal('status', 'accepted'),
                Query.equal('user2Id', [state.currentUser.$id])
            ]
        );
        // Merge both directions
        const response = { documents: [...resp1.documents, ...resp2.documents] };
        
        state.friends = [];
        elements.friendsList.innerHTML = '';
        
        // Process each friend relationship
        if (response.documents.length > 0) {
            // Get user details for each friend
            for (const friendship of response.documents) {
                // Determine which user ID is the friend
                const friendId = friendship.user1Id === state.currentUser.$id 
                    ? friendship.user2Id 
                    : friendship.user1Id;
                
                try {
                    // Get friend user info from users collection
                    const friendUser = await databases.getDocument(
                        config.databaseId,
                        config.usersCollectionId,
                        friendId
                    );
                    
                    // Add to state
                    state.friends.push({
                        id: friendId,
                        name: friendUser.name,
                        email: friendUser.email,
                        friendshipId: friendship.$id
                    });
                    
                    // Add to UI
                    renderFriendItem(friendUser);
                } catch (error) {
                    console.error('Error loading friend:', error);
                }
            }
        } else {
            elements.friendsList.innerHTML = '<p class="text-center mt-2">No friends yet. Add friends to start chatting!</p>';
        }
    } catch (error) {
        console.error('Error loading friends:', error);
        elements.friendsList.innerHTML = '<p class="text-center mt-2">Could not load friends list.</p>';
    }
}

// Load friend requests
async function loadFriendRequests() {
    try {
        const response = await databases.listDocuments(
            config.databaseId,
            config.friendsCollectionId,
            [
                Query.equal('user2Id', state.currentUser.$id),
                Query.equal('status', 'pending')
            ]
        );
        
        state.friendRequests = [];
        elements.friendRequestsList.innerHTML = '';
        
        if (response.documents.length > 0) {
            for (const request of response.documents) {
                try {
                    // Get requester user info
                    const requesterUser = await databases.getDocument(
                        config.databaseId,
                        config.usersCollectionId,
                        request.user1Id
                    );
                    
                    // Add to state
                    state.friendRequests.push({
                        id: request.$id,
                        userId: requesterUser.$id,
                        name: requesterUser.name,
                        email: requesterUser.email
                    });
                    
                    // Add to UI
                    renderFriendRequest(requesterUser, request.$id);
                } catch (error) {
                    console.error('Error loading friend request:', error);
                }
            }
        } else {
            elements.friendRequestsList.innerHTML = '<p class="text-center mt-2">No pending requests</p>';
        }
    } catch (error) {
        console.error('Error loading friend requests:', error);
        elements.friendRequestsList.innerHTML = '<p class="text-center mt-2">Could not load friend requests.</p>';
    }
}

// Set up real-time listeners for messages and friend requests
function setupRealtimeListeners() {
    // For now, we'll poll for new messages and requests periodically
    
    // Poll for new messages every 5 seconds if in a chat
    setInterval(() => {
        if (state.currentChat) {
            loadMessages(state.currentChat);
        }
    }, 5000);
    
    // Poll for new friend requests every 15 seconds
    setInterval(() => {
        loadFriendRequests();
    }, 15000);
}

// Load messages for a chat
async function loadMessages(friendId) {
    try {
        // Query messages in both directions then merge and sort
        const respA = await databases.listDocuments(
            config.databaseId,
            config.messagesCollectionId,
            [
                Query.equal('senderId', [state.currentUser.$id]),
                Query.equal('receiverId', [friendId])
            ],
            100
        );
        const respB = await databases.listDocuments(
            config.databaseId,
            config.messagesCollectionId,
            [
                Query.equal('senderId', [friendId]),
                Query.equal('receiverId', [state.currentUser.$id])
            ],
            100
        );
        // Merge both directions and sort by creation time
        state.messages = [...respA.documents, ...respB.documents]
            .sort((a, b) => new Date(a.$createdAt) - new Date(b.$createdAt));
        renderMessages();
    } catch (error) {
        console.error('Error loading messages:', error);
    }
}

// Render a friend item in the sidebar
function renderFriendItem(friendUser) {
    const friendItem = document.createElement('div');
    friendItem.className = 'friend-item';
    friendItem.dataset.userId = friendUser.$id;
    
    const firstInitial = friendUser.name.charAt(0).toUpperCase();
    
    friendItem.innerHTML = `
        <div class="friend-avatar">${firstInitial}</div>
        <div class="friend-info">
            <div class="friend-name">${friendUser.name}</div>
            <div class="friend-status">
                <span class="status-indicator"></span>
                Online
            </div>
        </div>
    `;
    
    friendItem.addEventListener('click', () => {
        // Open chat with this friend
        openChat(friendUser.$id, friendUser.name);
    });
    
    elements.friendsList.appendChild(friendItem);
}

// Render a friend request
function renderFriendRequest(requesterUser, requestId) {
    const requestItem = document.createElement('div');
    requestItem.className = 'request-item';
    
    const firstInitial = requesterUser.name.charAt(0).toUpperCase();
    
    requestItem.innerHTML = `
        <div class="friend-avatar">${firstInitial}</div>
        <div class="request-info">
            <div class="friend-name">${requesterUser.name}</div>
            <div class="friend-status">${requesterUser.email}</div>
        </div>
        <div class="request-actions">
            <button class="btn-primary accept-request" data-request-id="${requestId}">Accept</button>
            <button class="btn-danger reject-request" data-request-id="${requestId}">Reject</button>
        </div>
    `;
    
    // Add event listeners for accept/reject buttons
    requestItem.querySelector('.accept-request').addEventListener('click', () => {
        acceptFriendRequest(requestId);
    });
    
    requestItem.querySelector('.reject-request').addEventListener('click', () => {
        rejectFriendRequest(requestId);
    });
    
    elements.friendRequestsList.appendChild(requestItem);
}

// Render messages in the chat
function renderMessages() {
    elements.chatMessages.innerHTML = '';
    let currentDate = null;
    
    state.messages.forEach(message => {
        // Check if we need to add a date separator
        const messageDate = new Date(message.$createdAt);
        const formattedDate = messageDate.toLocaleDateString();
        
        if (formattedDate !== currentDate) {
            currentDate = formattedDate;
            const dateSeparator = document.createElement('div');
            dateSeparator.className = 'message-date';
            dateSeparator.textContent = formattedDate;
            elements.chatMessages.appendChild(dateSeparator);
        }
        
        const messageEl = document.createElement('div');
        const isSentByMe = message.senderId === state.currentUser.$id;
        messageEl.className = `message-bubble ${isSentByMe ? 'message-sent' : 'message-received'}`;
        
        const time = messageDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        messageEl.innerHTML = `
            <div class="message-content">${message.content}</div>
            <div class="message-time">${time}</div>
        `;
        
        elements.chatMessages.appendChild(messageEl);
    });
    
    // Scroll to bottom
    elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

// Open chat with a friend
function openChat(friendId, friendName) {
    // Update current chat
    state.currentChat = friendId;
    elements.chatWithName.textContent = friendName;
    
    // Update UI
    elements.chatInterface.style.display = 'flex';
    elements.emptyChat.style.display = 'none';
    
    // Make friend item active
    const friendItems = elements.friendsList.querySelectorAll('.friend-item');
    friendItems.forEach(item => {
        if (item.dataset.userId === friendId) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
    
    // Load messages
    loadMessages(friendId);
    
    // Focus message input
    elements.messageInput.focus();
}

// Send a message
async function sendMessage() {
    const content = elements.messageInput.value.trim();
    
    if (!content || !state.currentChat) return;
    
    try {
        const message = {
            senderId: state.currentUser.$id,
            receiverId: state.currentChat,
            content: content,
            status: 'sent'
        };
        
        await databases.createDocument(
            config.databaseId,
            config.messagesCollectionId,
            ID.unique(),
            message,
            [] // use collection-level permissions
        );
        
        // Clear input
        elements.messageInput.value = '';
        
        // Reload messages
        loadMessages(state.currentChat);
    } catch (error) {
        console.error('Error sending message:', error);
        alert('Failed to send message: ' + error.message);
    }
}

// Calling functionality (voice only)
elements.voiceCallBtn = document.getElementById('voice-call-btn');
elements.voiceCallBtn.addEventListener('click', initiateCall);

// Send friend request
async function sendFriendRequest() {
    const email = elements.friendEmail.value.trim();
    
    if (!email) return;
    
    try {   
        // Find user by email - add some debug info
        console.log('Searching for user with email:', email);
        console.log('Database ID:', config.databaseId);
        console.log('Users Collection ID:', config.usersCollectionId);
        
        const response = await databases.listDocuments(
            config.databaseId,
            config.usersCollectionId,
            [ Query.equal('email', [email]) ]
        );
        
        console.log('User search response:', response);
        
        if (response.documents.length === 0) {
            alert('User not found. Please check the email address.');
            return;
        }
        
        const user = response.documents[0];
        
        // Check if user is trying to add themself
        if (user.$id === state.currentUser.$id) {
            alert('You cannot add yourself as a friend.');
            return;
        }
        
        // Check if already friends or pending by querying both directions
        const resp1 = await databases.listDocuments(
            config.databaseId,
            config.friendsCollectionId,
            [
                Query.equal('user1Id', [state.currentUser.$id]),
                Query.equal('user2Id', [user.$id])
            ]
        );
        const resp2 = await databases.listDocuments(
            config.databaseId,
            config.friendsCollectionId,
            [
                Query.equal('user1Id', [user.$id]),
                Query.equal('user2Id', [state.currentUser.$id])
            ]
        );
        const existingFriendship = { documents: [...resp1.documents, ...resp2.documents] };
        
        if (existingFriendship.documents.length > 0) {
            const status = existingFriendship.documents[0].status;
            if (status === 'accepted') {
                alert('You are already friends with this user.');
            } else {
                alert('A friend request is already pending with this user.');
            }
            return;
        }
        
        // Create friend request
        await databases.createDocument(
            config.databaseId,
            config.friendsCollectionId,
            ID.unique(),
            {
                user1Id: state.currentUser.$id, // Sender
                user2Id: user.$id, // Receiver
                status: 'pending'
            },
            [] // use collection-level permissions
        );
        
        // Close modal and show success
        elements.addFriendModal.classList.remove('active');
        elements.friendEmail.value = '';
        alert('Friend request sent successfully!');
    } catch (error) {
        console.error('Error sending friend request:', error);
        if (error.code === 401 || error.message.includes('not authorized')) {
            alert('You are not authorized to send friend requests.\nPlease go to your Appwrite Console → Database → friends collection and grant CREATE permission to authenticated users (role: member).');
        } else {
            alert('Failed to send friend request: ' + error.message);
        }
    }
}

// Accept friend request
async function acceptFriendRequest(requestId) {
    try {
        await databases.updateDocument(
            config.databaseId,
            config.friendsCollectionId,
            requestId,
            { status: 'accepted' }
        );
        
        alert('Friend request accepted!');
        
        // Reload data
        await Promise.all([
            loadFriends(),
            loadFriendRequests()
        ]);
    } catch (error) {
        console.error('Error accepting friend request:', error);
        alert('Failed to accept friend request. Please try again.');
    }
}

// Reject friend request
async function rejectFriendRequest(requestId) {
    try {
        await databases.deleteDocument(
            config.databaseId,
            config.friendsCollectionId,
            requestId
        );
        
        alert('Friend request rejected.');
        await loadFriendRequests();
    } catch (error) {
        console.error('Error rejecting friend request:', error);
        alert('Failed to reject friend request. Please try again.');
    }
}

// Create user in users collection after signup
async function createUserDocument(user) {
    try {
        console.log('Creating user document for:', user);
        
        // Check if user already exists in collection
        const existingUsers = await databases.listDocuments(
            config.databaseId,
            config.usersCollectionId,
            [Query.equal('$id', [user.$id])]
        );
        
        // If user already exists, update permissions
        if (existingUsers.documents.length > 0) {
            console.log('User already exists in collection, updating permissions');
            const existing = existingUsers.documents[0];
            await databases.updateDocument(
                config.databaseId,
                config.usersCollectionId,
                existing.$id,
                {
                    userId: existing.userId,
                    email: existing.email,
                    name: existing.name,
                    status: existing.status
                },
                [
                    Permission.read(Role.any()),
                    Permission.read(Role.user(existing.userId))
                ],
                [
                    Permission.write(Role.user(existing.userId))
                ]
            );
            return existing;
        }
        
        // Create user document with same ID as auth user
        const userData = {
            userId: user.$id,
            email: user.email,
            name: user.name,
            status: 'online'
        };
        
        const createdUser = await databases.createDocument(
            config.databaseId,
            config.usersCollectionId,
            user.$id, // Use the same ID as auth
            userData,
            [
                Permission.read(Role.any()),      // allow public read to lookup by email
                Permission.read(Role.user(user.$id)),
                Permission.write(Role.user(user.$id))
            ]
        );
        
        console.log('User document created:', createdUser);
        return createdUser;
    } catch (error) {
        console.error('Error creating user document:', error);
        throw error;
    }
}

// Render saved accounts in modal
function renderSavedAccounts() {
    elements.savedAccountsList.innerHTML = '';

    // Show or hide save UI for current account
    if (state.currentUser && !state.savedAccounts.some(a => a.email === state.currentUser.email)) {
        elements.saveCurrentContainer.style.display = 'block';
    } else {
        elements.saveCurrentContainer.style.display = 'none';
    }

    // Show current user at top
    if (state.currentUser) {
        const currentLi = document.createElement('li');
        currentLi.className = 'account-item';
        currentLi.textContent = state.currentUser.email + ' (current)';
        currentLi.addEventListener('click', () => {
            elements.switchAccountModal.classList.remove('active');
        });
        elements.savedAccountsList.appendChild(currentLi);
    }

    state.savedAccounts.forEach(acc => {
        if (acc.email === state.currentUser.email) return;
        const li = document.createElement('li');
        li.className = 'account-item';
        li.textContent = acc.email;
        li.addEventListener('click', async () => {
            elements.switchAccountModal.classList.remove('active');
            try {
                // Remove current session before switching
                await account.deleteSession('current').catch(() => {});
                // Create session for selected account
                await account.createEmailSession(acc.email, acc.password);
                state.currentUser = await account.get();
                // Auto-save this switched account
                state.savedAccounts = state.savedAccounts.filter(a => a.email !== acc.email).concat({ email: acc.email, password: acc.password });
                persistAccounts();
                // Hide save UI since account is now saved
                elements.saveCurrentContainer.style.display = 'none';
                showChatInterface();
                await loadUserData();
            } catch (err) {
                alert('Switch failed: ' + err.message);
            }
        });
        elements.savedAccountsList.appendChild(li);
    });
}

// Setup Save Current Account button
elements.saveCurrentAccountBtn.addEventListener('click', function() {
    const pwd = elements.saveCurrentPassword.value.trim();
    if (!pwd) {
        alert('Please enter your password to save this account.');
        return;
    }
    // Add current user credentials
    state.savedAccounts.push({ email: state.currentUser.email, password: pwd });
    persistAccounts();
    // Hide save UI and re-render list
    elements.saveCurrentContainer.style.display = 'none';
    renderSavedAccounts();
});

// Switch account button opens modal
elements.switchAccountBtn.addEventListener('click', () => {
    renderSavedAccounts();
    elements.switchAccountModal.classList.add('active');
});

// Close switch modal
elements.closeSwitchAccountModal.addEventListener('click', () => {
    elements.switchAccountModal.classList.remove('active');
});

// Add new account opens login form
elements.addAccountBtn.addEventListener('click', () => {
    elements.switchAccountModal.classList.remove('active');
    showAuthInterface();
});

// Event Listeners
// Login form
elements.loginForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    
    try {
        // Remove any existing sessions to allow fresh login
        await account.deleteSessions().catch(() => {});
        // Create session
        await account.createEmailSession(email, password);
        
        // Get user data
        const user = await account.get();
        state.currentUser = user;
        
        // Save account
        state.savedAccounts = state.savedAccounts.filter(a => a.email !== email).concat({ email, password });
        persistAccounts();
        
        // Show chat interface and load data
        showChatInterface();
        await loadUserData();
    } catch (error) {
        console.error('Login failed', error);
        alert('Login failed: ' + error.message);
    }
});

// Signup form
elements.signupForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const name = document.getElementById('signup-name').value;
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;
    const confirmPassword = document.getElementById('signup-confirm-password').value;
    
    // Check if passwords match (additional client-side validation)
    if (password !== confirmPassword) {
        alert("Passwords do not match. Please try again.");
        return;
    }
    
    try {
        // Create user account first
        const user = await account.create(ID.unique(), email, password, name);
        console.log("User created:", user);
        
        // Create session and log in automatically
        await account.createEmailSession(email, password);
        
        // Get user data
        state.currentUser = await account.get();
        
        // Create user document
        await createUserDocument(state.currentUser);
        
        // Save account
        state.savedAccounts = state.savedAccounts.filter(a => a.email !== email).concat({ email, password });
        persistAccounts();
        
        // Show chat interface and load data
        showChatInterface();
        await loadUserData();
        
        // Success message
        alert("Account created successfully!");
    } catch (error) {
        console.error('Signup failed', error);
        
        // Provide user-friendly error messages
        if (error.code === 409) {
            alert('Email already exists. Please use a different email address.');
        } else {
            alert('Signup failed: ' + error.message);
        }
    }
});

// Logout button
elements.logoutBtn.addEventListener('click', async function() {
    try {
        await account.deleteSession('current');
        state.currentUser = null;
        state.friends = [];
        state.friendRequests = [];
        state.messages = [];
        state.currentChat = null;
        
        showAuthInterface();
    } catch (error) {
        console.error('Logout failed', error);
        alert('Logout failed: ' + error.message);
    }
});

// Switch account button
elements.switchAccountBtn.addEventListener('click', async function() {
    try {
        renderSavedAccounts();
        elements.switchAccountModal.classList.add('active');
    } catch (error) {
        console.error('Switch account failed', error);
        alert('Failed to switch account: ' + error.message);
    }
});

// Send message button
elements.sendMessage.addEventListener('click', sendMessage);

// Message input (send on Enter)
elements.messageInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

// Friend search
elements.friendSearch.addEventListener('input', function() {
    const query = this.value.toLowerCase();
    const friendItems = elements.friendsList.querySelectorAll('.friend-item');
    
    friendItems.forEach(item => {
        const name = item.querySelector('.friend-name').textContent.toLowerCase();
        if (name.includes(query)) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
});

// Send friend request button
elements.sendFriendRequest.addEventListener('click', sendFriendRequest);

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', initApp);