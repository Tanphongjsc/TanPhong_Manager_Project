/**
 * File: static/js/cham_cong/ca_lam_viec.js
 * Controller danh sách Ca Làm Việc
 * Sử dụng: TableManager + AppUtils.DeleteOperations
 */
class CaLamViecController {
    constructor() {
        this. apiUrls = {
            list: '/hrm/lich-lam-viec/api/ca-lam-viec/list/',
            delete: (id) => `/hrm/lich-lam-viec/api/ca-lam-viec/${id}/delete/`,
        };
        
        this.tableManager = null;
    }

    init() {
        this.initTable();
    }

    initTable() {
        this.tableManager = new TableManager({
            tableBody: document.getElementById('table-body-ca'),
            paginationContainer: document.querySelector('.pagination-container'),
            searchInput: document.getElementById('search-ca'),
            filtersForm: document.getElementById('filter-ca'),
            
            // Bulk Actions
            enableBulkActions: true,
            selectAllCheckbox: document.getElementById('select-all-ca'),
            bulkActionsContainer: document.getElementById('bulk-actions-ca'),
            onBulkDelete: (ids) => this.handleBulkDelete(ids),

            // API
            apiEndpoint: this.apiUrls.list,
            
            // Render
            onRenderRow: (item) => this.renderRow(item)
        });
    }

    renderRow(item) {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50 border-b border-slate-100 transition-colors group';

        const editUrl = `/hrm/lich-lam-viec/thiet-ke-lich/ca-lam-viec/${item.id}/update/`;
        const isSystemDefault = item.MaCa === 'CAHANHCHINH';

        // Tên + Badge
        let nameHtml = `<span class="text-sm font-medium text-slate-900">${item.TenCa || 'Chưa đặt tên'}</span>`;
        if (isSystemDefault) {
            nameHtml += `<span class="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 border border-green-200">Mặc định</span>`;
        }

        // Khung giờ
        let timeSlotsHtml = '<span class="text-xs text-slate-400 italic">Chưa thiết lập</span>';
        if (item.KhungGio && item.KhungGio.length > 0) {
            timeSlotsHtml = `<div class="flex flex-wrap gap-2">
                ${item.KhungGio.map(slot => 
                    `<span class="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">${slot}</span>`
                ).join('')}
            </div>`;
        }

        // Ẩn checkbox và nút xóa với ca mặc định
        const checkboxHtml = isSystemDefault 
            ? '' 
            : `<input type="checkbox" class="row-checkbox w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer" data-id="${item.id}">`;

        // FIX LỖI SVG Ở ĐÂY (Đã xóa khoảng trắng thừa trong path d)
        const deleteBtnHtml = isSystemDefault 
            ? '' 
            : `<button type="button" class="delete-btn text-red-600 hover:text-red-900 transition-colors" data-id="${item.id}" data-name="${item.TenCa}" title="Xóa">
                    <svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                    </svg>
            </button>`;

        tr.innerHTML = `
            <td class="px-6 py-4 text-center w-10">${checkboxHtml}</td>
            <td class="px-6 py-4 whitespace-nowrap">
                <a href="${editUrl}" class="text-slate-900 hover:text-blue-600 font-medium transition-colors">${nameHtml}</a>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-500 font-mono">${item.MaCa}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-600">${item.LoaiCa || '-'}</td>
            <td class="px-6 py-4">${timeSlotsHtml}</td>
            <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                <div class="flex items-center justify-end">
                    <a href="${editUrl}" class="text-blue-600 hover:text-blue-900 mr-3 transition-colors" title="Sửa">
                        <svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
                        </svg>
                    </a>
                    ${deleteBtnHtml}
                </div>
            </td>
        `;

        // Bind sự kiện xóa
        const deleteBtn = tr.querySelector('.delete-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => {
                this.handleDelete(item.id, item.TenCa);
            });
        }

        return tr;
    }

    /**
     * Xóa đơn lẻ - Gọi AppUtils. DeleteOperations
     */
    handleDelete(id, name) {
        AppUtils.DeleteOperations.confirmDelete({
            id: id,
            name: name,
            url: this.apiUrls.delete,
            onSuccess: () => this.tableManager.refresh()
        });
    }

    /**
     * Xóa nhiều - Gọi AppUtils. DeleteOperations
     */
    handleBulkDelete(ids) {
        AppUtils.DeleteOperations.confirmBulkDelete({
            ids: ids,
            url: this.apiUrls.delete,
            onSuccess: () => {
                this.tableManager.clearSelection();
                this. tableManager.refresh();
            }
        });
    }
}

// Export và Init
window.CaLamViecController = new CaLamViecController();
document.addEventListener('DOMContentLoaded', () => window.CaLamViecController.init());