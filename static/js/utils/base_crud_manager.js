/**
 * BaseCRUDManager - Quản lý THAO TÁC FORM & API
 * @class BaseCRUDManager
 * @role:
 * 1. Mở form (Add/Edit)
 * 2. Validate form
 * 3. Gọi API (Create/Update/Delete)
 * 4. Thông báo cho TableManager load lại dữ liệu khi thao tác xong
 */
class BaseCRUDManager {
    constructor(config) {
        if (typeof AppUtils === 'undefined') {
            throw new Error('AppUtils is required. Please load utils.js first.');
        }

        this.config = {
            // Cấu hình UI
            sidebarId: config.sidebarId,
            overlayId: config.overlayId,
            formId: config.formId,
            
            // Selector để lắng nghe sự kiện click (Edit/Delete) từ bảng
            tbodySelector: config.tbodySelector || 'tbody', 

            // Cấu hình Field
            codeField: config.codeField,
            
            // Cấu hình API
            apiUrls: config.apiUrls,
            
            // HTTP Methods
            httpMethods: {
                create: 'POST',
                update: 'PUT', 
                delete: 'DELETE', // Hoặc 'DELETE' tùy backend
                toggleStatus: 'POST',
                ...config.httpMethods
            },
            
            // Callbacks
            onAfterInit: config.onAfterInit || (() => {}),
            onBeforeSubmit: config.onBeforeSubmit || (() => true),
            onAfterSubmit: config.onAfterSubmit || (() => {}),
            
            // ⭐ QUAN TRỌNG: Callback để gọi TableManager refresh
            onRefreshTable: config.onRefreshTable || (() => {}),

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
            isCodeManuallyEdited: false // Trạng thái đã sửa thủ công
        };

        this.elements = {};
        this.eventManager = AppUtils.EventManager.create();
        this.sidebar = null;
    }

    init() {
        this.cacheElements();
        this.initSidebar();
        this.initEventListeners();
        this.initValidation();
        this.setupAutoCode();
        this.config.onAfterInit();
    }

    cacheElements() {
        this.elements = {
            // Chỉ lấy tbody để gắn sự kiện click, KHÔNG dùng để render
            tbody: document.querySelector(this.config.tbodySelector),
            form: document.getElementById(this.config.formId),
            submitBtn: document.querySelector(`[data-sidebar-submit][form="${this.config.formId}"]`) || document.querySelector('[data-sidebar-submit]'),
        };

        if (!this.elements.form) {
            console.error(`⛔ Form with id "${this.config.formId}" not found`);
        }
    }

    initSidebar() {
        this.sidebar = AppUtils.Sidebar.init(this.config.sidebarId, this.config.overlayId, {
            codeFieldId: this.config.codeField,
            onClose: () => {
                // Abort load data nếu đang tải dở mà đóng
                if (this.state.loadController) {
                    this.state.loadController.abort();
                    this.state.loadController = null;
                }
                
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
    }

    initEventListeners() {
        const { tbody } = this.elements;
        if (!tbody) return;

        // Event delegation: Lắng nghe click vào nút Edit/Delete trong bảng
        this.eventManager.add(tbody, 'click', (e) => {
            const target = e.target.closest('button, a');
            if (!target) return;

            const itemId = target.dataset.id;
            if (!itemId) return; // Nút không có ID thì bỏ qua

            // Xử lý Edit
            if (target.classList.contains('view-link') ||
                target.classList.contains('view-btn') ||
                target.classList.contains('edit-btn')) {
                e.preventDefault();
                this.openSidebar('edit', itemId);
            } 
            // Xử lý Delete
            else if (target.classList.contains('delete-btn')) {
                e.preventDefault();
                this.deleteItem(itemId);
            }
        });

        // Xử lý Toggle Status
        this.eventManager.add(tbody, 'change', (e) => {
            if (e.target.classList.contains('status-toggle')) {
                this.handleStatusToggle(e.target);
            }
        });
    }

    initValidation() {
        // Validate field Mã khi nhập liệu
        const codeField = document.getElementById(this.config.codeField);
        if (codeField) {
            this.eventManager.add(codeField, 'input', () => {
                AppUtils.Validation.validate(this.config.codeField, 'code');
            });
        }

        // Validate các field khác được cấu hình thêm
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


    /**
     * Logic sinh mã tự động tối ưu
     */
    setupAutoCode() {
        if (!this.config.autoCode || !this.config.autoCode.sourceField) return;

        const { sourceField, targetField } = this.config.autoCode;
        // Nếu không cấu hình targetField, lấy mặc định codeField của Manager
        const targetName = targetField || this.config.codeField;

        const sourceInput = this.elements.form.querySelector(`[name="${sourceField}"]`);
        const targetInput = this.elements.form.querySelector(`[name="${targetName}"]`);

        if (!sourceInput || !targetInput) return;

        // 1. Hàm sinh mã (Debounce 300ms)
        const handleGenerateCode = AppUtils.Helper.debounce(() => {
            // Chỉ chạy khi: Đang ở mode Create VÀ Người dùng chưa can thiệp vào ô Mã
            if (this.state.currentMode === 'create' && !this.state.isCodeManuallyEdited) {
                const sourceValue = sourceInput.value.trim();
                
                // Gán giá trị trực tiếp (Việc này KHÔNG kích hoạt sự kiện 'input' của DOM)
                targetInput.value = sourceValue ? AppUtils.Helper.generateCode(sourceValue) : '';
                
                // (Tùy chọn) Gọi validate thủ công để xóa báo lỗi đỏ (nếu có) mà không bật cờ sửa tay
                AppUtils.Validation.clearError(targetName);
            }
        }, 300);

        // 2. Lắng nghe ô TÊN (Nguồn)
        this.eventManager.add(sourceInput, 'input', handleGenerateCode);

        // 3. Lắng nghe ô MÃ (Đích) - Để phát hiện người dùng sửa tay
        this.eventManager.add(targetInput, 'input', (e) => {
            const val = e.target.value.trim();

            if (val === '') {
                // Nếu người dùng xóa trắng ô Mã -> Reset cờ, cho phép Auto lại
                this.state.isCodeManuallyEdited = false;
                
                // Tự động sinh lại mã ngay lập tức theo tên hiện tại (nếu muốn UX mượt hơn)
                handleGenerateCode(); 
            } else {
                // Người dùng gõ nội dung -> Bật cờ, chặn Auto
                this.state.isCodeManuallyEdited = true;
            }
        });
    }

    openSidebar(mode, itemId = null) {
        this.state.currentMode = mode;
        this.state.currentItemId = itemId;
        this.state.isCodeManuallyEdited = false;

        AppUtils.Validation.clearError(this.config.codeField);
        
        if (this.elements.form) this.elements.form.reset();

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
            // Reset class cũ và thêm class mới (để tránh trùng lặp class màu)
            this.elements.submitBtn.className = `px-6 py-2 text-white rounded-lg transition-colors ${config.btnColor}`;
        }

        this.enableAllInputs();
        this.sidebar.setMode(mode);

        if (config.loadData && itemId) {
            this.loadItemData(itemId);
        }

        this.sidebar.open();
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

            // Điền dữ liệu vào form
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
        const inputs = this.elements.form.querySelectorAll('input, textarea, select');
        inputs.forEach(input => {
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

        // Validate cơ bản
        if (!AppUtils.Validation.validate(this.config.codeField, 'code')) {
            AppUtils.Notify.warning(`Vui lòng kiểm tra lại ${this.config.codeField}`);
            return;
        }

        // Custom validation hook
        if (!this.config.onBeforeSubmit()) return;

        // HTML5 Validity check
        const { form, submitBtn } = this.elements;
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
            // ✅ THAY ĐỔI: Chuyển FormData sang JSON Object
            let payload;
            
            if (this.config.getFormData) {
                // Nếu có custom getFormData thì dùng
                payload = this.config.getFormData(form);
            } else {
                // Mặc định: Convert FormData -> JSON
                const formData = new FormData(form);
                payload = {};
                
                for (let [key, value] of formData.entries()) {
                    payload[key] = value;
                }
            }

            // ✅ Xử lý field Mã bị disabled (Edit mode)
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

            // ✅ THAY ĐỔI: Gửi JSON thay vì FormData
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

            // Callback
            this.config.onAfterSubmit(data);
            
            // ⭐ Gọi TableManager refresh
            this.config.onRefreshTable();

            this.sidebar.close();

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

    deleteItem(itemId) {
        AppUtils.Modal.showConfirm({
            title: this.config.texts.deleteTitle,
            message: this.config.texts.deleteMessage('bản ghi này'), // Có thể cải tiến lấy name nếu muốn
            type: 'danger',
            confirmText: 'Xóa',
            onConfirm: async () => {
                try {
                    const method = this.config.httpMethods.delete;
                    const url = this.config.apiUrls.delete(itemId);
                    
                    let data;
                    if (method === 'DELETE') data = await AppUtils.API.delete(url);
                    else data = await AppUtils.API.post(url); // Support POST delete

                    if (data.success === false) throw new Error(data.message || 'Xóa thất bại');

                    AppUtils.Notify.success(data.message || 'Xóa thành công!');
                    
                    // ⭐ KEY CHANGE: Refresh bảng
                    this.config.onRefreshTable();

                } catch (error) {
                    console.error('⛔ Delete error:', error);
                    AppUtils.Notify.error(error.message || 'Có lỗi xảy ra');
                }
            }
        });
    }

    async handleStatusToggle(toggle) {
        const itemId = toggle.dataset.id;
        const isActive = toggle.checked;

        try {
            const url = this.config.apiUrls.toggleStatus(itemId);
            const payload = { is_active: isActive };
            
            // Thử PUT trước, fallback các method khác tùy config
            // (Mặc định toggleStatus trong constructor là POST, nhưng logic ở đây linh động)
            const method = this.config.httpMethods.toggleStatus;
            
            let data;
            if (method === 'PUT') data = await AppUtils.API.put(url, payload);
            else data = await AppUtils.API.post(url, payload);

            if (data.success === false) throw new Error(data.message || 'Cập nhật thất bại');

            AppUtils.Notify.success('Cập nhật trạng thái thành công!');
            
            // Không nhất thiết phải refresh bảng khi toggle, nhưng nếu cần thì uncomment:
            // this.config.onRefreshTable();

        } catch (error) {
            console.error('⛔ Toggle status error:', error);
            toggle.checked = !isActive; // Revert lại UI nếu lỗi
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