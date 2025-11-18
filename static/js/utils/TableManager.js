/**
 * Reusable Table Manager with pagination, sorting, filtering, and bulk actions
 * @class TableManager
 */
class TableManager {
    /**
     * @param {Object} options - Configuration options
     * @param {HTMLElement} options.tableBody - Table body element
     * @param {HTMLElement} options.paginationContainer - Pagination container
     * @param {HTMLElement} options.searchInput - Search input element
     * @param {HTMLElement} options.filtersForm - Filters form element
     * @param {HTMLElement} options.selectAllCheckbox - Select all checkbox
     * @param {HTMLElement} options.bulkActionsContainer - Bulk actions container
     * @param {string} options.apiEndpoint - API endpoint URL
     * @param {Object} options.apiParams - Additional API parameters
     * @param {number} options.pageSize - Items per page
     * @param {number} options.currentPage - Current page number
     * @param {Function} options.onRenderRow - Row render callback
     * @param {Function} options.onDataLoaded - Data loaded callback
     * @param {Function} options.onSelectionChange - Selection change callback
     * @param {Function} options.onError - Error callback
     * @param {boolean} options.enableBulkActions - Enable bulk actions
     * @param {boolean} options.enableSearch - Enable search
     * @param {boolean} options.enableFilters - Enable filters
     * @param {number} options.searchDebounce - Search debounce time (ms)
     */
    constructor(options) {
        // Validate required dependencies
        if (typeof AppUtils === 'undefined') {
            throw new Error('AppUtils is required. Please load optimized_utils.js first.');
        }

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

        // State management
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

        // Event listeners for cleanup
        this.eventListeners = [];

        // Debounced functions
        this.debouncedSearch = null;

        this.init();
    }

    // ============================================================
    // INITIALIZATION
    // ============================================================

    /**
     * Initialize table manager
     */
    init() {
        this.setupEventListeners();
        if (this.options.apiEndpoint) {
            this.fetchData();
        }
    }

    /**
     * Setup all event listeners
     */
    setupEventListeners() {
        // Search
        if (this.options.searchInput && this.options.enableSearch) {
            this.debouncedSearch = AppUtils.Helper.debounce(() => {
                this.options.currentPage = 1;
                this.fetchData();
            }, this.options.searchDebounce);

            this.addEventListener(this.options.searchInput, 'input', this.debouncedSearch);
        }

        // Filters
        if (this.options.filtersForm && this.options.enableFilters) {
            const inputs = this.options.filtersForm.querySelectorAll('select, input');
            inputs.forEach(input => {
                this.addEventListener(input, 'change', () => {
                    this.options.currentPage = 1;
                    this.fetchData();
                });
            });
        }

        // Select All
        if (this.options.selectAllCheckbox && this.options.enableBulkActions) {
            this.addEventListener(this.options.selectAllCheckbox, 'change', (e) => {
                this.handleSelectAll(e.target.checked);
            });
        }

        // Pagination
        this.setupPagination();
    }

    /**
     * Setup pagination controls
     */
    setupPagination() {
        if (!this.options.paginationContainer) return;

        const prevBtn = this.options.paginationContainer.querySelector('.pagination-prev');
        const nextBtn = this.options.paginationContainer.querySelector('.pagination-next');
        const pageSizeSelect = this.options.paginationContainer.querySelector('.pagination-page-size');

        if (prevBtn) {
            this.addEventListener(prevBtn, 'click', () => this.previousPage());
        }

        if (nextBtn) {
            this.addEventListener(nextBtn, 'click', () => this.nextPage());
        }

        if (pageSizeSelect) {
            this.addEventListener(pageSizeSelect, 'change', (e) => {
                this.options.pageSize = parseInt(e.target.value, 10);
                this.options.currentPage = 1;
                this.fetchData();
            });
        }
    }

    // ============================================================
    // DATA FETCHING
    // ============================================================

    /**
     * Fetch data from API
     */
    async fetchData() {
        // Cancel previous request
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
            // Ignore abort errors
            if (error.name !== 'AbortError') {
                this.handleError(error);
            }

        } finally {
            this.state.isLoading = false;
            this.state.currentController = null;
        }
    }

    /**
     * Get filter parameters from form
     * @returns {Object} Filter parameters
     */
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

    /**
     * Handle API response
     * @param {Object} result - API response
     */
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

        // Update state
        this.state.data = data;
        this.state.totalItems = pagination.total;
        this.state.totalPages = pagination.total_pages;
        this.state.hasNext = pagination.has_next;
        this.state.hasPrev = pagination.has_prev;
        this.options.currentPage = pagination.page;

        // Render table
        this.render();
        this.updatePagination(pagination);

        // Callback
        if (this.options.onDataLoaded) {
            this.options.onDataLoaded(data, pagination);
        }
    }

    /**
     * Handle fetch error
     * @param {Error} error - Error object
     */
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

    /**
     * Render table rows
     */
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

    /**
     * Render single row
     * @param {Object} item - Row data
     * @returns {HTMLElement|null} Row element
     */
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
                this.addEventListener(checkbox, 'change', () => {
                    this.handleItemCheckbox(checkbox);
                });
            }
        }

        return row;
    }

    /**
     * Show loading state
     */
    showLoading() {
        if (!this.options.tableBody) return;

        // Auto-calculate colspan
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

    /**
     * Show empty state
     * @param {string} message - Empty message
     */
    showEmpty(message = 'Không tìm thấy dữ liệu') {
        if (!this.options.tableBody) return;

        const colSpan = this.options.tableBody.closest('table')
            ?.querySelector('thead tr')
            ?.children.length || 5;

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

    // ============================================================
    // PAGINATION
    // ============================================================

    /**
     * Update pagination UI
     * @param {Object} pagination - Pagination data
     */
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

    /**
     * Go to next page
     */
    nextPage() {
        if (this.state.hasNext) {
            this.options.currentPage++;
            this.fetchData();
        }
    }

    /**
     * Go to previous page
     */
    previousPage() {
        if (this.state.hasPrev && this.options.currentPage > 1) {
            this.options.currentPage--;
            this.fetchData();
        }
    }

    /**
     * Go to specific page
     * @param {number} page - Page number
     */
    goToPage(page) {
        if (page >= 1 && page <= this.state.totalPages) {
            this.options.currentPage = page;
            this.fetchData();
        }
    }

    // ============================================================
    // BULK ACTIONS
    // ============================================================

    /**
     * Handle select all checkbox
     * @param {boolean} checked - Is checked
     */
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

    /**
     * Handle individual item checkbox
     * @param {HTMLElement} checkbox - Checkbox element
     */
    handleItemCheckbox(checkbox) {
        const id = checkbox.dataset.id;

        if (checkbox.checked) {
            this.state.selectedItems.add(id);
        } else {
            this.state.selectedItems.delete(id);
        }

        this.updateBulkActions();
    }

    /**
     * Update bulk actions UI
     */
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

            this.options.selectAllCheckbox.checked = 
                allCheckboxes.length > 0 && checkedCount === allCheckboxes.length;
            this.options.selectAllCheckbox.indeterminate = 
                checkedCount > 0 && checkedCount < allCheckboxes.length;
        }

        // Callback
        if (this.options.onSelectionChange) {
            this.options.onSelectionChange(Array.from(this.state.selectedItems));
        }
    }

    /**
     * Clear all selections
     */
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
    // EVENT LISTENER MANAGEMENT
    // ============================================================

    /**
     * Add event listener with tracking
     * @param {HTMLElement} element - Target element
     * @param {string} event - Event name
     * @param {Function} handler - Event handler
     */
    addEventListener(element, event, handler) {
        if (!element) return;
        element.addEventListener(event, handler);
        this.eventListeners.push({ element, event, handler });
    }

    // ============================================================
    // PUBLIC API
    // ============================================================

    /**
     * Refresh table data
     */
    refresh() {
        this.fetchData();
    }

    /**
     * Get selected item IDs
     * @returns {Array<string>} Selected IDs
     */
    getSelectedItems() {
        return Array.from(this.state.selectedItems);
    }

    /**
     * Get current table data
     * @returns {Array<Object>} Current data
     */
    getData() {
        return this.state.data;
    }

    /**
     * Set additional API parameters
     * @param {Object} params - Additional parameters
     */
    setApiParams(params) {
        this.options.apiParams = { ...this.options.apiParams, ...params };
    }

    /**
     * Destroy table manager and cleanup
     */
    destroy() {
        // Cancel pending request
        if (this.state.currentController) {
            this.state.currentController.abort();
        }

        // Remove all event listeners
        this.eventListeners.forEach(({ element, event, handler }) => {
            element.removeEventListener(event, handler);
        });
        this.eventListeners = [];

        // Clear state
        this.state.selectedItems.clear();
        this.state.data = [];
        this.state.currentController = null;

        console.log('✅ TableManager destroyed and cleaned up');
    }
}

// Export to window
window.TableManager = TableManager;
