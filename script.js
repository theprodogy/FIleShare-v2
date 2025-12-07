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
    SPECIAL_USERS: {
        'kiriko': { tag: 'Owner', tagClass: 'tag-owner' },
        'snow': { tag: 'Co-Founder', tagClass: 'tag-cofounder' }
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
        let needsSave = false;
        
        // Create kiriko (owner) account if it doesn't exist
        if (!this.users['kiriko']) {
            const kirikoPassword = await this.hashPass('kiriko');
            this.users['kiriko'] = {
                username: 'kiriko',
                slug: 'kiriko',
                password: kirikoPassword,
                discordId: '',
                bio: 'Owner of FileShare',
                servers: [],
                links: [],
                published: true,
                created: 0 // Earliest timestamp
            };
            needsSave = true;
        }
        
        // Create snow account if it doesn't exist
        if (!this.users['snow']) {
            const snowPassword = await this.hashPass('sbowiscool');
            this.users['snow'] = {
                username: 'snow',
                slug: 'snow',
                password: snowPassword,
                discordId: '',
                bio: 'Co-Founder of FileShare',
                servers: [],
                links: [],
                published: true,
                created: 1 // Very early timestamp to ensure OG status too
            };
            needsSave = true;
        }
        
        // Create dexu account if it doesn't exist
        if (!this.users['dexu']) {
            const dexuPassword = await this.hashPass('dexu');
            this.users['dexu'] = {
                username: 'dexu',
                slug: 'dexu',
                password: dexuPassword,
                discordId: '',
                bio: '',
                servers: [],
                links: [],
                published: true,
                created: 2 // Early timestamp for OG status
            };
            needsSave = true;
        }
        
        if (needsSave) await this.saveData();
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
                            
                            <p style="color: var(--text-dim); font-size: 0.85rem; margin-bottom: 1rem;">Add links to files, documents, websites, or anything you want to share.</p>
                            
                            <div id="links-list">
                                ${(this.user.links || []).map((link, i) => `
                                    <div class="link-item" data-index="${i}">
                                        <div class="link-icon">${this.getLinkIcon(link.url)}</div>
                                        <div class="link-info">
                                            <input type="text" class="link-title" placeholder="Title" value="${link.title || ''}">
                                            <input type="text" class="link-url" placeholder="https://..." value="${link.url || ''}">
                                        </div>
                                        <button class="btn btn-danger btn-sm remove-link" data-index="${i}">✕</button>
                                    </div>
                                `).join('')}
                            </div>
                            <button class="btn btn-ghost btn-sm" id="add-link-btn" style="margin-top: 0.5rem;">+ Add Link</button>
                        </div>
                    </div>
                </div>
            </main>
        `);

        // Bind events
        document.getElementById('logout-btn').onclick = () => this.logout();
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
        document.getElementById('add-link-btn').onclick = () => this.addLink();
        
        // Bind remove buttons
        document.querySelectorAll('.remove-server').forEach(btn => {
            btn.onclick = () => this.removeServerInput(parseInt(btn.dataset.index));
        });
        
        // Bind link remove buttons
        document.querySelectorAll('.remove-link').forEach(btn => {
            btn.onclick = () => this.removeLink(parseInt(btn.dataset.index));
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
        
        // Collect links
        const linkItems = document.querySelectorAll('.link-item');
        this.user.links = Array.from(linkItems).map(item => ({
            title: item.querySelector('.link-title').value.trim(),
            url: item.querySelector('.link-url').value.trim()
        })).filter(l => l.url);

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

    getLinkIcon(url) {
        if (!url) return '🔗';
        const u = url.toLowerCase();
        if (u.includes('drive.google') || u.includes('docs.google')) return '📄';
        if (u.includes('github')) return '💻';
        if (u.includes('youtube') || u.includes('youtu.be')) return '🎬';
        if (u.includes('spotify')) return '🎵';
        if (u.includes('twitter') || u.includes('x.com')) return '🐦';
        if (u.includes('instagram')) return '📷';
        if (u.includes('discord')) return '💬';
        if (u.includes('twitch')) return '🎮';
        if (u.match(/\.(pdf)$/i)) return '📕';
        if (u.match(/\.(zip|rar|7z)$/i)) return '📦';
        if (u.match(/\.(png|jpg|jpeg|gif|webp)$/i)) return '🖼️';
        if (u.match(/\.(mp3|wav|ogg)$/i)) return '🎵';
        if (u.match(/\.(mp4|mov|avi|webm)$/i)) return '🎬';
        return '🔗';
    }

    addLink() {
        if (!this.user.links) this.user.links = [];
        if (this.user.links.length >= 10) {
            this.toast('Max 10 links allowed', 'warning');
            return;
        }
        
        this.user.links.push({ title: '', url: '' });
        this.refreshLinks();
    }

    removeLink(index) {
        if (!this.user.links) return;
        this.user.links.splice(index, 1);
        this.refreshLinks();
    }

    refreshLinks() {
        const container = document.getElementById('links-list');
        
        container.innerHTML = (this.user.links || []).map((link, i) => `
            <div class="link-item" data-index="${i}">
                <div class="link-icon">${this.getLinkIcon(link.url)}</div>
                <div class="link-info">
                    <input type="text" class="link-title" placeholder="Title" value="${link.title || ''}">
                    <input type="text" class="link-url" placeholder="https://..." value="${link.url || ''}">
                </div>
                <button class="btn btn-danger btn-sm remove-link" data-index="${i}">✕</button>
            </div>
        `).join('');
        
        // Rebind remove buttons
        document.querySelectorAll('.remove-link').forEach(btn => {
            btn.onclick = () => this.removeLink(parseInt(btn.dataset.index));
        });
        
        // Update icons on URL change
        document.querySelectorAll('.link-url').forEach((input, i) => {
            input.oninput = () => {
                const icon = input.closest('.link-item').querySelector('.link-icon');
                icon.textContent = this.getLinkIcon(input.value);
            };
        });
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
        return /\.(pdf|zip|rar|7z|exe|dmg|apk|doc|docx|xls|xlsx|ppt|pptx|mp3|mp4|mov|avi|png|jpg|jpeg|gif)$/i.test(url);
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

        // Load links
        if (user.links && user.links.length > 0) {
            const linksContainer = document.getElementById('p-links');
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
                            <div class="link-action">${this.isDownloadLink(link.url) ? '⬇️' : '↗️'}</div>
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

