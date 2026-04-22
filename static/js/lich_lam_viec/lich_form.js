/**
 * File: static/js/lich_lam_viec/lich_form.js
 * Version: 10.0 - Refactored with modular architecture
 * Description: Main controller cho form Lịch làm việc
 */

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
            
            btnOpenShiftSelector: document.getElementById('btn-open-shift-selector-lt'),
            shiftBadgesContainer: document.getElementById('lt-shift-badges'),
        };

        // State
        this.currentSelection = { depts: [], deptIds: [], emps: [], empIds: [] };
        this.pendingPayload = null;
        
        // State cho Lịch trình
        this.stateLT = {
            selectedShifts: new Map(),
            currentMonth: new Date().getMonth() + 1,
            currentYear: new Date().getFullYear(),
            colors: ['bg-teal-500', 'bg-blue-500', 'bg-rose-500', 'bg-orange-500', 'bg-indigo-500', 'bg-purple-500']
        };
        this.stateLT.selectedShifts.set('0', { id: 0, TenCa: 'Ngày nghỉ', colorClass: 'bg-slate-400 text-white' });
    }

    onAfterInit() {
        // 1.Khởi tạo Employee Selector
        this.empSelector = new EmployeeSelectorController({
            scheduleId: this.state.currentId,
            onConfirm: (data) => this.updateSelectionUI(data)
        });
        this.elements.btnOpenSelector?.addEventListener('click', () => {
            this.empSelector.open(this.currentSelection);
        });

        // 2.Khởi tạo Shift Selector (cho Fixed schedule)
        this.shiftSelector = new ShiftSelectorController({
            onSelect: (shifts) => this.handleShiftSelect(shifts)
        });

        // 3.Khởi tạo Fixed Schedule Manager
        this.fixedSchedule = new FixedScheduleManager({
            shiftSelector: this.shiftSelector,
            onMasterChange: () => {},
            onDataChange: () => {},
            openShiftDetail: (id) => this.openShiftDetail(id)
        });

        // 4.Khởi tạo Cycle Manager
        this.cycleManager = new CycleManager({
            getAvailableShifts: () => this.stateLT.selectedShifts,
            onSave: (cycles) => {},
            onDelete: (cycles) => {}
        });

        // 5.Khởi tạo Schedule Calendar
        this.scheduleCalendar = new ScheduleCalendar({
            year: this.stateLT.currentYear,
            month: this.stateLT.currentMonth,
            getEmployees: () => this.getLTEmployees(),
            getSelectedShifts: () => this.stateLT.selectedShifts,
            getCycles: () => this.cycleManager.getCycles(),
            onDataChange: () => {}
        });

        // 6.Khởi tạo Month-Year Picker
        this.initLTDatePicker();

        // 7.Bind events
        this.bindRadioSwitcher();
        this.bindLTShiftSelector();
        this.bindAddCycleButton();
        this.bindGlobalModalClose();
        
        // 8.Render dữ liệu ban đầu
        const activeRadio = this.form?.querySelector('input[name="loaikichban"]:checked');
        if (activeRadio?.value === 'LICH_TRINH') {
            this.scheduleCalendar.render();
        }
    }

    // ============================================================
    // EMPLOYEE SELECTION UI
    // ============================================================
    async updateSelectionUI(data) {
        this.currentSelection = { ...data };
        
        if (this.elements.hiddenDeptIds) {
            this.elements.hiddenDeptIds.value = JSON.stringify(data.deptIds || []);
        }
        if (this.elements.hiddenEmpIds) {
            this.elements.hiddenEmpIds.value = JSON.stringify(data.empIds || []);
        }

        const container = this.elements.btnOpenSelector;
        const placeholder = this.elements.empPlaceholder;
        if (! container) return;

        container.querySelectorAll('.badge-item').forEach(el => el.remove());
        
        const hasData = (data.depts?.length > 0) || (data.emps?.length > 0);
        placeholder?.classList.toggle('hidden', hasData);
        
        if (hasData) {
            container.classList.remove('border-red-500', 'ring-1', 'ring-red-500');
        }

        const escapeHtml = (txt) => { 
            const d = document.createElement('div'); 
            d.textContent = txt; 
            return d.innerHTML; 
        };
        
        (data.depts || []).forEach(d => {
            container.insertAdjacentHTML('beforeend', `
                <span class="badge-item bg-orange-50 text-orange-700 border border-orange-200 text-xs font-medium px-2 py-0.5 rounded flex items-center gap-1 select-none">
                    <i class="fas fa-building text-[10px]"></i>${escapeHtml(d.name)}
                </span>
            `);
        });
        
        (data.emps || []).forEach(e => {
            container.insertAdjacentHTML('beforeend', `
                <span class="badge-item bg-blue-50 text-blue-700 border border-blue-200 text-xs font-medium px-2 py-0.5 rounded flex items-center gap-1 select-none">
                    <i class="fas fa-user text-[10px]"></i>${escapeHtml(e.name)}
                </span>
            `);
        });

        if (data.deptIds && data.deptIds.length > 0) {
            await this.loadEmployeesFromDepartments(data.deptIds);
        } else {
            this.currentSelection.deptEmps = [];
        }

        const activeRadio = this.form?.querySelector('input[name="loaikichban"]:checked');
        if (activeRadio?.value === 'LICH_TRINH') {
            this.scheduleCalendar.render();
        }
    }

    async loadEmployeesFromDepartments(deptIds) {
        if (!deptIds || deptIds.length === 0) {
            this.currentSelection.deptEmps = [];
            return;
        }

        try {
            const res = await AppUtils.API.get('/hrm/to-chuc-nhan-su/api/v1/phong-ban/employee/', {
                phongban_ids: deptIds.join(','),
                page_size: 10000
            });
            
            if (res.success && res.data) {
                const addedIds = new Set();
                const allEmps = [];
                
                res.data.forEach(emp => {
                    if (!addedIds.has(emp.id)) {
                        addedIds.add(emp.id);
                        allEmps.push({
                            id: emp.id,
                            name: emp.hovaten,
                            deptName: emp.cong_tac?.phong_ban || '-'
                        });
                    }
                });
                
                this.currentSelection.deptEmps = allEmps;
            } else {
                this.currentSelection.deptEmps = [];
            }
            
        } catch (e) {
            console.error('Error loading employees from departments:', e);
            this.currentSelection.deptEmps = [];
        }
    }

    getLTEmployees() {
        const employees = [];
        const addedIds = new Set();

        (this.currentSelection.emps || []).forEach(emp => {
            if (!addedIds.has(emp.id)) {
                employees.push({
                    id: emp.id,
                    name: emp.name,
                    deptName: emp.deptName || emp.dept || '-'
                });
                addedIds.add(emp.id);
            }
        });

        (this.currentSelection.deptEmps || []).forEach(emp => {
            if (!addedIds.has(emp.id)) {
                employees.push({
                    id: emp.id,
                    name: emp.name,
                    deptName:  emp.deptName || '-'
                });
                addedIds.add(emp.id);
            }
        });

        return employees;
    }

    // ============================================================
    // EVENT BINDINGS
    // ============================================================
    bindRadioSwitcher() {
        const radios = document.querySelectorAll('input[name="loaikichban"]');
        radios.forEach(r => r.addEventListener('change', (e) => {
            const val = e.target.value;
            const isFixed = val === 'CO_DINH';
            
            this.toggleBlock('block-co-dinh', isFixed);
            this.toggleBlock('block-lich-trinh', ! isFixed);

            const descCoDinh = document.getElementById('desc-co-dinh');
            const descLichTrinh = document.getElementById('desc-lich-trinh');
            if (descCoDinh) descCoDinh.classList.toggle('hidden', ! isFixed);
            if (descLichTrinh) descLichTrinh.classList.toggle('hidden', isFixed);

            if (! isFixed) {
                this.scheduleCalendar.render();
            }
        }));
    }

    bindLTShiftSelector() {
        const btnOpen = document.getElementById('btn-open-shift-selector-lt');
        if (btnOpen) {
            btnOpen.addEventListener('click', (e) => {
                e.preventDefault();
                this.openShiftSelectorLT();
            });
        }
    }

    bindAddCycleButton() {
        const btnAddCycle = document.getElementById('btn-add-cycle');
        if (btnAddCycle) {
            btnAddCycle.addEventListener('click', (e) => {
                e.preventDefault();
                this.cycleManager.open();
            });
        }
    }

    bindGlobalModalClose() {
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
    }

    // ============================================================
    // SHIFT SELECTION HANDLERS
    // ============================================================
    handleShiftSelect(shifts) {
        const currentDay = this.fixedSchedule.getCurrentEditingDay();
        
        if (currentDay === 'LICH_TRINH') {
            this.handleLTShiftSelect(shifts);
            return;
        }

        this.fixedSchedule.handleShiftSelect(shifts);
    }

    handleLTShiftSelect(shifts) {
        const dayOff = this.stateLT.selectedShifts.get('0');
        this.stateLT.selectedShifts.clear();
        this.stateLT.selectedShifts.set('0', dayOff);

        shifts.forEach((s, idx) => {
            const idStr = s.id.toString();
            s.colorClass = this.stateLT.colors[idx % this.stateLT.colors.length] + ' text-white';
            this.stateLT.selectedShifts.set(idStr, s);
        });
        
        this.renderLTBadges();
        this.shiftSelector.config.skipOverlapCheck = false;
    }

    openShiftSelectorLT() {
        this.fixedSchedule.currentEditingDay = 'LICH_TRINH';
        this.shiftSelector.config.skipOverlapCheck = true;
        
        const currentIds = Array.from(this.stateLT.selectedShifts.values()).filter(s => s.id !== 0);
        this.shiftSelector.open(currentIds);
    }

    renderLTBadges() {
        const container = this.elements.shiftBadgesContainer;
        if (!container) return;
        
        let html = '';
        this.stateLT.selectedShifts.forEach((s, id) => {
            const isDefault = id === '0';
            html += `
                <span class="${s.colorClass} border border-transparent text-[11px] font-bold px-2 py-0.5 rounded flex items-center gap-1.5 shadow-sm">
                    ${s.TenCa}
                    ${! isDefault ? `<i class="fas fa-times cursor-pointer hover:opacity-70" onclick="event.stopPropagation(); window.lichFormController.removeLTShift('${id}')"></i>` : ''}
                </span>`;
        });
        container.innerHTML = html;
    }

    removeLTShift(id) {
        this.stateLT.selectedShifts.delete(id);
        this.renderLTBadges();
    }

    // ============================================================
    // DATE PICKER
    // ============================================================
    initLTDatePicker() {
        const pickerLib = window.CustomDateComponents?.CustomMonthYearPicker;
        if (!pickerLib) return;

        this.ltMonthYearPicker = new pickerLib({
            triggerId: 'lt-date-trigger',
            popoverId: 'lt-date-popover',
            displayId: 'lt-display-date',
            pickerYearId: 'lt-picker-year',
            prevYearId: 'lt-prev-year',
            nextYearId: 'lt-next-year',
            monthGridId: 'lt-month-grid',
            selectedYear: this.stateLT.currentYear,
            selectedMonth: this.stateLT.currentMonth,
            monthGridColumns: 3,
            displayFormatter: (year, month) => `${year}-${String(month).padStart(2, '0')}`,
            selectedClass: 'bg-blue-500 text-white font-bold',
            currentClass: 'bg-blue-100 text-blue-700 font-medium ring-1 ring-blue-300',
            defaultClass: 'hover:bg-blue-50 hover:text-blue-600 text-slate-700',
            buttonBaseClass: 'py-2 text-[11px] rounded transition-colors cursor-pointer',
            onChange: ({ year, month }) => {
                this.stateLT.currentYear = year;
                this.stateLT.currentMonth = month;
                this.scheduleCalendar.setMonthYear(year, month);
            }
        });
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
        
        const typeMap = { 'CO_DINH': 'Cố định', 'LINH_DONG': 'Linh động', 'TU_DO': 'Tự do' };
        fill('[data-field="loaichamcong_label"]', typeMap[data.LoaiCa] || data.LoaiCa);
        fill('[data-field="solanchamcong"]', data.SoLanChamCong);
        fill('[data-field="tongcong"]', data.TongCong);

        let totalMinutes = 0;
        if (data.ChiTietKhungGio) {
            data.ChiTietKhungGio.forEach(f => {
                const s = AppUtils.Time.parse(f.GioBatDau);
                const e = AppUtils.Time.parse(f.GioKetThuc);
                if (s !== null && e !== null) {
                    if (e >= s) totalMinutes += (e - s);
                    else totalMinutes += (1440 - s + e);
                }
            });
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

        const toggle = content.querySelector('[data-field="checkout-toggle"]');
        if (toggle) {
            if (data.KhongCanCheckout) {
                toggle.classList.remove('bg-slate-200');
                toggle.classList.add('bg-blue-500');
                toggle.querySelector('div').classList.add('translate-x-4');
            } else {
                toggle.classList.add('bg-slate-200');
            }
        }

        const framesContainer = content.getElementById('detail-frames-container');
        
        const header = `
            <div class="bg-slate-50 border border-slate-100 rounded p-3 mb-3 text-sm">
                <span class="text-slate-600">Tổng thời gian làm việc của ca: </span> 
                <span class="text-blue-600 font-bold ml-1">${totalTimeStr}</span>
            </div>`;
        framesContainer.insertAdjacentHTML('beforeend', header);

        if (data.ChiTietKhungGio) {
            data.ChiTietKhungGio.forEach(f => {
                const div = document.createElement('div');
                div.className = 'bg-white border border-slate-200 rounded p-3 text-xs text-slate-600 space-y-2';
                
                let inner = `
                    <div class="flex items-center mb-1">
                        <span class="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase border border-blue-200 mr-2">KHUNG GIỜ</span>
                        <span class="font-bold text-slate-800 text-sm">${f.GioBatDau} - ${f.GioKetThuc}</span>
                    </div>`;

                if (data.LoaiCa === 'CO_DINH') {
                    inner += `
                        <div class="grid grid-cols-1 gap-1 pl-1">
                            <div>Thời gian cho phép đến muộn: <b class="text-slate-800">${f.DenMuonCP || 0} phút</b></div>
                            <div>Không ghi nhận công nếu muộn hơn: <b class="text-slate-800">${f.KhongTinhCongNeuMuonHon > 0 ? f.KhongTinhCongNeuMuonHon + ' phút' : 'Không giới hạn'}</b></div>
                            <div>Check-in sớm nhất: <b class="text-slate-800">${f.CheckInSomNhat || 'Không giới hạn'}</b></div>
                            <div class="mt-1 border-t border-slate-50 pt-1"></div>
                            <div>Thời gian cho phép về sớm nhất: <b class="text-slate-800">${f.VeSomCP || 0} phút</b></div>
                            <div>Không ghi nhận công nếu về sớm hơn: <b class="text-slate-800">${f.KhongTinhCongNeuSomHon > 0 ? f.KhongTinhCongNeuSomHon + ' phút' : 'Không giới hạn'}</b></div>
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

            if (data.NghiTrua) {
                const lunchDiv = document.createElement('div');
                lunchDiv.className = 'flex items-center justify-between bg-slate-50 p-3 rounded border border-slate-200 mt-2';
                lunchDiv.innerHTML = `
                    <div class="flex items-center gap-2">
                        <span class="text-sm font-medium text-slate-700">Nghỉ giữa giờ</span>
                        <div class="w-8 h-4 bg-blue-500 rounded-full relative">
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

        if (! this.form.checkValidity()) {
            this.form.reportValidity();
            return;
        }

        const payload = this.buildPayload();
        
        const errorMsg = this.validateData(payload);
        if (errorMsg) {
            return;
        }

        this.pendingPayload = payload;
        this._setLoading(true);

        try {
            let res;
            if (this.state.isUpdateMode) {
                const url = this.config.apiUrls.update(this.state.currentId);
                res = await AppUtils.API.put(url, payload);
            } else {
                const url = this.config.apiUrls.create;
                res = await AppUtils.API.post(url, payload);
            }

            if (res.success) {
                AppUtils.Notify.success(res.message || "Lưu thành công!");
                this.config.onSuccess(res);
            } 
            else if (res.require_confirm && res.conflicts) {
                this._setLoading(false);
                this.showConflictConfirm(res.conflicts);
            }
            else if (res.data && res.data.require_confirm && res.data.conflicts) {
                this._setLoading(false);
                this.showConflictConfirm(res.data.conflicts);
            }
            else {
                AppUtils.Notify.error(res.message || "Có lỗi xảy ra");
                this._setLoading(false);
            }
        } catch (err) {
            console.error('⛔ Submit error:', err);
            AppUtils.Notify.error("Lỗi hệ thống:  " + (err.message || err));
            this._setLoading(false);
        }
    }

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
            listHtml += `<li class="py-1 text-slate-500 italic">...và ${empConflicts.length - 10} nhân viên khác</li>`;
        }

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
                deptHtml += `<li class="py-1 text-slate-500 italic">...và ${deptConflicts.length - 5} bộ phận khác</li>`;
            }
        }

        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        const formatDate = (d) => `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;

        const message = `
            ${empConflicts.length ?  `<p class="text-sm text-slate-600 mb-2">Các nhân viên sau đang thuộc lịch làm việc khác: </p>
            <ul class="list-disc pl-5 text-xs max-h-40 overflow-y-auto bg-slate-50 rounded p-2 mb-3">${listHtml}</ul>` : ''}
            ${deptHtml ?  `<p class="text-sm text-slate-600 mb-2">Các bộ phận sau đang thuộc lịch làm việc khác:</p>
            <ul class="list-disc pl-5 text-xs max-h-40 overflow-y-auto bg-slate-50 rounded p-2 mb-3">${deptHtml}</ul>` : ''}
            
            <div class="border-t border-slate-200 pt-3 mt-3">
                <p class="text-sm font-medium text-slate-700 mb-2">Chọn ngày bắt đầu áp dụng lịch mới:</p>
                <div class="flex gap-4">
                    <label class="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="confirm_effective_date" value="today" checked class="text-blue-600 focus:ring-blue-500">
                        <span class="text-sm">Hôm nay (${formatDate(today)})</span>
                    </label>
                    <label class="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="confirm_effective_date" value="tomorrow" class="text-blue-600 focus:ring-blue-500">
                        <span class="text-sm">Ngày mai (${formatDate(tomorrow)})</span>
                    </label>
                </div>
            </div>
            
            <p class="text-sm text-slate-600 mt-3">Bạn có muốn chuyển các đối tượng này sang lịch làm việc mới không?</p>
            <p class="text-xs text-slate-400 mt-1"><i class="fas fa-info-circle mr-1"></i>Dữ liệu lịch làm việc trước ngày áp dụng sẽ được giữ nguyên.</p>
        `;

        this.showCustomConfirmModal({
            title: 'Cảnh báo xung đột',
            message,
            confirmText: 'Đồng ý chuyển',
            cancelText:  'Hủy',
            type: 'warning',
            onConfirm: () => {
                const modal = document.getElementById('custom-conflict-modal');
                const selectedDate = modal?.querySelector('input[name="confirm_effective_date"]:checked')?.value || 'today';
                this.submitWithForce(selectedDate);
            },
            onCancel: () => {}
        });
    }

    async submitWithForce(effectiveDate = 'today') {
        if (! this.pendingPayload) return;

        this.pendingPayload.force_transfer = true;
        this.pendingPayload.effective_date = effectiveDate;

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
                    const dateText = effectiveDate === 'tomorrow' ? 'từ ngày mai' : 'từ hôm nay';
                    AppUtils.Notify.success(`Lưu thành công! Đã chuyển ${res.transferred.length} đối tượng sang lịch mới ${dateText}.`);
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
            AppUtils.Notify.error("Lỗi hệ thống: " + (err.message || err));
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
                    <div class="flex items-start gap-4 mb-4">
                        <div class="shrink-0 w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center">
                            ${iconHtml}
                        </div>
                        <div class="flex-1">
                            <h3 class="text-lg font-semibold text-slate-900">${title}</h3>
                            <div class="mt-2 text-sm text-slate-600">${message}</div>
                        </div>
                    </div>
                    
                    <div class="flex justify-end gap-3 mt-6">
                        <button type="button" id="conflict-cancel-btn" class="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors">
                            ${cancelText}
                        </button>
                        <button type="button" id="conflict-confirm-btn" class="px-5 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors shadow-sm">
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

        requestAnimationFrame(() => {
            modalContent.classList.remove('scale-95', 'opacity-0');
            modalContent.classList.add('scale-100', 'opacity-100');
        });

        const closeModal = () => {
            modalContent.classList.add('scale-95', 'opacity-0');
            modalContent.classList.remove('scale-100', 'opacity-100');
            setTimeout(() => modal.remove(), 200);
        };

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal();
                onCancel();
            }
        });

        cancelBtn.addEventListener('click', () => {
            closeModal();
            onCancel();
        });

        confirmBtn.addEventListener('click', () => {
            closeModal();
            onConfirm();
        });
    }

    // ============================================================
    // BUILD PAYLOAD
    // ============================================================
    buildPayload() {
        const formData = new FormData(this.form);
        const loaiKichBan = formData.get('loaikichban') || 'CO_DINH';
        
        const effectiveDateRadio = this.form.querySelector('input[name="effective_date"]:checked');
        const effectiveDate = effectiveDateRadio ?  effectiveDateRadio.value :  'today';
        
        const payload = {
            TenNhom: formData.get('tenlichlamviec')?.trim() || '',
            MaNhom: formData.get('malichlamviec')?.trim().toUpperCase() || '',
            ApDung_PhongBan: this.currentSelection.deptIds || [],
            ApDung_NhanVien: this.currentSelection.empIds || [],
            LoaiKichBan: loaiKichBan,
            CoLichNghi: document.getElementById('toggle-lichnghi')?.checked || false,
            effective_date: effectiveDate,
        };

        if (loaiKichBan === 'CO_DINH') {
            const fixedData = this.fixedSchedule.getData();
            payload.ChiTietCa = fixedData.ChiTietCa;
            payload.MasterShifts = fixedData.MasterShifts;

        } else if (loaiKichBan === 'LICH_TRINH') {
            const danhSachCaApDung = [];
            this.stateLT.selectedShifts.forEach((shift, id) => {
                if (id !== '0') {
                    danhSachCaApDung.push({
                        id: parseInt(id),
                        TenCa: shift.TenCa,
                        KhungGio: shift.KhungGio || []
                    });
                }
            });
            payload.DanhSachCaApDung = danhSachCaApDung;
            
            payload.DanhSachChuKy = this.cycleManager.getCycles().map(cycle => ({
                TenChuKy: cycle.TenChuKy,
                MaChuKy: cycle.MaChuKy,
                SoNgayLap: cycle.SoNgayLap,
                ChiTietNgay: cycle.ChiTietNgay
            }));
            
            payload.ScheduleData = this.scheduleCalendar.getScheduleData();
        }

        return payload;
    }

    validateData(payload) {
        if (payload.LoaiKichBan === 'CO_DINH' && payload.ChiTietCa.length === 0) {
            AppUtils.Notify.warning('Vui lòng cấu hình lịch làm việc (chọn ngày và ca)');
            return "Chưa cấu hình lịch";
        }
        
        if (payload.LoaiKichBan === 'LICH_TRINH') {
            if (! payload.DanhSachChuKy || payload.DanhSachChuKy.length === 0) {
                AppUtils.Notify.warning('Vui lòng thêm ít nhất một chu kỳ làm việc');
                return "Chưa cấu hình chu kỳ";
            }
            
            for (const cycle of payload.DanhSachChuKy) {
                if (!cycle.TenChuKy || ! cycle.MaChuKy) {
                    AppUtils.Notify.warning('Tên và mã chu kỳ không được để trống');
                    return "Thiếu thông tin chu kỳ";
                }
            }
        }
        
        return null;
    }

    // ============================================================
    // FILL DATA (FOR UPDATE MODE)
    // ============================================================
    fillData(data) {
        this.setFieldValue('tenlichlamviec', data.TenNhom);
        this.setFieldValue('malichlamviec', data.MaNhom);
        
        if (this.state.isUpdateMode) {
            this.disableCodeField();
        }
        
        const radioValue = data.LoaiKichBan || 'CO_DINH';
        const radio = this.form?.querySelector(`input[name="loaikichban"][value="${radioValue}"]`);
        if (radio) {
            radio.checked = true;
            radio.dispatchEvent(new Event('change'));
        }

        this.currentSelection = {
            depts: data.Depts || [],
            emps: data.Emps || [],
            deptIds: data.ApDung_PhongBan || [],
            empIds: data.ApDung_NhanVien || []
        };
        this.updateSelectionUI(this.currentSelection);

        if (radioValue === 'CO_DINH') {
            this._fillCoDinhData(data);
        } else if (radioValue === 'LICH_TRINH') {
            this._fillLichTrinhData(data);
        }
    }

    _fillCoDinhData(data) {
        this.fixedSchedule.setData(data);
    }

    _fillLichTrinhData(data) {
        const dayOff = { id: 0, TenCa: 'Ngày nghỉ', KhungGio: [], colorClass: 'bg-slate-400 text-white' };
        this.stateLT.selectedShifts.clear();
        this.stateLT.selectedShifts.set('0', dayOff);
        
        const danhSachCa = data.DanhSachCaApDung || [];
        
        if (danhSachCa.length > 0) {
            danhSachCa.forEach((ca, idx) => {
                const idStr = ca.id.toString();
                const colorClass = this.stateLT.colors[idx % this.stateLT.colors.length] + ' text-white';
                
                this.stateLT.selectedShifts.set(idStr, {
                    id: ca.id,
                    TenCa: ca.TenCa,
                    KhungGio: ca.KhungGio || [],
                    colorClass: colorClass
                });
            });
        }
        
        this.renderLTBadges();
        
        const danhSachChuKy = data.DanhSachChuKy || [];
        if (danhSachChuKy.length > 0) {
            const cycles = danhSachChuKy.map((cycle, idx) => {
                const chiTietWithColor = (cycle.ChiTietNgay || []).map(ct => {
                    if (ct.CaID !== null && ct.CaID !== undefined) {
                        const shiftInfo = this.stateLT.selectedShifts.get(ct.CaID.toString());
                        return {
                            ...ct,
                            TenCa: shiftInfo?.TenCa || ct.TenCa,
                            KhungGio: shiftInfo?.KhungGio || ct.KhungGio || [],
                            colorClass: shiftInfo?.colorClass || 'bg-blue-500 text-white'
                        };
                    }
                    return ct;
                });
                
                return {
                    id: cycle.id || Date.now() + idx,
                    TenChuKy:  cycle.TenChuKy,
                    MaChuKy: cycle.MaChuKy,
                    SoNgayLap: cycle.SoNgayLap,
                    ChiTietNgay: chiTietWithColor
                };
            });
            
            this.cycleManager.setCycles(cycles);
        }
        
        const scheduleDataRaw = data.ScheduleData || {};
        if (Object.keys(scheduleDataRaw).length > 0) {
            this.scheduleCalendar.setScheduleData(scheduleDataRaw);
        } else {
            this.scheduleCalendar.render();
        }
    }

    destroy() {
        if (this.scheduleCalendar) {
            this.scheduleCalendar.destroy();
        }
        
        if (window.lichFormController === this) {
            window.lichFormController = null;
        }
    }
}

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('lich-form')) {
        window.lichFormController = new LichFormController();
        window.lichFormController.init();
        
        window.addEventListener('beforeunload', () => {
            window.lichFormController?.destroy();
        });
    }
});