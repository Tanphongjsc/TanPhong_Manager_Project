/**
 * BaseFormManager - Enhanced Version với HRM Patterns
 * File: static/js/utils/base_form_manager.js
 * Version: 2.0 (Thêm Dynamic Segments, Toggle Blocks, Input Constraints)
 */
class BaseFormManager {
    constructor(config) {
        if (typeof AppUtils === 'undefined') {
            throw new Error('AppUtils is required.');
        }

        this.config = {
            formId: 'main-form',
            submitBtnId: 'btn-save',
            
            // API
            apiUrls: {
                create: '',
                update: (id) => '',
                detail: (id) => '',
            },

            // Callbacks (Abstract - Class con override)
            buildPayload: () => ({}),
            validateLogic: () => null,
            fillFormData: (data) => {},
            onSuccess: () => {},
            
            // Regex lấy ID từ URL
            idParamRegex: /\/(\d+)\/update\//,
            
            // ✅ MỚI: Cấu hình cho Dynamic Segments (HRM Pattern)
            dynamicSegments: null,  // { containerId, segmentCount, templateFunction }
            
            // ✅ MỚI: Cấu hình cho Toggle Blocks (HRM Pattern - Loại ca)
            toggleBlocks: null,  // { radioName, blocks: { 'CO_DINH': 'block-co-dinh', ...  } }
            
            // ✅ MỚI: Input Constraints (HRM Pattern - Format mã, giới hạn số)
            inputConstraints: [],  // [{ selector: 'input[name="ma"]', type: 'uppercase', maxLength: 10 }]
            
            ... config
        };

        this. form = document.getElementById(this.config.formId);
        this.submitBtn = document.getElementById(this.config.submitBtnId);
        
        this.state = {
            isUpdateMode: false,
            currentId: null,
            isSubmitting: false
        };

        this._detectMode();
    }

    _detectMode() {
        const matches = window.location.pathname.match(this.config.idParamRegex);
        if (matches && matches[1]) {
            this.state.currentId = matches[1];
            this.state.isUpdateMode = true;
        }
    }

    init() {
        if (!this.form) {
            console.error(`Form #${this.config.formId} not found`);
            return;
        }

        this.bindEvents();
        this.setupInputConstraints();  // ✅ Áp dụng constraints
        
        if (this.state.isUpdateMode) {
            this.loadData();
        }
        
        if (this.onAfterInit) this.onAfterInit();
    }

    bindEvents() {
        if (this.submitBtn) {
            this.submitBtn.addEventListener('click', (e) => {
                e. preventDefault();
                this.submit();
            });
        }
        
        // ✅ MỚI: Bind Toggle Blocks nếu config
        if (this.config.toggleBlocks) {
            this.bindToggleBlocks();
        }
    }

    // ============================================================
    // ✅ MỚI: DYNAMIC SEGMENTS RENDERING (HRM Pattern)
    // ============================================================
    renderDynamicSegments(options) {
        const config = options || this.config. dynamicSegments;
        if (!config) return;
        
        const container = document. getElementById(config.containerId);
        if (!container) {
            console.warn(`Container #${config.containerId} not found`);
            return;
        }
        
        container.innerHTML = '';
        
        for (let i = 1; i <= config.segmentCount; i++) {
            const html = config.templateFunction(i, config.segmentCount);
            container.insertAdjacentHTML('beforeend', html);
        }
        
        // Callback sau khi render (e.g., attach time pickers)
        if (config. onAfterRender) {
            config.onAfterRender(container);
        }
    }

    // ============================================================
    // ✅ MỚI: TOGGLE BLOCKS VISIBILITY (HRM Pattern - Loại Ca)
    // ============================================================
    bindToggleBlocks() {
        const config = this.config.toggleBlocks;
        const radios = document.querySelectorAll(`input[name="${config.radioName}"]`);
        
        radios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.switchBlock(e.target. value);
            });
        });
    }

    switchBlock(selectedValue) {
        const config = this.config.toggleBlocks;
        
        // Ẩn tất cả blocks
        Object.values(config.blocks).forEach(blockId => {
            const block = document.getElementById(blockId);
            if (block) {
                block.classList.add('hidden');
                this.toggleBlockInputs(blockId, false);  // Disable inputs
            }
        });
        
        // Hiện block được chọn
        const activeBlockId = config.blocks[selectedValue];
        if (activeBlockId) {
            const activeBlock = document.getElementById(activeBlockId);
            if (activeBlock) {
                activeBlock.classList.remove('hidden');
                this.toggleBlockInputs(activeBlockId, true);  // Enable inputs
            }
        }
        
        // Callback (e.g., tính toán lại công)
        if (config.onSwitch) {
            config.onSwitch(selectedValue);
        }
    }

    toggleBlockInputs(blockId, enable) {
        const block = document.getElementById(blockId);
        if (! block) return;
        
        block.querySelectorAll('input, select, textarea').forEach(input => {
            input.disabled = !enable;
        });
    }

    // ============================================================
    // ✅ MỚI: INPUT CONSTRAINTS (HRM Pattern - Format, Validate)
    // ============================================================
    setupInputConstraints() {
        if (!this.config.inputConstraints || this.config.inputConstraints. length === 0) return;
        
        this.config.inputConstraints.forEach(constraint => {
            const inputs = this.form.querySelectorAll(constraint.selector);
            
            inputs.forEach(input => {
                input.addEventListener('input', (e) => {
                    let val = e.target.value;
                    
                    // Type: uppercase (e.g., mã ca)
                    if (constraint. type === 'uppercase') {
                        val = val.toUpperCase(). replace(/[^A-Z0-9_]/g, '');
                    }
                    
                    // Type: number (giới hạn độ dài)
                    if (constraint.type === 'number' && constraint.maxLength) {
                        if (val.length > constraint.maxLength) {
                            val = val.slice(0, constraint. maxLength);
                        }
                    }
                    
                    // Type: custom regex
                    if (constraint.regex) {
                        val = val.replace(constraint.regex, '');
                    }
                    
                    e.target.value = val;
                });
            });
        });
    }

    // ============================================================
    // LOAD DATA (Existing - Không đổi)
    // ============================================================
    async loadData() {
        try {
            const url = this.config.apiUrls.detail(this.state.currentId);
            const res = await AppUtils.API.get(url);
            
            if (res.success) {
                this.config.fillFormData(res.data);
            } else {
                AppUtils. Notify.error(res.message || "Không thể tải dữ liệu");
            }
        } catch (err) {
            console.error(err);
            AppUtils. Notify.error("Lỗi kết nối khi tải dữ liệu");
        }
    }

    // ============================================================
    // SUBMIT (Existing - Không đổi)
    // ============================================================
    async submit() {
        if (this.state.isSubmitting) return;

        if (!this.form. checkValidity()) {
            this.form.reportValidity();
            return;
        }

        const payload = this.config.buildPayload();
        const errorMsg = this.config.validateLogic(payload);
        if (errorMsg) {
            AppUtils.Notify.error(errorMsg);
            return;
        }

        this._setLoading(true);
        
        try {
            let res;
            if (this. state.isUpdateMode) {
                const url = this.config.apiUrls.update(this.state. currentId);
                res = await AppUtils.API.put(url, payload);
            } else {
                const url = this.config.apiUrls.create;
                res = await AppUtils.API.post(url, payload);
            }

            if (res.success) {
                AppUtils.Notify.success(res.message || "Lưu thành công!");
                this.config.onSuccess();
            } else {
                AppUtils. Notify.error(res.message || "Có lỗi xảy ra");
                this._setLoading(false);
            }
        } catch (err) {
            console.error(err);
            AppUtils.Notify.error("Lỗi hệ thống: " + (err.message || err));
            this._setLoading(false);
        }
    }

    _setLoading(isLoading) {
        this.state.isSubmitting = isLoading;
        if (! this.submitBtn) return;

        if (isLoading) {
            this.submitBtn.disabled = true;
            this.submitBtn. dataset.originalText = this.submitBtn.innerHTML;
            this.submitBtn. innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Đang lưu...';
        } else {
            this.submitBtn. disabled = false;
            if (this.submitBtn.dataset. originalText) {
                this.submitBtn. innerHTML = this.submitBtn.dataset.originalText;
            }
        }
    }
}

window.BaseFormManager = BaseFormManager;