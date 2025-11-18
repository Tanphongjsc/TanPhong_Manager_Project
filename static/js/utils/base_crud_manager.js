/**
 * Base CRUD Manager for Create/Edit operations
 * @class BaseCRUDManager
 */
class BaseCRUDManager {
    /**
     * @param {Object} config - Configuration object
     * @param {string} config.sidebarId - Sidebar element ID
     * @param {string} config.overlayId - Overlay element ID
     * @param {string} config.formId - Form element ID
     * @param {string} config.tbodySelector - Table body selector
     * @param {string} config.codeField - Code field ID
     * @param {string} config.nameField - Name field ID
     * @param {Object} config.apiUrls - API endpoints
     * @param {Function} config.createRowHTML - Row HTML generator
     * @param {Function} config.fillFormData - Form data filler
     * @param {Function} config.getFormData - Form data getter
     * @param {Array} config.additionalValidations - Additional validation rules
     * @param {Object} config.texts - UI text configuration
     */
    constructor(config) {
        // Validate required dependencies
        if (typeof AppUtils === 'undefined') {
            throw new Error('AppUtils is required. Please load optimized_utils.js first.');
        }

        this.config = {
            sidebarId: config.sidebarId,
            overlayId: config.overlayId,
            formId: config.formId,
            tbodySelector: config.tbodySelector || 'tbody',
            codeField: config.codeField,
            nameField: config.nameField,
            apiUrls: config.apiUrls,
            tableColumns: config.tableColumns || 4,
            
            // Callbacks
            onAfterInit: config.onAfterInit || (() => {}),
            onBeforeSubmit: config.onBeforeSubmit || (() => true),
            onAfterSubmit: config.onAfterSubmit || (() => {}),
            createRowHTML: config.createRowHTML,
            fillFormData: config.fillFormData,
            getFormData: config.getFormData,
            
            // Validation
            additionalValidations: config.additionalValidations || [],
            
            // Text configuration
            texts: {
                entityName: config.entityName || 'mục',
                createTitle: config.createTitle || 'Thêm mới',
                editTitle: config.editTitle || 'Chỉnh sửa',
                deleteTitle: config.deleteTitle || 'Xóa',
                deleteMessage: config.deleteMessage || ((name) => `Bạn có muốn xóa '${name}'?`),
                ...config.texts
            }
        };

        // State management
        this.state = {
            currentMode: 'create',
            currentItemId: null,
            isSubmitting: false
        };

        // Elements cache
        this.elements = {};

        // Event listeners for cleanup
        this.eventListeners = [];

        // Sidebar instance
        this.sidebar = null;
    }

    /**
     * Initialize the CRUD manager
     */
    init() {
        this.cacheElements();
        this.initSidebar();
        this.initEventListeners();
        this.initSearchFilter();
        this.initStatusFilter();
        this.initValidation();
        this.config.onAfterInit();
    }

    /**
     * Cache DOM elements for performance
     */
    cacheElements() {
        this.elements = {
            tbody: document.querySelector(this.config.tbodySelector),
            form: document.getElementById(this.config.formId),
            submitBtn: document.querySelector('[data-sidebar-submit]'),
            searchInput: document.getElementById('search-input'),
            statusFilter: document.getElementById('status-filter'),
        };

        // Validate required elements
        if (!this.elements.form) {
            console.error(`⛔ Form with id "${this.config.formId}" not found`);
        }
        if (!this.elements.tbody) {
            console.error(`⛔ Table body with selector "${this.config.tbodySelector}" not found`);
        }
    }

    /**
     * Initialize sidebar component
     */
    initSidebar() {
        this.sidebar = AppUtils.Sidebar.init(this.config.sidebarId, this.config.overlayId, {
            codeFieldId: this.config.codeField,
            onClose: () => {
                this.state.currentMode = 'create';
                this.state.currentItemId = null;
                this.state.isSubmitting = false;
                AppUtils.Validation.clearError(this.config.codeField);
                this.enableAllInputs();
            }
        });

        if (!this.sidebar) {
            AppUtils.Notify.error('Không thể khởi tạo sidebar');
            return;
        }

        // Setup close buttons
        this.addEventListeners(
            document.querySelectorAll('[data-sidebar-close], [data-sidebar-cancel]'),
            'click',
            () => this.sidebar.close()
        );

        // Setup overlay click
        const overlay = document.getElementById(this.config.overlayId);
        if (overlay) {
            this.addEventListener(overlay, 'click', () => this.sidebar.close());
        }

        // Setup submit button
        if (this.elements.submitBtn) {
            this.addEventListener(this.elements.submitBtn, 'click', (e) => {
                e.preventDefault();
                this.handleSubmitClick();
            });
        }
    }

    /**
     * Handle submit button click
     */
    handleSubmitClick() {
        this.submitForm();
    }

    /**
     * Initialize table event listeners
     */
    initEventListeners() {
        const { tbody } = this.elements;
        if (!tbody) return;

        // Table row actions (using event delegation)
        this.addEventListener(tbody, 'click', (e) => {
            const target = e.target.closest('button, a');
            if (!target) return;

            const itemId = target.dataset.id;
            if (!itemId) return;

            e.preventDefault();

            // All view/edit actions open EDIT mode
            if (target.classList.contains('view-link') ||
                target.classList.contains('view-btn') ||
                target.classList.contains('edit-btn')) {
                this.openSidebar('edit', itemId);
            } else if (target.classList.contains('delete-btn')) {
                this.deleteItem(itemId);
            }
        });

        // Status toggle
        this.addEventListener(tbody, 'change', (e) => {
            if (e.target.classList.contains('status-toggle')) {
                this.handleStatusToggle(e.target);
            }
        });
    }

    /**
     * Initialize validation
     */
    initValidation() {
        // Main code field validation
        const codeField = document.getElementById(this.config.codeField);
        if (codeField) {
            this.addEventListener(codeField, 'input', () => {
                AppUtils.Validation.validate(this.config.codeField, 'code');
            });
        }

        // Additional validations
        this.config.additionalValidations.forEach(validation => {
            const field = document.getElementById(validation.fieldId);
            if (field) {
                this.addEventListener(field, 'input', () => {
                    AppUtils.Validation.validate(
                        validation.fieldId,
                        validation.type,
                        validation.message
                    );
                });
            }
        });
    }

    /**
     * Open sidebar in create or edit mode
     * @param {string} mode - 'create' or 'edit'
     * @param {string|null} itemId - Item ID for edit mode
     */
    openSidebar(mode, itemId = null) {
        this.state.currentMode = mode;
        this.state.currentItemId = itemId;

        // Clear validation errors
        AppUtils.Validation.clearError(this.config.codeField);

        // Reset form
        const form = document.getElementById(this.config.formId);
        if (form) form.reset();

        // Mode configurations
        const configs = {
            create: {
                title: this.config.texts.createTitle,
                btnText: 'Thêm',
                btnColor: 'bg-green-600 hover:bg-green-700',
                loadData: false
            },
            edit: {
                title: this.config.texts.editTitle,
                btnText: 'Lưu',
                btnColor: 'bg-green-600 hover:bg-green-700',
                loadData: true
            }
        };

        const config = configs[mode] || configs.create;

        // Update sidebar UI
        this.sidebar.setTitle(config.title);

        if (this.elements.submitBtn) {
            this.elements.submitBtn.textContent = config.btnText;
            this.elements.submitBtn.className = `px-6 py-2 ${config.btnColor} text-white rounded-lg transition-colors`;
        }

        // Enable all inputs
        this.enableAllInputs();

        // Set sidebar mode
        this.sidebar.setMode(mode);

        // Load data for edit mode
        if (config.loadData && itemId) {
            this.loadItemData(itemId);
        }

        // Open sidebar
        this.sidebar.open();
    }

    /**
     * Load item data for edit mode
     * @param {string} itemId - Item ID
     */
    async loadItemData(itemId) {
        try {
            const result = await AppUtils.API.get(this.config.apiUrls.detail(itemId));
            const data = result.data || result;

            // Enable all inputs first
            this.enableAllInputs();

            // Fill form data
            if (this.config.fillFormData) {
                this.config.fillFormData(data);
            } else {
                this.defaultFillFormData(data);
            }

            // Wait for DOM update
            await new Promise(resolve => setTimeout(resolve, 10));

            // Disable code field in edit mode
            this.sidebar.disableField(this.config.codeField, true);

        } catch (error) {
            console.error('⛔ Error loading data:', error);
            AppUtils.Notify.error(error.message || 'Có lỗi xảy ra khi tải dữ liệu');
        }
    }

    /**
     * Enable all form inputs
     */
    enableAllInputs() {
        const inputs = this.elements.form.querySelectorAll('input, textarea, select');
        inputs.forEach(input => {
            input.disabled = false;
            input.classList.remove('bg-slate-100', 'cursor-not-allowed');
            input.style.opacity = '1';
        });
    }

    /**
     * Default form data filler
     * @param {Object} data - Data to fill
     */
    defaultFillFormData(data) {
        Object.entries(data).forEach(([key, value]) => {
            const field = document.getElementById(key);
            if (field) {
                field.value = value || '';
            }
        });
    }

    /**
     * Submit form (create or update)
     */
    async submitForm() {
        // Prevent double submission
        if (this.state.isSubmitting) return;

        // Validate code field
        if (!AppUtils.Validation.validate(this.config.codeField, 'code')) {
            AppUtils.Notify.warning(`Vui lòng kiểm tra lại ${this.config.codeField}`);
            return;
        }

        // Custom validation
        if (!this.config.onBeforeSubmit()) return;

        // Check form validity
        const { form, submitBtn } = this.elements;
        if (!form?.checkValidity()) {
            form?.reportValidity();
            return;
        }

        // Set submitting state
        this.state.isSubmitting = true;
        const originalText = submitBtn?.textContent;

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Đang xử lý...';
        }

        try {
            // Get form data
            const formData = this.config.getFormData
                ? this.config.getFormData(form)
                : new FormData(form);

            // Determine API endpoint
            const url = this.state.currentMode === 'edit' && this.state.currentItemId
                ? this.config.apiUrls.update(this.state.currentItemId)
                : this.config.apiUrls.create;

            // Submit to API
            const data = await AppUtils.API.post(url, formData);

            // Check for explicit failure
            if (data.success === false) {
                throw new Error(data.message);
            }

            // Show success message
            AppUtils.Notify.success(data.message || 'Thành công!');

            // Update UI
            if (this.state.currentMode === 'edit' && this.state.currentItemId) {
                this.updateRowFromForm(this.state.currentItemId, formData);
            } else if (data.id) {
                this.appendNewRow(data, formData);
            }

            // Post-submit callback
            this.config.onAfterSubmit(data);

            // Close sidebar
            this.sidebar.close();

        } catch (error) {
            console.error('⛔ Submit error:', error);
            AppUtils.Notify.error(error.message || 'Có lỗi xảy ra');

        } finally {
            // Reset submitting state
            this.state.isSubmitting = false;
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = originalText;
            }
        }
    }

    /**
     * Delete item with confirmation
     * @param {string} itemId - Item ID
     */
    deleteItem(itemId) {
        const link = this.elements.tbody?.querySelector(`.view-link[data-id="${itemId}"]`);
        const itemName = link ? link.textContent.trim() : '';

        AppUtils.Modal.showConfirm({
            title: this.config.texts.deleteTitle,
            message: this.config.texts.deleteMessage(itemName),
            type: 'danger',
            confirmText: 'Xóa',
            onConfirm: async () => {
                try {
                    const data = await AppUtils.API.post(this.config.apiUrls.delete(itemId));

                    if (data.success === false) {
                        throw new Error(data.message);
                    }

                    this.removeRowFromTable(itemId);
                    AppUtils.Notify.success(data.message || 'Xóa thành công!');

                } catch (error) {
                    console.error('⛔ Delete error:', error);
                    AppUtils.Notify.error(error.message || 'Có lỗi xảy ra');
                }
            }
        });
    }

    /**
     * Handle status toggle
     * @param {HTMLElement} toggle - Toggle element
     */
    async handleStatusToggle(toggle) {
        const itemId = toggle.dataset.id;
        const isActive = toggle.checked;

        try {
            const data = await AppUtils.API.post(
                this.config.apiUrls.toggleStatus(itemId),
                { is_active: isActive }
            );

            if (data.success === false) {
                throw new Error(data.message);
            }

            AppUtils.Notify.success('Cập nhật trạng thái thành công!');

        } catch (error) {
            console.error('⛔ Toggle status error:', error);
            toggle.checked = !isActive; // Revert
            AppUtils.Notify.error(error.message || 'Có lỗi xảy ra');
        }
    }

    /**
     * Initialize search filter
     */
    initSearchFilter() {
        if (!this.elements.searchInput) return;

        const debouncedSearch = AppUtils.Helper.debounce((value) => {
            const rows = this.elements.tbody.querySelectorAll('tr:not(.empty-row)');
            const searchTerm = value.toLowerCase();

            rows.forEach(row => {
                const matches = row.textContent.toLowerCase().includes(searchTerm);
                row.style.display = matches ? '' : 'none';
            });
        }, 300);

        this.addEventListener(this.elements.searchInput, 'input', (e) => {
            debouncedSearch(e.target.value);
        });
    }

    /**
     * Initialize status filter
     */
    initStatusFilter() {
        if (!this.elements.statusFilter) return;

        this.addEventListener(this.elements.statusFilter, 'change', (e) => {
            const filterValue = e.target.value;
            const rows = this.elements.tbody.querySelectorAll('tr:not(.empty-row)');

            rows.forEach(row => {
                if (!filterValue) {
                    row.style.display = '';
                    return;
                }

                const toggle = row.querySelector('.status-toggle');
                if (!toggle) return;

                const matches = (filterValue === 'active' && toggle.checked) ||
                               (filterValue === 'inactive' && !toggle.checked);
                row.style.display = matches ? '' : 'none';
            });
        });
    }

    /**
     * Update row after form submission
     * @param {string} itemId - Item ID
     * @param {FormData} formData - Form data
     */
    updateRowFromForm(itemId, formData) {
        const link = this.elements.tbody?.querySelector(`.view-link[data-id="${itemId}"]`);
        if (!link) return;

        const row = link.closest('tr');
        const cells = row.querySelectorAll('td');

        // Update name
        link.textContent = formData.get(this.config.nameField) || '';

        // Update code (if exists)
        if (cells[1]) {
            cells[1].textContent = formData.get(this.config.codeField) || '';
        }
    }

    /**
     * Append new row to table
     * @param {Object} data - Response data
     * @param {FormData} formData - Form data
     */
    appendNewRow(data, formData) {
        const { tbody } = this.elements;
        if (!tbody) return;

        // Remove empty state
        const emptyRow = tbody.querySelector('.empty-row');
        if (emptyRow) emptyRow.remove();

        // Generate row HTML
        const rowHTML = this.config.createRowHTML
            ? this.config.createRowHTML(data, formData)
            : this.defaultCreateRowHTML(data, formData);

        // Insert new row
        tbody.insertAdjacentHTML('afterbegin', `<tr class="hover:bg-slate-50">${rowHTML}</tr>`);
    }

    /**
     * Default row HTML generator (override in config)
     * @param {Object} data - Response data
     * @param {FormData} formData - Form data
     * @returns {string} Row HTML
     */
    defaultCreateRowHTML(data, formData) {
        return `<td colspan="${this.config.tableColumns}">Override createRowHTML in config</td>`;
    }

    /**
     * Remove row from table with animation
     * @param {string} itemId - Item ID
     */
    removeRowFromTable(itemId) {
        const link = this.elements.tbody?.querySelector(`.view-link[data-id="${itemId}"]`);
        if (!link) return;

        const row = link.closest('tr');
        if (!row) return;

        // Fade out animation
        row.style.cssText = 'transition: opacity 300ms ease-out; opacity: 0';
        setTimeout(() => {
            row.remove();
            this.checkEmptyTable();
        }, 300);
    }

    /**
     * Check if table is empty and show empty state
     */
    checkEmptyTable() {
        const { tbody } = this.elements;
        if (!tbody || tbody.querySelectorAll('tr:not(.empty-row)').length > 0) return;

        tbody.innerHTML = `
            <tr class="empty-row">
                <td colspan="${this.config.tableColumns}" class="px-6 py-12 text-center text-sm text-slate-500">
                    <div class="flex flex-col items-center">
                        <svg class="w-12 h-12 text-slate-300 mb-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                        </svg>
                        <p>Chưa có dữ liệu</p>
                    </div>
                </td>
            </tr>
        `;
    }

    /**
     * Add event listener with tracking for cleanup
     * @param {HTMLElement} element - Target element
     * @param {string} event - Event name
     * @param {Function} handler - Event handler
     */
    addEventListener(element, event, handler) {
        if (!element) return;
        element.addEventListener(event, handler);
        this.eventListeners.push({ element, event, handler });
    }

    /**
     * Add event listeners to multiple elements
     * @param {NodeList|Array} elements - Target elements
     * @param {string} event - Event name
     * @param {Function} handler - Event handler
     */
    addEventListeners(elements, event, handler) {
        elements.forEach(element => {
            this.addEventListener(element, event, handler);
        });
    }

    /**
     * Cleanup - Remove all event listeners
     */
    destroy() {
        // Remove all tracked event listeners
        this.eventListeners.forEach(({ element, event, handler }) => {
            element.removeEventListener(event, handler);
        });
        this.eventListeners = [];

        // Clear state
        this.state = {
            currentMode: 'create',
            currentItemId: null,
            isSubmitting: false
        };

        console.log('✅ BaseCRUDManager destroyed and cleaned up');
    }
}

// Export to window
window.BaseCRUDManager = BaseCRUDManager;
