/**
 * QUẢN LÝ CHI TIẾT NHÂN VIÊN
 * Dependencies: AppUtils, EmployeeManager (from cay_nhan_su.js)
 */

class DetailManager {
    constructor() {
        this.empId = document.getElementById('current-employee-id').value;
        this.redirectUrl = document.getElementById('redirect-url-after-delete').value;
        this.apiUrl = {
            detail: `/hrm/to-chuc-nhan-su/api/v1/nhan-vien/${this.empId}/`,
            history: `/hrm/to-chuc-nhan-su/api/v1/lich-su-cong-tac/?nhanvien_id=${this.empId}`,
        };
        
        // Tái sử dụng Manager từ cay_nhan_su.js để handle form Edit
        // Lưu ý: Cần đảm bảo window.EmployeeManager đã được khởi tạo
        if (!window.EmployeeManager) {
            window.EmployeeManager = new EmployeeManager();
            window.EmployeeManager.init();
            // Override hàm refresh table để reload trang chi tiết thay vì reload table
            window.EmployeeManager.config.onRefreshTable = () => window.location.reload();
        }
    }

    init() {
        this.initTabs();
        this.loadHistory();
    }

    // --- Tab Handling ---
    initTabs() {
        const tabs = document.querySelectorAll('[data-tab-target]');
        tabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                e.preventDefault();
                // 1. UI Tab Active State
                tabs.forEach(t => {
                    t.classList.remove('border-blue-600', 'text-blue-600');
                    t.classList.add('border-transparent', 'text-slate-500', 'hover:text-slate-700', 'hover:border-slate-300');
                });
                tab.classList.remove('border-transparent', 'text-slate-500', 'hover:text-slate-700', 'hover:border-slate-300');
                tab.classList.add('border-blue-600', 'text-blue-600');

                // 2. Show Content
                const targetId = tab.getAttribute('data-tab-target'); // e.g., "#tab-content-basic"
                document.querySelectorAll('.tab-pane').forEach(p => p.classList.add('hidden'));
                const targetPane = document.querySelector(targetId);
                if(targetPane) targetPane.classList.remove('hidden');
            });
        });
    }

    // --- Actions ---
    openEdit() {
        // Gọi method của EmployeeManager để mở sidebar và điền dữ liệu
        window.EmployeeManager.openSidebar('edit', this.empId);
    }

    async deleteEmployee() {
        const confirmed = await AppUtils.Notify.confirm(
            'Bạn có chắc chắn muốn xóa nhân viên này?',
            'Hành động này không thể hoàn tác.',
            'warning'
        );

        if (confirmed) {
            try {
                await AppUtils.API.delete(this.apiUrl.detail);
                AppUtils.Notify.success('Đã xóa nhân viên thành công');
                setTimeout(() => window.location.href = this.redirectUrl, 1000);
            } catch (e) {
                AppUtils.Notify.error('Không thể xóa nhân viên này.');
            }
        }
    }

    async resignEmployee() {
        const confirmed = await AppUtils.Notify.confirm(
            'Xác nhận nhân viên này nghỉ việc?',
            'Trạng thái sẽ chuyển sang "Đã nghỉ việc".',
            'info'
        );

        if (confirmed) {
            try {
                // Giả định API patch trạng thái
                await AppUtils.API.patch(this.apiUrl.detail, { trangthainv: 'Đã nghỉ việc' });
                AppUtils.Notify.success('Cập nhật trạng thái thành công');
                setTimeout(() => window.location.reload(), 800);
            } catch (e) {
                AppUtils.Notify.error('Lỗi khi cập nhật trạng thái.');
            }
        }
    }

    // --- Load Data Tables ---
    async loadHistory() {
        const tbody = document.getElementById('history-table-body');
        if (!tbody) return;

        tbody.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-xs text-slate-400"><i class="fas fa-spinner fa-spin"></i> Đang tải...</td></tr>';

        try {
            const res = await AppUtils.API.get(this.apiUrl.history);
            const data = res.data || res; // Handle pagination result structure if needed

            if (!data.length) {
                tbody.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-xs text-slate-400">Chưa có lịch sử công tác</td></tr>';
                return;
            }

            tbody.innerHTML = data.map(item => `
                <tr class="hover:bg-slate-50 transition-colors">
                    <td class="px-4 py-3 text-sm text-slate-600">
                        ${AppUtils.DateUtils.format(item.created_at || item.ngaybatdau, 'dd/MM/yyyy')}
                    </td>
                    <td class="px-4 py-3 text-sm text-slate-600 font-medium">
                        ${item.phongban?.tenphongban || item.noicongtac || '-'}
                    </td>
                    <td class="px-4 py-3 text-sm text-slate-600">
                        ${item.chucvu?.tenvitricongviec || '-'}
                    </td>
                    <td class="px-4 py-3 text-sm">
                        <span class="px-2 py-0.5 rounded-full text-xs font-medium ${item.trangthai === 'active' ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-500'}">
                            ${item.trangthai || 'N/A'}
                        </span>
                    </td>
                </tr>
            `).join('');
            
        } catch (e) {
            console.error(e);
            tbody.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-red-400 text-xs">Lỗi tải dữ liệu</td></tr>';
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.DetailManager = new DetailManager();
    window.DetailManager.init();
});