/**
 * File: static/js/components/schedule_calendar.js
 * Version: 1.0 - Refactored từ lich_form.js
 * Description: Component bảng lịch tháng với pagination, search, cell popover
 */

class ScheduleCalendar {
    constructor(options) {
        this.options = {
            headerContainerId: 'lt-table-header',
            bodyContainerId: 'lt-table-body',
            paginationContainerId: 'lt-pagination-container',
            searchInputId: 'lt-emp-search',
            year: options.year || new Date().getFullYear(),
            month: options.month || new Date().getMonth() + 1,
            getEmployees: options.getEmployees || (() => []),
            getSelectedShifts: options.getSelectedShifts || (() => new Map()),
            getCycles: options.getCycles || (() => []),
            onDataChange: options.onDataChange || (() => {}),
            ...options
        };

        this.headerContainer = document.getElementById(this.options.headerContainerId);
        this.bodyContainer = document.getElementById(this.options.bodyContainerId);
        this.paginationContainer = document.getElementById(this.options.paginationContainerId);
        this.searchInput = document.getElementById(this.options.searchInputId);

        this.scheduleData = new Map();
        this.year = this.options.year;
        this.month = this.options.month;
        
        this.pagination = {
            page: 1,
            pageSize: 10,
            total:  0
        };
        
        this.searchQuery = '';
        this.paginationEventManager = AppUtils.EventManager.create();  // Cho pagination
        this.cellEventManager = AppUtils.EventManager.create();  

        this.init();
    }

    init() {
        this.initPagination();
        this.initSearch();
    }

    initPagination() {
        if (! this.paginationContainer) return;

        this.paginationEls = {
            prev: this.paginationContainer.querySelector('.pagination-prev'),
            next: this.paginationContainer.querySelector('.pagination-next'),
            current: this.paginationContainer.querySelector('.pagination-current'),
            totalPages: this.paginationContainer.querySelector('.pagination-total-pages'),
            pageSize: this.paginationContainer.querySelector('.pagination-page-size'),
            info: this.paginationContainer.querySelector('.pagination-info')
        };

        if (this.paginationEls.prev) {
            this.paginationEventManager.add(this.paginationEls.prev, 'click', () => {
                if (this.pagination.page > 1) {
                    this.pagination.page--;
                    this.render();
                }
            });
        }

        if (this.paginationEls.next) {
            this.paginationEventManager.add(this.paginationEls.next, 'click', () => {
                const totalPages = Math.ceil(this.pagination.total / this.pagination.pageSize);
                if (this.pagination.page < totalPages) {
                    this.pagination.page++;
                    this.render();
                }
            });
        }

        if (this.paginationEls.pageSize) {
            this.paginationEventManager.add(this.paginationEls.pageSize, 'change', (e) => {
                this.pagination.pageSize = parseInt(e.target.value);
                this.pagination.page = 1;
                this.render();
            });
        }
    }

    initSearch() {
        if (!this.searchInput) return;

        const debouncedSearch = AppUtils.Helper.debounce((value) => {
            this.searchQuery = value.toLowerCase().trim();
            this.pagination.page = 1;
            this.render();
        }, 300);

        this.paginationEventManager.add(this.searchInput, 'input', (e) => {
            debouncedSearch(e.target.value);
        });

        this.paginationEventManager.add(this.searchInput, 'keydown', (e) => {
            if (e.key === 'Escape') {
                e.target.value = '';
                this.searchQuery = '';
                this.pagination.page = 1;
                this.render();
            }
        });
    }

    setMonthYear(year, month) {
        this.year = year;
        this.month = month;
        this.render();
    }

    render() {
        this.renderHeader();
        this.renderBody();
        // this.updatePagination();
    }

    renderHeader() {
        if (!this.headerContainer) return;

        const daysInMonth = new Date(this.year, this.month, 0).getDate();
        const dayNames = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
        
        const today = new Date();
        const todayYear = today.getFullYear();
        const todayMonth = today.getMonth() + 1;
        const todayDate = today.getDate();

        let headerRow = `<tr>
            <th class="px-4 py-3 border-r border-slate-200 sticky left-0 bg-slate-50 z-30 min-w-[120px] text-left text-xs font-bold text-slate-700">Nhân viên</th>
            <th class="px-4 py-3 border-r border-slate-200 sticky left-[120px] bg-slate-50 z-30 min-w-[80px] text-left text-xs font-bold text-slate-700">Bộ phận</th>`;
        
        for (let i = 1; i <= daysInMonth; i++) {
            const date = new Date(this.year, this.month - 1, i);
            const dName = dayNames[date.getDay()];
            const isToday = this.year === todayYear && this.month === todayMonth && i === todayDate;
            const isPast = new Date(this.year, this.month - 1, i) < new Date(todayYear, todayMonth - 1, todayDate);
            const isSunday = date.getDay() === 0;
            
            let headerClass = 'px-1 py-2 text-center border-r border-slate-200 min-w-[70px] font-medium ';
            let dayClass = isSunday ? 'text-red-500' : 'text-slate-700';
            
            if (isToday) {
                headerClass += 'bg-green-500 text-white';
                dayClass = 'text-white font-bold';
            } else if (isPast) {
                headerClass += 'bg-slate-200';
                dayClass = 'text-slate-400';
            }
            
            headerRow += `
                <th class="${headerClass}">
                    ${isToday ? '<div class="text-[9px] uppercase font-bold">Hôm nay</div>' : `<div class="text-slate-400 text-[9px] uppercase">${dName}</div>`}
                    <div class="${dayClass} font-bold">${i.toString().padStart(2, '0')}</div>
                </th>`;
        }
        this.headerContainer.innerHTML = headerRow + `</tr>`;
    }

    renderBody() {
        if (!this.bodyContainer) return;

        const daysInMonth = new Date(this.year, this.month, 0).getDate();
        const today = new Date();
        const todayYear = today.getFullYear();
        const todayMonth = today.getMonth() + 1;
        const todayDate = today.getDate();

        const rawEmployees = this.options.getEmployees();
        const allEmployees = this.filterEmployees(rawEmployees);
        
        if (allEmployees.length === 0) {
            const hasSelection = rawEmployees.length > 0;
            const emptyMessage = hasSelection 
                ? `<div class="flex flex-col items-center gap-2">
                        <i class="fas fa-search text-3xl text-slate-300"></i>
                        <p>Không tìm thấy nhân viên phù hợp</p>
                        <p class="text-xs">Thử tìm kiếm với từ khóa khác</p>
                   </div>`
                : `<div class="flex flex-col items-center gap-2">
                        <i class="fas fa-users text-3xl text-slate-300"></i>
                        <p>Chưa chọn nhân viên hoặc bộ phận</p>
                        <p class="text-xs">Vui lòng chọn ở mục "Nhân viên áp dụng" phía trên</p>
                   </div>`;
            
            this.bodyContainer.innerHTML = `<tr><td colspan="${daysInMonth + 2}" class="py-12 text-center text-slate-400 italic bg-white">
                ${emptyMessage}
            </td></tr>`;
            
            this.updatePagination(0);
            return;
        }

        const startIdx = (this.pagination.page - 1) * this.pagination.pageSize;
        const endIdx = startIdx + this.pagination.pageSize;
        const employees = allEmployees.slice(startIdx, endIdx);
        this.pagination.total = allEmployees.length;

        this.bodyContainer.innerHTML = employees.map(emp => {
            let cellsHtml = '';
            
            for (let day = 1; day <= daysInMonth; day++) {
                const isPast = new Date(this.year, this.month - 1, day) < new Date(todayYear, todayMonth - 1, todayDate);
                const isToday = this.year === todayYear && this.month === todayMonth && day === todayDate;
                const scheduleKey = `${emp.id}_${this.year}_${this.month}_${day}`;
                
                const dayShifts = this.scheduleData.get(scheduleKey) || [];
                
                let cellClass = 'px-1 py-1 border-r border-slate-100 text-center align-middle ';
                let cellContent = '';
                
                if (isPast) {
                    cellClass += 'bg-slate-100 cursor-not-allowed';
                    if (dayShifts.length > 0) {
                        cellContent = dayShifts.map(s => this.renderShiftBadge(s, true)).join('');
                    } else {
                        cellContent = '<span class="text-slate-300">-</span>';
                    }
                } else {
                    cellClass += 'cursor-pointer hover:bg-green-50 group';
                    
                    if (dayShifts.length > 0) {
                        cellContent = dayShifts.map(s => this.renderShiftBadge(s, false)).join('');
                    } else {
                        cellContent = `<div class="h-6 w-full rounded border border-dashed border-slate-200 group-hover:border-green-400 transition-all"></div>`;
                    }
                }
                
                const dataAttrs = isPast ? '' : `data-emp-id="${emp.id}" data-day="${day}" data-year="${this.year}" data-month="${this.month}"`;
                
                cellsHtml += `<td class="${cellClass}" ${dataAttrs}>${cellContent}</td>`;
            }
            
            return `
                <tr class="hover:bg-slate-50/50 transition-colors bg-white border-b border-slate-100">
                    <td class="px-3 py-2 border-r border-slate-100 sticky left-0 bg-white z-10 font-medium text-slate-900 text-xs">${emp.name}</td>
                    <td class="px-3 py-2 border-r border-slate-100 sticky left-[120px] bg-white z-10 text-slate-500 text-xs">${emp.deptName || '-'}</td>
                    ${cellsHtml}
                </tr>
            `;
        }).join('');

        this.bindCellEvents();
        this.updatePagination(allEmployees.length);
    }

    filterEmployees(employees) {
        if (!this.searchQuery) {
            return employees;
        }

        const query = this.searchQuery;

        return employees.filter(emp => {
            const nameMatch = emp.name && 
                AppUtils.Helper.removeAccents(emp.name.toLowerCase()).includes(
                    AppUtils.Helper.removeAccents(query)
                );
            
            const deptMatch = emp.deptName && 
                AppUtils.Helper.removeAccents(emp.deptName.toLowerCase()).includes(
                    AppUtils.Helper.removeAccents(query)
                );

            return nameMatch || deptMatch;
        });
    }

    renderShiftBadge(shiftData, isPast = false) {
        const shiftName = shiftData.TenCa || 'Ca';
        const khungGio = (shiftData.KhungGio || []).join(', ');
        
        const tooltipText = khungGio ? `${shiftName} | ${khungGio}` : shiftName;
        
        let colorClass = shiftData.colorClass || 'bg-green-500 text-white';
        
        if (isPast) {
            colorClass = 'bg-slate-200 text-slate-500';
        }
        
        return `
            <span class="inline-block px-1.5 py-0.5 text-[10px] rounded ${colorClass} cursor-default max-w-[60px] truncate font-medium" 
                  title="${this.escapeHtml(tooltipText)}">
                ${this.escapeHtml(shiftName)}
            </span>
        `;
    }

    bindCellEvents() {
        if (!this.bodyContainer) return;

        const handleCellClick = (e) => {
            const cell = e.target.closest('td[data-emp-id]');
            if (!cell) return;
            
            e.stopPropagation();
            this.openCellPopover(cell);
        };

        this.cellEventManager.removeAll();
        this.cellEventManager.add(this.bodyContainer, 'click', handleCellClick);
    }

    openCellPopover(cell) {
        this.closeCellPopover();

        const empId = parseInt(cell.dataset.empId);
        const day = parseInt(cell.dataset.day);
        const year = parseInt(cell.dataset.year);
        const month = parseInt(cell.dataset.month);
        const scheduleKey = `${empId}_${year}_${month}_${day}`;
        const currentShifts = this.scheduleData.get(scheduleKey) || [];

        const popover = document.createElement('div');
        popover.id = 'lt-cell-popover';
        popover.className = 'fixed bg-white border border-slate-200 rounded-lg shadow-2xl z-[99999] w-[200px] animate-fade-in';
        
        popover.innerHTML = this.renderCellPopoverContent(empId, day, year, month, currentShifts);
        
        document.body.appendChild(popover);

        const rect = cell.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        const viewportWidth = window.innerWidth;
        
        let left = rect.left;
        let top = rect.bottom + 4;
        
        if (left + 200 > viewportWidth) {
            left = viewportWidth - 210;
        }
        
        if (top + 250 > viewportHeight) {
            top = rect.top - 254;
        }
        
        popover.style.left = left + 'px';
        popover.style.top = top + 'px';

        this.bindCellPopoverEvents(popover, empId, day, year, month);

        setTimeout(() => {
            document.addEventListener('click', this.handlePopoverOutsideClick);
        }, 10);
    }

    handlePopoverOutsideClick = (e) => {
        const popover = document.getElementById('lt-cell-popover');
        if (popover && !popover.contains(e.target) && !e.target.closest('td[data-emp-id]')) {
            this.closeCellPopover();
        }
    }

    closeCellPopover() {
        document.getElementById('lt-cell-popover')?.remove();
        document.removeEventListener('click', this.handlePopoverOutsideClick);
    }

    renderCellPopoverContent(empId, day, year, month, currentShifts) {
        const shifts = Array.from(this.options.getSelectedShifts().values()).filter(s => s.id !== 0);
        const cycles = this.options.getCycles() || [];

        let shiftsHtml = '';
        if (shifts.length > 0) {
            shiftsHtml = shifts.map(s => {
                const colorClass = s.colorClass || 'bg-green-500';
                const isSelected = currentShifts.some(cs => cs.id === s.id);
                const khungGio = (s.KhungGio || []).join(', ');
                const displayText = khungGio ? `${s.TenCa} | ${khungGio}` : s.TenCa;
                
                const shiftDataStr = JSON.stringify({
                    ...s,
                    colorClass:  colorClass + ' text-white'
                }).replace(/'/g, "&#39;");
                
                return `
                    <div class="popover-shift-item px-3 py-2 cursor-pointer hover:bg-slate-50 flex items-center gap-2 ${isSelected ? 'ring-2 ring-green-400 ring-inset bg-green-50' : ''}" 
                        data-shift-id="${s.id}" 
                        data-shift='${shiftDataStr}'
                        data-color="${colorClass}">
                        <span class="w-3 h-3 rounded shrink-0 ${colorClass}"></span>
                        <span class="text-sm flex-1 truncate" title="${this.escapeHtml(displayText)}">${this.escapeHtml(displayText)}</span>
                        ${isSelected ? '<i class="fas fa-check text-green-500 text-xs shrink-0"></i>' : ''}
                    </div>
                `;
            }).join('');
        } else {
            shiftsHtml = '<div class="px-3 py-4 text-center text-slate-400 text-sm italic">Chưa chọn ca áp dụng</div>';
        }

        let cyclesHtml = '';
        if (cycles.length > 0) {
            cyclesHtml = cycles.map(c => {
                const cycleDataStr = JSON.stringify(c).replace(/'/g, "&#39;");
                return `
                    <div class="popover-cycle-item px-3 py-2 cursor-pointer hover:bg-slate-50 border-b border-slate-50" 
                        data-cycle-id="${c.id || c.MaChuKy}"
                        data-cycle='${cycleDataStr}'
                        data-start-day="${day}">
                        <div class="flex items-center gap-2">
                            <span class="w-3 h-3 rounded bg-purple-500 shrink-0"></span>
                            <span class="text-sm flex-1 truncate">${this.escapeHtml(c.TenChuKy)}</span>
                            <span class="text-xs text-slate-400">${c.SoNgayLap} ngày</span>
                        </div>
                        <div class="text-[10px] text-purple-600 mt-1 pl-5">
                            <i class="fas fa-play text-[8px] mr-1"></i>Bắt đầu từ ngày ${day}/${month}
                        </div>
                    </div>
                `;
            }).join('');
        } else {
            cyclesHtml = '<div class="px-3 py-4 text-center text-slate-400 text-sm italic">Chưa có chu kỳ</div>';
        }

        const deleteBtn = currentShifts.length > 0 ? `
            <div class="border-t border-slate-100 px-3 py-2">
                <button type="button" class="popover-delete-btn w-full text-center text-red-500 hover:text-red-700 text-sm py-1 hover:bg-red-50 rounded transition-colors">
                    <i class="fas fa-trash mr-1"></i> Xóa
                </button>
            </div>
        ` : '';

        return `
            <div class="popover-tabs flex border-b border-slate-200">
                <button type="button" class="popover-tab flex-1 px-3 py-2 text-sm font-medium text-green-600 border-b-2 border-green-500" data-tab="shifts">Ca</button>
                <button type="button" class="popover-tab flex-1 px-3 py-2 text-sm font-medium text-slate-500 hover:text-slate-700" data-tab="cycles">Chu kỳ</button>
            </div>
            <div class="popover-content max-h-[200px] overflow-y-auto">
                <div class="popover-tab-content" data-content="shifts">${shiftsHtml}</div>
                <div class="popover-tab-content hidden" data-content="cycles">${cyclesHtml}</div>
            </div>
            ${deleteBtn}
        `;
    }

    bindCellPopoverEvents(popover, empId, day, year, month) {
        popover.querySelectorAll('.popover-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                e.stopPropagation();
                const tabName = tab.dataset.tab;
                
                popover.querySelectorAll('.popover-tab').forEach(t => {
                    t.classList.remove('text-green-600', 'border-b-2', 'border-green-500');
                    t.classList.add('text-slate-500');
                });
                tab.classList.add('text-green-600', 'border-b-2', 'border-green-500');
                tab.classList.remove('text-slate-500');
                
                popover.querySelectorAll('.popover-tab-content').forEach(content => {
                    content.classList.toggle('hidden', content.dataset.content !== tabName);
                });
            });
        });

        popover.querySelectorAll('.popover-shift-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const shiftData = JSON.parse(item.dataset.shift.replace(/&#39;/g, "'"));
                const colorClass = item.dataset.color;
                
                this.assignShift(empId, day, year, month, { ...shiftData, colorClass });
                this.closeCellPopover();
            });
        });

        popover.querySelectorAll('.popover-cycle-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const cycleData = JSON.parse(item.dataset.cycle.replace(/&#39;/g, "'"));
                const startDay = parseInt(item.dataset.startDay) || day;
                
                this.applyCycle(empId, year, month, cycleData, startDay);
                this.closeCellPopover();
            });
        });

        popover.querySelector('.popover-delete-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.clearCell(empId, day, year, month);
            this.closeCellPopover();
        });
    }

    assignShift(empId, day, year, month, shiftData) {
        const scheduleKey = `${empId}_${year}_${month}_${day}`;
        const currentShifts = this.scheduleData.get(scheduleKey) || [];
        
        const existingIndex = currentShifts.findIndex(s => s.id === shiftData.id);
        if (existingIndex >= 0) {
            currentShifts.splice(existingIndex, 1);
        } else {
            const conflict = ScheduleValidator.checkLTShiftConflictInDay(currentShifts, shiftData);
            if (conflict) {
                AppUtils.Notify.error(conflict);
                return;
            }
            
            const crossDayConflict = ScheduleValidator.checkLTCrossDayConflict(empId, year, month, day, shiftData, this.scheduleData);
            if (crossDayConflict) {
                AppUtils.Notify.error(crossDayConflict);
                return;
            }
            
            const syncedShift = this.getSyncedShiftData(shiftData);
            currentShifts.push(syncedShift);
        }
        
        if (currentShifts.length > 0) {
            this.scheduleData.set(scheduleKey, currentShifts);
        } else {
            this.scheduleData.delete(scheduleKey);
        }
        
        this.updateSingleCell(empId, day, year, month);
        const daysInMonth = new Date(year, month, 0).getDate();
        if (day < daysInMonth) {
            this.updateSingleCell(empId, day + 1, year, month);
        }
        
        this.options.onDataChange();
    }

    applyCycle(empId, year, month, cycleData, startDay = null) {
        const today = new Date();
        const todayYear = today.getFullYear();
        const todayMonth = today.getMonth() + 1;
        const todayDate = today.getDate();
        
        const daysInMonth = new Date(year, month, 0).getDate();
        const numCycleDays = cycleData.SoNgayLap || 1;
        
        if (startDay === null) {
            if (year === todayYear && month === todayMonth) {
                startDay = todayDate;
            } else if (year > todayYear || (year === todayYear && month > todayMonth)) {
                startDay = 1;
            } else {
                AppUtils.Notify.warning('Không thể áp dụng chu kỳ cho tháng đã qua');
                return;
            }
        }
        
        for (let day = startDay; day <= daysInMonth; day++) {
            if (year === todayYear && month === todayMonth && day < todayDate) {
                continue;
            }
            
            const cycleDay = ((day - startDay) % numCycleDays) + 1;
            const scheduleKey = `${empId}_${year}_${month}_${day}`;
            
            const selectedShifts = this.options.getSelectedShifts();
            
            const dayShifts = (cycleData.ChiTietNgay || [])
                .filter(d => d.NgayTrongChuKy === cycleDay && d.CaID !== null)
                .map(d => {
                    const shiftInfo = selectedShifts.get(d.CaID?.toString());
                    return {
                        id: d.CaID,
                        TenCa: shiftInfo?.TenCa || d.TenCa || `Ca #${d.CaID}`,
                        KhungGio: shiftInfo?.KhungGio || [],
                        colorClass: shiftInfo?.colorClass || 'bg-green-500 text-white'
                    };
                });
            
            if (dayShifts.length > 0) {
                this.scheduleData.set(scheduleKey, dayShifts);
            } else {
                this.scheduleData.delete(scheduleKey);
            }
        }
        
        AppUtils.Notify.success(`Đã áp dụng chu kỳ "${cycleData.TenChuKy}" từ ngày ${startDay}/${month}/${year}`);
        this.render();
        this.options.onDataChange();
    }

    clearCell(empId, day, year, month) {
        const scheduleKey = `${empId}_${year}_${month}_${day}`;
        this.scheduleData.delete(scheduleKey);
        this.updateSingleCell(empId, day, year, month);
        this.options.onDataChange();
    }

    updateSingleCell(empId, day, year, month) {
        const scheduleKey = `${empId}_${year}_${month}_${day}`;
        const cell = document.querySelector(`td[data-emp-id="${empId}"][data-day="${day}"][data-year="${year}"][data-month="${month}"]`);
        
        if (! cell) {
            return;
        }

        const dayShifts = this.scheduleData.get(scheduleKey) || [];
        
        const today = new Date();
        const todayYear = today.getFullYear();
        const todayMonth = today.getMonth() + 1;
        const todayDate = today.getDate();
        const isPast = new Date(year, month - 1, day) < new Date(todayYear, todayMonth - 1, todayDate);

        let cellContent = '';
        
        if (isPast) {
            if (dayShifts.length > 0) {
                cellContent = dayShifts.map(s => this.renderShiftBadge(s, true)).join('');
            } else {
                cellContent = '<span class="text-slate-300">-</span>';
            }
        } else {
            if (dayShifts.length > 0) {
                cellContent = dayShifts.map(s => this.renderShiftBadge(s, false)).join('');
            } else {
                cellContent = `<div class="h-6 w-full rounded border border-dashed border-slate-200 group-hover: border-green-400 transition-all"></div>`;
            }
        }
        
        cell.innerHTML = cellContent;
    }

    getSyncedShiftData(shiftData) {
        if (!shiftData || shiftData.id === undefined || shiftData.id === null) return shiftData;
        
        const idStr = shiftData.id.toString();
        const selectedShifts = this.options.getSelectedShifts();
        const storedShift = selectedShifts.get(idStr);
        
        if (storedShift) {
            return {
                id: shiftData.id,
                TenCa: storedShift.TenCa || shiftData.TenCa,
                KhungGio:  storedShift.KhungGio || shiftData.KhungGio || [],
                colorClass: storedShift.colorClass || 'bg-green-500 text-white'
            };
        }
        
        if (shiftData.id === 0) {
            return {
                id: 0,
                TenCa: 'Ngày nghỉ',
                KhungGio: [],
                colorClass: 'bg-slate-400 text-white'
            };
        }
        
        return {
            id: shiftData.id,
            TenCa: shiftData.TenCa || `Ca #${shiftData.id}`,
            KhungGio: shiftData.KhungGio || [],
            colorClass: shiftData.colorClass || 'bg-green-500 text-white'
        };
    }

    updatePagination(total) {
        if (! this.paginationEls) return;

        const { page, pageSize } = this.pagination;
        const totalPages = Math.max(1, Math.ceil(total / pageSize));
        
        this.pagination.total = total;

        if (this.paginationEls.current) {
            this.paginationEls.current.textContent = page;
        }
        
        if (this.paginationEls.totalPages) {
            this.paginationEls.totalPages.textContent = totalPages;
        }

        if (this.paginationEls.info) {
            if (total === 0) {
                this.paginationEls.info.textContent = this.searchQuery 
                    ? 'Không tìm thấy kết quả' 
                    : 'Không có dữ liệu';
            } else {
                const start = (page - 1) * pageSize + 1;
                const end = Math.min(page * pageSize, total);
                
                this.paginationEls.info.innerHTML = `Hiển thị <span class="font-medium">${start}</span> - <span class="font-medium">${end}</span> trong <span class="font-medium">${total}</span>`;
            }
        }

        const hasPrev = page > 1;
        const hasNext = page < totalPages;

        if (this.paginationEls.prev) {
            this.paginationEls.prev.disabled = ! hasPrev;
            this.paginationEls.prev.classList.toggle('opacity-50', ! hasPrev);
            this.paginationEls.prev.classList.toggle('cursor-not-allowed', ! hasPrev);
        }

        if (this.paginationEls.next) {
            this.paginationEls.next.disabled = !hasNext;
            this.paginationEls.next.classList.toggle('opacity-50', !hasNext);
            this.paginationEls.next.classList.toggle('cursor-not-allowed', !hasNext);
        }

        const container = this.paginationContainer;
        if (container) {
            container.classList.toggle('hidden', total === 0);
        }
    }

    escapeHtml(text) {
        if (! text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Public API
    getScheduleData() {
        const data = {};
        this.scheduleData.forEach((shifts, key) => {
            data[key] = shifts.map(s => ({
                id: s.id,
                TenCa: s.TenCa,
                KhungGio: s.KhungGio || [],
                colorClass: s.colorClass
            }));
        });
        return data;
    }

    setScheduleData(data) {
        this.scheduleData.clear();
        if (! data) return;
        
        const selectedShifts = this.options.getSelectedShifts();
        
        Object.entries(data).forEach(([key, shifts]) => {
            const syncedShifts = shifts.map(s => {
                const idStr = s.id.toString();
                const storedShift = selectedShifts.get(idStr);
                
                return {
                    id: s.id,
                    TenCa: storedShift?.TenCa || s.TenCa,
                    KhungGio: storedShift?.KhungGio || s.KhungGio || [],
                    colorClass: storedShift?.colorClass || (s.id === 0 ? 'bg-slate-400 text-white' : 'bg-green-500 text-white')
                };
            });
            
            this.scheduleData.set(key, syncedShifts);
        });
        
        this.render();
    }

    destroy() {
        this.paginationEventManager.removeAll();
        this.cellEventManager.removeAll();
        this.closeCellPopover();
        this.scheduleData.clear();
    }
}

window.ScheduleCalendar = ScheduleCalendar;