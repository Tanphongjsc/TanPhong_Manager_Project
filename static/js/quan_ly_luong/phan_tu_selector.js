/**
 * PhanTuSelectorController - Modal chọn phần tử lương
 * Version: 1.0
 */
class PhanTuSelectorController {
    constructor() {
        this.modalId = 'phan-tu-selector-modal';
        this.modal = document.getElementById(this.modalId);
        
        // State
        this.phanTuList = [];
        this.filteredList = [];
        this.selectedIds = new Set();
        this.excludeIds = [];
        this.fixedElementCode = null; // Mã phần tử cố định cần loại trừ
        this.groups = [];
        this.onConfirmCallback = null;

        // DOM
        this.searchInput = document.getElementById('phan-tu-search');
        this.groupFilter = document.getElementById('phan-tu-group-filter');
        this.listContainer = document.getElementById('phan-tu-list');
        this.loadingEl = document.getElementById('phan-tu-loading');
        this.emptyEl = document.getElementById('phan-tu-empty');
        this.countEl = document.getElementById('phan-tu-selected-count');
        this.btnClear = document.getElementById('btn-clear-phan-tu');
        this.template = document.getElementById('tpl-phan-tu-item');

        this.init();
    }

    init() {
        this.bindEvents();
        this.bindGlobalEvent();
    }

    bindEvents() {
        // Search với debounce
        if (this.searchInput) {
            this.searchInput.addEventListener('input', 
                AppUtils.Helper.debounce(() => this.filterAndRender(), 300)
            );
        }

        // Filter by group
        if (this.groupFilter) {
            this.groupFilter.addEventListener('change', () => this.filterAndRender());
        }

        // Clear selection
        if (this.btnClear) {
            this.btnClear.addEventListener('click', () => this.clearSelection());
        }

        // Submit button
        const submitBtn = this.modal?.querySelector('[data-modal-submit]');
        if (submitBtn) {
            submitBtn.addEventListener('click', () => this.confirm());
        }

        // Close buttons
        this.modal?.querySelectorAll('[data-modal-close]').forEach(btn => {
            btn.addEventListener('click', () => this.close());
        });

        // Checkbox delegate
        if (this.listContainer) {
            this.listContainer.addEventListener('change', (e) => {
                if (e.target.classList.contains('phan-tu-checkbox')) {
                    this.handleCheckboxChange(e.target);
                }
            });
        }
    }

    bindGlobalEvent() {
        // Lắng nghe event từ QuyTacManager
        document.addEventListener('openPhanTuSelector', (e) => {
            this.excludeIds = e.detail.excludeIds || [];
            this.fixedElementCode = e.detail.fixedElementCode || null;
            this.onConfirmCallback = e.detail.onConfirm;
            this.open();
        });
    }

    // ============================================================
    // MODAL CONTROL
    // ============================================================

    async open() {
        if (!this.modal) return;

        this.selectedIds.clear();
        this.updateSelectedCount();

        // Show modal
        AppUtils.Modal.open(this.modal);

        // Load data
        await this.loadData();
    }

    close() {
        if (this.modal) {
            AppUtils.Modal.close(this.modal);
        }
    }

    confirm() {
        const selected = this.phanTuList.filter(pt => this.selectedIds.has(pt.id));
        
        if (selected.length === 0) {
            AppUtils.Notify.warning('Vui lòng chọn ít nhất một phần tử');
            return;
        }

        if (this.onConfirmCallback) {
            this.onConfirmCallback(selected);
        }

        this.close();
    }

    // ============================================================
    // DATA LOADING
    // ============================================================

    async loadData() {
        this.showLoading(true);

        try {
            const res = await AppUtils.API.get('/hrm/quan-ly-luong/api/phan-tu-luong/list', {
                page_size: 999 // Lấy tất cả
            });

            if (res.success) {
                this.phanTuList = res.data || [];
                
                // Filter exclude
                this.phanTuList = this.phanTuList.filter(
                    pt => !this.excludeIds.includes(pt.id)
                );

                // Filter exclude phần tử cố định (THUC_LINH)
                if (this.fixedElementCode) {
                    this.phanTuList = this.phanTuList.filter(
                        pt => pt.maphantu !== this.fixedElementCode
                    );
                }
                
                // Extract groups
                this.extractGroups();
                this.renderGroupFilter();
                this.filterAndRender();
            } else {
                AppUtils.Notify.error(res.message || 'Không thể tải dữ liệu');
            }
        } catch (e) {
            console.error('Load phan tu error:', e);
            AppUtils.Notify.error('Lỗi khi tải danh sách phần tử');
        } finally {
            this.showLoading(false);
        }
    }

    extractGroups() {
        const groupMap = new Map();
        this.phanTuList.forEach(pt => {
            if (pt.nhomphantu && !groupMap.has(pt.nhomphantu)) {
                groupMap.set(pt.nhomphantu, pt.nhomphantu_ten || `Nhóm ${pt.nhomphantu}`);
            }
        });
        this.groups = Array.from(groupMap, ([id, name]) => ({ id, name }));
    }

    renderGroupFilter() {
        if (!this.groupFilter) return;

        let html = '<option value="">Tất cả nhóm</option>';
        this.groups.forEach(g => {
            html += `<option value="${g.id}">${g.name}</option>`;
        });
        this.groupFilter.innerHTML = html;
    }

    // ============================================================
    // FILTER & RENDER
    // ============================================================

    filterAndRender() {
        const search = (this.searchInput?.value || '').toLowerCase().trim();
        const groupId = this.groupFilter?.value || '';

        this.filteredList = this.phanTuList.filter(pt => {
            // Search filter
            const matchSearch = !search || 
                pt.tenphantu?.toLowerCase().includes(search) ||
                pt.maphantu?.toLowerCase().includes(search);

            // Group filter
            const matchGroup = !groupId || String(pt.nhomphantu) === groupId;

            return matchSearch && matchGroup;
        });

        this.renderList();
    }

    renderList() {
        if (!this.listContainer || !this.template) return;

        this.listContainer.innerHTML = '';

        if (this.filteredList.length === 0) {
            this.showEmpty(true);
            return;
        }

        this.showEmpty(false);

        const fragment = document.createDocumentFragment();

        this.filteredList.forEach(pt => {
            const clone = this.template.content.cloneNode(true);
            const label = clone.querySelector('label');
            const checkbox = clone.querySelector('.phan-tu-checkbox');

            // Set data
            checkbox.value = pt.id;
            checkbox.checked = this.selectedIds.has(pt.id);

            clone.querySelector('[data-field="tenphantu"]').textContent = pt.tenphantu;
            clone.querySelector('[data-field="maphantu"]').textContent = pt.maphantu;
            clone.querySelector('[data-field="nhomphantu_ten"]').textContent = pt.nhomphantu_ten || '-';

            // Loại phần tử badge
            const badgeEl = clone.querySelector('[data-field="loaiphantu_badge"]');
            const loaiConfig = this.getLoaiBadgeConfig(pt.loaiphantu);
            badgeEl.textContent = loaiConfig.label;
            badgeEl.className = `px-1.5 py-0.5 rounded text-xs ${loaiConfig.class}`;

            fragment.appendChild(clone);
        });

        this.listContainer.appendChild(fragment);
    }

    getLoaiBadgeConfig(loai) {
        const configs = {
            'income': { label: 'Thu nhập', class: 'bg-green-100 text-green-700' },
            'deduction': { label: 'Khấu trừ', class: 'bg-red-100 text-red-700' },
            'parameter': { label: 'Tham số', class: 'bg-blue-100 text-blue-700' }
        };
        return configs[loai] || { label: loai || '-', class: 'bg-slate-100 text-slate-600' };
    }

    // ============================================================
    // SELECTION
    // ============================================================

    handleCheckboxChange(checkbox) {
        const id = parseInt(checkbox.value, 10);
        
        if (checkbox.checked) {
            this.selectedIds.add(id);
        } else {
            this.selectedIds.delete(id);
        }

        this.updateSelectedCount();
    }

    clearSelection() {
        this.selectedIds.clear();
        this.listContainer?.querySelectorAll('.phan-tu-checkbox').forEach(cb => {
            cb.checked = false;
        });
        this.updateSelectedCount();
    }

    updateSelectedCount() {
        if (this.countEl) {
            this.countEl.textContent = this.selectedIds.size;
        }
    }

    // ============================================================
    // UI HELPERS
    // ============================================================

    showLoading(show) {
        if (this.loadingEl) {
            this.loadingEl.classList.toggle('hidden', !show);
        }
        if (this.listContainer) {
            this.listContainer.classList.toggle('hidden', show);
        }
    }

    showEmpty(show) {
        if (this.emptyEl) {
            this.emptyEl.classList.toggle('hidden', !show);
        }
    }
}

// Auto init
document.addEventListener('DOMContentLoaded', () => {
    window.phanTuSelectorController = new PhanTuSelectorController();
});