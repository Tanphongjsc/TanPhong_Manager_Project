/**
 * File: dmht_loainhanvien.js
 * Updated: Tương thích BaseCRUDManager v2
 */

class LoaiNhanVienManager extends BaseCRUDManager {
    constructor() {
        super({
            sidebarId: 'lnv-sidebar',
            overlayId: 'lnv-sidebar-overlay',
            formId: 'loainhanvien-form',
            codeField: 'MaLoaiNV',
            
            apiUrls: {
                detail: (id) => `/hrm/to-chuc-nhan-su/api/loai-nhan-vien/${id}/detail/`,
                create: '/hrm/to-chuc-nhan-su/api/loai-nhan-vien/create/',
                update: (id) => `/hrm/to-chuc-nhan-su/api/loai-nhan-vien/${id}/update/`,
                delete: (id) => `/hrm/to-chuc-nhan-su/api/loai-nhan-vien/${id}/delete/`,
                toggleStatus: (id) => `/hrm/to-chuc-nhan-su/api/loai-nhan-vien/${id}/toggle-status/`,
            },
            
            entityName: 'loại nhân viên',
            onRefreshTable: () => this.tableManager && this.tableManager.refresh(),
            
            fillFormData: (data) => {
                const form = document.getElementById('loainhanvien-form');
                if (!form) return;
                form.querySelector('[name="TenLoaiNV"]').value = data.TenLoaiNV || '';
                form.querySelector('[name="MaLoaiNV"]').value = data.MaLoaiNV || '';
                form.querySelector('[name="GhiChu"]').value = data.GhiChu || '';
            }
        });
        this.tableManager = null;
    }

    init() {
        super.init();
        this.initTable();
    }

    initTable() {
        this.tableManager = new TableManager({
            tableBody: document.getElementById('table-body'),
            paginationContainer: document.querySelector('.pagination-container'),
            searchInput: document.getElementById('search-input'),
            filtersForm: document.getElementById('filter-form'),
            selectAllCheckbox: document.getElementById('select-all-checkbox'),
            bulkActionsContainer: document.getElementById('bulk-actions'),
            enableBulkActions: true, // Kích hoạt chức năng hành động hàng loạt 
            onBulkDelete: (ids) => this.deleteMultipleItems(ids),
            apiEndpoint: '/hrm/to-chuc-nhan-su/api/loai-nhan-vien/list/',
            
            onRenderRow: (item) => {
                const tr = document.createElement('tr');
                tr.className = 'hover:bg-slate-50 border-b border-slate-100 transition-colors';
                
                const isDefault = item.MaLoaiNV === 'NV';
                
                const checkboxHtml = isDefault ? '' : 
                    `<input type="checkbox" class="row-checkbox w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer" data-id="${item.id}">`;

                // Logic: Mặc định thì hiện Badge, còn lại hiện Toggle
                const statusHtml = isDefault 
                    ? `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Mặc định</span>`
                    : `<label class="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" 
                                   class="sr-only peer status-toggle" 
                                   data-id="${item.id}" 
                                   ${item.trangthai === 'active' ? 'checked' : ''}>
                            <div class="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
                       </label>`;

                const editAction = `<button type="button" onclick="window.LoaiNhanVienManager.openSidebar('edit', ${item.id})" class="text-blue-600 hover:text-blue-900 mr-3" title="Sửa"><svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" /></svg></button>`;
                
                const deleteAction = isDefault ? '' : 
                    `<button type="button" class="delete-btn text-red-600 hover:text-red-900" data-id="${item.id}" data-name="${item.TenLoaiNV}" title="Xóa"><svg class="w-5 h-5 pointer-events-none" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg></button>`;

                tr.innerHTML = `
                    <td class="px-4 py-4 text-center">${checkboxHtml}</td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        <a href="javascript:void(0);" onclick="window.LoaiNhanVienManager.openSidebar('edit', ${item.id})" class="text-sm font-medium text-green-600 hover:text-green-700">
                            ${item.TenLoaiNV}
                        </a>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-500">${item.MaLoaiNV}</td>
                    <td class="px-6 py-4 text-sm text-slate-500 max-w-xs truncate">${item.GhiChu || '-'}</td>
                    <td class="px-6 py-4 whitespace-nowrap">${statusHtml}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        ${editAction}
                        ${deleteAction}
                    </td>
                `;
                return tr;
            }
        });
    }
}

window.LoaiNhanVienManager = new LoaiNhanVienManager();
document.addEventListener('DOMContentLoaded', () => window.LoaiNhanVienManager.init());