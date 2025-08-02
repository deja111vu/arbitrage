// Telegram Web App API Integration
const tg = window.Telegram.WebApp;
tg.expand();

// Application State
const AppState = {
    currentPage: 'home',
    currentMonth: new Date().getMonth(),
    currentYear: new Date().getFullYear(),
    calendarData: {},
    trackedCases: [],
    trackedCompanies: [],
    userInfo: null,
    subscriptionInfo: null
};

// Webhook Configuration
const WEBHOOK_CONFIG = {
    baseUrl: 'https://your-nocodb-instance.com/api/webhooks', // Replace with actual webhook URL
    endpoints: {
        checkSubscription: '/check-subscription',
        getHomeData: '/get-home-data',
        getCalendarData: '/get-calendar-data',
        getCaseDetails: '/get-case-details',
        getTrackedItems: '/get-tracked-items',
        addItem: '/add-item',
        deleteItem: '/delete-item',
        updateProfile: '/update-profile',
        notifyBot: '/notify-bot'
    }
};

// Utility Functions
const utils = {
    formatDate(date) {
        return new Date(date).toLocaleDateString('ru-RU', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    },

    showLoading(elementId) {
        const element = document.getElementById(elementId);
        if (element) {
            element.innerHTML = '<div class="loading">Загрузка...</div>';
        }
    },

    showError(elementId, message) {
        const element = document.getElementById(elementId);
        if (element) {
            element.innerHTML = `<div class="error">${message}</div>`;
        }
    },

    getUserId() {
        return tg.initDataUnsafe?.user?.id || 'demo_user';
    },

    getUserName() {
        return tg.initDataUnsafe?.user?.first_name || 'Пользователь';
    }
};

// Webhook Functions
const webhooks = {
    async sendRequest(endpoint, data = {}) {
        try {
            const response = await fetch(WEBHOOK_CONFIG.baseUrl + endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    userId: utils.getUserId(),
                    ...data
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Webhook request failed:', error);
            return { success: false, error: error.message };
        }
    },

    async checkSubscription() {
        const response = await this.sendRequest(WEBHOOK_CONFIG.endpoints.checkSubscription);
        if (!response.success || !response.data.isActive) {
            await this.notifyBot('subscription_expired');
            tg.close();
            return false;
        }
        AppState.subscriptionInfo = response.data;
        return true;
    },

    async getHomeData() {
        return await this.sendRequest(WEBHOOK_CONFIG.endpoints.getHomeData);
    },

    async getCalendarData(month, year) {
        return await this.sendRequest(WEBHOOK_CONFIG.endpoints.getCalendarData, {
            month,
            year
        });
    },

    async getCaseDetails(date) {
        return await this.sendRequest(WEBHOOK_CONFIG.endpoints.getCaseDetails, {
            date
        });
    },

    async getTrackedItems(type) {
        return await this.sendRequest(WEBHOOK_CONFIG.endpoints.getTrackedItems, {
            type
        });
    },

    async addItem(type, value) {
        return await this.sendRequest(WEBHOOK_CONFIG.endpoints.addItem, {
            type,
            value
        });
    },

    async deleteItem(type, id) {
        return await this.sendRequest(WEBHOOK_CONFIG.endpoints.deleteItem, {
            type,
            id
        });
    },

    async updateProfile(data) {
        return await this.sendRequest(WEBHOOK_CONFIG.endpoints.updateProfile, data);
    },

    async notifyBot(action, data = {}) {
        return await this.sendRequest(WEBHOOK_CONFIG.endpoints.notifyBot, {
            action,
            ...data
        });
    }
};

// Navigation Functions
const navigation = {
    init() {
        const navButtons = document.querySelectorAll('.bottom-nav .nav-btn');
        navButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                const page = button.getAttribute('data-page');
                if (page === 'add') {
                    modal.open();
                } else {
                    this.showPage(page);
                }
            });
        });
    },

    showPage(pageName) {
        // Hide all pages
        document.querySelectorAll('.page').forEach(page => {
            page.classList.remove('active');
        });

        // Show selected page
        const targetPage = document.getElementById(`${pageName}-page`);
        if (targetPage) {
            targetPage.classList.add('active');
        }

        // Update navigation
        document.querySelectorAll('.bottom-nav .nav-btn').forEach(btn => {
            btn.classList.remove('active');
        });

        const activeBtn = document.querySelector(`[data-page="${pageName}"]`);
        if (activeBtn && pageName !== 'add') {
            activeBtn.classList.add('active');
        }

        AppState.currentPage = pageName;

        // Load page data
        switch (pageName) {
            case 'home':
                homePage.load();
                break;
            case 'calendar':
                calendarPage.load();
                break;
            case 'management':
                managementPage.load();
                break;
            case 'profile':
                profilePage.load();
                break;
        }
    }
};

// Home Page Functions
const homePage = {
    async load() {
        utils.showLoading('next-hearing-date');
        utils.showLoading('total-cases');
        utils.showLoading('total-companies');
        
        const response = await webhooks.getHomeData();
        
        if (response.success) {
            this.render(response.data);
        } else {
            utils.showError('next-hearing-date', 'Ошибка загрузки');
        }
    },

    render(data) {
        document.getElementById('next-hearing-date').textContent = 
            data.nextHearing ? utils.formatDate(data.nextHearing) : 'Нет';
        
        document.getElementById('total-cases').textContent = data.totalCases || 0;
        document.getElementById('total-companies').textContent = data.totalCompanies || 0;

        // Render courts breakdown
        const courtsList = document.getElementById('courts-list');
        if (data.courts && data.courts.length > 0) {
            courtsList.innerHTML = data.courts.map(court => `
                <div class="court-item">
                    <span class="court-name">${court.name}</span>
                    <span class="court-count">${court.count}</span>
                </div>
            `).join('');
        } else {
            courtsList.innerHTML = '<div class="empty-state"><p>Нет данных о судах</p></div>';
        }
    }
};

// Calendar Page Functions
const calendarPage = {
    async load() {
        this.renderCalendar();
        await this.loadCalendarData();
    },

    async loadCalendarData() {
        const response = await webhooks.getCalendarData(AppState.currentMonth, AppState.currentYear);
        
        if (response.success) {
            AppState.calendarData = response.data;
            this.updateCalendarEvents();
        }
    },

    renderCalendar() {
        const monthNames = [
            'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
            'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
        ];

        document.getElementById('current-month-year').textContent = 
            `${monthNames[AppState.currentMonth]} ${AppState.currentYear}`;

        const firstDay = new Date(AppState.currentYear, AppState.currentMonth, 1);
        const lastDay = new Date(AppState.currentYear, AppState.currentMonth + 1, 0);
        const today = new Date();

        const calendarDates = document.getElementById('calendar-dates');
        calendarDates.innerHTML = '';

        // Add empty cells for days before the first day of the month
        const startDay = (firstDay.getDay() + 6) % 7; // Convert to Monday start
        for (let i = 0; i < startDay; i++) {
            const emptyCell = document.createElement('div');
            emptyCell.classList.add('calendar-date', 'other-month');
            calendarDates.appendChild(emptyCell);
        }

        // Add days of the month
        for (let day = 1; day <= lastDay.getDate(); day++) {
            const date = new Date(AppState.currentYear, AppState.currentMonth, day);
            const dateCell = document.createElement('div');
            dateCell.classList.add('calendar-date');
            dateCell.textContent = day;

            // Mark weekends
            if (date.getDay() === 0 || date.getDay() === 6) {
                dateCell.classList.add('weekend');
            }

            // Mark today
            if (date.toDateString() === today.toDateString()) {
                dateCell.classList.add('today');
            }

            // Add click event
            dateCell.addEventListener('click', () => {
                this.onDateClick(date);
            });

            calendarDates.appendChild(dateCell);
        }

        // Add navigation events
        document.getElementById('prev-month').onclick = () => {
            AppState.currentMonth--;
            if (AppState.currentMonth < 0) {
                AppState.currentMonth = 11;
                AppState.currentYear--;
            }
            this.load();
        };

        document.getElementById('next-month').onclick = () => {
            AppState.currentMonth++;
            if (AppState.currentMonth > 11) {
                AppState.currentMonth = 0;
                AppState.currentYear++;
            }
            this.load();
        };
    },

    updateCalendarEvents() {
        if (!AppState.calendarData.hearings) return;

        AppState.calendarData.hearings.forEach(hearing => {
            const date = new Date(hearing.date);
            if (date.getMonth() === AppState.currentMonth && date.getFullYear() === AppState.currentYear) {
                const day = date.getDate();
                const dateCell = document.querySelector(`.calendar-date:nth-child(${day + ((new Date(AppState.currentYear, AppState.currentMonth, 1).getDay() + 6) % 7)})`);
                if (dateCell && dateCell.textContent == day) {
                    dateCell.classList.add('has-hearing');
                }
            }
        });
    },

    async onDateClick(date) {
        const dateString = date.toISOString().split('T')[0];
        const response = await webhooks.getCaseDetails(dateString);
        
        const detailsContent = document.getElementById('case-details-content');
        
        if (response.success && response.data.cases && response.data.cases.length > 0) {
            detailsContent.innerHTML = response.data.cases.map(case_ => `
                <div class="case-detail-item">
                    <h4>${case_.number}</h4>
                    <p><strong>Суд:</strong> ${case_.court}</p>
                    <p><strong>Время:</strong> ${case_.time}</p>
                    <p><strong>Тип:</strong> ${case_.type}</p>
                </div>
            `).join('');
        } else {
            detailsContent.innerHTML = 'На выбранную дату заседаний не найдено';
        }
    }
};

// Management Page Functions
const managementPage = {
    init() {
        document.getElementById('cases-toggle').addEventListener('change', () => {
            this.showList('cases');
        });

        document.getElementById('companies-toggle').addEventListener('change', () => {
            this.showList('companies');
        });
    },

    async load() {
        await this.loadCases();
        await this.loadCompanies();
        this.showList('cases');
    },

    async loadCases() {
        const response = await webhooks.getTrackedItems('cases');
        if (response.success) {
            AppState.trackedCases = response.data;
            this.renderCases();
        }
    },

    async loadCompanies() {
        const response = await webhooks.getTrackedItems('companies');
        if (response.success) {
            AppState.trackedCompanies = response.data;
            this.renderCompanies();
        }
    },

    renderCases() {
        const casesList = document.getElementById('cases-list');
        
        if (AppState.trackedCases.length === 0) {
            casesList.innerHTML = `
                <div class="empty-state">
                    <div class="icon">⚖️</div>
                    <h3>Нет отслеживаемых дел</h3>
                    <p>Добавьте дело для отслеживания</p>
                </div>
            `;
            return;
        }

        casesList.innerHTML = AppState.trackedCases.map(case_ => `
            <div class="list-item" onclick="window.open('${case_.url}', '_blank')">
                <div class="item-info">
                    <div class="item-title">${case_.number}</div>
                    <div class="item-subtitle">${case_.court}</div>
                </div>
                <button class="delete-btn" onclick="event.stopPropagation(); managementPage.deleteItem('case', '${case_.id}')">
                    🗑️
                </button>
            </div>
        `).join('');
    },

    renderCompanies() {
        const companiesList = document.getElementById('companies-list');
        
        if (AppState.trackedCompanies.length === 0) {
            companiesList.innerHTML = `
                <div class="empty-state">
                    <div class="icon">🏢</div>
                    <h3>Нет отслеживаемых компаний</h3>
                    <p>Добавьте компанию для отслеживания</p>
                </div>
            `;
            return;
        }

        companiesList.innerHTML = AppState.trackedCompanies.map(company => `
            <div class="list-item" onclick="window.open('${company.url}', '_blank')">
                <div class="item-info">
                    <div class="item-title">${company.name}</div>
                    <div class="item-subtitle">ИНН: ${company.inn}</div>
                </div>
                <button class="delete-btn" onclick="event.stopPropagation(); managementPage.deleteItem('company', '${company.id}')">
                    🗑️
                </button>
            </div>
        `).join('');
    },

    showList(type) {
        document.querySelectorAll('.list-content').forEach(list => {
            list.classList.remove('active');
        });

        document.getElementById(`${type}-list`).classList.add('active');
    },

    async deleteItem(type, id) {
        const response = await webhooks.deleteItem(type, id);
        if (response.success) {
            if (type === 'case') {
                await this.loadCases();
            } else {
                await this.loadCompanies();
            }
        }
    }
};

// Profile Page Functions
const profilePage = {
    init() {
        document.getElementById('choose-tariff-btn').addEventListener('click', async () => {
            await webhooks.notifyBot('choose_tariff');
            tg.close();
        });

        document.getElementById('email-notifications-toggle').addEventListener('change', (e) => {
            this.toggleEmailInput(e.target.checked);
            this.updateProfile();
        });

        document.getElementById('email-input').addEventListener('input', () => {
            this.updateProfile();
        });
    },

    async load() {
        // Set user name
        document.getElementById('user-name').textContent = utils.getUserName();

        // Load subscription info
        if (AppState.subscriptionInfo) {
            document.getElementById('tariff-name').textContent = AppState.subscriptionInfo.tariffName || '-';
            document.getElementById('subscription-end').textContent = 
                AppState.subscriptionInfo.endDate ? utils.formatDate(AppState.subscriptionInfo.endDate) : '-';
        }

        // Load profile settings
        await this.loadProfileSettings();
    },

    async loadProfileSettings() {
        const response = await webhooks.sendRequest('/get-profile-settings');
        if (response.success && response.data) {
            const data = response.data;
            
            document.getElementById('email-notifications-toggle').checked = data.emailNotifications || false;
            
            if (data.emailNotifications) {
                this.toggleEmailInput(true);
                document.getElementById('email-input').value = data.email || '';
            }
        }
    },

    toggleEmailInput(show) {
        const container = document.getElementById('email-input-container');
        if (show) {
            container.classList.remove('hidden');
        } else {
            container.classList.add('hidden');
        }
    },

    async updateProfile() {
        const emailNotifications = document.getElementById('email-notifications-toggle').checked;
        const email = document.getElementById('email-input').value;

        await webhooks.updateProfile({
            emailNotifications,
            email: emailNotifications ? email : null
        });
    }
};

// Modal Functions
const modal = {
    init() {
        document.getElementById('close-modal').addEventListener('click', () => {
            this.close();
        });

        document.getElementById('select-case').addEventListener('click', () => {
            this.selectType('case');
        });

        document.getElementById('select-company').addEventListener('click', () => {
            this.selectType('company');
        });

        document.getElementById('add-item-btn').addEventListener('click', () => {
            this.addItem();
        });

        // Close modal on backdrop click
        document.getElementById('add-modal').addEventListener('click', (e) => {
            if (e.target.id === 'add-modal') {
                this.close();
            }
        });
    },

    open() {
        document.getElementById('add-modal').classList.add('active');
        this.selectType('case'); // Default to case
    },

    close() {
        document.getElementById('add-modal').classList.remove('active');
        this.clearInputs();
    },

    selectType(type) {
        // Update buttons
        document.querySelectorAll('.type-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        
        if (type === 'case') {
            document.getElementById('select-case').classList.add('active');
        } else {
            document.getElementById('select-company').classList.add('active');
        }

        // Update input sections
        document.querySelectorAll('.input-group').forEach(group => {
            group.classList.remove('active');
        });

        if (type === 'case') {
            document.getElementById('case-input-section').classList.add('active');
        } else {
            document.getElementById('company-input-section').classList.add('active');
        }
    },

    async addItem() {
        const isCaseActive = document.getElementById('case-input-section').classList.contains('active');
        const type = isCaseActive ? 'case' : 'company';
        const value = isCaseActive ? 
            document.getElementById('case-number').value.trim() :
            document.getElementById('company-id').value.trim();

        if (!value) {
            alert('Пожалуйста, заполните поле');
            return;
        }

        const response = await webhooks.addItem(type, value);
        
        if (response.success) {
            this.close();
            // Refresh management page if it's currently active
            if (AppState.currentPage === 'management') {
                managementPage.load();
            }
            // Also refresh home page data
            if (AppState.currentPage === 'home') {
                homePage.load();
            }
        } else {
            alert(response.error || 'Ошибка при добавлении элемента');
        }
    },

    clearInputs() {
        document.getElementById('case-number').value = '';
        document.getElementById('company-id').value = '';
    }
};

// Application Initialization
const App = {
    async init() {
        // Check subscription first
        const hasActiveSubscription = await webhooks.checkSubscription();
        if (!hasActiveSubscription) {
            return; // App will close
        }

        // Initialize components
        navigation.init();
        managementPage.init();
        profilePage.init();
        modal.init();

        // Load initial page
        navigation.showPage('home');

        // Set up Telegram Web App
        tg.ready();
        
        // Disable vertical swipes to prevent closing
        tg.disableVerticalSwipes();
    }
};

// Start the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});

// Handle Telegram Web App events
tg.onEvent('mainButtonClicked', () => {
    // Handle main button clicks if needed
});

tg.onEvent('backButtonClicked', () => {
    // Handle back button
    if (AppState.currentPage !== 'home') {
        navigation.showPage('home');
    } else {
        tg.close();
    }
});

// Export for global access
window.managementPage = managementPage;