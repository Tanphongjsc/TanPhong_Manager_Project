/**
 * File: static/js/quan_ly_luong/che_do_luong.js
 * Controller danh sách Chế Độ Lương
 * Version: 3.0 - Không có chế độ mặc định, bổ sung business rules
 */
class CheDoLuongController {
    constructor() {
        this.apiUrls = {
            list: '/hrm/quan-ly-luong/api/che-do-luong/list/',
            checkDelete: (id) => `/hrm/quan-ly-luong/api/che-do-luong/${id}/check-delete/`,
            delete: (id) => `/hrm/quan-ly-luong/api/che-do-luong/${id}/delete/`,
            checkToggle: (id) => `/hrm/quan-ly-luong/api/che-do-luong/${id}/check-toggle/`,
            toggleStatus: (id) => `/hrm/quan-ly-luong/api/che-do-luong/${id}/toggle-status/`,
        };
        this.tableManager = null;
    }

    init() {
        this.initTable();
        this.bindGlobalEvents();
    }

    bindGlobalEvents() {
        document.addEventListener('change', (e) => {
            if (e.target && e.target.classList.contains('status-toggle')) {
                this.handleStatusToggle(e.target);
            }
        });
    }

    initTable() {
        this.tableManager = new TableManager({
            tableBody: document.getElementById('table-body-che-do-luong'),
            paginationContainer: document.querySelector('.pagination-container'),
            searchInput: document.getElementById('search-che-do-luong'),
            filtersForm: document.getElementById('filter-che-do-luong'),
            
            enableBulkActions: true,
            selectAllCheckbox: document.getElementById('select-all-che-do-luong'),
            bulkActionsContainer: document.getElementById('bulk-actions-che-do-luong'),
            onBulkDelete: (ids) => this.handleBulkDelete(ids),
            
            apiEndpoint: this.apiUrls.list,
            onRenderRow: (item) => this.renderRow(item)
        });
    }

    renderRow(item) {
        const tr = document.createElement('tr');
        tr.className = 'border-b border-slate-100 transition-colors group';

        const editUrl = `/hrm/quan-ly-luong/che-do-luong/${item.id}/update/`;

        // Checkbox
        const checkboxHtml = `
            <td class="px-6 py-4 text-center w-10">
                <input type="checkbox" class="row-checkbox w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer" data-id="${item.id}">
            </td>`;

        // Số đối tượng áp dụng (tổng nhân viên + phòng ban)
        const totalApplied = (item.so_nhan_vien || 0) + (item.so_phong_ban || 0);

        // Status Toggle
        const statusHtml = `
            <label class="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" 
                    class="sr-only peer status-toggle" 
                    data-id="${item.id}"
                    data-name="${item.ten_che_do_luong}"
                    data-has-employees="${(item.so_nhan_vien || 0) > 0}"
                    data-has-depts="${(item.so_phong_ban || 0) > 0}"
                    data-has-payrolls="${item.has_payrolls || false}"
                    ${item.trang_thai === 'active' ? 'checked' : ''}>
                <div class="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>`;

        // Actions
        const editBtnHtml = `
            <a href="${editUrl}" class="text-blue-600 hover:text-blue-900 mr-3 transition-colors" title="Sửa">
                <svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
                </svg>
            </a>`;

        const deleteBtnHtml = `
            <button type="button" class="delete-btn text-red-600 hover:text-red-900 transition-colors" 
                data-id="${item.id}" 
                data-name="${item.ten_che_do_luong}"
                title="Xóa">
                <svg class="w-5 h-5 pointer-events-none" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                </svg>
            </button>`;

        // Badges for payrolls/rules
        let badgesHtml = '';
        if (item.has_payrolls) {
            badgesHtml += `<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-700 border border-purple-200 ml-2" title="Đã có bảng lương">
                <i class="fas fa-file-invoice-dollar"></i>
            </span>`;
        }
        if (item.has_rules) {
            badgesHtml += `<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-700 border border-green-200 ml-1" title="Có công thức">
                <i class="fas fa-calculator"></i>
            </span>`;
        }

        tr.innerHTML = `
            ${checkboxHtml}
            <td class="px-6 py-4">
                <div class="flex items-center">
                    <a href="${editUrl}" class="text-sm font-medium text-slate-900 hover:text-blue-600 transition-colors">${item.ten_che_do_luong || '-'}</a>
                    ${badgesHtml}
                </div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-500 font-mono">${item.ma_che_do_luong || '-'}</td>
            <td class="px-6 py-4 whitespace-nowrap text-center text-sm">
                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${totalApplied > 0 ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-500'}">
                    ${totalApplied}
                </span>
            </td>
            <td class="px-6 py-4 text-sm text-slate-600">
                <div class="max-w-xs truncate" title="${item.ghi_chu || ''}">${item.ghi_chu || '-'}</div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">${statusHtml}</td>
            <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                <div class="flex items-center justify-end">
                    ${editBtnHtml}
                    ${deleteBtnHtml}
                </div>
            </td>
        `;

        // Bind delete event
        const deleteBtn = tr.querySelector('.delete-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => {
                this.handleDelete(deleteBtn.dataset.id, deleteBtn.dataset.name);
            });
        }

        return tr;
    }

    // ============================================================
    // TOGGLE STATUS
    // ============================================================

    async handleStatusToggle(toggle) {
        const itemId = toggle.dataset.id;
        const itemName = toggle.dataset.name;
        const isActive = toggle.checked;
        const hasEmployees = toggle.dataset.hasEmployees === 'true';
        const hasDepts = toggle.dataset.hasDepts === 'true';
        const hasPayrolls = toggle.dataset.hasPayrolls === 'true';

        // Nếu muốn BẬT -> kiểm tra đơn giản
        if (isActive) {
            this.doToggleStatus(itemId, isActive, toggle);
            return;
        }

        // Nếu muốn TẮT -> cần kiểm tra điều kiện
        try {
            const checkRes = await AppUtils.API.get(this.apiUrls.checkToggle(itemId));
            
            if (!checkRes.data?.can_toggle) {
                // Không được phép tắt
                toggle.checked = true; // Rollback
                AppUtils.Modal.showConfirm({
                    title: 'Không thể tắt',
                    message: checkRes.data?.reason || 'Không thể tắt chế độ lương này',
                    type: 'warning',
                    confirmText: 'Đã hiểu',
                    cancelText: 'Đóng',
                    onConfirm: () => {}
                });
                return;
            }

            // Có cảnh báo -> hiển thị confirm
            if (checkRes.data?.warning) {
                AppUtils.Modal.showConfirm({
                    title: 'Cảnh báo',
                    message: checkRes.data.warning,
                    type: 'warning',
                    confirmText: 'Vẫn tắt',
                    onConfirm: () => this.doToggleStatus(itemId, isActive, toggle, true),
                    onCancel: () => { toggle.checked = true; }
                });
                return;
            }

            // Không có vấn đề -> toggle
            this.doToggleStatus(itemId, isActive, toggle);

        } catch (err) {
            toggle.checked = true;
            AppUtils.Notify.error(err.message || 'Có lỗi xảy ra');
        }
    }

    async doToggleStatus(itemId, isActive, toggle, force = false) {
        try {
            const res = await AppUtils.API.post(this.apiUrls.toggleStatus(itemId), {
                is_active: isActive,
                force: force
            });

            if (res.success) {
                AppUtils.Notify.success(res.message || `Đã ${isActive ? 'kích hoạt' : 'tắt'} chế độ lương`);
                this.tableManager.refresh();
            } else if (res.require_confirm) {
                // Cần confirm thêm
                toggle.checked = !isActive;
                AppUtils.Modal.showConfirm({
                    title: 'Cảnh báo',
                    message: res.warning,
                    type: 'warning',
                    confirmText: 'Vẫn tắt',
                    onConfirm: () => this.doToggleStatus(itemId, isActive, toggle, true),
                    onCancel: () => {}
                });
            } else {
                toggle.checked = !isActive;
                AppUtils.Notify.error(res.message || 'Có lỗi xảy ra');
            }
        } catch (err) {
            toggle.checked = !isActive;
            AppUtils.Notify.error(err.message || 'Có lỗi xảy ra');
        }
    }

    // ============================================================
    // DELETE
    // ============================================================

    async handleDelete(id, name) {
        try {
            // Gọi API check trước
            const checkRes = await AppUtils.API.get(this.apiUrls.checkDelete(id));
            const checkData = checkRes.data || {};

            if (!checkData.can_delete) {
                // Không được phép xóa
                AppUtils.Modal.showConfirm({
                    title: 'Không thể xóa',
                    message: checkData.reason,
                    type: 'warning',
                    confirmText: 'Đã hiểu',
                    cancelText: "Đóng",
                    onConfirm: () => {}
                });
                return;
            }

            // Xử lý theo delete_type
            switch (checkData.delete_type) {
                case 'soft':
                    // Soft delete với confirm
                    AppUtils.Modal.showConfirm({
                        title: 'Xác nhận xóa mềm',
                        message: `Chế độ lương "<strong>${name}</strong>" đã được sử dụng trong bảng lương.<br><br>
                                  Để bảo toàn dữ liệu lịch sử, hệ thống sẽ thực hiện <strong>xóa mềm</strong> (ẩn khỏi danh sách).<br><br>
                                  Bạn có đồng ý?`,
                        type: 'warning',
                        confirmText: 'Đồng ý xóa mềm',
                        onConfirm: () => this.doDelete(id, true)
                    });
                    break;

                case 'hard_with_rules':
                    // Hard delete nhưng cảnh báo về rules
                    AppUtils.Modal.showConfirm({
                        title: 'Xác nhận xóa',
                        message: `${checkData.reason}<br><br>Bạn có chắc chắn muốn xóa chế độ lương "<strong>${name}</strong>"?`,
                        type: 'danger',
                        confirmText: 'Xóa',
                        onConfirm: () => this.doDelete(id, false)
                    });
                    break;

                case 'hard':
                default:
                    // Hard delete bình thường
                    AppUtils.DeleteOperations.confirmDelete({
                        id: id,
                        name: name,
                        url: this.apiUrls.delete,
                        onSuccess: () => this.tableManager.refresh()
                    });
                    break;
            }

        } catch (err) {
            AppUtils.Notify.error(err.message || 'Có lỗi xảy ra');
        }
    }

    async doDelete(id, softDelete = false) {
        try {
            const res = await AppUtils.API.post(this.apiUrls.delete(id), {
                soft_delete: softDelete
            });

            if (res.success) {
                AppUtils.Notify.success(res.message || 'Xóa thành công');
                this.tableManager.refresh();
            } else {
                AppUtils.Notify.error(res.message || 'Có lỗi xảy ra');
            }
        } catch (err) {
            AppUtils.Notify.error(err.message || 'Có lỗi xảy ra');
        }
    }

    handleBulkDelete(ids) {
        AppUtils.Modal.showConfirm({
            title: 'Xác nhận xóa nhiều',
            message: `Bạn đang xóa <strong>${ids.length} chế độ lương</strong>.<br><br>
                     Hệ thống sẽ tự động:<br>
                     - <strong>Xóa mềm</strong> những chế độ đã có bảng lương<br>
                     - <strong>Từ chối xóa</strong> những chế độ còn nhân viên/phòng ban<br><br>
                     Bạn có đồng ý?`,
            type: 'danger',
            confirmText: `Xóa ${ids.length} mục`,
            onConfirm: () => {
                AppUtils.DeleteOperations.confirmBulkDelete({
                    ids: ids,
                    url: this.apiUrls.delete,
                    onSuccess: () => {
                        this.tableManager.clearSelection();
                        this.tableManager.refresh();
                    }
                });
            }
        });
    }
}

window.CheDoLuongController = new CheDoLuongController();
document.addEventListener('DOMContentLoaded', () => window.CheDoLuongController.init());