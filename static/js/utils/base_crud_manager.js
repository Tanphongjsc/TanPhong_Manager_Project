/**
 * File: base_crud_manager.js
 * Base CRUD Manager - Chỉ có CREATE và EDIT mode
 * Author: ThanhTrung2308
 * Updated: 2025-01-15
 */

class BaseCRUDManager {
    constructor(config) {
        this.config = {
            sidebarId: config.sidebarId,
            overlayId: config.overlayId,
            formId: config.formId,
            tbodySelector: config.tbodySelector || 'tbody',
            codeField: config.codeField,
            nameField: config.nameField,
            apiUrls: config.apiUrls,
            tableColumns: config.tableColumns || 4,
            onAfterInit: config.onAfterInit || (() => {}),
            onBeforeSubmit: config.onBeforeSubmit || (() => true),
            onAfterSubmit: config.onAfterSubmit || (() => {}),
            createRowHTML: config.createRowHTML,
            fillFormData: config.fillFormData,
            getFormData: config.getFormData,
            additionalValidations: config.additionalValidations || [],
            texts: {
                entityName: config.entityName || 'mục',
                createTitle: config.createTitle || 'Thêm mới',
                editTitle: config.editTitle || 'Chỉnh sửa',
                deleteTitle: config.deleteTitle || 'Xóa',
                deleteMessage: config.deleteMessage || ((name) => `Bạn có muốn xóa '${name}'?`),
                ...config.texts
            }
        };
        
        this.currentMode = 'create';
        this.currentItemId = null;
        this.isSubmitting = false;
        this.sidebar = null;
        this.elements = {};
    }
    
    init() {
        this.cacheElements();
        this.initSidebar();
        this.initEventListeners();
        this.initSearchFilter();
        this.initStatusFilter();
        this.initValidation();
        this.config.onAfterInit();
    }
    
    cacheElements() {
        this.elements = {
            tbody: document.querySelector(this.config.tbodySelector),
            form: document.getElementById(this.config.formId),
            submitBtn: document.querySelector('[data-sidebar-submit]'),
            searchInput: document.getElementById('search-input'),
            statusFilter: document.getElementById('status-filter'),
        };
    }
    
    initSidebar() {
        this.sidebar = SidebarUtils.init(this.config.sidebarId, this.config.overlayId, {
            codeFieldId: this.config.codeField,
            onClose: () => {
                this.currentMode = 'create';
                this.currentItemId = null;
                this.isSubmitting = false;
                ValidationUtils.clearError(this.config.codeField);
                this.enableAllInputs();
            }
        });
        
        if (!this.sidebar) {
            NotificationUtils.error('Không thể khởi tạo sidebar');
            return;
        }
        
        document.querySelectorAll('[data-sidebar-close], [data-sidebar-cancel]').forEach(btn => {
            btn.addEventListener('click', () => this.sidebar.close());
        });
        
        const overlay = document.getElementById(this.config.overlayId);
        if (overlay) {
            overlay.addEventListener('click', () => this.sidebar.close());
        }
        
        if (this.elements.submitBtn) {
            this.elements.submitBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.handleSubmitClick();
            });
        }
    }
    
    handleSubmitClick() {
        this.submitForm();
    }
    
    initEventListeners() {
        const { tbody } = this.elements;
        if (!tbody) return;
        
        tbody.addEventListener('click', (e) => {
            const target = e.target.closest('button, a');
            if (!target) return;
            
            const itemId = target.dataset.id;
            if (!itemId) return;
            
            e.preventDefault();
            
            // ✅ Tất cả đều mở EDIT mode (view-link, view-btn, edit-btn)
            if (target.classList.contains('view-link') || 
                target.classList.contains('view-btn') || 
                target.classList.contains('edit-btn')) {
                this.openSidebar('edit', itemId);
            } else if (target.classList.contains('delete-btn')) {
                this.deleteItem(itemId);
            }
        });
        
        tbody.addEventListener('change', (e) => {
            if (e.target.classList.contains('status-toggle')) {
                this.handleStatusToggle(e.target);
            }
        });
    }
    
    initValidation() {
        const field = document.getElementById(this.config.codeField);
        if (field) {
            field.addEventListener('input', () => {
                ValidationUtils.validate(this.config.codeField, 'code');
            });
        }
        
        this.config.additionalValidations.forEach(validation => {
            const field = document.getElementById(validation.fieldId);
            if (field) {
                field.addEventListener('input', () => {
                    ValidationUtils.validate(validation.fieldId, validation.type, validation.message);
                });
            }
        });
    }
    
    openSidebar(mode, itemId = null) {
        this.currentMode = mode;
        this.currentItemId = itemId;
        
        ValidationUtils.clearError(this.config.codeField);
        
        const form = document.getElementById(this.config.formId);
        if (form) form.reset();
        
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
        
        this.sidebar.setTitle(config.title);
        
        if (this.elements.submitBtn) {
            this.elements.submitBtn.textContent = config.btnText;
            this.elements.submitBtn.className = `px-6 py-2 ${config.btnColor} text-white rounded-lg transition-colors`;
        }
        
        this.enableAllInputs();
        
        this.sidebar.setMode(mode);
        
        if (config.loadData && itemId) {
            this.loadItemData(itemId);
        }
        
        this.sidebar.open();
    }
    
    async loadItemData(itemId) {
        try {
            const response = await fetch(this.config.apiUrls.detail(itemId));
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const result = await response.json();
            const data = result.data || result;
            
            this.enableAllInputs();
            
            if (this.config.fillFormData) {
                this.config.fillFormData(data);
            } else {
                this.defaultFillFormData(data);
            }
            
            await new Promise(resolve => setTimeout(resolve, 10));
            
            this.sidebar.disableField(this.config.codeField, true);
            
        } catch (error) {
            console.error('⛔ Error loading data:', error);
            NotificationUtils.error('Có lỗi xảy ra khi tải dữ liệu');
        }
    }
    
    enableAllInputs() {
        const inputs = this.elements.form.querySelectorAll('input, textarea, select');
        inputs.forEach(input => {
            input.disabled = false;
            input.classList.remove('bg-slate-100', 'cursor-not-allowed');
            input.style.opacity = '1';
        });
    }
    
    defaultFillFormData(data) {
        Object.entries(data).forEach(([key, value]) => {
            const field = document.getElementById(key);
            if (field) field.value = value || '';
        });
    }
    
    async submitForm() {
        if (this.isSubmitting) return;
        
        if (!ValidationUtils.validate(this.config.codeField, 'code')) {
            NotificationUtils.warning(`Vui lòng kiểm tra lại ${this.config.codeField}`);
            return;
        }
        
        if (!this.config.onBeforeSubmit()) return;
        
        const { form, submitBtn } = this.elements;
        if (!form?.checkValidity()) {
            form?.reportValidity();
            return;
        }
        
        this.isSubmitting = true;
        const originalText = submitBtn?.textContent;
        
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Đang xử lý...';
        }
        
        try {
            const formData = this.config.getFormData 
                ? this.config.getFormData(form)
                : new FormData(form);
                
            const url = this.currentMode === 'edit' && this.currentItemId 
                ? this.config.apiUrls.update(this.currentItemId)
                : this.config.apiUrls.create;
            
            const response = await fetch(url, {
                method: 'POST',
                body: formData,
                headers: { 'X-CSRFToken': HelperUtils.getCsrfToken() }
            });
            
            const data = await response.json();
            if (!data.success) throw new Error(data.message);
            
            NotificationUtils.success(data.message || 'Thành công!');
            
            if (this.currentMode === 'edit' && this.currentItemId) {
                this.updateRowFromForm(this.currentItemId, formData);
            } else if (data.id) {
                this.appendNewRow(data, formData);
            }
            
            this.config.onAfterSubmit(data);
            this.sidebar.close();
            
        } catch (error) {
            console.error('⛔ Error:', error);
            NotificationUtils.error(error.message || 'Có lỗi xảy ra');
            
        } finally {
            this.isSubmitting = false;
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = originalText;
            }
        }
    }
    
    deleteItem(itemId) {
        const link = this.elements.tbody?.querySelector(`.view-link[data-id="${itemId}"]`);
        const itemName = link ? link.textContent.trim() : '';
        
        ModalUtils.showConfirm({
            title: this.config.texts.deleteTitle,
            message: this.config.texts.deleteMessage(itemName),
            type: 'danger',
            confirmText: 'Xóa',
            onConfirm: async () => {
                try {
                    const response = await fetch(this.config.apiUrls.delete(itemId), {
                        method: 'POST',
                        headers: { 'X-CSRFToken': HelperUtils.getCsrfToken() }
                    });
                    
                    const data = await response.json();
                    if (!data.success) throw new Error(data.message);
                    
                    this.removeRowFromTable(itemId);
                    NotificationUtils.success(data.message || 'Xóa thành công!');
                    
                } catch (error) {
                    console.error('⛔ Error:', error);
                    NotificationUtils.error(error.message || 'Có lỗi xảy ra');
                }
            }
        });
    }
    
    async handleStatusToggle(toggle) {
        const itemId = toggle.dataset.id;
        const isActive = toggle.checked;
        
        try {
            const response = await fetch(this.config.apiUrls.toggleStatus(itemId), {
                method: 'POST',
                headers: {
                    'X-CSRFToken': HelperUtils.getCsrfToken(),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ is_active: isActive })
            });
            
            const data = await response.json();
            if (!data.success) throw new Error(data.message);
            
            NotificationUtils.success('Cập nhật trạng thái thành công!');
            
        } catch (error) {
            console.error('⛔ Error:', error);
            toggle.checked = !isActive;
            NotificationUtils.error('Có lỗi xảy ra');
        }
    }
    
    initSearchFilter() {
        if (!this.elements.searchInput) return;
        
        const debouncedSearch = HelperUtils.debounce((value) => {
            const rows = this.elements.tbody.querySelectorAll('tr:not(.empty-row)');
            const searchTerm = value.toLowerCase();
            
            rows.forEach(row => {
                row.style.display = row.textContent.toLowerCase().includes(searchTerm) ? '' : 'none';
            });
        }, 300);
        
        this.elements.searchInput.addEventListener('input', (e) => debouncedSearch(e.target.value));
    }
    
    initStatusFilter() {
        if (!this.elements.statusFilter) return;
        
        this.elements.statusFilter.addEventListener('change', (e) => {
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
    
    updateRowFromForm(itemId, formData) {
        const link = this.elements.tbody?.querySelector(`.view-link[data-id="${itemId}"]`);
        if (!link) return;
        
        const row = link.closest('tr');
        const cells = row.querySelectorAll('td');
        
        link.textContent = formData.get(this.config.nameField) || '';
        if (cells[1]) cells[1].textContent = formData.get(this.config.codeField) || '';
    }
    
    appendNewRow(data, formData) {
        const { tbody } = this.elements;
        if (!tbody) return;
        
        const emptyRow = tbody.querySelector('.empty-row');
        if (emptyRow) emptyRow.remove();
        
        const rowHTML = this.config.createRowHTML 
            ? this.config.createRowHTML(data, formData)
            : this.defaultCreateRowHTML(data, formData);
            
        tbody.insertAdjacentHTML('afterbegin', `<tr class="hover:bg-slate-50">${rowHTML}</tr>`);
    }
    
    defaultCreateRowHTML(data, formData) {
        return `<td colspan="${this.config.tableColumns}">Override createRowHTML in config</td>`;
    }
    
    removeRowFromTable(itemId) {
        const link = this.elements.tbody?.querySelector(`.view-link[data-id="${itemId}"]`);
        if (!link) return;
        
        const row = link.closest('tr');
        if (!row) return;
        
        row.style.cssText = 'transition: opacity 300ms ease-out; opacity: 0';
        setTimeout(() => {
            row.remove();
            this.checkEmptyTable();
        }, 300);
    }
    
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
}

window.BaseCRUDManager = BaseCRUDManager;