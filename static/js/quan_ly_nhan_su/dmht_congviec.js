/**
 * File: dmht_congviec.js
 * Quản lý công việc với hỗ trợ công thức nâng cao
 */

class CongViecManager extends BaseCRUDManager {
    constructor() {
        super({
            sidebarId: 'cv-sidebar',
            overlayId: 'cv-sidebar-overlay',
            formId: 'congviec-form',
            codeField: 'MaCongViec',
            autoCode: { sourceField: 'TenCongViec', targetField: 'MaCongViec' },
            apiUrls: {
                detail: (id) => `/hrm/to-chuc-nhan-su/api/cong-viec/${id}/detail/`,
                create: '/hrm/to-chuc-nhan-su/api/cong-viec/create/',
                update: (id) => `/hrm/to-chuc-nhan-su/api/cong-viec/${id}/update/`,
                delete: (id) => `/hrm/to-chuc-nhan-su/api/cong-viec/${id}/delete/`,
                toggleStatus: (id) => `/hrm/to-chuc-nhan-su/api/cong-viec/${id}/toggle-status/`,
            },
            entityName: 'công việc',
            onRefreshTable: () => this.tableManager?.refresh(),
            fillFormData: (data) => this.fillFormData(data),
            onResetForm: () => this.resetFormState()
        });

        this.tableManager = null;
        this.thamSoList = [];
    }

    init() {
        super.init();
        this.initTable();
        this.initFormulaBuilder();
    }

    // ========== FORM ==========
    fillFormData(data) {
        const form = document.getElementById('congviec-form');
        if (!form) return;

        const setVal = (name, val) => {
            const el = form.querySelector(`[name="${name}"]`);
            if (el) el.value = val ?? '';
        };

        setVal('id', data.id);
        setVal('TenCongViec', data.tencongviec);
        setVal('MaCongViec', data.macongviec);
        setVal('LoaiCongViec', data.loaicongviec);
        setVal('MoTa', data.mota);
        setVal('GhiChu', data.ghichu);
        setVal('BieuThucTinhToan', data.bieuthuctinhtoan);

        // Toggle
        const toggle = document.getElementById('toggle-congthuc');
        const isOn = data.trangthaicongthuc === 'on';
        if (toggle) {
            toggle.checked = isOn;
            this.toggleSection(isOn);
        }

        // Load tham số
        let thamSo = [];
        if (data.danhsachthamso) {
            try {
                thamSo = typeof data.danhsachthamso === 'string' 
                    ? JSON.parse(data.danhsachthamso) 
                    : data.danhsachthamso;
            } catch (e) {}
        }
        this.loadThamSo(thamSo);
        this.updatePreview();
    }

    resetFormState() {
        const form = document.getElementById('congviec-form');
        if (form) {
            form.reset();
            form.querySelector('[name="id"]')?.setAttribute('value', '');
        }

        const toggle = document.getElementById('toggle-congthuc');
        if (toggle) {
            toggle.checked = false;
            this.toggleSection(false);
        }

        this.thamSoList = [];
        this.renderThamSo();
        this.updateParamButtons();
        
        const input = document.getElementById('formula-input');
        if (input) input.value = '';
        this.updatePreview();
    }

    // ========== FORMULA BUILDER ==========
    initFormulaBuilder() {
        // Toggle section
        document.getElementById('toggle-congthuc')?.addEventListener('change', (e) => {
            this.toggleSection(e.target.checked);
        });

        // Thêm tham số
        document.getElementById('btn-add-thamso')?.addEventListener('click', () => this.addThamSo());

        // Container events
        const container = document.getElementById('thamso-container');
        if (container) {
            container.addEventListener('click', (e) => {
                if (e.target.closest('.btn-remove-thamso')) {
                    const row = e.target.closest('.thamso-row');
                    this.removeThamSo(parseInt(row.dataset.index));
                }
            });

            container.addEventListener('input', (e) => {
                const row = e.target.closest('.thamso-row');
                if (!row) return;

                if (e.target.classList.contains('thamso-ten')) {
                    row.querySelector('.thamso-ma').value = this.genMa(e.target.value);
                }
                this.syncThamSo();
            });

            container.addEventListener('change', () => this.syncThamSo());
        }

        // Formula buttons
        document.querySelectorAll('.formula-btn').forEach(btn => {
            btn.addEventListener('click', () => this.insertFormula(btn.dataset.insert));
        });

        // Param buttons (delegation)
        document.getElementById('formula-params')?.addEventListener('click', (e) => {
            const btn = e.target.closest('.formula-param-btn');
            if (btn) this.insertFormula(btn.dataset.param);
        });

        // Clear
        document.getElementById('btn-formula-clear')?.addEventListener('click', () => {
            const input = document.getElementById('formula-input');
            if (input) input.value = '';
            this.updatePreview();
        });

        // Preview on input
        document.getElementById('formula-input')?.addEventListener('input', () => this.updatePreview());
    }

    toggleSection(show) {
        document.getElementById('formula-section')?.classList.toggle('hidden', !show);
    }

    // ========== THAM SỐ ==========
    addThamSo() {
        this.thamSoList.push({ ten: '', ma: '', donvi: '', kieu: 'number', giatri_macdinh: '' });
        this.renderThamSo();
        
        setTimeout(() => {
            const rows = document.querySelectorAll('.thamso-row');
            rows[rows.length - 1]?.querySelector('.thamso-ten')?.focus();
        }, 50);
    }

    removeThamSo(index) {
        this.thamSoList.splice(index, 1);
        this.renderThamSo();
        this.updateParamButtons();
        this.updateHiddenJson();
    }

    renderThamSo() {
        const container = document.getElementById('thamso-container');
        const empty = document.getElementById('thamso-empty');
        const template = document.getElementById('thamso-row-template');
        if (!container || !template) return;

        container.innerHTML = '';

        if (this.thamSoList.length === 0) {
            empty?.classList.remove('hidden');
            this.updateParamButtons();
            return;
        }

        empty?.classList.add('hidden');

        this.thamSoList.forEach((item, i) => {
            const clone = template.content.cloneNode(true);
            const row = clone.querySelector('.thamso-row');
            
            row.dataset.index = i;
            row.querySelector('.thamso-ten').value = item.ten || '';
            row.querySelector('.thamso-ma').value = item.ma || '';
            row.querySelector('.thamso-donvi').value = item.donvi || '';
            row.querySelector('.thamso-kieu').value = item.kieu || 'number';
            row.querySelector('.thamso-default').value = item.giatri_macdinh || '';

            container.appendChild(clone);
        });

        this.updateParamButtons();
    }

    loadThamSo(data) {
        this.thamSoList = Array.isArray(data) ? data : [];
        this.renderThamSo();
        this.updateHiddenJson();
    }

    syncThamSo() {
        this.thamSoList = [];
        document.querySelectorAll('.thamso-row').forEach(row => {
            this.thamSoList.push({
                ten: row.querySelector('.thamso-ten').value.trim(),
                ma: row.querySelector('.thamso-ma').value.trim(),
                donvi: row.querySelector('.thamso-donvi').value.trim(),
                kieu: row.querySelector('.thamso-kieu').value,
                giatri_macdinh: row.querySelector('.thamso-default').value.trim()
            });
        });
        this.updateParamButtons();
        this.updateHiddenJson();
    }

    updateHiddenJson() {
        const hidden = document.getElementById('hidden-thamso-json');
        if (hidden) hidden.value = JSON.stringify(this.thamSoList);
    }

    genMa(ten) {
        if (!ten) return '';
        return ten.toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/đ/g, 'd')
            .replace(/[^a-z0-9\s]/g, '')
            .replace(/\s+/g, '_')
            .substring(0, 20);
    }

    // ========== FORMULA ==========
    updateParamButtons() {
        const container = document.getElementById('formula-params');
        if (!container) return;

        const valid = this.thamSoList.filter(p => p.ma && p.ten);

        if (valid.length === 0) {
            container.innerHTML = '<span class="text-xs text-slate-400 italic">Thêm tham số ở trên</span>';
            return;
        }

        container.innerHTML = valid.map(p => `
            <button type="button" 
                    class="formula-param-btn px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 border border-blue-200 rounded hover:bg-blue-200"
                    data-param="${p.ma}" title="${p.ten}${p.donvi ? ' (' + p.donvi + ')' : ''}">
                ${p.ten}
            </button>
        `).join('');
    }

    insertFormula(value) {
        const input = document.getElementById('formula-input');
        if (!input) return;

        const start = input.selectionStart;
        const end = input.selectionEnd;
        const text = input.value;
        
        input.value = text.substring(0, start) + value + text.substring(end);
        input.selectionStart = input.selectionEnd = start + value.length;
        input.focus();
        
        this.updatePreview();
    }

    updatePreview() {
        const input = document.getElementById('formula-input');
        const preview = document.getElementById('formula-preview');
        const previewText = document.getElementById('formula-preview-text');
        if (!input || !preview || !previewText) return;

        const formula = input.value.trim();

        if (!formula) {
            preview.classList.add('hidden');
            return;
        }

        // Thay mã bằng [Tên] để dễ đọc
        let display = formula;
        this.thamSoList.forEach(p => {
            if (p.ma && p.ten) {
                display = display.replace(new RegExp(`\\b${p.ma}\\b`, 'g'), `[${p.ten}]`);
            }
        });

        previewText.textContent = display;
        preview.classList.remove('hidden');
    }

    // ========== TABLE ==========
    initTable() {
        this.tableManager = new TableManager({
            tableBody: document.getElementById('table-body'),
            paginationContainer: document.querySelector('.pagination-container'),
            searchInput: document.getElementById('search-input'),
            filtersForm: document.getElementById('filter-form'),
            selectAllCheckbox: document.getElementById('select-all-checkbox'),
            bulkActionsContainer: document.getElementById('bulk-actions'),
            enableBulkActions: true,
            onBulkDelete: (ids) => this.deleteMultipleItems(ids),
            apiEndpoint: '/hrm/to-chuc-nhan-su/api/cong-viec/list/',

            onRenderRow: (item) => {
                const tr = document.createElement('tr');
                tr.className = 'hover:bg-slate-50 border-b border-slate-100 transition-colors';

                const loaiBadge = item.loaicongviec === 'nhom'
                    ? '<span class="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">Nhóm</span>'
                    : item.loaicongviec === 'canhan'
                        ? '<span class="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">Cá nhân</span>'
                        : '-';

                const formulaBadge = item.trangthaicongthuc === 'on'
                    ? '<span class="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Có</span>'
                    : '<span class="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500">Không</span>';

                tr.innerHTML = `
                    <td class="px-4 py-3 text-center">
                        <input type="checkbox" class="row-checkbox w-4 h-4 rounded border-slate-300 text-blue-600" data-id="${item.id}">
                    </td>
                    <td class="px-6 py-3">
                        <a href="javascript:void(0);" onclick="window.CongViecManager.openSidebar('edit', ${item.id})" class="text-sm font-medium text-green-600 hover:text-green-700">
                            ${item.tencongviec || ''}
                        </a>
                    </td>
                    <td class="px-6 py-3 text-sm text-slate-600">${item.macongviec || ''}</td>
                    <td class="px-6 py-3 text-sm">${loaiBadge}</td>
                    <td class="px-6 py-3 text-sm">${formulaBadge}</td>
                    <td class="px-6 py-3 text-right">
                        <div class="flex justify-end gap-1">
                            <button onclick="window.CongViecManager.openSidebar('edit', ${item.id})" class="p-1.5 text-blue-600 hover:bg-blue-50 rounded" title="Sửa">
                                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z"/></svg>
                            </button>
                            <button onclick="window.CongViecManager.deleteItem(${item.id})" class="p-1.5 text-red-600 hover:bg-red-50 rounded" title="Xóa">
                                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"/></svg>
                            </button>
                        </div>
                    </td>
                `;
                return tr;
            }
        });
    }
}

window.CongViecManager = new CongViecManager();
document.addEventListener('DOMContentLoaded', () => window.CongViecManager.init());