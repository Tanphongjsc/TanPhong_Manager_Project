class BaoCaoTongHopLuongManager {
    constructor() {
        this.apiBaseUrl = '/hrm/quan-ly-luong/api/bao-cao/tong-hop-luong/';
        this.phongBanUrl = '/hrm/to-chuc-nhan-su/api/v1/phong-ban/?page_size=100';
        this.currentData = null;
        
        // Elements
        this.form = document.getElementById('filter-form');
        this.searchInput = document.getElementById('search-input');
        this.exportBtn = document.getElementById('btn-export-excel');
        
        this.init();
    }

    init() {
        // Set default month to current month
        const now = new Date();
        const monthStr = now.toISOString().slice(0, 7); // YYYY-MM
        document.getElementById('filter-thang').value = monthStr;
        
        this.initOrgTree();
        this.initTabSwitching();
        this.bindEvents();
        
        // Initial load
        this.loadData();
    }

    initOrgTree() {
        if (window.OrgTreeComponent) {
            this.orgTree = new OrgTreeComponent({
                componentId: 'org-tree-filter',
                variant: 'dropdown',
                showActions: false,
                selectableMode: 'department',
                onSelect: () => {
                    this.loadData();
                }
            });
            this.orgTree.init();
        }
    }

    initTabSwitching() {
        const tabContainer = document.querySelector('#tab-container nav');
        if (!tabContainer) return;
        const tabs = tabContainer.querySelectorAll('a');
        
        tabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                e.preventDefault();
                
                // Cập nhật URL hash
                const targetId = tab.getAttribute('href');
                if (!targetId || !document.querySelector(targetId)) return;
                
                history.replaceState(null, null, targetId);
                
                // Thay đổi active class cho tab buttons
                tabs.forEach(t => {
                    t.classList.remove('text-blue-600', 'border-blue-600');
                    t.classList.add('text-slate-500', 'border-transparent', 'hover:text-slate-700', 'hover:border-slate-300');
                });
                tab.classList.remove('text-slate-500', 'border-transparent', 'hover:text-slate-700', 'hover:border-slate-300');
                tab.classList.add('text-blue-600', 'border-blue-600');
                
                // Thay đổi active class cho tab panes
                document.querySelectorAll('.tab-pane').forEach(pane => {
                    pane.classList.add('hidden');
                });
                document.querySelector(targetId).classList.remove('hidden');
                
                // Render lại nếu cần
                this.render();
            });
        });
        
        // Mở tab theo hash, default là tab 1
        let hash = window.location.hash;
        if (!hash || !document.querySelector(hash)) {
            hash = '#tab-dept-position';
        }
        const activeTab = Array.from(tabs).find(t => t.getAttribute('href') === hash);
        if (activeTab) {
            activeTab.click();
        }
    }

    bindEvents() {
        if (this.form) {
            this.form.addEventListener('change', () => this.loadData());
        }
        
        if (this.searchInput) {
            let debounceTimer;
            this.searchInput.addEventListener('input', () => {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => this.loadData(), 500);
            });
        }
        
        if (this.exportBtn) {
            this.exportBtn.addEventListener('click', () => this.exportToExcel());
        }
    }

    getQueryParams() {
        const formData = AppUtils.Form.getData(this.form);
        const search = this.searchInput ? this.searchInput.value.trim() : '';
        
        const params = new URLSearchParams();
        if (formData.thang) params.append('thang', formData.thang);
        if (formData.phongban_id) params.append('phongban_id', formData.phongban_id);
        if (formData.don_gia_an_trua) params.append('don_gia_an_trua', formData.don_gia_an_trua);
        if (formData.don_gia_an_dem) params.append('don_gia_an_dem', formData.don_gia_an_dem);
        if (formData.don_gia_an_chu_nhat) params.append('don_gia_an_chu_nhat', formData.don_gia_an_chu_nhat);
        if (search) params.append('search', search);
        
        return params;
    }

    renderLoading() {
        const loadingHtml = `
            <tr>
                <td colspan="12" class="px-6 py-10 text-center text-slate-500">
                    <div class="flex flex-col items-center justify-center">
                        <i class="fas fa-spinner fa-spin text-3xl text-blue-600 mb-3"></i>
                        <p class="font-medium text-sm">Đang tải dữ liệu báo cáo...</p>
                    </div>
                </td>
            </tr>
        `;
        
        const deptTbody = document.getElementById('dept-tree-table-body');
        if (deptTbody) deptTbody.innerHTML = loadingHtml;
        
        const jobTbody = document.getElementById('table-body-job');
        if (jobTbody) jobTbody.innerHTML = loadingHtml;
    }

    async loadData() {
        const params = this.getQueryParams();
        if (!params.get('thang')) return;
        
        this.renderLoading();
        
        try {
            const res = await AppUtils.API.get(`${this.apiBaseUrl}?${params.toString()}`);
            if (res && res.success) {
                this.currentData = res.data;
                this.render();
            } else {
                AppUtils.Notification.error(res?.message || 'Có lỗi xảy ra');
                this.currentData = null;
                this.renderEmpty();
            }
        } catch (error) {
            console.error('Lỗi khi tải dữ liệu tổng hợp lương:', error);
            AppUtils.Notification.error('Không thể tải dữ liệu báo cáo');
            this.currentData = null;
            this.renderEmpty();
        }
    }

    render() {
        if (!this.currentData) {
            this.renderEmpty();
            return;
        }
        
        const activeHash = window.location.hash || '#tab-dept-position';
        if (activeHash === '#tab-dept-position') {
            this.renderTabDeptPosition();
        } else if (activeHash === '#tab-job') {
            this.renderTabJob();
        }
    }
    
    renderEmpty() {
        const isNoPayroll = this.currentData && this.currentData.no_payroll;
        const msg = isNoPayroll ? 'Chưa có bảng lương nào được chốt cho tháng này' : 'Không có dữ liệu trong khoảng thời gian này';
        
        const deptTbody = document.getElementById('dept-tree-table-body');
        const deptTfoot = document.getElementById('dept-tree-table-footer');
        if (deptTbody) deptTbody.innerHTML = `<tr><td colspan="10" class="px-4 py-8 text-center text-gray-500">${msg}</td></tr>`;
        if (deptTfoot) deptTfoot.innerHTML = '';
        
        const jobTbody = document.getElementById('table-body-job');
        const jobTfoot = document.getElementById('table-footer-job');
        if (jobTbody) jobTbody.innerHTML = `<tr><td colspan="3" class="px-4 py-8 text-center text-gray-500">${msg}</td></tr>`;
        if (jobTfoot) jobTfoot.innerHTML = '';
    }

    renderTabDeptPosition() {
        if (!this.currentData.tree_data || this.currentData.tree_data.length === 0 || this.currentData.no_payroll) {
            this.renderEmpty();
            return;
        }

        if (!this.treeTable) {
            this.treeTable = new TreeTableComponent({
                tableId: 'dept-tree-table',
                defaultExpanded: false,
                emptyMessage: 'Không có dữ liệu',
                columns: [
                    { 
                        key: 'name_col',
                        isTreeColumn: true,
                        render: (val, row) => {
                            if (row.type === 'department') return `<span class="font-bold text-gray-800">${row.label}</span>`;
                            if (row.type === 'position') return `<span class="font-semibold text-gray-700">${row.label}</span>`;
                            return row.label;
                        }
                    },
                    { 
                        key: 'ma_nv',
                        align: 'center',
                        render: (val, row) => row.type === 'employee' ? row.data.ma_nv : ''
                    },
                    { key: 'suat_an_trua', align: 'right' },
                    { 
                        key: 'tien_an_trua', 
                        align: 'right',
                        render: (val) => AppUtils.Helper.formatCurrency(val)
                    },
                    { key: 'suat_an_dem', align: 'right' },
                    { 
                        key: 'tien_an_dem', 
                        align: 'right',
                        render: (val) => AppUtils.Helper.formatCurrency(val)
                    },
                    { key: 'suat_an_cn', align: 'right' },
                    { 
                        key: 'tien_an_cn', 
                        align: 'right',
                        render: (val) => AppUtils.Helper.formatCurrency(val)
                    },
                    { 
                        key: 'tong_gio', 
                        align: 'right',
                        render: (val) => Number(val).toFixed(2)
                    },
                    { 
                        key: 'tong_ca', 
                        align: 'right',
                        render: (val) => Number(val).toFixed(2)
                    },
                    { 
                        key: 'luong_thuc_linh', 
                        align: 'right',
                        className: 'border-l border-gray-100 font-bold text-blue-600',
                        render: (val, row) => {
                            if (row.isFooter) return `<span class="text-blue-700">${AppUtils.Helper.formatCurrency(val)}</span>`;
                            return AppUtils.Helper.formatCurrency(val);
                        }
                    }
                ]
            });
        }
        
        this.treeTable.updateData(this.currentData.tree_data, {
            label: 'Tổng cộng toàn bộ',
            ...this.currentData.grand_totals
        });
    }

    renderTabJob() {
        const tbody = document.getElementById('table-body-job');
        const tfoot = document.getElementById('table-footer-job');
        tbody.innerHTML = '';
        tfoot.innerHTML = '';
        
        if (!this.currentData.jobs || this.currentData.jobs.length === 0 || this.currentData.no_payroll) {
            this.renderEmpty();
            return;
        }
        
        let html = '';
        this.currentData.jobs.forEach(job => {
            html += `
                <tr class="hover:bg-gray-50 bg-white">
                    <td class="px-4 py-3 font-medium text-gray-900">${job.tencongviec}</td>
                    <td class="px-4 py-3 text-right text-gray-900">${AppUtils.Helper.formatCurrency(job.tong_tien)}</td>
                    <td class="px-4 py-3 text-right">${Number(job.tong_gio).toFixed(2)}</td>
                </tr>
            `;
        });
        
        tbody.innerHTML = html;
        
        const gt = this.currentData.grand_totals;
        tfoot.innerHTML = `
            <tr>
                <td class="px-4 py-3 text-right uppercase tracking-wider">Tổng cộng toàn bộ</td>
                <td class="px-4 py-3 text-right text-base">${AppUtils.Helper.formatCurrency(gt.tong_tien_cv)}</td>
                <td class="px-4 py-3 text-right">${Number(gt.tong_gio).toFixed(2)}</td>
            </tr>
        `;
    }

    exportToExcel() {
        const params = this.getQueryParams();
        if (!params.get('thang')) {
            AppUtils.Notification.warning('Vui lòng chọn tháng để xuất');
            return;
        }
        
        const url = `${this.apiBaseUrl}export/?${params.toString()}`;
        window.open(url, '_blank');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new BaoCaoTongHopLuongManager();
});
