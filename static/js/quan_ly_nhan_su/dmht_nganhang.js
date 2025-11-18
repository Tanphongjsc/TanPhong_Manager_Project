/**
 * File: dmht_nganhang.js
 * Quản lý Danh mục Ngân hàng
 * Author: ThanhTrung2308
 * Updated: 2025-01-15
 */

class NganHangManager extends BaseCRUDManager {
    constructor() {
        super({
            sidebarId: 'nh-sidebar',
            overlayId: 'nh-sidebar-overlay',
            formId: 'nganhang-form',
            codeField: 'MaNganHang',
            nameField: 'TenNganHang',
            
            apiUrls: {
                detail: (id) => `/hrm/to-chuc-nhan-su/api/ngan-hang/${id}/detail/`,
                create: '/hrm/to-chuc-nhan-su/api/ngan-hang/create/',
                update: (id) => `/hrm/to-chuc-nhan-su/api/ngan-hang/${id}/update/`,
                delete: (id) => `/hrm/to-chuc-nhan-su/api/ngan-hang/${id}/delete/`,
                toggleStatus: (id) => `/hrm/to-chuc-nhan-su/api/ngan-hang/${id}/toggle-status/`,
            },
            
            tableColumns: 6,
            entityName: 'ngân hàng',
            createTitle: 'Thêm ngân hàng',
            editTitle: 'Chỉnh sửa ngân hàng',
            viewTitle: 'Chi tiết ngân hàng',
            deleteTitle: 'Xóa ngân hàng',
            deleteMessage: (name) => `Bạn có muốn xóa ngân hàng '${name}'?`,
            
            fillFormData: (data) => {
                const fieldMap = {
                    TenNganHang: data.TenNganHang || data.tennganhang || '',
                    MaNganHang: data.MaNganHang || data.manganhang || '',
                    TenVietTat: data.TenVietTat || data.tenviettat || '',
                    DiaChiChiNhanh: data.DiaChiChiNhanh || data.diachichinhanh || ''
                };
                
                Object.entries(fieldMap).forEach(([id, value]) => {
                    const field = document.getElementById(id);
                    if (field) field.value = value;
                });
            },
            
            createRowHTML: (data, formData) => {
                const item = {
                    id: data.id,
                    tennganhang: formData.get('TenNganHang'),
                    manganhang: formData.get('MaNganHang'),
                    tenviettat: formData.get('TenVietTat') || '-',
                    diachichinhanh: formData.get('DiaChiChiNhanh') || '-',
                    trangthai: 'active'
                };
                
                return `
                    <td class="px-6 py-4 whitespace-nowrap">
                        <a href="javascript:void(0);" data-id="${item.id}" class="view-link text-sm font-medium text-green-600 hover:text-green-700">
                            ${item.tennganhang}
                        </a>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-500">${item.manganhang}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-500">${item.tenviettat}</td>
                    <td class="px-6 py-4 text-sm text-slate-500">
                        <div class="max-w-xs truncate">${item.diachichinhanh}</div>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        <label class="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" class="sr-only peer status-toggle" data-id="${item.id}" checked>
                            <div class="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
                        </label>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button type="button" data-id="${item.id}" class="edit-btn text-blue-600 hover:text-blue-900 mr-3" title="Sửa">
                            <svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
                            </svg>
                        </button>
                        <button type="button" data-id="${item.id}" class="delete-btn text-red-600 hover:text-red-900" title="Xóa">
                            <svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                            </svg>
                        </button>
                    </td>
                `;
            }
        });
    }
    
    updateRowFromForm(itemId, formData) {
        const link = this.elements.tbody?.querySelector(`.view-link[data-id="${itemId}"]`);
        if (!link) return;
        
        const row = link.closest('tr');
        const cells = row.querySelectorAll('td');
        
        link.textContent = formData.get('TenNganHang') || '';
        if (cells[1]) cells[1].textContent = formData.get('MaNganHang') || '';
        if (cells[2]) cells[2].textContent = formData.get('TenVietTat') || '-';
        if (cells[3]) {
            const div = cells[3].querySelector('div');
            if (div) div.textContent = formData.get('DiaChiChiNhanh') || '-';
        }
    }
}

window.NganHangManager = {
    _instance: null,
    
    _getInstance() {
        if (!this._instance) {
            this._instance = new NganHangManager();
            this._instance.init();
        }
        return this._instance;
    },
    
    openSidebar(mode, itemId) {
        this._getInstance().openSidebar(mode, itemId);
    },
    
    init() {
        this._getInstance();
    }
};

document.addEventListener('DOMContentLoaded', () => {
    window.NganHangManager.init();
});