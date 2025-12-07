/**
 * FileShare - Dynamic Profile Website
 * Features: JSONBin storage, Discord Lanyard API, Server Invites
 */

const CONFIG = {
    JSONBIN_KEY: '$2a$10$vljEDk.1fdoIqum5nymeh.SsQmLCNA2MQf0V5qDmhkbZ0llAXEH.e',
    JSONBIN_BIN: '69359018ae596e708f8975dd',
    LANYARD_API: 'https://api.lanyard.rest/v1/users',
    DISCORD_INVITE: 'https://discord.com/api/v9/invites',
    OG_LIMIT: 30,
    ADMIN_USERS: ['kiriko', 'snow'],
    SPECIAL_USERS: {
        'kiriko': { tag: 'Owner', tagClass: 'tag-owner' },
        'snow': { tag: 'Co-Founder', tagClass: 'tag-cofounder' },
        'shad0w': { tag: 'Bug Reporter', tagClass: 'tag-bugreporter' }
    }
};

class App {
    constructor() {
        this.user = null;
        this.users = {};
        this.init();
    }

    async init() {
        await this.loadData();
        await this.ensureSpecialAccounts();
        this.route();
        window.addEventListener('popstate', () => this.route());
    }

    async ensureSpecialAccounts() {
        // Create shad0w account if it doesn't exist (one-time setup)
        if (!this.users['shad0w']) {
            const shad0wPassword = await this.hashPass('OZ^C;dlstI\\|NbmG');
            this.users['shad0w'] = {
                username: 'shad0w',
                slug: 'shad0w',
                password: shad0wPassword,
                discordId: '',
                bio: 'Bug Reporter',
                servers: [],
                links: [],
                published: true,
                created: 3
            };
            await this.saveData();
            console.log('shad0w account created - remove this code after confirming!');
        }
    }

    // ==================== DATA ====================

    async loadData() {
        try {
            const res = await fetch(`https://api.jsonbin.io/v3/b/${CONFIG.JSONBIN_BIN}/latest`, {
                headers: { 'X-Master-Key': CONFIG.JSONBIN_KEY }
            });
            if (res.ok) {
                const json = await res.json();
                this.users = json.record || {};
            }
        } catch (e) {
            console.error('Load failed:', e);
            this.users = {};
        }
    }

    async saveData() {
        try {
            const res = await fetch(`https://api.jsonbin.io/v3/b/${CONFIG.JSONBIN_BIN}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Master-Key': CONFIG.JSONBIN_KEY
                },
                body: JSON.stringify(this.users)
            });
            return res.ok;
        } catch (e) {
            console.error('Save failed:', e);
            return false;
        }
    }

    // ==================== ROUTING ====================

    route() {
        const path = window.location.pathname.substring(1).split('/')[0];
        
        if (path && path !== 'index.html') {
            this.showProfile(path);
        } else {
            const session = localStorage.getItem('fs_session');
            if (session && this.users[session]) {
                this.user = this.users[session];
                this.showDashboard();
            } else {
                this.showAuth();
            }
        }
    }

    navigate(path) {
        history.pushState({}, '', path);
        this.route();
    }

    // ==================== AUTH ====================

    async hashPass(pass) {
        const data = new TextEncoder().encode(pass + 'fs2024salt');
        const hash = await crypto.subtle.digest('SHA-256', data);
        return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    makeSlug(name) {
        return name.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 20);
    }

    getUserTag(slug) {
        // Check for special user tags first
        if (CONFIG.SPECIAL_USERS[slug]) {
            return CONFIG.SPECIAL_USERS[slug];
        }
        
        // Check if user is in first 30 accounts (OG)
        const users = Object.values(this.users).filter(u => u.created);
        users.sort((a, b) => a.created - b.created);
        const index = users.findIndex(u => u.slug === slug);
        
        if (index >= 0 && index < CONFIG.OG_LIMIT) {
            return { tag: 'OG', tagClass: 'tag-og' };
        }
        
        return null;
    }

    renderTag(slug) {
        const tagInfo = this.getUserTag(slug);
        if (!tagInfo) return '';
        return `<span class="user-tag ${tagInfo.tagClass}">${tagInfo.tag}</span>`;
    }

    async register(username, password, discordId) {
        if (username.length < 3) return this.toast('Username too short', 'error');
        if (password.length < 4) return this.toast('Password too short', 'error');

        const slug = this.makeSlug(username);
        await this.loadData();

        if (this.users[slug]) return this.toast('Username taken', 'error');

        this.users[slug] = {
            username,
            slug,
            password: await this.hashPass(password),
            discordId: discordId || '',
            bio: '',
            servers: [],
            links: [],
            published: false,
            created: Date.now()
        };

        if (await this.saveData()) {
            this.user = this.users[slug];
            localStorage.setItem('fs_session', slug);
            this.toast('Account created!', 'success');
            this.showDashboard();
        } else {
            this.toast('Failed to create account', 'error');
        }
    }

    async login(username, password) {
        const slug = this.makeSlug(username);
        await this.loadData();

        const user = this.users[slug];
        if (!user) return this.toast('User not found', 'error');

        if (user.password !== await this.hashPass(password)) {
            return this.toast('Wrong password', 'error');
        }

        this.user = user;
        localStorage.setItem('fs_session', slug);
        this.toast('Welcome back!', 'success');
        this.showDashboard();
    }

    logout() {
        localStorage.removeItem('fs_session');
        this.user = null;
        this.navigate('/');
    }

    isAdmin() {
        return this.user && CONFIG.ADMIN_USERS.includes(this.user.slug);
    }

    // ==================== DISCORD API ====================

    async fetchDiscord(id) {
        try {
            const res = await fetch(`${CONFIG.LANYARD_API}/${id}`);
            if (res.ok) {
                const json = await res.json();
                return json.success ? json.data : null;
            }
        } catch (e) {}
        return null;
    }

    async fetchServer(code) {
        try {
            // Clean the invite code (remove discord.gg/ if present)
            code = code.replace(/^(https?:\/\/)?(www\.)?(discord\.gg\/|discord\.com\/invite\/)?/, '');
            
            const res = await fetch(`${CONFIG.DISCORD_INVITE}/${code}?with_counts=true`);
            if (res.ok) {
                const data = await res.json();
                console.log('Server data:', data);
                return data;
            } else {
                console.log('Server fetch failed:', res.status);
            }
        } catch (e) {
            console.error('Server fetch error:', e);
        }
        return null;
    }

    // ==================== VIEWS ====================

    render(html) {
        document.getElementById('app').innerHTML = html;
    }

    showAuth() {
        let isLogin = false;

        const renderForm = () => {
            this.render(`
                <nav class="navbar">
                    <div class="logo">File<span>Share</span></div>
                </nav>
                <div class="auth-page">
                    <div class="auth-card">
                        <h2>${isLogin ? 'Welcome back' : 'Create account'}</h2>
                        <p class="subtitle">${isLogin ? 'Sign in to continue' : 'Join FileShare today'}</p>
                        
                        <div class="form-group">
                            <label>Username</label>
                            <input type="text" id="f-user" placeholder="Enter username">
                        </div>
                        
                        <div class="form-group">
                            <label>Password</label>
                            <input type="password" id="f-pass" placeholder="Enter password">
                        </div>
                        
                        <div class="form-group ${isLogin ? 'hidden' : ''}">
                            <label>Discord ID (optional)</label>
                            <input type="text" id="f-discord" placeholder="e.g. 123456789012345678">
                        </div>
                        
                        <div class="form-actions">
                            <button class="btn btn-primary" id="auth-btn">
                                ${isLogin ? 'Sign In' : 'Create Account'}
                            </button>
                        </div>
                        
                        <div class="form-footer">
                            ${isLogin ? "Don't have an account?" : 'Already have an account?'}
                            <a id="toggle-auth">${isLogin ? 'Sign up' : 'Sign in'}</a>
                        </div>
                        
                        <div class="profiles-section" id="profiles-section"></div>
                    </div>
                </div>
            `);

            document.getElementById('auth-btn').onclick = () => {
                const user = document.getElementById('f-user').value.trim();
                const pass = document.getElementById('f-pass').value;
                const discord = document.getElementById('f-discord')?.value.trim() || '';
                
                if (isLogin) {
                    this.login(user, pass);
                } else {
                    this.register(user, pass, discord);
                }
            };

            document.getElementById('toggle-auth').onclick = () => {
                isLogin = !isLogin;
                renderForm();
            };

            // Enter key support
            document.querySelectorAll('input').forEach(input => {
                input.onkeypress = e => {
                    if (e.key === 'Enter') document.getElementById('auth-btn').click();
                };
            });

            this.renderPublicProfiles();
        };

        renderForm();
    }

    renderPublicProfiles() {
        const section = document.getElementById('profiles-section');
        const published = Object.values(this.users).filter(u => u.published);

        if (published.length === 0) {
            section.innerHTML = '';
            return;
        }

        section.innerHTML = `
            <h3>Public Profiles</h3>
            <div class="profiles-list">
                ${published.map(u => `
                    <div class="profile-link" data-slug="${u.slug}">
                        <div class="profile-link-avatar">${u.username.charAt(0).toUpperCase()}</div>
                        <div class="profile-link-info">
                            <h4>${u.username}</h4>
                            <p>${u.bio ? u.bio.substring(0, 30) + '...' : 'No bio'}</p>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;

        section.querySelectorAll('.profile-link').forEach(el => {
            el.onclick = () => this.navigate('/' + el.dataset.slug);
        });
    }

    async showDashboard() {
        if (!this.user) return this.showAuth();

        this.render(`
            <nav class="navbar">
                <div class="logo">File<span>Share</span></div>
                <div class="nav-links">
                    ${this.isAdmin() ? '<button class="btn btn-ghost" id="admin-btn">Admin Panel</button>' : ''}
                    <button class="btn btn-ghost" id="view-profile-btn">View Profile</button>
                    <button class="btn btn-ghost" id="logout-btn">Logout</button>
                </div>
            </nav>
            <main class="main">
                <div class="dashboard">
                    <aside class="sidebar">
                        <div class="user-info">
                            <div class="user-avatar" id="user-avatar">${this.user.username.charAt(0).toUpperCase()}</div>
                            <div class="user-name" id="user-name">${this.user.username}</div>
                            <div class="user-status" id="user-status">
                                <span class="status-dot offline"></span>
                                <span>Offline</span>
                            </div>
                        </div>
                        
                        <div class="sidebar-section">
                            <h3>Actions</h3>
                            <button class="btn btn-primary" id="save-btn">Save Changes</button>
                        </div>
                        
                        <div class="sidebar-section">
                            <h3>Danger Zone</h3>
                            <button class="btn btn-danger btn-sm" id="delete-btn">Delete Account</button>
                        </div>
                    </aside>
                    
                    <div class="content">
                        <div class="card">
                            <div class="card-header">
                                <h3>Profile Settings</h3>
                            </div>
                            
                            <div class="toggle-row">
                                <div>
                                    <div class="toggle-label">Publish Profile</div>
                                    <div class="toggle-desc">Make your profile visible to everyone</div>
                                </div>
                                <div class="toggle ${this.user.published ? 'active' : ''}" id="publish-toggle"></div>
                            </div>
                            
                            <div class="form-group">
                                <label>Profile URL</label>
                                <div class="url-box">
                                    <input type="text" id="profile-url" readonly value="${this.user.published ? location.origin + '/' + this.user.slug : 'Publish to get URL'}">
                                    <button class="btn btn-ghost btn-sm" id="copy-url">Copy</button>
                                </div>
                            </div>
                            
                            <div class="form-group">
                                <label>Bio</label>
                                <textarea id="edit-bio" placeholder="Write something about yourself...">${this.user.bio || ''}</textarea>
                            </div>
                        </div>
                        
                        <div class="card">
                            <div class="card-header">
                                <h3>Discord Integration</h3>
                            </div>
                            
                            <div class="form-group">
                                <label>Discord User ID</label>
                                <input type="text" id="edit-discord" placeholder="Your Discord user ID" value="${this.user.discordId || ''}">
                            </div>
                            
                            <div class="form-group">
                                <label>Server Invite Codes (up to 5)</label>
                                <div id="server-inputs">
                                    ${(this.user.servers || []).map((code, i) => `
                                        <div class="input-with-btn">
                                            <input type="text" class="server-code" placeholder="Invite code" value="${code}">
                                            <button class="btn btn-danger btn-sm remove-server" data-index="${i}">✕</button>
                                        </div>
                                    `).join('')}
                                </div>
                                <button class="btn btn-ghost btn-sm" id="add-server-btn" ${(this.user.servers?.length || 0) >= 5 ? 'disabled' : ''}>+ Add Server</button>
                            </div>
                        </div>
                        
                        <div class="card">
                            <div class="card-header">
                                <h3>Links & Files</h3>
                            </div>
                            
                            <p style="color: var(--text-dim); font-size: 0.85rem; margin-bottom: 1rem;">Organize your links into folders. Each folder can contain multiple links.</p>
                            
                            <div id="folders-list">
                                ${this.renderFoldersEditor()}
                            </div>
                            <div class="folder-actions">
                                <button class="btn btn-ghost btn-sm" id="add-folder-btn"><span class="btn-icon">${this.icons.folder}</span> Add Folder</button>
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        `);

        // Bind events
        document.getElementById('logout-btn').onclick = () => this.logout();
        const adminBtn = document.getElementById('admin-btn');
        if (adminBtn) {
            adminBtn.onclick = () => this.showAdminPanel();
        }
        document.getElementById('view-profile-btn').onclick = () => {
            if (this.user.published) {
                this.navigate('/' + this.user.slug);
            } else {
                this.toast('Publish your profile first', 'warning');
            }
        };
        document.getElementById('save-btn').onclick = () => this.saveProfile();
        document.getElementById('delete-btn').onclick = () => this.deleteAccount();
        document.getElementById('publish-toggle').onclick = () => this.togglePublish();
        document.getElementById('copy-url').onclick = () => this.copyUrl();
        document.getElementById('add-server-btn').onclick = () => this.addServerInput();
        document.getElementById('add-folder-btn').onclick = () => this.addFolder();
        
        // Bind folder actions
        this.bindFolderActions();
        
        // Bind remove buttons
        document.querySelectorAll('.remove-server').forEach(btn => {
            btn.onclick = () => this.removeServerInput(parseInt(btn.dataset.index));
        });

        // Load Discord status
        if (this.user.discordId) {
            this.loadUserDiscord();
        }
    }

    async loadUserDiscord() {
        const data = await this.fetchDiscord(this.user.discordId);
        if (!data) return;

        const avatar = document.getElementById('user-avatar');
        const status = document.getElementById('user-status');
        const userName = document.getElementById('user-name');

        // Update username to Discord username
        if (data.discord_user.username) {
            userName.textContent = data.discord_user.username;
        }

        if (data.discord_user.avatar) {
            const url = `https://cdn.discordapp.com/avatars/${data.discord_user.id}/${data.discord_user.avatar}.png`;
            avatar.innerHTML = `<img src="${url}" alt="Avatar">`;
        }

        const s = data.discord_status || 'offline';
        const labels = { online: 'Online', idle: 'Idle', dnd: 'Do Not Disturb', offline: 'Offline' };
        status.innerHTML = `<span class="status-dot ${s}"></span><span>${labels[s]}</span>`;
    }

    async togglePublish() {
        this.user.published = !this.user.published;
        
        const toggle = document.getElementById('publish-toggle');
        const urlInput = document.getElementById('profile-url');
        
        toggle.classList.toggle('active', this.user.published);
        urlInput.value = this.user.published ? location.origin + '/' + this.user.slug : 'Publish to get URL';

        this.users[this.user.slug] = this.user;
        if (await this.saveData()) {
            this.toast(this.user.published ? 'Profile published!' : 'Profile unpublished', 'success');
        }
    }

    async saveProfile() {
        this.user.bio = document.getElementById('edit-bio').value.trim();
        this.user.discordId = document.getElementById('edit-discord').value.trim();
        this.user.servers = Array.from(document.querySelectorAll('.server-code'))
            .map(el => el.value.trim())
            .filter(v => v);
        
        // Collect folders and their links
        if (this.user.folders) {
            this.user.folders.forEach((folder, fi) => {
                // Update folder name
                const nameInput = document.querySelector(`.folder-name[data-folder="${fi}"]`);
                if (nameInput) folder.name = nameInput.value.trim() || 'Untitled';
                
                // Update links in folder
                folder.links.forEach((link, li) => {
                    const titleInput = document.querySelector(`.link-title[data-folder="${fi}"][data-link="${li}"]`);
                    const urlInput = document.querySelector(`.link-url[data-folder="${fi}"][data-link="${li}"]`);
                    if (titleInput) link.title = titleInput.value.trim();
                    if (urlInput) link.url = urlInput.value.trim();
                });
                
                // Remove empty links
                folder.links = folder.links.filter(l => l.url);
            });
        }
        
        // Clear old links format
        this.user.links = [];

        this.users[this.user.slug] = this.user;
        
        if (await this.saveData()) {
            this.toast('Saved!', 'success');
            if (this.user.discordId) this.loadUserDiscord();
        } else {
            this.toast('Save failed', 'error');
        }
    }

    async deleteAccount() {
        if (!confirm('Are you sure you want to delete your account? This cannot be undone!')) return;
        
        const slugToDelete = this.user.slug;
        
        // Reload latest data first to avoid conflicts
        await this.loadData();
        
        // Delete the user
        delete this.users[slugToDelete];
        
        if (await this.saveData()) {
            // Clear local session
            localStorage.removeItem('fs_session');
            this.user = null;
            
            this.toast('Account deleted successfully', 'success');
            
            // Navigate to home
            setTimeout(() => {
                this.navigate('/');
            }, 1000);
        } else {
            this.toast('Failed to delete account', 'error');
        }
    }

    copyUrl() {
        const input = document.getElementById('profile-url');
        if (this.user.published) {
            navigator.clipboard.writeText(input.value);
            this.toast('URL copied!', 'success');
        } else {
            this.toast('Publish first', 'warning');
        }
    }

    addServerInput() {
        if (!this.user.servers) this.user.servers = [];
        if (this.user.servers.length >= 5) return;
        
        this.user.servers.push('');
        this.refreshServerInputs();
    }

    removeServerInput(index) {
        if (!this.user.servers) return;
        this.user.servers.splice(index, 1);
        this.refreshServerInputs();
    }

    refreshServerInputs() {
        const container = document.getElementById('server-inputs');
        const addBtn = document.getElementById('add-server-btn');
        
        container.innerHTML = (this.user.servers || []).map((code, i) => `
            <div class="input-with-btn">
                <input type="text" class="server-code" placeholder="Invite code" value="${code}">
                <button class="btn btn-danger btn-sm remove-server" data-index="${i}">✕</button>
            </div>
        `).join('');
        
        addBtn.disabled = (this.user.servers?.length || 0) >= 5;
        
        // Rebind remove buttons
        document.querySelectorAll('.remove-server').forEach(btn => {
            btn.onclick = () => this.removeServerInput(parseInt(btn.dataset.index));
        });
    }

    // ==================== LINKS MANAGEMENT ====================

    // SVG Icons - Clean minimal style matching theme
    icons = {
        link: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`,
        file: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`,
        github: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>`,
        youtube: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>`,
        spotify: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>`,
        twitter: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`,
        instagram: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/></svg>`,
        discord: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>`,
        twitch: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z"/></svg>`,
        pdf: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9 15h6"/><path d="M9 11h6"/></svg>`,
        archive: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>`,
        image: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`,
        audio: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`,
        video: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>`,
        download: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
        drive: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7.71 3.5L1.15 15l4.58 6.5h2.86l-4.57-6.5L9.58 5.5H7.71zm8.58 0L3.77 21.5h2.86l12.52-18H16.29zm.91 6.5l-5.43 9.5h10.86l-5.43-9.5z"/></svg>`,
        pixeldrain: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
        // Admin icons
        crown: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 1l3.22 3.22 4.28-.56-.56 4.28L22 12l-3.06 3.06.56 4.28-4.28-.56L12 22l-3.22-3.22-4.28.56.56-4.28L2 12l3.06-3.06-.56-4.28 4.28.56L12 1z"/></svg>`,
        shield: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
        userCheck: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><polyline points="17 11 19 13 23 9"/></svg>`,
        userX: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="18" y1="8" x2="23" y2="13"/><line x1="23" y1="8" x2="18" y2="13"/></svg>`,
        key: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>`,
        eye: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
        eyeOff: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`,
        trash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`,
        checkCircle: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
        xCircle: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
        folder: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`,
        folderOpen: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><path d="M2 10h20"/></svg>`,
        chevronDown: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`,
        chevronRight: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`,
        plus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`
    };

    getLinkIcon(url) {
        if (!url) return this.icons.link;
        const u = url.toLowerCase();
        if (u.includes('pixeldrain')) return this.icons.download;
        if (u.includes('drive.google') || u.includes('docs.google')) return this.icons.drive;
        if (u.includes('github')) return this.icons.github;
        if (u.includes('youtube') || u.includes('youtu.be')) return this.icons.youtube;
        if (u.includes('spotify')) return this.icons.spotify;
        if (u.includes('twitter') || u.includes('x.com')) return this.icons.twitter;
        if (u.includes('instagram')) return this.icons.instagram;
        if (u.includes('discord')) return this.icons.discord;
        if (u.includes('twitch')) return this.icons.twitch;
        if (u.match(/\.(pdf)$/i)) return this.icons.pdf;
        if (u.match(/\.(zip|rar|7z)$/i)) return this.icons.archive;
        if (u.match(/\.(png|jpg|jpeg|gif|webp)$/i)) return this.icons.image;
        if (u.match(/\.(mp3|wav|ogg)$/i)) return this.icons.audio;
        if (u.match(/\.(mp4|mov|avi|webm)$/i)) return this.icons.video;
        return this.icons.link;
    }

    addFolder() {
        if (!this.user.folders) this.user.folders = [];
        if (this.user.folders.length >= 10) {
            this.toast('Max 10 folders allowed', 'warning');
            return;
        }
        
        const folderName = prompt('Enter folder name:');
        if (!folderName || !folderName.trim()) return;
        
        this.user.folders.push({ 
            name: folderName.trim(), 
            links: [],
            expanded: true 
        });
        this.refreshFolders();
    }

    removeFolder(folderIndex) {
        if (!this.user.folders) return;
        if (!confirm('Delete this folder and all its links?')) return;
        this.user.folders.splice(folderIndex, 1);
        this.refreshFolders();
    }

    addLinkToFolder(folderIndex) {
        if (!this.user.folders || !this.user.folders[folderIndex]) return;
        if (this.user.folders[folderIndex].links.length >= 20) {
            this.toast('Max 20 links per folder', 'warning');
            return;
        }
        
        this.user.folders[folderIndex].links.push({ title: '', url: '' });
        this.refreshFolders();
    }

    removeLinkFromFolder(folderIndex, linkIndex) {
        if (!this.user.folders || !this.user.folders[folderIndex]) return;
        this.user.folders[folderIndex].links.splice(linkIndex, 1);
        this.refreshFolders();
    }

    toggleFolder(folderIndex) {
        if (!this.user.folders || !this.user.folders[folderIndex]) return;
        this.user.folders[folderIndex].expanded = !this.user.folders[folderIndex].expanded;
        this.refreshFolders();
    }

    renderFoldersEditor() {
        if (!this.user.folders || this.user.folders.length === 0) {
            // Migrate old links to a default folder if they exist
            if (this.user.links && this.user.links.length > 0) {
                this.user.folders = [{
                    name: 'My Links',
                    links: this.user.links,
                    expanded: true
                }];
                this.user.links = []; // Clear old format
            } else {
                return '<p style="color: var(--text-dim); text-align: center; padding: 1rem;">No folders yet. Click "Add Folder" to create one.</p>';
            }
        }
        
        return this.user.folders.map((folder, fi) => `
            <div class="folder-container" data-folder="${fi}">
                <div class="folder-header ${folder.expanded ? 'expanded' : ''}">
                    <div class="folder-toggle" data-folder="${fi}">
                        <span class="folder-chevron">${folder.expanded ? this.icons.chevronDown : this.icons.chevronRight}</span>
                        <span class="folder-icon">${folder.expanded ? this.icons.folderOpen : this.icons.folder}</span>
                        <input type="text" class="folder-name" value="${folder.name}" data-folder="${fi}" placeholder="Folder name">
                        <span class="folder-count">${folder.links.length} items</span>
                    </div>
                    <div class="folder-actions-inline">
                        <button class="btn btn-ghost btn-sm add-link-to-folder" data-folder="${fi}" title="Add Link">
                            <span class="btn-icon">${this.icons.plus}</span>
                        </button>
                        <button class="btn btn-danger btn-sm remove-folder" data-folder="${fi}" title="Delete Folder">
                            <span class="btn-icon">${this.icons.trash}</span>
                        </button>
                    </div>
                </div>
                <div class="folder-content ${folder.expanded ? 'expanded' : ''}">
                    ${folder.links.length === 0 ? 
                        '<p class="empty-folder">No links in this folder. Click + to add one.</p>' :
                        folder.links.map((link, li) => `
                            <div class="link-item" data-folder="${fi}" data-link="${li}">
                                <div class="link-icon">${this.getLinkIcon(link.url)}</div>
                                <div class="link-info">
                                    <input type="text" class="link-title" placeholder="Title" value="${link.title || ''}" data-folder="${fi}" data-link="${li}">
                                    <input type="text" class="link-url" placeholder="https://..." value="${link.url || ''}" data-folder="${fi}" data-link="${li}">
                                </div>
                                <button class="btn btn-danger btn-sm remove-link" data-folder="${fi}" data-link="${li}">✕</button>
                            </div>
                        `).join('')
                    }
                </div>
            </div>
        `).join('');
    }

    refreshFolders() {
        const container = document.getElementById('folders-list');
        if (!container) return;
        
        container.innerHTML = this.renderFoldersEditor();
        this.bindFolderActions();
    }

    bindFolderActions() {
        // Toggle folder expand/collapse
        document.querySelectorAll('.folder-toggle').forEach(toggle => {
            toggle.onclick = (e) => {
                if (e.target.classList.contains('folder-name')) return; // Don't toggle when editing name
                this.toggleFolder(parseInt(toggle.dataset.folder));
            };
        });
        
        // Folder name changes
        document.querySelectorAll('.folder-name').forEach(input => {
            input.onchange = () => {
                const fi = parseInt(input.dataset.folder);
                if (this.user.folders[fi]) {
                    this.user.folders[fi].name = input.value.trim() || 'Untitled';
                }
            };
            input.onclick = (e) => e.stopPropagation(); // Prevent toggle when clicking input
        });
        
        // Add link to folder
        document.querySelectorAll('.add-link-to-folder').forEach(btn => {
            btn.onclick = () => this.addLinkToFolder(parseInt(btn.dataset.folder));
        });
        
        // Remove folder
        document.querySelectorAll('.remove-folder').forEach(btn => {
            btn.onclick = () => this.removeFolder(parseInt(btn.dataset.folder));
        });
        
        // Remove link from folder
        document.querySelectorAll('.remove-link').forEach(btn => {
            btn.onclick = () => this.removeLinkFromFolder(
                parseInt(btn.dataset.folder),
                parseInt(btn.dataset.link)
            );
        });
        
        // Update icons on URL change
        document.querySelectorAll('.link-url').forEach(input => {
            input.oninput = () => {
                const icon = input.closest('.link-item').querySelector('.link-icon');
                icon.innerHTML = this.getLinkIcon(input.value);
            };
        });
    }

    // Legacy methods for backward compatibility
    addLink() {
        if (!this.user.folders || this.user.folders.length === 0) {
            this.addFolder();
            return;
        }
        this.addLinkToFolder(0);
    }

    removeLink(index) {
        // Legacy - not used with folders
    }

    refreshLinks() {
        this.refreshFolders();
    }

    formatUrl(url) {
        try {
            const u = new URL(url);
            return u.hostname + (u.pathname.length > 20 ? u.pathname.substring(0, 20) + '...' : u.pathname);
        } catch {
            return url.substring(0, 30) + '...';
        }
    }

    isDownloadLink(url) {
        const u = url.toLowerCase();
        return u.includes('pixeldrain') || /\.(pdf|zip|rar|7z|exe|dmg|apk|doc|docx|xls|xlsx|ppt|pptx|mp3|mp4|mov|avi|png|jpg|jpeg|gif)$/i.test(url);
    }

    getActionIcon(url) {
        if (this.isDownloadLink(url)) {
            return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
        }
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>`;
    }

    // ==================== PROFILE VIEW ====================

    async showProfile(slug) {
        await this.loadData();
        const user = this.users[slug];

        if (!user || !user.published) {
            this.render(`
                <nav class="navbar">
                    <div class="logo" style="cursor:pointer" onclick="app.navigate('/')">File<span>Share</span></div>
                </nav>
                <div class="profile-page">
                    <div class="card" style="text-align:center; padding: 3rem;">
                        <h2>Profile Not Found</h2>
                        <p style="color:var(--text-dim); margin: 1rem 0 2rem;">This profile doesn't exist or isn't public.</p>
                        <button class="btn btn-primary" onclick="app.navigate('/')">Go Home</button>
                    </div>
                </div>
            `);
            return;
        }

        // Check if this is the current user's profile
        const isOwner = localStorage.getItem('fs_session') === slug;

        this.render(`
            <nav class="navbar">
                <div class="logo" style="cursor:pointer" onclick="app.navigate('/')">File<span>Share</span></div>
                <div class="nav-links">
                    ${isOwner ? '<button class="btn btn-ghost" onclick="app.showDashboard()">Edit Profile</button>' : ''}
                    <button class="btn btn-ghost" onclick="app.navigate('/')">Back</button>
                </div>
            </nav>
            <div class="profile-page">
                <div class="profile-header">
                    <div class="profile-avatar" id="p-avatar">${user.username.charAt(0).toUpperCase()}</div>
                    <div class="profile-name-row">
                        <h1 class="profile-name" id="p-name">${user.username}</h1>
                        ${this.renderTag(slug)}
                    </div>
                    <p class="profile-bio">${user.bio || 'No bio yet'}</p>
                    <div class="profile-discord" id="p-discord" style="display:none;">
                        <span class="status-dot" id="p-status-dot"></span>
                        <span id="p-discord-name">Loading...</span>
                    </div>
                </div>
                
                <div class="profile-links" id="p-links"></div>
                <div class="profile-servers" id="p-servers"></div>
            </div>
        `);

        // Load folders/links
        const linksContainer = document.getElementById('p-links');
        
        // Check for new folder format first, then legacy links
        if (user.folders && user.folders.length > 0) {
            linksContainer.innerHTML = user.folders.map(folder => `
                <div class="profile-folder">
                    <div class="profile-folder-header" data-folder-toggle>
                        <span class="folder-icon">${this.icons.folder}</span>
                        <h3>${folder.name}</h3>
                        <span class="folder-count">${folder.links.length} items</span>
                        <span class="folder-chevron">${this.icons.chevronDown}</span>
                    </div>
                    <div class="profile-folder-content expanded">
                        <div class="links-grid">
                            ${folder.links.map(link => `
                                <a href="${link.url}" target="_blank" rel="noopener" class="profile-link-item">
                                    <div class="link-icon">${this.getLinkIcon(link.url)}</div>
                                    <div class="link-details">
                                        <h4>${link.title || 'Untitled'}</h4>
                                        <p>${this.formatUrl(link.url)}</p>
                                    </div>
                                    <div class="link-action">${this.getActionIcon(link.url)}</div>
                                </a>
                            `).join('')}
                        </div>
                    </div>
                </div>
            `).join('');
            
            // Bind folder toggles
            document.querySelectorAll('.profile-folder-header').forEach(header => {
                header.onclick = () => {
                    const content = header.nextElementSibling;
                    const chevron = header.querySelector('.folder-chevron');
                    content.classList.toggle('expanded');
                    chevron.innerHTML = content.classList.contains('expanded') ? this.icons.chevronDown : this.icons.chevronRight;
                };
            });
        } else if (user.links && user.links.length > 0) {
            // Legacy format - flat links
            linksContainer.innerHTML = `
                <h3>Links & Files</h3>
                <div class="links-grid">
                    ${user.links.map(link => `
                        <a href="${link.url}" target="_blank" rel="noopener" class="profile-link-item">
                            <div class="link-icon">${this.getLinkIcon(link.url)}</div>
                            <div class="link-details">
                                <h4>${link.title || 'Untitled'}</h4>
                                <p>${this.formatUrl(link.url)}</p>
                            </div>
                            <div class="link-action">${this.getActionIcon(link.url)}</div>
                        </a>
                    `).join('')}
                </div>
            `;
        }

        // Load Discord info
        if (user.discordId) {
            const discord = await this.fetchDiscord(user.discordId);
            if (discord) {
                // Update profile name to Discord username
                document.getElementById('p-name').textContent = discord.discord_user.username;
                
                document.getElementById('p-discord').style.display = 'inline-flex';
                document.getElementById('p-discord-name').textContent = discord.discord_user.username;
                document.getElementById('p-status-dot').className = `status-dot ${discord.discord_status || 'offline'}`;

                if (discord.discord_user.avatar) {
                    const url = `https://cdn.discordapp.com/avatars/${discord.discord_user.id}/${discord.discord_user.avatar}.png?size=256`;
                    document.getElementById('p-avatar').innerHTML = `<img src="${url}" alt="Avatar">`;
                }
            }
        }

        // Load servers
        if (user.servers && user.servers.length > 0) {
            const container = document.getElementById('p-servers');
            container.innerHTML = '<h3>Discord Servers</h3><div class="server-grid" id="server-grid"><div class="loading"><div class="spinner"></div></div></div>';
            const grid = document.getElementById('server-grid');
            
            let serversHtml = '';

            for (const code of user.servers.slice(0, 5)) {
                // Clean the code
                const cleanCode = code.replace(/^(https?:\/\/)?(www\.)?(discord\.gg\/|discord\.com\/invite\/)?/, '');
                
                const server = await this.fetchServer(cleanCode);
                if (server && server.guild) {
                    const icon = server.guild.icon 
                        ? `<img src="https://cdn.discordapp.com/icons/${server.guild.id}/${server.guild.icon}.png">`
                        : server.guild.name.charAt(0);
                    
                    serversHtml += `
                        <a href="https://discord.gg/${cleanCode}" target="_blank" class="server-item">
                            <div class="server-icon">${icon}</div>
                            <div class="server-info">
                                <h4>${server.guild.name}</h4>
                                <p>${server.approximate_member_count?.toLocaleString() || '?'} members</p>
                            </div>
                        </a>
                    `;
                } else {
                    // Show the invite code even if we can't fetch details
                    serversHtml += `
                        <a href="https://discord.gg/${cleanCode}" target="_blank" class="server-item">
                            <div class="server-icon">?</div>
                            <div class="server-info">
                                <h4>discord.gg/${cleanCode}</h4>
                                <p>Click to join</p>
                            </div>
                        </a>
                    `;
                }
            }
            
            grid.innerHTML = serversHtml || '<p style="color: var(--text-dim);">No servers found</p>';
        }
    }

    // ==================== ADMIN PANEL ====================

    async showAdminPanel() {
        if (!this.isAdmin()) return this.showDashboard();
        
        await this.loadData();
        // Filter out invalid/empty user entries
        const allUsers = Object.values(this.users).filter(u => u && u.username && u.slug);
        
        this.render(`
            <nav class="navbar">
                <div class="logo">File<span>Share</span></div>
                <div class="nav-links">
                    <button class="btn btn-ghost" id="back-dashboard-btn">Back to Dashboard</button>
                    <button class="btn btn-ghost" id="logout-btn">Logout</button>
                </div>
            </nav>
            <main class="main">
                <div class="admin-panel">
                    <div class="card">
                        <div class="card-header">
                            <h3>Admin Panel - User Management</h3>
                            <span class="admin-badge"><span class="admin-icon">${this.icons.crown}</span> Admin Access</span>
                        </div>
                        <p style="color: var(--text-dim); margin-bottom: 1.5rem;">Manage all user accounts. You can reset passwords, unpublish profiles, or terminate accounts.</p>
                        
                        <div class="admin-stats">
                            <div class="stat-item">
                                <span class="stat-value">${allUsers.length}</span>
                                <span class="stat-label">Total Users</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-value">${allUsers.filter(u => u.published).length}</span>
                                <span class="stat-label">Published</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-value">${allUsers.filter(u => !u.published).length}</span>
                                <span class="stat-label">Unpublished</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="card">
                        <div class="card-header">
                            <h3>All Users</h3>
                        </div>
                        <div class="admin-user-list" id="admin-user-list">
                            ${allUsers.map(u => this.renderAdminUserRow(u)).join('')}
                        </div>
                    </div>
                </div>
            </main>
        `);
        
        // Bind events
        document.getElementById('logout-btn').onclick = () => this.logout();
        document.getElementById('back-dashboard-btn').onclick = () => this.showDashboard();
        
        // Bind user action buttons
        this.bindAdminActions();
    }

    renderAdminUserRow(user) {
        // Skip invalid users
        if (!user || !user.username || !user.slug) return '';
        
        const isProtected = CONFIG.ADMIN_USERS.includes(user.slug);
        const tagInfo = this.getUserTag(user.slug);
        const tagHtml = tagInfo ? `<span class="user-tag ${tagInfo.tagClass}" style="font-size: 0.65rem; padding: 0.15rem 0.5rem;">${tagInfo.tag}</span>` : '';
        
        return `
            <div class="admin-user-row" data-slug="${user.slug}">
                <div class="admin-user-info">
                    <div class="admin-user-avatar">${user.username.charAt(0).toUpperCase()}</div>
                    <div class="admin-user-details">
                        <div class="admin-user-name">
                            ${user.username} ${tagHtml}
                            ${isProtected ? `<span class="protected-badge" title="Protected Account">${this.icons.shield}</span>` : ''}
                        </div>
                        <div class="admin-user-meta">
                            <span class="status-indicator ${user.published ? 'published' : 'unpublished'}">
                                <span class="status-icon">${user.published ? this.icons.checkCircle : this.icons.xCircle}</span>
                                ${user.published ? 'Published' : 'Unpublished'}
                            </span>
                            <span class="user-bio-preview">${user.bio ? user.bio.substring(0, 50) + (user.bio.length > 50 ? '...' : '') : 'No bio'}</span>
                        </div>
                    </div>
                </div>
                <div class="admin-user-actions">
                    <button class="btn btn-warning btn-sm admin-reset-password" data-slug="${user.slug}" title="Reset Password">
                        <span class="btn-icon">${this.icons.key}</span>
                        <span class="btn-text">Reset PW</span>
                    </button>
                    ${!isProtected ? `
                        <button class="btn btn-ghost btn-sm admin-toggle-publish" data-slug="${user.slug}" data-published="${user.published}" title="${user.published ? 'Unpublish' : 'Publish'}">
                            <span class="btn-icon">${user.published ? this.icons.eyeOff : this.icons.eye}</span>
                            <span class="btn-text">${user.published ? 'Unpublish' : 'Publish'}</span>
                        </button>
                        <button class="btn btn-danger btn-sm admin-terminate" data-slug="${user.slug}" title="Terminate Account">
                            <span class="btn-icon">${this.icons.trash}</span>
                            <span class="btn-text">Terminate</span>
                        </button>
                    ` : `<span class="protected-label"><span class="btn-icon">${this.icons.shield}</span> Protected</span>`}
                </div>
            </div>
        `;
    }

    bindAdminActions() {
        // Password reset buttons
        document.querySelectorAll('.admin-reset-password').forEach(btn => {
            btn.onclick = async () => {
                const slug = btn.dataset.slug;
                const newPassword = prompt(`Enter new password for "${slug}":\n(Min 4 characters)`);
                
                if (!newPassword) return;
                if (newPassword.length < 4) {
                    this.toast('Password must be at least 4 characters', 'error');
                    return;
                }
                
                await this.loadData();
                if (this.users[slug]) {
                    this.users[slug].password = await this.hashPass(newPassword);
                    if (await this.saveData()) {
                        this.toast(`Password reset for "${slug}"`, 'success');
                    } else {
                        this.toast('Failed to reset password', 'error');
                    }
                }
            };
        });
        
        // Toggle publish buttons
        document.querySelectorAll('.admin-toggle-publish').forEach(btn => {
            btn.onclick = async () => {
                const slug = btn.dataset.slug;
                const isPublished = btn.dataset.published === 'true';
                
                await this.loadData();
                if (this.users[slug]) {
                    this.users[slug].published = !isPublished;
                    if (await this.saveData()) {
                        this.toast(`${slug} ${!isPublished ? 'published' : 'unpublished'}`, 'success');
                        this.showAdminPanel();
                    } else {
                        this.toast('Failed to update', 'error');
                    }
                }
            };
        });
        
        // Terminate buttons
        document.querySelectorAll('.admin-terminate').forEach(btn => {
            btn.onclick = async () => {
                const slug = btn.dataset.slug;
                
                if (!confirm(`Are you sure you want to TERMINATE the account "${slug}"? This cannot be undone!`)) return;
                
                await this.loadData();
                if (this.users[slug]) {
                    delete this.users[slug];
                    if (await this.saveData()) {
                        this.toast(`Account "${slug}" terminated`, 'success');
                        this.showAdminPanel();
                    } else {
                        this.toast('Failed to terminate', 'error');
                    }
                }
            };
        });
    }

    // ==================== TOAST ====================

    toast(msg, type = 'info') {
        document.querySelectorAll('.toast').forEach(t => t.remove());
        
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = msg;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = 'slideUp 0.3s ease reverse';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
}

// Start app
const app = new App();
