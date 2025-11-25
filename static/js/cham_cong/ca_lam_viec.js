/**
 * File: static/js/cham_cong/ca_lam_viec.js
 * Quản lý màn hình Thiết kế Ca làm việc
 */

class CaLamViecManager extends BaseCRUDManager {
    constructor() {
        super({
            // Các ID này phải khớp với file HTML ca_lam_viec.html
            sidebarId: 'ca-sidebar',
            overlayId: 'ca-sidebar-overlay',
            formId: 'ca-form',
            codeField: 'MaCa', // Field dùng để validate mã (unique)

            // Định nghĩa API (Bạn cần viết backend trả về JSON cho các url này sau)
            apiUrls: {
                list: '/cham-cong/api/ca-lam-viec/list/', 
                detail: (id) => `/cham-cong/api/ca-lam-viec/${id}/detail/`,
                create: '/cham-cong/api/ca-lam-viec/create/',
                update: (id) => `/cham-cong/api/ca-lam-viec/${id}/update/`,
                delete: (id) => `/cham-cong/api/ca-lam-viec/${id}/delete/`,
                toggleStatus: (id) => `/cham-cong/api/ca-lam-viec/${id}/toggle-status/`,
            },
            
            entityName: 'ca làm việc',
            
            // Callback reload bảng sau khi thêm/sửa/xóa thành công
            onRefreshTable: () => this.tableManager && this.tableManager.refresh(),

            // Logic điền dữ liệu vào form khi bấm Sửa (Edit)
            fillFormData: (data) => {
                const form = document.getElementById('ca-form');
                if (!form) return;
                
                // Mapping dữ liệu từ JSON API vào input form
                form.querySelector('[name="TenCa"]').value = data.TenCa || '';
                form.querySelector('[name="MaCa"]').value = data.MaCa || '';
                form.querySelector('[name="GioBatDau"]').value = data.GioBatDau || '';
                form.querySelector('[name="GioKetThuc"]').value = data.GioKetThuc || '';
                form.querySelector('[name="GhiChu"]').value = data.GhiChu || '';
                
                // Xử lý checkbox/radio nếu có (ví dụ: Có nghỉ trưa)
                if(form.querySelector('[name="CoNghiTrua"]')) {
                    form.querySelector('[name="CoNghiTrua"]').checked = data.CoNghiTrua || false;
                }
            }
        });
        
        this.tableManager = null;
    }

    init() {
        super.init(); // Gọi hàm init của cha để khởi tạo Sidebar, Event Listeners
        this.initTable(); // Khởi tạo bảng dữ liệu
    }

    initTable() {
        this.tableManager = new TableManager({
            tableBody: document.getElementById('table-body-ca'),
            paginationContainer: document.querySelector('.pagination-container'),
            searchInput: document.getElementById('search-ca'),
            filtersForm: document.getElementById('filter-ca'),
            selectAllCheckbox: document.getElementById('select-all-checkbox'),
            bulkActionsContainer: document.getElementById('bulk-actions-ca'),
            
            enableBulkActions: true,
            apiEndpoint: this.config.apiUrls.list, // Gọi API list đã định nghĩa ở trên

            // Hàm render từng dòng dữ liệu ra bảng HTML
            onRenderRow: (item) => {
                const tr = document.createElement('tr');
                tr.className = 'hover:bg-slate-50 border-b border-slate-100 transition-colors';
                
                // HTML Status Toggle (Tái sử dụng style của bạn)
                const statusHtml = `
                    <label class="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" class="sr-only peer status-toggle" data-id="${item.id}" ${item.TrangThai === 'active' ? 'checked' : ''}>
                        <div class="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
                    </label>
                `;

                tr.innerHTML = `
                    <td class="px-6 py-4 text-center">
                        <input type="checkbox" class="row-checkbox w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer" data-id="${item.id}">
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        <a href="javascript:void(0);" onclick="window.CaLamViecManager.openSidebar('edit', ${item.id})" class="text-sm font-medium text-blue-600 hover:text-blue-800">
                            ${item.TenCa}
                        </a>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-500 font-mono">${item.MaCa}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-700">
                        ${item.GioBatDau} - ${item.GioKetThuc}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-center text-sm">
                        ${item.CoNghiTrua ? '<i class="fas fa-check text-green-500"></i>' : '<span class="text-slate-300">-</span>'}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        ${statusHtml}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button type="button" class="delete-btn text-red-600 hover:text-red-900 ml-3" data-id="${item.id}" data-name="${item.TenCa}" title="Xóa">
                            <i class="far fa-trash-alt"></i>
                        </button>
                    </td>
                `;
                return tr;
            }
        });
    }
}

// Khởi tạo Manager và gắn vào window để gọi được từ HTML (onclick)
window.CaLamViecManager = new CaLamViecManager();
document.addEventListener('DOMContentLoaded', () => window.CaLamViecManager.init());