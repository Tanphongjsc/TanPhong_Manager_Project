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
                <td colspan="11" class="px-6 py-10 text-center text-slate-500">
                    <div class="flex flex-col items-center justify-center">
                        <i class="fas fa-spinner fa-spin text-3xl text-blue-600 mb-3"></i>
                        <p class="font-medium text-sm">Đang tải dữ liệu báo cáo...</p>
                    </div>
                </td>
            </tr>
        `;
        
        const deptTbody = document.getElementById('dept-tree-table-body');
        if (deptTbody) deptTbody.innerHTML = loadingHtml;
        
        const jobTbody = document.getElementById('job-table-body');
        if (jobTbody) jobTbody.innerHTML = `
            <tr>
                <td colspan="3" class="px-6 py-10 text-center text-slate-500">
                    <div class="flex flex-col items-center justify-center">
                        <i class="fas fa-spinner fa-spin text-3xl text-blue-600 mb-3"></i>
                        <p class="font-medium text-sm">Đang tải dữ liệu báo cáo...</p>
                    </div>
                </td>
            </tr>
        `;
        const jobTfoot = document.getElementById('job-table-footer');
        if (jobTfoot) jobTfoot.innerHTML = '';
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
        if (deptTbody) deptTbody.innerHTML = `<tr><td colspan="11" class="px-4 py-8 text-center text-gray-500">${msg}</td></tr>`;
        if (deptTfoot) deptTfoot.innerHTML = '';
        
        const jobTbody = document.getElementById('job-table-body');
        const jobTfoot = document.getElementById('job-table-footer');
        if (jobTbody) jobTbody.innerHTML = `
            <tr>
                <td colspan="3" class="px-4 py-12 text-center text-gray-400">
                    <div class="flex flex-col items-center justify-center">
                        <i class="fas fa-inbox text-4xl mb-3"></i>
                        <p class="text-sm">${msg}</p>
                    </div>
                </td>
            </tr>
        `;
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
                            if (row.type === 'department') {
                                return `<span class="font-bold text-slate-800"><i class="fas fa-building text-blue-600 mr-2 text-xs opacity-80"></i>${row.label}</span>`;
                            }
                            if (row.type === 'position') {
                                return `<span class="font-semibold text-slate-700"><i class="fas fa-user-tag text-slate-400 mr-2 text-xs"></i>${row.label}</span>`;
                            }
                            return `<span class="text-slate-700"><i class="fas fa-user text-slate-400 mr-2 text-xs"></i>${row.label}</span>`;
                        }
                    },
                    { 
                        key: 'ma_nv',
                        align: 'center',
                        render: (val, row) => {
                            if (row.type === 'employee' && row.data && row.data.ma_nv) {
                                return `<span class="font-mono text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded text-[11px] font-medium border border-slate-200/60">${row.data.ma_nv}</span>`;
                            }
                            return '';
                        }
                    },
                    { 
                        key: 'suat_an_trua', 
                        align: 'right',
                        render: (val) => val ? Number(val).toLocaleString('vi-VN') : '0'
                    },
                    { 
                        key: 'tien_an_trua', 
                        align: 'right',
                        render: (val) => AppUtils.Helper.formatCurrency(val)
                    },
                    { 
                        key: 'suat_an_dem', 
                        align: 'right',
                        render: (val) => val ? Number(val).toLocaleString('vi-VN') : '0'
                    },
                    { 
                        key: 'tien_an_dem', 
                        align: 'right',
                        render: (val) => AppUtils.Helper.formatCurrency(val)
                    },
                    { 
                        key: 'suat_an_cn', 
                        align: 'right',
                        render: (val) => val ? Number(val).toLocaleString('vi-VN') : '0'
                    },
                    { 
                        key: 'tien_an_cn', 
                        align: 'right',
                        render: (val) => AppUtils.Helper.formatCurrency(val)
                    },
                    { 
                        key: 'tong_gio', 
                        align: 'right',
                        className: 'tabular-nums',
                        render: (val) => Number(val || 0).toFixed(2)
                    },
                    { 
                        key: 'tong_ca', 
                        align: 'right',
                        className: 'tabular-nums',
                        render: (val) => Number(val || 0).toFixed(2)
                    },
                    { 
                        key: 'luong_thuc_linh', 
                        align: 'right',
                        className: 'tabular-nums font-bold text-blue-600',
                        render: (val, row) => {
                            if (row.isFooter) return `<span class="text-blue-700 font-bold">${AppUtils.Helper.formatCurrency(val)}</span>`;
                            if (row.type === 'department') return `<span class="font-bold text-blue-700">${AppUtils.Helper.formatCurrency(val)}</span>`;
                            if (row.type === 'position') return `<span class="font-semibold text-blue-600">${AppUtils.Helper.formatCurrency(val)}</span>`;
                            return `<span class="font-medium text-blue-600">${AppUtils.Helper.formatCurrency(val)}</span>`;
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

    _formatParamValue(val) {
        if (val === null || val === undefined || val === '') return '—';
        const num = Number(val);
        if (isNaN(num)) return val;
        // Số nguyên → không decimal, số thập phân → 2 chữ số
        return Number.isInteger(num) ? num.toLocaleString('vi-VN') : num.toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    renderTabJob() {
        const tbody = document.getElementById('job-table-body');
        const tfoot = document.getElementById('job-table-footer');
        if (!tbody || !tfoot) return;
        
        tbody.innerHTML = '';
        tfoot.innerHTML = '';
        
        if (!this.currentData.jobs || this.currentData.jobs.length === 0 || this.currentData.no_payroll) {
            this.renderEmpty();
            return;
        }
        
        // Palette màu cho badge tham số
        const badgeColors = [
            { bg: '#eff6ff', text: '#1e40af', border: '#bfdbfe' },
            { bg: '#f0fdf4', text: '#166534', border: '#bbf7d0' },
            { bg: '#fefce8', text: '#854d0e', border: '#fde68a' },
            { bg: '#fdf2f8', text: '#9d174d', border: '#fbcfe8' },
            { bg: '#f5f3ff', text: '#5b21b6', border: '#ddd6fe' },
            { bg: '#ecfeff', text: '#155e75', border: '#a5f3fc' },
        ];
        
        let html = '';
        this.currentData.jobs.forEach((job, index) => {
            const paramsDef = job.params_def || [];
            const paramsTotals = job.params_totals || {};
            const hasParams = paramsDef.length > 0;
            const jobName = job.tencongviec || `Công việc #${index + 1}`;
            const tongTien = AppUtils.Helper.formatCurrency(Number(job.tong_tien) || 0);
            const isEven = index % 2 === 0;
            const rowBg = isEven ? '#ffffff' : '#f8fafc';
            
            // Build badges HTML cho tham số
            let paramsHtml = '';
            if (hasParams) {
                const badges = paramsDef.map((p, pIdx) => {
                    const val = paramsTotals[p.ma] || 0;
                    const color = badgeColors[pIdx % badgeColors.length];
                    const paramName = p.ten || p.ma;
                    const paramVal = this._formatParamValue(val);
                    const paramDonVi = (p.donvi || '').trim();
                    const donViHtml = paramDonVi ? `<span style="font-weight:500;font-size:11px;opacity:0.85;margin-left:1px">${paramDonVi}</span>` : '';
                    return `<span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:6px;font-size:12px;line-height:1.4;background:${color.bg};color:${color.text};border:1px solid ${color.border};white-space:nowrap;margin:2px">
                        <span style="font-weight:500;opacity:0.8">${paramName}:</span>
                        <span style="font-weight:700">${paramVal}</span>
                        ${donViHtml}
                    </span>`;
                });
                paramsHtml = `<div style="display:flex;flex-wrap:wrap;gap:4px;align-items:center">${badges.join('')}</div>`;
            } else {
                paramsHtml = `<span style="color:#94a3b8;font-size:12px;font-style:italic"><i class="fas fa-info-circle" style="margin-right:4px"></i>Không có tham số</span>`;
            }
            
            html += `
            <tr class="bg-white hover:bg-slate-50/80 cursor-pointer transition-colors" style="transition: background-color 0.15s ease;" onmouseenter="this.style.backgroundColor='#f1f5f9'" onmouseleave="this.style.backgroundColor=''">
                <td class="px-4 py-2.5 text-left font-semibold text-slate-800">
                    <div class="flex items-center">
                        <i class="fas fa-briefcase text-blue-600 mr-2 text-xs opacity-80"></i>
                        <span>${jobName}</span>
                    </div>
                </td>
                <td class="px-4 py-2.5 text-right font-bold text-blue-600 tabular-nums">
                    ${tongTien}
                </td>
                <td class="px-4 py-2.5 text-left">
                    ${paramsHtml}
                </td>
            </tr>
            `;
        });
        
        tbody.innerHTML = html;
        
        // Grand total footer đồng bộ với Tab 1
        const gt = this.currentData.grand_totals;
        tfoot.innerHTML = `
            <tr>
                <td class="px-4 py-3 text-left uppercase tracking-wider">
                    TỔNG CỘNG TOÀN BỘ
                </td>
                <td class="px-4 py-3 text-right text-blue-700 font-bold text-sm tabular-nums">
                    ${AppUtils.Helper.formatCurrency(Number(gt.tong_tien_cv) || 0)}
                </td>
                <td class="px-4 py-3"></td>
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
