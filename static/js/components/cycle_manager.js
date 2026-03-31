/**
 * File: static/js/components/cycle_manager.js
 * Version: 1.0 - Refactored từ lich_form.js
 * Description: Component quản lý chu kỳ làm việc
 */

class CycleManager {
    constructor(options) {
        this.options = {
            modalId: 'cycle-modal',
            tableBodyId: 'cycle-table-body',
            getAvailableShifts: options.getAvailableShifts || (() => []),
            onSave: options.onSave || (() => {}),
            onDelete: options.onDelete || (() => {}),
            ...options
        };

        this.modal = document.getElementById(this.options.modalId);
        this.tableBody = document.getElementById(this.options.tableBodyId);
        
        this.cycles = [];
        this.cycleFormState = {};
        
        this.init();
    }

    init() {
        if (!this.modal) return;
        
        this.initCycleModal();
        this.bindModalEvents();
    }

    initCycleModal() {
        const nameInput = document.getElementById('cycle-name');
        const codeInput = document.getElementById('cycle-code');
        const repeatInput = document.getElementById('cycle-repeat-days');
        
        let isCodeManuallyEdited = false;

        if (nameInput && codeInput) {
            nameInput.addEventListener('input', () => {
                if (! isCodeManuallyEdited) {
                    codeInput.value = AppUtils.Helper.generateCode(nameInput.value);
                }
            });

            codeInput.addEventListener('input', (e) => {
                e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '');
                if (e.target.value.trim() === '') {
                    isCodeManuallyEdited = false;
                    codeInput.value = AppUtils.Helper.generateCode(nameInput.value);
                } else {
                    isCodeManuallyEdited = true;
                }
            });
        }

        if (repeatInput) {
            repeatInput.addEventListener('input', () => this.renderCycleDays());
        }

        const modal = this.modal;
        if (modal) {
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                        if (! modal.classList.contains('hidden')) {
                            const editingIndex = document.getElementById('cycle-editing-index')?.value;
                            if (editingIndex === '-1') {
                                this.resetCycleForm();
                            }
                            setTimeout(() => this.renderCycleDays(), 100);
                        }
                    }
                });
            });
            observer.observe(modal, { attributes: true });
        }
    }

    bindModalEvents() {
        const submitBtn = this.modal.querySelector('[data-modal-submit]');
        if (submitBtn) {
            submitBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.handleCycleSubmit();
            });
        }

        const closeBtns = this.modal.querySelectorAll('[data-modal-close]');
        closeBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                AppUtils.Modal.close(this.modal);
            });
        });
    }

    resetCycleForm() {
        const nameInput = document.getElementById('cycle-name');
        const codeInput = document.getElementById('cycle-code');
        const repeatInput = document.getElementById('cycle-repeat-days');
        const errorContainer = document.getElementById('cycle-conflict-error');
        const editingIndexInput = document.getElementById('cycle-editing-index');
        const container = document.getElementById('cycle-days-container');

        if (nameInput) nameInput.value = '';
        if (codeInput) codeInput.value = '';
        if (repeatInput) repeatInput.value = '';
        if (errorContainer) errorContainer.classList.add('hidden');
        if (editingIndexInput) editingIndexInput.value = '-1';
        
        this.cycleFormState = {};
        
        if (container) {
            container.innerHTML = '<p class="text-center text-slate-400 text-sm py-8 italic">Vui lòng nhập số ngày lặp để cấu hình</p>';
        }
        
        document.getElementById('cycle-dropdowns-wrapper')?.remove();
        
        const modal = this.modal;
        if (modal) {
            const titleEl = modal.querySelector('.modal-title, [data-modal-title], h3');
            if (titleEl) titleEl.textContent = 'Thêm chu kỳ';
            
            const submitBtn = modal.querySelector('[data-modal-submit]');
            if (submitBtn) submitBtn.textContent = 'Chọn';
        }
    }

    renderCycleDays() {
        const container = document.getElementById('cycle-days-container');
        const repeatInput = document.getElementById('cycle-repeat-days');
        if (!container || !repeatInput) return;

        document.querySelectorAll('.cycle-day-dropdown').forEach(d => d.remove());

        let numDays = parseInt(repeatInput.value);
        if (isNaN(numDays) || numDays <= 0) {
            container.innerHTML = '<p class="text-center text-slate-400 text-sm py-8 italic">Vui lòng nhập số ngày lặp để cấu hình</p>';
            return;
        }
        if (numDays > 31) {
            numDays = 31;
            repeatInput.value = 31;
        }

         const availableShiftsMap = this.options.getAvailableShifts();
        const availableShifts = Array.from(availableShiftsMap.values()).filter(s => s.id !== 0);

        let rowsHtml = '';
        let dropdownsHtml = '';
        
        for (let i = 1; i <= numDays; i++) {
            const dayShifts = this.cycleFormState[i] || [];
            const rendered = this.renderCycleDayRow(i, dayShifts, availableShifts);
            
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = rendered;
            
            const row = tempDiv.querySelector('.cycle-day-row');
            const dropdown = tempDiv.querySelector('.cycle-day-dropdown');
            
            if (row) rowsHtml += row.outerHTML;
            if (dropdown) dropdownsHtml += dropdown.outerHTML;
        }

        container.innerHTML = rowsHtml;
        
        const dropdownWrapper = document.createElement('div');
        dropdownWrapper.id = 'cycle-dropdowns-wrapper';
        dropdownWrapper.innerHTML = dropdownsHtml;
        
        document.getElementById('cycle-dropdowns-wrapper')?.remove();
        document.body.appendChild(dropdownWrapper);
        
        this.bindCycleDayEvents();
    }

    renderCycleDayRow(dayIndex, selectedShifts, availableShifts) {
        const isRestDay = selectedShifts.length === 1 && selectedShifts[0].id === 0;
        const hasShifts = selectedShifts.length > 0 && ! isRestDay;
        
        let badgesHtml = '';
        if (isRestDay) {
            badgesHtml = `
                <span class="inline-flex items-center gap-1 px-2 py-1 bg-slate-100 text-slate-600 border border-slate-300 rounded text-xs font-medium">
                    <i class="fas fa-moon text-slate-400 text-[10px]"></i>
                    <span>Ngày nghỉ</span>
                    <button type="button" class="btn-remove-cycle-shift shrink-0 hover:text-red-500 transition-colors" data-day="${dayIndex}" data-shift-id="0">
                        <i class="fas fa-times"></i>
                    </button>
                </span>`;
        } else if (hasShifts) {
            badgesHtml = selectedShifts.map(s => {
                const khungGio = (s.KhungGio || []).join(', ');
                const displayText = khungGio ? `${s.TenCa} | ${khungGio}` : s.TenCa;
                return `
                    <span class="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded text-xs font-medium">
                        <span class="truncate max-w-[400px]" title="${this.escapeHtml(displayText)}">${this.escapeHtml(displayText)}</span>
                        <button type="button" class="btn-remove-cycle-shift shrink-0 hover:text-red-500 transition-colors" data-day="${dayIndex}" data-shift-id="${s.id}">
                            <i class="fas fa-times"></i>
                        </button>
                    </span>`;
            }).join('');
        } else {
            badgesHtml = '<span class="text-slate-400 italic text-sm select-none">Ngày nghỉ</span>';
        }

        const selectedIds = selectedShifts.map(s => s.id);
        let dropdownItemsHtml = '';
        
        const isRestDaySelected = selectedIds.includes(0);
        dropdownItemsHtml += `
            <div class="cycle-dropdown-item px-3 py-2.5 text-sm cursor-pointer transition-colors ${isRestDaySelected ? 'bg-slate-100 text-slate-700 font-medium' : 'hover: bg-slate-50 text-slate-600'} border-b border-slate-100" 
                data-day="${dayIndex}" 
                data-shift-id="0"
                data-shift='{"id": 0, "TenCa": "Ngày nghỉ", "KhungGio": []}'
                data-selected="${isRestDaySelected}"
                data-is-rest-day="true">
                <div class="flex items-center gap-2">
                    ${isRestDaySelected ? '<i class="fas fa-check text-slate-500 text-xs w-4"></i>' : '<span class="w-4"></span>'}
                    <i class="fas fa-moon text-slate-400 text-xs"></i>
                    <span>Ngày nghỉ</span>
                </div>
            </div>`;
        const availableShiftsArray = Array.from(availableShifts.values()).filter(s => s. id !== 0);
        if (availableShiftsArray.length > 0) {
            dropdownItemsHtml += availableShiftsArray.map(s => {
                const khungGio = (s.KhungGio || []).join(', ');
                const displayText = khungGio ? `${s.TenCa} | ${khungGio}` : s.TenCa;
                const isSelected = selectedIds.includes(s.id);
                const itemClass = isSelected 
                    ? 'bg-blue-50 text-blue-700 font-medium' 
                    :  'hover:bg-slate-50 text-slate-700';
                
                const shiftDataObj = {
                    id: s.id,
                    TenCa: s.TenCa,
                    KhungGio: s.KhungGio || []
                };
                const shiftDataStr = JSON.stringify(shiftDataObj).replace(/'/g, "&#39;");
                
                return `
                    <div class="cycle-dropdown-item px-3 py-2.5 text-sm cursor-pointer transition-colors ${itemClass} border-b border-slate-50 last:border-b-0" 
                        data-day="${dayIndex}" 
                        data-shift-id="${s.id}"
                        data-shift='${shiftDataStr}'
                        data-selected="${isSelected}"
                        data-is-rest-day="false">
                        <div class="flex items-center gap-2">
                            ${isSelected ? '<i class="fas fa-check text-blue-600 text-xs w-4"></i>' : '<span class="w-4"></span>'}
                            <span class="flex-1" title="${this.escapeHtml(displayText)}">${this.escapeHtml(displayText)}</span>
                        </div>
                    </div>`;
            }).join('');
        } else {
            dropdownItemsHtml += '<div class="px-3 py-4 text-sm text-slate-400 text-center italic">Chưa có ca làm việc. Vui lòng chọn ca ở mục "Chọn ca áp dụng"</div>';
        }

        return `
            <div class="cycle-day-row flex items-start gap-4" data-day-index="${dayIndex}">
                <label class="text-sm font-medium text-slate-600 text-right pt-2 w-16 shrink-0">Ngày ${dayIndex}: </label>
                <div class="flex-1 min-w-0">
                    <div class="cycle-day-container min-h-[42px] px-3 py-2 border border-slate-300 rounded-lg bg-white flex items-center flex-wrap gap-2 cursor-pointer hover:border-blue-500 transition-all"
                        data-day="${dayIndex}">
                        <div class="flex-1 flex items-center flex-wrap gap-2 min-w-0">
                            ${badgesHtml}
                        </div>
                        <span class="text-slate-400 pointer-events-none shrink-0 ml-2">
                            <i class="fas fa-chevron-down text-xs"></i>
                        </span>
                    </div>
                </div>
            </div>
            
            <div class="cycle-day-dropdown fixed hidden bg-white border border-slate-200 rounded-lg shadow-2xl max-h-[300px] overflow-y-auto z-[99999]" 
                id="cycle-day-${dayIndex}-dropdown"
                data-day="${dayIndex}">
                ${dropdownItemsHtml}
            </div>`;
    }

    bindCycleDayEvents() {
        const container = document.getElementById('cycle-days-container');
        if (!container) return;

        const closeAllDropdowns = () => {
            document.querySelectorAll('.cycle-day-dropdown').forEach(d => {
                d.classList.add('hidden');
            });
        };

        container.querySelectorAll('.cycle-day-container').forEach(el => {
            el.addEventListener('click', (e) => {
                if (e.target.closest('.btn-remove-cycle-shift')) return;
                
                const dayIndex = el.dataset.day;
                const dropdown = document.getElementById(`cycle-day-${dayIndex}-dropdown`);
                const isHidden = dropdown.classList.contains('hidden');
                
                closeAllDropdowns();
                
                if (isHidden) {
                    const rect = el.getBoundingClientRect();
                    const viewportHeight = window.innerHeight;
                    const viewportWidth = window.innerWidth;
                    
                    dropdown.style.width = Math.max(rect.width, 350) + 'px';
                    dropdown.style.minWidth = '350px';
                    
                    let left = rect.left;
                    if (left + 400 > viewportWidth) {
                        left = viewportWidth - 420;
                    }
                    dropdown.style.left = left + 'px';
                    
                    dropdown.classList.remove('hidden');
                    const dropdownHeight = dropdown.offsetHeight;
                    
                    const spaceBelow = viewportHeight - rect.bottom - 10;
                    const spaceAbove = rect.top - 10;
                    
                    if (spaceBelow >= dropdownHeight || spaceBelow >= spaceAbove) {
                        dropdown.style.top = (rect.bottom + 4) + 'px';
                        dropdown.style.bottom = 'auto';
                    } else {
                        dropdown.style.top = 'auto';
                        dropdown.style.bottom = (viewportHeight - rect.top + 4) + 'px';
                    }
                }
                
                e.stopPropagation();
            });
        });

        document.querySelectorAll('.cycle-day-dropdown .cycle-dropdown-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                
                const dayIndex = parseInt(item.dataset.day);
                const shiftId = parseInt(item.dataset.shiftId);
                const isSelected = item.dataset.selected === 'true';
                const isRestDay = item.dataset.isRestDay === 'true';
                
                if (isSelected) {
                    if (this.cycleFormState[dayIndex]) {
                        this.cycleFormState[dayIndex] = this.cycleFormState[dayIndex].filter(s => s.id !== shiftId);
                    }
                    closeAllDropdowns();
                    this.renderCycleDays();
                    return;
                }
                
                const shiftData = JSON.parse(item.dataset.shift.replace(/&#39;/g, "'"));
                
                if (isRestDay) {
                    this.cycleFormState[dayIndex] = [{ id: 0, TenCa: 'Ngày nghỉ', KhungGio: [] }];
                    closeAllDropdowns();
                    this.renderCycleDays();
                    this.hideCycleError();
                    return;
                }
                
                if (! this.cycleFormState[dayIndex]) {
                    this.cycleFormState[dayIndex] = [];
                }
                this.cycleFormState[dayIndex] = this.cycleFormState[dayIndex].filter(s => s.id !== 0);
                
                const repeatInput = document.getElementById('cycle-repeat-days');
                const numDays = parseInt(repeatInput?.value) || 0;
                
                const conflictInDay = ScheduleValidator.checkCycleShiftConflictInDay(dayIndex, shiftData, this.cycleFormState);
                if (conflictInDay) {
                    AppUtils.Notify.error(conflictInDay);
                    return;
                }

                const conflictCrossDay = ScheduleValidator.checkCycleShiftConflictCrossDay(dayIndex, shiftData, this.cycleFormState, numDays);
                if (conflictCrossDay) {
                    AppUtils.Notify.error(conflictCrossDay);
                    return;
                }

                this.cycleFormState[dayIndex].push(shiftData);

                closeAllDropdowns();
                this.renderCycleDays();
                this.hideCycleError();
            });
        });

        container.querySelectorAll('.btn-remove-cycle-shift').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                const dayIndex = parseInt(btn.dataset.day);
                const shiftId = parseInt(btn.dataset.shiftId);
                
                if (this.cycleFormState[dayIndex]) {
                    this.cycleFormState[dayIndex] = this.cycleFormState[dayIndex].filter(s => s.id !== shiftId);
                }
                
                this.renderCycleDays();
            });
        });

        document.addEventListener('click', (e) => {
            if (! e.target.closest('.cycle-day-container') && !e.target.closest('.cycle-day-dropdown')) {
                closeAllDropdowns();
            }
        });

        container.addEventListener('scroll', closeAllDropdowns);
        window.addEventListener('resize', closeAllDropdowns);
    }

    getCycleFormData() {
        const nameInput = document.getElementById('cycle-name');
        const codeInput = document.getElementById('cycle-code');
        const repeatInput = document.getElementById('cycle-repeat-days');
        
        const numDays = parseInt(repeatInput?.value) || 0;
        
        const chiTietNgay = [];
        
        for (let i = 1; i <= numDays; i++) {
            const dayShifts = this.cycleFormState[i] || [];
            
            const isRestDay = dayShifts.length === 0 || (dayShifts.length === 1 && dayShifts[0].id === 0);
            
            if (isRestDay) {
                chiTietNgay.push({
                    NgayTrongChuKy: i,
                    CaID: null,
                    TenCa: 'Ngày nghỉ'
                });
            } else {
                dayShifts.filter(s => s.id !== 0).forEach(shift => {
                    chiTietNgay.push({
                        NgayTrongChuKy: i,
                        CaID: shift.id,
                        TenCa: shift.TenCa
                    });
                });
            }
        }

        return {
            TenChuKy: nameInput?.value?.trim() || '',
            MaChuKy: codeInput?.value?.trim().toUpperCase() || '',
            SoNgayLap: numDays,
            ChiTietNgay: chiTietNgay
        };
    }

    handleCycleSubmit() {
        const nameInput = document.getElementById('cycle-name');
        const codeInput = document.getElementById('cycle-code');
        const repeatInput = document.getElementById('cycle-repeat-days');
        const editingIndexInput = document.getElementById('cycle-editing-index');
        
        if (!nameInput?.value?.trim()) {
            AppUtils.Notify.warning('Vui lòng nhập tên chu kỳ');
            nameInput?.focus();
            return;
        }
        
        if (!codeInput?.value?.trim()) {
            AppUtils.Notify.warning('Vui lòng nhập mã chu kỳ');
            codeInput?.focus();
            return;
        }
        
        if (! AppUtils.Validation.isValidCode(codeInput.value.trim())) {
            AppUtils.Notify.warning('Mã chu kỳ chỉ được chứa chữ, số, gạch ngang và gạch dưới');
            codeInput?.focus();
            return;
        }
        
        const numDays = parseInt(repeatInput?.value) || 0;
        if (numDays <= 0 || numDays > 31) {
            AppUtils.Notify.warning('Số ngày lặp phải từ 1 đến 31');
            repeatInput?.focus();
            return;
        }
        
        const circularError = ScheduleValidator.validateCycleBeforeSubmit(this.cycleFormState, numDays);
        if (circularError) {
            AppUtils.Notify.error(circularError);
            this.showCycleError(circularError);
            return;
        }

        const cycleData = this.getCycleFormData();
        
        const editingIndex = parseInt(editingIndexInput?.value);
        const isEditMode = ! isNaN(editingIndex) && editingIndex >= 0 && editingIndex < this.cycles.length;
        
        if (isEditMode) {
            const existingId = this.cycles[editingIndex].id;
            this.cycles[editingIndex] = {
                id: existingId,
                ...cycleData
            };
            AppUtils.Notify.success('Cập nhật chu kỳ thành công');
        } else {
            this.cycles.push({
                id: Date.now(),
                ...cycleData
            });
            AppUtils.Notify.success('Thêm chu kỳ thành công');
        }

        this.renderCycleTable();
        AppUtils.Modal.close(this.modal);
        this.resetCycleForm();
        
        if (this.options.onSave) {
            this.options.onSave(this.cycles);
        }
    }

    renderCycleTable() {
        if (!this.tableBody) return;

        if (this.cycles.length === 0) {
            this.tableBody.innerHTML = `
                <tr>
                    <td colspan="4" class="px-4 py-8 text-center text-slate-400 italic">
                        Chưa có chu kỳ nào được thêm
                    </td>
                </tr>`;
            return;
        }

        const availableShiftsMap  = this.options.getAvailableShifts();

        const html = this.cycles.map((cycle, idx) => {
            const shiftNames = [];
            const uniqueCaIds = new Set();
            
            if (cycle.ChiTietNgay) {
                cycle.ChiTietNgay.forEach(d => {
                    if (d.CaID !== null && d.CaID !== undefined && ! uniqueCaIds.has(d.CaID)) {
                        uniqueCaIds.add(d.CaID);
                        const shift = availableShiftsMap.get(d.CaID.toString());
                        shiftNames.push(shift?.TenCa || d.TenCa || `Ca #${d.CaID}`);
                    }
                });
            }
            
            const shiftDisplay = shiftNames.length > 0 ? shiftNames.join(', ') : 'Toàn bộ ngày nghỉ';

            return `
                <tr class="hover:bg-slate-50 transition-colors border-b border-slate-100">
                    <td class="px-4 py-3 text-sm font-medium text-slate-900">${cycle.TenChuKy || ''}</td>
                    <td class="px-4 py-3 text-sm text-slate-600">${shiftDisplay}</td>
                    <td class="px-4 py-3 text-sm text-slate-600">${cycle.SoNgayLap || 0} ngày</td>
                    <td class="px-4 py-3 text-right">
                        <div class="flex items-center justify-end gap-2">
                            <button type="button" class="btn-edit-cycle text-blue-500 hover:text-blue-700 p-1" data-index="${idx}" title="Sửa">
                                <i class="fas fa-pen"></i>
                            </button>
                            <button type="button" class="btn-delete-cycle text-red-500 hover:text-red-700 p-1" data-index="${idx}" title="Xóa">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>`;
        }).join('');

        this.tableBody.innerHTML = html;

        this.tableBody.querySelectorAll('.btn-edit-cycle').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const idx = parseInt(btn.dataset.index);
                this.openCycleForEdit(idx);
            });
        });

        this.tableBody.querySelectorAll('.btn-delete-cycle').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const idx = parseInt(btn.dataset.index);
                
                AppUtils.Modal.showConfirm({
                    title: 'Xác nhận xóa',
                    message: `Bạn có chắc chắn muốn xóa chu kỳ "${this.cycles[idx]?.TenChuKy}"?`,
                    type: 'danger',
                    confirmText: 'Xóa',
                    onConfirm: () => {
                        this.cycles.splice(idx, 1);
                        this.renderCycleTable();
                        AppUtils.Notify.success('Đã xóa chu kỳ');
                        
                        if (this.options.onDelete) {
                            this.options.onDelete(this.cycles);
                        }
                    }
                });
            });
        });
    }

    openCycleForEdit(index) {
        const cycle = this.cycles[index];
        if (!cycle) return;

        const editingIndexInput = document.getElementById('cycle-editing-index');
        if (editingIndexInput) editingIndexInput.value = index;

        const nameInput = document.getElementById('cycle-name');
        const codeInput = document.getElementById('cycle-code');
        const repeatInput = document.getElementById('cycle-repeat-days');

        if (nameInput) nameInput.value = cycle.TenChuKy || '';
        if (codeInput) codeInput.value = cycle.MaChuKy || '';
        if (repeatInput) repeatInput.value = cycle.SoNgayLap || '';

        this.cycleFormState = {};

        const availableShiftsMap = this.options.getAvailableShifts();

        if (cycle.ChiTietNgay && Array.isArray(cycle.ChiTietNgay)) {
            cycle.ChiTietNgay.forEach(detail => {
                const dayIndex = detail.NgayTrongChuKy;
                
                if (detail.CaID === null || detail.CaID === undefined) {
                    if (! this.cycleFormState[dayIndex]) {
                        this.cycleFormState[dayIndex] = [];
                    }
                    if (this.cycleFormState[dayIndex].length === 0) {
                        this.cycleFormState[dayIndex].push({
                            id: 0,
                            TenCa: 'Ngày nghỉ',
                            KhungGio: []
                        });
                    }
                } else {
                    const shiftInfo = availableShiftsMap.get(detail.CaID.toString());
                    
                    if (! this.cycleFormState[dayIndex]) {
                        this.cycleFormState[dayIndex] = [];
                    }
                    
                    this.cycleFormState[dayIndex] = this.cycleFormState[dayIndex].filter(s => s.id !== 0);
                    
                    const alreadyExists = this.cycleFormState[dayIndex].some(s => s.id === detail.CaID);
                    if (!alreadyExists) {
                        this.cycleFormState[dayIndex].push({
                            id: detail.CaID,
                            TenCa: shiftInfo?.TenCa || detail.TenCa || `Ca #${detail.CaID}`,
                            KhungGio: shiftInfo?.KhungGio || detail.KhungGio || []
                        });
                    }
                }
            });
        }

        this.renderCycleDays();

        if (this.modal) {
            const titleEl = this.modal.querySelector('.modal-title, [data-modal-title], h3');
            if (titleEl) titleEl.textContent = 'Sửa chu kỳ';
            
            const submitBtn = this.modal.querySelector('[data-modal-submit]');
            if (submitBtn) submitBtn.textContent = 'Cập nhật';
            
            AppUtils.Modal.open(this.modal);
        }
    }

    showCycleError(message) {
        const errorContainer = document.getElementById('cycle-conflict-error');
        const errorMessage = document.getElementById('cycle-conflict-message');
        if (errorContainer && errorMessage) {
            errorMessage.textContent = message;
            errorContainer.classList.remove('hidden');
        }
    }

    hideCycleError() {
        const errorContainer = document.getElementById('cycle-conflict-error');
        if (errorContainer) {
            errorContainer.classList.add('hidden');
        }
    }

    escapeHtml(text) {
        if (! text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Public API
    open() {
        this.resetCycleForm();
        const editingIndex = document.getElementById('cycle-editing-index');
        if (editingIndex) editingIndex.value = '-1';
        
        if (this.modal) AppUtils.Modal.open(this.modal);
    }

    getCycles() {
        return this.cycles;
    }

    setCycles(cycles) {
        this.cycles = cycles || [];
        this.renderCycleTable();
    }
}

window.CycleManager = CycleManager;