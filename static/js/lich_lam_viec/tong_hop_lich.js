/**
 * File: static/js/lich_lam_viec/tong_hop_lich.js
 * Description: Controller tong hop lich lam viec voi bo loc date range, nhom lich, phong ban va tim kiem.
 */
class TongHopLichController {
    constructor() {
        this.apiUrls = {
            summary: '/hrm/lich-lam-viec/api/lich-lam-viec/tong-hop/',
            scheduleOptions: '/hrm/lich-lam-viec/api/lich-lam-viec/options/',
            deptTree: '/hrm/to-chuc-nhan-su/api/v1/phong-ban/tree/'
        };

        this.state = {
            selectedDeptId: '',
            dropdownOpen: false
        };

        this.tableManager = null;
        this.customDatePickers = {};
    }

    init() {
        this.cacheElements();
        if (!this.els.tableBody || !this.els.tableHead || !this.els.filterForm) {
            return;
        }

        this.initOrganizationTree();
        this.initCustomDatePickers();
        this.initDefaultDateRange();
        this.bindFilterEvents();
        this.initTable();
        this.renderHeader();
        this.loadScheduleOptions();
        this.loadDepartmentTree();
    }

    cacheElements() {
        this.els = {
            tableHead: document.getElementById('tong-hop-lich-head'),
            tableBody: document.getElementById('tong-hop-lich-body'),
            paginationContainer: document.querySelector('.pagination-container'),
            searchInput: document.getElementById('search-tong-hop'),
            filterForm: document.getElementById('filter-tong-hop'),

            startDateInput: document.getElementById('filter-start-date'),
            endDateInput: document.getElementById('filter-end-date'),
            btnRangeWeek: document.getElementById('btn-range-week'),
            btnRangeMonth: document.getElementById('btn-range-month'),
            scheduleSelect: document.getElementById('filter-lichlamviec'),

            deptWrapper: document.getElementById('dept-filter-wrapper'),
            deptBtn: document.getElementById('filter-dept-btn'),
            deptText: document.getElementById('filter-dept-text'),
            deptInput: document.getElementById('filter-phongban-id'),
            deptDropdown: document.getElementById('filter-dept-dropdown'),
            deptTree: document.getElementById('filter-dept-tree')
        };
    }

    initOrganizationTree() {
        if (!this.els.deptTree) {
            return;
        }
        if (typeof window.OrganizationTreeComponent !== 'function') {
            throw new Error('OrganizationTreeComponent is required by TongHopLichController');
        }

        this.departmentTree = new window.OrganizationTreeComponent({
            container: this.els.deptTree,
            selectionMode: 'single',
            showAllOption: true,
            allOptionLabel: 'Tất cả bộ phận',
            allOptionIconClass: 'fas fa-list-ul',
            defaultExpandCompanies: true,
            baseIndent: 4,
            loadingMessage: 'Đang tải bộ phận...',
            emptyMessage: 'Chưa có dữ liệu bộ phận',
            errorMessage: 'Không tải được dữ liệu bộ phận',
            onSelect: ({ id, name }) => this.selectDepartment(id, name)
        });
    }

    initCustomDatePickers() {
        const pickerLib = window.CustomDateComponents?.CustomDatePicker;
        if (!pickerLib) {
            return;
        }

        if (this.els.startDateInput) {
            this.customDatePickers.start = new pickerLib({
                inputId: this.els.startDateInput,
                compact: true,
                showIcon: false,
                placeholder: 'Từ ngày',
                triggerClass: 'min-w-[88px] text-left',
                popoverClass: 'w-72'
            });
        }

        if (this.els.endDateInput) {
            this.customDatePickers.end = new pickerLib({
                inputId: this.els.endDateInput,
                compact: true,
                showIcon: false,
                placeholder: 'Đến ngày',
                triggerClass: 'min-w-[88px] text-left',
                popoverClass: 'w-72'
            });
        }

        this.syncCustomDatePickers();
    }

    syncCustomDatePickers() {
        Object.values(this.customDatePickers).forEach((picker) => {
            if (picker && typeof picker.syncFromInput === 'function') {
                picker.syncFromInput();
            }
        });
    }

    initDefaultDateRange() {
        if (this.els.startDateInput?.value && this.els.endDateInput?.value) {
            this.normalizeDateRange(false);
            return;
        }

        this.setDefaultRange(7, false);
    }

    bindFilterEvents() {
        if (this.els.startDateInput) {
            this.els.startDateInput.addEventListener('change', () => {
                this.normalizeDateRange(true);
            });
        }

        if (this.els.endDateInput) {
            this.els.endDateInput.addEventListener('change', () => {
                this.normalizeDateRange(true);
            });
        }

        if (this.els.btnRangeWeek) {
            this.els.btnRangeWeek.addEventListener('click', () => {
                this.setDefaultRange(7, true);
            });
        }

        if (this.els.btnRangeMonth) {
            this.els.btnRangeMonth.addEventListener('click', () => {
                this.setDefaultRange(31, true);
            });
        }

        if (this.els.deptBtn) {
            this.els.deptBtn.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                this.toggleDeptDropdown();
            });
        }

        document.addEventListener('click', (event) => {
            if (!this.state.dropdownOpen) {
                return;
            }

            if (this.els.deptWrapper && !this.els.deptWrapper.contains(event.target)) {
                this.closeDeptDropdown();
            }
        });
    }

    initTable() {
        this.tableManager = new TableManager({
            tableBody: this.els.tableBody,
            paginationContainer: this.els.paginationContainer,
            searchInput: this.els.searchInput,
            filtersForm: this.els.filterForm,
            apiEndpoint: this.apiUrls.summary,
            pageSize: 20,
            onRenderRow: (item) => this.renderRow(item),
            onDataLoaded: () => {
                this.renderHeader();
            }
        });
    }

    async loadScheduleOptions() {
        if (!this.els.scheduleSelect) {
            return;
        }

        try {
            const response = await AppUtils.API.get(this.apiUrls.scheduleOptions);
            const options = response.data || [];

            options.forEach((item) => {
                const option = document.createElement('option');
                option.value = item.id;
                option.textContent = item.MaNhom
                    ? `${item.TenNhom} (${item.MaNhom})`
                    : (item.TenNhom || `Nhom #${item.id}`);
                this.els.scheduleSelect.appendChild(option);
            });
        } catch (error) {
            console.error('Không tải được danh sách nhóm lịch:', error);
        }
    }

    async loadDepartmentTree() {
        if (!this.departmentTree) {
            return;
        }

        try {
            await this.departmentTree.load(this.apiUrls.deptTree);
        } catch (error) {
            console.error('Không tải được cây bộ phận:', error);
        }
    }

    toggleDeptDropdown() {
        this.state.dropdownOpen = !this.state.dropdownOpen;
        this.els.deptDropdown?.classList.toggle('hidden', !this.state.dropdownOpen);
    }

    closeDeptDropdown() {
        this.state.dropdownOpen = false;
        this.els.deptDropdown?.classList.add('hidden');
    }

    selectDepartment(deptId, deptName) {
        this.state.selectedDeptId = String(deptId || '');

        if (this.els.deptInput) {
            this.els.deptInput.value = this.state.selectedDeptId;
            this.els.deptInput.dispatchEvent(new Event('change', { bubbles: true }));
        }

        if (this.els.deptText) {
            this.els.deptText.textContent = deptName || 'Tất cả bộ phận';
        }

        this.departmentTree?.setSelectedIds(
            this.state.selectedDeptId ? [this.state.selectedDeptId] : []
        );
        this.closeDeptDropdown();
    }

    setDefaultRange(dayCount, triggerRefresh) {
        const today = new Date();
        const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const end = new Date(start);
        end.setDate(start.getDate() + Math.max(0, dayCount - 1));

        if (this.els.startDateInput) {
            this.els.startDateInput.value = this.toDateKey(start);
        }
        if (this.els.endDateInput) {
            this.els.endDateInput.value = this.toDateKey(end);
        }

        this.syncCustomDatePickers();

        this.renderHeader();

        if (triggerRefresh) {
            this.refreshFromFirstPage();
        }
    }

    normalizeDateRange(showNotify) {
        const startDate = this.parseInputDate(this.els.startDateInput?.value);
        const endDate = this.parseInputDate(this.els.endDateInput?.value);

        if (!startDate || !endDate) {
            return false;
        }

        let normalizedStart = startDate;
        let normalizedEnd = endDate;

        if (normalizedStart > normalizedEnd) {
            normalizedEnd = new Date(normalizedStart);
            if (showNotify) {
                AppUtils.Notify.warning('Ngày kết thúc được điều chỉnh để không nhỏ hơn ngày bắt đầu');
            }
        }

        const totalDays = this.diffDaysInclusive(normalizedStart, normalizedEnd);
        if (totalDays > 31) {
            normalizedEnd = new Date(normalizedStart);
            normalizedEnd.setDate(normalizedStart.getDate() + 30);
            if (showNotify) {
                AppUtils.Notify.warning('Khoảng ngày tối đa là 31 ngày');
            }
        }

        if (this.els.startDateInput) {
            this.els.startDateInput.value = this.toDateKey(normalizedStart);
        }
        if (this.els.endDateInput) {
            this.els.endDateInput.value = this.toDateKey(normalizedEnd);
        }

        this.syncCustomDatePickers();

        this.renderHeader();
        return true;
    }

    buildDateRange() {
        const startDate = this.parseInputDate(this.els.startDateInput?.value);
        const endDate = this.parseInputDate(this.els.endDateInput?.value);

        if (!startDate || !endDate || startDate > endDate) {
            return [];
        }

        const days = [];
        const cursor = new Date(startDate);

        while (cursor <= endDate && days.length < 31) {
            days.push(new Date(cursor));
            cursor.setDate(cursor.getDate() + 1);
        }

        return days;
    }

    renderHeader() {
        if (!this.els.tableHead) {
            return;
        }

        const dateRange = this.buildDateRange();
        const dayNames = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

        let html = `
            <tr>
                <th class="sticky-col-l1 px-3 py-2 text-left text-sm font-bold text-slate-700 min-w-60">Nhân viên</th>
        `;

        if (dateRange.length === 0) {
            html += '<th class="px-3 py-2 text-center text-xs text-slate-500">Chưa chọn khoảng ngày</th>';
        } else {
            dateRange.forEach((currentDate) => {
                const dayOfWeek = dayNames[currentDate.getDay()];
                const dayValue = String(currentDate.getDate()).padStart(2, '0');
                const monthValue = String(currentDate.getMonth() + 1).padStart(2, '0');
                const yearValue = currentDate.getFullYear();
                const fullDate = `${dayValue}/${monthValue}/${yearValue}`;
                const isWeekend = currentDate.getDay() === 0 || currentDate.getDay() === 6;
                const textClass = isWeekend ? 'text-red-500 bg-red-50/40' : 'text-slate-600';

                html += `
                    <th class="px-2 py-2 text-center text-sm font-semibold border-l border-slate-100 min-w-[130px] ${textClass}">
                        <div class="flex flex-col leading-tight">
                            <span class="text-[11px] opacity-80">${dayOfWeek}</span>
                            <span class="text-[12px] font-semibold">${fullDate}</span>
                        </div>
                    </th>
                `;
            });
        }

        html += '</tr>';
        this.els.tableHead.innerHTML = html;
    }

    renderRow(item) {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50 transition-colors';

        const tenNv = this.escapeHtml(item.ten_nv || '');
        const maNv = this.escapeHtml(item.ma_nv || '');
        const tenPhongBan = this.escapeHtml(item.ten_phong_ban || '-');

        let rowHtml = `
            <td class="sticky-col-l1 px-3 py-2 border-b border-slate-100 align-top">
                <div class="flex flex-col gap-0.5">
                    <div class="text-sm font-medium text-slate-900">${tenNv || '-'}</div>
                    <div class="text-xs text-slate-500">${maNv || '-'}</div>
                    <div class="text-xs text-slate-500">${tenPhongBan || '-'}</div>
                </div>
            </td>
        `;

        const dateRange = this.buildDateRange();
        const scheduleMap = item.schedule_map || {};

        if (dateRange.length === 0) {
            rowHtml += '<td class="px-3 py-2 border-l border-slate-100 border-b text-center text-xs text-slate-400">-</td>';
        } else {
            dateRange.forEach((currentDate) => {
                const dateKey = this.toDateKey(currentDate);
                const shifts = scheduleMap[dateKey] || [];

                rowHtml += `
                    <td class="px-2 py-2 border-l border-slate-100 border-b align-top min-w-[130px]">
                        <div class="min-h-12 w-full flex items-start justify-center">
                            ${this.renderScheduleCell(shifts)}
                        </div>
                    </td>
                `;
            });
        }

        tr.innerHTML = rowHtml;
        return tr;
    }

    renderScheduleCell(shifts) {
        if (!shifts || shifts.length === 0) {
            return '<span class="text-slate-300 text-xs select-none">-</span>';
        }

        const badges = shifts.map((shift) => {
            const tenCa = this.escapeHtml(shift.ten_ca || 'Ca làm việc');
            const isDayOff = Boolean(shift.is_day_off);
            const khungGio = Array.isArray(shift.khung_gio) ? shift.khung_gio : [];
            const tenLich = this.escapeHtml(shift.ten_lich || 'Chưa gán lịch làm việc');

            const khungGioHtml = khungGio.length > 0
                ? khungGio
                    .map((item) => `<div class="text-[10px] text-slate-300">- ${this.escapeHtml(item)}</div>`)
                    .join('')
                : '<div class="text-[10px] text-slate-400">Không có khung giờ</div>';

            const badgeClass = isDayOff
                ? 'bg-slate-100 text-slate-500 border-slate-200'
                : 'bg-blue-50 text-blue-700 border-blue-200';

            return `
                <div class="relative group">
                    <span class="inline-flex items-center justify-center px-3 py-1.5 rounded-md text-[12px] font-semibold border ${badgeClass} cursor-default">
                        ${tenCa}
                    </span>

                    <div class="absolute z-50 left-1/2 -translate-x-1/2 top-full mt-1.5 w-56 invisible opacity-0 group-hover:visible group-hover:opacity-100 transition-all duration-200 pointer-events-none">
                        <div class="bg-slate-800 text-white text-xs rounded-lg shadow-xl p-2.5 text-left leading-relaxed border border-slate-600 relative">
                            <div class="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-800 border-l border-t border-slate-600 rotate-45"></div>
                            <div class="font-bold text-emerald-400 mb-1 text-[11px]">${tenCa}</div>
                            <div class="text-[11px] text-slate-200 mb-1.5 border-b border-slate-600 pb-1">Lịch làm việc: ${tenLich}</div>
                            ${khungGioHtml}
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        return `<div class="w-full flex flex-col items-center gap-1.5">${badges}</div>`;
    }

    refreshFromFirstPage() {
        if (!this.tableManager) {
            return;
        }
        this.tableManager.options.currentPage = 1;
        this.tableManager.refresh();
    }

    parseInputDate(inputValue) {
        if (!inputValue) {
            return null;
        }

        const dateObj = new Date(`${inputValue}T00:00:00`);
        if (Number.isNaN(dateObj.getTime())) {
            return null;
        }

        return dateObj;
    }

    diffDaysInclusive(startDate, endDate) {
        const oneDayMs = 24 * 60 * 60 * 1000;
        return Math.floor((endDate - startDate) / oneDayMs) + 1;
    }

    toDateKey(dateObj) {
        return AppUtils.DateUtils.toInputValue(dateObj);
    }

    escapeHtml(value) {
        const div = document.createElement('div');
        div.textContent = value || '';
        return div.innerHTML;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.TongHopLichController = new TongHopLichController();
    window.TongHopLichController.init();
});
