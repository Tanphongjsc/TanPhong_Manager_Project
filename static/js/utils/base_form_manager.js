/**
 * BaseFormManager - Base class cho Form trên trang riêng biệt
 * Version: 2.0 (Simplified)
 * 
 * Dùng cho: Thêm/Sửa entity phức tạp (không dùng sidebar)
 * 
 * Chức năng:
 * 1. Detect mode (Create/Update) từ URL
 * 2. Load data khi Update
 * 3. Submit form với validation
 * 4. Loading state management
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
            
            // API URLs (bắt buộc)
            apiUrls: {
                create: '',
                update: (id) => '',
                detail: (id) => '',
            },

            // Regex để lấy ID từ URL
            // Mặc định: /123/update/ hoặc /123/edit/
            idParamRegex: /\/(\d+)\/(update|edit)\//,
            
            // Abstract callbacks - Class con PHẢI implement
            buildPayload: () => ({}),
            validateLogic: (payload) => null,
            fillFormData: (data) => {},
            onSuccess: () => {},
            
            ... config
        };

        // DOM Elements
        this.form = document.getElementById(this. config.formId);
        this.submitBtn = document.getElementById(this.config. submitBtnId);
        
        // State
        this.state = {
            isUpdateMode: false,
            currentId: null,
            isSubmitting: false
        };

        this._detectMode();
    }

    /**
     * Phát hiện mode từ URL
     */
    _detectMode() {
        const matches = window.location. pathname.match(this. config.idParamRegex);
        if (matches && matches[1]) {
            this.state.currentId = matches[1];
            this. state.isUpdateMode = true;
        }
    }

    /**
     * Khởi tạo - Class con gọi super. init() rồi thêm logic riêng trong onAfterInit()
     */
    init() {
        if (! this.form) {
            console.error(`⛔ Form #${this.config. formId} not found`);
            return;
        }

        this._bindSubmit();
        
        if (this.state. isUpdateMode) {
            this. loadData();
        }
        
        // Hook cho class con override
        if (this.onAfterInit) {
            this.onAfterInit();
        }
    }

    /**
     * Bind sự kiện submit
     */
    _bindSubmit() {
        if (this.submitBtn) {
            this.submitBtn. addEventListener('click', (e) => {
                e.preventDefault();
                this. submit();
            });
        }
        
        // Chặn Enter submit form (trừ textarea)
        if (this.form) {
            this. form.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && e.target. tagName !== 'TEXTAREA') {
                    e.preventDefault();
                }
            });
        }
    }

    /**
     * Load dữ liệu khi Update mode
     */
    async loadData() {
        try {
            const url = this.config. apiUrls.detail(this.state. currentId);
            const res = await AppUtils. API.get(url);
            
            if (res. success) {
                this.config.fillFormData(res.data);
            } else {
                AppUtils. Notify.error(res.message || "Không thể tải dữ liệu");
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
        if (! this.form.checkValidity()) {
            this.form.reportValidity();
            return;
        }

        // Build payload
        const payload = this.config. buildPayload();
        
        // Custom validation
        const errorMsg = this.config. validateLogic(payload);
        if (errorMsg) {
            AppUtils. Notify.error(errorMsg);
            return;
        }

        this._setLoading(true);

        try {
            let res;
            if (this.state. isUpdateMode) {
                const url = this.config.apiUrls. update(this.state.currentId);
                res = await AppUtils.API.put(url, payload);
            } else {
                const url = this.config.apiUrls.create;
                res = await AppUtils.API. post(url, payload);
            }

            if (res. success) {
                AppUtils.Notify. success(res.message || "Lưu thành công!");
                this.config.onSuccess(res);
            } else {
                AppUtils.Notify.error(res. message || "Có lỗi xảy ra");
                this._setLoading(false);
            }
        } catch (err) {
            console.error('⛔ Submit error:', err);
            AppUtils.Notify. error("Lỗi hệ thống: " + (err.message || err));
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
            this. submitBtn.dataset.originalText = this.submitBtn.innerHTML;
            this. submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Đang lưu...';
        } else {
            this.submitBtn. disabled = false;
            if (this.submitBtn.dataset.originalText) {
                this.submitBtn.innerHTML = this.submitBtn.dataset.originalText;
            }
        }
    }

    // ============================================================
    // HELPER METHODS - Class con có thể dùng hoặc không
    // ============================================================
    
    /**
     * Helper: Set giá trị input và trigger event
     */
    setFieldValue(name, value) {
        const el = this.form. querySelector(`[name="${name}"]`);
        if (el) {
            el.value = value !== null && value !== undefined ? value : '';
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }

    /**
     * Helper: Lấy giá trị input
     */
    getFieldValue(name) {
        const el = this.form.querySelector(`[name="${name}"]`);
        return el ? el.value : '';
    }

    /**
     * Helper: Ẩn/hiện block theo điều kiện
     * Class con có thể gọi nếu cần
     */
    toggleBlock(blockId, show, disableInputs = true) {
        const block = document.getElementById(blockId);
        if (! block) return;

        if (show) {
            block. classList.remove('hidden');
        } else {
            block.classList.add('hidden');
        }

        if (disableInputs) {
            block.querySelectorAll('input, select, textarea').forEach(input => {
                input.disabled = ! show;
            });
        }
    }
}

window.BaseFormManager = BaseFormManager;