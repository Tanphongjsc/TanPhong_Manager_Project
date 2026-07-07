/**
 * Quản lý trang Phần tử lương (Tab Navigation & Orchestration)
 */
class SalaryPageManager {
    constructor() {
        this.els = {
            tabNav: document.querySelector('#salary-tab-container nav'),
            panes: document.querySelectorAll('.tab-pane')
        };
        this.classes = {
            active: ['border-blue-600', 'text-blue-600'],
            inactive: ['border-transparent', 'text-slate-500', 'hover:text-slate-700', 'hover:border-slate-300']
        };
        this.loadedTabs = new Map([['#tab-elements', false], ['#tab-info', false]]);
        this.eventManager = AppUtils.EventManager.create();
    }

    init() {
        this.initSubManagers();
        this.initTabs();
        console.log('✅ SalaryPageManager initialized');
    }

    initSubManagers() {
        window.NhomPhanTuManager = new NhomPhanTuManager();
        window.NhomPhanTuManager.init();
        
        window.PhanTuLuongManager = new PhanTuLuongManager();
        window.PhanTuLuongManager.init();
        
        window.SalaryInfoManager = new SalaryInfoManager();
        window.SalaryInfoManager.init();

        this.loadedTabs.set('#tab-elements', true);
    }

    initTabs() {
        if (!this.els.tabNav) return;
        const links = this.els.tabNav.querySelectorAll('a');
        
        this.eventManager.addMultiple(links, 'click', (e) => {
            e.preventDefault();
            this.activateTab(e.currentTarget);
        });

        this.activateHashIfAny(links);
    }

    activateHashIfAny(links) {
        const hash = window.location.hash;
        let targetLink = Array.from(links).find(a => a.getAttribute('href') === hash) || links[0];
        if (targetLink) this.activateTab(targetLink);
    }

    activateTab(tabEl) {
        const targetId = tabEl.getAttribute('href');
        if (!targetId) return;

        this.els.tabNav.querySelectorAll('a').forEach(link => {
            link.classList.remove(...this.classes.active);
            link.classList.add(...this.classes.inactive);
        });

        tabEl.classList.remove(...this.classes.inactive);
        tabEl.classList.add(...this.classes.active);

        this.els.panes.forEach(p => p.classList.add('hidden'));
        const pane = document.querySelector(targetId);
        
        if (pane) {
            pane.classList.remove('hidden');
            const alreadyLoaded = this.loadedTabs.get(targetId);
            
            if (!alreadyLoaded && targetId === '#tab-info') {
                window.SalaryInfoManager.loadInitialData();
            }
            this.loadedTabs.set(targetId, true);
        }
        history.replaceState(null, '', targetId);
    }
    
    destroy() {
        this.eventManager.removeAll();
    }
}

/**
 * Manager Tab Thông Tin Lương
 */
class SalaryInfoManager {
    constructor() {
        this.excelManager = null;
        this.elementsMap = new Map();
        this.selectedElementIds = [];
        this.salarySetupMap = {};
        this.hasLoadedEmployees = false;
        
        this.columnSelector = null;
        this.eventManager = AppUtils.EventManager.create();
    }

    getBaseColumns() {
        return [
            {
                key: 'employee_info',
                title: 'Thông tin nhân viên',
                width: 250,
                sticky: true,
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
                sticky: true,
                render: (item) => `<span class="text-slate-600 text-sm">${item.cong_tac?.phong_ban || '-'}</span>`
            }
        ];
    }

    init() {
        this.initExcelTable();
        this.initColumnSelector();
        this.initFormSubmission();
    }

    initExcelTable() {
        this.excelManager = new ExcelTableManager({
            tableHeader: document.getElementById('salary-setup-table-header'),
            tableBody: document.getElementById('salary-setup-table-body'),
            bulkActionsContainer: document.getElementById('salary-setup-bulk-actions'),
            
            apiEndpoint: '/hrm/to-chuc-nhan-su/api/v1/phong-ban/employee/',
            apiParams: { page_size: 1000, ordering: 'ten_nhanvien' },
            autoLoad: false, // Tắt load tự động để load tay có kiểm soát
            enableBulkActions: true,
            columns: this.getBaseColumns(),
            
            // Xử lý dữ liệu sau khi API trả về (trước khi render)
            onDataLoaded: () => this.mergeSalarySetupToRows()
        });
    }

    initColumnSelector() {
        this.columnSelector = new SalaryColumnSelector({
            modalId: 'salary-columns-modal',
            onApply: (selectedItems) => this.handleColumnsApply(selectedItems)
        });
    }

    // Mở modal chọn cột — delegate sang component
    openModal() {
        this.columnSelector?.open(this.selectedElementIds);
    }

    // Đóng modal chọn cột — delegate sang component
    closeModal() {
        this.columnSelector?.close();
    }

    async loadInitialData() {
        this.toggleLoading(true);
        try {
            const setupRes = await AppUtils.API.get('/hrm/quan-ly-luong/api/phan-tu-luong/thiet-lap-gia-tri');
            const setupData = setupRes.data || setupRes || {};
            
            this.selectedElementIds = Array.isArray(setupData.phan_tu_luong)
                ? setupData.phan_tu_luong.map(Number)
                : [];
            this.salarySetupMap = setupData.set_up_phan_tu_luong || {};

            // Load data cho component và lấy kết quả preselected
            await this.columnSelector.loadData();
            this.columnSelector.setPreselectedIds(this.selectedElementIds);
            
            // Xây dựng elementsMap từ component
            this._buildElementsMap();

            // Áp dụng cột đã chọn sẵn (silent)
            await this._applyColumnsFromSelector({ silent: true });
            await this.fetchEmployeesIfNeeded();
            
        } catch (err) {
            console.error(err);
            AppUtils.Notify.error('Lỗi tải cấu hình lương');
        } finally {
            this.toggleLoading(false);
        }
    }

    toggleLoading(isLoading) {
        if(isLoading) this.excelManager?.showLoading();
    }

    async fetchEmployeesIfNeeded() {
        if (this.hasLoadedEmployees) return;
        try {
            await this.excelManager.fetchData();
            this.hasLoadedEmployees = true;
        } catch (error) {
            console.error('Lỗi tải danh sách nhân viên:', error);
            AppUtils.Notify.error('Không thể tải danh sách nhân viên');
        }
    }

    // --- COLUMN APPLY LOGIC ---

    /**
     * Callback từ SalaryColumnSelector component khi user nhấn xác nhận.
     * @param {Array<{id, code, name}>} selectedItems
     */
    async handleColumnsApply(selectedItems) {
        try {
            this.selectedElementIds = selectedItems.map(item => item.id);
            
            const baseColumns = this.getBaseColumns();
            const dynamicColumns = selectedItems.map(item => ({
                key: `salary_values.${item.code}`,
                title: item.name,
                subtitle: item.code,
                width: 120,
                type: 'input',
                sticky: false,
                elementId: item.id
            }));

            this.excelManager.setColumns([...baseColumns, ...dynamicColumns]);

            if (!this.hasLoadedEmployees) {
                await this.fetchEmployeesIfNeeded();
            } else {
                this.excelManager.render();
            }

            AppUtils.Notify.success('Đã cập nhật hiển thị');
        } catch (error) {
            console.error('Lỗi áp dụng cột:', error);
            AppUtils.Notify.error('Lỗi cập nhật bảng lương');
        }
    }

    /**
     * Áp dụng cột từ trạng thái hiện tại của component (dùng cho preselect lúc init)
     */
    async _applyColumnsFromSelector(options = {}) {
        const { silent = false } = options;
        const selectedItems = this.columnSelector.getSelectedItems();
        
        this.selectedElementIds = selectedItems.map(item => item.id);
        
        const baseColumns = this.getBaseColumns();
        const dynamicColumns = selectedItems.map(item => ({
            key: `salary_values.${item.code}`,
            title: item.name,
            subtitle: item.code,
            width: 120,
            type: 'input',
            sticky: false,
            elementId: item.id
        }));

        this.excelManager.setColumns([...baseColumns, ...dynamicColumns]);

        if (!this.hasLoadedEmployees) {
            await this.fetchEmployeesIfNeeded();
        } else {
            this.excelManager.render();
        }

        if (!silent) {
            AppUtils.Notify.success('Đã cập nhật hiển thị');
        }
    }

    /**
     * Xây dựng elementsMap từ dữ liệu đã load trong component
     */
    _buildElementsMap() {
        this.elementsMap.clear();
        const groups = this.columnSelector?.groupsData || [];
        const groupsList = Array.isArray(groups) ? groups : Object.values(groups);
        groupsList.forEach(group => {
            (group.elements || []).forEach(el => {
                this.elementsMap.set(el.id, el);
            });
        });
    }

    // --- DATA PROCESSING ---
    
    // Gộp dữ liệu từ API Cấu hình Lương vào danh sách Nhân viên
    mergeSalarySetupToRows() {
        const data = this.excelManager?.state?.data;
        if (!Array.isArray(data)) return;

        data.forEach(item => {
            const empId = String(item.id || item.nhanvien_id || item.pk);
            const setupByElement = this.salarySetupMap[empId];
            
            // Map từ ElementID -> Code
            const setupByCode = setupByElement ? 
                Object.entries(setupByElement).reduce((acc, [elId, val]) => {
                    const code = this.elementsMap.get(Number(elId))?.maphantu;
                    return code ? { ...acc, [code]: val } : acc;
                }, {}) : {};

            // Merge vào salary_values hiện tại của item
            item.salary_values = { ...item.salary_values, ...setupByCode };
        });

        // QUAN TRỌNG: Đẩy lại data đã merge vào ExcelManager để nó tạo Snapshot gốc (Baseline)
        this.excelManager.setData(data);
    }

    // --- FORM SUBMISSION ---
    initFormSubmission() {
        const submitBtn = document.getElementById('btn-save-salary-info');
        const form = document.getElementById('salary-info-form');
        const cancelLink = document.querySelector('#tab-info a[href="#tab-elements"]');

        if (submitBtn) {
            this.eventManager.add(submitBtn, 'click', (e) => {
                e.preventDefault();
                this.submitForm();
            });
        }
        
        if (cancelLink) {
            this.eventManager.add(cancelLink, 'click', (e) => {
                e.preventDefault();
                this.resetChanges();

                const tabLink = document.querySelector('#salary-tab-container nav a[href="#tab-elements"]');
                if (tabLink && window.SalaryPageManager?.activateTab) {
                    window.SalaryPageManager.activateTab(tabLink);
                }
            });
        }

        if (form) {
            this.eventManager.add(form, 'keydown', (e) => {
                if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') e.preventDefault();
            });
        }
    }

    resetChanges() {
        if (this.excelManager?.resetToOriginal) {
            this.excelManager.resetToOriginal();
            AppUtils.Notify.info('Đã khôi phục dữ liệu về trạng thái ban đầu');
        }
    }

    async submitForm() {
        try {
            // Lấy changes trực tiếp từ ExcelManager (Hiệu quả & Chính xác)
            const { changes, count } = this.excelManager.getChanges();

            if (count === 0) {
                AppUtils.Notify.info('Không có thay đổi nào để lưu');
                return;
            }

            this.toggleLoading(true);

            // Gửi dữ liệu changes về API
            const response = await AppUtils.API.post(
                '/hrm/quan-ly-luong/api/phan-tu-luong/thiet-lap-gia-tri',
                { employees: changes }
            );

            if (response.success || response.status === 'success') {
                AppUtils.Notify.success(`Đã lưu thay đổi cho ${count} nhân viên`);
                
                // Sau khi lưu thành công, cập nhật lại Baseline cho ExcelManager
                // để những thay đổi vừa rồi trở thành "dữ liệu gốc" mới
                this.excelManager.setData(this.excelManager.state.data);
            } else {
                throw new Error(response.message || 'Lỗi không xác định');
            }

        } catch (err) {
            console.error('Submit error:', err);
            AppUtils.Notify.error(err.message || 'Lỗi khi lưu dữ liệu');
        } finally {
            this.toggleLoading(false);
        }
    }

    destroy() {
        this.eventManager.removeAll();
        this.columnSelector?.destroy();
        this.excelManager?.destroy();
    }
}

// Giữ nguyên NhomPhanTuManager & PhanTuLuongManager
// ... (Phần code này không thay đổi so với các phiên bản trước) ...
// Để code chạy được, hãy copy/paste lại class NhomPhanTuManager và PhanTuLuongManager từ response trước vào đây nếu cần thiết.

/**
 * Manager Nhóm Phần Tử
 */
class NhomPhanTuManager extends BaseCRUDManager {
    constructor() {
        super({
            tbodySelector: '#group-table-body',
            uiMode: 'modal',
            modalId: 'group-form-modal',
            formId: 'group-form',
            codeField: 'manhom',
            autoCode: { sourceField: 'tennhom', targetField: 'manhom' },
            apiUrls: {
                create: '/hrm/quan-ly-luong/api/nhom-phan-tu-luong/list',
                detail: (id) => `/hrm/quan-ly-luong/api/nhom-phan-tu-luong/detail/${id}`,
                update: (id) => `/hrm/quan-ly-luong/api/nhom-phan-tu-luong/detail/${id}`,
                delete: (id) => `/hrm/quan-ly-luong/api/nhom-phan-tu-luong/detail/${id}`,
                list: '/hrm/quan-ly-luong/api/nhom-phan-tu-luong/list' 
            },
            entityName: 'nhóm phần tử',
            onRefreshTable: () => {
                this.tableManager.refresh();
                window.PhanTuLuongManager.loadGroupData();
            }
        });
        this.groupListSidebar = AppUtils.Sidebar.init('group-list-sidebar', 'group-sidebar-overlay');
    }

    init() {
        super.init();
        this.initTable();
    }

    openGroupListSidebar() {
        this.groupListSidebar?.open();
        this.tableManager?.refresh();
    }

    closeGroupListSidebar() {
        this.groupListSidebar?.close();
    }

    initTable() {
        this.tableManager = new TableManager({
            tableBody: document.getElementById('group-table-body'),
            paginationContainer: document.getElementById('group-pagination'),
            searchInput: document.getElementById('group-search-input'),
            apiEndpoint: this.config.apiUrls.list,
            autoLoad: false, // Dữ liệu chỉ nên load khi mở Sidebar
            pageSize: 10,
            onRenderRow: (item) => {
                const tr = document.createElement('tr');
                tr.className = 'hover:bg-slate-50 transition-colors border-b border-slate-100';
                tr.innerHTML = `
                    <td class="px-4 py-3 font-medium text-slate-700">
                        <a href="javascript:void(0)" class="text-blue-600 hover:text-blue-800 view-link" data-id="${item.id}">
                            ${item.tennhom}
                        </a>
                    </td>
                    <td class="px-4 py-3 font-mono text-xs text-slate-500 bg-slate-50 w-fit rounded">${item.manhom}</td>
                    <td class="px-4 py-3 text-right">
                        <div class="flex items-center justify-end gap-1.5 whitespace-nowrap">
                            <button type="button" class="text-blue-600 w-7 h-7 hover:bg-blue-50 rounded edit-btn" data-id="${item.id}"><i class="fas fa-pencil"></i></button>
                            <button type="button" class="text-red-600 w-7 h-7 hover:bg-red-50 rounded delete-btn" data-id="${item.id}" data-name="${item.tennhom}"><i class="fas fa-trash"></i></button>
                        </div>
                    </td>
                `;
                return tr;
            }
        });
    }
}

/**
 * Manager Phần Tử Lương
 */
class PhanTuLuongManager extends BaseCRUDManager {
    constructor() {
        super({
            tbodySelector: '#table-body',
            sidebarId: 'phantu-sidebar',
            overlayId: 'phantu-sidebar-overlay',
            formId: 'phantu-form',
            codeField: 'maphantu',
            autoCode: { sourceField: 'tenphantu', targetField: 'maphantu' },
            apiUrls: {
                detail: (id) => `/hrm/quan-ly-luong/api/phan-tu-luong/detail/${id}`, 
                update: (id) => `/hrm/quan-ly-luong/api/phan-tu-luong/detail/${id}`,
                delete: (id) => `/hrm/quan-ly-luong/api/phan-tu-luong/detail/${id}`,
                create: '/hrm/quan-ly-luong/api/phan-tu-luong/list',
                toggleStatus: (id) => `/hrm/quan-ly-luong/api/phan-tu-luong/${id}/toggle-status/`,
            },
            httpMethods: { toggleStatus: 'POST' },
            entityName: 'phần tử lương',
            onRefreshTable: () => this.tableManager && this.tableManager.refresh(),
            fillFormData: (data) => {
                const form = document.getElementById('phantu-form');
                if (!form) return;
                AppUtils.Form.setData(form, data);
                const nhomSelect = form.querySelector('[name="nhomphantu"]');
                if(nhomSelect && data.nhomphantu) nhomSelect.value = data.nhomphantu;
            }
        });
    }

    init() {
        super.init();
        this.initTable();
        this.loadGroupData();
    }

    async loadGroupData() {
        try {
            const res = await AppUtils.API.get('/hrm/quan-ly-luong/api/nhom-phan-tu-luong/list');
            const groups = res.data || res;
            if (Array.isArray(groups)) {
                const optionsHtml = groups.map(g => `<option value="${g.id}">${g.tennhom}</option>`).join('');
                const filterSelect = document.getElementById('filter-group-select');
                if (filterSelect) filterSelect.innerHTML = '<option value="">Tất cả nhóm</option>' + optionsHtml;
                const formSelect = document.getElementById('nhomphantu');
                if (formSelect) formSelect.innerHTML = '<option value="">-- Chọn nhóm --</option>' + optionsHtml;
            }
        } catch (error) { 
            console.error('Lỗi tải nhóm:', error); 
        }
    }

    initTable() {
        this.tableManager = new TableManager({
            tableBody: document.getElementById('table-body'),
            paginationContainer: document.querySelector('.pagination-container'),
            searchInput: document.getElementById('search-input'),
            filtersForm: document.getElementById('filter-form'),
            selectAllCheckbox: document.getElementById('select-all-checkbox'),
            bulkActionsContainer: document.getElementById('bulk-actions'),
            enableBulkActions: true,
            onBulkDelete: (ids) => this.deleteMultipleItems(ids),
            apiEndpoint: "/hrm/quan-ly-luong/api/phan-tu-luong/list",
            onRenderRow: (item) => this.renderRow(item)
        });
    }

    renderRow(item) {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50 transition-colors border-b border-slate-200';
        const isChecked = item.trangthai === 'active';
        
        tr.innerHTML = `
            <td class="px-4 py-3 text-center"><input type="checkbox" class="row-checkbox w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer" data-id="${item.id}"></td>
            <td class="px-3 py-3 font-medium text-blue-600 cursor-pointer edit-btn" data-id="${item.id}">${item.tenphantu || ''}</td>
            <td class="px-3 py-3 text-slate-600 font-mono text-xs">${item.maphantu || ''}</td>
            <td class="px-3 py-3"><span class="px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600">${item.loaiphantu}</span></td>
            <td class="px-3 py-3 text-slate-600">${item.nhomphantu_ten || ''}</td>
            <td class="px-3 py-3 text-slate-500 text-sm truncate max-w-[200px]">${item.mota || ''}</td>
            <td class="px-3 py-3">
                 <label class="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" class="sr-only peer status-toggle" data-id="${item.id}" ${isChecked ? 'checked' : ''}>
                    <div class="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
            </td>
            <td class="px-3 py-3">
                <div class="flex items-center justify-end gap-1.5">
                    <button class="text-blue-600 hover:bg-blue-50 p-1 rounded edit-btn" data-id="${item.id}"><i class="fas fa-pencil"></i></button>
                    <button class="text-red-600 hover:bg-red-50 p-1 rounded delete-btn" data-id="${item.id}" data-name="${item.tenphantu}"><i class="fas fa-trash"></i></button>
                </div>
            </td>
        `;
        return tr;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.SalaryPageManager = new SalaryPageManager();
    window.SalaryPageManager.init();
});