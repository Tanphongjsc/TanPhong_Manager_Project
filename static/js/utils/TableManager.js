/**
 * TableManager - DANH SÁCH dữ liệu với phân trang SERVER-SIDE
 * @class TableManager
 * @role Quản lý hiển thị, phân trang, tìm kiếm SERVER-SIDE, bulk actions
 * @note KHÔNG làm CRUD - Chỉ hiển thị và tương tác với danh sách
 */
class TableManager {
    constructor(options) {
        if (typeof AppUtils === 'undefined') {
            throw new Error('AppUtils is required. Please load utils.js first.');
        }

        this.options = {
            tableBody: null,
            paginationContainer: null,
            searchInput: null,
            filtersForm: null,
            selectAllCheckbox: null,
            bulkActionsContainer: null,
            
            // API
            apiEndpoint: '',
            apiParams: {},
            
            // Pagination
            pageSize: 10,
            currentPage: 1,
            
            // Callbacks
            onRenderRow: null,
            onDataLoaded: null,
            onSelectionChange: null,
            onError: null,
            
            // Features
            enableBulkActions: false,
            enableSearch: true,
            enableFilters: true,
            searchDebounce: 400,
            
            ...options
        };

        // State
        this.state = {
            data: [],
            selectedItems: new Set(),
            totalPages: 1,
            totalItems: 0,
            hasNext: false,
            hasPrev: false,
            isLoading: false,
            currentController: null
        };

        this.eventManager = AppUtils.EventManager.create();
        this.debouncedSearch = null;
        this.init();
    }

    init() {
        this.setupEventListeners();
        if (this.options.apiEndpoint) {
            this.fetchData();
        }
    }

    setupEventListeners() {
        // Server-side search
        if (this.options.searchInput && this.options.enableSearch) {
            this.debouncedSearch = AppUtils.Helper.debounce(() => {
                this.options.currentPage = 1;
                this.fetchData();
            }, this.options.searchDebounce);

            this.eventManager.add(this.options.searchInput, 'input', this.debouncedSearch);
        }

        // Server-side filters
        if (this.options.filtersForm && this.options.enableFilters) {
            const inputs = this.options.filtersForm.querySelectorAll('select, input');
            inputs.forEach(input => {
                this.eventManager.add(input, 'change', () => {
                    this.options.currentPage = 1;
                    this.fetchData();
                });
            });
        }

        // Select all
        if (this.options.selectAllCheckbox && this.options.enableBulkActions) {
            this.eventManager.add(this.options.selectAllCheckbox, 'change', (e) => {
                this.handleSelectAll(e.target.checked);
            });
        }
        // Bulk Actions: Nút Bỏ chọn
        if (this.options.bulkActionsContainer) {
            const clearBtn = this.options.bulkActionsContainer.querySelector('#btn-clear-selection');
            if (clearBtn) {
                this.eventManager.add(clearBtn, 'click', (e) => {
                    e.preventDefault();
                    this.clearSelection(); // Gọi hàm có sẵn
                });
            }

            // Bulk Actions: Nút Xóa nhiều
            const deleteBtn = this.options.bulkActionsContainer.querySelector('#btn-bulk-delete');
            if (deleteBtn) {
                this.eventManager.add(deleteBtn, 'click', (e) => {
                    e.preventDefault();
                    const selectedIds = this.getSelectedItems();
                    
                    // Gọi callback onBulkDelete (được truyền từ bên ngoài vào)
                    if (this.options.onBulkDelete && selectedIds.length > 0) {
                        this.options.onBulkDelete(selectedIds);
                    }
                });
            }
            
            const exportBtn = this.options.bulkActionsContainer.querySelector('#btn-bulk-export');
            if (exportBtn) {
                this.eventManager.add(exportBtn, 'click', (e) => {
                    e.preventDefault();
                    const selectedIds = this.getSelectedItems();
                    
                    // Gọi callback onBulkExport nếu có
                    if (this.options.onBulkExport && selectedIds.length > 0) {
                        this.options.onBulkExport(selectedIds);
                    } else {
                        // Nếu user chưa chọn gì mà ấn export -> Có thể export hết hoặc báo lỗi tùy logic
                        AppUtils.Notify.warning('Vui lòng chọn ít nhất một bản ghi để xuất.');
                    }
                });
            }
        }
        // ---------------------------

        this.setupPagination();
    }

    setupPagination() {
        if (!this.options.paginationContainer) return;

        const prevBtn = this.options.paginationContainer.querySelector('.pagination-prev');
        const nextBtn = this.options.paginationContainer.querySelector('.pagination-next');
        const pageSizeSelect = this.options.paginationContainer.querySelector('.pagination-page-size');

        if (prevBtn) {
            this.eventManager.add(prevBtn, 'click', () => this.previousPage());
        }

        if (nextBtn) {
            this.eventManager.add(nextBtn, 'click', () => this.nextPage());
        }

        if (pageSizeSelect) {
            this.eventManager.add(pageSizeSelect, 'change', (e) => {
                this.options.pageSize = parseInt(e.target.value, 10);
                this.options.currentPage = 1;
                this.fetchData();
            });
        }
    }

    // ============================================================
    // SERVER-SIDE DATA FETCHING
    // ============================================================
    async fetchData() {
        // Abort previous request
        if (this.state.isLoading && this.state.currentController) {
            this.state.currentController.abort();
        }

        this.state.isLoading = true;
        this.state.currentController = new AbortController();
        this.showLoading();

        try {
            const params = {
                page: this.options.currentPage,
                page_size: this.options.pageSize,
                ...this.options.apiParams,
                ...this.getFilterParams()
            };

            const result = await AppUtils.API.get(
                this.options.apiEndpoint,
                params,
                { signal: this.state.currentController.signal }
            );

            this.handleDataResponse(result);

        } catch (error) {
            if (error.name !== 'AbortError') {
                this.handleError(error);
            }
        } finally {
            this.state.isLoading = false;
            this.state.currentController = null;
        }
    }

    getFilterParams() {
        const params = {};

        // Search
        if (this.options.searchInput?.value) {
            params.search = this.options.searchInput.value.trim();
        }

        // Filters
        if (this.options.filtersForm) {
            const formData = new FormData(this.options.filtersForm);
            for (const [key, value] of formData.entries()) {
                if (value) params[key] = value;
            }
        }

        return params;
    }

    handleDataResponse(result) {
        const data = result.data || [];
        const pagination = result.pagination || {
            page: 1,
            page_size: this.options.pageSize,
            total: data.length,
            total_pages: 1,
            has_next: false,
            has_prev: false
        };

        // 🔧 FIX: Auto-correct page nếu out of bounds
        if (pagination.page > pagination.total_pages && pagination.total_pages > 0) {
            this.options.currentPage = pagination.total_pages;
            this.fetchData();
            return;
        }

        // Update state
        this.state.data = data;
        this.state.totalItems = pagination.total;
        this.state.totalPages = pagination.total_pages;
        this.state.hasNext = pagination.has_next;
        this.state.hasPrev = pagination.has_prev;
        this.options.currentPage = pagination.page;

        // Render
        this.render();
        this.updatePagination(pagination);

        if (this.options.onDataLoaded) {
            this.options.onDataLoaded(data, pagination);
        }
    }

    handleError(error) {
        console.error('⛔ TableManager fetch error:', error);
        this.showEmpty('Không thể tải dữ liệu: ' + error.message);

        if (this.options.onError) {
            this.options.onError(error);
        } else {
            AppUtils.Notify.error(error.message);
        }
    }

    // ============================================================
    // RENDERING
    // ============================================================
    render() {
        if (!this.options.tableBody) return;

        this.options.tableBody.innerHTML = '';
        this.state.selectedItems.clear();
        this.updateBulkActions();

        if (this.state.data.length === 0) {
            this.showEmpty();
            return;
        }

        const fragment = document.createDocumentFragment();

        this.state.data.forEach(item => {
            const row = this.renderRow(item);
            if (row) fragment.appendChild(row);
        });

        this.options.tableBody.appendChild(fragment);
    }

    renderRow(item) {
        if (!this.options.onRenderRow) {
            console.warn('⚠️ TableManager: onRenderRow callback not provided');
            return null;
        }

        const row = this.options.onRenderRow(item);
        if (!row) return null;

        // Setup checkbox for bulk actions
        if (this.options.enableBulkActions) {
            const checkbox = row.querySelector('.row-checkbox');
            if (checkbox) {
                checkbox.dataset.id = item.id;
                this.eventManager.add(checkbox, 'change', () => {
                    this.handleItemCheckbox(checkbox);
                });
            }
        }

        return row;
    }

    showLoading() {
        if (!this.options.tableBody) return;

        const colSpan = this.options.tableBody.closest('table')
            ?.querySelector('thead tr')
            ?.children.length || 10;

        this.options.tableBody.innerHTML = `
            <tr>
                <td colspan="${colSpan}" class="px-6 py-10 text-center text-slate-500">
                    <div class="flex flex-col items-center justify-center">
                        <i class="fas fa-spinner fa-spin text-3xl text-blue-600 mb-3"></i>
                        <p class="font-medium">Đang tải dữ liệu...</p>
                    </div>
                </td>
            </tr>
        `;
    }

    showEmpty(message = 'Không tìm thấy dữ liệu') {
        if (!this.options.tableBody) return;

        const colSpan = this.options.tableBody.closest('table')
            ?.querySelector('thead tr')
            ?.children.length || 5;

        AppUtils.UI.renderEmptyState(this.options.tableBody, {
            message,
            colspan: colSpan,
            icon: 'default'
        });
    }

    // ============================================================
    // PAGINATION
    // ============================================================
    updatePagination(pagination) {
        if (!this.options.paginationContainer) return;

        const { total, page, total_pages, has_next, has_prev, page_size } = pagination;
        const pageSize = page_size || this.options.pageSize;
        const start = total > 0 ? (page - 1) * pageSize + 1 : 0;
        const end = Math.min(page * pageSize, total);

        // Info
        const info = this.options.paginationContainer.querySelector('.pagination-info');
        if (info) {
            info.innerHTML = total > 0
                ? `Hiển thị <span class="font-medium">${start}</span> - <span class="font-medium">${end}</span> trong <span class="font-medium">${total}</span> kết quả`
                : 'Không có dữ liệu';
        }

        // Current page
        const current = this.options.paginationContainer.querySelector('.pagination-current');
        if (current) current.textContent = page;

        // Total pages
        const totalPagesEl = this.options.paginationContainer.querySelector('.pagination-total-pages');
        if (totalPagesEl) totalPagesEl.textContent = total_pages || 1;

        // Buttons
        const prevBtn = this.options.paginationContainer.querySelector('.pagination-prev');
        const nextBtn = this.options.paginationContainer.querySelector('.pagination-next');

        if (prevBtn) {
            prevBtn.disabled = !has_prev;
            prevBtn.classList.toggle('opacity-50', !has_prev);
            prevBtn.classList.toggle('cursor-not-allowed', !has_prev);
        }

        if (nextBtn) {
            nextBtn.disabled = !has_next;
            nextBtn.classList.toggle('opacity-50', !has_next);
            nextBtn.classList.toggle('cursor-not-allowed', !has_next);
        }
    }

    nextPage() {
        if (this.state.hasNext) {
            this.options.currentPage++;
            this.fetchData();
        }
    }

    previousPage() {
        if (this.state.hasPrev && this.options.currentPage > 1) {
            this.options.currentPage--;
            this.fetchData();
        }
    }

    goToPage(page) {
        if (page >= 1 && page <= this.state.totalPages) {
            this.options.currentPage = page;
            this.fetchData();
        }
    }

    // ============================================================
    // BULK ACTIONS
    // ============================================================
    handleSelectAll(checked) {
        this.state.selectedItems.clear();

        const checkboxes = this.options.tableBody.querySelectorAll('.row-checkbox');
        checkboxes.forEach(cb => {
            cb.checked = checked;
            if (checked) {
                this.state.selectedItems.add(cb.dataset.id);
            }
        });

        this.updateBulkActions();
    }

    handleItemCheckbox(checkbox) {
        const id = checkbox.dataset.id;

        if (checkbox.checked) {
            this.state.selectedItems.add(id);
        } else {
            this.state.selectedItems.delete(id);
        }

        this.updateBulkActions();
    }

    updateBulkActions() {
        if (!this.options.enableBulkActions || !this.options.bulkActionsContainer) return;

        const count = this.state.selectedItems.size;
        const countEl = this.options.bulkActionsContainer.querySelector('.bulk-selected-count');

        if (countEl) {
            countEl.textContent = `${count}`;
        }

        // --- SỬA LỖI TẠI ĐÂY ---
        // Thay vì classList.add('show'), ta xử lý class của Tailwind
        if (count > 0) {
            // Hiện: Xóa hidden, thêm flex
            this.options.bulkActionsContainer.classList.remove('hidden');
            this.options.bulkActionsContainer.classList.add('flex');
            
            // Animation (nếu có CSS transition)
            setTimeout(() => this.options.bulkActionsContainer.classList.add('opacity-100', 'translate-y-0'), 10);
        } else {
            // Ẩn: Xóa flex, thêm hidden
            this.options.bulkActionsContainer.classList.remove('opacity-100', 'translate-y-0');
            
            // Đợi animation tắt rồi mới ẩn hẳn (nếu muốn mượt), hoặc ẩn luôn:
            this.options.bulkActionsContainer.classList.remove('flex');
            this.options.bulkActionsContainer.classList.add('hidden');
        }

        // Update select all checkbox state
        if (this.options.selectAllCheckbox) {
            const allCheckboxes = this.options.tableBody.querySelectorAll('.row-checkbox');
            const checkedCount = this.options.tableBody.querySelectorAll('.row-checkbox:checked').length;

            // Checked nếu chọn hết
            this.options.selectAllCheckbox.checked = 
                allCheckboxes.length > 0 && checkedCount === allCheckboxes.length;
            
            // Indeterminate (dấu gạch ngang) nếu chọn 1 vài cái
            this.options.selectAllCheckbox.indeterminate = 
                checkedCount > 0 && checkedCount < allCheckboxes.length;
        }

        if (this.options.onSelectionChange) {
            this.options.onSelectionChange(Array.from(this.state.selectedItems));
        }
    }

    clearSelection() {
        this.state.selectedItems.clear();

        const checkboxes = this.options.tableBody.querySelectorAll('.row-checkbox');
        checkboxes.forEach(cb => cb.checked = false);

        if (this.options.selectAllCheckbox) {
            this.options.selectAllCheckbox.checked = false;
        }

        this.updateBulkActions();
    }

    // ============================================================
    // PUBLIC API
    // ============================================================
    refresh() {
        this.fetchData();
    }

    getSelectedItems() {
        return Array.from(this.state.selectedItems);
    }

    getData() {
        return this.state.data;
    }

    setApiParams(params) {
        this.options.apiParams = { ...this.options.apiParams, ...params };
    }

    destroy() {
        if (this.state.currentController) {
            this.state.currentController.abort();
        }

        this.eventManager.removeAll();
        this.state.selectedItems.clear();
        this.state.data = [];
        this.state.currentController = null;

        console.log('✅ TableManager destroyed');
    }
}

window.TableManager = TableManager;
