// ============================================================
// CONFIGURATION
// ============================================================
const AppUtils = (() => {
    const DEFAULT_CONFIG = {
        TOAST_DURATION: 3000,
        SEARCH_DEBOUNCE: 400,
        API_TIMEOUT: 30000
    };

    let config = { ...DEFAULT_CONFIG };
    let csrfToken = '';

    /**
     * Initialize utilities with custom config
     * @param {Object} options - Configuration options
     */
    function init(options = {}) {
        config = { ...DEFAULT_CONFIG, ...options };
        csrfToken = document.getElementById('csrf-token')?.value || 
                   document.querySelector('[name=csrfmiddlewaretoken]')?.value || '';
        return { config, csrfToken };
    }

    // ============================================================
    // API LAYER - Unified fetch wrapper
    // ============================================================
    const API = (() => {
        /**
         * Get CSRF token from multiple sources
         * @returns {string} CSRF token
         */
        function getCsrfToken() {
            return csrfToken || 
                   document.querySelector('[name=csrfmiddlewaretoken]')?.value || 
                   '';
        }

        /**
         * Generic fetch with timeout, CSRF, and proper error handling
         * @param {string} url - Request URL
         * @param {Object} options - Fetch options
         * @returns {Promise<Object>} Response data
         */
        async function fetchJSON(url, options = {}) {
            const externalSignal = options.signal;
            const timeoutController = new AbortController();
            const linkedController = new AbortController();
            let timedOut = false;

            // Link external signal with timeout
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

            // Setup timeout
            const timeoutId = setTimeout(() => {
                timedOut = true;
                timeoutController.abort();
                abortLinked(new DOMException('Request timeout', 'TimeoutError'));
            }, config.API_TIMEOUT);

            try {
                // Prepare headers
                const headers = {
                    'X-CSRFToken': getCsrfToken(),
                    ...options.headers
                };

                // Prepare body
                let body = options.body;
                if (body && !(body instanceof FormData) && typeof body === 'object') {
                    headers['Content-Type'] = 'application/json';
                    body = JSON.stringify(body);
                }

                // Execute fetch
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
                
                if (rawText) {
                    try {
                        data = JSON.parse(rawText);
                    } catch (e) {
                        data = { raw: rawText };
                    }
                }

                // Handle HTTP errors
                if (!response.ok) {
                    const errorMessage = data?.message || 
                                       data?.error || 
                                       `HTTP ${response.status}: ${response.statusText}`;
                    throw new Error(errorMessage);
                }

                return data;

            } catch (error) {
                clearTimeout(timeoutId);
                
                // Handle timeout
                if (error.name === 'AbortError' && timedOut) {
                    throw new Error('Request timeout');
                }
                
                // Handle abort
                if (error.name === 'AbortError') {
                    throw error;
                }
                
                // Re-throw with context
                throw new Error(error.message || 'Network request failed');
            }
        }

        return {
            /**
             * GET request
             * @param {string} url - Request URL
             * @param {Object} params - Query parameters
             * @param {Object} options - Fetch options
             */
            get: (url, params = {}, options = {}) => {
                const queryString = new URLSearchParams(
                    Object.entries(params).filter(([_, v]) => v !== null && v !== undefined)
                ).toString();
                const fullUrl = queryString ? `${url}?${queryString}` : url;
                return fetchJSON(fullUrl, { ...options, method: 'GET' });
            },

            /**
             * POST request
             * @param {string} url - Request URL
             * @param {Object|FormData} body - Request body
             * @param {Object} options - Fetch options
             */
            post: (url, body = {}, options = {}) => {
                return fetchJSON(url, { ...options, method: 'POST', body });
            },

            /**
             * PUT request
             * @param {string} url - Request URL
             * @param {Object|FormData} body - Request body
             * @param {Object} options - Fetch options
             */
            put: (url, body = {}, options = {}) => {
                return fetchJSON(url, { ...options, method: 'PUT', body });
            },

            /**
             * DELETE request
             * @param {string} url - Request URL
             * @param {Object} body - Request body (optional)
             * @param {Object} options - Fetch options
             */
            delete: (url, body = null, options = {}) => {
                const cfg = { ...options, method: 'DELETE' };
                if (body !== null) cfg.body = body;
                return fetchJSON(url, cfg);
            },

            /**
             * Get current config
             */
            getConfig: () => ({ ...config }),

            /**
             * Set API config
             * @param {Object} opts - Config options
             */
            setConfig: (opts = {}) => {
                config = { ...config, ...opts };
            }
        };
    })();

    // ============================================================
    // NOTIFICATION SYSTEM - Toast notifications
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

        /**
         * Show notification toast
         * @param {string} message - Notification message
         * @param {string} type - Type: success, error, info, warning
         * @param {Object} options - Options: duration, closable, position
         */
        show(message, type = 'info', options = {}) {
            const {
                duration = config.TOAST_DURATION,
                closable = true,
                position = 'top-right'
            } = options;

            // Remove old notifications (keep only latest)
            document.querySelectorAll('.app-notification').forEach(n => n.remove());

            const cfg = this.configs[type] || this.configs.info;

            // Determine position classes
            const positions = {
                'top-right': 'top-4 right-4',
                'top-left': 'top-4 left-4',
                'bottom-right': 'bottom-4 right-4',
                'bottom-left': 'bottom-4 left-4'
            };

            const positionClass = positions[position] || positions['top-right'];
            const slideClass = position.includes('right') ? 'translate-x-full' : '-translate-x-full';

            // Create notification element
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

            // Animate in
            requestAnimationFrame(() => {
                notification.classList.remove('translate-x-full', '-translate-x-full');
                notification.classList.add('translate-x-0');
            });

            // Auto hide
            if (duration > 0) {
                setTimeout(() => {
                    notification.classList.add(slideClass);
                    notification.classList.remove('translate-x-0');
                    setTimeout(() => notification.remove(), 300);
                }, duration);
            }
        },

        /** Shortcut methods */
        success(message, options) { this.show(message, 'success', options); },
        error(message, options) { this.show(message, 'error', options); },
        info(message, options) { this.show(message, 'info', options); },
        warning(message, options) { this.show(message, 'warning', options); }
    };

    // ============================================================
    // MODAL MANAGER
    // ============================================================
    const Modal = {
        /**
         * Show confirmation modal
         * @param {Object} options - Modal options
         */
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

            // Animate in
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

        /**
         * Open modal with animation
         * @param {HTMLElement} modal - Modal element
         */
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

        /**
         * Close modal with animation
         * @param {HTMLElement} modal - Modal element
         */
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
        /**
         * Initialize sidebar
         * @param {string} sidebarId - Sidebar element ID
         * @param {string} overlayId - Overlay element ID
         * @param {Object} options - Options
         */
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

                /** Open sidebar */
                open() {
                    overlay.classList.remove('hidden');
                    requestAnimationFrame(() => {
                        overlay.style.opacity = '1';
                        sidebar.classList.remove('translate-x-full');
                    });
                    this.options.onOpen();
                },

                /** Close sidebar */
                close() {
                    sidebar.classList.add('translate-x-full');
                    overlay.style.opacity = '0';

                    setTimeout(() => {
                        overlay.classList.add('hidden');
                        this.options.onClose();
                    }, this.options.animationDuration);
                },

                /** Toggle sidebar */
                toggle() {
                    if (overlay.classList.contains('hidden')) {
                        this.open();
                    } else {
                        this.close();
                    }
                },

                /** Set sidebar title */
                setTitle(title) {
                    const titleElement = sidebar.querySelector('#sidebar-title, [data-sidebar-title]');
                    if (titleElement) {
                        titleElement.textContent = title;
                    }
                },

                /** Enable/Disable field */
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

                /** Set mode (create/edit) */
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
    // VALIDATION
    // ============================================================
    const Validation = {
        /** Validate code format (letters, numbers, -, _) */
        isValidCode(value) {
            return /^[A-Za-z0-9_-]+$/.test(value);
        },

        /** Validate email */
        isValidEmail(value) {
            return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
        },

        /** Validate Vietnamese phone */
        isValidPhone(value) {
            return /^(0|\+84)[0-9]{9,10}$/.test(value.replace(/\s/g, ''));
        },

        /** Check required field */
        required(value) {
            if (value === null || value === undefined) return false;
            if (typeof value === 'string') return value.trim().length > 0;
            if (Array.isArray(value)) return value.length > 0;
            return true;
        },

        /**
         * Show validation error
         * @param {string} fieldId - Field ID
         * @param {string} message - Error message
         */
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

        /**
         * Clear validation error
         * @param {string} fieldId - Field ID
         */
        clearError(fieldId) {
            const field = document.getElementById(fieldId);
            if (!field) return;

            field.classList.remove('border-red-500', 'focus:ring-red-500', 'focus:border-red-500');
            field.classList.add('border-slate-300', 'focus:ring-green-500', 'focus:border-green-500');

            const errorDiv = field.parentElement.querySelector('.validation-error');
            if (errorDiv) errorDiv.remove();
        },

        /**
         * Validate field by type
         * @param {string} fieldId - Field ID
         * @param {string} type - Type: code, email, phone
         * @param {string} customMessage - Custom error message
         * @returns {boolean} Is valid
         */
        validate(fieldId, type = 'code', customMessage = null) {
            const field = document.getElementById(fieldId);
            if (!field) return true;

            const value = field.value.trim();

            // Check required
            if (!value && field.hasAttribute('required')) {
                this.showError(fieldId, customMessage || 'Trường này không được để trống');
                return false;
            }

            // Skip validation if not required and empty
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
        /** Get form data as object */
        getData(form) {
            const formData = new FormData(form);
            const data = {};
            for (const [key, value] of formData.entries()) {
                data[key] = value;
            }
            return data;
        },

        /** Set form data */
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

        /** Reset form and clear errors */
        reset(form) {
            if (!form) return;
            form.reset();
            this.clearErrors(form);
        },

        /** Show validation errors */
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

        /** Clear all validation errors */
        clearErrors(form) {
            if (!form) return;
            form.querySelectorAll('.form-error').forEach(el => el.remove());
            form.querySelectorAll('.border-red-500').forEach(el => {
                el.classList.remove('border-red-500');
            });
        }
    };

    // ============================================================
    // HELPER UTILITIES
    // ============================================================
    const Helper = {
        /** Get CSRF token */
        getCsrfToken() {
            return csrfToken || 
                   document.querySelector('[name=csrfmiddlewaretoken]')?.value || 
                   '';
        },

        /**
         * Debounce function
         * @param {Function} func - Function to debounce
         * @param {number} wait - Wait time in ms
         * @returns {Function} Debounced function
         */
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

        /**
         * Throttle function
         * @param {Function} func - Function to throttle
         * @param {number} limit - Limit time in ms
         * @returns {Function} Throttled function
         */
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

        /** Format currency VND */
        formatCurrency(amount) {
            return new Intl.NumberFormat('vi-VN', {
                style: 'currency',
                currency: 'VND'
            }).format(amount);
        },

        /** Remove Vietnamese accents */
        removeAccents(str) {
            if (!str) return '';
            return str.normalize('NFD')
                     .replace(/[\u0300-\u036f]/g, '')
                     .replace(/đ/g, 'd')
                     .replace(/Đ/g, 'D');
        },

        /** Generate code from name */
        generateCode(name) {
            if (!name) return '';
            let normalized = this.removeAccents(name);
            normalized = normalized.replace(/\s+/g, '_');
            normalized = normalized.replace(/[^a-zA-Z0-9_]/g, '');
            return normalized.toUpperCase();
        }
    };

    // ============================================================
    // PUBLIC API
    // ============================================================
    return {
        init,
        API,
        Notify,
        Modal,
        Sidebar,
        Validation,
        Form,
        Helper,
        get config() { return { ...config }; },
        get csrfToken() { return csrfToken; }
    };
})();

// ============================================================
// AUTO INITIALIZATION
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    AppUtils.init();
});

// ============================================================
// GLOBAL EXPORTS - Unified naming
// ============================================================
window.AppUtils = AppUtils;

// Backward compatibility aliases
window.CommonUtils = AppUtils;
window.NotificationUtils = AppUtils.Notify;
window.ValidationUtils = AppUtils.Validation;
window.SidebarUtils = AppUtils.Sidebar;
window.ModalUtils = AppUtils.Modal;
window.HelperUtils = AppUtils.Helper;
window.APIUtils = AppUtils.API;

// Toast alias
window.Toast = AppUtils.Notify;
