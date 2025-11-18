// ============ COMMON UTILITIES ============
// File: static/js/common-utils.js

/**
 * Common utilities for all modules
 */
window.CommonUtils = (() => {
    // ============ CONFIGURATION ============
    const DEFAULT_CONFIG = {
        TOAST_DURATION: 3000,
        SEARCH_DEBOUNCE: 400,
        API_TIMEOUT: 30000
    };

    let config = { ...DEFAULT_CONFIG };
    let csrfToken = '';

    // ============ INITIALIZATION ============
    function init(options = {}) {
        config = { ...DEFAULT_CONFIG, ...options };
        csrfToken = document.getElementById('csrf-token')?.value || 
                   document.querySelector('[name=csrfmiddlewaretoken]')?.value || '';
        return { config, csrfToken };
    }

    // ============ API HANDLER ============
    const API = {
        /**
         * Generic fetch wrapper with error handling
         * @param {string} url - API endpoint
         * @param {Object} options - Fetch options
         * @returns {Promise<any>}
         */
        async fetch(url, options = {}) {
            // Link external signal with timeout controller so both can abort fetch
            const externalSignal = options.signal;
            const timeoutController = new AbortController();
            const linkedController = new AbortController();

            let timedOut = false;
            const abortLinked = (reason) => {
                if (!linkedController.signal.aborted) linkedController.abort(reason);
            };

            // If external signal aborts -> abort linked
            if (externalSignal) {
                if (externalSignal.aborted) abortLinked(externalSignal.reason);
                else externalSignal.addEventListener('abort', () => abortLinked(externalSignal.reason), { once: true });
            }

            // Timeout -> abort linked
            const timeoutId = setTimeout(() => {
                timedOut = true;
                timeoutController.abort();
                abortLinked(new DOMException('Request timeout', 'TimeoutError'));
            }, config.API_TIMEOUT);

            try {
                const fetchConfig = {
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRFToken': csrfToken,
                        ...options.headers
                    },
                    signal: linkedController.signal,
                    ...options
                };

                if (options.body && typeof options.body === 'object') {
                    fetchConfig.body = JSON.stringify(options.body);
                }

                const response = await fetch(url, fetchConfig);
                clearTimeout(timeoutId);

                // Handle 204 No Content
                if (response.status === 204) {
                    return { success: true };
                }

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data?.message || `HTTP Error ${response.status}`);
                }

                return data;
            } catch (error) {
                clearTimeout(timeoutId);
                // Normalize timeout error
                if (error.name === 'AbortError' && timedOut) {
                    throw new Error('Request timeout');
                }
                throw error;
            }
        },

        /**
         * GET request
         */
        async get(url, params = {}, options = {}) {
            const queryString = new URLSearchParams(params).toString();
            const fullUrl = queryString ? `${url}?${queryString}` : url;
            return this.fetch(fullUrl, { method: 'GET', ...options });
        },

        /**
         * POST request
         */
        async post(url, body = {}, options = {}) {
            return this.fetch(url, { method: 'POST', body, ...options });
        },

        /**
         * PUT request
         */
        async put(url, body = {}, options = {}) {
            return this.fetch(url, { method: 'PUT', body, ...options });
        },

        /**
         * DELETE request
         */
        async delete(url, body = null, options = {}) {
            const config = { method: 'DELETE', ...options };
            if (body) config.body = body;
            return this.fetch(url, config);
        }
    };

    // ============ TOAST NOTIFICATIONS ============
    const Toast = (() => {
        function show(message, type = 'success') {
            let toast = document.getElementById('toast-notification');
            
            if (!toast) {
                console.warn('Toast component not found. Make sure to include toast.html in your template.');
                // Fallback: tạo toast mới (giữ nguyên logic cũ)
                toast = document.createElement('div');
                toast.id = 'toast-notification';
                toast.className = 'fixed bottom-5 right-5 z-[9999] px-4 py-3 rounded-md shadow-lg transition-all duration-300 max-w-sm font-medium text-white hidden translate-y-2 opacity-0';
                document.body.appendChild(toast);
            }

            // Reset classes (giữ nguyên cấu trúc base)
            toast.className = 'fixed bottom-5 right-5 z-[9999] px-4 py-3 rounded-md shadow-lg transition-all duration-300 max-w-sm font-medium text-white';
            
            // Set color based on type
            if (type === 'success') {
                toast.classList.add('bg-green-600');
            } else if (type === 'error') {
                toast.classList.add('bg-red-600');
            } else if (type === 'warning') {
                toast.classList.add('bg-yellow-600');
            } else {
                toast.classList.add('bg-blue-600'); // info
            }

            toast.textContent = message;

            // Show toast
            toast.classList.remove('hidden');
            
            // Animate in
            requestAnimationFrame(() => {
                toast.classList.remove('translate-y-2', 'opacity-0');
                toast.classList.add('translate-y-0', 'opacity-100');
            });

            // Auto hide
            setTimeout(() => {
                toast.classList.add('translate-y-2', 'opacity-0');
                setTimeout(() => {
                    toast.classList.add('hidden');
                }, 300);
            }, config.TOAST_DURATION);
        }
        
        return { 
            success: (m) => show(m, 'success'), 
            error: (m) => show(m, 'error'),
            warning: (m) => show(m, 'warning'),
            info: (m) => show(m, 'info')
        };
    })();

    // ============ MODAL MANAGER ============
    const Modal = {
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
        },
        setupBackdropClose(modal) {
            if (!modal) return;
            modal.addEventListener('click', (e) => {
                if (e.target === modal) this.close(modal);
            });
        }
    };
    
    // ============ FORM UTILITIES ============
    const Form = {
        /**
         * Get form data as object
         * @param {HTMLFormElement} form
         * @returns {Object}
         */
        getData(form) {
            const formData = new FormData(form);
            const data = {};
            for (const [key, value] of formData.entries()) {
                data[key] = value;
            }
            return data;
        },

        /**
         * Set form data from object
         * @param {HTMLFormElement} form
         * @param {Object} data
         */
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

        /**
         * Reset form and clear validation
         * @param {HTMLFormElement} form
         */
        reset(form) {
            if (!form) return;
            form.reset();
            this.clearErrors(form);
        },

        /**
         * Show form errors
         * @param {HTMLFormElement} form
         * @param {Object} errors - {fieldName: errorMessage}
         */
        showErrors(form, errors) {
            this.clearErrors(form);
            
            Object.entries(errors).forEach(([field, message]) => {
                const input = form.elements[field];
                if (input) {
                    input.classList.add('border-red-500');
                    const errorDiv = document.createElement('div');
                    errorDiv.className = 'form-error';
                    errorDiv.textContent = Array.isArray(message) ? message[0] : message;
                    input.parentElement.appendChild(errorDiv);
                }
            });
        },

        /**
         * Clear form errors
         * @param {HTMLFormElement} form
         */
        clearErrors(form) {
            if (!form) return;
            form.querySelectorAll('.form-error').forEach(el => el.remove());
            form.querySelectorAll('.border-red-500').forEach(el => {
                el.classList.remove('border-red-500');
            });
        }
    };

    // ============ LOADING STATE MANAGER ============
    const Loading = {
        /**
         * Execute function with loading state
         * @param {HTMLElement} button - Button element
         * @param {Function} action - Async function to execute
         * @param {string} loadingText - Text to show while loading
         */
        async execute(button, action, loadingText = 'Đang xử lý...') {
            if (!button) return;
            
            const originalText = button.textContent;
            const originalDisabled = button.disabled;
            
            button.disabled = true;
            button.textContent = loadingText;
            
            try {
                await action();
            } catch (error) {
                Toast.error(error.message || 'Đã xảy ra lỗi');
                throw error;
            } finally {
                button.disabled = originalDisabled;
                button.textContent = originalText;
            }
        },

        /**
         * Show loading spinner in container
         * @param {HTMLElement} container
         * @param {string} message
         */
        show(container, message = 'Đang tải...') {
            if (!container) return;
            container.innerHTML = `
                <div class="loading-overlay">
                    <div class="text-center">
                        <div class="spinner"></div>
                        <p class="loading-text">${message}</p>
                    </div>
                </div>
            `;
        }
    };

    // ============ STRING UTILITIES ============
    const StringUtils = {
        /**
         * Remove Vietnamese accents
         * @param {string} str
         * @returns {string}
         */
        removeAccents(str) {
            if (!str) return '';
            return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
        },

        /**
         * Generate code from name (uppercase, no spaces)
         * @param {string} name
         * @returns {string}
         */
        generatePositionCode(name) {
            if (!name) return '';
            // Dùng this.removeAccents để gọi hàm trong cùng object
            let normalized = this.removeAccents(name);
            // Chuyển khoảng trắng thành gạch dưới
            normalized = normalized.replace(/\s+/g, '_');
            // Loại bỏ ký tự đặc biệt
            normalized = normalized.replace(/[^a-zA-Z0-9_]/g, '');
            return normalized.toUpperCase();
        },

        /**
         * Truncate string
         * @param {string} str
         * @param {number} length
         * @returns {string}
         */
        truncate(str, length = 50) {
            if (!str || str.length <= length) return str;
            return str.substring(0, length) + '...';
        },

        /**
         * Capitalize first letter
         * @param {string} str
         * @returns {string}
         */
        capitalize(str) {
            if (!str) return '';
            return str.charAt(0).toUpperCase() + str.slice(1);
        }
    };

    // ============ DATE UTILITIES ============
    const DateUtils = {
        /**
         * Format date to Vietnamese format
         * @param {string|Date} date
         * @returns {string}
         */
        format(date, format = 'dd/MM/yyyy') {
            if (!date) return '';
            const d = new window.Date(date);
            if (isNaN(d.getTime())) return '';
            
            const day = String(d.getDate()).padStart(2, '0');
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const year = d.getFullYear();
            
            return format.replace('dd', day)
                        .replace('MM', month)
                        .replace('yyyy', year);
        },

        /**
         * Format date for input[type="date"]
         * @param {string|Date} date
         * @returns {string}
         */
        toInputValue(date) {
            if (!date) return '';
            const d = new window.Date(date);
            if (isNaN(d.getTime())) return '';
            return d.toISOString().split('T')[0];
        }
    };

    // ============ DEBOUNCE UTILITY ============
    function debounce(func, wait = 300) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // ============ ARRAY UTILITIES ============
    const ArrayUtils = {
        /**
         * Group array by key
         * @param {Array} arr
         * @param {string} key
         * @returns {Object}
         */
        groupBy(arr, key) {
            return arr.reduce((result, item) => {
                const group = item[key];
                result[group] = result[group] || [];
                result[group].push(item);
                return result;
            }, {});
        },

        /**
         * Remove duplicates
         * @param {Array} arr
         * @param {string} key - Optional key for objects
         * @returns {Array}
         */
        unique(arr, key = null) {
            if (!key) return [...new Set(arr)];
            const seen = new Set();
            return arr.filter(item => {
                const value = item[key];
                if (seen.has(value)) return false;
                seen.add(value);
                return true;
            });
        }
    };

    // ============ VALIDATION UTILITIES ============
    const Validator = {
        /**
         * Validate email
         * @param {string} email
         * @returns {boolean}
         */
        email(email) {
            const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            return re.test(email);
        },

        /**
         * Validate phone number (Vietnamese)
         * @param {string} phone
         * @returns {boolean}
         */
        phone(phone) {
            const re = /^(0|\+84)[0-9]{9,10}$/;
            return re.test(phone.replace(/\s/g, ''));
        },

        /**
         * Check if value is empty
         * @param {any} value
         * @returns {boolean}
         */
        required(value) {
            if (value === null || value === undefined) return false;
            if (typeof value === 'string') return value.trim().length > 0;
            if (window.Array.isArray(value)) return value.length > 0;
            return true;
        }
    };

    // ============ PUBLIC API ============
    return {
        init,
        API,
        Toast,
        Modal,
        Form,
        Loading,
        StringUtils,
        DateUtils,
        ArrayUtils,
        Validator,
        debounce,
        get config() { return config; },
        get csrfToken() { return csrfToken; }
    };
})();

// Auto-initialize on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
    window.CommonUtils.init();
});