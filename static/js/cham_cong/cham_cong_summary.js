/**
 * ChamCongSummaryManager - Quản lý bảng tổng hợp chấm công
 * Phiên bản: Integration (Kết nối API thực tế)
 */
class ChamCongSummaryManager {
    constructor(config) {
        this.config = config;
        this.state = {
            currentMonth: new Date(),
            deptFilter: 'all',
            searchFilter: '',
            activeTab: 'all', // all | logged | missing
            data: [], // Dữ liệu đã chuẩn hóa
            daysInMonth: [],
            isLoading: false
        };

        this.elements = {
            monthInput: document.getElementById('filter-month'),
            deptSelect: document.getElementById('filter-dept'),
            searchInput: document.getElementById('filter-search'),
            tableHeader: document.getElementById('summary-header'),
            tableBody: document.getElementById('summary-body'),
            loading: document.getElementById('loading-overlay'),
            countLabel: document.getElementById('record-count'),
            tabs: document.querySelectorAll('.tab-link')
        };

        this.init();
    }

    init() {
        // 1. Setup Input Month
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const currentMonthStr = `${yyyy}-${mm}`;
        
        if (this.elements.monthInput) {
            this.elements.monthInput.value = currentMonthStr;
            this.elements.monthInput.max = currentMonthStr; // Chặn tương lai
            this.elements.monthInput.addEventListener('change', (e) => this.handleDateChange(e.target.value));
        }

        // 2. Event Listeners Filters
        if (this.elements.deptSelect) {
            this.elements.deptSelect.addEventListener('change', (e) => {
                this.state.deptFilter = e.target.value;
                this.renderBody();
            });
        }
        
        if (this.elements.searchInput) {
            let timeout;
            this.elements.searchInput.addEventListener('input', (e) => {
                clearTimeout(timeout);
                timeout = setTimeout(() => {
                    this.state.searchFilter = e.target.value.toLowerCase();
                    this.renderBody();
                }, 300);
            });
        }

        // 3. Load dữ liệu lần đầu
        this.handleDateChange(currentMonthStr);
    }

    handleDateChange(dateStr) {
        if (!dateStr) return;
        const [year, month] = dateStr.split('-').map(Number);
        this.state.currentMonth = new Date(year, month - 1, 1);
        
        this.calculateDaysInMonth(year, month);
        this.renderHeader();
        this.fetchData(dateStr); // Gọi API với chuỗi YYYY-MM
    }

    calculateDaysInMonth(year, month) {
        this.state.daysInMonth = [];
        const daysCount = new Date(year, month, 0).getDate();
        const today = new Date();
        const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month - 1;

        for (let d = 1; d <= daysCount; d++) {
            const date = new Date(year, month - 1, d);
            const dayOfWeek = date.getDay();
            const dayNames = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
            
            this.state.daysInMonth.push({
                dateStr: `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
                dayNum: String(d).padStart(2, '0'), // Key để map với logs (01, 02...)
                weekday: dayNames[dayOfWeek],
                isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
                isToday: isCurrentMonth && d === today.getDate()
            });
        }
    }

    switchTab(tabName) {
        this.state.activeTab = tabName;
        // Update UI Tabs
        document.querySelectorAll('.tab-link').forEach(btn => {
            if(btn.id === `tab-${tabName}`) {
                btn.className = "tab-link pb-3 border-b-2 font-medium text-sm transition-colors border-emerald-500 text-emerald-600";
            } else {
                btn.className = "tab-link pb-3 border-b-2 font-medium text-sm transition-colors border-transparent text-slate-500 hover:text-slate-700";
            }
        });
        this.renderBody();
    }

    // --- CORE: GỌI API ---
    async fetchData(dateStr) {
        this.setLoading(true);
        
        try {
            // Construct URL: /api/.../?thoigian=2026-01
            const url = `${this.config.apiEndpoint}?thoigian=${dateStr}`;
            
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            
            const result = await response.json();

            if (result.success) {
                // ADAPTER: Chuyển đổi dữ liệu API sang format UI cần
                this.state.data = this.processApiData(result.data);
                this.renderBody();
            } else {
                this.showError(result.message || 'Lỗi lấy dữ liệu từ server');
            }

        } catch (error) {
            console.error("Fetch Error:", error);
            this.showError('Không thể kết nối đến máy chủ.');
        } finally {
            this.setLoading(false);
        }
    }

    // --- ADAPTER: Chuyển đổi cấu trúc dữ liệu ---
    processApiData(apiData) {
        if (!Array.isArray(apiData)) return [];

        return apiData.map(item => {
            // Map Logs: Chuyển key tiếng Việt API sang key chuẩn UI
            const processedLogs = {};
            
            // item.logs là object: { "09": [array ca], "10": [array ca] }
            for (const [dayKey, shiftList] of Object.entries(item.logs || {})) {
                if (Array.isArray(shiftList)) {
                    processedLogs[dayKey] = shiftList.map(shift => ({
                        // Mapping fields
                        timeIn: shift.tg_vao,
                        timeOut: shift.tg_ra,
                        value: shift.tg_lamviec, // API trả về phút hoặc công
                        
                        status: shift.codilam, // true/false
                        shiftName: shift.tencalamviec,
                        note: shift.ghichu,
                        
                        // Logic vi phạm
                        isLate: shift.codimuon,
                        lateMin: shift.thoigiandimuon,
                        isEarly: shift.covesom,
                        earlyMin: shift.thoigianvesom
                    }));
                }
            }

            return {
                id: item.nhanvien_id,
                name: item.ten_nv,
                code: item.ma_nv,
                jobTitle: item.ten_cv,
                deptId: item.phongban_id,
                totalWork: item.tongthoigianlamviec,
                logs: processedLogs
            };
        });
    }

    renderHeader() {
        // Sticky Left Column
        let html = `
            <th class="sticky-col-left w-[260px] min-w-[260px] p-0 text-left bg-slate-50 border-b border-r border-slate-200 z-30 shadow-[4px_0_8px_-4px_rgba(0,0,0,0.1)]">
                <div class="px-4 py-3 h-full flex items-center font-bold text-slate-600 uppercase text-xs tracking-wider">
                    Nhân viên
                </div>
            </th>
        `;

        // Days Columns
        this.state.daysInMonth.forEach(day => {
            const bgClass = day.isToday ? 'bg-blue-100' : (day.isWeekend ? 'bg-orange-50' : '');
            const textClass = day.isToday ? 'text-blue-700' : (day.isWeekend ? 'text-red-500' : 'text-slate-500');
            
            html += `
                <th class="border-b border-r border-slate-200 min-w-[48px] w-12 p-0 text-center ${bgClass}">
                    <div class="py-2 flex flex-col items-center justify-center h-full">
                        <span class="text-[10px] font-bold ${textClass} uppercase mb-0.5">${day.weekday}</span>
                        <span class="text-sm font-bold ${day.isToday ? 'text-blue-700' : 'text-slate-700'}">${day.dayNum}</span>
                    </div>
                </th>
            `;
        });

        // Sticky Right Column
        html += `
            <th class="sticky-col-right w-20 min-w-[80px] p-0 text-center bg-slate-50 border-b border-l border-slate-200 z-30 shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.1)]">
                <div class="px-2 py-3 h-full flex items-center justify-center font-bold text-slate-700 uppercase text-xs tracking-wider">
                    Tổng
                </div>
            </th>
        `;

        if (this.elements.tableHeader) this.elements.tableHeader.innerHTML = html;
    }

    renderBody() {
        const { data, deptFilter, searchFilter, activeTab, daysInMonth } = this.state;
        
        // 1. Client-side Filtering
        const filteredData = data.filter(emp => {
            if (deptFilter !== 'all' && String(emp.deptId) !== String(deptFilter)) return false;
            if (searchFilter && !emp.name.toLowerCase().includes(searchFilter) && !emp.code.toLowerCase().includes(searchFilter)) return false;
            if (activeTab === 'logged' && (!emp.totalWork || emp.totalWork <= 0)) return false;
            if (activeTab === 'missing' && emp.totalWork > 0) return false;
            return true;
        });

        if (this.elements.countLabel) this.elements.countLabel.textContent = `Hiển thị ${filteredData.length} nhân viên`;

        if (filteredData.length === 0) {
            this.elements.tableBody.innerHTML = `<tr><td colspan="100" class="text-center py-12 text-slate-400 italic">Không tìm thấy dữ liệu nhân viên</td></tr>`;
            return;
        }

        // 2. Render Rows
        const html = filteredData.map((emp, index) => {
            // Logic Smart Tooltip Direction (Tránh bị che khuất)
            const isTopRows = index < 2; 
            const tooltipPosClass = isTopRows ? 'top-full mt-2' : 'bottom-full mb-2';
            const arrowPosClass = isTopRows ? '-top-1' : '-bottom-1';

            // Render Cells for each Day
            const dailyCells = daysInMonth.map(day => {
                const dailyRecords = emp.logs[day.dayNum] || [];
                
                let cellContent = '<span class="text-slate-200 text-xs select-none">-</span>';
                let cellBg = '';
                
                if (day.isWeekend) cellBg = 'bg-orange-50/40';
                if (day.isToday) cellBg = 'bg-blue-50/30';

                // --- AGGREGATION LOGIC ---
                if (dailyRecords.length > 0) {
                    let totalValue = 0;
                    let hasLate = false, hasEarly = false;
                    let isAbsent = true; 
                    let absenceNote = '';

                    dailyRecords.forEach(record => {
                        if (record.status) { // codilam = true
                            totalValue += (record.value || 0);
                            if (record.isLate) hasLate = true;
                            if (record.isEarly) hasEarly = true;
                            isAbsent = false;
                        } else {
                            absenceNote = record.note || 'Nghỉ';
                        }
                    });

                    // --- DISPLAY CONTENT IN CELL ---
                    let displayHtml = '';
                    if (!isAbsent) {
                        // Hiển thị công. Nếu là phút (VD: 455), có thể format lại nếu cần.
                        // Ở đây giữ nguyên giá trị API trả về để chính xác.
                        // Nếu muốn hiển thị giờ: (totalValue / 60).toFixed(1)
                        displayHtml = `<span class="font-bold text-slate-700 text-sm">${Number(totalValue)}</span>`; 
                        
                        if (hasLate || hasEarly) {
                            displayHtml += `<span class="absolute top-1 right-1 w-1.5 h-1.5 bg-red-500 rounded-full border border-white"></span>`;
                        }
                    } else {
                        const isKP = absenceNote.toLowerCase().includes('không phép');
                        const badgeClass = isKP ? 'text-red-600 bg-red-100 border-red-200' : 'text-orange-600 bg-orange-100 border-orange-200';
                        displayHtml = `<span class="text-[10px] font-bold ${badgeClass} border px-1.5 py-0.5 rounded shadow-sm">${isKP ? 'KP' : 'P'}</span>`;
                    }
                    cellContent = displayHtml;

                    // --- TOOLTIP CONTENT ---
                    const tooltipItemsHtml = dailyRecords.map((rec, idx) => {
                        const timeStr = (rec.timeIn && rec.timeOut) ? `${rec.timeIn} - ${rec.timeOut}` : 'Chưa chấm đủ';
                        const statusIcon = rec.status ? '✅' : '⛔';
                        const warningText = [];
                        if (rec.isLate) warningText.push(`Muộn ${rec.lateMin}p`);
                        if (rec.isEarly) warningText.push(`Sớm ${rec.earlyMin}p`);
                        
                        const borderClass = idx > 0 ? 'border-t border-slate-600 mt-2 pt-2' : '';
                        
                        return `
                            <div class="${borderClass}">
                                <div class="font-bold text-emerald-400 mb-0.5 text-[11px]">${statusIcon} ${rec.shiftName || 'Ca làm việc'}</div>
                                ${rec.status 
                                    ? `<div>🕒 ${timeStr} <span class="text-slate-400">(${rec.value})</span></div>` 
                                    : `<div class="text-orange-300">📝 ${rec.note || 'Nghỉ'}</div>`
                                }
                                ${warningText.length > 0 ? `<div class="text-orange-400 text-[10px] mt-0.5">⚠️ ${warningText.join(', ')}</div>` : ''}
                            </div>
                        `;
                    }).join('');

                    cellContent += `
                        <div class="absolute z-[60] ${tooltipPosClass} left-1/2 -translate-x-1/2 w-52 invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none">
                            <div class="bg-slate-800 text-white text-xs rounded-lg shadow-xl p-2.5 text-left leading-relaxed relative border border-slate-600">
                                <div class="absolute ${arrowPosClass} left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-800 border-l border-t border-slate-600 rotate-45"></div>
                                <div class="font-bold text-white mb-2 border-b border-slate-600 pb-1">📅 ${day.dateStr}</div>
                                ${tooltipItemsHtml}
                            </div>
                        </div>
                    `;
                }

                return `
                    <td class="border-r border-slate-100 p-0 text-center group relative cursor-pointer hover:bg-blue-50 transition-colors ${cellBg}">
                        <div class="h-12 flex items-center justify-center w-full relative">
                            ${cellContent}
                        </div>
                    </td>
                `;
            }).join('');

            // Return Row HTML
            return `
                <tr class="hover:bg-slate-50 transition-colors group/row">
                    <td class="sticky-col-left p-0 z-20">
                        <div class="px-4 py-2 flex items-center gap-3 h-12 bg-white group-hover/row:bg-slate-50 transition-colors border-r border-slate-200">
                            <div class="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold shrink-0 border border-white shadow-sm">
                                ${this.getInitials(emp.name)}
                            </div>
                            <div class="min-w-0 text-left">
                                <div class="flex items-center gap-2">
                                    <span class="text-sm font-semibold text-slate-700 truncate" title="${emp.name}">${emp.name}</span>
                                    <span class="text-[10px] bg-slate-100 text-slate-500 px-1 rounded border border-slate-200">${emp.code}</span>
                                </div>
                                <div class="text-[10px] text-slate-400 truncate">${emp.jobTitle}</div>
                            </div>
                        </div>
                    </td>
                    ${dailyCells}
                    <td class="sticky-col-right p-0 text-center z-20">
                        <div class="h-12 flex items-center justify-center bg-white group-hover/row:bg-slate-50 transition-colors font-bold text-emerald-600 border-l border-slate-200">
                            ${Number(emp.totalWork)}
                        </div>
                    </td>
                </tr>`;
        }).join('');

        this.elements.tableBody.innerHTML = html;
    }

    // --- Helpers ---
    setLoading(state) {
        if (this.elements.loading) {
            this.elements.loading.classList.toggle('hidden', !state);
        }
        this.state.isLoading = state;
    }

    showError(msg) {
        this.elements.tableBody.innerHTML = `<tr><td colspan="100" class="text-center py-12 text-red-500 font-medium">${msg}</td></tr>`;
    }

    getInitials(name) {
        if (!name) return '--';
        const parts = name.split(' ');
        if (parts.length === 1) return parts[0][0].toUpperCase();
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    
    exportReport() {
        // Logic export: Redirect đến URL export của Django
        const params = new URLSearchParams({
            thoigian: this.elements.monthInput.value,
            dept: this.state.deptFilter
        });
        window.location.href = `/hrm/cham-cong/export-bao-cao/?${params.toString()}`;
    }
}