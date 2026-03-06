/**
 * File: static/js/quan_ly_luong/bang_luong.js
 * Controller cho Bảng lương
 * Version: 2.1 - Thêm click vào dòng để xem phiếu lương
 */

class BangLuongManager extends BaseCRUDManager {
    constructor() {
        super({
            sidebarId: 'bang-luong-sidebar',
            overlayId: 'bang-luong-sidebar-overlay',
            formId: 'bang-luong-form',
            
            apiUrls: {
                detail: (id) => `/hrm/quan-ly-luong/api/bang-luong/${id}/detail/`,
                create: '/hrm/quan-ly-luong/api/bang-luong/create/',
                update: (id) => `/hrm/quan-ly-luong/api/bang-luong/${id}/update/`,
                delete: (id) => `/hrm/quan-ly-luong/api/bang-luong/${id}/delete/`,
                getOptions: '/hrm/quan-ly-luong/api/bang-luong/get-options/',
            },
            
            // URL phiếu lương
            phieuLuongUrl: (bangLuongId) => `/hrm/quan-ly-luong/phieu-luong/${bangLuongId}/`,
            
            texts: {
                entityName: 'bảng lương',
                createTitle: 'Thêm mới bảng lương',
                editTitle: 'Chỉnh sửa bảng lương',
            },
            
            onRefreshTable: () => this.tableManager?.refresh(),
            onBeforeOpen: (mode) => {}, // ✅ Không dùng, xử lý riêng trong openSidebar
            onAfterClose: () => this.resetForm(),
            
            // ✅ Không dùng fillFormData mặc định của BaseCRUDManager
            fillFormData: null,
            getFormData: (form) => this.getFormData(form),
        });
        
        // BaseCRUDManager only copies known config fields, so ensure
        // `phieuLuongUrl` is available on `this.config` at runtime.
        if (!this.config.phieuLuongUrl) {
            this.config.phieuLuongUrl = (bangLuongId) => `/hrm/quan-ly-luong/phieu-luong/${bangLuongId}/`;
        }

        this.tableManager = null;
        this.optionsData = null;
        this.pendingEditData = null; // ✅ Lưu data edit tạm
    }

    init() {
        super.init();
        this.initTable();
    }

    // ============================================================
    // TABLE
    // ============================================================
    initTable() {
        this.tableManager = new TableManager({
            tableBody: document.getElementById('table-body-bang-luong'),
            paginationContainer: document.querySelector('.pagination-container'),
            searchInput: document.getElementById('search-bang-luong'),
            filtersForm: document.getElementById('filter-form-bang-luong'),
            
            enableBulkActions: true,
            selectAllCheckbox: document.getElementById('select-all-bang-luong'),
            bulkActionsContainer: document.getElementById('bulk-actions-bang-luong'),
            onBulkDelete: (ids) => this.deleteMultipleItems(ids),
            
            apiEndpoint: '/hrm/quan-ly-luong/api/bang-luong/list/',
            onRenderRow: (item) => this.renderRow(item)
        });
        
        // Bind events cho nút Edit/Delete trong table
        this.bindTableButtonEvents();
    }

    /**
     * Bind events cho các nút trong table (Edit, Delete)
     * Sử dụng event delegation để xử lý các nút được render động
     */
    bindTableButtonEvents() {
        const tableBody = document.getElementById('table-body-bang-luong');
        if (!tableBody) return;
        
        tableBody.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;
            
            const action = btn.dataset.action;
            const id = btn.dataset.id;
            
            if (action === 'edit' && id && !btn.disabled) {
                e.stopPropagation(); // Ngăn row click
                this.openSidebar('edit', parseInt(id, 10));
            }
            // Delete đã được xử lý bởi BaseCRUDManager
        });
    }

    renderRow(item) {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50 border-b border-slate-100 transition-colors cursor-pointer';
        tr.dataset.id = item.id; // Lưu id để xử lý click
        
        const statusColors = {
            'draft': 'bg-slate-100 text-slate-600',
            'processing': 'bg-blue-100 text-blue-700',
            'calculated': 'bg-purple-100 text-purple-700',
            'approved': 'bg-green-100 text-green-700',
            'paid': 'bg-emerald-100 text-emerald-700',
            'cancelled': 'bg-red-100 text-red-700',
        };
        const statusClass = statusColors[item.trang_thai] || 'bg-slate-100 text-slate-600';
        
        const editDisabled = !item.can_edit;
        const deleteDisabled = !item.can_delete;
        
        tr.innerHTML = `
            <td class="px-4 py-4 text-center" data-action="checkbox">
                <input type="checkbox" 
                       class="row-checkbox w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer" 
                       data-id="${item.id}"
                       ${deleteDisabled ? 'disabled' : ''}>
            </td>
            <td class="px-4 py-4 whitespace-nowrap">
                <span class="text-sm font-mono text-slate-600">${item.ma_bang_luong || '-'}</span>
            </td>
            <td class="px-4 py-4">
                <span class="text-sm font-semibold text-slate-900">${item.ten_bang_luong || '-'}</span>
            </td>
            <td class="px-4 py-4 whitespace-nowrap">
                <span class="text-sm text-slate-600">${item.ky_luong_display || '-'}</span>
            </td>
            <td class="px-4 py-4 whitespace-nowrap">
                <span class="text-sm text-slate-600">${item.che_do_luong_display || '-'}</span>
            </td>
            <td class="px-4 py-4 whitespace-nowrap text-center">
                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                    ${item.tong_so_nhan_vien || 0}
                </span>
            </td>
            <td class="px-4 py-4 whitespace-nowrap">
                <span class="text-sm text-slate-600">${item.ngay_tao || '-'}</span>
            </td>
            <td class="px-4 py-4 whitespace-nowrap text-center">
                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusClass}">
                    ${item.trang_thai_display || 'Nháp'}
                </span>
            </td>
            <td class="px-4 py-4 whitespace-nowrap text-right text-sm font-medium" data-action="buttons">
                <div class="flex items-center justify-end gap-2">
                    <button type="button" 
                            data-action="edit"
                            data-id="${item.id}"
                            class="text-blue-600 hover:text-blue-900 p-1 rounded hover:bg-blue-50 transition-colors ${editDisabled ? 'opacity-50 cursor-not-allowed' : ''}"
                            ${editDisabled ? 'disabled title="Không thể sửa bảng lương này"' : 'title="Sửa"'}>
                        <svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
                        </svg>
                    </button>
                    <button type="button" 
                            class="delete-btn text-red-600 hover:text-red-900 p-1 rounded hover:bg-red-50 transition-colors ${deleteDisabled ? 'opacity-50 cursor-not-allowed' : ''}"
                            data-id="${item.id}" 
                            data-name="${item.ten_bang_luong || 'Bảng lương'}"
                            data-action="delete"
                            ${deleteDisabled ? 'disabled title="Không thể xóa bảng lương này"' : 'title="Xóa"'}>
                        <svg class="w-5 h-5 pointer-events-none" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                        </svg>
                    </button>
                </div>
            </td>
        `;
        
        // Thêm event click vào dòng để redirect sang phiếu lương
        tr.addEventListener('click', (e) => this.handleRowClick(e, item.id));
        
        return tr;
    }

    /**
     * Xử lý click vào dòng - redirect sang trang phiếu lương
     * Bỏ qua nếu click vào checkbox, nút edit, nút delete
     */
    handleRowClick(e, bangLuongId) {
        const target = e.target;
        const td = target.closest('td');
        
        // Bỏ qua nếu click vào checkbox hoặc các nút action
        if (td?.dataset.action === 'checkbox' || td?.dataset.action === 'buttons') {
            return;
        }
        
        // Bỏ qua nếu click vào input, button, hoặc các phần tử có data-action
        if (target.closest('input') || target.closest('button') || target.closest('[data-action]')) {
            return;
        }
        
        // Redirect sang trang phiếu lương
        this.navigateToPhieuLuong(bangLuongId);
    }

    /**
     * Chuyển hướng đến trang phiếu lương
     */
    navigateToPhieuLuong(bangLuongId) {
        const url = this.config.phieuLuongUrl(bangLuongId);
        window.location.href = url;
    }

    // ============================================================
    // ✅ OVERRIDE: openSidebar để xử lý đúng thứ tự load cho Edit
    // ============================================================
    async openSidebar(mode, itemId = null) {
        this.state.currentMode = mode;
        this.state.currentItemId = itemId;
        this.pendingEditData = null;
        
        // Reset form trước
        if (this.elements.form) {
            this.elements.form.reset();
        }
        
        // Cấu hình UI
        const isEdit = mode === 'edit';
        this.uiHandler.setTitle(isEdit ? this.config.texts.editTitle : this.config.texts.createTitle);
        
        if (this.elements.submitBtn) {
            this.elements.submitBtn.textContent = isEdit ? 'Lưu' : 'Thêm';
        }
        
        // Mở sidebar trước
        this.uiHandler.open();
        
        if (isEdit && itemId) {
            // ✅ EDIT MODE: Load detail trước, sau đó load options với tháng/năm của kỳ lương
            await this.loadItemDataForEdit(itemId);
        } else {
            // ✅ CREATE MODE: Load options theo tháng hiện tại
            await this.loadOptions();
        }
    }

    // ============================================================
    // ✅ MỚI: Load data cho Edit mode - đảm bảo đúng thứ tự
    // ============================================================
    async loadItemDataForEdit(itemId) {
        try {
            // Bước 1: Load chi tiết bảng lương
            const result = await AppUtils.API.get(this.config.apiUrls.detail(itemId));
            const data = result.data || result;
            
            // Lưu data để fill sau
            this.pendingEditData = data;
            
            // Bước 2: Xác định tháng/năm từ kỳ lương để load đúng options
            let month = new Date().getMonth() + 1;
            let year = new Date().getFullYear();
            
            if (data.ky_luong_display) {
                // Parse từ "01/2026"
                const parts = data.ky_luong_display.split('/');
                if (parts.length === 2) {
                    month = parseInt(parts[0], 10);
                    year = parseInt(parts[1], 10);
                }
            }
            
            // Bước 3: Load options với tháng/năm của kỳ lương đang edit
            await this.loadOptions(month, year);
            
            // Bước 4: Fill data SAU KHI options đã load xong
            this.fillFormData(this.pendingEditData);
            
        } catch (error) {
            console.error('⛔ Error loading data:', error);
            AppUtils.Notify.error(error.message || 'Có lỗi xảy ra khi tải dữ liệu');
        }
    }

    // ============================================================
    // OPTIONS LOADING
    // ============================================================
    async loadOptions(month = null, year = null) {
        try {
            const today = new Date();
            const targetMonth = month || (today.getMonth() + 1);
            const targetYear = year || today.getFullYear();
            
            const res = await AppUtils.API.get(this.config.apiUrls.getOptions, {
                month: targetMonth,
                year: targetYear
            });
            
            if (res.success && res.data) {
                this.optionsData = res.data;
                this.populateKyLuongDropdown(res.data.ky_luong || []);
                this.populateCheDoLuongDropdown(res.data.che_do_luong || []);
            }
        } catch (err) {
            console.error('Error loading options:', err);
            AppUtils.Notify.error('Không thể tải danh sách kỳ lương và chế độ lương');
        }
    }

    populateKyLuongDropdown(options) {
        const select = document.getElementById('input-ky-luong');
        if (!select) return;
        
        select.innerHTML = '<option value="">-- Chọn kỳ lương --</option>';
        
        if (options.length === 0) {
            const opt = document.createElement('option');
            opt.disabled = true;
            opt.textContent = 'Không có kỳ lương nào trong tháng này';
            select.appendChild(opt);
            return;
        }
        
        options.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt.id;
            option.textContent = opt.display; // Backend đã format sẵn: "01/2026"
            select.appendChild(option);
        });
    }

    populateCheDoLuongDropdown(options) {
        const select = document.getElementById('input-che-do-luong');
        if (!select) return;
        
        select.innerHTML = '<option value="">-- Chọn chế độ lương --</option>';
        
        options.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt.id;
            const soNV = opt.so_nhan_vien || 0;
            option.textContent = soNV > 0 
                ? `${opt.display} (${soNV})` 
                : opt.display;
            select.appendChild(option);
        });
    }

    // ============================================================
    // FORM HANDLING
    // ============================================================
    resetForm() {
        this.pendingEditData = null;
        
        const form = document.getElementById(this.config.formId);
        if (form) {
            form.reset();
        }
        
        const kyLuongSelect = document.getElementById('input-ky-luong');
        const cheDoLuongSelect = document.getElementById('input-che-do-luong');
        
        if (kyLuongSelect) kyLuongSelect.value = '';
        if (cheDoLuongSelect) cheDoLuongSelect.value = '';
    }

    fillFormData(data) {
        if (!data) return;
        
        // Fill tên bảng lương
        const tenInput = document.getElementById('input-ten-bang-luong');
        if (tenInput) {
            tenInput.value = data.ten_bang_luong || '';
        }
        
        // Fill kỳ lương
        const kyLuongSelect = document.getElementById('input-ky-luong');
        if (kyLuongSelect && data.ky_luong_id) {
            kyLuongSelect.value = data.ky_luong_id;
            
            // ✅ Kiểm tra nếu option không tồn tại trong dropdown thì thêm vào
            if (kyLuongSelect.value != data.ky_luong_id) {
                const opt = document.createElement('option');
                opt.value = data.ky_luong_id;
                opt.textContent = data.ky_luong_display || `Kỳ lương #${data.ky_luong_id}`;
                opt.selected = true;
                kyLuongSelect.appendChild(opt);
            }
        }
        
        // Fill chế độ lương
        const cheDoLuongSelect = document.getElementById('input-che-do-luong');
        if (cheDoLuongSelect && data.che_do_luong_id) {
            cheDoLuongSelect.value = data.che_do_luong_id;
            
            // ✅ Kiểm tra nếu option không tồn tại trong dropdown thì thêm vào
            if (cheDoLuongSelect.value != data.che_do_luong_id) {
                const opt = document.createElement('option');
                opt.value = data.che_do_luong_id;
                opt.textContent = data.che_do_luong_display || `Chế độ lương #${data.che_do_luong_id}`;
                opt.selected = true;
                cheDoLuongSelect.appendChild(opt);
            }
        }
    }

    getFormData(form) {
        return {
            ten_bang_luong: document.getElementById('input-ten-bang-luong')?.value?.trim() || '',
            ky_luong_id: document.getElementById('input-ky-luong')?.value || null,
            che_do_luong_id: document.getElementById('input-che-do-luong')?.value || null,
        };
    }
}

// Initialize
window.BangLuongManager = new BangLuongManager();
document.addEventListener('DOMContentLoaded', () => window.BangLuongManager.init());