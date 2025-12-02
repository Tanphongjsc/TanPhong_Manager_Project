// ============================================================
// APPUTILS - Unified Utilities (OPTIMIZED)
// ============================================================
const AppUtils = (() => {
    const DEFAULT_CONFIG = {
        TOAST_DURATION: 3000,
        SEARCH_DEBOUNCE: 400,
        API_TIMEOUT: 30000
    };

    let config = { ...DEFAULT_CONFIG };
    let csrfToken = '';

    function init(options = {}) {
        config = { ...DEFAULT_CONFIG, ...options };
        csrfToken = _getCsrfTokenFromDOM();
        return { config, csrfToken };
    }

    function _getCsrfTokenFromDOM() {
        return document.getElementById('csrf-token')?.value || 
               document.querySelector('[name=csrfmiddlewaretoken]')?.value || 
               '';
    }

    function getCsrfToken() {
        return csrfToken || _getCsrfTokenFromDOM();
    }

    // ============================================================
    // API LAYER - 🔧 FIX: Chuẩn hóa response format
    // ============================================================
    const API = (() => {
        async function fetchJSON(url, options = {}) {
            const externalSignal = options.signal;
            const timeoutController = new AbortController();
            const linkedController = new AbortController();
            let timedOut = false;

            const abortLinked = (reason) => {
                if (!linkedController.signal.aborted) {
                    linkedController.abort(reason);
                }
            };

            if (externalSignal) {
                if (externalSignal.aborted) {
                    abortLinked(externalSignal.reason);
                } else {
                    externalSignal.addEventListener('abort', () => {
                        abortLinked(externalSignal.reason);
                    }, { once: true });
                }
            }

            const timeoutId = setTimeout(() => {
                timedOut = true;
                timeoutController.abort();
                abortLinked(new DOMException('Request timeout', 'TimeoutError'));
            }, config.API_TIMEOUT);

            try {
                // 🔧 FIX: Thêm Accept header
                const headers = {
                    'X-CSRFToken': getCsrfToken(),
                    'Accept': 'application/json',
                    ...options.headers
                };

                let body = options.body;
                if (body && !(body instanceof FormData) && typeof body === 'object') {
                    headers['Content-Type'] = 'application/json';
                    body = JSON.stringify(body);
                }

                const fetchConfig = {
                    ...options,
                    method: options.method || 'GET',
                    headers,
                    body,
                    signal: linkedController.signal
                };

                const response = await fetch(url, fetchConfig);
                clearTimeout(timeoutId);

                // Handle 204 No Content
                if (response.status === 204) {
                    return { success: true };
                }

                // Parse response
                const rawText = await response.text();
                let data = {};
                
                // 🔧 FIX: Chuẩn hóa response không phải JSON
                if (rawText) {
                    try {
                        data = JSON.parse(rawText);
                    } catch (e) {
                        // Non-JSON response → standardize format
                        data = { 
                            success: false, 
                            message: 'Response không phải JSON',
                            raw: rawText 
                        };
                    }
                }

                // Handle HTTP errors
                if (!response.ok) {
                    const errorMessage = data?.message || 
                                       data?.error || 
                                       `HTTP ${response.status}: ${response.statusText}`;
                    
                    // 🔧 FIX: Phân biệt 4xx vs 5xx
                    const errorType = response.status >= 500 ? 'SERVER_ERROR' : 'CLIENT_ERROR';
                    console.error(`⛔ ${errorType}:`, response.status, errorMessage);
                    
                    throw new Error(errorMessage);
                }

                return data;

            } catch (error) {
                clearTimeout(timeoutId);
                
                if (error.name === 'AbortError' && timedOut) {
                    throw new Error('Request timeout');
                }
                
                if (error.name === 'AbortError') {
                    throw error;
                }
                
                throw new Error(error.message || 'Network request failed');
            }
        }

        return {
            get: (url, params = {}, options = {}) => {
                const queryString = new URLSearchParams(
                    Object.entries(params).filter(([_, v]) => v !== null && v !== undefined)
                ).toString();
                const fullUrl = queryString ? `${url}?${queryString}` : url;
                return fetchJSON(fullUrl, { ...options, method: 'GET' });
            },

            post: (url, body = {}, options = {}) => {
                return fetchJSON(url, { ...options, method: 'POST', body });
            },

            // 🔧 FIX: Thêm PUT method
            put: (url, body = {}, options = {}) => {
                return fetchJSON(url, { ...options, method: 'PUT', body });
            },

            // 🔧 FIX: Thêm PATCH method
            patch: (url, body = {}, options = {}) => {
                return fetchJSON(url, { ...options, method: 'PATCH', body });
            },

            delete: (url, body = null, options = {}) => {
                const cfg = { ...options, method: 'DELETE' };
                if (body !== null) cfg.body = body;
                return fetchJSON(url, cfg);
            },

            getConfig: () => ({ ...config }),
            setConfig: (opts = {}) => { config = { ...config, ...opts }; }
        };
    })();

    // ============================================================
    // NOTIFICATION SYSTEM
    // ============================================================
    const Notify = {
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

        show(message, type = 'info', options = {}) {
            const {
                duration = config.TOAST_DURATION,
                closable = true,
                position = 'top-right'
            } = options;

            // Remove old notifications
            document.querySelectorAll('.app-notification').forEach(n => n.remove());

            const cfg = this.configs[type] || this.configs.info;

            const positions = {
                'top-right': 'top-4 right-4',
                'top-left': 'top-4 left-4',
                'bottom-right': 'bottom-4 right-4',
                'bottom-left': 'bottom-4 left-4'
            };

            const positionClass = positions[position] || positions['top-right'];
            const slideClass = position.includes('right') ? 'translate-x-full' : '-translate-x-full';

            const notification = document.createElement('div');
            notification.className = `app-notification fixed ${positionClass} z-[9999] px-6 py-4 rounded-lg shadow-lg text-white transform transition-all duration-300 ${slideClass} ${cfg.color} max-w-sm`;
            notification.innerHTML = `
                <div class="flex items-center gap-3">
                    <div class="shrink-0">${cfg.icon}</div>
                    <span class="font-medium flex-1">${message}</span>
                    ${closable ? `
                        <button type="button" class="ml-2 shrink-0 hover:opacity-75 transition-opacity" onclick="this.closest('.app-notification').remove()">
                            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/>
                            </svg>
                        </button>
                    ` : ''}
                </div>
            `;

            document.body.appendChild(notification);

            requestAnimationFrame(() => {
                notification.classList.remove('translate-x-full', '-translate-x-full');
                notification.classList.add('translate-x-0');
            });

            if (duration > 0) {
                setTimeout(() => {
                    notification.classList.add(slideClass);
                    notification.classList.remove('translate-x-0');
                    setTimeout(() => notification.remove(), 300);
                }, duration);
            }
        },

        success(message, options) { this.show(message, 'success', options); },
        error(message, options) { this.show(message, 'error', options); },
        info(message, options) { this.show(message, 'info', options); },
        warning(message, options) { this.show(message, 'warning', options); }
    };

    // ============================================================
    // MODAL MANAGER - 🔧 TODO: Có thể thêm Promise pattern sau
    // ============================================================
    const Modal = {
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
        },

        open(modal) {
            if (!modal) return;
            modal.classList.remove('hidden');
            modal.classList.add('flex');
            setTimeout(() => {
                modal.classList.remove('opacity-0');
                const content = modal.querySelector('.modal-content');
                if (content) {
                    content.classList.remove('scale-95');
                    content.classList.add('scale-100');
                }
            }, 10);
        },

        close(modal) {
            if (!modal) return;
            modal.classList.add('opacity-0');
            const content = modal.querySelector('.modal-content');
            if (content) {
                content.classList.remove('scale-100');
                content.classList.add('scale-95');
            }
            setTimeout(() => {
                modal.classList.remove('flex');
                modal.classList.add('hidden');
            }, 200);
        }
    };

    // ============================================================
    // SIDEBAR MANAGER
    // ============================================================
    const Sidebar = {
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
                        field.readOnly = true;
                        field.classList.add('bg-slate-100', 'cursor-not-allowed');
                        field.style.opacity = '0.6';
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

    // ============================================================
    // VALIDATION - 🔧 TODO: Có thể thêm custom rule pattern sau
    // ============================================================
    const Validation = {
        isValidCode(value) {
            // 🔧 TODO: Có thể thêm max length validation
            return /^[A-Za-z0-9_-]+$/.test(value);
        },

        isValidEmail(value) {
            return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
        },

        isValidPhone(value) {
            return /^(0|\+84)[0-9]{9,10}$/.test(value.replace(/\s/g, ''));
        },

        required(value) {
            if (value === null || value === undefined) return false;
            if (typeof value === 'string') return value.trim().length > 0;
            if (Array.isArray(value)) return value.length > 0;
            if (typeof value === 'number') return true; // 0 is valid
            return true;
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

            // Required check
            if (!value && field.hasAttribute('required')) {
                this.showError(fieldId, customMessage || 'Trường này không được để trống');
                return false;
            }

            // Skip if not required and empty
            if (!value && !field.hasAttribute('required')) {
                this.clearError(fieldId);
                return true;
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

    // ============================================================
    // FORM UTILITIES
    // ============================================================
    const Form = {
        getData(form) {
            const formData = new FormData(form);
            const data = {};
            for (const [key, value] of formData.entries()) {
                data[key] = value;
            }
            return data;
        },

        setData(form, data) {
            if (!form || !data) return;

            Object.keys(data).forEach(key => {
                const input = form.elements[key];
                if (input) {
                    if (input.type === 'checkbox') {
                        input.checked = !!data[key];
                    } else if (input.type === 'radio') {
                        const radio = form.querySelector(`input[name="${key}"][value="${data[key]}"]`);
                        if (radio) radio.checked = true;
                    } else {
                        input.value = data[key] || '';
                    }
                }
            });
        },

        reset(form) {
            if (!form) return;
            form.reset();
            this.clearErrors(form);
        },

        showErrors(form, errors) {
            this.clearErrors(form);

            Object.entries(errors).forEach(([field, message]) => {
                const input = form.elements[field];
                if (input) {
                    input.classList.add('border-red-500');
                    const errorDiv = document.createElement('div');
                    errorDiv.className = 'form-error text-red-600 text-sm mt-1';
                    errorDiv.textContent = Array.isArray(message) ? message[0] : message;
                    input.parentElement.appendChild(errorDiv);
                }
            });
        },

        clearErrors(form) {
            if (!form) return;
            form.querySelectorAll('.form-error').forEach(el => el.remove());
            form.querySelectorAll('.border-red-500').forEach(el => {
                el.classList.remove('border-red-500');
            });
        }
    };

    // ============================================================
    // EVENT MANAGER - Shared utility for memory leak prevention
    // ============================================================
    const EventManager = {
        create() {
            const listeners = [];

            return {
                add(element, event, handler) {
                    if (!element) return;
                    element.addEventListener(event, handler);
                    listeners.push({ element, event, handler });
                },

                addMultiple(elements, event, handler) {
                    elements.forEach(element => {
                        this.add(element, event, handler);
                    });
                },

                removeAll() {
                    listeners.forEach(({ element, event, handler }) => {
                        element.removeEventListener(event, handler);
                    });
                    listeners.length = 0;
                },

                getCount() {
                    return listeners.length;
                }
            };
        }
    };

    // ============================================================
    // UI UTILITIES - Shared empty state
    // ============================================================
    const UI = {
        renderEmptyState(tbody, options = {}) {
            const {
                message = 'Không tìm thấy dữ liệu',
                colspan = 5,
                icon = 'default'
            } = options;

            const icons = {
                default: `<svg class="w-12 h-12 text-slate-300 mb-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                </svg>`,
                search: `<svg class="w-12 h-12 text-slate-300 mb-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>`
            };

            tbody.innerHTML = `
                <tr class="empty-row">
                    <td colspan="${colspan}" class="px-6 py-12 text-center text-sm text-slate-500">
                        <div class="flex flex-col items-center">
                            ${icons[icon] || icons.default}
                            <p class="font-medium">${message}</p>
                        </div>
                    </td>
                </tr>
            `;
        }
    };


    // ============================================================
    // DATE UTILITIES
    // ============================================================
    const DateUtils = {
        /**
         * Format date to Vietnamese format
         * @param {string|Date} date - Date object or ISO string
         * @param {string} format - Format pattern (dd/MM/yyyy, dd-MM-yyyy, etc.)
         * @returns {string} Formatted date string
         */
        format(date, format = 'dd/MM/yyyy') {
            if (!date) return '';
            
            const d = typeof date === 'string' ? new Date(date) : date;
            
            // Check if valid date
            if (isNaN(d.getTime())) return '';
            
            const day = String(d.getDate()).padStart(2, '0');
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const year = d.getFullYear();
            const hours = String(d.getHours()).padStart(2, '0');
            const minutes = String(d.getMinutes()).padStart(2, '0');
            const seconds = String(d.getSeconds()).padStart(2, '0');
            
            return format
                .replace('dd', day)
                .replace('MM', month)
                .replace('yyyy', year)
                .replace('HH', hours)
                .replace('mm', minutes)
                .replace('ss', seconds);
        },

        /**
         * Format for input[type="date"] (YYYY-MM-DD)
         * @param {string|Date} date - Date object or ISO string
         * @returns {string} Date string in YYYY-MM-DD format
         */
        toInputValue(date) {
            if (!date) return '';
            
            const d = typeof date === 'string' ? new Date(date) : date;
            
            if (isNaN(d.getTime())) return '';
            
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            
            return `${year}-${month}-${day}`;
        },

        /**
         * Parse Vietnamese date string to Date object
         * @param {string} dateStr - Date string in dd/MM/yyyy format
         * @returns {Date|null} Date object or null if invalid
         */
        parseVietnamese(dateStr) {
            if (!dateStr) return null;
            
            const parts = dateStr.split('/');
            if (parts.length !== 3) return null;
            
            const day = parseInt(parts[0], 10);
            const month = parseInt(parts[1], 10) - 1;
            const year = parseInt(parts[2], 10);
            
            const date = new Date(year, month, day);
            
            return isNaN(date.getTime()) ? null : date;
        },

        /**
         * Get relative time string (e.g., "2 giờ trước", "3 ngày trước")
         * @param {string|Date} date - Date object or ISO string
         * @returns {string} Relative time string
         */
        getRelativeTime(date) {
            if (!date) return '';
            
            const d = typeof date === 'string' ? new Date(date) : date;
            if (isNaN(d.getTime())) return '';
            
            const now = new Date();
            const diffMs = now - d;
            const diffSec = Math.floor(diffMs / 1000);
            const diffMin = Math.floor(diffSec / 60);
            const diffHour = Math.floor(diffMin / 60);
            const diffDay = Math.floor(diffHour / 24);
            const diffMonth = Math.floor(diffDay / 30);
            const diffYear = Math.floor(diffDay / 365);
            
            if (diffSec < 60) return 'Vừa xong';
            if (diffMin < 60) return `${diffMin} phút trước`;
            if (diffHour < 24) return `${diffHour} giờ trước`;
            if (diffDay < 30) return `${diffDay} ngày trước`;
            if (diffMonth < 12) return `${diffMonth} tháng trước`;
            return `${diffYear} năm trước`;
        }
    };

    // ============================================================
    // HELPER UTILITIES
    // ============================================================
    const Helper = {
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

        removeAccents(str) {
            if (!str) return '';
            return str.normalize('NFD')
                     .replace(/[\u0300-\u036f]/g, '')
                     .replace(/đ/g, 'd')
                     .replace(/Đ/g, 'D');
        },

        // 🔧 FIX: generateCode có thể mất ký tự đặc biệt - chấp nhận cho nghiệp vụ
        generateCode(name) {
            if (!name) return '';
            let normalized = this.removeAccents(name);
            normalized = normalized.replace(/\s+/g, '_');
            normalized = normalized.replace(/[^a-zA-Z0-9_]/g, '');
            return normalized.toUpperCase();
        }
    };
    // ============================================================
    // DELETE OPERATIONS - Tái sử dụng cho mọi loại CRUD
    // ============================================================
    const DeleteOperations = {
        /**
         * Xóa đơn lẻ với confirm modal
         * @param {Object} options
         * @param {string|number} options.id - ID item cần xóa
         * @param {string} options.name - Tên hiển thị trong modal
         * @param {Function|string} options.url - URL hoặc function(id) trả về URL
         * @param {Function} options.onSuccess - Callback khi xóa thành công
         * @param {string} [options.method='POST'] - HTTP method
         * @param {string} [options.title] - Tiêu đề modal
         * @param {string} [options.message] - Nội dung modal
         */
        confirmDelete(options) {
            const {
                id,
                name,
                url,
                onSuccess,
                method = 'POST',
                title = 'Xác nhận xóa',
                message = null
            } = options;

            const displayMessage = message || `Bạn có chắc chắn muốn xóa "${name}"?`;
            const finalUrl = typeof url === 'function' ? url(id) : url;

            Modal.showConfirm({
                title,
                message: displayMessage,
                type: 'danger',
                confirmText: 'Xóa',
                onConfirm: async () => {
                    try {
                        let result;
                        if (method === 'DELETE') {
                            result = await API.delete(finalUrl);
                        } else {
                            result = await API.post(finalUrl);
                        }

                        if (result.success === false) {
                            throw new Error(result.message || 'Xóa thất bại');
                        }

                        Notify.success(result.message || 'Xóa thành công! ');
                        if (onSuccess) onSuccess(result);

                    } catch (err) {
                        console.error('⛔ Delete error:', err);
                        Notify.error(err.message || 'Có lỗi xảy ra khi xóa');
                    }
                }
            });
        },

        /**
         * Xóa nhiều items với confirm modal
         * @param {Object} options
         * @param {Array} options.ids - Mảng ID cần xóa
         * @param {Function|string} options.url - URL cho từng item hoặc function(id)
         * @param {string} [options.bulkUrl] - URL xóa nhiều (ưu tiên nếu có)
         * @param {Function} options.onSuccess - Callback khi xóa thành công
         * @param {string} [options. method='POST'] - HTTP method
         */
        confirmBulkDelete(options) {
            const {
                ids,
                url,
                bulkUrl = null,
                onSuccess,
                method = 'POST'
            } = options;

            const count = ids.length;

            if (count === 0) {
                Notify.warning('Vui lòng chọn ít nhất một mục để xóa');
                return;
            }

            Modal.showConfirm({
                title: 'Xóa nhiều',
                message: `Bạn có chắc chắn muốn xóa ${count} mục đã chọn?`,
                type: 'danger',
                confirmText: `Xóa ${count} mục`,
                onConfirm: async () => {
                    try {
                        if (bulkUrl) {
                            // Ưu tiên API bulk delete
                            const result = await API.post(bulkUrl, { ids });
                            if (result.success === false) {
                                throw new Error(result.message);
                            }
                        } else {
                            // Fallback: Xóa từng cái song song
                            const promises = ids.map(id => {
                                const finalUrl = typeof url === 'function' ?  url(id) : url;
                                return method === 'DELETE'
                                    ? API.delete(finalUrl)
                                    : API.post(finalUrl);
                            });

                            const results = await Promise. all(promises);
                            const errors = results.filter(r => r.success === false);

                            if (errors.length > 0) {
                                Notify.warning(
                                    `Đã xóa ${count - errors.length}/${count} mục.  Có ${errors.length} mục không thể xóa.`
                                );
                                if (onSuccess) onSuccess();
                                return;
                            }
                        }

                        Notify.success(`Đã xóa thành công ${count} mục! `);
                        if (onSuccess) onSuccess();

                    } catch (err) {
                        console.error('⛔ Bulk delete error:', err);
                        Notify. error(err.message || 'Có lỗi xảy ra khi xóa');
                    }
                }
            });
        }
    };
    // ============================================================
    // PUBLIC API
    // ============================================================
    return {
        init,
        getCsrfToken,
        API,
        Notify,
        Modal,
        Sidebar,
        Validation,
        Form,
        EventManager,
        UI,
        Helper,
        DateUtils,
        DeleteOperations,
        get config() { return { ...config }; },
        get csrfToken() { return csrfToken; }
    };
    
})();

// ============================================================
// AUTO INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    AppUtils.init();
});

// ============================================================
// GLOBAL EXPORTS
// ============================================================
window.AppUtils = AppUtils;

// Backward compatibility
window.CommonUtils = AppUtils;
window.NotificationUtils = AppUtils.Notify;
window.ValidationUtils = AppUtils.Validation;
window.SidebarUtils = AppUtils.Sidebar;
window.ModalUtils = AppUtils.Modal;
window.HelperUtils = AppUtils.Helper;
window.APIUtils = AppUtils.API;
window.Toast = AppUtils.Notify;
window.DateUtils = AppUtils.DateUtils;