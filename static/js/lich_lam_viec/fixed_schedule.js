/**
 * File: static/js/lich_lam_viec/fixed_schedule.js
 * Version: 1.0 - Refactored từ lich_form.js
 * Description: Quản lý lịch cố định theo tuần (T2-CN)
 */

class FixedScheduleManager {
    constructor(options) {
        this.options = {
            weeklyBodyId: 'weekly-schedule-body',
            checkAllDaysId: 'check-all-days',
            masterDisplayId: 'master-shift-display',
            shiftSelector: options.shiftSelector,
            onMasterChange: options.onMasterChange || (() => {}),
            onDataChange: options.onDataChange || (() => {}),
            openShiftDetail: options.openShiftDetail || (() => {}),
            ...options
        };

        this.weeklyBody = document.getElementById(this.options.weeklyBodyId);
        this.checkAllDays = document.getElementById(this.options.checkAllDaysId);
        this.masterDisplay = document.getElementById(this.options.masterDisplayId);

        this.weeklyData = this.initWeeklyData();
        this.masterShifts = [];
        this.currentEditingDay = null;

        this.init();
    }

    init() {
        this.bindEvents();
        this.renderWeeklyTable();
    }

    initWeeklyData() {
        const days = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];
        return days.map((name, idx) => ({
            dayIndex: idx,
            dayName: name,
            isChecked: idx < 5,
            shifts: []
        }));
    }

    bindEvents() {
        if (this.checkAllDays) {
            this.checkAllDays.addEventListener('change', (e) => {
                const checked = e.target.checked;
                this.weeklyData.forEach(d => {
                    d.isChecked = checked;
                    if (checked && d.shifts.length === 0 && this.masterShifts.length > 0) {
                        d.shifts = JSON.parse(JSON.stringify(this.masterShifts));
                    }
                });
                this.renderWeeklyTable();
            });
        }

        if (this.weeklyBody) {
            this.weeklyBody.addEventListener('click', (e) => {
                const target = e.target;
                const row = target.closest('tr');
                if (! row) return;
                const idx = parseInt(row.dataset.index);

                if (target.classList.contains('day-checkbox')) {
                    const isChecked = target.checked;
                    this.weeklyData[idx].isChecked = isChecked;
                    
                    if (isChecked && this.weeklyData[idx].shifts.length === 0 && this.masterShifts.length > 0) {
                        this.weeklyData[idx].shifts = JSON.parse(JSON.stringify(this.masterShifts));
                    }

                    const err = ScheduleValidator.checkWeeklyCrossDayOverlap(this.weeklyData);
                    if (err) {
                        this.weeklyData[idx].isChecked = false;
                        this.weeklyData[idx].shifts = [];
                        target.checked = false;
                        AppUtils.Notify.error(err);
                    }

                    this.renderWeeklyTable();
                    this.updateCheckAllState();
                    this.options.onDataChange();
                }

                if (target.closest('.btn-edit-day')) {
                    e.preventDefault();
                    this.currentEditingDay = idx;
                    this.options.shiftSelector.open(this.weeklyData[idx].shifts);
                }

                if (target.closest('.btn-view-day')) {
                    e.preventDefault();
                    const shiftId = target.closest('.btn-view-day').dataset.id;
                    this.options.openShiftDetail(shiftId);
                }
            });
        }

        this.bindMasterEvents();
    }

    bindMasterEvents() {
        const editBtn = document.getElementById('btn-master-edit');
        if (editBtn) {
            const newBtn = editBtn.cloneNode(true);
            editBtn.parentNode.replaceChild(newBtn, editBtn);
            
            newBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.currentEditingDay = 'MASTER';
                this.options.shiftSelector.open(this.masterShifts);
            });
        }

        const viewBtns = this.masterDisplay?.querySelectorAll('.btn-view-master-shift');
        viewBtns?.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const id = btn.dataset.id;
                this.options.openShiftDetail(id);
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

        const removedDays = ScheduleValidator.autoResolveWeeklyConflicts(this.weeklyData);

        if (removedDays.length > 0) {
            AppUtils.Notify.warning(
                `Hệ thống đã tự động bỏ chọn:  <b>${removedDays.join(', ')}</b> do trùng thời gian làm việc với các ngày trước đó.`
            );
        }

        this.renderWeeklyTable();
        this.options.onDataChange();
    }

    updateMasterDisplay(shifts) {
        if (! this.masterDisplay) return;
        const container = this.masterDisplay;
        
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

        this.bindMasterEvents();
        this.options.onMasterChange(shifts);
    }

    renderWeeklyTable() {
        if (!this.weeklyBody) return;
        
        const html = this.weeklyData.map(day => {
            const isOff = ! day.isChecked;
            let displayStr = '';
            
            if (isOff) {
                displayStr = '<span class="text-slate-500 italic">Ngày nghỉ</span>';
            } else if (! day.shifts || day.shifts.length === 0) {
                displayStr = '<span class="text-slate-400 italic">Chưa chọn ca</span>';
            } else {
                displayStr = `<div class="flex flex-col gap-1.5">
                    ${day.shifts.map(s => {
                        const timeStr = (s.KhungGio || []).join(', ');
                        return `
                            <div class="flex items-center gap-2">
                                <span class="font-bold text-slate-700 text-sm whitespace-nowrap">${s.TenCa}</span>
                                <span class="text-xs text-slate-500 font-mono bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">${timeStr}</span>
                                <button type="button" class="btn-view-day text-green-600 hover: text-green-800 p-1 rounded hover:bg-green-100 transition-colors ml-1" title="Xem chi tiết" data-id="${s.id}">
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
        
        this.weeklyBody.innerHTML = html;
        this.updateCheckAllState();
    }

    updateCheckAllState() {
        const all = this.weeklyData.every(d => d.isChecked);
        const some = this.weeklyData.some(d => d.isChecked);
        if (this.checkAllDays) {
            this.checkAllDays.checked = all;
            this.checkAllDays.indeterminate = some && !all;
        }
    }

    // Public API
    getData() {
        const fixedDetails = [];
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
        return {
            ChiTietCa: fixedDetails,
            MasterShifts: this.masterShifts.map(s => ({
                id: s.id,
                TenCa: s.TenCa,
                KhungGio: s.KhungGio || []
            }))
        };
    }

    setData(data) {
        if (data.ChiTietCa && Array.isArray(data.ChiTietCa) && data.ChiTietCa.length > 0) {
            this.weeklyData.forEach(d => {
                d.isChecked = false;
                d.shifts = [];
            });
            
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
            
            const masterShiftsData = data.MasterShifts || data.DanhSachCaApDung || [];
            if (masterShiftsData.length > 0) {
                this.masterShifts = masterShiftsData.map(s => ({
                    id: s.id,
                    TenCa: s.TenCa,
                    KhungGio: s.KhungGio || []
                }));
            } else {
                this.masterShifts = [];
            }
            
            this.updateMasterDisplay(this.masterShifts);
        }
        
        this.renderWeeklyTable();
    }

    getMasterShifts() {
        return this.masterShifts;
    }

    setMasterShifts(shifts) {
        this.masterShifts = shifts || [];
        this.updateMasterDisplay(this.masterShifts);
    }

    getCurrentEditingDay() {
        return this.currentEditingDay;
    }
}

window.FixedScheduleManager = FixedScheduleManager;