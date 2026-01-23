/**
 * File: static/js/quan_ly_luong/che_do_luong.js
 * Controller danh sách Chế Độ Lương
 * Version: 2.0 - Business Rules + Soft Delete
 */
class CheDoLuongController {
    constructor() {
        this.apiUrls = {
            list: '/hrm/quan-ly-luong/api/che-do-luong/list/',
            delete: (id) => `/hrm/quan-ly-luong/api/che-do-luong/${id}/delete/`,
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
        const isDefault = item.is_default || item.ma_che_do_luong === 'CHE_DO_MAC_DINH';

        // Checkbox - Không cho chọn nếu là mặc định
        const checkboxHtml = isDefault 
            ? '<td class="px-6 py-4 text-center w-10"></td>'
            : `<td class="px-6 py-4 text-center w-10">
                <input type="checkbox" class="row-checkbox w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer" data-id="${item.id}">
            </td>`;

        // Nhân viên áp dụng - ✅ Font size giống ca làm việc
        let nhanVienHtml = '-';
        if (item.nhan_vien_ap_dung && Array.isArray(item.nhan_vien_ap_dung) && item.nhan_vien_ap_dung.length > 0) {
            nhanVienHtml = item.nhan_vien_ap_dung.map(nv => 
                `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200 mr-1 mb-1">${nv}</span>`
            ).join('');
        }

        // Status Toggle
        const statusHtml = isDefault 
            ? `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">Mặc định</span>`
            : `<label class="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" 
                       class="sr-only peer status-toggle" 
                       data-id="${item.id}"
                       data-name="${item.ten_che_do_luong}"
                       data-has-employees="${item.so_nhan_vien > 0}"
                       data-has-payrolls="${item.has_payrolls || false}"
                       ${item.trang_thai === 'active' || item.trang_thai === true ? 'checked' : ''}>
                <div class="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>`;

        // Actions
        const editBtnHtml = `<a href="${editUrl}" class="text-blue-600 hover:text-blue-900 mr-3 transition-colors" title="Sửa">
            <svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
            </svg>
        </a>`;

        const deleteBtnHtml = isDefault ?  '' : `<button type="button" class="delete-btn text-red-600 hover:text-red-900 transition-colors" 
            data-id="${item.id}" 
            data-name="${item.ten_che_do_luong}"
            data-has-employees="${item.so_nhan_vien > 0}"
            data-has-payrolls="${item.has_payrolls || false}"
            title="Xóa">
            <svg class="w-5 h-5 pointer-events-none" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
            </svg>
        </button>`;

        // ✅ Font size giống ca làm việc
        tr.innerHTML = `
            ${checkboxHtml}
            <td class="px-6 py-4">
                <div class="flex items-center gap-2">
                    <a href="${editUrl}" class="text-sm font-medium text-slate-900 hover:text-blue-600 transition-colors">${item.ten_che_do_luong || '-'}</a>
                    ${isDefault ? `<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-700 border border-green-200 uppercase">Mặc định</span>` : ''}
                </div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-500 font-mono">${item.ma_che_do_luong || '-'}</td>
            <td class="px-6 py-4">
                <div class="flex flex-wrap gap-1">${nhanVienHtml}</div>
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
        if (! isDefault) {
            const deleteBtn = tr.querySelector('.delete-btn');
            if (deleteBtn) {
                deleteBtn.addEventListener('click', () => {
                    this.handleDelete(
                        deleteBtn.dataset.id, 
                        deleteBtn.dataset.name,
                        deleteBtn.dataset.hasEmployees === 'true',
                        deleteBtn.dataset.hasPayrolls === 'true'
                    );
                });
            }
        }

        return tr;
    }

    /**
     * ✅ Toggle Status với Business Rules
     */
    handleStatusToggle(toggle) {
        const itemId = toggle.dataset.id;
        const itemName = toggle.dataset.name;
        const isActive = toggle.checked;
        const hasEmployees = toggle.dataset.hasEmployees === 'true';
        const hasPayrolls = toggle.dataset.hasPayrolls === 'true';

        // ✅ RULE 1: Nếu tắt và có nhân viên → Confirm chuyển về mặc định
        if (! isActive && hasEmployees) {
            AppUtils.Modal.showConfirm({
                title: 'Xác nhận tắt chế độ lương',
                message: `Chế độ lương "<strong>${itemName}</strong>" đang được áp dụng cho <strong>nhân viên/phòng ban</strong>.<br><br>
                         Khi tắt, các nhân viên sẽ được chuyển về <strong>Chế độ lương mặc định</strong>.<br><br>
                         Bạn có chắc chắn muốn tiếp tục?`,
                type: 'warning',
                confirmText: 'Đồng ý tắt',
                onConfirm: () => this.doToggleStatus(itemId, isActive, toggle),
                onCancel: () => { toggle.checked = true; }
            });
            return;
        }

        // ✅ RULE 2: Nếu tắt và có bảng lương → Cảnh báo
        if (!isActive && hasPayrolls) {
            AppUtils.Modal.showConfirm({
                title: 'Cảnh báo',
                message: `Chế độ lương "<strong>${itemName}</strong>" đã được sử dụng trong <strong>bảng lương</strong>.<br><br>
                         Tắt chế độ này có thể ảnh hưởng đến báo cáo lịch sử.<br><br>
                         Bạn vẫn muốn tiếp tục?`,
                type: 'warning',
                confirmText: 'Vẫn tắt',
                onConfirm: () => this.doToggleStatus(itemId, isActive, toggle),
                onCancel: () => { toggle.checked = true; }
            });
            return;
        }

        this.doToggleStatus(itemId, isActive, toggle);
    }

    doToggleStatus(itemId, isActive, toggle) {
        AppUtils.API.post(this.apiUrls.toggleStatus(itemId), {
            is_active: isActive
        }).then(res => {
            if (res.success) {
                AppUtils.Notify.success(res.message || `Đã ${isActive ? 'kích hoạt' : 'tắt'} chế độ lương`);
                this.tableManager.refresh(); // Refresh để cập nhật số nhân viên
            } else {
                toggle.checked = !isActive;
                AppUtils.Notify.error(res.message || 'Có lỗi xảy ra');
            }
        }).catch(err => {
            toggle.checked = !isActive;
            AppUtils.Notify.error(err.message || 'Có lỗi xảy ra');
        });
    }

    /**
     * ✅ Delete với Business Rules
     */
    handleDelete(id, name, hasEmployees, hasPayrolls) {
        // ✅ RULE 3: Có bảng lương → Không cho xóa cứng
        if (hasPayrolls) {
            AppUtils.Modal.showConfirm({
                title: 'Không thể xóa',
                message: `Chế độ lương "<strong>${name}</strong>" đã được sử dụng trong <strong>bảng lương</strong>.<br><br>
                         Để bảo toàn dữ liệu lịch sử, hệ thống sẽ thực hiện <strong>xóa mềm</strong> (ẩn khỏi danh sách).<br><br>
                         Bạn có đồng ý? `,
                type: 'warning',
                confirmText: 'Đồng ý xóa mềm',
                onConfirm: async () => {
                    try {
                        const res = await AppUtils.API.post(this.apiUrls.delete(id), { soft_delete: true });
                        if (res.success) {
                            AppUtils.Notify.success('Đã xóa mềm chế độ lương');
                            this.tableManager.refresh();
                        } else {
                            AppUtils.Notify.error(res.message || 'Có lỗi xảy ra');
                        }
                    } catch (err) {
                        AppUtils.Notify.error(err.message || 'Có lỗi xảy ra');
                    }
                }
            });
            return;
        }

        // ✅ RULE 4: Có nhân viên → Confirm chuyển về mặc định + xóa
        if (hasEmployees) {
            AppUtils.Modal.showConfirm({
                title:  'Xác nhận xóa',
                message: `Chế độ lương "<strong>${name}</strong>" đang được áp dụng cho <strong>nhân viên/phòng ban</strong>.<br><br>
                         Khi xóa, các nhân viên sẽ được chuyển về <strong>Chế độ lương mặc định</strong>.<br><br>
                         Bạn có chắc chắn muốn xóa?`,
                type: 'danger',
                confirmText: 'Xóa',
                onConfirm: () => {
                    AppUtils.DeleteOperations.confirmDelete({
                        id: id,
                        name: name,
                        url: this.apiUrls.delete,
                        onSuccess: () => this.tableManager.refresh()
                    });
                }
            });
            return;
        }

        // Normal delete
        AppUtils.DeleteOperations.confirmDelete({
            id: id,
            name:  name,
            url: this.apiUrls.delete,
            onSuccess: () => this.tableManager.refresh()
        });
    }

    handleBulkDelete(ids) {
        AppUtils.Modal.showConfirm({
            title: 'Xác nhận xóa nhiều',
            message: `Bạn đang xóa <strong>${ids.length} chế độ lương</strong>.<br><br>
                     Hệ thống sẽ tự động: <br>
                     - <strong>Xóa mềm</strong> những chế độ đã có bảng lương<br>
                     - <strong>Chuyển nhân viên</strong> về chế độ mặc định nếu cần<br><br>
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