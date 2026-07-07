// ============================================================
// SALARY COLUMN SELECTOR - Component chọn cột bảng lương
// Dùng cho popup chọn phần tử lương dạng tree checkbox theo nhóm
// ============================================================
class SalaryColumnSelector {
    /**
     * @param {Object} config
     * @param {string}   config.modalId        - ID modal element (default: 'salary-columns-modal')
     * @param {string}   config.apiEndpoint    - API lấy danh sách phần tử lương theo nhóm
     * @param {Object}   config.apiParams      - Params gửi kèm API call
     * @param {Function} config.onApply        - Callback khi nhấn xác nhận: (selectedItems) => void
     * @param {number[]} config.preselectedIds - Danh sách ID đã chọn sẵn
     */
    constructor(config = {}) {
        this.config = {
            modalId: 'salary-columns-modal',
            apiEndpoint: '/hrm/quan-ly-luong/api/phan-tu-luong/list',
            apiParams: { is_group: true, page_size: 9999 },
            onApply: () => {},
            preselectedIds: [],
            ...config
        };

        this.modal = document.getElementById(this.config.modalId);
        if (!this.modal) {
            console.warn(`[SalaryColumnSelector] Modal #${this.config.modalId} not found`);
            return;
        }

        this.treeContainer = this.modal.querySelector('[data-tree-container]');
        this.groupTemplate = document.querySelector(`template[data-tree-group-template="${this.config.modalId}"]`);

        // State
        this.elementsMap = new Map();    // id -> element data
        this.groupsData = [];            // Raw groups data từ API
        this.selectedIds = new Set(this.config.preselectedIds.map(Number));
        this.isLoaded = false;

        // Event management
        this.eventManager = AppUtils.EventManager.create();

        this._initEvents();
    }

    // --- INITIALIZATION ---

    _initEvents() {
        // Close buttons
        const closeBtns = this.modal.querySelectorAll('[data-modal-close]');
        this.eventManager.addMultiple(closeBtns, 'click', () => this.close());

        // Submit button
        const submitBtn = this.modal.querySelector('[data-modal-submit]');
        if (submitBtn) {
            this.eventManager.add(submitBtn, 'click', () => this._handleConfirm());
        }
    }

    // --- PUBLIC API ---

    /**
     * Mở modal và hiển thị danh sách.
     * @param {number[]} [preselectedIds] - Ghi đè danh sách ID đã chọn
     */
    async open(preselectedIds) {
        if (!this.modal) return;

        // Cập nhật preselected nếu truyền vào
        if (Array.isArray(preselectedIds)) {
            this.selectedIds = new Set(preselectedIds.map(Number));
        }

        // Load data lần đầu hoặc re-render nếu đã load
        if (!this.isLoaded) {
            await this.loadData();
        } else {
            this._syncCheckboxes();
        }

        AppUtils.Modal.open(this.modal);
    }

    /**
     * Đóng modal
     */
    close() {
        if (this.modal) AppUtils.Modal.close(this.modal);
    }

    /**
     * Load dữ liệu từ API và render tree
     */
    async loadData() {
        if (!this.treeContainer) return;

        this.treeContainer.innerHTML = '<div class="text-center text-slate-500 py-4"><i class="fas fa-spinner fa-spin"></i> Đang tải danh sách...</div>';

        try {
            const res = await AppUtils.API.get(this.config.apiEndpoint, this.config.apiParams);
            this.groupsData = res.data || res || [];
            this._renderTree();
            this.isLoaded = true;
        } catch (err) {
            console.error('[SalaryColumnSelector] Load error:', err);
            this.treeContainer.innerHTML = '<div class="text-center text-red-500 py-4"><i class="fas fa-exclamation-triangle"></i> Lỗi tải danh sách</div>';
        }
    }

    /**
     * Lấy danh sách items đã chọn
     * @returns {Array<{id: number, code: string, name: string}>}
     */
    getSelectedItems() {
        if (!this.treeContainer) return [];

        const checkboxes = this.treeContainer.querySelectorAll('.element-checkbox:checked');
        return Array.from(checkboxes).map(cb => ({
            id: Number(cb.value),
            code: cb.dataset.code,
            name: cb.dataset.name
        }));
    }

    /**
     * Cập nhật danh sách preselected và sync UI
     * @param {number[]} ids
     */
    setPreselectedIds(ids) {
        this.selectedIds = new Set((ids || []).map(Number));
        if (this.isLoaded) {
            this._syncCheckboxes();
        }
    }

    /**
     * Cleanup tất cả event listeners
     */
    destroy() {
        this.eventManager.removeAll();
    }

    // --- PRIVATE: RENDERING ---

    _renderTree() {
        if (!this.groupTemplate || !this.treeContainer) return;

        this.treeContainer.innerHTML = '';
        const groups = Array.isArray(this.groupsData) ? this.groupsData : Object.values(this.groupsData);

        groups.forEach(group => {
            if (!group.elements?.length) return;

            const clone = this.groupTemplate.content.cloneNode(true);
            const root = clone.querySelector('.group-item');

            // Tên nhóm
            clone.querySelector('.group-name').textContent = group.nhomphantu_ten || group.tennhom;

            // Group checkbox
            const groupCheckbox = clone.querySelector('.group-checkbox');
            groupCheckbox.dataset.groupId = group.nhomphantu || group.id;
            this.eventManager.add(groupCheckbox, 'change', () => this._handleGroupCheck(groupCheckbox));

            // Header click → toggle expand/collapse
            const headerEl = clone.querySelector('.group-header');
            this.eventManager.add(headerEl, 'click', (e) => {
                if (!e.target.closest('input')) this._toggleGroup(headerEl);
            });

            // Children
            const childContainer = clone.querySelector('.children-container');
            group.elements.forEach(el => {
                this.elementsMap.set(el.id, el);
                const isPreselected = this.selectedIds.has(Number(el.id));
                const childItem = this._createElementItem(el, isPreselected);
                this.eventManager.add(childItem.querySelector('input'), 'change', () => this._updateGroupState(root));
                childContainer.appendChild(childItem);
            });

            this._updateGroupState(root);
            this.treeContainer.appendChild(clone);
        });
    }

    _createElementItem(el, isChecked = false) {
        const div = document.createElement('div');
        div.className = 'flex items-center gap-3 py-1.5 hover:bg-slate-100 px-2 rounded cursor-pointer';
        div.innerHTML = `
            <input type="checkbox" 
                   class="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 element-checkbox"
                   value="${el.id}" data-code="${el.maphantu}" data-name="${el.tenphantu}"
                   ${isChecked ? 'checked' : ''}>
            <div class="flex flex-col">
                <span class="text-sm text-slate-700 font-medium">${el.tenphantu}</span>
                <span class="text-xs text-slate-400 font-mono">${el.maphantu}</span>
            </div>
        `;
        return div;
    }

    // --- PRIVATE: INTERACTIONS ---

    _toggleGroup(headerEl) {
        const arrow = headerEl.querySelector('.group-arrow');
        const container = headerEl.nextElementSibling;
        if (container) container.classList.toggle('hidden');
        if (arrow) arrow.classList.toggle('rotate-90');
    }

    _handleGroupCheck(groupCb) {
        const root = groupCb.closest('.group-item');
        if (!root) return;
        root.querySelectorAll('.element-checkbox').forEach(cb => cb.checked = groupCb.checked);
    }

    _updateGroupState(rootElement) {
        const groupCb = rootElement.querySelector('.group-checkbox');
        const children = Array.from(rootElement.querySelectorAll('.element-checkbox'));
        const checkedCount = children.filter(c => c.checked).length;
        groupCb.checked = checkedCount === children.length;
        groupCb.indeterminate = checkedCount > 0 && checkedCount < children.length;
    }

    _syncCheckboxes() {
        if (!this.treeContainer) return;
        const groupRoots = new Set();

        this.treeContainer.querySelectorAll('.element-checkbox').forEach(cb => {
            cb.checked = this.selectedIds.has(Number(cb.value));
            const root = cb.closest('.group-item');
            if (root) groupRoots.add(root);
        });

        groupRoots.forEach(root => this._updateGroupState(root));
    }

    _handleConfirm() {
        const selectedItems = this.getSelectedItems();
        // Cập nhật internal state
        this.selectedIds = new Set(selectedItems.map(item => item.id));
        // Gọi callback
        this.config.onApply(selectedItems);
        this.close();
    }
}

// Export global
window.SalaryColumnSelector = SalaryColumnSelector;
