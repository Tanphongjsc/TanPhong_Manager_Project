class BaoCaoTongHopLuongManager {
    constructor() {
        this.apiBaseUrl = '/hrm/quan-ly-luong/api/bao-cao/tong-hop-luong/';
        this.phongBanUrl = '/hrm/to-chuc-nhan-su/api/v1/phong-ban/?page_size=100';
        this.currentData = null;
        
        // Elements
        this.form = document.getElementById('filter-form');
        this.searchInput = document.getElementById('search-input');
        this.exportBtn = document.getElementById('btn-export-excel');
        this.loadingOverlay = document.getElementById('loading-overlay');
        
        this.init();
    }

    init() {
        // Set default month to current month
        const now = new Date();
        const monthStr = now.toISOString().slice(0, 7); // YYYY-MM
        document.getElementById('filter-thang').value = monthStr;
        
        this.loadPhongBan();
        this.initTabSwitching();
        this.bindEvents();
        
        // Initial load
        this.loadData();
    }

    async loadPhongBan() {
        try {
            const res = await AppUtils.API.get(this.phongBanUrl);
            if (res && res.success && res.data) {
                const select = document.getElementById('filter-phongban');
                res.data.forEach(pb => {
                    const option = document.createElement('option');
                    option.value = pb.id;
                    option.textContent = pb.tenphongban;
                    select.appendChild(option);
                });
            }
        } catch (error) {
            console.error('Error loading phòng ban:', error);
        }
    }

    initTabSwitching() {
        const tabs = document.querySelectorAll('.tab-btn');
        tabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                e.preventDefault();
                
                // Cập nhật URL hash
                const targetId = tab.getAttribute('href');
                history.replaceState(null, null, targetId);
                
                // Thay đổi active class cho tab buttons
                tabs.forEach(t => {
                    t.classList.remove('text-blue-600', 'border-blue-600', 'active');
                    t.classList.add('text-gray-500', 'border-transparent', 'hover:text-gray-600', 'hover:border-gray-300');
                });
                tab.classList.remove('text-gray-500', 'border-transparent', 'hover:text-gray-600', 'hover:border-gray-300');
                tab.classList.add('text-blue-600', 'border-blue-600', 'active');
                
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
        const activeTab = document.querySelector(`.tab-btn[href="${hash}"]`);
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
        if (formData.don_gia_an_dem) params.append('don_gia_an_dem', formData.don_gia_an_dem);
        if (formData.don_gia_an_chu_nhat) params.append('don_gia_an_chu_nhat', formData.don_gia_an_chu_nhat);
        if (search) params.append('search', search);
        
        return params;
    }

    async loadData() {
        const params = this.getQueryParams();
        if (!params.get('thang')) return;
        
        this.loadingOverlay.classList.remove('hidden');
        this.loadingOverlay.classList.add('flex');
        
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
        } finally {
            this.loadingOverlay.classList.add('hidden');
            this.loadingOverlay.classList.remove('flex');
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
        
        document.getElementById('table-body-dept').innerHTML = `
            <tr><td colspan="10" class="px-4 py-8 text-center text-gray-500">${msg}</td></tr>
        `;
        document.getElementById('table-footer-dept').innerHTML = '';
        
        document.getElementById('table-body-job').innerHTML = `
            <tr><td colspan="3" class="px-4 py-8 text-center text-gray-500">${msg}</td></tr>
        `;
        document.getElementById('table-footer-job').innerHTML = '';
    }

    renderTabDeptPosition() {
        const tbody = document.getElementById('table-body-dept');
        const tfoot = document.getElementById('table-footer-dept');
        tbody.innerHTML = '';
        tfoot.innerHTML = '';
        
        if (!this.currentData.grouped || this.currentData.grouped.length === 0 || this.currentData.no_payroll) {
            this.renderEmpty();
            return;
        }
        
        let html = '';
        this.currentData.grouped.forEach(group => {
            // Group header
            html += `
                <tr class="bg-gray-50 font-semibold text-gray-800 border-t-2 border-gray-200">
                    <td colspan="10" class="px-4 py-3">
                        <i class="fas fa-layer-group text-gray-400 mr-2"></i>
                        ${group.ten_phongban} - ${group.ten_chucvu}
                        <span class="ml-2 text-xs font-normal text-gray-500">(${group.nhan_vien.length} nhân viên)</span>
                    </td>
                </tr>
            `;
            
            // Employees
            group.nhan_vien.forEach(nv => {
                html += `
                    <tr class="hover:bg-gray-50 bg-white">
                        <td class="px-4 py-2 font-medium text-gray-900">${nv.ma_nv}</td>
                        <td class="px-4 py-2">${nv.ten_nv}</td>
                        <td class="px-4 py-2 text-right">${nv.suat_an_dem || 0}</td>
                        <td class="px-4 py-2 text-right">${AppUtils.Helper.formatCurrency(nv.tien_an_dem)}</td>
                        <td class="px-4 py-2 text-right">${nv.suat_an_cn || 0}</td>
                        <td class="px-4 py-2 text-right">${AppUtils.Helper.formatCurrency(nv.tien_an_cn)}</td>
                        <td class="px-4 py-2 text-right font-medium">${AppUtils.Helper.formatCurrency(nv.tong_tien_cv)}</td>
                        <td class="px-4 py-2 text-right">${Number(nv.tong_gio).toFixed(2)}</td>
                        <td class="px-4 py-2 text-right">${Number(nv.tong_ca).toFixed(2)}</td>
                        <td class="px-4 py-2 text-right border-l border-gray-100 font-bold text-blue-600">${AppUtils.Helper.formatCurrency(nv.luong_thuc_linh)}</td>
                    </tr>
                `;
            });
            
            // Subtotal
            const sub = group.subtotal;
            html += `
                <tr class="bg-blue-50/30 text-gray-800 border-t border-dashed border-gray-300">
                    <td colspan="2" class="px-4 py-2 text-right font-medium">Tổng nhóm:</td>
                    <td class="px-4 py-2 text-right font-medium">${sub.suat_an_dem}</td>
                    <td class="px-4 py-2 text-right font-medium">${AppUtils.Helper.formatCurrency(sub.tien_an_dem)}</td>
                    <td class="px-4 py-2 text-right font-medium">${sub.suat_an_cn}</td>
                    <td class="px-4 py-2 text-right font-medium">${AppUtils.Helper.formatCurrency(sub.tien_an_cn)}</td>
                    <td class="px-4 py-2 text-right font-medium">${AppUtils.Helper.formatCurrency(sub.tong_tien_cv)}</td>
                    <td class="px-4 py-2 text-right font-medium">${Number(sub.tong_gio).toFixed(2)}</td>
                    <td class="px-4 py-2 text-right font-medium">${Number(sub.tong_ca).toFixed(2)}</td>
                    <td class="px-4 py-2 text-right border-l border-gray-200 font-bold text-blue-700">${AppUtils.Helper.formatCurrency(sub.luong_thuc_linh)}</td>
                </tr>
            `;
        });
        
        tbody.innerHTML = html;
        
        // Grand totals
        const gt = this.currentData.grand_totals;
        tfoot.innerHTML = `
            <tr>
                <td colspan="2" class="px-4 py-3 text-right uppercase tracking-wider">Tổng cộng toàn bộ</td>
                <td class="px-4 py-3 text-right">${gt.suat_an_dem}</td>
                <td class="px-4 py-3 text-right">${AppUtils.Helper.formatCurrency(gt.tien_an_dem)}</td>
                <td class="px-4 py-3 text-right">${gt.suat_an_cn}</td>
                <td class="px-4 py-3 text-right">${AppUtils.Helper.formatCurrency(gt.tien_an_cn)}</td>
                <td class="px-4 py-3 text-right text-base">${AppUtils.Helper.formatCurrency(gt.tong_tien_cv)}</td>
                <td class="px-4 py-3 text-right">${Number(gt.tong_gio).toFixed(2)}</td>
                <td class="px-4 py-3 text-right">${Number(gt.tong_ca).toFixed(2)}</td>
                <td class="px-4 py-3 text-right border-l border-blue-200 text-base font-bold text-blue-700">${AppUtils.Helper.formatCurrency(gt.luong_thuc_linh)}</td>
            </tr>
        `;
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
