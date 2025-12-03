/**
 * InlineEditor Component (Global Footer Version)
 */
class InlineEditor {
    constructor(cfg) {
        this.cfg = { 
            // Các config bắt buộc
            formId: null, 
            containerId: null, 
            triggerBtnId: null,
            apiUrl: null,
            
            // Config Global Footer (Mặc định dùng chung ID này)
            globalFooterId: 'global-edit-footer',
            globalSaveBtnId: 'btn-global-save',
            
            ...cfg 
        };
        
        this.els = {
            container: document.getElementById(this.cfg.containerId),
            form: document.getElementById(this.cfg.formId),
            btnTrigger: document.getElementById(this.cfg.triggerBtnId),
            
            // Global Elements
            footer: document.getElementById(this.cfg.globalFooterId),
            btnSave: document.getElementById(this.cfg.globalSaveBtnId),
        };

        // Lưu binded function để có thể removeEventListener nếu cần (tránh duplicate event khi switch tab)
        this.boundSave = this.handleSave.bind(this);
        this.boundCancel = this.handleCancel.bind(this);

        if (this.els.form) {
            this.init();
            this.injectStyles();
        }
    }

    injectStyles() {
        if (document.getElementById('inline-edit-style')) return;
        const style = document.createElement('style');
        style.id = 'inline-edit-style';
        style.innerHTML = `
            .editing-active .view-mode-content { display: none !important; }
            .editing-active .edit-mode-content { display: block !important; }
            .editing-active .detail-item-wrapper { border-color: #60a5fa; background-color: #fff; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); }
            .editing-active input:disabled { background-color: #f1f5f9; color: #64748b; }
        `;
        document.head.appendChild(style);
    }

    init() {
        // Sự kiện nút Trigger (Sửa)
        this.els.btnTrigger?.addEventListener('click', () => this.enterEditMode());
    }

    enterEditMode() {
        // 1. UI Changes cho Container
        this.els.container?.classList.add('editing-active');
        this.els.form?.classList.add('editing-active');
        this.els.btnTrigger?.classList.add('hidden');

        // 2. Setup Global Footer
        if (this.els.footer) {
            this.els.footer.classList.remove('hidden', 'translate-y-full');
            this.els.footer.classList.add('translate-y-0');
            
            // Animation nhẹ
            this.els.footer.firstElementChild?.classList.add('animate-fade-in-up');

            // 3. GÁN SỰ KIỆN CHO GLOBAL FOOTER (Quan trọng: Xóa cũ trước khi gán mới)
            // Clone nút Save để xóa sạch các event listener từ Editor của tab khác
            const oldBtnSave = this.els.btnSave;
            const newBtnSave = oldBtnSave.cloneNode(true);
            oldBtnSave.parentNode.replaceChild(newBtnSave, oldBtnSave);
            this.els.btnSave = newBtnSave;

            // Gán sự kiện Save cho Form hiện tại
            this.els.btnSave.addEventListener('click', this.boundSave);

            // Xử lý nút Hủy (Tìm thẻ a href="#")
            const btnCancel = this.els.footer.querySelector('a[href="#"]');
            if (btnCancel) {
                // Tương tự, clone để reset event hủy
                const newBtnCancel = btnCancel.cloneNode(true);
                btnCancel.parentNode.replaceChild(newBtnCancel, btnCancel);
                
                newBtnCancel.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.handleCancel();
                });
            }
        }
    }

    handleCancel() {
        // Reset UI
        this.els.container?.classList.remove('editing-active');
        this.els.form?.classList.remove('editing-active');
        this.els.btnTrigger?.classList.remove('hidden');
        
        // Ẩn Footer
        this.els.footer?.classList.add('hidden', 'translate-y-full');
        this.els.footer?.classList.remove('translate-y-0');

        // Reset Form Data
        this.els.form?.reset();
    }

    async handleSave() {
        const btn = this.els.btnSave;
        const oldContent = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = `<i class="fas fa-circle-notch fa-spin mr-2"></i>Đang lưu...`;

        try {
            const formData = new FormData(this.els.form);
            const data = Object.fromEntries(formData.entries());

            // API Call
            await AppUtils.API.patch(this.cfg.apiUrl, data);

            AppUtils.Notify.success('Cập nhật thành công');
            
            // Reload page sau khi lưu thành công
            setTimeout(() => window.location.reload(), 500);

        } catch (e) {
            console.error(e);
            AppUtils.Notify.error(e.message || 'Lỗi khi lưu dữ liệu');
            btn.disabled = false;
            btn.innerHTML = oldContent;
        }
    }
}