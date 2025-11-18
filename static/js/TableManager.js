// ============ TABLE MANAGER ============
// File: static/js/components/TableManager.js

/**
 * Reusable Table Manager with pagination, sorting, filtering, and bulk actions
 */
class TableManager {
    constructor(options) {
        this.options = {
            tableBody: null,
            paginationContainer: null,
            searchInput: null,
            filtersForm: null,
            selectAllCheckbox: null,
            bulkActionsContainer: null,
            // API settings
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

        this.state = {
            data: [],
            filteredData: [],
            selectedItems: new Set(),
            totalPages: 1,
            totalItems: 0,
            hasNext: false,
            hasPrev: false,
            isLoading: false,
            currentController: null
        };

        this.init();
    }

    // ============ INITIALIZATION ============
    init() {
        this.setupEventListeners();
        if (this.options.apiEndpoint) {
            this.fetchData();
        }
    }

    setupEventListeners() {
        // Search
        if (this.options.searchInput && this.options.enableSearch) {
            const searchHandler = window.CommonUtils.debounce(() => {
                this.options.currentPage = 1;
                this.fetchData();
            }, this.options.searchDebounce);
            
            this.options.searchInput.addEventListener('input', searchHandler);
        }

        // Filters
        if (this.options.filtersForm && this.options.enableFilters) {
            const inputs = this.options.filtersForm.querySelectorAll('select, input');
            inputs.forEach(input => {
                input.addEventListener('change', () => {
                    this.options.currentPage = 1;
                    this.fetchData();
                });
            });
        }

        // Select All
        if (this.options.selectAllCheckbox && this.options.enableBulkActions) {
            this.options.selectAllCheckbox.addEventListener('change', (e) => {
                this.handleSelectAll(e.target.checked);
            });
        }

        // Pagination
        this.setupPagination();
    }

    setupPagination() {
        if (!this.options.paginationContainer) return;

        const prevBtn = this.options.paginationContainer.querySelector('.pagination-prev');
        const nextBtn = this.options.paginationContainer.querySelector('.pagination-next');
        const pageSizeSelect = this.options.paginationContainer.querySelector('.pagination-page-size');

        if (prevBtn) {
            prevBtn.addEventListener('click', () => this.previousPage());
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', () => this.nextPage());
        }

        if (pageSizeSelect) {
            pageSizeSelect.addEventListener('change', (e) => {
                this.options.pageSize = parseInt(e.target.value, 10);
                this.options.currentPage = 1;
                this.fetchData();
            });
        }
    }

    // ============ DATA FETCHING ============
    async fetchData() {
        if (this.state.isLoading) {
            this.state.currentController?.abort();
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

            const result = await window.CommonUtils.API.get(
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

        this.state.data = data;
        this.state.totalItems = pagination.total;
        this.state.totalPages = pagination.total_pages;
        this.state.hasNext = pagination.has_next;
        this.state.hasPrev = pagination.has_prev;
        this.options.currentPage = pagination.page;

        this.render();
        this.updatePagination(pagination);

        if (this.options.onDataLoaded) {
            this.options.onDataLoaded(data, pagination);
        }
    }

    handleError(error) {
        this.showEmpty('Không thể tải dữ liệu: ' + error.message);
        
        if (this.options.onError) {
            this.options.onError(error);
        } else {
            window.CommonUtils.Toast.error(error.message);
        }
    }

    // ============ RENDERING ============
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
            console.warn('TableManager: onRenderRow callback not provided');
            return null;
        }

        const row = this.options.onRenderRow(item);
        
        // Setup checkbox if bulk actions enabled
        if (this.options.enableBulkActions) {
            const checkbox = row.querySelector('.row-checkbox');
            if (checkbox) {
                checkbox.dataset.id = item.id;
                checkbox.addEventListener('change', () => {
                    this.handleItemCheckbox(checkbox);
                });
            }
        }

        return row;
    }

    showLoading() {
        if (!this.options.tableBody) return;

        // Tự động tính số cột để merge cell đẹp mắt
        const colSpan = this.options.tableBody.closest('table')?.querySelector('thead tr')?.children.length || 10;
        
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

        const colSpan = this.options.tableBody.closest('table')?.querySelector('thead tr')?.children.length || 5;
        
        this.options.tableBody.innerHTML = `
            <tr>
                <td colspan="${colSpan}">
                    <div class="empty-state">
                        <svg class="empty-state-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                        </svg>
                        <h3 class="empty-state-title">${message}</h3>
                    </div>
                </td>
            </tr>
        `;
    }

    // ============ PAGINATION ============
    updatePagination(pagination) {
        if (!this.options.paginationContainer) return;

        const { total, page, total_pages, has_next, has_prev, page_size } = pagination;
        const pageSize = page_size || this.options.pageSize;
        const start = total > 0 ? (page - 1) * pageSize + 1 : 0;
        const end = Math.min(page * pageSize, total);

        // Update info
        const info = this.options.paginationContainer.querySelector('.pagination-info');
        if (info) {
            info.innerHTML = total > 0
                ? `Hiển thị <span class="font-medium">${start}</span> - <span class="font-medium">${end}</span> trong <span class="font-medium">${total}</span> kết quả`
                : 'Không có dữ liệu';
        }

        // Update current page
        const current = this.options.paginationContainer.querySelector('.pagination-current');
        if (current) {
            current.textContent = page;
        }

        // Update total pages
        const totalPagesEl = this.options.paginationContainer.querySelector('.pagination-total-pages');
        if (totalPagesEl) {
            totalPagesEl.textContent = total_pages || 1;
        }

        // Update buttons
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

    // ============ BULK ACTIONS ============
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
            countEl.textContent = `${count} đã chọn`;
        }

        // Show/hide bulk actions bar
        if (count > 0) {
            this.options.bulkActionsContainer.classList.add('show');
        } else {
            this.options.bulkActionsContainer.classList.remove('show');
        }

        // Update select all checkbox
        if (this.options.selectAllCheckbox) {
            const allCheckboxes = this.options.tableBody.querySelectorAll('.row-checkbox');
            const checkedCount = this.options.tableBody.querySelectorAll('.row-checkbox:checked').length;
            
            this.options.selectAllCheckbox.checked = allCheckboxes.length > 0 && checkedCount === allCheckboxes.length;
            this.options.selectAllCheckbox.indeterminate = checkedCount > 0 && checkedCount < allCheckboxes.length;
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

    // ============ PUBLIC API ============
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
        // Cancel any pending requests
        this.state.currentController?.abort();
        
        // Clear state
        this.state.selectedItems.clear();
        this.state.data = [];
    }
}

// Export
window.TableManager = TableManager;