/**
 * Quản lý trang Chi tiết Phiếu Lương
 */
class PayrollDetailManager {
    constructor() {
        this.excelManager = null;
        this.elementMap = new Map(); 
        this.currentPayrollId = document.getElementById('salary-table-select')?.value || 1;
        this.eventManager = AppUtils.EventManager.create();
        this.lastFocusedElement = null;
        
        this.isMerging = false; 
        this.baseColumns = this.getBaseColumns();
        
        // Formula Engine
        this.formulaEngine = null; 
        this.idToCodeMap = {}; 
        this.codeToIdMap = {}; 
        this.formulaConfig = {}; 

        // Debounce tính công thức
        this.debouncedRecalc = AppUtils.Helper.debounce((changes) => this.processExcelChanges(changes), 150);

        // DOM Elements cho Modal
        this.modal = document.getElementById('detail-modal');
        this.modalTemplate = document.getElementById('detail-modal-template');
    }

    init() {
        this.fetchElementMetadata().then(() => {
            this.initExcelTable();
        });
        this.initEvents();
        console.log('✅ PayrollDetailManager initialized');
    }

    // --- 1. SETUP & TABLE ---

    async fetchElementMetadata() {
        try {
            const res = await AppUtils.API.get('/hrm/quan-ly-luong/api/phan-tu-luong/list', { page_size: 9999 });
            const elements = res.data || res || [];
            elements.forEach(el => {
                this.elementMap.set(Number(el.id), {
                    code: el.maphantu, name: el.tenphantu, type: el.loaiphantu 
                });
            });
        } catch (error) {
            console.error('Lỗi tải metadata:', error);
        }
    }

    initExcelTable() {
        this.excelManager = new ExcelTableManager({
            tableHeader: document.getElementById('payroll-table-header'),
            tableBody: document.getElementById('payroll-table-body'),
            bulkActionsContainer: document.getElementById('payroll-table-bulk-actions'),
            apiEndpoint: '/hrm/to-chuc-nhan-su/api/v1/phong-ban/employee/',
            apiParams: { page_size: 1000, ordering: 'ten_nhanvien' },
            autoLoad: true,
            enableBulkActions: true,
            columns: this.baseColumns,
            onDataLoaded: () => this.handleDataLoaded(),
            onCellChange: (changes) => this.onExcelDataChange(changes)
        });

        this.initTableEvents();
    }

    getBaseColumns() {
        return [
            {
                key: 'employee_info', title: 'Họ và tên', width: 250, sticky: true, 
                // UPDATE: Thêm sự kiện click mở modal
                render: (item) => `
                    <button type="button" class="w-full text-left flex flex-col justify-center h-full cursor-pointer group" data-detail-open="payroll" data-employee-id="${item.id}" aria-label="Xem chi tiết lương của ${item.hovaten}">
                        <div class="font-medium text-blue-600 group-hover:text-blue-800 group-hover:underline text-sm truncate" title="Xem chi tiết lương của ${item.hovaten}">
                            ${item.hovaten || 'Chưa có tên'}
                        </div>
                        <div class="text-xs text-slate-500 font-mono mt-0.5">${item.manhanvien || 'N/A'}</div>
                    </button>`
            },
            {
                key: 'cong_tac.phong_ban', title: 'Phòng ban', width: 150, sticky: true,
                render: (item) => `<span class="text-slate-600 text-sm">${item.cong_tac?.phong_ban || '-'}</span>`
            }
        ];
    }

    // --- 2. DATA HANDLING (CORE LOGIC) ---

    async handleDataLoaded() {
        if (this.isMerging) return;
        this.isMerging = true;
        this.toggleLoading(true);

        try {
            const rows = this.excelManager.state.data;
            if (!rows?.length) return;

            const payrollRes = await AppUtils.API.get('/hrm/quan-ly-luong/api/phieu-luong/list', { 
                bangluong_id: this.currentPayrollId
            });

            if (!payrollRes.success) throw new Error('Lỗi tải dữ liệu lương');

            // === BƯỚC CHUẨN HÓA DỮ LIỆU ===
            const { columnIds, valuesMap, extraDataMap } = this.normalizePayrollData(payrollRes.data);

            this.currentPhanTuLuong = columnIds; // Lưu để dùng khi Save

            // Xây dựng config tính toán
            this.buildFormulaMappings(columnIds, rows, valuesMap);

            // Tạo cột động trên bảng
            const dynamicColumns = this.buildDynamicColumns(columnIds);
            this.excelManager.setColumns([...this.baseColumns, ...dynamicColumns]);

            // Map dữ liệu vào từng dòng
            rows.forEach(row => {
                const empId = String(row.id);
                // Dữ liệu chi tiết lương (Map<ElementID, Details>)
                const empPayrollDetails = valuesMap[empId] || {};
                
                // Dữ liệu mở rộng (Timesheet, Total Salary...) dùng cho Modal
                row.extra_data = extraDataMap[empId] || null;
                
                row.salary_values = {}; 
                row.salary_meta = {};

                columnIds.forEach(colId => {
                    const detail = empPayrollDetails[colId];
                    if (detail) {
                        row.salary_values[colId] = detail.value;
                        row.salary_meta[colId] = { 
                            status: detail.status, 
                            type: detail.type, 
                            formula: detail.formula 
                        };
                        
                        // Cập nhật type vào map để dùng tính tổng (Nếu metadata chưa có)
                        const meta = this.elementMap.get(Number(colId));
                        if (meta && !meta.type) meta.type = detail.type;
                    } else {
                        row.salary_values[colId] = 0;
                        row.salary_meta[colId] = { status: 'system' };
                    }
                });
            });

            // Init Engine & Render
            const flatData = this.transformToEngineData(rows);
            this.formulaEngine = new FormulaEngine(flatData, this.formulaConfig);

            this.excelManager.setData(rows);
            this.updateCellStyles();

        } catch (error) {
            console.error(error);
            AppUtils.Notify.error(error.message);
        } finally {
            this.toggleLoading(false);
            setTimeout(() => { this.isMerging = false; }, 300);
        }
    }

    /**
     * Chuẩn hóa dữ liệu từ API về một format chung
     * @param {Object} data - Dữ liệu thô từ API
     */
    normalizePayrollData(data) {
        let columnIds = [];
        let valuesMap = {}; // Map<EmpID, DetailsMap>
        let extraDataMap = {}; // Map<EmpID, FullObject>

        // 1. Lấy danh sách cột
        if (Array.isArray(data.phan_tu_luong)) {
            columnIds = data.phan_tu_luong.map(String);
        }

        // 2. Xử lý phần phiếu lương
        if (Array.isArray(data.phieu_luong)) {
            // CASE 2: Đã lưu (Array of Objects)
            data.phieu_luong.forEach(item => {
                const empId = String(item.nhanvien_id);
                valuesMap[empId] = item.ct_phieu_luong || {};
                extraDataMap[empId] = item; // Lưu full object để lấy ngaychamcong
            });
        } else if (typeof data.phieu_luong === 'object') {
            // CASE 1: Tạo mới / Draft (Map<EmpID, Map<ElID, Detail>>)
            Object.keys(data.phieu_luong).forEach(empId => {
                valuesMap[empId] = data.phieu_luong[empId];
                // Case này thường chưa có dữ liệu chấm công chi tiết trả về cấu trúc
                extraDataMap[empId] = { 
                    nhanvien_id: empId, 
                    is_draft: true // Đánh dấu là draft
                };
            });
        }

        return { columnIds, valuesMap, extraDataMap };
    }

    // --- 3. CALCULATION LOGIC (Giữ nguyên logic cũ) ---
    onExcelDataChange(changes) {
        if (!this.formulaEngine || !changes.length) return;
        this.debouncedRecalc(changes);
    }

    processExcelChanges(changes) {
        const affectedRowIds = new Set();
        changes.forEach(change => {
            const { item, key, value } = change;
            if (key.startsWith('salary_values.')) {
                const colId = key.split('.')[1];
                const colCode = this.idToCodeMap[colId];
                const rowId = item.id;
                
                const numVal = Number(value) || 0;
                if(!item.salary_values) item.salary_values = {};
                item.salary_values[colId] = numVal;

                if (colCode) {
                    const engineRow = this.formulaEngine.dataset.find(r => String(r.id) === String(rowId));
                    if (engineRow) engineRow.salary_values[colCode] = numVal;
                }
                affectedRowIds.add(rowId);
            }
        });

        affectedRowIds.forEach(rowId => {
            const formulaChanges = this.formulaEngine.recalculateRow(rowId);
            const rowData = this.excelManager.state.data.find(r => String(r.id) === String(rowId));
            const rowIndex = this.excelManager.state.data.indexOf(rowData);
            if (rowData && rowIndex !== -1) {
                this.applyFormulaChangesToUI(rowIndex, rowData, formulaChanges);
            }
        });
    }

    applyFormulaChangesToUI(rowIndex, rowData, changes) {
        const tableBody = this.excelManager.options.tableBody;
        if (!tableBody) return;
        Object.keys(changes).forEach(changedCode => {
            const changedId = this.codeToIdMap[changedCode];
            if (!changedId) return;
            const newValue = changes[changedCode];
            rowData.salary_values[changedId] = newValue;

            const cellInput = tableBody.querySelector(`input[data-row="${rowIndex}"][data-key="salary_values.${changedId}"]`);
            if (cellInput) {
                cellInput.value = this.formatNumber(newValue);
                this.flashHighlight(cellInput.closest('td') || cellInput);
            } else {
                const cellDiv = tableBody.querySelector(`div[data-row="${rowIndex}"][data-key="salary_values.${changedId}"]`);
                if (cellDiv) {
                    cellDiv.textContent = this.formatNumber(newValue);
                    this.flashHighlight(cellDiv);
                }
            }
        });
    }

    // --- 4. MODAL CHI TIẾT (TÍNH NĂNG MỚI) ---
    
    openDetailModal(employeeId) {
        const row = this.excelManager.state.data.find(r => String(r.id) === String(employeeId));
        if (!row) return;

        // 1. Inject Template vào Modal Body
        const modalForm = document.querySelector('#detail-modal form');
        if (modalForm && this.modalTemplate) {
            modalForm.innerHTML = ''; // Clear old
            modalForm.appendChild(this.modalTemplate.content.cloneNode(true));
        }

        // 2. Tùy chỉnh Footer (Ẩn Cancel, Chỉnh Submit thành Xuất phiếu lương)
        const btnSave = document.querySelector('#detail-modal [data-modal-submit]');
        const btnCancel = document.querySelector('#detail-modal [data-modal-close]:not([title="Đóng"])'); // Chọn nút Hủy (không phải nút X)
        
        if (btnCancel && btnCancel.tagName === 'BUTTON') {
             btnCancel.classList.add('hidden'); // Ẩn nút hủy
        }

        if (btnSave) {
            btnSave.innerHTML = '<i class="fas fa-print mr-2"></i>Xuất phiếu lương';
            btnSave.classList.remove('bg-blue-600', 'hover:bg-blue-700', 'bg-slate-500', 'hover:bg-slate-600');
            btnSave.classList.add('bg-emerald-600', 'hover:bg-emerald-700', 'text-white');
            // Gán sự kiện Export (Hiện tại chỉ log hoặc placeholder)
            btnSave.onclick = (e) => { 
                e.preventDefault(); 
                AppUtils.Notify.info('Tính năng xuất phiếu lương đang phát triển'); 
            };
        }

        // 3. Render Dữ liệu
        const extraData = row.extra_data || {};
        const titleEl = document.querySelector('#detail-modal [data-modal-title]'); // Title modal
        if (titleEl) titleEl.textContent = `Chi tiết lương: ${row.hovaten} (${row.manhanvien})`;

        // A. Render Timesheet (Cột Trái)
        this.renderTimesheetTable(extraData.ngaychamcong);

        // B. Render Salary Detail (Cột Phải)
        this.renderSalaryDetailList(row);

        // 4. Show Modal
        this.toggleModal(true);
    }

    toggleModal(show) {
        const modal = this.modal || document.getElementById('detail-modal');
        if (!modal) return;
        if (show) {
            this.lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
            modal.inert = false;
            modal.setAttribute('aria-hidden', 'false');
            AppUtils.Modal.open(modal);
            document.body.classList.add('overflow-hidden');
            const focusTarget = modal.querySelector('[data-modal-close], [data-modal-submit], button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
            if (focusTarget) focusTarget.focus();
        } else {
            if (modal.contains(document.activeElement)) {
                document.activeElement.blur();
            }
            modal.setAttribute('aria-hidden', 'true');
            modal.inert = true;
            AppUtils.Modal.close(modal);
            document.body.classList.remove('overflow-hidden');
            if (this.lastFocusedElement) this.lastFocusedElement.focus();
        }
    }

    renderTimesheetTable(timesheets) {
        const tbody = document.getElementById('modal-timesheet-body');
        const summaryEl = document.getElementById('modal-summary-work');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (!timesheets || !Array.isArray(timesheets) || timesheets.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="px-4 py-8 text-center text-slate-400 italic text-sm">Chưa có dữ liệu chấm công chi tiết</td></tr>`;
            if (summaryEl) summaryEl.textContent = '';
            return;
        }

        let totalHours = 0;
        let totalAmount = 0;

        timesheets.forEach(ts => {
            const date = new Date(ts.ngaylamviec).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
            // Fix: TimeField return HH:MM:SS, so slice 0-5 for HH:MM
            const inTime = ts.thoigianchamcongvao ? ts.thoigianchamcongvao.slice(0, 5) : '--:--';
            const outTime = ts.thoigianchamcongra ? ts.thoigianchamcongra.slice(0, 5) : '--:--';
            const hours = (ts.thoigianlamviec / 60).toFixed(1);
            
            // Fix: Show Job Name instead of Amount
            const jobName = ts.tencongviec || '-';

            totalHours += (ts.thoigianlamviec / 60);

            const tr = document.createElement('tr');
            tr.className = 'hover:bg-slate-50 border-b border-slate-50 last:border-0 transition-colors';
            tr.innerHTML = `
                <td class="px-3 py-2.5 whitespace-nowrap text-slate-700">${date}</td>
                <td class="px-3 py-2.5 text-center text-xs">
                    <span class="px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-600 font-medium">${ts.loaichamcong || '-'}</span>
                </td>
                <td class="px-3 py-2.5 text-center font-mono text-xs text-slate-500">${inTime} - ${outTime}</td>
                <td class="px-3 py-2.5 text-right font-medium text-slate-700">${hours}h</td>
                <td class="px-3 py-2.5 text-left text-slate-600 truncate max-w-[150px]" title="${jobName}">${jobName}</td>
            `;
            tbody.appendChild(tr);
        });

        if (summaryEl) summaryEl.innerHTML = `<span class="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs font-semibold">Tổng: ${totalHours.toFixed(1)}h</span>`;
    }

    renderSalaryDetailList(row) {
        const container = document.getElementById('modal-salary-body');
        const totalEl = document.getElementById('modal-total-salary');
        if (!container) return;
        container.innerHTML = '';

        const salaryValues = row.salary_values || {};
        const salaryMeta = row.salary_meta || {};
        
        // Group by Type (Thu nhập / Khấu trừ)
        const groups = { 'THU_NHAP': [], 'KHAU_TRU': [], 'OTHER': [] };

        Object.keys(salaryValues).forEach(colId => {
            const val = salaryValues[colId];
            const meta = this.elementMap.get(Number(colId));
            if (!meta) return;

            const type = meta.type || 'OTHER';
            const item = {
                name: meta.name,
                code: meta.code,
                value: val,
                meta: salaryMeta[colId] || {}
            };

            if (groups[type]) groups[type].push(item);
            else groups['OTHER'].push(item);
        });

        // Helper render group
        const renderGroup = (title, items, colorClass, borderClass) => {
            if (items.length === 0) return '';
            const total = items.reduce((acc, curr) => acc + Number(curr.value || 0), 0);
            const rows = items.map(i => `
                <div class="flex justify-between items-center py-2 border-b border-dashed border-slate-100 last:border-0 hover:bg-slate-50 px-3 transition-colors rounded-sm">
                    <div class="flex flex-col">
                        <span class="text-sm text-slate-700">${i.name}</span>
                        <span class="text-[10px] text-slate-400 font-mono hidden group-hover:block">${i.code}</span>
                    </div>
                    <span class="font-mono font-medium text-sm ${colorClass}">${this.formatNumber(i.value)}</span>
                </div>
            `).join('');

            return `
                <div class="mb-4">
                    <div class="flex justify-between items-end mb-2 px-3">
                        <span class="font-medium text-xs uppercase text-slate-500 tracking-wider">${title}</span>
                        <span class="font-bold text-sm ${colorClass}">${this.formatNumber(total)}</span>
                    </div>
                    <div class="bg-white border ${borderClass} rounded-lg shadow-sm overflow-hidden">
                        ${rows}
                    </div>
                </div>
            `;
        };

        const incomeHtml = renderGroup('Thu nhập', groups['THU_NHAP'], 'text-emerald-600', 'border-emerald-100');
        const deductionHtml = renderGroup('Khấu trừ', groups['KHAU_TRU'], 'text-red-600', 'border-red-100');
        
        container.innerHTML = `<div class="grid grid-cols-1 gap-2">${incomeHtml}${deductionHtml}</div>`;

        // Tính thực lĩnh
        const thucLinhCol = Array.from(this.elementMap.values()).find(e => e.code === 'THUC_LINH');
        let finalSalary = 0;
        
        if (thucLinhCol) {
             const id = this.codeToIdMap['THUC_LINH'];
             finalSalary = salaryValues[id] || 0;
        } else {
             const inc = groups['THU_NHAP'].reduce((a, b) => a + Number(b.value), 0);
             const ded = groups['KHAU_TRU'].reduce((a, b) => a + Number(b.value), 0);
             finalSalary = inc - ded;
        }

        if (totalEl) totalEl.innerHTML = `${this.formatNumber(finalSalary)} <span class="text-sm text-slate-400 font-normal">VNĐ</span>`;
    }

    // --- 5. HELPERS & UTILS ---

    flashHighlight(element) {
        element.classList.add('bg-green-100');
        setTimeout(() => element.classList.remove('bg-green-100'), 500);
    }

    formatNumber(value) {
        const num = Number(value) || 0;
        return new Intl.NumberFormat('vi-VN').format(num);
    }

    buildFormulaMappings(columnIds, rows, valuesMap) {
        this.idToCodeMap = {}; this.codeToIdMap = {}; this.formulaConfig = {};
        this.elementMap.forEach((meta, id) => {
            this.idToCodeMap[id] = meta.code; this.codeToIdMap[meta.code] = id;
        });

        // Chỉ cần lấy công thức từ row đầu tiên (giả sử công thức áp dụng chung cột)
        // Hoặc duyệt valuesMap của row đầu tiên
        if (rows.length > 0 && columnIds.length > 0) {
            const firstEmpId = String(rows[0].id);
            const firstDetails = valuesMap[firstEmpId] || {};
            
            columnIds.forEach(colId => {
                const detail = firstDetails[colId];
                if (detail?.formula) {
                    const colCode = this.idToCodeMap[colId];
                    if (colCode) this.formulaConfig[colCode] = this.convertFormulaToCode(detail.formula);
                }
            });
        }
    }

    convertFormulaToCode(formulaStr) {
        if (!formulaStr) return '';
        return formulaStr.replace(/(?<!\.)\b\d+\b(?!\.)/g, (match) => {
            const code = this.idToCodeMap[Number(match)];
            return code || match;
        });
    }

    transformToEngineData(rows) {
        return rows.map(row => {
            const engineRow = { id: row.id, salary_values: {} };
            if (row.salary_values) {
                Object.keys(row.salary_values).forEach(id => {
                    const code = this.idToCodeMap[id];
                    if (code) engineRow.salary_values[code] = row.salary_values[id];
                });
            }
            return engineRow;
        });
    }

    buildDynamicColumns(columnIds) {
        if (!Array.isArray(columnIds)) return [];
        return columnIds.map(id => {
            const meta = this.elementMap.get(Number(id));
            const isDeduction = meta?.type === 'KHAU_TRU';
            return {
                key: `salary_values.${id}`, title: meta ? meta.name : `Phần tử ${id}`, width: 120, align: 'right', type: 'input',
                render: (item) => {
                    const val = item.salary_values?.[id] || 0;
                    const metaStatus = item.salary_meta?.[id]?.status;
                    const displayVal = this.formatNumber(val);
                    const textColor = isDeduction ? 'text-red-600' : 'text-slate-700';
                    const bgStyle = metaStatus === 'calculated' ? '' : 'bg-red-50 text-red-700';
                    return `<div class="w-full text-right px-2 py-1.5 ${bgStyle} ${textColor} font-medium rounded-sm">${displayVal}</div>`;
                }
            };
        });
    }

    updateCellStyles() {
        const cells = this.excelManager.options.tableBody.querySelectorAll('[data-key^="salary_values."]');
        cells.forEach(cell => {
            const rowData = this.excelManager.state.data[cell.dataset.row];
            const colId = cell.dataset.key.split('.')[1];
            const status = rowData?.salary_meta?.[colId]?.status;
            
            cell.classList.remove('bg-red-50', 'text-red-700');
            if (status && status !== 'calculated') {
                cell.style.backgroundColor = '#FEF2F2';
                cell.classList.add('text-red-700', 'font-semibold');
            } else {
                cell.style.backgroundColor = 'transparent';
            }
        });
    }

    toggleLoading(isLoading) {
        const statusEl = document.getElementById('data-loading-status');
        if (statusEl) statusEl.classList.toggle('hidden', !isLoading);
        if (this.excelManager) isLoading ? this.excelManager.showLoading?.() : this.excelManager.hideLoading?.();
    }

    initEvents() {
        const btnSave = document.getElementById('btn-save-payroll');
        if (btnSave) this.eventManager.add(btnSave, 'click', () => this.savePayroll());
        
        // Sự kiện đóng modal khi click ra ngoài
        const modal = document.getElementById('detail-modal');
        if (modal) {
            this.eventManager.add(modal, 'click', (e) => {
                if (e.target === modal) this.toggleModal(false);
            });
            // Nút X đóng
            const closeBtns = modal.querySelectorAll('[data-modal-close]');
            closeBtns.forEach(btn => this.eventManager.add(btn, 'click', () => this.toggleModal(false)));
        }
    }

    initTableEvents() {
        const tableBody = this.excelManager?.options?.tableBody;
        if (!tableBody) return;

        this.eventManager.add(tableBody, 'click', (e) => {
            const btn = e.target.closest('[data-detail-open="payroll"]');
            if (!btn) return;
            const empId = btn.dataset.employeeId;
            if (!empId) return;
            this.openDetailModal(empId);
        });
    }

    async savePayroll() {
        const { changes, count } = this.excelManager.getChanges();
        if (count === 0) return AppUtils.Notify.info('Không có thay đổi nào');
        try {
            const payload = {
                bangluong_id: String(this.currentPayrollId),
                changes,
                phan_tu_luong: Array.isArray(this.currentPhanTuLuong) ? [...this.currentPhanTuLuong] : []
            };
            const res = await AppUtils.API.post('/hrm/quan-ly-luong/api/phieu-luong/list', payload);
            if (res?.success === false) throw new Error(res.message || 'Lỗi lưu dữ liệu');
            AppUtils.Notify.success(res?.message || `Đã cập nhật ${count} dòng`);
            this.excelManager.setData(this.excelManager.state.data);
        } catch { AppUtils.Notify.error('Lỗi lưu dữ liệu'); }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.PayrollDetailManager = new PayrollDetailManager();
    window.PayrollDetailManager.init();
});