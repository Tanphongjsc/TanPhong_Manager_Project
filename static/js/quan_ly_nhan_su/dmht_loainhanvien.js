/**
 * File: dmht_loainhanvien.js
 * Quản lý Danh mục Loại Nhân Viên
 * Author: ThanhTrung2308
 * Updated: 2025-01-15
 */

class LoaiNhanVienManager extends BaseCRUDManager {
    constructor() {
        super({
            sidebarId: 'lnv-sidebar',
            overlayId: 'lnv-sidebar-overlay',
            formId: 'loainhanvien-form',
            codeField: 'MaLoaiNV',
            nameField: 'TenLoaiNV',
            
            apiUrls: {
                detail: (id) => `/hrm/to-chuc-nhan-su/api/loai-nhan-vien/${id}/detail/`,
                create: '/hrm/to-chuc-nhan-su/api/loai-nhan-vien/create/',
                update: (id) => `/hrm/to-chuc-nhan-su/api/loai-nhan-vien/${id}/update/`,
                delete: (id) => `/hrm/to-chuc-nhan-su/api/loai-nhan-vien/${id}/delete/`,
                toggleStatus: (id) => `/hrm/to-chuc-nhan-su/api/loai-nhan-vien/${id}/toggle-status/`,
            },
            
            tableColumns: 4,
            entityName: 'loại nhân viên',
            createTitle: 'Thêm loại nhân viên',
            editTitle: 'Chỉnh sửa loại nhân viên',
            viewTitle: 'Chi tiết loại nhân viên',
            deleteTitle: 'Xóa loại nhân viên',
            deleteMessage: (name) => `Bạn có muốn xóa loại nhân viên '${name}'?`,
            
            fillFormData: (data) => {
                const fieldMap = {
                    TenLoaiNV: data.TenLoaiNV || data.tenloainv || '',
                    MaLoaiNV: data.MaLoaiNV || data.maloainv || '',
                    GhiChu: data.GhiChu || data.ghichu || ''
                };
                
                Object.entries(fieldMap).forEach(([id, value]) => {
                    const field = document.getElementById(id);
                    if (field) field.value = value;
                });
            },
            
            createRowHTML: (data, formData) => {
                const item = {
                    id: data.id,
                    tenloainv: formData.get('TenLoaiNV'),
                    maloainv: formData.get('MaLoaiNV'),
                    trangthai: 'active'
                };
                
                return `
                    <td class="px-6 py-4 whitespace-nowrap">
                        <a href="javascript:void(0);" data-id="${item.id}" class="view-link text-sm font-medium text-green-600 hover:text-green-700">
                            ${item.tenloainv}
                        </a>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-500">${item.maloainv}</td>
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
}

window.LoaiNhanVienManager = {
    _instance: null,
    
    _getInstance() {
        if (!this._instance) {
            this._instance = new LoaiNhanVienManager();
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
    window.LoaiNhanVienManager.init();
});