/**
 * File: utils.js
 * Global Utilities for the entire system
 * Author: ThanhTrung2308
 * Created: 2025-01-15
 */

const ValidationUtils = {
    isValidCode(value) {
        return /^[A-Za-z0-9_-]+$/.test(value);
    },
    
    isValidEmail(value) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    },
    
    isValidPhone(value) {
        return /^(0|\+84)[0-9]{9,10}$/.test(value);
    },
    
    showError(fieldId, message) {
        const field = document.getElementById(fieldId);
        if (!field) return;
        
        this.clearError(fieldId);
        
        field.classList.add('border-red-500', 'focus:ring-red-500', 'focus:border-red-500');
        field.classList.remove('border-slate-300', 'focus:ring-green-500', 'focus:border-green-500');
        
        const errorDiv = document.createElement('div');
        errorDiv.className = 'validation-error text-red-600 text-sm mt-1 flex items-center gap-1';
        errorDiv.innerHTML = `
            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
            </svg>
            <span>${message}</span>
        `;
        field.parentElement.appendChild(errorDiv);
    },
    
    clearError(fieldId) {
        const field = document.getElementById(fieldId);
        if (!field) return;
        
        field.classList.remove('border-red-500', 'focus:ring-red-500', 'focus:border-red-500');
        field.classList.add('border-slate-300', 'focus:ring-green-500', 'focus:border-green-500');
        
        const errorDiv = field.parentElement.querySelector('.validation-error');
        if (errorDiv) errorDiv.remove();
    },
    
    validate(fieldId, type = 'code', customMessage = null) {
        const field = document.getElementById(fieldId);
        if (!field) return true;
        
        const value = field.value.trim();
        
        if (!value && !field.hasAttribute('required')) {
            this.clearError(fieldId);
            return true;
        }
        
        if (!value && field.hasAttribute('required')) {
            this.showError(fieldId, customMessage || 'Trường này không được để trống');
            return false;
        }
        
        let isValid = true;
        let errorMessage = '';
        
        switch(type) {
            case 'code':
                isValid = this.isValidCode(value);
                errorMessage = 'Mã chỉ được chứa chữ, số, gạch ngang (-) và gạch dưới (_)';
                break;
            case 'email':
                isValid = this.isValidEmail(value);
                errorMessage = 'Email không hợp lệ';
                break;
            case 'phone':
                isValid = this.isValidPhone(value);
                errorMessage = 'Số điện thoại không hợp lệ';
                break;
            default:
                isValid = true;
        }
        
        if (!isValid) {
            this.showError(fieldId, customMessage || errorMessage);
            return false;
        }
        
        this.clearError(fieldId);
        return true;
    }
};

const NotificationUtils = {
    configs: {
        success: { 
            color: 'bg-green-500',
            icon: `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
            </svg>`
        },
        error: { 
            color: 'bg-red-500',
            icon: `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>`
        },
        info: { 
            color: 'bg-blue-500',
            icon: `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>`
        },
        warning: { 
            color: 'bg-yellow-500',
            icon: `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
            </svg>`
        }
    },
    
    show(message, type = 'info', duration = 3000) {
        document.querySelectorAll('.custom-notification').forEach(n => n.remove());
        
        const config = this.configs[type] || this.configs.info;
        
        const notification = document.createElement('div');
        notification.className = `custom-notification fixed top-4 right-4 z-50 px-6 py-4 rounded-lg shadow-lg text-white transform transition-all duration-300 translate-x-full ${config.color}`;
        notification.innerHTML = `
            <div class="flex items-center gap-3">
                <div class="shrink-0">${config.icon}</div>
                <span class="font-medium">${message}</span>
                <button type="button" class="ml-4 shrink-0 hover:opacity-75" onclick="this.parentElement.parentElement.remove()">
                    <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/>
                    </svg>
                </button>
            </div>
        `;
        
        document.body.appendChild(notification);
        
        requestAnimationFrame(() => {
            notification.classList.remove('translate-x-full');
        });
        
        if (duration > 0) {
            setTimeout(() => {
                notification.classList.add('translate-x-full');
                setTimeout(() => notification.remove(), 300);
            }, duration);
        }
    },
    
    success(message, duration = 3000) {
        this.show(message, 'success', duration);
    },
    
    error(message, duration = 3000) {
        this.show(message, 'error', duration);
    },
    
    info(message, duration = 3000) {
        this.show(message, 'info', duration);
    },
    
    warning(message, duration = 3000) {
        this.show(message, 'warning', duration);
    }
};

const SidebarUtils = {
    init(sidebarId, overlayId, options = {}) {
        const sidebar = document.getElementById(sidebarId);
        const overlay = document.getElementById(overlayId);
        
        if (!sidebar || !overlay) {
            console.error('⛔ Sidebar or overlay not found!');
            return null;
        }
        
        return {
            sidebar,
            overlay,
            options: {
                animationDuration: options.animationDuration || 300,
                codeFieldId: options.codeFieldId,
                onOpen: options.onOpen || (() => {}),
                onClose: options.onClose || (() => {}),
            },
            
            open() {
                overlay.classList.remove('hidden');
                requestAnimationFrame(() => {
                    overlay.style.opacity = '1';
                    sidebar.classList.remove('translate-x-full');
                });
                this.options.onOpen();
            },
            
            close() {
                sidebar.classList.add('translate-x-full');
                overlay.style.opacity = '0';
                
                setTimeout(() => {
                    overlay.classList.add('hidden');
                    this.options.onClose();
                }, this.options.animationDuration);
            },
            
            toggle() {
                if (overlay.classList.contains('hidden')) {
                    this.open();
                } else {
                    this.close();
                }
            },
            
            setTitle(title) {
                const titleElement = sidebar.querySelector('#sidebar-title, [data-sidebar-title]');
                if (titleElement) {
                    titleElement.textContent = title;
                }
            },
            
            disableField(fieldId, disable = true) {
                const field = sidebar.querySelector(`#${fieldId}`);
                if (!field) return;
                
                if (disable) {
                    // ✅ Dùng readonly thay vì disabled
                    field.readOnly = true;
                    field.classList.add('bg-slate-100', 'cursor-not-allowed');
                    field.style.opacity = '0.6';
                    // ✅ Thêm style pointer-events để không click được
                    field.style.pointerEvents = 'none';
                } else {
                    field.readOnly = false;
                    field.classList.remove('bg-slate-100', 'cursor-not-allowed');
                    field.style.opacity = '1';
                    field.style.pointerEvents = '';
                }
            },
            
            setMode(mode) {
                const codeFieldId = this.options.codeFieldId;
                if (!codeFieldId) return;
                
                if (mode === 'create') {
                    this.disableField(codeFieldId, false);
                } else {
                    this.disableField(codeFieldId, true);
                }
            }
        };
    }
};

const ModalUtils = {
    showConfirm(options = {}) {
        const {
            title = 'Xác nhận',
            message = 'Bạn có chắc chắn muốn thực hiện thao tác này?',
            confirmText = 'Xác nhận',
            cancelText = 'Hủy',
            type = 'warning',
            onConfirm = () => {},
            onCancel = () => {}
        } = options;
        
        const icons = {
            warning: `<svg class="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
            </svg>`,
            danger: `<svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
            </svg>`,
            info: `<svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>`
        };
        
        const bgColors = {
            warning: 'bg-yellow-100',
            danger: 'bg-red-100',
            info: 'bg-blue-100'
        };
        
        const btnColors = {
            warning: 'bg-yellow-600 hover:bg-yellow-700',
            danger: 'bg-red-600 hover:bg-red-700',
            info: 'bg-blue-600 hover:bg-blue-700'
        };
        
        const modal = document.createElement('div');
        modal.id = 'global-confirm-modal';
        modal.className = 'fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4';
        modal.innerHTML = `
            <div class="bg-white rounded-lg shadow-xl max-w-md w-full transform transition-all duration-300 scale-95 opacity-0" id="modal-content">
                <div class="p-6">
                    <div class="flex items-start mb-4">
                        <div class="shrink-0">
                            <div class="w-12 h-12 rounded-full ${bgColors[type]} flex items-center justify-center">
                                ${icons[type]}
                            </div>
                        </div>
                        <div class="ml-4 grow">
                            <h3 class="text-lg font-semibold text-slate-900">${title}</h3>
                            <p class="mt-2 text-sm text-slate-600">${message}</p>
                        </div>
                    </div>
                    
                    <div class="flex gap-3 justify-end mt-6">
                        <button type="button" id="modal-cancel" class="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors">
                            ${cancelText}
                        </button>
                        <button type="button" id="modal-confirm" class="px-4 py-2 text-sm font-medium text-white ${btnColors[type]} rounded-lg transition-colors">
                            ${confirmText}
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        const modalContent = modal.querySelector('#modal-content');
        const cancelBtn = modal.querySelector('#modal-cancel');
        const confirmBtn = modal.querySelector('#modal-confirm');
        
        requestAnimationFrame(() => {
            modalContent.classList.remove('scale-95', 'opacity-0');
            modalContent.classList.add('scale-100', 'opacity-100');
        });
        
        const closeModal = () => {
            modalContent.classList.add('scale-95', 'opacity-0');
            modalContent.classList.remove('scale-100', 'opacity-100');
            setTimeout(() => modal.remove(), 300);
        };
        
        cancelBtn.addEventListener('click', () => {
            closeModal();
            onCancel();
        });
        
        confirmBtn.addEventListener('click', () => {
            closeModal();
            onConfirm();
        });
        
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal();
                onCancel();
            }
        });
    }
};

const HelperUtils = {
    getCsrfToken() {
        return document.querySelector('[name=csrfmiddlewaretoken]')?.value || '';
    },
    
    debounce(func, wait = 300) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },
    
    throttle(func, limit = 300) {
        let inThrottle;
        return function(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    },
    
    formatCurrency(amount) {
        return new Intl.NumberFormat('vi-VN', {
            style: 'currency',
            currency: 'VND'
        }).format(amount);
    },
    
    formatDate(date, format = 'DD/MM/YYYY') {
        const d = new Date(date);
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        
        return format
            .replace('DD', day)
            .replace('MM', month)
            .replace('YYYY', year);
    },
    
};

window.ValidationUtils = ValidationUtils;
window.NotificationUtils = NotificationUtils;
window.SidebarUtils = SidebarUtils;
window.ModalUtils = ModalUtils;
window.HelperUtils = HelperUtils;