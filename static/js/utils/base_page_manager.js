/**
 * BasePageManager
 * Dùng cho các màn hình CRUD dạng chuyển trang (Redirect)
 * - Quản lý TableManager
 * - Quản lý Xóa (Delete) và Xóa nhiều (Bulk Delete)
 */
class BasePageManager {
    constructor(config) {
        if (typeof AppUtils === 'undefined' || typeof TableManager === 'undefined') {
            throw new Error('Cần load utils.js và TableManager.js trước!');
        }

        // Config mặc định
        this.config = {
            // IDs
            tableBodyId: 'table-body',
            paginationId: '.pagination-container',
            searchId: 'search-input',
            filterFormId: 'filter-form',
            selectAllId: 'select-all',
            bulkActionsId: 'bulk-actions',
            
            // APIs
            apiUrls: {
                list: '',
                delete: (id) => '',
                bulkDelete: '' // Optional
            },

            // Callbacks
            onRenderRow: null, // Bắt buộc phải có
            ...config
        };

        this.tableManager = null;
    }

    init() {
        this.initTable();
    }

    initTable() {
        // Lấy các DOM Element dựa trên ID config
        const selectAllEl = document.getElementById(this.config.selectAllId);
        const bulkActionsEl = document.getElementById(this.config.bulkActionsId);

        this.tableManager = new TableManager({
            tableBody: document.getElementById(this.config.tableBodyId),
            paginationContainer: document.querySelector(this.config.paginationId),
            searchInput: document.getElementById(this.config.searchId),
            filtersForm: document.getElementById(this.config.filterFormId),
            
            // --- CẤU HÌNH BULK ACTIONS ---
            enableBulkActions: true, // Bật tính năng
            selectAllCheckbox: selectAllEl, // Truyền Element
            bulkActionsContainer: bulkActionsEl, // Truyền Element
            
            // Callback khi người dùng bấm nút "Xóa" trên thanh Bulk Actions
            // TableManager sẽ gọi hàm này và truyền danh sách IDs đã chọn
            onBulkDelete: (ids) => this.handleBulkDelete(ids),

            apiEndpoint: this.config.apiUrls.list,
            onRenderRow: this.config.onRenderRow
        });
    }

    /**
     * Hàm Xóa chuẩn (Gọi từ Child Class hoặc Onclick HTML)
     */
    handleDelete(id, name) {
        AppUtils.Modal.showConfirm({
            title: 'Xác nhận xóa',
            message: `Bạn có chắc chắn muốn xóa "${name}"?`,
            type: 'danger',
            confirmText: 'Xóa',
            onConfirm: async () => {
                try {
                    const url = this.config.apiUrls.delete(id);
                    const result = await AppUtils.API.post(url); // Giả sử dùng POST để xóa an toàn
                    
                    if (result.success) {
                        AppUtils.Notify.success('Xóa thành công!');
                        this.tableManager.refresh();
                    } else {
                        AppUtils.Notify.error(result.message || 'Lỗi khi xóa');
                    }
                } catch (err) {
                    AppUtils.Notify.error(err.message || 'Có lỗi xảy ra');
                }
            }
        });
    }

    /**
     * Hàm Xóa nhiều chuẩn
     */
    handleBulkDelete(ids) {
        const count = ids.length;
        AppUtils.Modal.showConfirm({
            title: 'Xóa nhiều',
            message: `Bạn có chắc chắn muốn xóa ${count} mục đã chọn?`,
            type: 'danger',
            confirmText: `Xóa ${count} mục`,
            onConfirm: async () => {
                try {
                    // Ưu tiên dùng API Bulk nếu có
                    if (this.config.apiUrls.bulkDelete) {
                        const result = await AppUtils.API.post(this.config.apiUrls.bulkDelete, { ids });
                        if (!result.success) throw new Error(result.message);
                    } else {
                        // Fallback: Gọi loop xóa từng cái (kém tối ưu hơn nhưng tiện)
                        const promises = ids.map(id => AppUtils.API.post(this.config.apiUrls.delete(id)));
                        await Promise.all(promises);
                    }

                    AppUtils.Notify.success(`Đã xóa ${count} bản ghi!`);
                    this.tableManager.clearSelection();
                    this.tableManager.refresh();

                } catch (err) {
                    console.error(err);
                    AppUtils.Notify.error('Có lỗi xảy ra khi xóa danh sách');
                }
            }
        });
    }
}

// Export global
window.BasePageManager = BasePageManager;