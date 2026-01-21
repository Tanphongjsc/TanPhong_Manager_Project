// ============================================================
// SHIFT SELECTOR (MODAL CHỌN CA)
// ============================================================
class ShiftSelectorController {
    constructor(config) {
        this.config = {
            modalId: 'shift-selector-modal',
            apiList: '/hrm/lich-lam-viec/api/ca-lam-viec/list/',
            onSelect: config.onSelect || (() => {}),
            skipOverlapCheck: config.skipOverlapCheck || false, // Flag bỏ qua check overlap
            ...config
        };
        
        this.modal = document.getElementById(this.config.modalId);
        this.tbody = document.getElementById('shift-list-body');
        this.searchInput = document.getElementById('shift-search-input');
        
        this.els = {
            prev: this.modal?.querySelector('.pagination-prev'),
            next: this.modal?.querySelector('.pagination-next'),
            current: this.modal?.querySelector('.pagination-current'),
            total: this.modal?.querySelector('.pagination-total-pages'),
            pageSize: this.modal?.querySelector('.pagination-page-size'),
            info: this.modal?.querySelector('.pagination-info'),
            submitBtn: this.modal?.querySelector('[data-modal-submit]'),
            closeBtns: this.modal?.querySelectorAll('[data-modal-close]')
        };

        this.state = {
            page: 1,
            pageSize: 10,
            totalPages: 1,
            search: '',
            selectedShifts: new Map() // Key: String ID, Value: Object Shift
        };

        this.init();
    }

    init() {
        if (!this.modal) return;
        
        // 1.Close Events
        this.els.closeBtns?.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.close();
            });
        });

        // 2.Search
        this.searchInput?.addEventListener('input', AppUtils.Helper.debounce((e) => {
            this.state.search = e.target.value;
            this.state.page = 1;
            this.fetchData();
        }, 300));

        // 3.Pagination
        this.els.prev?.addEventListener('click', () => this.changePage(-1));
        this.els.next?.addEventListener('click', () => this.changePage(1));
        this.els.pageSize?.addEventListener('change', (e) => {
            this.state.pageSize = parseInt(e.target.value);
            this.state.page = 1;
            this.fetchData();
        });

        // 4.Submit
        this.els.submitBtn?.addEventListener('click', (e) => {
            e.preventDefault();
            this.handleConfirm();
        });

        // 5.Checkbox Logic (Delegation)
        this.tbody?.addEventListener('change', (e) => {
            if (e.target.classList.contains('shift-checkbox')) {
                const row = e.target.closest('tr');
                const shiftData = JSON.parse(decodeURIComponent(row.dataset.shift));
                const idStr = shiftData.id.toString();

                if (e.target.checked) {
                    this.state.selectedShifts.set(idStr, shiftData);
                    row.classList.add('bg-green-50');
                } else {
                    this.state.selectedShifts.delete(idStr);
                    row.classList.remove('bg-green-50');
                }
            }
        });
        
        // Row Click to Toggle
        this.tbody?.addEventListener('click', (e) => {
            const row = e.target.closest('tr');
            if (row && ! e.target.matches('input[type="checkbox"]')) {
                const checkbox = row.querySelector('.shift-checkbox');
                if (checkbox) checkbox.click();
            }
        });
    }

    close() {
        if (this.modal) {
            this.modal.removeAttribute('aria-hidden');
            AppUtils.Modal.close(this.modal);
        }
    }

    open(currentShifts = []) {
        // Persistence - Khôi phục lựa chọn cũ
        this.state.selectedShifts.clear();
        if (currentShifts && Array.isArray(currentShifts)) {
            currentShifts.forEach(s => this.state.selectedShifts.set(s.id.toString(), s));
        }
        
        this.state.page = 1;
        this.state.search = '';
        if (this.searchInput) this.searchInput.value = '';
        
        this.fetchData();
        AppUtils.Modal.open(this.modal);
    }

    async fetchData() {
        if (! this.tbody) return;
        this.tbody.innerHTML = '<tr><td colspan="3" class="text-center py-10 text-slate-400"><i class="fas fa-circle-notch fa-spin mr-2"></i>Đang tải dữ liệu...</td></tr>';
        
        try {
            const params = {
                page: this.state.page,
                page_size:  this.state.pageSize,
                search: this.state.search,
                status: 'active'
            };
            const res = await AppUtils.API.get(this.config.apiList, params);
            if (res.success) {
                this.renderTable(res.data);
                this.updatePagination(res.pagination);
            }
        } catch (e) {
            this.tbody.innerHTML = '<tr><td colspan="3" class="text-center py-4 text-red-400">Lỗi tải dữ liệu</td></tr>';
        }
    }

    renderTable(items) {
        if (! items || items.length === 0) {
            this.tbody.innerHTML = '<tr><td colspan="4" class="text-center py-10 text-slate-400 italic">Không tìm thấy ca làm việc nào</td></tr>';
            return;
        }

        const html = items.map(item => {
            const isDefault = item.MaCa === 'CAHANHCHINH';
            const isChecked = this.state.selectedShifts.has(item.id.toString());
            const dataStr = encodeURIComponent(JSON.stringify(item));
            
            const framesHtml = (item.KhungGio || []).map(f => 
                `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${isChecked ? 'bg-green-100 text-green-700 border-green-200' : 'bg-slate-100 text-slate-600 border-slate-200'} border mr-1 whitespace-nowrap">${f}</span>`
            ).join('');

            // ✅ FIX:  Thêm class bg trực tiếp vào mỗi td + thêm td trống cho cột Actions
            const cellBgClass = isChecked ?  'bg-green-50' : '';
            const rowHoverClass = isChecked ? '' :  'hover:bg-slate-50';
            const textClass = isChecked ? 'text-green-700 font-semibold' : 'text-slate-900 group-hover:text-green-700';

            return `
                <tr class="${rowHoverClass} transition-colors border-b border-slate-100 cursor-pointer group" data-shift="${dataStr}">
                    <td class="px-4 py-3 text-center w-12 ${cellBgClass}">
                        <input type="checkbox" class="shift-checkbox w-4 h-4 text-green-600 border-slate-300 rounded focus:ring-green-500 cursor-pointer" ${isChecked ? 'checked' : ''}>
                    </td>
                    <td class="px-4 py-3 align-middle ${cellBgClass}">
                        <div class="flex items-center">
                            <span class="text-sm ${textClass} transition-colors">${item.TenCa}</span>
                            ${isDefault ? `<span class="ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-700 border border-green-200 uppercase">Mặc định</span>` : ''}
                        </div>
                    </td>
                    <td class="px-4 py-3 align-middle ${cellBgClass}">
                        <div class="flex flex-wrap gap-1">${framesHtml}</div>
                    </td>
                    <td class="px-2 py-3 w-20 ${cellBgClass}"></td>
                </tr>
            `;
        }).join('');
        
        this.tbody.innerHTML = html;
    }

    updatePagination(p) {
        if (!p) return;
        this.state.totalPages = p.total_pages;
        if (this.els.current) this.els.current.textContent = p.page;
        if (this.els.total) this.els.total.textContent = p.total_pages;
        if (this.els.info) this.els.info.textContent = `Tổng: ${p.total}`;
        
        const updateBtn = (btn, disabled) => {
            if (! btn) return;
            btn.disabled = disabled;
            btn.classList.toggle('opacity-50', disabled);
            btn.classList.toggle('cursor-not-allowed', disabled);
        };
        updateBtn(this.els.prev, ! p.has_prev);
        updateBtn(this.els.next, !p.has_next);
    }

    changePage(delta) {
        const newPage = this.state.page + delta;
        if (newPage >= 1 && newPage <= this.state.totalPages) {
            this.state.page = newPage;
            this.fetchData();
        }
    }

    handleConfirm() {
        const selected = Array.from(this.state.selectedShifts.values());
        if (selected.length === 0) {
            AppUtils.Notify.warning('Vui lòng chọn ít nhất một ca làm việc');
            return;
        }

        // ✅ FIX: Chỉ validate overlap nếu KHÔNG bỏ qua (skipOverlapCheck = false)
        if (!this.config.skipOverlapCheck) {
            const conflictError = ScheduleValidator.checkMultipleShiftsOverlap(selected);
            if (conflictError) {
                AppUtils.Notify.error(conflictError);
                return;
            }
        }

        this.config.onSelect(selected);
        this.close();
    }

}

window.ShiftSelectorController = ShiftSelectorController;