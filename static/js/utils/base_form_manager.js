/**
 * BaseFormManager - Base class cho Form trên trang riêng biệt
 * Version: 2.1 (Thêm AutoCode support)
 */
class BaseFormManager {
    constructor(config) {
        if (typeof AppUtils === 'undefined') {
            throw new Error('AppUtils is required.');
        }

        this.config = {
            // Form config
            formId: 'main-form',
            submitBtnId: 'btn-save',
            
            // API URLs
            apiUrls: {
                create: '',
                update: (id) => '',
                detail: (id) => '',
            },

            // Regex để lấy ID từ URL
            idParamRegex: /\/(\d+)\/(update|edit)\//,
            
            // ✅ NEW: Auto Code Config
            // Truyền null nếu không cần, hoặc { sourceField: 'ten... ', targetField: 'ma.. .' }
            autoCode: null,
            
            // Abstract callbacks
            buildPayload: () => ({}),
            validateLogic: (payload) => null,
            fillFormData: (data) => {},
            onSuccess: () => {},
            
            ... config
        };

        // DOM Elements
        this.form = document.getElementById(this.config.formId);
        this.submitBtn = document.getElementById(this.config.submitBtnId);
        
        // State
        this.state = {
            isUpdateMode: false,
            currentId: null,
            isSubmitting: false,
            isCodeManuallyEdited: false  // ✅ NEW:  Cho AutoCode
        };

        this._detectMode();
    }

    /**
     * Phát hiện mode từ URL
     */
    _detectMode() {
        const matches = window.location.pathname.match(this.config.idParamRegex);
        if (matches && matches[1]) {
            this.state.currentId = matches[1];
            this.state.isUpdateMode = true;
        }
    }

    /**
     * Khởi tạo
     */
    init() {
        if (!this.form) {
            console.error(`⛔ Form #${this.config.formId} not found`);
            return;
        }

        this._bindSubmit();
        this._setupAutoCode();  // ✅ NEW:  Tự động setup nếu có config
        
        if (this.state.isUpdateMode) {
            this. loadData();
        }
        
        // Hook cho class con override
        if (this.onAfterInit) {
            this. onAfterInit();
        }
    }

    /**
     * Bind sự kiện submit
     */
    _bindSubmit() {
        if (this.submitBtn) {
            this.submitBtn.addEventListener('click', (e) => {
                e. preventDefault();
                this. submit();
            });
        }
        
        // Chặn Enter submit form
        if (this.form) {
            this.form.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
                    e.preventDefault();
                }
            });
        }
    }

    /**
     * ✅ NEW: Setup Auto Generate Code
     * - Chỉ hoạt động khi tạo mới
     * - Ngừng auto khi user sửa mã thủ công
     * - Tiếp tục auto nếu user xóa trắng ô mã
     */
    _setupAutoCode() {
        const { autoCode } = this.config;
        if (!autoCode) return;
        
        const { sourceField, targetField } = autoCode;
        const sourceInput = this.form?. querySelector(`[name="${sourceField}"]`);
        const targetInput = this.form?.querySelector(`[name="${targetField}"]`);
        
        if (! sourceInput || !targetInput) {
            console.warn(`⚠️ AutoCode:  Field không tìm thấy (source: ${sourceField}, target: ${targetField})`);
            return;
        }
        
        // Không auto-generate khi Update mode
        if (this.state.isUpdateMode) {
            this.state.isCodeManuallyEdited = true;
            return;
        }

        // Khi nhập source → Tự động sinh target
        sourceInput.addEventListener('input', () => {
            if (! this.state.isCodeManuallyEdited) {
                const generated = AppUtils.Helper.generateCode(sourceInput.value);
                targetInput.value = generated;
                
                // Clear validation error nếu có giá trị
                if (generated && targetInput.id) {
                    AppUtils. Validation.clearError(targetInput. id);
                }
            }
        });

        // Khi user sửa target thủ công
        targetInput.addEventListener('input', (e) => {
            // Auto uppercase và remove ký tự không hợp lệ
            e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '');
            
            const val = e.target.value. trim();
            
            if (val === '') {
                // User xóa trắng → Cho phép auto-generate lại
                this.state.isCodeManuallyEdited = false;
                targetInput.value = AppUtils.Helper.generateCode(sourceInput.value);
            } else {
                // User đã nhập/sửa → Ngừng auto
                this.state.isCodeManuallyEdited = true;
            }
        });
    }

    /**
     * Load dữ liệu khi Update mode
     */
    async loadData() {
        try {
            const url = this.config.apiUrls.detail(this.state.currentId);
            const res = await AppUtils.API.get(url);
            
            if (res.success) {
                // Đánh dấu đã edit để không auto-generate
                this.state.isCodeManuallyEdited = true;
                this.config.fillFormData(res.data);
            } else {
                AppUtils.Notify.error(res.message || "Không thể tải dữ liệu");
            }
        } catch (err) {
            console.error('⛔ Load data error:', err);
            AppUtils.Notify.error("Lỗi kết nối khi tải dữ liệu");
        }
    }

    /**
     * Submit form
     */
    async submit() {
        if (this.state.isSubmitting) return;

        // HTML5 validation
        if (!this.form. checkValidity()) {
            this.form.reportValidity();
            return;
        }

        // Build payload
        const payload = this. config.buildPayload();
        
        // Custom validation
        const errorMsg = this.config.validateLogic(payload);
        if (errorMsg) {
            AppUtils.Notify.error(errorMsg);
            return;
        }

        this._setLoading(true);

        try {
            let res;
            if (this.state.isUpdateMode) {
                const url = this.config.apiUrls.update(this.state. currentId);
                res = await AppUtils.API.put(url, payload);
            } else {
                const url = this.config.apiUrls.create;
                res = await AppUtils.API.post(url, payload);
            }

            if (res.success) {
                AppUtils.Notify.success(res.message || "Lưu thành công!");
                this.config.onSuccess(res);
            } else {
                AppUtils. Notify.error(res.message || "Có lỗi xảy ra");
                this._setLoading(false);
            }
        } catch (err) {
            console.error('⛔ Submit error:', err);
            AppUtils.Notify. error("Lỗi hệ thống:  " + (err.message || err));
            this._setLoading(false);
        }
    }

    /**
     * Set loading state cho button
     */
    _setLoading(isLoading) {
        this.state.isSubmitting = isLoading;
        if (! this.submitBtn) return;

        if (isLoading) {
            this.submitBtn.disabled = true;
            this.submitBtn.dataset.originalText = this.submitBtn.innerHTML;
            this.submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Đang lưu...';
        } else {
            this.submitBtn. disabled = false;
            if (this.submitBtn.dataset.originalText) {
                this.submitBtn. innerHTML = this.submitBtn.dataset.originalText;
            }
        }
    }

    // ============================================================
    // HELPER METHODS
    // ============================================================
    
    setFieldValue(name, value) {
        const el = this.form?. querySelector(`[name="${name}"]`);
        if (el) {
            el.value = value !== null && value !== undefined ? value : '';
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }

    getFieldValue(name) {
        const el = this.form?. querySelector(`[name="${name}"]`);
        return el ? el.value : '';
    }

    toggleBlock(blockId, show, disableInputs = true) {
        const block = document.getElementById(blockId);
        if (! block) return;

        block.classList.toggle('hidden', !show);

        if (disableInputs) {
            block.querySelectorAll('input, select, textarea').forEach(input => {
                input.disabled = ! show;
            });
        }
    }

    /**
     * ✅ NEW: Helper để disable field mã khi update
     */
    disableCodeField() {
        const { autoCode } = this.config;
        if (!autoCode) return;
        
        const targetInput = this.form?.querySelector(`[name="${autoCode.targetField}"]`);
        if (targetInput) {
            targetInput.readOnly = true;
            targetInput.classList.add('bg-slate-100', 'cursor-not-allowed', 'text-slate-500');
        }
    }
}

window.BaseFormManager = BaseFormManager;