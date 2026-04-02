// Quản lý công việc với hỗ trợ công thức tính toán
class CongViecManager extends BaseCRUDManager {
    constructor() {
        super({
            uiMode: 'modal',
            modalId: 'cv-modal',
            formId: 'congviec-form',
            codeField: 'macongviec',
            autoCode: { sourceField: 'tencongviec', targetField: 'macongviec' },
            apiUrls: {
                list: '/hrm/to-chuc-nhan-su/api/cong-viec/list/',
                detail: (id) => `/hrm/to-chuc-nhan-su/api/cong-viec/${id}/detail/`,
                create: '/hrm/to-chuc-nhan-su/api/cong-viec/create/',
                update: (id) => `/hrm/to-chuc-nhan-su/api/cong-viec/${id}/update/`,
                delete: (id) => `/hrm/to-chuc-nhan-su/api/cong-viec/${id}/delete/`,
                toggleStatus: (id) => `/hrm/to-chuc-nhan-su/api/cong-viec/${id}/toggle-status/`,
            },
            httpMethods: { delete: 'DELETE', toggleStatus: 'POST' },
            texts: { entityName: 'công việc', createTitle: 'Thêm công việc', editTitle: 'Sửa công việc' },
            onRefreshTable: () => this.tableManager?.refresh(),
            fillFormData: (d) => {
                AppUtils.Form.setData(this.elements.form, d);
                const t = this.el.toggle;
                if (t) { t.checked = d.trangthaicongthuc === 'on'; this.toggleFormula(t.checked); }
                try { this.loadParams(typeof d.danhsachthamso === 'string' ? JSON.parse(d.danhsachthamso) : (d.danhsachthamso || [])); } catch {}
                this.updatePreview();
            },
            getFormData: (f) => {
                const p = Object.fromEntries(new FormData(f));
                if (this.el.json) p.danhsachthamso = this.el.json.value;
                return p;
            },

            // CHẶN LƯU NẾU CÔNG THỨC SAI
            onBeforeSubmit: () => {
                if (!this.el.toggle?.checked) return true;
                const { ok, empty } = this.validateCurrentFormula();
                
                if (empty) return AppUtils.Notify.warning('Chưa nhập công thức!'), this.el.input?.focus(), false;
                if (!ok) return AppUtils.Notify.error('Công thức bị lỗi, vui lòng kiểm tra lại!'), this.el.input?.focus(), false;
                
                return true;
            },
            onBeforeOpen: () => this.resetFormula(),
            onAfterClose: () => this.resetFormula()
        });
        this.params = []; // Danh sách tham số công thức
        this.tableManager = null;
        this.el = {}; // DOM elements
    }

    init() {
        super.init();
        const g = (id) => document.getElementById(id);
        // Lưu trữ tất cả DOM elements
        this.el = {
            toggle: g('toggle-congthuc'), section: g('formula-section'), input: g('formula-input'),
            preview: g('formula-preview'), previewText: g('formula-preview-text'), container: g('thamso-container'),
            empty: g('thamso-empty'), template: g('thamso-row-template'), params: g('formula-params'), json: g('hidden-thamso-json')
        };
        this.initTable();
        this.initFormula();
    }

    initFormula() {
        const { toggle, container, input, params } = this.el;
        const add = (el, ev, fn) => el && this.eventManager.add(el, ev, fn);
        
        // Bật/tắt section công thức
        add(toggle, 'change', e => this.toggleFormula(e.target.checked));
        // Thêm tham số mới
        add(document.getElementById('btn-add-thamso'), 'click', () => this.addParam());
        // Xóa công thức
        add(document.getElementById('btn-formula-clear'), 'click', () => { if (input) { input.value = ''; this.updatePreview(); }});
        
        if (container) {
            // Xóa tham số
            add(container, 'click', e => {
                const btn = e.target.closest('.btn-remove-thamso');
                if (btn) this.removeParam(+btn.closest('.thamso-row').dataset.index);
            });
            // Đồng bộ tham số từ form (có debounce)
            const sync = AppUtils.Helper.debounce(() => this.syncParams(), 150);
            add(container, 'input', e => {
                const row = e.target.closest('.thamso-row');
                if (row && e.target.classList.contains('thamso-ten')) {
                    const v = e.target.value.trim();
                    // Tự động tạo mã từ tên
                    if (v) row.querySelector('.thamso-ma').value = AppUtils.Helper.removeAccents(v).toLowerCase().replace(/[^a-z0-9\s]/g,'').replace(/\s+/g,'_');
                }
                sync();
            });
        }
        
        // Nút chèn công thức nhanh
        document.querySelectorAll('.formula-btn').forEach(b => add(b, 'click', () => this.insertFormula(b.dataset.insert)));
        // Nút chèn tham số
        add(params, 'click', e => { const b = e.target.closest('.formula-param-btn'); if (b) this.insertFormula(b.dataset.param); });
        // Cập nhật xem trước công thức
        add(input, 'input', AppUtils.Helper.debounce(() => this.updatePreview(), 200));
    }

    // Hiển thị/ẩn section công thức
    toggleFormula(show) {
        this.el.section?.classList.toggle('hidden', !show);
        if (show) this.ensureDefaultTimeParam();
    }

    // Thêm tham số thời gian mặc định khi bật công thức (nếu chưa có)
    ensureDefaultTimeParam() {
        const hasDefaultTime = this.params.some(p => (p?.ma || '').toLowerCase() === 'thoi_gian');
        if (hasDefaultTime) return;

        this.params.push({
            ten: 'Thời gian',
            ma: 'thoi_gian',
            donvi: 'Giờ',
            kieu: 'number',
            giatri_macdinh: ''
        });
        this.renderParams();
        this.updateJson();
    }
    
    // Reset công thức về trạng thái ban đầu
    resetFormula() {
        this.params = [];
        this.renderParams();
        if (this.el.toggle) this.el.toggle.checked = false;
        this.toggleFormula(false);
        if (this.el.input) this.el.input.value = '';
        this.updatePreview();
    }

    // Thêm tham số mới
    addParam() {
        this.params.push({ ten: '', ma: '', donvi: '', kieu: 'number', giatri_macdinh: '' });
        this.renderParams();
        setTimeout(() => this.el.container?.querySelectorAll('.thamso-row')[this.params.length-1]?.querySelector('.thamso-ten')?.focus(), 30);
    }

    // Xóa tham số
    removeParam(i) { this.params.splice(i, 1); this.renderParams(); this.updateParamBtns(); this.updateJson(); }

    // Render danh sách tham số
    renderParams() {
        const { container, template, empty } = this.el;
        if (!container || !template) return;
        container.innerHTML = '';
        empty?.classList.toggle('hidden', this.params.length > 0);
        this.params.forEach((p, i) => {
            const c = template.content.cloneNode(true);
            const r = c.querySelector('.thamso-row');
            r.dataset.index = i;
            r.querySelector('.thamso-ten').value = p.ten || '';
            r.querySelector('.thamso-ma').value = p.ma || '';
            r.querySelector('.thamso-donvi').value = p.donvi || '';
            r.querySelector('.thamso-kieu').value = p.kieu || 'number';
            r.querySelector('.thamso-default').value = p.giatri_macdinh || '';
            container.appendChild(c);
        });
        this.updateParamBtns();
    }

    // Tải tham số từ dữ liệu
    loadParams(d) { this.params = Array.isArray(d) ? d : []; this.renderParams(); this.updateJson(); }

    // Đồng bộ tham số từ form input
    syncParams() {
        this.params = [...(this.el.container?.querySelectorAll('.thamso-row') || [])].map(r => ({
            ten: r.querySelector('.thamso-ten').value.trim(), ma: r.querySelector('.thamso-ma').value.trim(),
            donvi: r.querySelector('.thamso-donvi').value.trim(), kieu: r.querySelector('.thamso-kieu').value,
            giatri_macdinh: r.querySelector('.thamso-default').value.trim()
        }));
        this.updateParamBtns(); this.updateJson();
    }

    // Cập nhật JSON ẩn
    updateJson() { if (this.el.json) this.el.json.value = JSON.stringify(this.params); }

    // Cập nhật nút chèn tham số
    updateParamBtns() {
        if (!this.el.params) return;
        const v = this.params.filter(p => p.ma && p.ten);
        this.el.params.innerHTML = v.length
            ? v.map(p => `<button type="button" class="formula-param-btn px-1.5 py-0.5 text-[11px] font-medium bg-blue-100 text-blue-700 rounded hover:bg-blue-200" data-param="${p.ma}" title="${p.donvi||''}">${p.ten}</button>`).join('')
            : '<span class="text-[10px] text-slate-400 italic">Chưa có</span>';
    }

    // Chèn giá trị vào công thức
    insertFormula(v) {
        const { input } = this.el;
        if (!input) return;
        const s = input.selectionStart, e = input.selectionEnd;
        input.value = input.value.slice(0, s) + v + input.value.slice(e);
        input.selectionStart = input.selectionEnd = s + v.length;
        input.focus();
        this.updatePreview();
    }


    // Tách logic validate ra riêng để tái sử dụng
    validateCurrentFormula() {
        const val = this.el.input?.value.trim();
        if (!val) return { ok: true, empty: true };
        
        const validVars = this.params.map(p => p.ma).filter(Boolean);
        const res = AppUtils.Formula.validate(val, validVars);
        
        // Format text hiển thị: thay mã bằng tên
        let fmt = val;
        this.params.forEach(p => {
            if (p.ma && p.ten) fmt = fmt.replace(new RegExp(`\\b${p.ma}\\b`, 'g'), `[${p.ten}]`);
        });

        return { ok: res.ok, msg: res.msg, fmt, empty: false };
    }

    // Cập nhật xem trước công thức (thay mã tham số thành tên)
    updatePreview() {
        const { preview, previewText } = this.el;
        if (!preview) return;

        const { ok, msg, fmt, empty } = this.validateCurrentFormula();
        
        if (empty) {
            preview.classList.add('hidden');
            return;
        }

        // Cấu hình giao diện cho 2 trạng thái: Valid (true) & Invalid (false)
        const UI = {
            true: {
                cls: 'bg-emerald-50 border-emerald-200 text-emerald-900',
                icon: '<svg class="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>',
                msg: ''
            },
            false: {
                cls: 'bg-red-50 border-red-200 text-red-900',
                icon: '<svg class="w-4 h-4 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>',
                msg: `<div class="mt-1 text-xs font-bold text-red-600 flex items-center gap-1">⚠️ ${msg}</div>`
            }
        };

        const state = UI[ok];
        
        // Render
        preview.classList.remove('hidden');
        preview.className = `p-3 border rounded-lg flex items-start gap-3 transition-colors ${state.cls}`;
        
        preview.querySelector('div:first-child').innerHTML = state.icon; // Update Icon
        previewText.innerHTML = fmt + state.msg; // Update Text & Error msg
    }

    // Khởi tạo bảng
    initTable() {
        this.tableManager = new TableManager({
            tableBody: document.getElementById('table-body'),
            paginationContainer: document.querySelector('.pagination-container'),
            searchInput: document.getElementById('search-input'),
            selectAllCheckbox: document.getElementById('select-all-checkbox'),
            bulkActionsContainer: document.getElementById('bulk-actions'),
            enableBulkActions: true,
            onBulkDelete: (ids) => this.deleteMultipleItems(ids),
            apiEndpoint: this.config.apiUrls.list,
            onRenderRow: (item) => this.renderTableRow(item)
        });
    }

    // Render hàng bảng
    renderTableRow(item) {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50 transition-colors border-b border-slate-200';
        
        // Badge loại công việc
        const loaiBadges = {
            'nhom': '<span class="px-2 py-1 text-xs font-medium bg-purple-100 text-purple-700 rounded-md">Nhóm</span>',
            'canhan': '<span class="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded-md">Cá nhân</span>'
        };
        const loaiHtml = loaiBadges[item.loaicongviec] || '<span class="px-2 py-1 text-xs font-medium bg-slate-100 text-slate-600 rounded-md">-</span>';
        
        // Toggle trạng thái
        const statusHtml = `
            <label class="relative inline-flex items-center cursor-pointer">
                <input type="checkbox"
                       class="sr-only peer status-toggle"
                       data-id="${item.id}"
                       ${item.trangthaicv === 'active' ? 'checked' : ''}>
                <div class="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
        `;
        
        // Biểu tượng công thức
        const formulaIcon = item.trangthaicongthuc === 'on'
            ? '<span class="inline-flex items-center justify-center w-6 h-6 bg-green-100 text-green-600 rounded-full" title="Đã cấu hình công thức"><svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg></span>'
            : '<span class="inline-flex items-center justify-center w-6 h-6 bg-slate-100 text-slate-400 rounded-full" title="Chưa có công thức"><svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M20 12H4"/></svg></span>';
        
        // Escape HTML để tránh XSS
        const escapedName = (item.tencongviec || '').replace(/"/g, '&quot;');
        
        tr.innerHTML = `
            <td class="px-4 py-4 text-center">
                <input type="checkbox" class="row-checkbox w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer" data-id="${item.id}">
            </td>
            <td class="px-3 py-4 text-sm text-slate-800">
                <button class="view-btn font-medium text-blue-600 hover:text-blue-700 transition-colors text-left" 
                        data-id="${item.id}">
                    ${item.tencongviec || ''}
                </button>
            </td>
            <td class="px-3 py-4 text-sm text-slate-600">${item.macongviec || ''}</td>
            <td class="px-3 py-4 text-sm whitespace-nowrap">${loaiHtml}</td>
            <td class="px-3 py-4 text-sm">${statusHtml}</td>
            <td class="px-3 py-4 text-sm text-slate-600 text-center">${formulaIcon}</td>
            <td class="px-6 py-4 text-right whitespace-nowrap text-sm font-medium">
                <div class="inline-flex items-center justify-end gap-1 whitespace-nowrap">
                    <button type="button" 
                            class="edit-btn inline-flex items-center justify-center p-1 rounded text-blue-600 hover:text-blue-900 hover:bg-slate-50 transition-colors" 
                            data-id="${item.id}" 
                            title="Sửa">
                        <svg class="w-5 h-5 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"/>
                        </svg>
                    </button>
                    <button type="button" 
                            class="delete-btn inline-flex items-center justify-center p-1 rounded text-red-600 hover:text-red-900 hover:bg-slate-50 transition-colors" 
                            data-id="${item.id}" 
                            data-name="${escapedName}" 
                            title="Xóa">
                        <svg class="w-5 h-5 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"/>
                        </svg>
                    </button>
                </div>
            </td>
        `;
        
        return tr;
    }

    // Dọn dẹp
    destroy() {
        super.destroy();
        if (this.tableManager) {
            this.tableManager.destroy();
        }
        this.thamSoList = [];
        this.elements = {};
        console.log('✅ CongViecManager destroyed');
    }
}

// Khởi tạo
window.CongViecManager = new CongViecManager();
document.addEventListener('DOMContentLoaded', () => {
    window.CongViecManager.init();
});