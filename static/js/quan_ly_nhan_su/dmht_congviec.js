/**
 * CongViecManager - Optimized & Compact
 */
class CongViecManager {
    constructor() {
        this.config = {
            modalId: 'cv-modal',
            formId: 'congviec-form',
            apiUrls: {
                list: '/hrm/to-chuc-nhan-su/api/cong-viec/list/',
                detail: (id) => `/hrm/to-chuc-nhan-su/api/cong-viec/${id}/detail/`,
                create: '/hrm/to-chuc-nhan-su/api/cong-viec/create/',
                update: (id) => `/hrm/to-chuc-nhan-su/api/cong-viec/${id}/update/`,
                delete: (id) => `/hrm/to-chuc-nhan-su/api/cong-viec/${id}/delete/`,
            }
        };
        this.state = { mode: 'create', itemId: null, submitting: false, codeEdited: false };
        this.thamSoList = [];
        this.events = AppUtils.EventManager.create();
    }

    init() {
        this.modal = document.getElementById(this.config.modalId);
        this.form = document.getElementById(this.config.formId);
        if (!this.modal || !this.form) return console.error('⛔ Modal/Form not found');
        
        this.initModal();
        this.initTable();
        this.initFormula();
        this.initAutoCode();
    }

    // ===== MODAL =====
    initModal() {
        // Close handlers
        this.modal.querySelectorAll('[data-modal-close]').forEach(btn => 
            this.events.add(btn, 'click', () => this.closeModal())
        );
        this.events.add(this.modal, 'click', e => e.target === this.modal && this.closeModal());
        this.events.add(document, 'keydown', e => e.key === 'Escape' && this.closeModal());
        
        // Submit
        const submitBtn = this.modal.querySelector('[data-modal-submit]');
        if (submitBtn) this.events.add(submitBtn, 'click', () => this.submit());
    }

    openModal(mode, id = null) {
        this.state = { mode, itemId: id, submitting: false, codeEdited: false };
        
        this.form.reset();
        this.resetFormula();
        AppUtils.Form?.clearErrors?.(this.form);
        
        // UI updates
        const title = this.modal.querySelector('[data-modal-title]');
        const submit = this.modal.querySelector('[data-modal-submit]');
        if (title) title.textContent = mode === 'create' ? 'Thêm công việc' : 'Sửa công việc';
        if (submit) submit.textContent = mode === 'create' ? 'Thêm' : 'Lưu';
        
        // Code field
        const codeField = this.form.querySelector('[name="macongviec"]');
        if (codeField) {
            codeField.disabled = mode === 'edit';
            codeField.classList.toggle('bg-slate-100', mode === 'edit');
        }
        
        if (mode === 'edit' && id) this.loadData(id);
        
        AppUtils.Modal.open(this.modal);
    }

    closeModal() {
        AppUtils.Modal.close(this.modal);
    }

    // ===== DATA =====
    async loadData(id) {
        try {
            const res = await AppUtils.API.get(this.config.apiUrls.detail(id));
            this.fillForm(res.data || res);
        } catch (e) {
            AppUtils.Notify.error('Không tải được dữ liệu');
        }
    }

    fillForm(d) {
        const set = (n, v) => { const el = this.form.querySelector(`[name="${n}"]`); if (el) el.value = v ?? ''; };
        
        set('id', d.id);
        set('tencongviec', d.tencongviec);
        set('macongviec', d.macongviec);
        set('loaicongviec', d.loaicongviec);
        set('mota', d.mota);
        set('ghichu', d.ghichu);
        set('bieuthuctinhtoan', d.bieuthuctinhtoan);
        
        const toggle = document.getElementById('toggle-congthuc');
        if (toggle) {
            toggle.checked = d.trangthaicongthuc === 'on';
            this.toggleFormula(toggle.checked);
        }
        
        let params = [];
        try { params = typeof d.danhsachthamso === 'string' ? JSON.parse(d.danhsachthamso) : (d.danhsachthamso || []); } catch {}
        this.loadParams(params);
        this.updatePreview();
    }

    async submit() {
        if (this.state.submitting || !this.form.checkValidity()) {
            this.form.reportValidity();
            return;
        }
        
        this.state.submitting = true;
        const btn = this.modal.querySelector('[data-modal-submit]');
        const txt = btn?.textContent;
        if (btn) { btn.disabled = true; btn.textContent = '...'; }
        
        try {
            const data = Object.fromEntries(new FormData(this.form));
            const codeField = this.form.querySelector('[name="macongviec"]');
            if (this.state.mode === 'edit' && codeField) data.macongviec = codeField.value;
            
            const isEdit = this.state.mode === 'edit' && this.state.itemId;
            const url = isEdit ? this.config.apiUrls.update(this.state.itemId) : this.config.apiUrls.create;
            const res = isEdit ? await AppUtils.API.put(url, data) : await AppUtils.API.post(url, data);
            
            if (res.success === false) throw new Error(res.message);
            
            AppUtils.Notify.success(res.message || 'Thành công!');
            this.closeModal();
            this.tableManager?.refresh();
        } catch (e) {
            AppUtils.Notify.error(e.message || 'Có lỗi xảy ra');
        } finally {
            this.state.submitting = false;
            if (btn) { btn.disabled = false; btn.textContent = txt; }
        }
    }

    // ===== DELETE =====
    deleteItem(id, name = '') {
        AppUtils.DeleteOperations.confirmDelete({
            id, name,
            url: this.config.apiUrls.delete,
            method: 'DELETE',
            onSuccess: () => this.tableManager?.refresh()
        });
    }

    deleteMultiple(ids) {
        AppUtils.DeleteOperations.confirmBulkDelete({
            ids,
            url: this.config.apiUrls.delete,
            method: 'DELETE',
            onSuccess: () => this.tableManager?.refresh()
        });
    }

    // ===== AUTO CODE =====
    initAutoCode() {
        const src = this.form.querySelector('[name="tencongviec"]');
        const tgt = this.form.querySelector('[name="macongviec"]');
        if (!src || !tgt) return;
        
        const gen = AppUtils.Helper.debounce(() => {
            if (this.state.mode === 'create' && !this.state.codeEdited) {
                tgt.value = src.value.trim() ? AppUtils.Helper.generateCode(src.value) : '';
            }
        }, 250);
        
        this.events.add(src, 'input', gen);
        this.events.add(tgt, 'input', e => {
            this.state.codeEdited = e.target.value.trim() !== '';
            if (!this.state.codeEdited) gen();
        });
    }

    // ===== FORMULA =====
    initFormula() {
        const toggle = document.getElementById('toggle-congthuc');
        if (toggle) this.events.add(toggle, 'change', e => this.toggleFormula(e.target.checked));
        
        const addBtn = document.getElementById('btn-add-thamso');
        if (addBtn) this.events.add(addBtn, 'click', () => this.addParam());
        
        const container = document.getElementById('thamso-container');
        if (container) {
            this.events.add(container, 'click', e => {
                if (e.target.closest('.btn-remove-thamso')) {
                    this.removeParam(+e.target.closest('.thamso-row').dataset.index);
                }
            });
            this.events.add(container, 'input', e => {
                const row = e.target.closest('.thamso-row');
                if (row && e.target.classList.contains('thamso-ten')) {
                    row.querySelector('.thamso-ma').value = this.genCode(e.target.value);
                }
                this.syncParams();
            });
        }
        
        document.querySelectorAll('.formula-btn').forEach(btn => 
            this.events.add(btn, 'click', () => this.insertFormula(btn.dataset.insert))
        );
        
        const params = document.getElementById('formula-params');
        if (params) this.events.add(params, 'click', e => {
            const btn = e.target.closest('.formula-param-btn');
            if (btn) this.insertFormula(btn.dataset.param);
        });
        
        const clearBtn = document.getElementById('btn-formula-clear');
        if (clearBtn) this.events.add(clearBtn, 'click', () => {
            document.getElementById('formula-input').value = '';
            this.updatePreview();
        });
        
        const input = document.getElementById('formula-input');
        if (input) this.events.add(input, 'input', () => this.updatePreview());
    }

    toggleFormula(show) {
        document.getElementById('formula-section')?.classList.toggle('hidden', !show);
    }

    resetFormula() {
        this.thamSoList = [];
        this.renderParams();
        document.getElementById('toggle-congthuc').checked = false;
        this.toggleFormula(false);
        document.getElementById('formula-input').value = '';
        this.updatePreview();
    }

    // ===== PARAMS =====
    addParam() {
        this.thamSoList.push({ ten: '', ma: '', donvi: '', kieu: 'number', giatri_macdinh: '' });
        this.renderParams();
        setTimeout(() => document.querySelectorAll('.thamso-row').item(this.thamSoList.length - 1)?.querySelector('.thamso-ten')?.focus(), 30);
    }

    removeParam(i) {
        this.thamSoList.splice(i, 1);
        this.renderParams();
        this.updateParamBtns();
        this.updateJson();
    }

    renderParams() {
        const c = document.getElementById('thamso-container');
        const e = document.getElementById('thamso-empty');
        const t = document.getElementById('thamso-row-template');
        if (!c || !t) return;
        
        c.innerHTML = '';
        e?.classList.toggle('hidden', this.thamSoList.length > 0);
        
        this.thamSoList.forEach((p, i) => {
            const clone = t.content.cloneNode(true);
            const row = clone.querySelector('.thamso-row');
            row.dataset.index = i;
            row.querySelector('.thamso-ten').value = p.ten || '';
            row.querySelector('.thamso-ma').value = p.ma || '';
            row.querySelector('.thamso-donvi').value = p.donvi || '';
            row.querySelector('.thamso-kieu').value = p.kieu || 'number';
            row.querySelector('.thamso-default').value = p.giatri_macdinh || '';
            c.appendChild(clone);
        });
        
        this.updateParamBtns();
    }

    loadParams(data) {
        this.thamSoList = Array.isArray(data) ? data : [];
        this.renderParams();
        this.updateJson();
    }

    syncParams() {
        this.thamSoList = [...document.querySelectorAll('.thamso-row')].map(r => ({
            ten: r.querySelector('.thamso-ten').value.trim(),
            ma: r.querySelector('.thamso-ma').value.trim(),
            donvi: r.querySelector('.thamso-donvi').value.trim(),
            kieu: r.querySelector('.thamso-kieu').value,
            giatri_macdinh: r.querySelector('.thamso-default').value.trim()
        }));
        this.updateParamBtns();
        this.updateJson();
    }

    updateJson() {
        const h = document.getElementById('hidden-thamso-json');
        if (h) h.value = JSON.stringify(this.thamSoList);
    }

    genCode(n) {
        return n ? AppUtils.Helper.removeAccents(n).toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, '_').slice(0, 20) : '';
    }

    updateParamBtns() {
        const c = document.getElementById('formula-params');
        if (!c) return;
        
        const valid = this.thamSoList.filter(p => p.ma && p.ten);
        c.innerHTML = `<span class="text-[10px] text-slate-400 w-full">Tham số:</span>` +
            (valid.length ? valid.map(p => 
                `<button type="button" class="formula-param-btn px-1.5 py-0.5 text-[11px] font-medium bg-blue-100 text-blue-700 rounded hover:bg-blue-200" data-param="${p.ma}" title="${p.donvi || ''}">${p.ten}</button>`
            ).join('') : '<span class="text-[10px] text-slate-400 italic">Chưa có</span>');
    }

    insertFormula(v) {
        const input = document.getElementById('formula-input');
        if (!input) return;
        const s = input.selectionStart, e = input.selectionEnd;
        input.value = input.value.slice(0, s) + v + input.value.slice(e);
        input.selectionStart = input.selectionEnd = s + v.length;
        input.focus();
        this.updatePreview();
    }

    updatePreview() {
        const input = document.getElementById('formula-input');
        const preview = document.getElementById('formula-preview');
        const text = document.getElementById('formula-preview-text');
        if (!input || !preview || !text) return;
        
        const f = input.value.trim();
        if (!f) { preview.classList.add('hidden'); return; }
        
        let d = f;
        this.thamSoList.forEach(p => { if (p.ma && p.ten) d = d.replace(new RegExp(`\\b${p.ma}\\b`, 'g'), `[${p.ten}]`); });
        text.textContent = d;
        preview.classList.remove('hidden');
    }

    // ===== TABLE =====
    initTable() {
        this.tableManager = new TableManager({
            tableBody: document.getElementById('table-body'),
            paginationContainer: document.querySelector('.pagination-container'),
            searchInput: document.getElementById('search-input'),
            selectAllCheckbox: document.getElementById('select-all-checkbox'),
            bulkActionsContainer: document.getElementById('bulk-actions'),
            enableBulkActions: true,
            onBulkDelete: ids => this.deleteMultiple(ids),
            apiEndpoint: this.config.apiUrls.list,
            onRenderRow: item => {
                const tr = document.createElement('tr');
                tr.className = 'hover:bg-slate-50 border-b border-slate-50';
                
                const loai = item.loaicongviec === 'nhom' 
                    ? '<span class="px-1.5 py-0.5 text-[10px] font-medium bg-purple-100 text-purple-700 rounded">Nhóm</span>'
                    : item.loaicongviec === 'canhan'
                        ? '<span class="px-1.5 py-0.5 text-[10px] font-medium bg-blue-100 text-blue-700 rounded">Cá nhân</span>'
                        : '<span class="text-slate-300">-</span>';
                
                // Trạng thái giống chucvu: 'active' => Hoạt động
                const statusHtml = item.trangthaicv === 'active'
                    ? '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Hoạt động</span>'
                    : '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800">Ngừng</span>';
                
                const formula = item.trangthaicongthuc === 'on'
                    ? '<span class="inline-flex items-center justify-center w-5 h-5 bg-green-100 text-green-600 rounded-full text-xs">✓</span>'
                    : '<span class="inline-flex items-center justify-center w-5 h-5 bg-slate-100 text-slate-400 rounded-full text-xs">-</span>';
                
                tr.innerHTML = `
                    <td class="px-3 py-2.5 text-center"><input type="checkbox" class="row-checkbox w-3.5 h-3.5 rounded border-slate-300" data-id="${item.id}"></td>
                    <td class="px-4 py-2.5"><button onclick="window.CongViecManager.openModal('edit',${item.id})" class="text-sm font-medium text-green-600 hover:text-green-700 hover:underline text-left">${item.tencongviec || ''}</button></td>
                    <td class="px-4 py-2.5 text-xs text-slate-500 font-mono">${item.macongviec || ''}</td>
                    <td class="px-4 py-2.5">${loai}</td>
                    <td class="px-4 py-2.5">${statusHtml}</td>
                    <td class="px-4 py-2.5 text-center">${formula}</td>
                    <td class="px-4 py-2.5 text-right">
                        <div class="flex justify-end gap-0.5">
                            <button onclick="window.CongViecManager.openModal('edit',${item.id})" class="p-1 text-blue-500 hover:bg-blue-50 rounded" title="Sửa">
                                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z"/></svg>
                            </button>
                            <button onclick="window.CongViecManager.deleteItem(${item.id},'${(item.tencongviec||'').replace(/'/g,"\\'")}')" class="p-1 text-red-500 hover:bg-red-50 rounded" title="Xóa">
                                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"/></svg>
                            </button>
                        </div>
                    </td>`;
                return tr;
            }
        });
    }

    destroy() { this.events.removeAll(); }
}

window.CongViecManager = new CongViecManager();
document.addEventListener('DOMContentLoaded', () => window.CongViecManager.init());