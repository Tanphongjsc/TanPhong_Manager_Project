/**
 * File: static/js/lich_lam_viec/lich_lam_viec.js
 * Controller danh sách Thiết kế Lịch làm việc
 */
class LichLamViecController {
    constructor() {
        this.apiUrls = {
            list: '/hrm/lich-lam-viec/api/lich-lam-viec/list/',
            delete: (id) => `/hrm/lich-lam-viec/api/lich-lam-viec/${id}/delete/`, // API delete dùng chung logic
        };
        this.tableManager = null;
        
        // Map số ngày sang tên hiển thị (0: T2, 1: T3... tùy convention DB của bạn)
        // Giả sử DB lưu: 0=Thứ 2, 1=Thứ 3... 6=CN
        this.dayMapping = {
            0: 'Thứ 2', 1: 'Thứ 3', 2: 'Thứ 4', 3: 'Thứ 5', 4: 'Thứ 6', 5: 'Thứ 7', 6: 'CN'
        };
    }

    init() {
        this.initTable();
    }

    initTable() {
        this.tableManager = new TableManager({
            tableBody: document.getElementById('table-body-lich'),
            paginationContainer: document.querySelector('.pagination-container'),
            searchInput: document.getElementById('search-lich'),
            filtersForm: document.getElementById('filter-lich'),
            
            // Bulk Actions
            enableBulkActions: true,
            selectAllCheckbox: document.getElementById('select-all-lich'),
            bulkActionsContainer: document.getElementById('bulk-actions-lich'),
            onBulkDelete: (ids) => this.handleBulkDelete(ids),

            // API
            apiEndpoint: this.apiUrls.list,
            
            // Render Row Callback
            onRenderRow: (item) => this.renderRow(item)
        });
    }

    renderRow(item) {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50 border-b border-slate-100 transition-colors group align-top'; // align-top để nội dung dài không bị xấu

        // URL edit (Redirect sang trang khác như yêu cầu)
        const editUrl = `/hrm/lich-lam-viec/thiet-ke-lich/lich-lam-viec/${item.id}/update/`;

        // --- CỘT 1: Tên Nhóm + Badge Mặc định ---
        let nameHtml = `<span class="text-sm font-semibold text-slate-900">${item.TenNhom || 'Chưa đặt tên'}</span>`;
        if (item.IsDefault) {
            nameHtml = `<div class="flex flex-col items-start gap-1">
                            <span class="text-green-600 font-medium text-sm">Nhóm mặc định</span>
                            <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-white border border-green-300 text-green-600 uppercase tracking-wide">Mặc định</span>
                        </div>`;
        }

        // --- CỘT 4: Xử lý hiển thị "Ca làm việc" (Phức tạp nhất) ---
        let shiftDetailsHtml = '';
        
        if (item.LoaiCa === 'Cố định' || item.LoaiCa === 'CO_DINH') {
            // Render list từng ngày giống ảnh
            if (item.ChiTietCa && item.ChiTietCa.length > 0) {
                const rows = item.ChiTietCa.map(detail => {
                    const dayName = this.dayMapping[detail.Ngay] || `Thứ ${detail.Ngay + 2}`;
                    
                    // Render các khung giờ (badges)
                    const timeBadges = detail.KhungGio.map(time => 
                        `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200 whitespace-nowrap">${time}</span>`
                    ).join('');

                    return `
                        <div class="flex items-start gap-2 mb-1.5 last:mb-0">
                            <span class="text-sm font-medium text-slate-700 w-16 shrink-0">${dayName} :</span>
                            <div class="flex flex-wrap items-center gap-2">
                                <span class="text-sm text-slate-600">${detail.TenCa}</span>
                                ${timeBadges}
                            </div>
                        </div>
                    `;
                }).join('');
                
                shiftDetailsHtml = `<div class="py-1">${rows}</div>`;
            } else {
                shiftDetailsHtml = '<span class="text-sm text-slate-400 italic">Chưa thiết lập chi tiết</span>';
            }
        } else {
            // Ca Lịch trình / Tự do
            shiftDetailsHtml = '<span class="text-sm text-slate-500">Ca lịch trình (Theo phân công)</span>';
        }

        // --- Render Row HTML ---
        // Lưu ý: Cột Checkbox và Delete ẩn nếu là Nhóm mặc định
        const checkboxHtml = item.IsDefault 
            ? '' 
            : `<input type="checkbox" class="row-checkbox w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer mt-1" data-id="${item.id}">`;

        const deleteBtnHtml = item.IsDefault
            ? ''
            : `<button type="button" class="delete-btn text-red-600 hover:text-red-900 transition-colors p-1" data-id="${item.id}" data-name="${item.TenNhom}" title="Xóa">
                    <svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                    </svg>
            </button>`;

        tr.innerHTML = `
            <td class="px-6 py-4 text-center w-10 align-top">${checkboxHtml}</td>
            <td class="px-6 py-4">
                <a href="${editUrl}" class="hover:text-blue-600 transition-colors block">
                    ${nameHtml}
                </a>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-500 font-mono mt-1">${item.MaNhom || '-'}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-600">${item.LoaiCa || '-'}</td>
            <td class="px-6 py-4 text-sm text-slate-600">${shiftDetailsHtml}</td>
            <td class="px-6 py-4 whitespace-nowrap text-center text-sm text-slate-600">
                ${item.SoNhanVien > 0 
                    ? `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">${item.SoNhanVien} nhân viên</span>` 
                    : '<span class="text-slate-400">0</span>'}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                <div class="flex items-center justify-end gap-3">
                    <a href="${editUrl}" class="text-blue-600 hover:text-blue-900 p-1 transition-colors" title="Sửa">
                        <svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
                        </svg>
                    </a>
                    ${deleteBtnHtml}
                </div>
            </td>
        `;

        // Bind delete event
        const deleteBtn = tr.querySelector('.delete-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => {
                this.handleDelete(item.id, item.TenNhom);
            });
        }

        return tr;
    }

    handleDelete(id, name) {
        AppUtils.DeleteOperations.confirmDelete({
            id: id,
            name: name,
            url: this.apiUrls.delete,
            onSuccess: () => this.tableManager.refresh()
        });
    }

    handleBulkDelete(ids) {
        AppUtils.DeleteOperations.confirmBulkDelete({
            ids: ids,
            url: this.apiUrls.delete,
            onSuccess: () => {
                this.tableManager.clearSelection();
                this.tableManager.refresh();
            }
        });
    }
}

// Init
window.LichLamViecController = new LichLamViecController();
document.addEventListener('DOMContentLoaded', () => window.LichLamViecController.init());