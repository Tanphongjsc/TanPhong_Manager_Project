/**
 * Quản lý trang Phần tử lương (Tab Navigation & Orchestration)
 * Tham khảo cấu trúc từ: DetailManager (nhan_vien_detail.js)
 */
class SalaryPageManager {
    constructor() {
        this.els = {
            tabNav: document.querySelector('#salary-tab-container nav'),
            panes: document.querySelectorAll('.tab-pane')
        };

        // Class CSS cho Tab active/inactive (giống nhan_vien_detail.js)
        this.classes = {
            active: ['border-blue-600', 'text-blue-600'],
            inactive: ['border-transparent', 'text-slate-500', 'hover:text-slate-700', 'hover:border-slate-300']
        };

        this.managers = {
            nhom: null,
            phantu: null
        };
        
        // Cờ đánh dấu tab đã load dữ liệu chưa
        this.loadedTabs = new Map([
            ['#tab-elements', false],
            ['#tab-info', false]
        ]);
    }

    init() {
        this.initTabs();
        this.initSubManagers();
        console.log('✅ SalaryPageManager initialized');
    }

    /**
     * Khởi tạo các Manager con (CRUD)
     */
    initSubManagers() {
        // 1. Init Manager Nhóm
        window.NhomPhanTuManager = new NhomPhanTuManager();
        window.NhomPhanTuManager.init();
        this.managers.nhom = window.NhomPhanTuManager;

        // 2. Init Manager Phần tử lương
        window.PhanTuLuongManager = new PhanTuLuongManager();
        window.PhanTuLuongManager.init();
        this.managers.phantu = window.PhanTuLuongManager;

        // Đánh dấu tab mặc định đã load (vì TableManager tự fetch khi init)
        this.loadedTabs.set('#tab-elements', true);
    }

    /**
     * Logic xử lý chuyển Tab
     */
    initTabs() {
        if (!this.els.tabNav) return;

        const links = this.els.tabNav.querySelectorAll('a');
        
        links.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                this.activateTab(link);
            });
        });

        // Active tab đầu tiên hoặc theo Hash URL
        this.activateHashIfAny(links);
    }

    activateHashIfAny(links) {
        const hash = window.location.hash;
        let targetLink = null;
        if (hash) {
            targetLink = Array.from(links).find(a => a.getAttribute('href') === hash);
        }
        if (!targetLink && links.length > 0) {
            targetLink = links[0];
        }
        if (targetLink) {
            this.activateTab(targetLink);
        }
    }

    activateTab(tabEl) {
        const targetId = tabEl.getAttribute('href');
        if (!targetId) return;

        // 1. Reset style tabs
        const allLinks = this.els.tabNav.querySelectorAll('a');
        allLinks.forEach(link => {
            link.classList.remove(...this.classes.active);
            link.classList.add(...this.classes.inactive);
        });

        // 2. Active tab hiện tại
        tabEl.classList.remove(...this.classes.inactive);
        tabEl.classList.add(...this.classes.active);

        // 3. Hiển thị nội dung pane
        this.els.panes.forEach(p => p.classList.add('hidden'));
        const pane = document.querySelector(targetId);
        if (pane) {
            pane.classList.remove('hidden');
            // Lazy load logic nếu cần (hiện tại chưa dùng cho tab-info)
            if (!this.loadedTabs.get(targetId)) {
                // this.loadTabContent(targetId); 
                this.loadedTabs.set(targetId, true);
            }
        }
        
        // Update URL Hash
        history.replaceState(null, '', targetId);
    }
}

/**
 * Manager Nhóm Phần Tử (Refactored logic cũ)
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
            onAfterSubmit: () => {
                this.tableManager.refresh(); 
                window.PhanTuLuongManager.loadGroupData(); 
            },
            onRefreshTable: () => {
                this.tableManager.refresh();
                window.PhanTuLuongManager.loadGroupData();
            }
        });

        this.groupListSidebar = AppUtils.Sidebar.init('group-list-sidebar', 'group-sidebar-overlay');
        this.tableManager = null;
    }

    init() {
        super.init();
        this.initTable();
    }

    openGroupListSidebar() {
        if (this.groupListSidebar) {
            this.groupListSidebar.open();
            if (this.tableManager) this.tableManager.refresh();
        }
    }

    closeGroupListSidebar() {
        if (this.groupListSidebar) this.groupListSidebar.close();
    }

    initTable() {
        // Tối ưu: Chỉ init table khi sidebar được mở lần đầu (nếu muốn), hoặc init luôn
        this.tableManager = new TableManager({
            tableBody: document.getElementById('group-table-body'),
            paginationContainer: document.getElementById('group-pagination'),
            searchInput: document.getElementById('group-search-input'),
            apiEndpoint: this.config.apiUrls.list,
            pageSize: 10,
            enableBulkActions: false,
            onRenderRow: (item) => {
                const tr = document.createElement('tr');
                tr.className = 'hover:bg-slate-50 transition-colors border-b border-slate-100';
                tr.innerHTML = `
                    <td class="px-4 py-3 font-medium text-slate-700">
                        <a href="javascript:void(0)" onclick="window.NhomPhanTuManager.openModal('edit', ${item.id})" class="text-blue-600 hover:text-blue-800">
                            ${item.tennhom}
                        </a>
                    </td>
                    <td class="px-4 py-3 font-mono text-xs text-slate-500 bg-slate-50 w-fit rounded">${item.manhom}</td>
                    <td class="px-4 py-3 text-right">
                        <div class="flex items-center justify-end gap-1.5 whitespace-nowrap">
                            <button type="button"
                                    onclick="window.NhomPhanTuManager.openModal('edit', ${item.id})"
                                    class="inline-flex items-center justify-center w-7 h-7 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                    title="Sửa">
                                <svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
                                </svg>
                            </button>
                            <button type="button"
                                    onclick="window.NhomPhanTuManager.deleteItem(${item.id}, '${item.tennhom}')"
                                    class="inline-flex items-center justify-center w-7 h-7 text-red-600 hover:bg-red-50 rounded transition-colors"
                                    title="Xóa">
                                <svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                                </svg>
                            </button>
                        </div>
                    </td>
                `;
                return tr;
            }
        });
    }
}

/**
 * Manager Phần Tử Lương (Refactored logic cũ)
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
                // Xử lý riêng cho select nhóm
                const nhomSelect = form.querySelector('[name="nhomphantu"]');
                if(nhomSelect && data.nhomphantu) nhomSelect.value = data.nhomphantu;
            }
        });
        this.tableManager = null;
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

                // Fill Toolbar Filter
                const filterSelect = document.getElementById('filter-group-select');
                if (filterSelect) filterSelect.innerHTML = '<option value="">Tất cả nhóm</option>' + optionsHtml;

                // Fill Sidebar Form
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
            paginationContainer: document.querySelector('.pagination-container'), // Class do component pagination sinh ra
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
        // Sử dụng AppUtils.UI.toggleSwitch nếu có, hoặc giữ nguyên HTML
        const statusHtml = `
            <label class="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" class="sr-only peer status-toggle" data-id="${item.id}" ${isChecked ? 'checked' : ''}>
                <div class="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>`;

        const loaiMap = {
            'THU_NHAP': { text: 'Thu nhập', class: 'text-green-600 bg-green-50' },
            'KHAU_TRU': { text: 'Khấu trừ', class: 'text-red-600 bg-red-50' }
        };
        const loai = loaiMap[item.loaiphantu] || { text: item.loaiphantu, class: 'text-slate-600 bg-slate-50' };

        tr.innerHTML = `
            <td class="px-4 py-3 text-center"><input type="checkbox" class="row-checkbox w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer" data-id="${item.id}"></td>
            <td class="px-3 py-3">
                <a href="javascript:void(0);" onclick="window.PhanTuLuongManager.openSidebar('edit', ${item.id})" class="text-blue-600 hover:text-blue-700 font-medium">${item.tenphantu || ''}</a>
            </td>
            <td class="px-3 py-3 text-slate-600 font-mono text-xs">${item.maphantu || ''}</td>
            <td class="px-3 py-3">
                <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${loai.class}">${loai.text}</span>
            </td>
            <td class="px-3 py-3 text-slate-600">
                <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800 border border-gray-200">${item.nhomphantu_ten || item.nhomphantu || ''}</span>
            </td>
            <td class="px-3 py-3 text-slate-500 text-sm truncate max-w-[200px]" title="${item.mota || ''}">${item.mota || ''}</td>
            <td class="px-3 py-3">${statusHtml}</td>
            <td class="px-3 py-3">
                <div class="flex items-center justify-end gap-1.5 whitespace-nowrap">
                    <button type="button"
                            onclick="window.PhanTuLuongManager.openSidebar('edit', ${item.id})"
                            class="inline-flex items-center justify-center w-7 h-7 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                            title="Sửa">
                        <svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
                        </svg>
                    </button>
                    <button type="button"
                            onclick="window.PhanTuLuongManager.deleteItem(${item.id}, '${item.tenphantu}')"
                            class="inline-flex items-center justify-center w-7 h-7 text-red-600 hover:bg-red-50 rounded transition-colors"
                            title="Xóa">
                        <svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                        </svg>
                    </button>
                </div>
            </td>
        `;
        return tr;
    }
}

// Khởi tạo chính
document.addEventListener('DOMContentLoaded', () => {
    // 1. Init Page Manager (Tab control)
    const pageManager = new SalaryPageManager();
    pageManager.init();
    
    // Lưu vào global để truy cập nếu cần
    window.SalaryPageManager = pageManager;
});