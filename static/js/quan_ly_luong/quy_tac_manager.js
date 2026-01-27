/**
 * QuyTacManager - Quản lý bảng quy tắc chế độ lương
 * Version: 1.0
 */
class QuyTacManager {
    constructor(options = {}) {
        this.options = {
            tbodyId: 'quy-tac-tbody',
            emptyId: 'quy-tac-empty',
            countId: 'quy-tac-count',
            hiddenInputId: 'hidden-quy-tac-data',
            btnAddId: 'btn-add-quy-tac',
            ...options
        };

        // State
        this.quyTacList = []; // [{id, phantuluong_id, tenphantu, maphantu, nguondulieu, bieuthuc, ...}]
        
        // DOM Elements
        this.tbody = document.getElementById(this.options.tbodyId);
        this.emptyState = document.getElementById(this.options.emptyId);
        this.countEl = document.getElementById(this.options.countId);
        this.hiddenInput = document.getElementById(this.options.hiddenInputId);
        this.btnAdd = document.getElementById(this.options.btnAddId);

        // Nguồn dữ liệu options
        this.nguonDuLieuOptions = [
            { value: 'manual', label: 'Tự nhập' },
            { value: 'system', label: 'Từ hệ thống' },
            { value: 'formula', label: 'Công thức' }
        ];

        this.init();
    }

    init() {
        this.bindEvents();
        this.render();
    }

    bindEvents() {
        // Nút thêm mới
        if (this.btnAdd) {
            this.btnAdd.addEventListener('click', () => this.openPhanTuSelector());
        }

        // Delegate events cho tbody
        if (this.tbody) {
            this.tbody.addEventListener('change', (e) => this.handleRowChange(e));
            this.tbody.addEventListener('click', (e) => this.handleRowClick(e));
            this.tbody.addEventListener('input', (e) => this.handleRowInput(e));
        }
    }

    // ============================================================
    // RENDER
    // ============================================================

    render() {
        if (!this.tbody) return;

        this.tbody.innerHTML = '';

        if (this.quyTacList.length === 0) {
            this.showEmpty(true);
            this.updateCount();
            return;
        }

        this.showEmpty(false);
        
        const fragment = document.createDocumentFragment();
        this.quyTacList.forEach((item, index) => {
            fragment.appendChild(this.createRow(item, index));
        });
        
        this.tbody.appendChild(fragment);
        this.updateCount();
        this.syncHiddenInput();
    }

    createRow(item, index) {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50 transition-colors';
        tr.dataset.id = item.phantuluong_id;

        const nguonOptions = this.nguonDuLieuOptions.map(opt => 
            `<option value="${opt.value}" ${item.nguondulieu === opt.value ? 'selected' : ''}>${opt.label}</option>`
        ).join('');

        const isFormula = item.nguondulieu === 'formula';
        const isManual = item.nguondulieu === 'manual';
        const isSystem = item.nguondulieu === 'system';

        tr.innerHTML = `
            <td class="px-3 py-3 text-slate-600 text-center align-middle">${index + 1}</td>
            <td class="px-3 py-3 align-middle">
                <span class="font-medium text-slate-800">${this.escapeHtml(item.tenphantu)}</span>
            </td>
            <td class="px-3 py-3 align-middle">
                <code class="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-xs">${this.escapeHtml(item.maphantu)}</code>
            </td>
            <td class="px-3 py-3 align-middle">
                <select data-field="nguondulieu" class="w-full px-2 py-1.5 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                    ${nguonOptions}
                </select>
            </td>
            <td class="px-3 py-3 align-middle">
                <div class="value-container">
                    ${isFormula ? `
                        <input type="text" 
                            data-field="bieuthuc" 
                            value="${this.escapeHtml(item.bieuthuc || '')}"
                            placeholder="VD: LUONG_CO_BAN * TKPI004"
                            class="w-full px-2 py-1.5 border border-slate-300 rounded text-sm font-mono focus:ring-2 focus:ring-blue-500">
                    ` : isManual ? `
                        <span class="text-slate-500 text-sm italic">
                            <i class="fas fa-keyboard mr-1"></i>Giá trị nhập thủ công khi tính lương
                        </span>
                    ` : `
                        <span class="text-slate-500 text-sm italic">
                            <i class="fas fa-database mr-1"></i>Lấy từ Thiết lập số liệu cố định
                        </span>
                    `}
                </div>
            </td>
            <td class="px-3 py-3 align-middle">
                <input type="text" 
                    data-field="mota" 
                    value="${this.escapeHtml(item.mota || '')}"
                    placeholder="Nhập mô tả..."
                    class="w-full px-2 py-1.5 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
            </td>
            <td class="px-3 py-3 text-center align-middle">
                ${isFormula ? `
                    <button type="button" data-action="test" class="px-2 py-1 text-xs text-blue-600 bg-blue-50 rounded hover:bg-blue-100 transition-colors inline-flex items-center justify-center" title="Kiểm thử công thức">
                        <i class="fas fa-play"></i>
                    </button>
                ` : `<span class="text-slate-300">-</span>`}
            </td>
            <td class="px-3 py-3 text-center align-middle">
                <button type="button" data-action="remove" class="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors inline-flex items-center justify-center" title="Xóa">
                    <i class="fas fa-times"></i>
                </button>
            </td>
        `;

        return tr;
    }

    showEmpty(show) {
        if (this.emptyState) {
            this.emptyState.classList.toggle('hidden', !show);
        }
        if (this.tbody) {
            this.tbody.classList.toggle('hidden', show);
        }
    }

    updateCount() {
        if (this.countEl) {
            this.countEl.textContent = this.quyTacList.length;
        }
    }

    syncHiddenInput() {
        if (this.hiddenInput) {
            this.hiddenInput.value = JSON.stringify(this.quyTacList);
        }
    }

    // ============================================================
    // EVENT HANDLERS
    // ============================================================

    handleRowChange(e) {
        const target = e.target;
        const row = target.closest('tr');
        if (!row) return;

        const id = row.dataset.id;
        const field = target.dataset.field;

        if (field === 'nguondulieu') {
            this.updateNguonDuLieu(id, target.value);
        }
    }

    handleRowInput(e) {
        const target = e.target;
        const row = target.closest('tr');
        if (!row) return;

        const id = row.dataset.id;
        const field = target.dataset.field;

        if (field === 'bieuthuc' || field === 'mota') {
            this.updateFieldValue(id, field, target.value);
        }
    }

    handleRowClick(e) {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;

        const action = btn.dataset.action;
        const row = btn.closest('tr');
        const id = row?.dataset.id;

        switch (action) {
            case 'remove':
                this.removeQuyTac(id);
                break;
            case 'test':
                this.testFormula(id);
                break;
        }
    }

    // ============================================================
    // CRUD OPERATIONS
    // ============================================================

    addQuyTac(phanTuList) {
        // phanTuList: [{id, tenphantu, maphantu, loaiphantu, nhomphantu_ten}]
        phanTuList.forEach(pt => {
            // Kiểm tra đã tồn tại chưa
            const exists = this.quyTacList.some(q => q.phantuluong_id === pt.id);
            if (exists) return;

            this.quyTacList.push({
                phantuluong_id: pt.id,
                tenphantu: pt.tenphantu,
                maphantu: pt.maphantu,
                nguondulieu: 'manual', // Mặc định
                bieuthuc: '',
                giatri: null
            });
        });

        this.render();
    }

    removeQuyTac(phantuluongId) {
        this.quyTacList = this.quyTacList.filter(q => String(q.phantuluong_id) !== String(phantuluongId));
        this.render();
    }

    updateNguonDuLieu(phantuluongId, value) {
        const item = this.quyTacList.find(q => String(q.phantuluong_id) === String(phantuluongId));
        if (item) {
            item.nguondulieu = value;
            // Reset giá trị khi đổi nguồn
            item.bieuthuc = '';
            
            this.render(); // Re-render để đổi input type
        }
    }

    updateFieldValue(phantuluongId, field, value) {
        const item = this.quyTacList.find(q => String(q.phantuluong_id) === String(phantuluongId));
        if (item) {
            item[field] = value;
            this.syncHiddenInput();
        }
    }

    testFormula(phantuluongId) {
        const item = this.quyTacList.find(q => String(q.phantuluong_id) === String(phantuluongId));
        if (!item || !item.bieuthuc) {
            AppUtils.Notify.warning('Vui lòng nhập công thức trước');
            return;
        }

        // Lấy danh sách mã phần tử làm biến
        const vars = this.quyTacList.map(q => q.maphantu);
        const result = AppUtils.Formula.validate(item.bieuthuc, vars);

        if (result.ok) {
            AppUtils.Notify.success('Công thức hợp lệ!');
        } else {
            AppUtils.Notify.error(`Lỗi công thức: ${result.msg}`);
        }
    }

    // ============================================================
    // PHẦN TỬ SELECTOR
    // ============================================================

    openPhanTuSelector() {
        // Trigger event để PhanTuSelectorController xử lý
        const event = new CustomEvent('openPhanTuSelector', {
            detail: {
                excludeIds: this.quyTacList.map(q => q.phantuluong_id),
                onConfirm: (selected) => this.addQuyTac(selected)
            }
        });
        document.dispatchEvent(event);
    }

    // ============================================================
    // DATA METHODS
    // ============================================================

    getData() {
        return this.quyTacList;
    }

    setData(data) {
        this.quyTacList = data || [];
        this.render();
    }

    clear() {
        this.quyTacList = [];
        this.render();
    }

    // ============================================================
    // UTILS
    // ============================================================

    escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
}

window.QuyTacManager = QuyTacManager;