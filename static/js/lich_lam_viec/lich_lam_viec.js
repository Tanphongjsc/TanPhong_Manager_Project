/**
 * File: static/js/lich_lam_viec/lich_lam_viec.js
 * Controller danh sách Lịch Làm Việc
 */
class LichLamViecController {
    constructor() {
        this.apiUrls = {
            list: '/hrm/lich-lam-viec/api/lich-lam-viec/list/',
            delete: (id) => `/hrm/lich-lam-viec/api/lich-lam-viec/${id}/delete/`,
        };
        this.tableManager = null;
        this.dayNames = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'CN'];
    }

    init() {
        this.initTable();
        this.bindGlobalEvents();
    }

    // Bind sự kiện cho nút Xem thêm/Thu gọn (uỷ quyền sự kiện)
    bindGlobalEvents() {
        document.addEventListener('click', (e) => {
            if (e.target && e.target.classList.contains('btn-toggle-shift-view')) {
                e.preventDefault();
                const btn = e.target;
                const targetId = btn.dataset.target;
                const contentDiv = document.getElementById(targetId);
                
                if (contentDiv) {
                    const isHidden = contentDiv.classList.contains('hidden');
                    if (isHidden) {
                        contentDiv.classList.remove('hidden');
                        btn.innerHTML = '<i class="fas fa-chevron-up mr-1"></i>Thu gọn';
                    } else {
                        contentDiv.classList.add('hidden');
                        const count = btn.dataset.count;
                        btn.innerHTML = `<i class="fas fa-chevron-down mr-1"></i>Xem thêm (+${count})`;
                    }
                }
            }
        });
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
            
            // Render
            onRenderRow: (item) => this.renderRow(item)
        });
    }

    renderRow(item) {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50 border-b border-slate-100 transition-colors group';

        const editUrl = `/hrm/lich-lam-viec/thiet-ke-lich/lich-lam-viec/${item.id}/update/`;
        
        // Logic check mặc định
        const isDefault = item.IsDefault || item.MaNhom === 'NHOMMACDINH' || item.MaNhom === 'NHOM_MAC_DINH';

        // --- SỬA: Gom Tên và Badge vào 1 chuỗi HTML để xử lý layout ---
        let nameContent = `<span class="text-sm font-medium text-blue-600">${item.TenNhom || 'Chưa đặt tên'}</span>`;
        if (isDefault) {
            // Badge nằm cùng dòng
            nameContent += `<span class="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200">Mặc định</span>`;
        }

        // Render cột Ca làm việc
        let caHtml = '';
        if (item.LoaiCa === 'CO_DINH' || item.LoaiCa === 'Cố định') {
            caHtml = this.renderFixedSchedule(item.ChiTietCa, item.id);
        } else {
            caHtml = '<span class="text-slate-500 italic">Ca lịch trình</span>';
        }

        // Checkbox & Delete button (Ẩn nếu mặc định)
        const checkboxHtml = isDefault 
            ? '<td class="px-6 py-4 text-center w-10"></td>' 
            : `<td class="px-6 py-4 text-center w-10">
                <input type="checkbox" class="row-checkbox w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer" data-id="${item.id}">
               </td>`;

        const deleteBtnHtml = isDefault 
            ? '' 
            : `<button type="button" class="delete-btn text-red-600 hover:text-red-900 transition-colors p-1 rounded hover:bg-red-50" data-id="${item.id}" data-name="${item.TenNhom}" title="Xóa">
                    <svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                    </svg>
               </button>`;

        tr.innerHTML = `
            ${checkboxHtml}
            <td class="px-6 py-4">
                <div class="flex items-center">
                    <a href="${editUrl}" class="hover:text-blue-700 transition-colors flex items-center">
                        ${nameContent}
                    </a>
                </div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-500 font-mono">${item.MaNhom}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-500">${item.LoaiCa || '-'}</td>
            <td class="px-6 py-4">
                ${caHtml}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-center text-sm">
                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${item.SoNhanVien > 0 ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-500'}">
                    ${item.SoNhanVien}
                </span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                <div class="flex items-center justify-end gap-2">
                    <a href="${editUrl}" class="text-blue-600 hover:text-blue-900 transition-colors p-1 rounded hover:bg-blue-50" title="Sửa">
                        <svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
                        </svg>
                    </a>
                    ${deleteBtnHtml}
                </div>
            </td>
        `;

        if (deleteBtnHtml) {
            const deleteBtn = tr.querySelector('.delete-btn');
            if (deleteBtn) deleteBtn.addEventListener('click', () => this.handleDelete(item.id, item.TenNhom));
        }

        return tr;
    }

    _renderDayRowHtml(dayData, hasBorder = true) {
        const dayName = this.dayNames[dayData.Ngay] || `Ngày ${dayData.Ngay}`;
        const shifts = dayData.DanhSachCa || [];
        
        let shiftsHtml = shifts.map(shift => {
            const timeSlots = (shift.KhungGio || []).map(t => 
                `<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200">${t}</span>`
            ).join('');
            
            return `<div class="flex items-center gap-2 mb-1 last:mb-0">
                <span class="text-sm font-medium text-slate-900">${shift.TenCa}</span>
                ${timeSlots}
            </div>`;
        }).join('');

        // SỬA:
        // 1. Thêm 'py-2': Tạo khoảng cách đều trên/dưới cho MỌI dòng (quan trọng nhất để đều nhau)
        // 2. Xử lý border-b dựa trên tham số hasBorder truyền vào thay vì CSS last:child (vì cấu trúc DOM lồng nhau phức tạp)
        const borderClass = hasBorder ? 'border-b border-slate-100' : '';

        return `<div class="flex items-start gap-4 py-2 ${borderClass}">
            <span class="text-sm font-semibold text-slate-500 w-20 shrink-0 pt-0.5 select-none">${dayName}</span>
            <div class="flex flex-col w-full">
                ${shiftsHtml}
            </div>
        </div>`;
    }

    // Render cột ca với chức năng Xem thêm
    renderFixedSchedule(details, itemId) {
        if (!details || details.length === 0) {
            return '<span class="text-xs text-slate-400 italic">Chưa thiết lập</span>';
        }

        details.sort((a, b) => a.Ngay - b.Ngay);

        const firstDay = details[0];
        const otherDays = details.slice(1);
        const hasMore = otherDays.length > 0;
        const hiddenDivId = `shifts-more-${itemId}`;

        // SỬA: Bỏ 'gap-1', chỉ dùng flex-col để xếp chồng khít nhau
        let html = '<div class="flex flex-col w-full">'; 
        
        // 1. Ngày đầu tiên (Thứ 2)
        // Luôn hiển thị border dưới nếu còn các ngày sau
        html += this._renderDayRowHtml(firstDay, hasMore);

        // 2. Các ngày còn lại
        if (hasMore) {
            // SỬA: Bỏ 'mt-1', bỏ 'gap-1', bỏ các class padding thừa
            html += `<div id="${hiddenDivId}" class="hidden flex flex-col w-full">`;
            otherDays.forEach((day, index) => {
                // Check xem có phải phần tử cuối cùng của list ẩn không để bỏ border
                const isLast = index === otherDays.length - 1;
                html += this._renderDayRowHtml(day, !isLast);
            });
            html += `</div>`;

            // 3. Nút Toggle
            html += `
                <div class="pt-1.5">
                    <button type="button" 
                        class="btn-toggle-shift-view text-[11px] font-medium text-blue-600 hover:text-blue-800 hover:underline transition-colors flex items-center" 
                        data-target="${hiddenDivId}"
                        data-count="${otherDays.length}">
                        <i class="fas fa-chevron-down mr-1"></i>Xem thêm (+${otherDays.length})
                    </button>
                </div>
            `;
        }

        html += '</div>';
        return html;
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

window.LichLamViecController = new LichLamViecController();
document.addEventListener('DOMContentLoaded', () => window.LichLamViecController.init());