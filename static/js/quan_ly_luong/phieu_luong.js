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
        
        this.baseColumns = this.getBaseColumns();
        
        // Formula Engine
        this.formulaEngine = null; 
        this.idToCodeMap = {}; 
        this.codeToIdMap = {}; 
        this.formulaConfig = {}; 

        // Store full data for export
        this.allEmployeesData = []; 
        this.salaryElementsList = []; 

        this.debouncedRecalc = AppUtils.Helper.debounce((changes) => this.processExcelChanges(changes), 150);

        // DOM Elements
        this.modal = document.getElementById('detail-modal');
        this.modalTemplate = document.getElementById('detail-modal-template');
        this.btnExportMain = document.getElementById('btn-export-excel-main');
        this.loadingStatus = document.getElementById('data-loading-status');
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
            autoLoad: false,
            enableBulkActions: true,
            columns: this.baseColumns,
            onCellChange: (changes) => this.onExcelDataChange(changes),
            onBulkExport: () => this.exportExcel('selected')
        });

        this.initTableEvents();
        this.loadCombinedData(); 
    }

    getBaseColumns() {
        return [
            {
                key: 'employee_info', title: 'Họ và tên', width: 250, sticky: true, 
                render: (item) => `
                    <button type="button" class="w-full text-left flex flex-col justify-center h-full cursor-pointer group" data-detail-open="payroll" data-employee-id="${item.id}" aria-label="Xem chi tiết">
                        <div class="font-medium text-blue-600 group-hover:text-blue-800 group-hover:underline text-sm truncate" title="${item.hovaten}">
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

    // --- 2. DATA HANDLING ---

    async loadCombinedData() {
        this.toggleLoading(true);
        try {
            const [employeeRes, payrollRes] = await Promise.all([
                AppUtils.API.get('/hrm/to-chuc-nhan-su/api/v1/phong-ban/employee/', { 
                    page_size: 1000, 
                    ordering: 'ten_nhanvien' 
                }),
                AppUtils.API.get('/hrm/quan-ly-luong/api/phieu-luong/list', { 
                    bangluong_id: this.currentPayrollId
                })
            ]);

            if (!payrollRes.success) throw new Error(payrollRes.message || 'Lỗi tải dữ liệu lương');
            
            let allEmployees = employeeRes.data || (Array.isArray(employeeRes) ? employeeRes : []);
            
            const { columnIds, valuesMap, extraDataMap } = this.normalizePayrollData(payrollRes.data);
            this.currentPhanTuLuong = columnIds;
            this.salaryElementsList = columnIds;

            const validEmployeeIds = new Set(Object.keys(valuesMap).map(String));
            const filteredEmployees = allEmployees.filter(emp => validEmployeeIds.has(String(emp.id)));

            this.buildFormulaMappings(columnIds, filteredEmployees, valuesMap);
            const dynamicColumns = this.buildDynamicColumns(columnIds);
            this.excelManager.setColumns([...this.baseColumns, ...dynamicColumns]);

            filteredEmployees.forEach(row => {
                const empId = String(row.id);
                const details = valuesMap[empId] || {};
                
                row.extra_data = extraDataMap[empId] || null;
                row.salary_values = {}; 
                row.salary_meta = {};

                columnIds.forEach(colId => {
                    const detail = details[colId];
                    if (detail) {
                        row.salary_values[colId] = detail.value;
                        row.salary_meta[colId] = { 
                            status: detail.status, 
                            type: detail.type, 
                            formula: detail.formula 
                        };
                        const meta = this.elementMap.get(Number(colId));
                        if (meta && !meta.type) meta.type = detail.type;
                    } else {
                        row.salary_values[colId] = 0;
                        row.salary_meta[colId] = { status: 'system' };
                    }
                });
            });

            this.allEmployeesData = filteredEmployees;

            const flatData = this.transformToEngineData(filteredEmployees);
            this.formulaEngine = new FormulaEngine(flatData, this.formulaConfig);

            this.excelManager.setData(filteredEmployees);
            this.updateCellStyles();

        } catch (error) {
            console.error('Load Data Error:', error);
            AppUtils.Notify.error(error.message);
        } finally {
            this.toggleLoading(false);
        }
    }

    normalizePayrollData(data) {
        let columnIds = [];
        let valuesMap = {}; 
        let extraDataMap = {};

        if (Array.isArray(data.phan_tu_luong)) columnIds = data.phan_tu_luong.map(String);

        if (Array.isArray(data.phieu_luong)) {
            data.phieu_luong.forEach(item => {
                const empId = String(item.nhanvien_id);
                valuesMap[empId] = item.ct_phieu_luong || {};
                extraDataMap[empId] = item;
            });
        } else if (typeof data.phieu_luong === 'object') {
            Object.keys(data.phieu_luong).forEach(empId => {
                valuesMap[empId] = data.phieu_luong[empId];
                extraDataMap[empId] = { nhanvien_id: empId, is_draft: true };
            });
        }
        return { columnIds, valuesMap, extraDataMap };
    }

    // --- 3. EXPORT EXCEL LOGIC (FIXED) ---

    initEvents() {
        const btnSave = document.getElementById('btn-save-payroll');
        if (btnSave) this.eventManager.add(btnSave, 'click', () => this.savePayroll());
        
        const modal = document.getElementById('detail-modal');
        if (modal) {
            this.eventManager.add(modal, 'click', (e) => {
                if (e.target === modal) this.toggleModal(false);
            });
            const closeBtns = modal.querySelectorAll('[data-modal-close]');
            closeBtns.forEach(btn => this.eventManager.add(btn, 'click', () => this.toggleModal(false)));
        }

        // --- EXPORT EVENTS ---
        
        // 1. Export Main (All Data)
        if (this.btnExportMain) {
            this.eventManager.add(this.btnExportMain, 'click', () => this.exportExcel('all'));
        }

        // 2. Bulk Export (Selected) sẽ dùng onBulkExport của ExcelTableManager
    }

    /**
     * Xuất Excel Đa năng
     * @param {string} scope - 'all' | 'selected' | 'single'
     * @param {string|number} singleId - ID nhân viên nếu scope là 'single'
     */
    exportExcel(scope, singleId = null) {
        if (typeof XLSX === 'undefined') {
            return AppUtils.Notify.error('Thư viện Excel chưa được tải. Vui lòng tải lại trang.');
        }

        if (scope === 'all') {
            // Case 1: Xuất 1 file tổng hợp cho tất cả (như cũ)
            const employees = this.allEmployeesData;
            if (employees.length === 0) return AppUtils.Notify.warning('Không có dữ liệu.');
            this.createAndDownloadWorkbook(employees, 'Bang_Luong_Tong_Hop');
            AppUtils.Notify.success(`Đã xuất tổng hợp ${employees.length} nhân viên.`);

        } else if (scope === 'selected') {
            // Case 2: Xuất N file riêng biệt cho N người được chọn
            const selectedIds = this.excelManager.state.selectedItems;
            if (selectedIds.size === 0) return AppUtils.Notify.warning('Vui lòng chọn nhân viên để xuất.');
            
            const employeesToExport = this.allEmployeesData.filter(e => selectedIds.has(String(e.id)));
            
            if (employeesToExport.length === 0) return AppUtils.Notify.warning('Không tìm thấy dữ liệu nhân viên đã chọn.');

            // Lặp và xuất từng file
            let count = 0;
            employeesToExport.forEach(emp => {
                // Tận dụng logic tạo file đơn
                this.createAndDownloadWorkbook([emp], `Phieu_Luong_${emp.manhanvien}_${emp.hovaten}`);
                count++;
            });
            AppUtils.Notify.success(`Đang tải xuống ${count} phiếu lương...`);

        } else if (scope === 'single' && singleId) {
            // Case 3: Xuất 1 file cho 1 người (từ modal)
            const emp = this.allEmployeesData.find(e => String(e.id) === String(singleId));
            if (!emp) return AppUtils.Notify.error('Không tìm thấy dữ liệu nhân viên.');
            
            this.createAndDownloadWorkbook([emp], `Phieu_Luong_${emp.manhanvien}_${emp.hovaten}`);
            AppUtils.Notify.success('Đã xuất phiếu lương.');
        }
    }

    /**
     * Hàm helper tạo và tải file Excel từ danh sách nhân viên
     * Nếu danh sách có 1 người -> File chi tiết cá nhân
     * Nếu danh sách nhiều người -> File tổng hợp (Logic hiển thị giống nhau, chỉ khác tên file)
     */
    createAndDownloadWorkbook(employees, fileNamePrefix) {
        // 1. Chuẩn bị dữ liệu Sheet Lương (Sheet 1)
        const salarySheetData = [];
        
        // Header
        const headerRow = ['Mã NV', 'Họ tên', 'Phòng ban', 'Chức vụ'];
        this.salaryElementsList.forEach(colId => {
            const meta = this.elementMap.get(Number(colId));
            headerRow.push(meta ? meta.name : `Col ${colId}`);
        });
        salarySheetData.push(headerRow);

        // Rows
        employees.forEach(emp => {
            const row = [
                emp.manhanvien || '',
                emp.hovaten || '',
                emp.cong_tac?.phong_ban || '',
                emp.cong_tac?.chuc_vu || ''
            ];
            
            this.salaryElementsList.forEach(colId => {
                const val = emp.salary_values?.[colId] || 0;
                row.push(Number(val));
            });
            salarySheetData.push(row);
        });

        // 2. Chuẩn bị dữ liệu Sheet Chấm công (Sheet 2)
        const timesheetSheetData = [];
        timesheetSheetData.push(['Mã NV', 'Họ tên', 'Ngày', 'Loại công', 'Vào', 'Ra', 'Giờ công (phút)', 'Công việc']);

        employees.forEach(emp => {
            const timesheets = emp.extra_data?.ngaychamcong || [];
            if (timesheets.length > 0) {
                timesheets.forEach(ts => {
                    timesheetSheetData.push([
                        emp.manhanvien,
                        emp.hovaten,
                        AppUtils.DateUtils.format(ts.ngaylamviec, 'dd/MM/yyyy'),
                        ts.loaichamcong || '',
                        ts.thoigianchamcongvao ? ts.thoigianchamcongvao.slice(0, 5) : '',
                        ts.thoigianchamcongra ? ts.thoigianchamcongra.slice(0, 5) : '',
                        ts.thoigianlamviec || 0,
                        ts.tencongviec || ''
                    ]);
                });
            } else {
                timesheetSheetData.push([emp.manhanvien, emp.hovaten, 'Không có dữ liệu', '', '', '', '', '']);
            }
        });

        // 3. Tạo Workbook
        const wb = XLSX.utils.book_new();

        // Add Sheet 1: Tổng hợp Lương
        const wsSalary = XLSX.utils.aoa_to_sheet(salarySheetData);
        // Auto width đơn giản
        const wscolsSalary = headerRow.map(() => ({ wch: 15 })); 
        wscolsSalary[1] = { wch: 25 }; 
        wsSalary['!cols'] = wscolsSalary;
        XLSX.utils.book_append_sheet(wb, wsSalary, "Chi tiết Lương");

        // Add Sheet 2: Chi tiết Chấm công
        const wsTimesheet = XLSX.utils.aoa_to_sheet(timesheetSheetData);
        const wscolsTime = [{wch:10}, {wch:25}, {wch:12}, {wch:10}, {wch:10}, {wch:10}, {wch:15}, {wch:20}];
        wsTimesheet['!cols'] = wscolsTime;
        XLSX.utils.book_append_sheet(wb, wsTimesheet, "Chi tiết Chấm công");

        // 4. Write File
        const cleanFileName = AppUtils.Helper.removeAccents(fileNamePrefix).replace(/\s+/g, '_');
        const finalName = `${cleanFileName}_${new Date().toISOString().slice(0,10)}.xlsx`;
        XLSX.writeFile(wb, finalName);
    }

    // --- OTHER METHODS ---

    toggleLoading(isLoading) {
        if (this.loadingStatus) this.loadingStatus.classList.toggle('hidden', !isLoading);
        if (this.btnExportMain) {
            const hasData = this.allEmployeesData && this.allEmployeesData.length > 0;
            this.btnExportMain.classList.toggle('hidden', isLoading || !hasData);
        }
        if (this.excelManager) isLoading ? this.excelManager.showLoading?.() : this.excelManager.hideLoading?.();
    }

    openDetailModal(employeeId) {
        const row = this.excelManager.state.data.find(r => String(r.id) === String(employeeId));
        if (!row) return;

        const modalForm = document.querySelector('#detail-modal form');
        if (modalForm && this.modalTemplate) {
            modalForm.innerHTML = ''; 
            modalForm.appendChild(this.modalTemplate.content.cloneNode(true));
        }

        const btnSave = document.querySelector('#detail-modal [data-modal-submit]');
        const btnCancel = document.querySelector('#detail-modal [data-modal-close]:not([title="Đóng"])');
        
        if (btnCancel && btnCancel.tagName === 'BUTTON') btnCancel.classList.add('hidden');

        if (btnSave) {
            btnSave.innerHTML = '<i class="fas fa-file-excel mr-2"></i>Xuất Excel';
            btnSave.className = 'px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded shadow-sm font-medium transition-colors flex items-center';
            btnSave.onclick = (e) => { 
                e.preventDefault(); 
                this.exportExcel('single', employeeId);
            };
        }

        const extraData = row.extra_data || {};
        const titleEl = document.querySelector('#detail-modal [data-modal-title]');
        if (titleEl) titleEl.textContent = `Chi tiết lương: ${row.hovaten} (${row.manhanvien})`;

        this.renderTimesheetTable(extraData.ngaychamcong);
        this.renderSalaryDetailList(row);
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
        } else {
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

        timesheets.forEach(ts => {
            const date = new Date(ts.ngaylamviec).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
            const inTime = ts.thoigianchamcongvao ? ts.thoigianchamcongvao.slice(0, 5) : '--:--';
            const outTime = ts.thoigianchamcongra ? ts.thoigianchamcongra.slice(0, 5) : '--:--';
            const hours = (ts.thoigianlamviec / 60).toFixed(1);
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
        
        const groups = { 'THU_NHAP': [], 'KHAU_TRU': [], 'OTHER': [] };

        Object.keys(salaryValues).forEach(colId => {
            const val = salaryValues[colId];
            const meta = this.elementMap.get(Number(colId));
            if (!meta) return;

            const type = meta.type || 'OTHER';
            const item = {
                name: meta.name, code: meta.code, value: val, meta: salaryMeta[colId] || {}
            };

            if (groups[type]) groups[type].push(item);
            else groups['OTHER'].push(item);
        });

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

    // --- UTILS ---
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
                elementId: id,
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
            }
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