/**
 * Quản lý trang Chi tiết Phiếu Lương
 * Logic tương đồng với SalaryInfoManager (tab Thông tin lương)
 */
class PayrollDetailManager {
    constructor() {
        this.excelManager = null;
        this.elementMap = new Map(); 
        this.currentPayrollId = document.getElementById('salary-table-select')?.value || 1;
        this.eventManager = AppUtils.EventManager.create();
        
        // Cờ kiểm soát để tránh loop vô tận khi setData
        this.isMerging = false; 
        
        // Cache columns
        this.baseColumns = this.getBaseColumns();
    }

    init() {
        // 1. Tải metadata (ID -> Tên phần tử) trước
        this.fetchElementMetadata().then(() => {
            // 2. Sau khi có metadata mới init table
            this.initExcelTable();
        });

        this.initEvents();
        console.log('✅ PayrollDetailManager initialized');
    }

    // --- HELPER FIX LỖI LOADING ---
    toggleLoading(isLoading) {
        const statusEl = document.getElementById('data-loading-status');
        
        // 1. Xử lý UI text
        if (statusEl) {
            if (isLoading) statusEl.classList.remove('hidden');
            else statusEl.classList.add('hidden');
        }

        // 2. Xử lý ExcelManager Loading (Safe Check)
        if (this.excelManager) {
            if (isLoading) {
                if (typeof this.excelManager.showLoading === 'function') {
                    this.excelManager.showLoading();
                }
            } else {
                // FIX LỖI: Kiểm tra hàm tồn tại trước khi gọi
                if (typeof this.excelManager.hideLoading === 'function') {
                    this.excelManager.hideLoading();
                } else if (typeof this.excelManager.toggleLoading === 'function') {
                    this.excelManager.toggleLoading(false);
                }
                // Nếu không có hàm nào, setData thường tự động tắt loading
            }
        }
    }

    // --- 1. SETUP & METADATA ---

    async fetchElementMetadata() {
        try {
            const res = await AppUtils.API.get('/hrm/quan-ly-luong/api/phan-tu-luong/list', { page_size: 9999 });
            const elements = res.data || res || [];
            
            elements.forEach(el => {
                this.elementMap.set(Number(el.id), {
                    code: el.maphantu,
                    name: el.tenphantu,
                    type: el.loaiphantu 
                });
            });
        } catch (error) {
            console.error('Lỗi tải metadata:', error);
            AppUtils.Notify.error('Không thể tải danh sách phần tử lương');
        }
    }

    initExcelTable() {
        this.excelManager = new ExcelTableManager({
            tableHeader: document.getElementById('payroll-table-header'),
            tableBody: document.getElementById('payroll-table-body'),
            bulkActionsContainer: document.getElementById('payroll-table-bulk-actions'),
            
            // Source 1: Nhân viên
            apiEndpoint: '/hrm/to-chuc-nhan-su/api/v1/phong-ban/employee/',
            apiParams: { page_size: 1000, ordering: 'ten_nhanvien' },
            
            autoLoad: true,
            enableBulkActions: true,
            columns: this.baseColumns,

            // Hook: Chạy sau khi data nhân viên về
            onDataLoaded: () => this.handleDataLoaded()
        });
    }

    getBaseColumns() {
        return [
            {
                key: 'employee_info',
                title: 'Thông tin nhân viên',
                width: 250,
                sticky: true, // Cột cố định
                render: (item) => `
                    <div class="flex flex-col justify-center h-full">
                        <div class="font-medium text-slate-800 text-sm truncate" title="${item.hovaten}">
                            ${item.hovaten || 'Chưa có tên'}
                        </div>
                        <div class="text-xs text-slate-500 font-mono mt-0.5">
                            ${item.manhanvien || 'N/A'}
                        </div>
                    </div>`
            },
            {
                key: 'cong_tac.phong_ban',
                title: 'Phòng ban',
                width: 150,
                sticky: true, // Cột cố định
                render: (item) => `<span class="text-slate-600 text-sm">${item.cong_tac?.phong_ban || '-'}</span>`
            }
        ];
    }

    // --- 2. DATA MERGING ---

    async handleDataLoaded() {
        // Quan trọng: Ngăn chặn loop vì setData sẽ trigger lại onDataLoaded (tùy implement của ExcelManager)
        if (this.isMerging) return;
        
        this.isMerging = true; // Bắt đầu merge
        this.toggleLoading(true);

        try {
            // Lấy danh sách nhân viên hiện tại trong bảng
            const rows = this.excelManager.state.data; // Hoặc .originalData tùy version
            
            if (!rows || rows.length === 0) {
                this.isMerging = false;
                this.toggleLoading(false);
                return;
            }

            // Gọi API Lương (Source 2)
            const payrollRes = await AppUtils.API.get('/hrm/quan-ly-luong/api/phieu-luong/list', { 
                // bangluong_id: this.currentPayrollId 
                bangluong_id:8
            });

            if (!payrollRes.success || !payrollRes.data) {
                throw new Error(payrollRes.message || 'Lỗi tải dữ liệu lương');
            }

            const { phan_tu_luong: columnIds, phieu_luong: valuesMap } = payrollRes.data;

            // 1. Tạo cột động
            const dynamicColumns = this.buildDynamicColumns(columnIds);
            this.excelManager.setColumns([...this.baseColumns, ...dynamicColumns]);

            // 2. Map giá trị vào rows
            rows.forEach(row => {
                const empId = String(row.id);
                const empPayroll = valuesMap[empId] || {}; // Fallback empty obj

                row.salary_values = {}; // Reset container
                row.salary_meta = {};   // Metadata container

                // Duyệt qua config cột để lấy value tương ứng
                if (columnIds && Array.isArray(columnIds)) {
                     columnIds.forEach(colId => {
                        const detail = empPayroll[colId];
                        if (detail) {
                            row.salary_values[colId] = detail.value;
                            row.salary_meta[colId] = {
                                status: detail.status,
                                type: detail.type,
                                formula: detail.formula
                            };
                        } else {
                            row.salary_values[colId] = 0;
                            row.salary_meta[colId] = { status: 'system' };
                        }
                     });
                }
            });

            // 3. Update lại bảng (sẽ redraw UI)
            this.excelManager.setData(rows);
            
            // 4. Cập nhật giao diện (highlight status)
            this.updateCellStyles();

        } catch (error) {
            console.error('Merge Error:', error);
            AppUtils.Notify.error('Lỗi đồng bộ dữ liệu: ' + error.message);
        } finally {
            this.toggleLoading(false);
            // Quan trọng: Reset cờ sau một khoảng delay nhỏ để đảm bảo render xong
            setTimeout(() => { this.isMerging = false; }, 300);
        }
    }

    buildDynamicColumns(columnIds) {
        if (!Array.isArray(columnIds)) return [];

        return columnIds.map(id => {
            const meta = this.elementMap.get(Number(id));
            const colTitle = meta ? meta.name : `Phần tử ${id}`;
            const isDeduction = meta?.type === 'KHAU_TRU';

            return {
                key: `salary_values.${id}`,
                title: colTitle,
                width: 120,
                align: 'right',
                type: 'input', // Input để người dùng thấy có thể sửa (nếu cần logic edit)
                render: (item) => {
                    const val = item.salary_values?.[id] || 0;
                    const displayVal = new Intl.NumberFormat('vi-VN').format(Number(val));
                    const colorClass = isDeduction ? 'text-red-600' : 'text-slate-700';
                    
                    // Giả lập style giống input nhưng là text (read-only view)
                    // Hoặc return input thật nếu muốn edit trực tiếp
                    return `<div class="w-full text-right px-2 py-1 ${colorClass} font-medium">${displayVal}</div>`;
                }
            };
        });
    }

    updateCellStyles() {
        if (!this.excelManager || !this.excelManager.options.tableBody) return;

        // Lấy tất cả input có key bắt đầu bằng salary_values.
        const inputs = this.excelManager.options.tableBody.querySelectorAll('input[data-key^="salary_values."]');
        
        inputs.forEach(input => {
            const rowIndex = input.dataset.row;
            const key = input.dataset.key; // vd: salary_values.123
            const colId = key.split('.')[1];
            
            const rowData = this.excelManager.state.data[rowIndex];
            if (!rowData || !rowData.salary_meta || !rowData.salary_meta[colId]) return;
            
            const { status } = rowData.salary_meta[colId];
            
            // Highlight nếu status không phải 'calculated'
            if (status && status !== 'calculated') {
                input.classList.remove('bg-transparent');
                // Màu vàng nhạt, chữ đậm hơn để gây chú ý
                input.classList.add('bg-orange-50', 'text-orange-900', 'font-medium', 'ring-1', 'ring-orange-200');
                input.title = `Chế độ nhập: ${status}`; 
            }
        });
    }

    // --- 3. EVENTS ---

    initEvents() {
        const select = document.getElementById('salary-table-select');
        if (select) {
            this.eventManager.add(select, 'change', (e) => {
                this.currentPayrollId = e.target.value;
                // Khi đổi bảng lương, fetch lại nhân viên để trigger lại flow merge
                this.excelManager.fetchData(); 
            });
        }

        const btnSave = document.getElementById('btn-save-payroll');
        if (btnSave) {
            this.eventManager.add(btnSave, 'click', () => this.savePayroll());
        }
    }

    async savePayroll() {
        try {
            // Lấy changes từ ExcelManager
            const { changes, count } = this.excelManager.getChanges();
            
            if (count === 0) {
                AppUtils.Notify.info('Không có thay đổi nào');
                return;
            }

            // Gọi API Save (Giả lập)
            console.log('Saving...', { bangluong_id: this.currentPayrollId, changes });
            
            // Giả lập thành công
            await new Promise(r => setTimeout(r, 500));
            
            AppUtils.Notify.success(`Đã cập nhật ${count} dòng phiếu lương`);
            
            // Reset trạng thái gốc sau khi lưu
            this.excelManager.setData(this.excelManager.state.data);

        } catch (error) {
            AppUtils.Notify.error('Lỗi lưu dữ liệu');
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.PayrollDetailManager = new PayrollDetailManager();
    window.PayrollDetailManager.init();
});