// Modern JavaScript Utilities for Ekstre Frontend

// Modern Alert System
class ModernAlert {
    static show(message, type = 'info', duration = 5000) {
        const alertContainer = document.getElementById('alert-container') || this.createAlertContainer();
        
        const alert = document.createElement('div');
        alert.className = `modern-alert modern-alert-${type}`;
        alert.innerHTML = `
            <div style="display: flex; align-items: center; gap: 0.5rem;">
                <span>${this.getIcon(type)}</span>
                <span>${message}</span>
                <button onclick="this.parentElement.parentElement.remove()" style="margin-left: auto; background: none; border: none; cursor: pointer; font-size: 1.2rem;">×</button>
            </div>
        `;
        
        alertContainer.appendChild(alert);
        
        // Auto remove after duration
        setTimeout(() => {
            if (alert.parentElement) {
                alert.remove();
            }
        }, duration);
        
        return alert;
    }
    
    static createAlertContainer() {
        const container = document.createElement('div');
        container.id = 'alert-container';
        container.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 10000;
            max-width: 400px;
        `;
        document.body.appendChild(container);
        return container;
    }
    
    static getIcon(type) {
        const icons = {
            success: '✅',
            error: '❌',
            warning: '⚠️',
            info: 'ℹ️'
        };
        return icons[type] || icons.info;
    }
}

// Modern Loading System
class ModernLoading {
    static show(container, message = 'Yükleniyor...') {
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'modern-loading-overlay';
        loadingDiv.innerHTML = `
            <div class="modern-loading-content">
                <div class="modern-loading"></div>
                <p>${message}</p>
            </div>
        `;
        
        container.appendChild(loadingDiv);
        return loadingDiv;
    }
    
    static hide(loadingElement) {
        if (loadingElement && loadingElement.parentElement) {
            loadingElement.remove();
        }
    }
}

// Modern Modal System
class ModernModal {
    static show(title, content, options = {}) {
        const modal = document.createElement('div');
        modal.className = 'modern-modal';
        modal.innerHTML = `
            <div class="modern-modal-content">
                <div class="modern-modal-header">
                    <h3 class="modern-modal-title">${title}</h3>
                    <button class="modern-modal-close" onclick="this.closest('.modern-modal').remove()">&times;</button>
                </div>
                <div class="modern-modal-body">
                    ${content}
                </div>
                ${options.showFooter ? `
                    <div class="modern-modal-footer">
                        <button class="modern-btn modern-btn-secondary" onclick="this.closest('.modern-modal').remove()">İptal</button>
                        ${options.confirmText ? `<button class="modern-btn modern-btn-primary" onclick="${options.onConfirm}">${options.confirmText}</button>` : ''}
                    </div>
                ` : ''}
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Close on backdrop click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
        
        return modal;
    }
}

// Modern Form Validation
class ModernFormValidator {
    static validate(formElement) {
        const errors = [];
        const inputs = formElement.querySelectorAll('input, select, textarea');
        
        inputs.forEach(input => {
            const value = input.value.trim();
            const required = input.hasAttribute('required');
            const minLength = input.getAttribute('minlength');
            const maxLength = input.getAttribute('maxlength');
            const pattern = input.getAttribute('pattern');
            
            // Remove previous error styling
            input.classList.remove('error');
            
            // Required validation
            if (required && !value) {
                errors.push(`${input.name || 'Bu alan'} zorunludur`);
                input.classList.add('error');
            }
            
            // Length validation
            if (value) {
                if (minLength && value.length < parseInt(minLength)) {
                    errors.push(`${input.name || 'Bu alan'} en az ${minLength} karakter olmalıdır`);
                    input.classList.add('error');
                }
                
                if (maxLength && value.length > parseInt(maxLength)) {
                    errors.push(`${input.name || 'Bu alan'} en fazla ${maxLength} karakter olmalıdır`);
                    input.classList.add('error');
                }
                
                // Pattern validation
                if (pattern && !new RegExp(pattern).test(value)) {
                    errors.push(`${input.name || 'Bu alan'} geçerli formatta değil`);
                    input.classList.add('error');
                }
            }
        });
        
        return {
            isValid: errors.length === 0,
            errors: errors
        };
    }
}

// Modern Data Table
class ModernDataTable {
    constructor(container, options = {}) {
        this.container = container;
        this.options = {
            pageSize: 10,
            sortable: true,
            searchable: true,
            ...options
        };
        this.data = [];
        this.currentPage = 1;
        this.sortColumn = null;
        this.sortDirection = 'asc';
        this.filteredData = [];
        
        this.init();
    }
    
    init() {
        this.render();
    }
    
    setData(data) {
        this.data = data;
        this.filteredData = [...data];
        this.currentPage = 1;
        this.render();
    }
    
    render() {
        const startIndex = (this.currentPage - 1) * this.options.pageSize;
        const endIndex = startIndex + this.options.pageSize;
        const pageData = this.filteredData.slice(startIndex, endIndex);
        
        this.container.innerHTML = `
            ${this.options.searchable ? this.renderSearch() : ''}
            <div class="modern-table-container">
                <table class="modern-table">
                    <thead>
                        ${this.renderHeader()}
                    </thead>
                    <tbody>
                        ${this.renderBody(pageData)}
                    </tbody>
                </table>
            </div>
            ${this.renderPagination()}
        `;
        
        this.attachEventListeners();
    }
    
    renderSearch() {
        return `
            <div class="modern-search-bar">
                <input type="text" class="modern-search-input" placeholder="Ara..." id="table-search">
            </div>
        `;
    }
    
    renderHeader() {
        if (!this.options.columns) return '';
        
        return `
            <tr>
                ${this.options.columns.map(col => `
                    <th ${this.options.sortable ? `onclick="this.closest('.modern-data-table').sort('${col.key}')" style="cursor: pointer;"` : ''}>
                        ${col.label}
                        ${this.options.sortable && this.sortColumn === col.key ? 
                            `<span>${this.sortDirection === 'asc' ? '↑' : '↓'}</span>` : ''}
                    </th>
                `).join('')}
            </tr>
        `;
    }
    
    renderBody(data) {
        if (!this.options.columns) return '';
        
        return data.map(row => `
            <tr>
                ${this.options.columns.map(col => `
                    <td>${row[col.key] || ''}</td>
                `).join('')}
            </tr>
        `).join('');
    }
    
    renderPagination() {
        const totalPages = Math.ceil(this.filteredData.length / this.options.pageSize);
        if (totalPages <= 1) return '';
        
        return `
            <div class="modern-pagination">
                <button class="modern-page-btn" ${this.currentPage === 1 ? 'disabled' : ''} onclick="this.closest('.modern-data-table').previousPage()">
                    Önceki
                </button>
                <span class="modern-page-btn active">Sayfa ${this.currentPage} / ${totalPages}</span>
                <button class="modern-page-btn" ${this.currentPage === totalPages ? 'disabled' : ''} onclick="this.closest('.modern-data-table').nextPage()">
                    Sonraki
                </button>
            </div>
        `;
    }
    
    attachEventListeners() {
        if (this.options.searchable) {
            const searchInput = this.container.querySelector('#table-search');
            if (searchInput) {
                searchInput.addEventListener('input', (e) => this.filter(e.target.value));
            }
        }
    }
    
    sort(column) {
        if (this.sortColumn === column) {
            this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortColumn = column;
            this.sortDirection = 'asc';
        }
        
        this.filteredData.sort((a, b) => {
            const aVal = a[column];
            const bVal = b[column];
            
            if (aVal < bVal) return this.sortDirection === 'asc' ? -1 : 1;
            if (aVal > bVal) return this.sortDirection === 'asc' ? 1 : -1;
            return 0;
        });
        
        this.currentPage = 1;
        this.render();
    }
    
    filter(searchTerm) {
        if (!searchTerm) {
            this.filteredData = [...this.data];
        } else {
            this.filteredData = this.data.filter(row => 
                Object.values(row).some(value => 
                    String(value).toLowerCase().includes(searchTerm.toLowerCase())
                )
            );
        }
        
        this.currentPage = 1;
        this.render();
    }
    
    nextPage() {
        const totalPages = Math.ceil(this.filteredData.length / this.options.pageSize);
        if (this.currentPage < totalPages) {
            this.currentPage++;
            this.render();
        }
    }
    
    previousPage() {
        if (this.currentPage > 1) {
            this.currentPage--;
            this.render();
        }
    }
}

// Modern Chart Utilities (Basic)
class ModernChart {
    static createBarChart(container, data, options = {}) {
        const canvas = document.createElement('canvas');
        container.appendChild(canvas);
        
        // Basic bar chart implementation
        const ctx = canvas.getContext('2d');
        const width = container.clientWidth;
        const height = 300;
        
        canvas.width = width;
        canvas.height = height;
        
        const maxValue = Math.max(...data.map(d => d.value));
        const barWidth = (width - 100) / data.length;
        
        ctx.fillStyle = '#2563eb';
        data.forEach((item, index) => {
            const barHeight = (item.value / maxValue) * (height - 50);
            const x = 50 + index * barWidth;
            const y = height - 30 - barHeight;
            
            ctx.fillRect(x, y, barWidth - 10, barHeight);
            
            // Label
            ctx.fillStyle = '#64748b';
            ctx.font = '12px Arial';
            ctx.fillText(item.label, x, height - 10);
        });
    }
}

// Modern API Utilities
class ModernAPI {
    static async request(url, options = {}) {
        const defaultOptions = {
            headers: {
                'Content-Type': 'application/json',
            },
        };
        
        const finalOptions = { ...defaultOptions, ...options };
        
        try {
            const response = await fetch(url, finalOptions);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                return await response.json();
            } else {
                return await response.text();
            }
        } catch (error) {
            ModernAlert.show(`API Hatası: ${error.message}`, 'error');
            throw error;
        }
    }
    
    static async get(url) {
        return this.request(url, { method: 'GET' });
    }
    
    static async post(url, data) {
        return this.request(url, {
            method: 'POST',
            body: JSON.stringify(data),
        });
    }
    
    static async put(url, data) {
        return this.request(url, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    }
    
    static async delete(url) {
        return this.request(url, { method: 'DELETE' });
    }
}

// Modern Local Storage Utilities
class ModernStorage {
    static set(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (error) {
            console.error('Storage error:', error);
        }
    }
    
    static get(key, defaultValue = null) {
        try {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : defaultValue;
        } catch (error) {
            console.error('Storage error:', error);
            return defaultValue;
        }
    }
    
    static remove(key) {
        try {
            localStorage.removeItem(key);
        } catch (error) {
            console.error('Storage error:', error);
        }
    }
    
    static clear() {
        try {
            localStorage.clear();
        } catch (error) {
            console.error('Storage error:', error);
        }
    }
}

// Modern Date Utilities
class ModernDate {
    static format(date, format = 'DD/MM/YYYY') {
        const d = new Date(date);
        
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        
        return format
            .replace('DD', day)
            .replace('MM', month)
            .replace('YYYY', year)
            .replace('HH', hours)
            .replace('mm', minutes);
    }
    
    static formatTurkish(date) {
        const d = new Date(date);
        return d.toLocaleDateString('tr-TR');
    }
    
    static formatRelative(date) {
        const now = new Date();
        const diff = now - new Date(date);
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        
        if (days > 0) return `${days} gün önce`;
        if (hours > 0) return `${hours} saat önce`;
        if (minutes > 0) return `${minutes} dakika önce`;
        return 'Az önce';
    }
}

// Modern Number Utilities
class ModernNumber {
    static formatCurrency(amount, currency = 'TRY') {
        return new Intl.NumberFormat('tr-TR', {
            style: 'currency',
            currency: currency,
        }).format(amount);
    }
    
    static formatNumber(number, decimals = 2) {
        return new Intl.NumberFormat('tr-TR', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
        }).format(number);
    }
    
    static formatPercent(value, decimals = 2) {
        return `${this.formatNumber(value, decimals)}%`;
    }
}

// Export utilities for use in other files
window.ModernAlert = ModernAlert;
window.ModernLoading = ModernLoading;
window.ModernModal = ModernModal;
window.ModernFormValidator = ModernFormValidator;
window.ModernDataTable = ModernDataTable;
window.ModernChart = ModernChart;
window.ModernAPI = ModernAPI;
window.ModernStorage = ModernStorage;
window.ModernDate = ModernDate;
window.ModernNumber = ModernNumber; 