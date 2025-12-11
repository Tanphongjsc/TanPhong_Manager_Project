/**
 * BaseCRUDManager - Quản lý THAO TÁC FORM & API
 * Hỗ trợ 2 chế độ UI: 'sidebar' (mặc định) và 'modal'
 */
class BaseCRUDManager {
    constructor(config) {
        if (typeof AppUtils === 'undefined') {
            throw new Error('AppUtils is required. Please load utils.js first.');
        }

        this.config = {
            // ===== CHẾ ĐỘ UI: 'sidebar' (mặc định) hoặc 'modal' =====
            uiMode: config.uiMode || 'sidebar',
            
            // Cấu hình Sidebar (giữ nguyên)
            sidebarId: config.sidebarId,
            overlayId: config.overlayId,
            
            // Cấu hình Modal (mới)
            modalId: config.modalId,
            
            // Cấu hình chung
            formId: config.formId,
            tbodySelector: config.tbodySelector || 'tbody',
            codeField: config.codeField,
            
            // Cấu hình API
            apiUrls: config.apiUrls,
            
            // HTTP Methods
            httpMethods: {
                create: 'POST',
                update: 'PUT',
                delete: 'DELETE',
                toggleStatus: 'POST',
                ...config.httpMethods
            },
            
            // Callbacks
            onAfterInit: config.onAfterInit || (() => {}),
            onBeforeSubmit: config.onBeforeSubmit || (() => true),
            onAfterSubmit: config.onAfterSubmit || (() => {}),
            onRefreshTable: config.onRefreshTable || (() => {}),
            onBeforeOpen: config.onBeforeOpen || (() => {}),
            onAfterClose: config.onAfterClose || (() => {}),

            fillFormData: config.fillFormData,
            getFormData: config.getFormData,
            
            // Validation bổ sung
            additionalValidations: config.additionalValidations || [],
            
            // Text hiển thị
            texts: {
                entityName: config.entityName || 'mục',
                createTitle: config.createTitle || 'Thêm mới',
                editTitle: config.editTitle || 'Chỉnh sửa',
                deleteTitle: config.deleteTitle || 'Xóa',
                deleteMessage: config.deleteMessage || ((name) => `Bạn có muốn xóa '${name}'?`),
                ...config.texts
            },

            // Cấu hình Auto Code
            autoCode: config.autoCode || null
        };

        // State
        this.state = {
            currentMode: 'create',
            currentItemId: null,
            isSubmitting: false,
            loadController: null,
            isCodeManuallyEdited: false
        };

        this.elements = {};
        this.eventManager = AppUtils.EventManager.create();
        
        // UI Handler (sidebar hoặc modal)
        this.uiHandler = null;
    }

    init() {
        this.cacheElements();
        this.initUIHandler();
        this.initEventListeners();
        this.initValidation();
        this.setupAutoCode();
        this.config.onAfterInit();
    }

    cacheElements() {
        this.elements = {
            tbody: document.querySelector(this.config.tbodySelector),
            form: document.getElementById(this.config.formId),
        };

        if (!this.elements.form) {
            console.error(`⛔ Form with id "${this.config.formId}" not found`);
        }
    }

    // ===== UI HANDLER INITIALIZATION (TỐI ƯU) =====
    initUIHandler() {
        if (this.config.uiMode === 'modal') {
            this.initModal();
        } else {
            this.initSidebar();
        }
    }

    // ===== MODAL METHODS (TỐI ƯU - TÁI SỬ DỤNG AppUtils.Modal) =====
    initModal() {
        const modal = document.getElementById(this.config.modalId);
        if (!modal) {
            console.error(`⛔ Modal with id "${this.config.modalId}" not found`);
            return;
        }

        this.elements.modal = modal;
        this.elements.submitBtn = modal.querySelector('[data-modal-submit]');

        // 🔧 TỐI ƯU: Sử dụng AppUtils.Modal.close thay vì tự viết
        this.eventManager.addMultiple(
            modal.querySelectorAll('[data-modal-close]'),
            'click',
            () => this.closeModal()
        );

        // Click outside to close
        this.eventManager.add(modal, 'click', (e) => {
            if (e.target === modal) this.closeModal();
        });

        // ESC key to close
        this.eventManager.add(document, 'keydown', (e) => {
            if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
                this.closeModal();
            }
        });

        // Submit button
        if (this.elements.submitBtn) {
            this.eventManager.add(this.elements.submitBtn, 'click', (e) => {
                e.preventDefault();
                this.submitForm();
            });
        }

        // 🔧 TỐI ƯU: Wrapper functions sử dụng AppUtils.Modal
        this.uiHandler = {
            open: () => AppUtils.Modal.open(modal),
            close: () => AppUtils.Modal.close(modal),
            setTitle: (title) => {
                const titleEl = modal.querySelector('[data-modal-title]');
                if (titleEl) titleEl.textContent = title;
            },
            setMode: (mode) => {
                modal.dataset.mode = mode;
            }
        };
    }

    // 🔧 LOẠI BỎ: isModalOpen() - không cần thiết nữa vì AppUtils.Modal đã handle
    openModal(mode, itemId = null) {
        this.openUI(mode, itemId);
    }

    closeModal() {
        this.closeUI();
    }

    // ===== SIDEBAR METHODS (GIỮ NGUYÊN) =====
    initSidebar() {
        this.sidebar = AppUtils.Sidebar.init(this.config.sidebarId, this.config.overlayId, {
            codeFieldId: this.config.codeField,
            onClose: () => {
                this.handleUIClose();
            }
        });

        if (!this.sidebar) {
            AppUtils.Notify.error('Không thể khởi tạo sidebar');
            return;
        }

        this.elements.submitBtn = document.querySelector(`[data-sidebar-submit][form="${this.config.formId}"]`) || 
                                   document.querySelector('[data-sidebar-submit]');

        // Close buttons
        this.eventManager.addMultiple(
            document.querySelectorAll('[data-sidebar-close], [data-sidebar-cancel]'),
            'click',
            () => this.sidebar.close()
        );

        // Overlay click
        const overlay = document.getElementById(this.config.overlayId);
        if (overlay) {
            this.eventManager.add(overlay, 'click', () => this.sidebar.close());
        }

        // Submit button click
        if (this.elements.submitBtn) {
            this.eventManager.add(this.elements.submitBtn, 'click', (e) => {
                e.preventDefault();
                this.submitForm();
            });
        }

        this.uiHandler = {
            open: () => this.sidebar.open(),
            close: () => this.sidebar.close(),
            setTitle: (title) => this.sidebar.setTitle(title),
            setMode: (mode) => this.sidebar.setMode(mode)
        };
    }

    openSidebar(mode, itemId = null) {
        this.openUI(mode, itemId);
    }

    closeSidebar() {
        this.closeUI();
    }

    // 🔧 TỐI ƯU: Tách logic cleanup chung
    handleUIClose() {
        if (this.state.loadController) {
            this.state.loadController.abort();
            this.state.loadController = null;
        }
        
        this.state.currentMode = 'create';
        this.state.currentItemId = null;
        this.state.isSubmitting = false;
        AppUtils.Validation.clearError(this.config.codeField);
        this.enableAllInputs();
        this.config.onAfterClose();
    }

    // ===== UNIFIED UI METHODS =====
    openUI(mode, itemId = null) {
        this.state.currentMode = mode;
        this.state.currentItemId = itemId;
        this.state.isCodeManuallyEdited = false;

        AppUtils.Validation.clearError(this.config.codeField);
        
        if (this.elements.form) this.elements.form.reset();

        this.config.onBeforeOpen(mode);

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

        const uiConfig = configs[mode] || configs.create;

        this.uiHandler.setTitle(uiConfig.title);

        if (this.elements.submitBtn) {
            this.elements.submitBtn.textContent = uiConfig.btnText;
            
            if (this.config.uiMode === 'sidebar') {
                this.elements.submitBtn.className = `px-6 py-2 text-white rounded-lg transition-colors ${uiConfig.btnColor}`;
            }
        }

        this.enableAllInputs();
        this.uiHandler.setMode(mode);

        if (uiConfig.loadData && itemId) {
            this.loadItemData(itemId);
        }

        this.uiHandler.open();
    }

    closeUI() {
        this.handleUIClose();
        this.uiHandler.close();
    }

    // ===== EXISTING METHODS (GIỮ NGUYÊN LOGIC) =====
    initEventListeners() {
        const { tbody } = this.elements;
        if (!tbody) return;

        // Event delegation cho Edit/Delete
        this.eventManager.add(tbody, 'click', (e) => {
            const target = e.target.closest('button, a');
            if (!target) return;

            const itemId = target.dataset.id;
            if (!itemId) return;

            const itemName = target.dataset.name || 'bản ghi này';

            if (target.classList.contains('view-link') ||
                target.classList.contains('view-btn') ||
                target.classList.contains('edit-btn')) {
                e.preventDefault();
                this.openUI('edit', itemId);
            } 
            else if (target.classList.contains('delete-btn')) {
                e.preventDefault();
                this.deleteItem(itemId, itemName);
            }
        });

        // Toggle Status
        this.eventManager.add(tbody, 'change', (e) => {
            if (e.target.classList.contains('status-toggle')) {
                this.handleStatusToggle(e.target);
            }
        });
    }

    initValidation() {
        const codeField = document.getElementById(this.config.codeField);
        if (codeField) {
            this.eventManager.add(codeField, 'input', () => {
                AppUtils.Validation.validate(this.config.codeField, 'code');
            });
        }

        this.config.additionalValidations.forEach(validation => {
            const field = document.getElementById(validation.fieldId);
            if (field) {
                this.eventManager.add(field, 'input', () => {
                    AppUtils.Validation.validate(
                        validation.fieldId,
                        validation.type,
                        validation.message
                    );
                });
            }
        });
    }

    setupAutoCode() {
        if (!this.config.autoCode || !this.config.autoCode.sourceField) return;

        const { sourceField, targetField } = this.config.autoCode;
        const targetName = targetField || this.config.codeField;

        const sourceInput = this.elements.form?.querySelector(`[name="${sourceField}"]`);
        const targetInput = this.elements.form?.querySelector(`[name="${targetName}"]`);

        if (!sourceInput || !targetInput) return;

        const handleGenerateCode = AppUtils.Helper.debounce(() => {
            if (this.state.currentMode === 'create' && !this.state.isCodeManuallyEdited) {
                const sourceValue = sourceInput.value.trim();
                targetInput.value = sourceValue ? AppUtils.Helper.generateCode(sourceValue) : '';
                AppUtils.Validation.clearError(targetName);
            }
        }, 300);

        this.eventManager.add(sourceInput, 'input', handleGenerateCode);

        this.eventManager.add(targetInput, 'input', (e) => {
            const val = e.target.value.trim();
            if (val === '') {
                this.state.isCodeManuallyEdited = false;
                handleGenerateCode();
            } else {
                this.state.isCodeManuallyEdited = true;
            }
        });
    }

    async loadItemData(itemId) {
        if (this.state.loadController) {
            this.state.loadController.abort();
        }
        this.state.loadController = new AbortController();

        try {
            const result = await AppUtils.API.get(
                this.config.apiUrls.detail(itemId),
                {},
                { signal: this.state.loadController.signal }
            );
            const data = result.data || result;

            this.enableAllInputs();

            if (this.config.fillFormData) {
                this.config.fillFormData(data);
            } else {
                this.defaultFillFormData(data);
            }

            // Disable field Mã khi edit
            const codeField = document.getElementById(this.config.codeField);
            if (codeField) {
                codeField.disabled = true;
                codeField.classList.add('bg-slate-100', 'cursor-not-allowed');
                codeField.style.opacity = '0.6';
            }

        } catch (error) {
            if (error.name === 'AbortError') return;
            console.error('⛔ Error loading data:', error);
            AppUtils.Notify.error(error.message || 'Có lỗi xảy ra khi tải dữ liệu');
        } finally {
            this.state.loadController = null;
        }
    }

    enableAllInputs() {
        const inputs = this.elements.form?.querySelectorAll('input, textarea, select');
        inputs?.forEach(input => {
            input.disabled = false;
            input.classList.remove('bg-slate-100', 'cursor-not-allowed');
            input.style.opacity = '1';
        });
    }

    defaultFillFormData(data) {
        AppUtils.Form.setData(this.elements.form, data);
    }

    async submitForm() {
        if (this.state.isSubmitting) return;

        // Validate
        if (this.config.codeField && !AppUtils.Validation.validate(this.config.codeField, 'code')) {
            AppUtils.Notify.warning(`Vui lòng kiểm tra lại ${this.config.codeField}`);
            return;
        }

        if (!this.config.onBeforeSubmit()) return;

        const { form } = this.elements;
        const { submitBtn } = this.elements;
        
        if (!form?.checkValidity()) {
            form?.reportValidity();
            return;
        }

        this.state.isSubmitting = true;
        const originalText = submitBtn?.textContent;

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Đang xử lý...';
        }

        try {
            let payload;
            
            if (this.config.getFormData) {
                payload = this.config.getFormData(form);
            } else {
                const formData = new FormData(form);
                payload = {};
                for (let [key, value] of formData.entries()) {
                    payload[key] = value;
                }
            }

            // Xử lý field Mã bị disabled
            if (this.state.currentMode === 'edit' && this.config.codeField) {
                const codeField = document.getElementById(this.config.codeField);
                if (codeField && codeField.disabled && codeField.value) {
                    payload[this.config.codeField] = codeField.value;
                }
            }

            const isEdit = this.state.currentMode === 'edit' && this.state.currentItemId;
            const url = isEdit
                ? this.config.apiUrls.update(this.state.currentItemId)
                : this.config.apiUrls.create;
            
            const method = isEdit 
                ? this.config.httpMethods.update 
                : this.config.httpMethods.create;

            let data;
            if (method === 'PUT') {
                data = await AppUtils.API.put(url, payload);
            } else if (method === 'PATCH') {
                data = await AppUtils.API.patch(url, payload);
            } else {
                data = await AppUtils.API.post(url, payload);
            }

            if (data.success === false) {
                throw new Error(data.message || 'Thao tác thất bại');
            }

            AppUtils.Notify.success(data.message || 'Thành công!');

            this.config.onAfterSubmit(data);
            this.config.onRefreshTable();

            this.closeUI();

        } catch (error) {
            console.error('⛔ Submit error:', error);
            AppUtils.Notify.error(error.message || 'Có lỗi xảy ra');
        } finally {
            this.state.isSubmitting = false;
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = originalText;
            }
        }
    }

    deleteItem(itemId, itemName) {
        AppUtils.DeleteOperations.confirmDelete({
            id: itemId,
            name: itemName,
            url: this.config.apiUrls.delete,
            method: this.config.httpMethods.delete,
            onSuccess: () => this.config.onRefreshTable()
        });
    }

    deleteMultipleItems(ids) {
        AppUtils.DeleteOperations.confirmBulkDelete({
            ids: ids,
            url: this.config.apiUrls.delete,
            bulkUrl: this.config.apiUrls.bulkDelete || null,
            method: this.config.httpMethods.delete,
            onSuccess: () => this.config.onRefreshTable()
        });
    }

    async handleStatusToggle(toggle) {
        const itemId = toggle.dataset.id;
        const isActive = toggle.checked;

        try {
            const url = this.config.apiUrls.toggleStatus(itemId);
            const method = this.config.httpMethods.toggleStatus;
            
            let data;
            if (method === 'PUT') {
                data = await AppUtils.API.put(url, { is_active: isActive });
            } else {
                data = await AppUtils.API.post(url, { is_active: isActive });
            }

            if (data.success === false) throw new Error(data.message || 'Cập nhật thất bại');

            AppUtils.Notify.success(data.message || 'Cập nhật trạng thái thành công!');

        } catch (error) {
            console.error('⛔ Toggle status error:', error);
            toggle.checked = !isActive;
            AppUtils.Notify.error(error.message || 'Có lỗi xảy ra');
        }
    }

    destroy() {
        if (this.state.loadController) {
            this.state.loadController.abort();
        }
        this.eventManager.removeAll();
        
        this.state = {
            currentMode: 'create',
            currentItemId: null,
            isSubmitting: false,
            loadController: null
        };

        console.log('✅ BaseCRUDManager destroyed');
    }
}

window.BaseCRUDManager = BaseCRUDManager;