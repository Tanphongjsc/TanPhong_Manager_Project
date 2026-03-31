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
            treeData: [],
            expandedNodes: new Set(),
            selectedDeptId: '',
            dropdownOpen: false
        };

        this.tableManager = null;
    }

    init() {
        this.cacheElements();
        if (!this.els.tableBody || !this.els.tableHead || !this.els.filterForm) {
            return;
        }

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

        if (this.els.deptTree) {
            this.els.deptTree.addEventListener('click', (event) => {
                const toggleBtn = event.target.closest('.tree-toggle-btn');
                if (toggleBtn) {
                    event.preventDefault();
                    event.stopPropagation();
                    this.toggleTreeNode(toggleBtn.dataset.key);
                    return;
                }

                const selectItem = event.target.closest('.dept-tree-item');
                if (selectItem) {
                    event.preventDefault();
                    event.stopPropagation();
                    this.selectDepartment(
                        selectItem.dataset.id || '',
                        selectItem.dataset.name || 'Tat ca bo phan'
                    );
                }
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
            console.error('Khong tai duoc danh sach nhom lich:', error);
        }
    }

    async loadDepartmentTree() {
        if (!this.els.deptTree) {
            return;
        }

        try {
            const response = await AppUtils.API.get(this.apiUrls.deptTree);
            this.state.treeData = response.data || [];

            this.state.expandedNodes.clear();
            this.state.treeData.forEach((company) => {
                this.state.expandedNodes.add(`company-${company.id}`);
            });

            this.renderDepartmentTree();
        } catch (error) {
            console.error('Khong tai duoc cay bo phan:', error);
            this.els.deptTree.innerHTML = '<div class="text-xs text-red-500 p-2">Khong tai duoc du lieu bo phan</div>';
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

    toggleTreeNode(nodeKey) {
        if (!nodeKey) {
            return;
        }

        if (this.state.expandedNodes.has(nodeKey)) {
            this.state.expandedNodes.delete(nodeKey);
        } else {
            this.state.expandedNodes.add(nodeKey);
        }

        this.renderDepartmentTree();
    }

    selectDepartment(deptId, deptName) {
        this.state.selectedDeptId = String(deptId || '');

        if (this.els.deptInput) {
            this.els.deptInput.value = this.state.selectedDeptId;
            this.els.deptInput.dispatchEvent(new Event('change', { bubbles: true }));
        }

        if (this.els.deptText) {
            this.els.deptText.textContent = deptName || 'Tat ca bo phan';
        }

        this.renderDepartmentTree();
        this.closeDeptDropdown();
    }

    renderDepartmentTree() {
        if (!this.els.deptTree) {
            return;
        }

        const renderNodes = (nodes, level, parentKey) => {
            return (nodes || []).map((node) => {
                const isDept = node.maphongban !== undefined;
                const children = isDept ? (node.children || []) : (node.departments || []);
                const rowKey = `${parentKey}-${node.id}`;
                const hasChildren = children.length > 0;
                const isExpanded = this.state.expandedNodes.has(rowKey);
                const label = isDept ? (node.tenphongban || '') : (node.tencongty_vi || 'Cong ty');

                const toggleHtml = hasChildren
                    ? `<button type="button" class="tree-toggle-btn w-4 h-4 flex items-center justify-center text-slate-400 hover:text-slate-600" data-key="${rowKey}"><i class="fas ${isExpanded ? 'fa-caret-down' : 'fa-caret-right'} text-[10px]"></i></button>`
                    : '<span class="w-4 h-4"></span>';

                if (!isDept) {
                    return `
                        <div>
                            <div class="flex items-center gap-1 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400" style="padding-left:${4 + (level * 12)}px;">
                                ${toggleHtml}
                                <span class="truncate">${this.escapeHtml(label)}</span>
                            </div>
                            <div class="${isExpanded ? '' : 'hidden'}">
                                ${renderNodes(children, level + 1, rowKey)}
                            </div>
                        </div>
                    `;
                }

                const isSelected = this.state.selectedDeptId === String(node.id);
                const selectedClass = isSelected
                    ? 'bg-blue-100 text-blue-700 font-semibold'
                    : 'text-slate-600 hover:bg-blue-50 hover:text-blue-700';

                return `
                    <div>
                        <div class="dept-tree-item flex items-center gap-1 py-1.5 rounded cursor-pointer ${selectedClass}" data-id="${node.id}" data-name="${this.escapeHtml(label)}" style="padding-left:${4 + (level * 12)}px;">
                            ${toggleHtml}
                            <span class="truncate text-xs">${this.escapeHtml(label)}</span>
                            ${isSelected ? '<i class="fas fa-check ml-auto mr-2 text-[10px]"></i>' : ''}
                        </div>
                        <div class="${isExpanded ? '' : 'hidden'}">
                            ${renderNodes(children, level + 1, rowKey)}
                        </div>
                    </div>
                `;
            }).join('');
        };

        const allSelectedClass = this.state.selectedDeptId === ''
            ? 'bg-blue-100 text-blue-700 font-semibold'
            : 'text-slate-600 hover:bg-blue-50 hover:text-blue-700';

        let html = `
            <div class="dept-tree-item flex items-center gap-2 py-1.5 px-2 rounded cursor-pointer text-xs ${allSelectedClass}" data-id="" data-name="Tất cả bộ phận">
                <i class="fas fa-list-ul text-[10px]"></i>
                <span>Tất cả bộ phận</span>
            </div>
            <div class="border-b border-slate-100 my-1"></div>
        `;

        html += renderNodes(this.state.treeData, 0, 'company');
        this.els.deptTree.innerHTML = html;
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
                <th class="sticky-col-l1 px-3 py-2 text-left text-sm font-bold text-slate-700 min-w-[240px]">Nhân viên</th>
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
            const tenCa = this.escapeHtml(shift.ten_ca || 'Ca lam viec');
            const isDayOff = Boolean(shift.is_day_off);
            const khungGio = Array.isArray(shift.khung_gio) ? shift.khung_gio : [];
            const tooltipText = [
                shift.ten_lich || '',
                khungGio.join(' | ')
            ].filter(Boolean).join(' | ');

            const badgeClass = isDayOff
                ? 'bg-slate-100 text-slate-500 border-slate-200'
                : 'bg-blue-50 text-blue-700 border-blue-200';

            return `
                <span class="inline-flex items-center justify-center px-3 py-1.5 rounded-md text-[12px] font-semibold border ${badgeClass}" title="${this.escapeHtml(tooltipText)}">
                    ${tenCa}
                </span>
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
