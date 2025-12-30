/**
 * File: static/js/lich_lam_viec/lich_form.js
 * Version: 9.0 - Complete với conflict detection, auto-fill, persistence
 */

// ============================================================
// CONTROLLER: SHIFT SELECTOR (MODAL CHỌN CA)
// ============================================================
class ShiftSelectorController {
    constructor(config) {
        this.config = {
            modalId: 'shift-selector-modal',
            apiList: '/hrm/lich-lam-viec/api/ca-lam-viec/list/',
            onSelect: config.onSelect || (() => {}),
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
        if (!items || items.length === 0) {
            this.tbody.innerHTML = '<tr><td colspan="3" class="text-center py-10 text-slate-400 italic">Không tìm thấy ca làm việc nào</td></tr>';
            return;
        }

        const html = items.map(item => {
            const isDefault = item.MaCa === 'CAHANHCHINH';
            const isChecked = this.state.selectedShifts.has(item.id.toString());
            const dataStr = encodeURIComponent(JSON.stringify(item));
            
            const framesHtml = (item.KhungGio || []).map(f => 
                `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200 mr-1 whitespace-nowrap">${f}</span>`
            ).join('');

            return `
                <tr class="hover:bg-slate-50 transition-colors border-b border-slate-100 cursor-pointer group ${isChecked ? 'bg-green-50' : ''}" data-shift="${dataStr}">
                    <td class="px-4 py-3 text-center w-12">
                        <input type="checkbox" class="shift-checkbox w-4 h-4 text-green-600 border-slate-300 rounded focus: ring-green-500 cursor-pointer" ${isChecked ? 'checked' : ''}>
                    </td>
                    <td class="px-4 py-3 align-middle">
                        <div class="flex items-center">
                            <span class="text-sm font-medium text-slate-900 group-hover:text-green-700 transition-colors">${item.TenCa}</span>
                            ${isDefault ? `<span class="ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-700 border border-green-200 uppercase">Mặc định</span>` : ''}
                        </div>
                    </td>
                    <td class="px-4 py-3 align-middle">
                        <div class="flex flex-wrap gap-1">${framesHtml}</div>
                    </td>
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

        // Validate:  Kiểm tra trùng lặp giờ làm
        const conflictError = this.checkTimeOverlap(selected);
        if (conflictError) {
            AppUtils.Notify.error(conflictError);
            return;
        }

        this.config.onSelect(selected);
        this.close();
    }

    checkTimeOverlap(shifts) {
        if (shifts.length < 2) return null;

        let allIntervals = [];
        shifts.forEach(s => {
            const intervals = AppUtils.Time.getAbsoluteIntervals(s);
            intervals.forEach(i => allIntervals.push({ ...i, shiftName: s.TenCa }));
        });

        allIntervals.sort((a, b) => a.start - b.start);

        for (let i = 0; i < allIntervals.length - 1; i++) {
            const current = allIntervals[i];
            const next = allIntervals[i + 1];
            if (current.end > next.start) {
                return `Xung đột thời gian: "${current.shiftName}" (${current.rawText}) trùng với "${next.shiftName}" (${next.rawText}).`;
            }
        }
        return null;
    }
}

// ============================================================
// MAIN CONTROLLER:  LICH FORM
// ============================================================
class LichFormController extends BaseFormManager {
    constructor() {
        super({
            formId: 'lich-form',
            submitBtnId: 'btn-save',
            apiUrls: {
                create: '/hrm/lich-lam-viec/api/lich-lam-viec/create/',
                update: (id) => `/hrm/lich-lam-viec/api/lich-lam-viec/${id}/update/`,
                detail: (id) => `/hrm/lich-lam-viec/api/lich-lam-viec/${id}/detail/`,
                shiftDetail: (id) => `/hrm/lich-lam-viec/api/ca-lam-viec/detail/${id}/`
            },
            autoCode: { sourceField: 'tenlichlamviec', targetField: 'malichlamviec' },
            buildPayload: () => this.buildPayload(),
            validateLogic: (p) => this.validateData(p),
            fillFormData: (d) => this.fillData(d),
            onSuccess: () => {
                setTimeout(() => { 
                    window.location.href = '/hrm/lich-lam-viec/thiet-ke-lich/lich-lam-viec/'; 
                }, 1000);
            }
        });

        // DOM Cache
        this.elements = {
            ...this.elements,
            btnOpenSelector: document.getElementById('btn-open-selector'),
            empPlaceholder: document.getElementById('emp-placeholder'),
            hiddenDeptIds: document.getElementById('hidden-dept-ids'),
            hiddenEmpIds: document.getElementById('hidden-emp-ids'),
            
            blockCoDinh: document.getElementById('block-co-dinh'),
            blockLichTrinh: document.getElementById('block-lich-trinh'),
            checkAllDays: document.getElementById('check-all-days'),
            weeklyBody: document.getElementById('weekly-schedule-body'),
            
            masterDisplay: document.getElementById('master-shift-display'),
            btnMasterEdit: document.getElementById('btn-master-edit'),
            btnMasterView: document.getElementById('btn-master-view'),
        };

        // State
        this.currentSelection = { depts: [], deptIds: [], emps: [], empIds: [] };
        this.weeklyData = this.initWeeklyData();
        this.currentEditingDay = null;
        this.masterShifts = []; 
        this.pendingPayload = null;
    }

    initWeeklyData() {
        const days = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];
        return days.map((name, idx) => ({
            dayIndex: idx, 
            dayName: name, 
            isChecked: idx < 5, // Mặc định T2-T6 được check
            shifts: [] 
        }));
    }

    onAfterInit() {
        // Init Employee Selector
        this.empSelector = new EmployeeSelectorController({
            scheduleId: this.state.currentId,
            onConfirm: (data) => this.updateSelectionUI(data)
        });
        this.elements.btnOpenSelector?.addEventListener('click', () => {
            this.empSelector.open(this.currentSelection);
        });

        // Init Shift Selector
        this.shiftSelector = new ShiftSelectorController({
            onSelect: (shifts) => this.handleShiftSelect(shifts)
        });

        // Radio Switcher (Cố định / Lịch trình)
        const radios = document.querySelectorAll('input[name="loaikichban"]');
        radios.forEach(r => r.addEventListener('change', (e) => {
            const isFixed = e.target.value === 'CO_DINH';
            this.toggleBlock('block-co-dinh', isFixed);
            this.toggleBlock('block-lich-trinh', !isFixed);
        }));

        // Global Modal Close Fix
        document.querySelectorAll('[data-modal-close]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const modal = btn.closest('.fixed');
                if (modal) {
                    modal.removeAttribute('aria-hidden');
                    AppUtils.Modal.close(modal);
                }
            });
        });

        this.bindFixedScheduleEvents();
        this.bindMasterEvents();
        
        // Render bảng tuần nếu là tạo mới
        if (! this.state.isUpdateMode) {
            this.renderWeeklyTable();
        }
    }

    // ============================================================
    // EMPLOYEE SELECTION UI
    // ============================================================
    updateSelectionUI(data) {
        this.currentSelection = { ...data };
        
        // Lưu vào hidden fields
        if (this.elements.hiddenDeptIds) {
            this.elements.hiddenDeptIds.value = JSON.stringify(data.deptIds || []);
        }
        if (this.elements.hiddenEmpIds) {
            this.elements.hiddenEmpIds.value = JSON.stringify(data.empIds || []);
        }

        const container = this.elements.btnOpenSelector;
        const placeholder = this.elements.empPlaceholder;
        if (! container) return;

        // Xóa badges cũ
        container.querySelectorAll('.badge-item').forEach(el => el.remove());
        
        const hasData = (data.depts?.length > 0) || (data.emps?.length > 0);
        placeholder?.classList.toggle('hidden', hasData);
        
        // Xóa highlight lỗi nếu có data
        if (hasData) {
            container.classList.remove('border-red-500', 'ring-1', 'ring-red-500');
        }

        const escapeHtml = (txt) => { 
            const d = document.createElement('div'); 
            d.textContent = txt; 
            return d.innerHTML; 
        };
        
        // Render badges Phòng ban
        (data.depts || []).forEach(d => {
            container.insertAdjacentHTML('beforeend', `
                <span class="badge-item bg-orange-50 text-orange-700 border border-orange-200 text-xs font-medium px-2 py-0.5 rounded flex items-center gap-1 select-none">
                    <i class="fas fa-building text-[10px]"></i>${escapeHtml(d.name)}
                </span>
            `);
        });
        
        // Render badges Nhân viên
        (data.emps || []).forEach(e => {
            container.insertAdjacentHTML('beforeend', `
                <span class="badge-item bg-blue-50 text-blue-700 border border-blue-200 text-xs font-medium px-2 py-0.5 rounded flex items-center gap-1 select-none">
                    <i class="fas fa-user text-[10px]"></i>${escapeHtml(e.name)}
                </span>
            `);
        });
    }

    // ============================================================
    // FIXED SCHEDULE EVENTS
    // ============================================================
    bindFixedScheduleEvents() {
        // Check All Days
        this.elements.checkAllDays?.addEventListener('change', (e) => {
            const checked = e.target.checked;
            this.weeklyData.forEach(d => {
                d.isChecked = checked;
                // Auto-fill nếu check và chưa có ca
                if (checked && d.shifts.length === 0 && this.masterShifts.length > 0) {
                    d.shifts = JSON.parse(JSON.stringify(this.masterShifts));
                }
            });
            this.renderWeeklyTable();
        });

        // Table Events (Delegation)
        this.elements.weeklyBody?.addEventListener('click', (e) => {
            const target = e.target;
            const row = target.closest('tr');
            if (! row) return;
            const idx = parseInt(row.dataset.index);

            // Checkbox Day - Logic Auto-fill
            if (target.classList.contains('day-checkbox')) {
                const isChecked = target.checked;
                this.weeklyData[idx].isChecked = isChecked;
                
                // Nếu check vào và chưa có ca -> Auto fill từ Master
                if (isChecked && this.weeklyData[idx].shifts.length === 0 && this.masterShifts.length > 0) {
                    this.weeklyData[idx].shifts = JSON.parse(JSON.stringify(this.masterShifts));
                }
                // ✅ validate cross-day
                const err = this.checkWeeklyCrossDayOverlap();
                if (err) {
                    // rollback
                    this.weeklyData[idx].isChecked = false;
                    this.weeklyData[idx].shifts = [];
                    target.checked = false;
                    AppUtils.Notify.error(err);
                }

                this.renderWeeklyTable();
                this.updateCheckAllState();
            }

            // Edit Button
            if (target.closest('.btn-edit-day')) {
                e.preventDefault();
                this.currentEditingDay = idx;
                this.shiftSelector.open(this.weeklyData[idx].shifts);
            }

            // View Button
            if (target.closest('.btn-view-day')) {
                e.preventDefault();
                const shiftId = target.closest('.btn-view-day').dataset.id;
                this.openShiftDetail(shiftId);
            }
        });
    }

    // ============================================================
    // MASTER SHIFT EVENTS
    // ============================================================
    bindMasterEvents() {
        // Bind nút Edit Master
        const editBtn = document.getElementById('btn-master-edit');
        if (editBtn) {
            // Remove old listeners
            const newBtn = editBtn.cloneNode(true);
            editBtn.parentNode.replaceChild(newBtn, editBtn);
            
            newBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.currentEditingDay = 'MASTER';
                this.shiftSelector.open(this.masterShifts);
            });
        }

        // Bind nút View từng ca (Master)
        const viewBtns = this.elements.masterDisplay?.querySelectorAll('.btn-view-master-shift');
        viewBtns?.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const id = btn.dataset.id;
                this.openShiftDetail(id);
            });
        });
    }

    handleShiftSelect(shifts) {
        if (this.currentEditingDay === 'MASTER') {
            this.masterShifts = [...shifts];
            this.updateMasterDisplay(shifts);

            this.weeklyData.forEach(day => {
                if (day.isChecked) day.shifts = JSON.parse(JSON.stringify(shifts));
            });
        } else if (this.currentEditingDay !== null) {
            this.weeklyData[this.currentEditingDay].shifts = [...shifts];
            this.weeklyData[this.currentEditingDay].isChecked = true;
        }

        // ✅ validate cross-day sau khi gán ca
        // Hàm này sẽ trực tiếp sửa đổi this.weeklyData (bỏ chọn ngày conflict)
        const removedDays = this.autoResolveConflicts();

        // 3. Thông báo cho người dùng nếu có thay đổi tự động
        if (removedDays.length > 0) {
            AppUtils.Notify.warning(
                `Hệ thống đã tự động bỏ chọn: <b>${removedDays.join(', ')}</b> do trùng thời gian làm việc với các ngày trước đó.`
            );
        }

        this.renderWeeklyTable();
    }

    updateMasterDisplay(shifts) {
        if (! this.elements.masterDisplay) return;
        const container = this.elements.masterDisplay;
        
        const editBtnHtml = `
            <button type="button" id="btn-master-edit" class="p-2 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-full transition-colors shrink-0" title="Chọn ca">
                <i class="fas fa-pen"></i>
            </button>`;

        if (shifts && shifts.length > 0) {
            let listHtml = `<div class="flex-1 flex flex-col gap-1 min-w-0">`;
            
            shifts.forEach(s => {
                const timeStr = (s.KhungGio || []).join(', ');
                listHtml += `
                    <div class="flex items-center justify-between gap-3 text-sm group/item">
                        <div class="truncate text-slate-700">
                            <span class="font-medium">${s.TenCa}</span>:  
                            <span class="text-xs text-slate-500 font-mono">${timeStr}</span>
                        </div>
                        <button type="button" class="btn-view-master-shift text-green-600 hover:text-green-800 p-1 rounded hover:bg-green-100 transition-colors shrink-0" data-id="${s.id}" title="Xem chi tiết">
                            <i class="fas fa-eye"></i>
                        </button>
                    </div>`;
            });
            listHtml += `</div>`;

            container.innerHTML = `
                <div class="flex items-start gap-3 bg-slate-100 border border-slate-200 rounded-lg px-4 py-2 w-full">
                    ${listHtml}
                </div>
                ${editBtnHtml}
            `;
        } else {
            container.innerHTML = `
                <div class="flex items-center gap-3 bg-slate-100 border border-slate-200 rounded-lg px-4 py-2 w-full text-slate-500 italic">
                    Chưa chọn ca
                </div>
                ${editBtnHtml}
            `;
        }

        // Re-bind events sau khi render HTML mới
        this.bindMasterEvents();
    }

    // ============================================================
    // WEEKLY TABLE RENDER
    // ============================================================
    renderWeeklyTable() {
        if (!this.elements.weeklyBody) return;
        
        const html = this.weeklyData.map(day => {
            const isOff = ! day.isChecked;
            let displayStr = '';
            
            if (isOff) {
                displayStr = '<span class="text-slate-500 italic">Ngày nghỉ</span>';
            } else if (! day.shifts || day.shifts.length === 0) {
                displayStr = '<span class="text-slate-400 italic">Chưa chọn ca</span>';
            } else {
                // Render từng ca trên 1 dòng riêng
                displayStr = `<div class="flex flex-col gap-1.5">
                    ${day.shifts.map(s => {
                        const timeStr = (s.KhungGio || []).join(', ');
                        return `
                            <div class="flex items-center gap-2">
                                <span class="font-bold text-slate-700 text-sm whitespace-nowrap">${s.TenCa}</span>
                                <span class="text-xs text-slate-500 font-mono bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">${timeStr}</span>
                                <button type="button" class="btn-view-day text-green-600 hover:text-green-800 p-1 rounded hover:bg-green-100 transition-colors ml-1" title="Xem chi tiết" data-id="${s.id}">
                                    <i class="fas fa-eye text-xs"></i>
                                </button>
                            </div>`;
                    }).join('')}
                </div>`;
            }

            return `
                <tr class="hover:bg-slate-50 transition-colors border-b border-slate-50" data-index="${day.dayIndex}">
                    <td class="px-4 py-3 text-center align-top pt-4">
                        <input type="checkbox" class="day-checkbox rounded text-green-600 focus:ring-green-500 cursor-pointer w-4 h-4" ${day.isChecked ? 'checked' : ''}>
                    </td>
                    <td class="px-4 py-3 text-sm font-medium align-top pt-4 ${day.isChecked ? 'text-green-700' : 'text-slate-500'}">${day.dayName}</td>
                    <td class="px-4 py-3 text-sm align-top pt-3">${displayStr}</td>
                    <td class="px-4 py-3 text-right align-top pt-3">
                        <div class="flex items-center justify-end gap-2 ${isOff ? 'invisible' : ''}">
                            <button type="button" class="btn-edit-day text-blue-500 hover:text-blue-700 transition-colors" title="Thay đổi ca">
                                <i class="fas fa-pen"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
        
        this.elements.weeklyBody.innerHTML = html;
        this.updateCheckAllState();
    }

    updateCheckAllState() {
        const all = this.weeklyData.every(d => d.isChecked);
        const some = this.weeklyData.some(d => d.isChecked);
        if (this.elements.checkAllDays) {
            this.elements.checkAllDays.checked = all;
            this.elements.checkAllDays.indeterminate = some && !all;
        }
    }

    // ============================================================
    // VALIDATE OVERLAP (Updated Logic)
    // ============================================================
    checkWeeklyCrossDayOverlap() {
        const weeklyIntervals = [];

        // 1. Thu thập tất cả khoảng thời gian trên trục thời gian tuần (0 -> 10080 phút)
        this.weeklyData.forEach(day => {
            if (!day.isChecked || !day.shifts || day.shifts.length === 0) return;

            // Mốc thời gian bắt đầu của ngày (Thứ 2 = 0, Thứ 3 = 1440...)
            const dayBaseMinutes = day.dayIndex * 1440; 

            day.shifts.forEach(shift => {
                // ✅ Sử dụng logic mới để lấy các interval (bao gồm cả phần nhảy sang ngày hôm sau)
                const absIntervals = AppUtils.Time.getAbsoluteIntervals(shift);
                
                absIntervals.forEach(interval => {
                    weeklyIntervals.push({
                        // Cộng thêm mốc của ngày trong tuần
                        start: dayBaseMinutes + interval.start, 
                        end: dayBaseMinutes + interval.end,
                        
                        dayName: day.dayName,
                        shiftName: shift.TenCa,
                        rawText: interval.rawText
                    });
                });
            });
        });

        if (weeklyIntervals.length < 2) return null;

        // 2. Sắp xếp theo thời gian bắt đầu
        weeklyIntervals.sort((a, b) => a.start - b.start);

        // 3. Kiểm tra chồng lấn
        for (let i = 0; i < weeklyIntervals.length - 1; i++) {
            const current = weeklyIntervals[i];
            const next = weeklyIntervals[i + 1];

            // Nếu ca trước kết thúc sau khi ca sau bắt đầu -> Xung đột
            if (current.end > next.start) {
                // Format lại tên ngày cho dễ hiểu nếu xung đột xảy ra giữa các ngày khác nhau
                const getDayNameFromMinutes = (mins) => {
                    const dayIdx = Math.floor(mins / 1440);
                    const days = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'CN', 'Thứ 2 tuần sau'];
                    return days[dayIdx] || `Ngày +${dayIdx}`;
                };

                const day1 = getDayNameFromMinutes(current.start);
                const day2 = getDayNameFromMinutes(next.start);
                
                let dayInfo = day1;
                if (day1 !== day2) dayInfo = `${day1} và ${day2}`;

                return `Xung đột thời gian (${dayInfo}): "${current.shiftName}" [${current.rawText}] trùng với "${next.shiftName}" [${next.rawText}].`;
            }
        }

        return null;
    }

    // ============================================================
    // AUTO RESOLVE CONFLICTS (Tự động bỏ chọn ngày xung đột)
    // ============================================================
    autoResolveConflicts() {
        const validIntervals = []; // Lưu các khoảng thời gian đã được chấp nhận
        const removedDays = [];    // Lưu tên các thứ bị bỏ chọn

        // Duyệt tuần tự từ Thứ 2 -> CN
        this.weeklyData.forEach(day => {
            // Chỉ kiểm tra những ngày đang được check và có ca
            if (!day.isChecked || !day.shifts || day.shifts.length === 0) return;

            const dayOffset = day.dayIndex * 1440; // 0, 1440, 2880...
            let isConflict = false;
            const currentDayIntervals = [];

            // 1. Tính toán thời gian thực tế của ngày hiện tại
            day.shifts.forEach(shift => {
                const absIntervals = AppUtils.Time.getAbsoluteIntervals(shift);
                absIntervals.forEach(i => {
                    currentDayIntervals.push({
                        start: dayOffset + i.start,
                        end: dayOffset + i.end
                    });
                });
            });

            // 2. So sánh với các khoảng thời gian ĐÃ ĐƯỢC CHẤP NHẬN trước đó
            for (const cur of currentDayIntervals) {
                for (const valid of validIntervals) {
                    // Logic check overlap: (StartA < EndB) và (EndA > StartB)
                    if (cur.start < valid.end && cur.end > valid.start) {
                        isConflict = true;
                        break;
                    }
                }
                if (isConflict) break;
            }

            // 3. Xử lý kết quả
            if (isConflict) {
                // Nếu xung đột -> Bỏ chọn ngày này
                day.isChecked = false;
                day.shifts = []; // Clear shifts để đảm bảo sạch sẽ
                removedDays.push(day.dayName);
            } else {
                // Nếu hợp lệ -> Thêm vào danh sách chấp nhận để so sánh với các ngày sau
                validIntervals.push(...currentDayIntervals);
            }
        });

        return removedDays;
    }

    // ============================================================
    // SHIFT DETAIL MODAL
    // ============================================================
    async openShiftDetail(shiftId) {
        const modal = document.getElementById('shift-detail-modal');
        const container = document.getElementById('shift-detail-content');
        if (!modal || !container) return;

        container.innerHTML = '<div class="text-center py-10 text-slate-500"><i class="fas fa-circle-notch fa-spin mr-2"></i>Đang tải thông tin...</div>';
        AppUtils.Modal.open(modal);

        try {
            const url = this.config.apiUrls.shiftDetail(shiftId);
            const res = await AppUtils.API.get(url);
            if (res.success) {
                this.renderShiftDetail(res.data, container);
                const submitBtn = modal.querySelector('[data-modal-submit]');
                if (submitBtn) {
                    submitBtn.onclick = () => window.open(`/hrm/lich-lam-viec/thiet-ke-lich/ca-lam-viec/${shiftId}/update/`, '_blank');
                }
            } else {
                container.innerHTML = `<div class="text-center text-red-500 py-4">${res.message}</div>`;
            }
        } catch (e) {
            container.innerHTML = '<div class="text-center text-red-500 py-4">Lỗi tải dữ liệu</div>';
        }
    }

    renderShiftDetail(data, container) {
        const tpl = document.getElementById('tpl-shift-detail');
        if (!tpl) return;
        
        const content = tpl.content.cloneNode(true);
        const fill = (sel, val) => { 
            const el = content.querySelector(sel); 
            if (el) el.textContent = val; 
        };

        fill('[data-field="tencalamviec"]', data.TenCa);
        fill('[data-field="macalamviec"]', data.MaCa);
        
        const typeMap = { 'CO_DINH':  'Cố định', 'LINH_DONG': 'Linh động', 'TU_DO': 'Tự do' };
        fill('[data-field="loaichamcong_label"]', typeMap[data.LoaiCa] || data.LoaiCa);
        fill('[data-field="solanchamcong"]', data.SoLanChamCong);
        fill('[data-field="tongcong"]', data.TongCong);

        // Tính lại Tổng thời gian làm việc
        let totalMinutes = 0;
        if (data.ChiTietKhungGio) {
            data.ChiTietKhungGio.forEach(f => {
                const s = AppUtils.Time.parse(f.GioBatDau);
                const e = AppUtils.Time.parse(f.GioKetThuc);
                if (s !== null && e !== null) {
                    if (e >= s) totalMinutes += (e - s);
                    else totalMinutes += (1440 - s + e); // Qua đêm
                }
            });
            // Trừ nghỉ trưa
            if (data.NghiTrua) {
                const ls = AppUtils.Time.parse(data.NghiTrua.BatDau);
                const le = AppUtils.Time.parse(data.NghiTrua.KetThuc);
                if (ls !== null && le !== null) {
                    if (le >= ls) totalMinutes -= (le - ls);
                    else totalMinutes -= (1440 - ls + le);
                }
            }
        }
        const totalTimeStr = AppUtils.Time.formatDuration(Math.max(0, totalMinutes));

        // Toggle checkout
        const toggle = content.querySelector('[data-field="checkout-toggle"]');
        if (toggle) {
            if (data.KhongCanCheckout) {
                toggle.classList.remove('bg-slate-200');
                toggle.classList.add('bg-green-500');
                toggle.querySelector('div').classList.add('translate-x-4');
            } else {
                toggle.classList.add('bg-slate-200');
            }
        }

        const framesContainer = content.getElementById('detail-frames-container');
        
        // Header Tổng thời gian
        const header = `
            <div class="bg-slate-50 border border-slate-100 rounded p-3 mb-3 text-sm">
                <span class="text-slate-600">Tổng thời gian làm việc của ca:</span> 
                <span class="text-green-600 font-bold ml-1">${totalTimeStr}</span>
            </div>`;
        framesContainer.insertAdjacentHTML('beforeend', header);

        // Render khung giờ
        if (data.ChiTietKhungGio) {
            data.ChiTietKhungGio.forEach(f => {
                const s = AppUtils.Time.parse(f.GioBatDau);
                const e = AppUtils.Time.parse(f.GioKetThuc);

                const div = document.createElement('div');
                div.className = 'bg-white border border-slate-200 rounded p-3 text-xs text-slate-600 space-y-2';
                
                let inner = `
                    <div class="flex items-center mb-1">
                        <span class="bg-green-100 text-green-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase border border-green-200 mr-2">KHUNG GIỜ</span>
                        <span class="font-bold text-slate-800 text-sm">${f.GioBatDau} - ${f.GioKetThuc}</span>
                    </div>`;

                if (data.LoaiCa === 'CO_DINH') {
                    inner += `
                        <div class="grid grid-cols-1 gap-1 pl-1">
                            <div>Thời gian cho phép đến muộn:  <b class="text-slate-800">${f.DenMuonCP || 0} phút</b></div>
                            <div>Không ghi nhận công nếu muộn hơn: <b class="text-slate-800">${f.KhongTinhCongNeuMuonHon > 0 ? f.KhongTinhCongNeuMuonHon + ' phút' : 'Không giới hạn'}</b></div>
                            <div>Check-in sớm nhất: <b class="text-slate-800">${f.CheckInSomNhat || 'Không giới hạn'}</b></div>
                            <div class="mt-1 border-t border-slate-50 pt-1"></div>
                            <div>Thời gian cho phép về sớm nhất: <b class="text-slate-800">${f.VeSomCP || 0} phút</b></div>
                            <div>Không ghi nhận công nếu về sớm hơn: <b class="text-slate-800">${f.KhongTinhCongNeuSomHon > 0 ?  f.KhongTinhCongNeuSomHon + ' phút' : 'Không giới hạn'}</b></div>
                            <div>Check-out muộn nhất: <b class="text-slate-800">${f.CheckOutMuonNhat || 'Không giới hạn'}</b></div>
                        </div>`;
                } else {
                    inner += `
                        <div class="grid grid-cols-1 gap-1 pl-1">
                            <div>Không ghi nhận chấm công nếu đến muộn hơn: <b>${f.KhongTinhCongNeuMuonHon > 0 ? f.KhongTinhCongNeuMuonHon + ' phút' : 'Không giới hạn'}</b></div>
                            <div>Thời gian cho phép chấm công sớm nhất: <b>${f.CheckInSomNhat || '-'}</b></div>
                            <div>Có thể đến muộn nhất: <b>${f.LinhDongDenMuon || 0} phút</b></div>
                            <div class="mt-1 border-t border-slate-50 pt-1"></div>
                            <div>Không ghi nhận chấm công nếu về sớm hơn: <b>${f.KhongTinhCongNeuSomHon > 0 ? f.KhongTinhCongNeuSomHon + ' phút' : 'Không giới hạn'}</b></div>
                            <div>Thời gian cho phép về muộn nhất: <b>${f.CheckOutMuonNhat || '-'}</b></div>
                            <div>Có thể đến sớm nhất: <b>${f.LinhDongVeSom || 0} phút</b></div>
                        </div>`;
                }
                
                div.innerHTML = inner;
                framesContainer.appendChild(div);
            });

            // Nghỉ trưa
            if (data.NghiTrua) {
                const lunchDiv = document.createElement('div');
                lunchDiv.className = 'flex items-center justify-between bg-slate-50 p-3 rounded border border-slate-200 mt-2';
                lunchDiv.innerHTML = `
                    <div class="flex items-center gap-2">
                        <span class="text-sm font-medium text-slate-700">Nghỉ giữa giờ</span>
                        <div class="w-8 h-4 bg-green-500 rounded-full relative">
                            <div class="w-4 h-4 bg-white rounded-full absolute right-0 shadow"></div>
                        </div>
                    </div>
                    <span class="text-sm font-bold text-slate-800">${data.NghiTrua.BatDau} - ${data.NghiTrua.KetThuc}</span>
                `;
                framesContainer.appendChild(lunchDiv);
            }
        }
        
        container.innerHTML = '';
        container.appendChild(content);
    }

    // ============================================================
    // FORM SUBMIT - Override để xử lý conflict
    // ============================================================
    async submit() {
        if (this.state.isSubmitting) return;

        // HTML5 validation
        if (! this.form.checkValidity()) {
            this.form.reportValidity();
            return;
        }

        // Build payload
        const payload = this.buildPayload();
        
        // Custom validation
        const errorMsg = this.validateData(payload);
        if (errorMsg) {
            return;
        }

        // Lưu payload để dùng khi confirm
        this.pendingPayload = payload;

        this._setLoading(true);

        try {
            let res;
            // Gọi API Create hoặc Update tùy mode
            if (this.state.isUpdateMode) {
                const url = this.config.apiUrls.update(this.state.currentId);
                res = await AppUtils.API.put(url, payload);
            } else {
                const url = this.config.apiUrls.create;
                res = await AppUtils.API.post(url, payload);
            }

            // --- XỬ LÝ KẾT QUẢ ---
            if (res.success) {
                // Trường hợp thành công ngay
                AppUtils.Notify.success(res.message || "Lưu thành công!");
                this.config.onSuccess(res);
            } 
            // Server trả về yêu cầu xác nhận (Conflict)
            else if (res.require_confirm && res.conflicts) {
                this._setLoading(false);
                this.showConflictConfirm(res.conflicts);
            }
            
            else if (res.data && res.data.require_confirm && res.data.conflicts) {
                this._setLoading(false);
                this.showConflictConfirm(res.data.conflicts);
            }
            // Trường hợp lỗi thông thường
            else {
                AppUtils.Notify.error(res.message || "Có lỗi xảy ra");
                this._setLoading(false);
            }
        } catch (err) {
            console.error('⛔ Submit error:', err);
            AppUtils.Notify.error("Lỗi hệ thống: " + (err.message || err));
            this._setLoading(false);
        }
    }

    // ============================================================
    // CONFLICT HANDLING - Hiển thị modal xác nhận chuyển nhân viên
    // ============================================================
    showConflictConfirm(conflicts) {
        const empConflicts = conflicts.filter(c => c.type === 'emp');
        const deptConflicts = conflicts.filter(c => c.type === 'dept');

        let listHtml = '';
        empConflicts.slice(0, 10).forEach(c => {
            listHtml += `<li class="py-1">
                <strong>${c.emp_name}</strong>
                <span class="text-slate-500">đang ở</span>
                <strong class="text-orange-600">${c.current_schedule_name}</strong>
            </li>`;
        });

        if (empConflicts.length > 10) {
            listHtml += `<li class="py-1 text-slate-500 italic">... và ${empConflicts.length - 10} nhân viên khác</li>`;
        }

        // Nếu muốn báo phòng ban, tách riêng (hoặc bỏ qua nếu không cần)
        let deptHtml = '';
        if (deptConflicts.length) {
            deptConflicts.slice(0, 5).forEach(c => {
                deptHtml += `<li class="py-1">
                    <strong>Bộ phận: ${c.dept_name}</strong>
                    <span class="text-slate-500">đang ở</span>
                    <strong class="text-orange-600">${c.current_schedule_name}</strong>
                </li>`;
            });
            if (deptConflicts.length > 5) {
                deptHtml += `<li class="py-1 text-slate-500 italic">... và ${deptConflicts.length - 5} bộ phận khác</li>`;
            }
        }

        const message = `
            ${empConflicts.length ? `<p class="text-sm text-slate-600 mb-2">Các nhân viên sau đang thuộc lịch làm việc khác:</p>
            <ul class="list-disc pl-5 text-xs max-h-40 overflow-y-auto bg-slate-50 rounded p-2 mb-3">${listHtml}</ul>` : ''}
            ${deptHtml ? `<p class="text-sm text-slate-600 mb-2">Các bộ phận sau đang thuộc lịch làm việc khác:</p>
            <ul class="list-disc pl-5 text-xs max-h-40 overflow-y-auto bg-slate-50 rounded p-2 mb-3">${deptHtml}</ul>` : ''}
            <p class="text-sm text-slate-600">Bạn có muốn chuyển các đối tượng này sang lịch làm việc mới không?</p>`;

        this.showCustomConfirmModal({
            title: 'Cảnh báo xung đột',
            message,
            confirmText: 'Đồng ý chuyển',
            cancelText: 'Hủy',
            type: 'warning',
            onConfirm: () => this.submitWithForce(),
            onCancel: () => {}
        });
    }

    async submitWithForce() {
        if (! this.pendingPayload) return;

        // Thêm flag force_transfer
        this.pendingPayload.force_transfer = true;

        this._setLoading(true);

        try {
            let res;
            if (this.state.isUpdateMode) {
                const url = this.config.apiUrls.update(this.state.currentId);
                res = await AppUtils.API.put(url, this.pendingPayload);
            } else {
                const url = this.config.apiUrls.create;
                res = await AppUtils.API.post(url, this.pendingPayload);
            }

            if (res.success) {
                if (res.transferred && res.transferred.length > 0) {
                    AppUtils.Notify.success(`Lưu thành công!  Đã chuyển ${res.transferred.length} nhân viên sang lịch mới.`);
                } else {
                    AppUtils.Notify.success(res.message || "Lưu thành công!");
                }
                this.config.onSuccess(res);
            } else {
                AppUtils.Notify.error(res.message || "Có lỗi xảy ra");
                this._setLoading(false);
            }
        } catch (err) {
            console.error('⛔ Submit with force error:', err);
            AppUtils.Notify.error("Lỗi hệ thống:  " + (err.message || err));
            this._setLoading(false);
        }
    }

    showCustomConfirmModal(options) {
        const {
            title = 'Xác nhận',
            message = '',
            confirmText = 'Đồng ý',
            cancelText = 'Hủy',
            type = 'warning',
            onConfirm = () => {},
            onCancel = () => {}
        } = options;

        // Remove existing modal
        document.getElementById('custom-conflict-modal')?.remove();

        const iconHtml = `
            <svg class="w-6 h-6 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
            </svg>`;

        const modal = document.createElement('div');
        modal.id = 'custom-conflict-modal';
        modal.className = 'fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4';
        modal.innerHTML = `
            <div class="bg-white rounded-xl shadow-2xl max-w-md w-full transform transition-all duration-300 scale-95 opacity-0" id="conflict-modal-content">
                <div class="p-6">
                    <!-- Header with icon -->
                    <div class="flex items-start gap-4 mb-4">
                        <div class="shrink-0 w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center">
                            ${iconHtml}
                        </div>
                        <div class="flex-1">
                            <h3 class="text-lg font-semibold text-slate-900">${title}</h3>
                            <div class="mt-2 text-sm text-slate-600">${message}</div>
                        </div>
                    </div>
                    
                    <!-- Actions với 2 nút -->
                    <div class="flex justify-end gap-3 mt-6">
                        <button type="button" id="conflict-cancel-btn" class="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors">
                            ${cancelText}
                        </button>
                        <button type="button" id="conflict-confirm-btn" class="px-5 py-2.5 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors shadow-sm">
                            ${confirmText}
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const modalContent = modal.querySelector('#conflict-modal-content');
        const confirmBtn = modal.querySelector('#conflict-confirm-btn');
        const cancelBtn = modal.querySelector('#conflict-cancel-btn');

        // Animate in
        requestAnimationFrame(() => {
            modalContent.classList.remove('scale-95', 'opacity-0');
            modalContent. classList.add('scale-100', 'opacity-100');
        });

        const closeModal = () => {
            modalContent.classList.add('scale-95', 'opacity-0');
            modalContent. classList.remove('scale-100', 'opacity-100');
            setTimeout(() => modal.remove(), 200);
        };

        // Click outside to close
        modal.addEventListener('click', (e) => {
            if (e. target === modal) {
                closeModal();
                onCancel();
            }
        });

        // Nút Hủy
        cancelBtn.addEventListener('click', () => {
            closeModal();
            onCancel();
        });

        // Nút Đồng ý
        confirmBtn. addEventListener('click', () => {
            closeModal();
            onConfirm();
        });
    }

    // ============================================================
    // BUILD PAYLOAD
    // ============================================================
    buildPayload() {
        const formData = new FormData(this.form);
        const fixedDetails = [];
        
        if (formData.get('loaikichban') === 'CO_DINH') {
            this.weeklyData.forEach(day => {
                if (day.isChecked && day.shifts && day.shifts.length > 0) {
                    day.shifts.forEach(s => {
                        fixedDetails.push({ 
                            NgayTrongTuan: day.dayIndex, 
                            CaID: s.id 
                        });
                    });
                }
            });
        }

        return {
            TenNhom: formData.get('tenlichlamviec')?.trim() || '',
            MaNhom: formData.get('malichlamviec')?.trim().toUpperCase() || '',
            ApDung_PhongBan: this.currentSelection.deptIds || [],
            ApDung_NhanVien: this.currentSelection.empIds || [],
            LoaiKichBan: formData.get('loaikichban') || 'CO_DINH',
            CoLichNghi: document.getElementById('toggle-lichnghi')?.checked || false,
            ChiTietCa: fixedDetails
        };
    }

    // ============================================================
    // VALIDATE DATA
    // ============================================================
    validateData(payload) {
        // Validate phải chọn ít nhất 1 nhân viên hoặc phòng ban
        
        if (payload.LoaiKichBan === 'CO_DINH' && payload.ChiTietCa.length === 0) {
            AppUtils.Notify.warning('Vui lòng cấu hình lịch làm việc (chọn ngày và ca)');
            return "Chưa cấu hình lịch";
        }
        
        return null;
    }

    // ============================================================
    // FILL DATA (FOR UPDATE MODE)
    // ============================================================
    fillData(data) {
        
        
        // 1.Fill thông tin cơ bản
        this.setFieldValue('tenlichlamviec', data.TenNhom);
        this.setFieldValue('malichlamviec', data.MaNhom);
        
        // Disable field mã khi update
        if (this.state.isUpdateMode) {
            this.disableCodeField();
        }
        
        // 2.Trigger radio loại kịch bản
        const radioValue = data.LoaiKichBan || 'CO_DINH';
        const radio = this.form?.querySelector(`input[name="loaikichban"][value="${radioValue}"]`);
        if (radio) {
            radio.checked = true;
            radio.dispatchEvent(new Event('change'));
        }

        // 3.Fill Badges Nhân viên/Phòng ban
        this.currentSelection = {
            depts: data.Depts || [],
            emps: data.Emps || [],
            deptIds: data.ApDung_PhongBan || [],
            empIds: data.ApDung_NhanVien || []
        };
        this.updateSelectionUI(this.currentSelection);

        // 4.Fill Bảng Lịch Tuần
        if (data.ChiTietCa && Array.isArray(data.ChiTietCa) && data.ChiTietCa.length > 0) {
            // Reset tất cả ngày
            this.weeklyData.forEach(d => { 
                d.isChecked = false; 
                d.shifts = []; 
            });
            
            // Map data từ API vào state
            data.ChiTietCa.forEach(detail => {
                const dayIdx = detail.Ngay;
                if (dayIdx >= 0 && dayIdx < this.weeklyData.length) {
                    this.weeklyData[dayIdx].isChecked = true;
                    this.weeklyData[dayIdx].shifts.push({
                        id: detail.CaID,
                        TenCa: detail.TenCa,
                        KhungGio: detail.KhungGio || []
                    });
                }
            });
            
            // Update Master display từ ngày đầu tiên có ca
            const firstDayWithShifts = this.weeklyData.find(d => d.shifts.length > 0);
            if (firstDayWithShifts) {
                this.masterShifts = JSON.parse(JSON.stringify(firstDayWithShifts.shifts));
                this.updateMasterDisplay(this.masterShifts);
            }
        }
        
        // 5.Render bảng tuần
        this.renderWeeklyTable();
    }
}

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('lich-form')) {
        window.lichFormController = new LichFormController();
        window.lichFormController.init();
    }
});