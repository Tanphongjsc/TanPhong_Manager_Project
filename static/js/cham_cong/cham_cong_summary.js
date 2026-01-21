/**
 * TimekeepingSummaryManager
 * Quản lý logic bảng chấm công tổng hợp, xử lý render động và bulk actions
 */
class TimekeepingSummaryManager {
    constructor() {
        this.apiUrls = {
            dept: '/hrm/to-chuc-nhan-su/api/v1/phong-ban/',
            summary: '/hrm/cham-cong/api/bang-cham-cong/tong-hop-thang/',
            checkLog: '/hrm/cham-cong/api/bang-cham-cong/check-cham-cong/'
        };

        this.els = {
            filterForm: document.getElementById('filter-form'),
            filterMonth: document.getElementById('filter-month'),
            filterDate: document.getElementById('filter-date'),
            filterMonthWrapper: document.getElementById('filter-month-wrapper'),
            filterDateWrapper: document.getElementById('filter-date-wrapper'),
            filterDept: document.getElementById('filter-dept'),
            searchInput: document.getElementById('search-input'),
            tabNav: document.querySelector('#tab-container nav'),
            employeeCount: document.getElementById('employee-count'),
            panes: {
                '#tab-tong-hop': document.getElementById('tab-tong-hop'),
                '#tab-da-cham': document.getElementById('tab-da-cham'),
                '#tab-chua-cham': document.getElementById('tab-chua-cham')
            }
        };

        this.currentTabId = '#tab-tong-hop';
        this.managers = { summary: null, checked: null, unchecked: null };
        this.eventManager = AppUtils.EventManager.create();
    }

    init() {
        this.initDefaultFilters();
        this.loadDepartments();
        this.initTabs();
        this.initManagers();
        this.initEventListeners();
        this.handleTabChange(this.currentTabId);
    }

    initDefaultFilters() {
        const today = new Date();
        const monthStr = AppUtils.DateUtils.format(today, 'yyyy-MM');
        if (this.els.filterMonth) this.els.filterMonth.value = monthStr;
        if (this.els.filterDate) this.els.filterDate.value = AppUtils.DateUtils.toInputValue(today);
    }

    async loadDepartments() {
        try {
            const res = await AppUtils.API.get(this.apiUrls.dept, { page_size: 100 });
            if (this.els.filterDept) {
                const firstOpt = this.els.filterDept.firstElementChild;
                this.els.filterDept.innerHTML = '';
                this.els.filterDept.appendChild(firstOpt);
                (res.data || []).forEach(d => {
                    const opt = document.createElement('option');
                    opt.value = d.id;
                    opt.textContent = d.tenphongban;
                    this.els.filterDept.appendChild(opt);
                });
            }
        } catch (e) { console.error(e); }
    }

    initTabs() {
        this.els.tabNav.querySelectorAll('a').forEach(link => {
            this.eventManager.add(link, 'click', (e) => {
                e.preventDefault();
                const targetId = link.getAttribute('href');
                this.activateTabUI(link, targetId);
                this.handleTabChange(targetId);
            });
        });
        const defaultLink = Array.from(this.els.tabNav.querySelectorAll('a'))
            .find(a => a.getAttribute('href') === this.currentTabId);
        if (defaultLink) this.activateTabUI(defaultLink, this.currentTabId);
    }

    activateTabUI(activeLink, targetId) {
        const activeClasses = ['border-blue-600', 'text-blue-600'];
        const inactiveClasses = ['border-transparent', 'text-slate-500', 'hover:text-slate-700', 'hover:border-slate-300'];
        
        this.els.tabNav.querySelectorAll('a').forEach(link => {
            if (link === activeLink) {
                link.classList.remove(...inactiveClasses);
                link.classList.add(...activeClasses);
            } else {
                link.classList.remove(...activeClasses);
                link.classList.add(...inactiveClasses);
            }
        });
        
        Object.entries(this.els.panes).forEach(([id, pane]) => 
            pane.classList.toggle('hidden', id !== targetId));
    }

    getFilterParams() {
        const params = {};
        const tabId = this.currentTabId;
        // 1. Get data from Filter Form
        if (this.els.filterForm) {
            const formData = AppUtils.Form.getData(this.els.filterForm);
            Object.entries(formData).forEach(([key, value]) => {
                if (!value) return;
                if (tabId === '#tab-tong-hop' && key === 'ngaylamviec') return;
                if (tabId !== '#tab-tong-hop' && key === 'thang') return;
                params[key] = value;
            });
        }
        // 2. Get data from Search Input (manually since we removed it from TableManager config)
        if (this.els.searchInput && this.els.searchInput.value) {
            params['search'] = this.els.searchInput.value.trim();
        }
        // 3. Bổ sung ngày cho các tab theo ngày
        if (tabId !== '#tab-tong-hop') {
            this.ensureDateValue();
            if (this.els.filterDate?.value) params['ngaylamviec'] = this.els.filterDate.value;
        }
        return params;
    }

    handleTabChange(tabId) {
        this.updateFilterVisibility(tabId);
        this.currentTabId = tabId;
        const currentParams = this.getFilterParams();

        const tabConfig = {
            '#tab-tong-hop': () => {
                this.renderSummaryHeader();
                this.rebindSummarySelectAll();
                this.managers.summary.options.apiParams = { ...currentParams };
                this.managers.summary.refresh();
            },
            '#tab-da-cham': () => {
                this.managers.checked.options.apiParams = { ...currentParams, dachamcong: 'True' };
                this.managers.checked.refresh();
            },
            '#tab-chua-cham': () => {
                this.managers.unchecked.options.apiParams = { ...currentParams, dachamcong: 'False' };
                this.managers.unchecked.refresh();
            }
        };

        tabConfig[tabId]?.();
    }

    // --- KHẮC PHỤC LỖI 1 & 2: RE-BIND SELECT ALL ---
    // Hàm này cập nhật tham chiếu checkbox cho TableManager khi Header được vẽ lại
    rebindSummarySelectAll() {
        const checkbox = document.getElementById('select-all-summary');
        if (checkbox && this.managers.summary) {
            // Update reference trong options của TableManager
            this.managers.summary.options.selectAllCheckbox = checkbox;
            
            // Re-attach event listener
            // (Lưu ý: TableManager cũ có thể vẫn giữ listener trên element cũ đã bị xóa khỏi DOM)
            checkbox.addEventListener('change', (e) => {
                this.managers.summary.handleSelectAll(e.target.checked);
            });
        }
    }

    // employee count now set directly from pagination.total in onDataLoaded

    initManagers() {
        const createManager = (config) => new TableManager({
            enableBulkActions: true,
            onBulkExport: (ids) => AppUtils.Notify.info(`Exporting ${ids.length} items...`),
            pageSize: 9999,
            autoLoad: false,
            ...config
        });

        this.managers.summary = createManager({
            tableBody: document.getElementById('summary-table-body'),
            paginationContainer: document.getElementById('pagination-summary'),
            bulkActionsContainer: document.getElementById('bulk-actions-summary'),
            apiEndpoint: this.apiUrls.summary,
            pageSize: 20,
            onRenderRow: (item, index) => this.renderSummaryRow(item, index),
            onDataLoaded: (_data, pagination) => {
                this.managers.summary.updateBulkActions();
                if (pagination?.total !== undefined && this.els.employeeCount) {
                    this.els.employeeCount.textContent = pagination.total;
                }
            }
        });

        this.managers.checked = createManager({
            tableBody: document.getElementById('checked-table-body'),
            bulkActionsContainer: document.getElementById('bulk-actions-checked'),
            selectAllCheckbox: document.getElementById('select-all-checked'),
            apiEndpoint: this.apiUrls.checkLog,
            apiParams: { dachamcong: 'True' },
            onRenderRow: (item) => this.renderCheckedRow(item)
        });

        this.managers.unchecked = createManager({
            tableBody: document.getElementById('unchecked-table-body'),
            bulkActionsContainer: document.getElementById('bulk-actions-unchecked'),
            selectAllCheckbox: document.getElementById('select-all-unchecked'),
            apiEndpoint: this.apiUrls.checkLog,
            apiParams: { dachamcong: 'False' },
            onRenderRow: (item) => this.renderUncheckedRow(item)
        });
    }

    getDateContext() {
        const val = this.els.filterMonth.value;
        if (!val) {
            const now = new Date();
            return { year: now.getFullYear(), month: now.getMonth() + 1 };
        }
        const [y, m] = val.split('-');
        return { year: parseInt(y), month: parseInt(m) };
    }

    getDaysInMonth(year, month) {
        return new Date(year, month, 0).getDate();
    }

    ensureDateValue() {
        if (this.els.filterDate && !this.els.filterDate.value) {
            this.els.filterDate.value = AppUtils.DateUtils.toInputValue(new Date());
        }
    }

    updateFilterVisibility(tabId) {
        const isSummaryTab = tabId === '#tab-tong-hop';
        if (this.els.filterMonthWrapper) {
            this.els.filterMonthWrapper.classList.toggle('hidden', !isSummaryTab);
        }
        if (this.els.filterDateWrapper) {
            this.els.filterDateWrapper.classList.toggle('hidden', isSummaryTab);
        }
    }

    renderSummaryHeader() {
        const { year, month } = this.getDateContext();
        const days = this.getDaysInMonth(year, month);
        const thead = document.querySelector('#summary-table thead');
        
        // KHẮC PHỤC LỖI 1: Thêm Checkbox vào Header
        let html = `
            <tr>
                <th class="sticky-col-left px-4 py-3 text-left text-xs font-bold text-slate-700 uppercase tracking-wider min-w-[250px] shadow-sm flex items-center gap-3">
                    <div class="flex items-center h-full">
                        <input type="checkbox" id="select-all-summary" class="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer">
                    </div>
                    <span>NHÂN VIÊN</span>
                </th>
        `;

        const daysOfWeek = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
        for (let i = 1; i <= days; i++) {
            const date = new Date(year, month - 1, i);
            const dow = daysOfWeek[date.getDay()];
            const isWeekend = (date.getDay() === 0 || date.getDay() === 6);
            const colorClass = isWeekend ? 'text-red-500 bg-red-50/50' : 'text-slate-600';
            const isToday = new Date().toDateString() === date.toDateString();
            const todayClass = isToday ? 'bg-blue-100 ring-2 ring-inset ring-blue-400' : '';

            html += `
                <th class="px-1 py-2 text-center text-xs font-semibold border-l border-slate-100 min-w-[45px] ${colorClass} ${todayClass}">
                    <div class="flex flex-col">
                        <span class="opacity-75 text-[10px]">${dow}</span>
                        <span>${String(i).padStart(2,'0')}</span>
                    </div>
                </th>
            `;
        }

        html += `
                <th class="sticky-col-right px-3 py-3 text-center text-xs font-bold text-slate-700 uppercase border-l border-slate-200 min-w-[80px] bg-slate-50">
                    TỔNG
                </th>
            </tr>
        `;
        thead.innerHTML = html;
        this.currentDaysInMonth = days;
    }

    renderSummaryRow(item, index) {
        // Fallback: Tìm index nếu không được truyền vào (do TableManager chưa support)
        if (typeof index !== 'number' && this.managers.summary && this.managers.summary.state && this.managers.summary.state.data) {
            index = this.managers.summary.state.data.indexOf(item);
        }

        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50 transition-colors group/row';
        const { year, month } = this.getDateContext();
        
        // Sticky Left Column
        let leftColHtml = `
            <td class="sticky-col-left px-4 py-3 bg-white border-b border-slate-100 z-20">
                <div class="flex items-start gap-3">
                    <div class="pt-1">
                        <input type="checkbox" class="row-checkbox w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer" data-id="${item.nhanvien_id}">
                    </div>
                    <div>
                        <div class="font-medium text-slate-900 text-sm">${item.ten_nv}</div>
                        <div class="flex items-center gap-2 mt-0.5">
                            <span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200">${item.ma_nv}</span>
                            <span class="text-xs text-slate-500 truncate max-w-[120px]" title="${item.ten_cv}">${item.ten_cv || '--'}</span>
                        </div>
                    </div>
                </div>
            </td>
        `;

        // Render Days
        let daysHtml = '';
        const logs = item.logs || {};
        const days = this.currentDaysInMonth || 31;

        // Tooltip position logic
        const isTopRows = (typeof index === 'number') && index < 3;
        const tooltipPosClass = isTopRows ? 'top-full mt-2' : 'bottom-full mb-2';
        const arrowPosClass = isTopRows ? '-top-1' : '-bottom-1';

        for (let i = 1; i <= days; i++) {
            const dayKey = String(i).padStart(2, '0');
            const dayLogs = logs[dayKey] || [];
            
            const date = new Date(year, month - 1, i);
            const isWeekend = (date.getDay() === 0 || date.getDay() === 6);
            
            // Cell Background
            let cellBg = isWeekend ? 'bg-orange-50/40' : '';
            const isToday = new Date().toDateString() === date.toDateString();
            if (isToday) cellBg = 'bg-blue-50/30';

            let cellContent = `<span class="text-slate-200 text-xs select-none">-</span>`;

            if (dayLogs.length > 0) {
                let totalWork = 0;
                let hasLate = false;
                let hasEarly = false;
                let hasOff = false;
                let hasWork = false;

                // Tính toán tổng hợp từ các log trong ngày
                dayLogs.forEach(log => {
                    if (log.tg_lamviec) totalWork += log.tg_lamviec;
                    if (log.codimuon) hasLate = true;
                    if (log.covesom) hasEarly = true;
                    // Logic xác định nghỉ: log có codilam=False
                    if (log.codilam === false) hasOff = true;
                    // Nếu log có tg_lamviec > 0 hoặc không phải record nghỉ explicitly -> coi là có đi làm
                    if (log.tg_lamviec > 0) hasWork = true;
                });

                // --- 1. Main Display Logic ---
                if (hasOff && !hasWork) {
                    const isKP = dayLogs.some(l => l.ghichu && l.ghichu.toLowerCase().includes('không phép'));
                    cellContent = `<span class="text-[10px] font-bold ${isKP ? 'text-red-600 bg-red-100 border-red-200' : 'text-orange-600 bg-orange-100 border-orange-200'} px-1 rounded border shadow-sm select-none">${isKP ? 'KP' : 'P'}</span>`;
                } else if (totalWork > 0) {
                    cellContent = `<strong>${Number(totalWork).toFixed(1).replace('.0','')}</strong>`;
                    if (hasLate || hasEarly) {
                        cellContent += `<span class="absolute top-1 right-1 w-1.5 h-1.5 bg-red-500 rounded-full border border-white"></span>`;
                    }
                    cellContent = `<span class="text-slate-900">${cellContent}</span>`;
                } else {
                    cellContent = `<span class="text-orange-500 font-medium">0</span>`;
                }

                // --- 2. Tooltip Logic ---
                const dateStr = `${String(i).padStart(2,'0')}/${String(month).padStart(2,'0')}/${year}`;
                
                const tooltipItemsHtml = dayLogs.map((rec, idx) => {
                    // Time string
                    const timeStr = (rec.tg_vao && rec.tg_ra)
                        ? `${AppUtils.TimeUtils.formatDisplay(rec.tg_vao)} - ${AppUtils.TimeUtils.formatDisplay(rec.tg_ra)}`
                        : (rec.codilam !== false ? 'Chưa chấm đủ' : '');

                    // Warnings
                    const warnings = [];
                    if (rec.thoigiandimuon) warnings.push(`Muộn ${rec.thoigiandimuon}`);
                    if (rec.thoigianvesom) warnings.push(`Sớm ${rec.thoigianvesom}`);

                    // Status Line
                    let statusHtml = '';
                    if (rec.codilam === false) {
                        statusHtml = `<div class="text-orange-300">📝 ${rec.ghichu || 'Nghỉ'}</div>`;
                    } else {
                        statusHtml = `<div>🕒 ${timeStr} <span class="text-slate-400">(${Number(rec.tg_lamviec||0).toFixed(1)}h)</span></div>`;
                    }

                    return `
                        <div class="${idx > 0 ? 'border-t border-slate-600 mt-2 pt-2' : ''}">
                            <div class="font-bold text-emerald-400 mb-0.5 text-[11px]">
                                ${rec.codilam !== false ? '✅' : '⛔'} ${rec.tencalamviec || 'Ca làm việc'}
                            </div>
                            ${statusHtml}
                            ${warnings.length
                                ? `<div class="text-orange-400 text-[10px] mt-0.5">⚠️ ${warnings.join(', ')}</div>`
                                : ''
                            }
                        </div>
                    `;
                }).join('');

                cellContent += `
                    <div class="absolute z-[60] ${tooltipPosClass} left-1/2 -translate-x-1/2
                    w-52 invisible group-hover:visible opacity-0 group-hover:opacity-100
                    transition-all duration-200 pointer-events-none select-none">
                        <div class="bg-slate-800 text-white text-xs rounded-lg shadow-xl
                        p-2.5 text-left leading-relaxed relative border border-slate-600">
                            
                            <div class="absolute ${arrowPosClass} left-1/2 -translate-x-1/2
                                w-2 h-2 bg-slate-800 border-l border-t border-slate-600 rotate-45">
                            </div>

                            <div class="font-bold text-white mb-2 border-b border-slate-600 pb-1">
                                📅 ${dateStr}
                            </div>

                            ${tooltipItemsHtml}
                        </div>
                    </div>
                `;
            }

            daysHtml += `
                <td class="border-l border-slate-100 border-b p-0 text-center text-sm group relative cursor-pointer hover:bg-slate-50 transition-colors ${cellBg}">
                    <div class="h-12 flex items-center justify-center w-full relative">
                        ${cellContent}
                    </div>
                </td>
            `;
        }

        const totalHtml = `
            <td class="sticky-col-right px-2 py-3 text-center text-sm font-bold text-blue-600 border-l border-slate-200 border-b bg-slate-50">
                ${item.tongthoigianlamviec ? Number(item.tongthoigianlamviec).toFixed(1).replace('.0','') : '0'}
            </td>
        `;

        tr.innerHTML = leftColHtml + daysHtml + totalHtml;
        return tr;
    }

    renderEmployeeInfo(item) {
        return `
            <div class="font-medium text-slate-900">${item.hovaten || 'N/A'}</div>
            <div class="text-xs text-slate-500">${item.manhanvien || 'N/A'}</div>
        `;
    }

    renderCheckedRow(item) {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50 border-b border-slate-200';
        
        const khungGio = item.khunggiolamviec || {};
        const timeIn = AppUtils.TimeUtils.formatDisplay(khungGio.thoigianbatdau);
        const timeOut = AppUtils.TimeUtils.formatDisplay(khungGio.thoigianketthuc);
        const tenCa = this.getShiftName(item.loaicalamviec, khungGio);
        
        tr.innerHTML = `
            <td class="px-4 py-4 text-center">
                <input type="checkbox" class="row-checkbox w-4 h-4 rounded border-slate-300 cursor-pointer" data-id="${item.nhanvien_id}">
            </td>
            <td class="px-4 py-4">${this.renderEmployeeInfo(item)}</td>
            <td class="px-4 py-4 text-sm text-slate-700">
                <span class="bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-xs font-medium border border-blue-100">${tenCa}</span>
            </td>
            <td class="px-4 py-4">
                <div class="flex items-center gap-3 text-sm">
                    <div class="flex flex-col items-center">
                        <span class="text-xs text-slate-500 mb-0.5">Vào</span>
                        <span class="font-mono font-medium ${item.codimuon ? 'text-red-600' : 'text-green-600'}">${timeIn}</span>
                    </div>
                    <i class="fas fa-arrow-right text-slate-300 text-xs"></i>
                    <div class="flex flex-col items-center">
                        <span class="text-xs text-slate-500 mb-0.5">Ra</span>
                        <span class="font-mono font-medium ${item.covesom ? 'text-orange-600' : 'text-slate-700'}">${timeOut}</span>
                    </div>
                </div>
            </td>
            <td class="px-4 py-4"><button class="text-slate-400 hover:text-blue-600"><i class="fas fa-ellipsis-h"></i></button></td>
        `;
        return tr;
    }

    renderUncheckedRow(item) {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50 border-b border-slate-200';
        
        const khungGio = item.khunggiolamviec || {};
        const tenCa = this.getShiftName(item.loaicalamviec, khungGio);
        
        tr.innerHTML = `
            <td class="px-4 py-4 text-center">
                <input type="checkbox" class="row-checkbox w-4 h-4 rounded border-slate-300 cursor-pointer" data-id="${item.nhanvien_id}">
            </td>
            <td class="px-4 py-4">${this.renderEmployeeInfo(item)}</td>
            <td class="px-4 py-4 text-sm text-slate-500">${tenCa}</td>
            <td class="px-4 py-4">
                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">Chưa chấm công</span>
            </td>
        `;
        return tr;
    }

    getShiftName(loaicalamviec, khungGio) {
        if (!loaicalamviec) return 'Ca mặc định';
        
        const loaiMap = {
            'HANH_CHINH': 'Ca hành chính',
            'TU_DO': 'Ca tự do',
            'THEO_CA': 'Theo ca'
        };
        
        let tenCa = loaiMap[loaicalamviec] || loaicalamviec;
        
        // Thêm khung giờ nếu có
        if (khungGio.thoigianbatdau && khungGio.thoigianketthuc) {
            const start = AppUtils.TimeUtils.formatDisplay(khungGio.thoigianbatdau);
            const end = AppUtils.TimeUtils.formatDisplay(khungGio.thoigianketthuc);
            tenCa += ` (${start}-${end})`;
        }
        
        return tenCa;
    }

    initEventListeners() {
        // 1. Filter Form Changes
        this.els.filterForm.querySelectorAll('input, select').forEach(input => {
            this.eventManager.add(input, 'change', () => this.handleTabChange(this.currentTabId));
        });

        // 2. Search Input Changes (Debounced using AppUtils)
        if (this.els.searchInput) {
            const debouncedSearch = AppUtils.Helper.debounce(() => {
                this.handleTabChange(this.currentTabId);
            }, 400);
            this.eventManager.add(this.els.searchInput, 'input', debouncedSearch);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.TimekeepingSummary = new TimekeepingSummaryManager();
    window.TimekeepingSummary.init();
});