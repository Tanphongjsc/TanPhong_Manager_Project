/**
 * File: dmht_nganhang.js
 * Updated: Tương thích BaseCRUDManager v2
 */

class NganHangManager extends BaseCRUDManager {
    constructor() {
        super({
            sidebarId: 'nh-sidebar',
            overlayId: 'nh-sidebar-overlay',
            formId: 'nganhang-form',
            codeField: 'MaNganHang',
            
            apiUrls: {
                detail: (id) => `/hrm/to-chuc-nhan-su/api/ngan-hang/${id}/detail/`,
                create: '/hrm/to-chuc-nhan-su/api/ngan-hang/create/',
                update: (id) => `/hrm/to-chuc-nhan-su/api/ngan-hang/${id}/update/`,
                delete: (id) => `/hrm/to-chuc-nhan-su/api/ngan-hang/${id}/delete/`,
                toggleStatus: (id) => `/hrm/to-chuc-nhan-su/api/ngan-hang/${id}/toggle-status/`,
            },
            entityName: 'ngân hàng',
            onRefreshTable: () => this.tableManager && this.tableManager.refresh(),
            
            // Map dữ liệu từ API vào Form (Edit Mode)
            fillFormData: (data) => {
                const form = document.getElementById('nganhang-form');
                if (!form) return;
                // Lưu ý: Key bên phải (data.XYZ) phải khớp với JSON trả về từ api_nganhang_detail
                form.querySelector('[name="TenNganHang"]').value = data.TenNganHang || '';
                form.querySelector('[name="MaNganHang"]').value = data.MaNganHang || '';
                form.querySelector('[name="TenVietTat"]').value = data.TenVietTat || '';
                form.querySelector('[name="DiaChiChiNhanh"]').value = data.DiaChiChiNhanh || '';
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
            enableBulkActions: true,
            onBulkDelete: (ids) => this.deleteMultipleItems(ids),
            apiEndpoint: '/hrm/to-chuc-nhan-su/api/ngan-hang/list/',
            
            onRenderRow: (item) => {
                const tr = document.createElement('tr');
                tr.className = 'hover:bg-slate-50 border-b border-slate-100 transition-colors';
                
                // HTML Status Toggle (Giống hệt component cũ của bạn)
                const statusHtml = `
                    <label class="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" 
                               class="sr-only peer status-toggle" 
                               data-id="${item.id}" 
                               ${item.TrangThai === 'active' ? 'checked' : ''}>
                        <div class="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
                    </label>
                `;

                tr.innerHTML = `
                    <td class="px-4 py-4 text-center">
                        <input type="checkbox" class="row-checkbox w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer" data-id="${item.id}">
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        <a href="javascript:void(0);" onclick="window.NganHangManager.openSidebar('edit', ${item.id})" class="text-sm font-medium text-green-600 hover:text-green-700">
                            ${item.TenNganHang}
                        </a>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-500">${item.MaNganHang}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-500">${item.TenVietTat || '-'}</td>
                    <td class="px-6 py-4 text-sm text-slate-500">
                        <div class="max-w-xs truncate" title="${item.DiaChiChiNhanh || ''}">${item.DiaChiChiNhanh || '-'}</div>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        ${statusHtml}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button type="button" onclick="window.NganHangManager.openSidebar('edit', ${item.id})" class="text-blue-600 hover:text-blue-900 mr-3" title="Sửa">
                            <svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" /></svg>
                        </button>
                        <button type="button" class="delete-btn text-red-600 hover:text-red-900" data-id="${item.id}" data-name="${item.TenNganHang}" title="Xóa">
                            <svg class="w-5 h-5 pointer-events-none" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
                        </button>
                    </td>
                `;
                return tr;
            }
        });
    }
}

window.NganHangManager = new NganHangManager();
document.addEventListener('DOMContentLoaded', () => window.NganHangManager.init());