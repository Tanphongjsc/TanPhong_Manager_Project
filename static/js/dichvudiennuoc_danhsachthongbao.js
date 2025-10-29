// Danh sách thông báo dịch vụ - JavaScript

document.addEventListener('DOMContentLoaded', function() {
    // Khởi tạo các biến global
    let currentPage = 1;
    let totalPages = 1;
    let selectedNotifications = [];
    let notifications = []; // Sẽ được load từ API
    let createNotificationModal;
    let addServiceModal;
    let availableServices = [];
    let serviceCounter = 0;
    let currentServices = [];
    let editNotificationModal;
    let currentEditingNotification = null;

    // DOM elements
    const notificationsTable = document.getElementById('notifications-table');
    const notificationsTbody = document.getElementById('notifications-tbody');
    const loadingSpinner = document.getElementById('loading-spinner');
    const emptyState = document.getElementById('empty-state');
    const selectAllCheckbox = document.getElementById('select-all');
    const pagination = document.getElementById('pagination');
    
    // Filter elements
    const filterMonth = document.getElementById('filter-month');
    const filterYear = document.getElementById('filter-year');
    const filterCompany = document.getElementById('filter-company');
    const btnFilter = document.getElementById('btn-filter');
    
    // Button elements
    const btnCreateNew = document.getElementById('btn-create-new');
    const btnPrintMultiple = document.getElementById('btn-print-multiple');
    
    // Modal elements
    const deleteModal = document.getElementById('deleteModal');
    const confirmDeleteBtn = document.getElementById('confirm-delete');
    
    let currentDeleteId = null;

    // Khởi tạo ứng dụng
    init();

    function init() {
        setupEventListeners();
        setupTooltips();
        loadCompanies();
        loadNotifications();
        initializeFilters();
        initializeModals(); 
        loadAllServices();
    }

    function setupEventListeners() {
        // Filter button
        btnFilter.addEventListener('click', handleFilter);
        
        // Create new button
        btnCreateNew.addEventListener('click', handleCreateNew);
        
        // Print multiple button
        btnPrintMultiple.addEventListener('click', handlePrintMultiple);
        
        // Select all checkbox
        selectAllCheckbox.addEventListener('change', handleSelectAll);
        
        // Delete confirmation
        confirmDeleteBtn.addEventListener('click', handleConfirmDelete);

        // Enter key on filter inputs
        [filterMonth, filterYear, filterCompany].forEach(input => {
            input.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    // Hide dropdown nếu đang mở
                    if (input.id === 'filter-company') {
                        const dropdown = document.getElementById('filter-company-dropdown');
                        dropdown.style.display = 'none';
                    }
                    handleFilter();
                }
            });
        });
        const btnSaveEdit = document.getElementById('btn-save-edit-notification');
        const btnEditAddService = document.getElementById('btn-edit-add-service');
        const editDiscount = document.getElementById('edit-discount');
        
        if (btnSaveEdit) {
            btnSaveEdit.addEventListener('click', saveEditNotification);
        }
        if (btnEditAddService) {
            btnEditAddService.addEventListener('click', showEditAddServiceModal);
        }
        if (editDiscount) {
            editDiscount.addEventListener('input', calculateEditTotals);
        }
        const clearFilterBtn = document.getElementById('btn-clear-filters');
        if (clearFilterBtn) {
            clearFilterBtn.addEventListener('click', function() {
                filterMonth.value = '';
                filterYear.value = '';
                clearCompanyFilter();
                handleFilter();
            });
        }
        
    }

    function setupTooltips() {
        // Initialize Bootstrap tooltips
        const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]');
        const tooltipList = [...tooltipTriggerList].map(tooltipTriggerEl => new bootstrap.Tooltip(tooltipTriggerEl));
    }

    function initializeFilters() {
        // Set current date as default
        const now = new Date();
        const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
        const currentYear = now.getFullYear();
        const currentDay = String(now.getDate()).padStart(2, '0');
        
        filterMonth.value = currentMonth;
        filterYear.value = currentYear;
        
        // Set current date for period input
        const currentDate = `${currentYear}-${currentMonth}-${currentDay}`;
        const periodElement = document.getElementById('create-period');
        if (periodElement) {
            periodElement.value = currentDate;
        }
        
        populateYearFilter();
    }

    function initializeModals() {
        // Kiểm tra Bootstrap có sẵn không
        if (typeof bootstrap === 'undefined') {
            console.error('Bootstrap chưa được load');
            return;
        }
        
        // Kiểm tra modal elements tồn tại
        const createModalElement = document.getElementById('createNotificationModal');
        const addServiceModalElement = document.getElementById('addServiceModal');
        const editModalElement = document.getElementById('editNotificationModal');
        
        if (!createModalElement || !addServiceModalElement) {
            console.error('Modal elements không tồn tại');
            return;
        }
        
        try {
            createNotificationModal = new bootstrap.Modal(createModalElement);
            addServiceModal = new bootstrap.Modal(addServiceModalElement);
            
            if (editModalElement) {
                editNotificationModal = new bootstrap.Modal(editModalElement);
            }
            
            //console.log('Modals initialized successfully');
        } catch (error) {
            console.error('Lỗi khi khởi tạo modals:', error);
            return;
        }
        
        // Set current period as default
        const now = new Date();
        const currentDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const periodElement = document.getElementById('create-period');
        if (periodElement) {
            periodElement.value = currentDate;
        }
        
        setupCreateNotificationEventListeners();
        setupModalEventListeners(); // Thêm function mới này
    }

    function setupModalEventListeners() {
        const addServiceModalElement = document.getElementById('addServiceModal');
        const editModalElement = document.getElementById('editNotificationModal');
        
        // Xử lý khi mở add service modal từ edit modal
        if (addServiceModalElement) {
            addServiceModalElement.addEventListener('show.bs.modal', function(e) {
                const editModal = document.getElementById('editNotificationModal');
                if (editModal && editModal.classList.contains('show')) {
                    // Thêm class để phân biệt modal nested
                    this.classList.add('modal-nested');
                    
                    // Tạm ẩn backdrop của edit modal
                    const backdrops = document.querySelectorAll('.modal-backdrop');
                    backdrops.forEach(backdrop => {
                        if (!backdrop.hasAttribute('data-nested')) {
                            backdrop.style.zIndex = '1045';
                        }
                    });
                }
            });
            
            addServiceModalElement.addEventListener('hidden.bs.modal', function() {
                // Xóa class nested
                this.classList.remove('modal-nested');
                
                // Khôi phục z-index của edit modal
                const editModal = document.getElementById('editNotificationModal');
                if (editModal && editModal.classList.contains('show')) {
                    editModal.style.zIndex = '1050';
                    
                    // Khôi phục backdrop
                    const backdrops = document.querySelectorAll('.modal-backdrop');
                    backdrops.forEach(backdrop => {
                        backdrop.style.zIndex = '1040';
                    });
                }
            });
        }
    }

    function setupCreateNotificationEventListeners() {
        // Company change event
        document.getElementById('create-company').addEventListener('change', handleCompanyChange);
        
        // Period change event
        document.getElementById('create-period').addEventListener('change', handlePeriodChange);
        
        // Discount input event
        document.getElementById('create-discount').addEventListener('input', calculateTotals);
        
        // Save buttons
        document.getElementById('btn-save-notification').addEventListener('click', () => saveNotification(false));
        document.getElementById('btn-save-and-create-new').addEventListener('click', () => saveNotification(true));
        
        // Add service button
        document.getElementById('btn-add-service').addEventListener('click', showAddServiceModal);
        
        // Add service modal buttons
        document.getElementById('btn-confirm-add-service').addEventListener('click', confirmAddService);
        
    }

    // THÊM hàm mới để populate datalist
    function populateAddServiceDatalist() {
        const datalist = document.getElementById('add-services-datalist');
        if (datalist && availableServices.length > 0) {
            datalist.innerHTML = '';
            availableServices.forEach(service => {
                const option = document.createElement('option');
                option.value = service.name;
                option.setAttribute('data-id', service.id);
                datalist.appendChild(option);
            });
        }
    }
    function populateYearFilter() {
        const currentYear = new Date().getFullYear();
        const yearSelect = document.getElementById('filter-year');
        
        // Tạo range mặc định trước
        const defaultYears = [];
        for (let year = currentYear; year >= currentYear - 10; year--) {
            defaultYears.push(year);
        }
        
        // Clear existing options except "Tất cả năm"
        while (yearSelect.children.length > 1) {
            yearSelect.removeChild(yearSelect.lastChild);
        }
        
        // Thêm các option năm vào select
        defaultYears.forEach(year => {
            const option = document.createElement('option');
            option.value = year;
            option.textContent = year;
            yearSelect.appendChild(option);
        });
    }

    function loadNotifications() {
        showLoading(true);
        
        const params = new URLSearchParams({
            month: filterMonth.value || '',
            year: filterYear.value || '',
            company: filterCompany.value || '',
            page: currentPage,
            per_page: 10
        });
        
        fetch(`/dichvudiennuoc/api/danh-sach-thong-bao/?${params}`)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                if (data.success) {
                    notifications = data.data;
                    totalPages = data.pagination.total_pages;
                    
                    // XÓA LOGIC CŨ, THÊM LOGIC MỚI:
                    // Luôn clear tbody trước
                    notificationsTbody.innerHTML = '';
                    
                    if (notifications.length === 0) {
                        showEmptyState();
                        // Ẩn pagination khi không có data
                        document.getElementById('pagination-wrapper').style.display = 'none';
                    } else {
                        hideEmptyState();
                        renderTableRows(notifications);
                        renderPagination();
                    }
                    
                    updateBulkActionsVisibility();
                    
                } else {
                    showError('Có lỗi xảy ra: ' + data.error);
                    showEmptyState();
                    notificationsTbody.innerHTML = '';
                }
                showLoading(false);
            })
            .catch(error => {
                console.error('Error loading notifications:', error);
                showError('Không thể kết nối đến server. Vui lòng thử lại sau.');
                showEmptyState();
                notificationsTbody.innerHTML = '';
                showLoading(false);
            });
    }

    function loadCompanies() {
        fetch('/dichvudiennuoc/api/danh-sach-cong-ty/')
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                if (data.success) {
                    populateCompanyFilter(data.companies);
                }
            })
            .catch(error => {
                console.error('Error loading companies:', error);
                // Don't show error to user for company loading failure
            });
    }

    function populateCompanyFilter(companies) {
        const companyInput = document.getElementById('filter-company');
        const dropdown = document.getElementById('filter-company-dropdown');
        
        // Lưu danh sách công ty
        window.filterAvailableCompanies = companies;
        
        // Clear existing dropdown content
        dropdown.innerHTML = '';
        dropdown.style.display = 'none';
        
        // Setup search functionality
        companyInput.addEventListener('input', function() {
            const searchValue = this.value.toLowerCase().trim();
            dropdown.innerHTML = '';
            
            if (searchValue.length >= 1) {
                const filteredCompanies = companies.filter(company => 
                    company.toLowerCase().includes(searchValue)
                );
                
                if (filteredCompanies.length > 0) {
                    filteredCompanies.forEach(company => {
                        const div = document.createElement('div');
                        div.className = 'company-dropdown-item';
                        div.dataset.company = company;
                        // Highlight matching text
                        const regex = new RegExp(`(${searchValue})`, 'gi');
                        const highlightedText = company.replace(regex, '<strong>$1</strong>');
                        div.innerHTML = highlightedText;
                        dropdown.appendChild(div);
                    });
                    dropdown.style.display = 'block';
                } else {
                    dropdown.innerHTML = '<div class="company-dropdown-item no-results">Không tìm thấy công ty phù hợp</div>';
                    dropdown.style.display = 'block';
                }
            } else {
                dropdown.style.display = 'none';
            }
        });
        
        // Show dropdown with all companies when focus
        companyInput.addEventListener('focus', function() {
            if (this.value.trim() === '' && companies.length > 0) {
                dropdown.innerHTML = '';
                companies.forEach(company => {
                    const div = document.createElement('div');
                    div.className = 'company-dropdown-item';
                    div.dataset.company = company;
                    div.textContent = company;
                    dropdown.appendChild(div);
                });
                dropdown.style.display = 'block';
            }
        });
        
        // Handle dropdown selection
        dropdown.addEventListener('click', function(e) {
            if (e.target.classList.contains('company-dropdown-item') && !e.target.classList.contains('no-results')) {
                const selectedCompany = e.target.dataset.company;
                companyInput.value = selectedCompany;
                dropdown.style.display = 'none';
            }
        });
        
        // Hide dropdown when clicking outside
        document.addEventListener('click', function(e) {
            if (!companyInput.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.style.display = 'none';
            }
        });
    }

    function clearCompanyFilter() {
        const companyInput = document.getElementById('filter-company');
        const dropdown = document.getElementById('filter-company-dropdown');
        
        companyInput.value = '';
        dropdown.style.display = 'none';
    }

    function displayNotifications() {
        if (notifications.length === 0) {
            showEmptyState();
            return;
        }
        
        hideEmptyState();
        
        // Gọi loadNotifications() để refresh data từ API
        loadNotifications();
    }

    function renderTableRows(items) {
        const tbody = notificationsTbody;
        tbody.innerHTML = '';
        
        // Không cần kiểm tra items.length === 0 ở đây nữa vì đã check ở displayNotifications()
        items.forEach((item) => {
            const row = createTableRow(item);
            tbody.appendChild(row);
        });
    }

    function createTableRow(item) {
        const tr = document.createElement('tr');
        tr.dataset.id = item.id;
        
        tr.innerHTML = `
            <td class="text-center">
                <input type="checkbox" class="form-check-input row-checkbox" value="${item.id}">
            </td>
            <td class="fw-bold text-center">${item.stt}</td>
            <td class="fw-bold text-primary">${item.sotbdv || ''}</td>
            <td class="company-col" title="${item.tencongty || ''}">${item.tencongty || 'N/A'}</td>
            <td class="note-col" title="${item.chuthich || ''}">${item.chuthich || ''}</td>
            <td class="text-center">${item.ngaytao_display || formatDate(item.ngaytao)}</td>
            <td class="currency text-end">${formatCurrency(item.tongtientruocthue)}</td>
            <td class="currency text-end fw-bold">${formatCurrency(item.tongtiensauthue)}</td>
            <td class="text-center">
                <div class="btn-group" role="group">
                    <button type="button" class="action-btn btn-view" 
                            onclick="viewNotification(${item.id})" 
                            data-bs-toggle="tooltip" title="Xem chi tiết">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button type="button" class="action-btn btn-download" 
                            onclick="downloadNotification(${item.id})" 
                            data-bs-toggle="tooltip" title="Tải xuống PDF">
                        <i class="fas fa-download"></i>
                    </button>
                    <button type="button" class="action-btn btn-delete" 
                            onclick="deleteNotification(${item.id})" 
                            data-bs-toggle="tooltip" title="Xóa thông báo">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        `;
        
        // Add row checkbox event listener
        const checkbox = tr.querySelector('.row-checkbox');
        checkbox.addEventListener('change', handleRowSelection);
        
        return tr;
    }

    function formatDate(dateString) {
        if (!dateString) return '';
        
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return '';
        
        return date.toLocaleDateString('vi-VN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    }

    function formatCurrency(amount) {
        return new Intl.NumberFormat('vi-VN', {
            style: 'currency',
            currency: 'VND'
        }).format(amount);
    }

    function renderPagination() {
        const paginationEl = pagination;
        paginationEl.innerHTML = '';
        const paginationWrapper = document.getElementById('pagination-wrapper');
        
        if (totalPages <= 1) {
            paginationWrapper.style.display = 'none';
            return;
        }
        
        paginationWrapper.style.display = 'block';

        // Previous button
        const prevLi = document.createElement('li');
        prevLi.className = `page-item ${currentPage === 1 ? 'disabled' : ''}`;
        prevLi.innerHTML = `<a class="page-link" href="#" onclick="changePage(${currentPage - 1})">Trước</a>`;
        paginationEl.appendChild(prevLi);
        
        // Page numbers
        const startPage = Math.max(1, currentPage - 2);
        const endPage = Math.min(totalPages, currentPage + 2);
        
        for (let i = startPage; i <= endPage; i++) {
            const pageLi = document.createElement('li');
            pageLi.className = `page-item ${currentPage === i ? 'active' : ''}`;
            pageLi.innerHTML = `<a class="page-link" href="#" onclick="changePage(${i})">${i}</a>`;
            paginationEl.appendChild(pageLi);
        }
        
        // Next button
        const nextLi = document.createElement('li');
        nextLi.className = `page-item ${currentPage === totalPages ? 'disabled' : ''}`;
        nextLi.innerHTML = `<a class="page-link" href="#" onclick="changePage(${currentPage + 1})">Sau</a>`;
        paginationEl.appendChild(nextLi);
    }

    function showLoading(show) {
        if (show) {
            loadingSpinner.style.display = 'block';
            notificationsTbody.style.display = 'none';
            emptyState.style.display = 'none';
        } else {
            loadingSpinner.style.display = 'none';
            notificationsTbody.style.display = '';
        }
    }

    function showEmptyState() {
        emptyState.style.display = 'block';
        notificationsTbody.style.display = 'none';
        pagination.innerHTML = '';
    }

    function hideEmptyState() {
        emptyState.style.display = 'none';
        notificationsTbody.style.display = '';
    }

    function showError(message) {
        // TODO: Implement error notification system
        alert(message);
    }

    // Event handlers
    function handleFilter() {
        currentPage = 1;
        selectedNotifications = [];
        selectAllCheckbox.checked = false;
        loadNotifications();
    }

    function handleCreateNew() {
        if (!createNotificationModal) {
            console.error('createNotificationModal chưa được khởi tạo');
            initializeModals();
            if (!createNotificationModal) {
                alert('Lỗi: Không thể mở modal. Vui lòng refresh trang.');
                return;
            }
        }
        
        resetCreateForm();
        loadAvailableCompanies();
        
        try {
            createNotificationModal.show();
        } catch (error) {
            console.error('Lỗi khi show modal:', error);
            alert('Lỗi khi mở modal: ' + error.message);
        }
    }

    function resetCreateForm() {
        // Reset form
        document.getElementById('create-notification-form').reset();
        
        // Set current date instead of current period
        const now = new Date();
        const currentDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        document.getElementById('create-period').value = currentDate;
        
        // Reset services
        currentServices = [];
        serviceCounter = 0;
        renderServicesTable();
        
        // Reset totals
        document.getElementById('total-before-tax').textContent = '0 VND';
        document.getElementById('total-after-tax').textContent = '0 VND';
        document.getElementById('discount-amount').textContent = '0 VND';
        document.getElementById('final-amount').textContent = '0 VND';
        
        // Reset SOTBDV
        document.getElementById('create-sotbdv').value = '';
        
        // Reset discount
        document.getElementById('create-discount').value = '0';
    }

    function loadAvailableCompanies() {
        const period = document.getElementById('create-period').value;
        if (!period) return;
        
        // SỬA: Parse date để lấy month, year (bỏ day vì chỉ lọc theo tháng)
        const dateObj = new Date(period);
        const year = dateObj.getFullYear();
        const month = dateObj.getMonth() + 1;
        
        // SỬA: Chỉ gọi với tham số month và year
        fetch(`/dichvudiennuoc/api/danh-sach-cong-ty-chua-tao/?month=${month}&year=${year}`)
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    populateCompanySelect(data.companies);
                }
            })
            .catch(error => {
                console.error('Error loading available companies:', error);
                loadAllCompanies();
            });
    }

    function loadAllCompanies() {
        fetch('/dichvudiennuoc/api/danh-sach-cong-ty/')
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    populateCompanySelect(data.companies);
                }
            })
            .catch(error => console.error('Error loading companies:', error));
    }

    function populateCompanySelect(companies) {
        const input = document.getElementById('create-company');
        const dropdown = document.getElementById('company-dropdown');
        
        // Lưu danh sách công ty
        window.availableCompanies = companies;
        
        // Clear existing dropdown content
        dropdown.innerHTML = '';
        
        // Không hiển thị dropdown ban đầu, chỉ hiển thị khi user bắt đầu tìm kiếm
        dropdown.style.display = 'none';
        
        // Setup search functionality
        input.addEventListener('input', function() {
            const searchValue = this.value.toLowerCase().trim();
            dropdown.innerHTML = '';
            
            if (searchValue.length >= 1) {
                const filteredCompanies = companies.filter(company => 
                    company.toLowerCase().includes(searchValue)
                );
                
                if (filteredCompanies.length > 0) {
                    // Hiển thị TẤT CẢ kết quả tìm kiếm, không giới hạn
                    filteredCompanies.forEach(company => {
                        const div = document.createElement('div');
                        div.className = 'company-dropdown-item';
                        div.dataset.company = company;
                        // Highlight matching text
                        const regex = new RegExp(`(${searchValue})`, 'gi');
                        const highlightedText = company.replace(regex, '<strong>$1</strong>');
                        div.innerHTML = highlightedText;
                        dropdown.appendChild(div);
                    });
                    dropdown.style.display = 'block';
                } else {
                    dropdown.innerHTML = '<div class="company-dropdown-item no-results">Không tìm thấy công ty phù hợp</div>';
                    dropdown.style.display = 'block';
                }
            } else {
                dropdown.style.display = 'none';
            }
        });
        
        // Show dropdown with all companies when focus (nếu muốn)
        input.addEventListener('focus', function() {
            if (this.value.trim() === '' && companies.length > 0) {
                dropdown.innerHTML = '';
                // Hiển thị TẤT CẢ công ty khi focus vào input trống
                companies.forEach(company => {
                    const div = document.createElement('div');
                    div.className = 'company-dropdown-item';
                    div.dataset.company = company;
                    div.textContent = company;
                    dropdown.appendChild(div);
                });
                dropdown.style.display = 'block';
            }
        });
        
        // Handle dropdown selection
        dropdown.addEventListener('click', function(e) {
            if (e.target.classList.contains('company-dropdown-item') && !e.target.classList.contains('no-results')) {
                const selectedCompany = e.target.dataset.company;
                input.value = selectedCompany;
                dropdown.style.display = 'none';
                
                // Trigger company change event
                handleCompanyChange();
            }
        });
        
        // Hide dropdown when clicking outside
        document.addEventListener('click', function(e) {
            if (!input.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.style.display = 'none';
            }
        });
    }

    function handleCompanyChange() {
        const company = document.getElementById('create-company').value;
        const period = document.getElementById('create-period').value;
        
        if (company && period) {
            updateSOTBDV(company, period);
            loadPreviousPeriodServices(company, period);
        } else {
            document.getElementById('create-sotbdv').value = '';
            currentServices = [];
            serviceCounter = 0;
            renderServicesTable();
            calculateTotals();
        }
    }

    function handlePeriodChange() {
        const period = document.getElementById('create-period').value;
        
        // Reset tất cả form khi thay đổi kỳ
        document.getElementById('create-company').value = '';
        document.getElementById('create-sotbdv').value = '';
        
        // Reset services
        currentServices = [];
        serviceCounter = 0;
        renderServicesTable();
        
        // THÊM: Reset totals (phần này bị thiếu)
        document.getElementById('total-before-tax').textContent = '0 VND';
        document.getElementById('total-after-tax').textContent = '0 VND';
        document.getElementById('discount-amount').textContent = '0 VND';
        document.getElementById('final-amount').textContent = '0 VND';
        
        // Reset discount input
        document.getElementById('create-discount').value = '0';
        
        // Ẩn dropdown
        const dropdown = document.getElementById('company-dropdown');
        dropdown.style.display = 'none';
        
        // Load lại danh sách công ty có sẵn cho kỳ mới
        if (period) {
            loadAvailableCompanies();
        }
    }

    function updateSOTBDV(company, period) {
        const dateObj = new Date(period);
        const year = dateObj.getFullYear();
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        
        // SỬA: Format SOTBDV theo tháng/năm/ĐNTT_DV/TP-Tên công ty
        const sotbdv = `${month}/${year}/ĐNTT_DV/TP-${company}`;
        document.getElementById('create-sotbdv').value = sotbdv;
    }

    function loadPreviousPeriodServices(company, currentPeriod) {
        const dateObj = new Date(currentPeriod);
        const year = dateObj.getFullYear();
        const month = dateObj.getMonth() + 1;
        
        fetch(`/dichvudiennuoc/api/lay-dich-vu-ky-truoc/?company=${encodeURIComponent(company)}&year=${year}&month=${month}`)
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    currentServices = data.services.map((service, index) => ({
                        ...service,
                        id: ++serviceCounter
                    }));
                    
                    // THÊM: Tự động fill phần trăm giảm trừ từ kỳ trước
                    if (data.previous_discount !== undefined) {
                        document.getElementById('create-discount').value = data.previous_discount;
                    }
                    
                    renderServicesTable();
                    calculateTotals();
                }
            })
            .catch(error => {
                console.error('Error loading previous period services:', error);
                currentServices = [];
                renderServicesTable();
            });
    }

    function loadAllServices() {
        fetch('/dichvudiennuoc/api/danh-sach-tat-ca-dich-vu/')
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    availableServices = data.services;
                    populateServiceSelect();
                }
            })
            .catch(error => console.error('Error loading services:', error));
    }

    function populateServiceSelect() {
        // Populate add service modal datalist
        const addDatalist = document.getElementById('add-services-datalist');
        if (addDatalist) {
            addDatalist.innerHTML = '';
            availableServices.forEach(service => {
                const option = document.createElement('option');
                option.value = service.name;
                option.setAttribute('data-id', service.id);
                addDatalist.appendChild(option);
            });
        }
    }

    function renderServicesTable() {
        const tbody = document.getElementById('services-tbody');
        tbody.innerHTML = '';
        
        if (currentServices.length === 0) {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td colspan="10" class="text-center text-muted">
                    <i class="fas fa-inbox"></i><br>
                    Chưa có dịch vụ nào. Nhấn "Thêm dịch vụ" để bắt đầu.
                </td>
            `;
            tbody.appendChild(tr);
            return;
        }
        
        currentServices.forEach((service, index) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="text-center">${index + 1}</td>
                <td>
                    <input type="text" class="form-control form-control-sm service-name-input" 
                        list="services-datalist" data-id="${service.id}" 
                        value="${service.name || ''}"
                        placeholder="Tìm dịch vụ...">
                    <datalist id="services-datalist">
                        ${availableServices.map(s => 
                            `<option value="${s.name}" data-id="${s.id}">${s.name}</option>`
                        ).join('')}
                    </datalist>
                </td>
                <td>
                    <input type="text" class="form-control form-control-sm" 
                        value="${service.unit || ''}" data-field="unit" data-id="${service.id}"
                        list="units-datalist" placeholder="Chọn hoặc nhập ĐVT">
                    <datalist id="units-datalist">
                        <option value="m³">m³</option>
                        <option value="m²">m²</option>
                        <option value="kwh">kwh</option>
                        <option value="người">người</option>
                        <option value="tháng">tháng</option>
                        <option value="xe">xe</option>
                        <option value="phòng">phòng</option>
                        <option value="m">m</option>
                    </datalist>
                </td>
                <td>
                    <input type="number" class="form-control form-control-sm" 
                        value="${service.old_reading || ''}" min="0" step="0.1" 
                        data-field="old_reading" data-id="${service.id}">
                </td>
                <td>
                    <input type="number" class="form-control form-control-sm" 
                        value="${service.new_reading || ''}" min="0" step="0.1" 
                        data-field="new_reading" data-id="${service.id}">
                </td>
                <td>
                    <input type="number" class="form-control form-control-sm" 
                        value="${service.factor || 1}" min="0" step="0.1" 
                        data-field="factor" data-id="${service.id}">
                </td>
                <td>
                    <input type="number" class="form-control form-control-sm" 
                        value="${service.unit_price || 0}" min="0" step="0.01" 
                        data-field="unit_price" data-id="${service.id}">
                </td>
                <td>
                    <input type="number" class="form-control form-control-sm" 
                        value="${service.usage || ''}" min="0" step="0.1" 
                        data-field="usage" data-id="${service.id}">
                </td>
                <td>
                    <input type="number" class="form-control form-control-sm" 
                        value="${service.tax_rate || 8}" min="0" max="100" step="0.1" 
                        data-field="tax_rate" data-id="${service.id}">
                </td>
                <td class="text-center">
                    <button type="button" class="btn btn-danger btn-sm" 
                            onclick="removeService(${service.id})" title="Xóa dịch vụ">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
        
        // Add event listeners for inputs
        tbody.querySelectorAll('input, select').forEach(input => {
            input.addEventListener('input', handleServiceInputChange);
        });
    }

    function handleServiceInputChange(event) {
        const serviceId = parseInt(event.target.dataset.id);
        const field = event.target.dataset.field;
        const value = event.target.value;
        
        const service = currentServices.find(s => s.id === serviceId);
        if (!service) return;
        
        // Xử lý trường hợp input tên dịch vụ (không có data-field)
        if (!field && event.target.classList.contains('service-name-input')) {
            const selectedService = availableServices.find(s => s.name === value);
            if (selectedService) {
                service.service_id = selectedService.id;
                service.name = selectedService.name;
            } else {
                service.name = value; // Cho phép nhập tự do
            }
        } else if (field) {
            service[field] = value;
        }
        
        // Auto calculate usage if readings are provided
        if (field === 'new_reading' || field === 'old_reading' || field === 'factor') {
            const newReading = parseFloat(service.new_reading) || 0;
            const oldReading = parseFloat(service.old_reading) || 0;
            const factor = parseFloat(service.factor) || 1;
            
            if (newReading > 0 && oldReading >= 0) {
                service.usage = (newReading - oldReading) * factor;
                // Update the usage input
                const usageInput = document.querySelector(`input[data-field="usage"][data-id="${serviceId}"]`);
                if (usageInput) {
                    usageInput.value = service.usage;
                }
            }
        }
        
        calculateTotals();
    }

    function removeService(serviceId) {
        if (confirm('Bạn có chắc chắn muốn xóa dịch vụ này không?')) {
            currentServices = currentServices.filter(s => s.id !== serviceId);
            renderServicesTable();
            calculateTotals();
        }
    }

    function showAddServiceModal() {
        resetAddServiceForm();
        addServiceModal.show();
    }

    function confirmAddService() {
        const serviceInput = document.getElementById('service-select-input').value;
        const unit = document.getElementById('service-unit').value.trim();
        const price = parseFloat(document.getElementById('service-price').value) || 0;
        const factor = parseFloat(document.getElementById('service-factor').value) || 1;
        const taxRate = parseFloat(document.getElementById('service-tax').value) || 8;
        
        if (!serviceInput) {
            alert('Vui lòng chọn dịch vụ');
            return;
        }
        
        const selectedService = availableServices.find(s => s.name === serviceInput);
        if (!selectedService) {
            alert('Dịch vụ không hợp lệ');
            return;
        }
        
        const exists = currentServices.find(s => s.service_id == selectedService.id);
        if (exists) {
            alert('Dịch vụ này đã tồn tại trong danh sách');
            return;
        }
        
        const newService = {
            id: ++serviceCounter,
            service_id: selectedService.id,
            name: selectedService.name,
            unit: unit,
            old_reading: '',
            new_reading: '',
            factor: factor,
            unit_price: price,
            usage: '',
            tax_rate: taxRate
        };
        
        currentServices.push(newService);
        
        const editModalElement = document.getElementById('editNotificationModal');
        const createModalElement = document.getElementById('createNotificationModal');
        
        const isEditModalOpen = editModalElement && editModalElement.classList.contains('show');
        const isCreateModalOpen = createModalElement && createModalElement.classList.contains('show');
        
        if (isEditModalOpen) {
            renderEditServicesTable();
            calculateEditTotals();
        } else if (isCreateModalOpen) {
            renderServicesTable();
            calculateTotals();
        } else {
            if (typeof renderEditServicesTable === 'function') {
                renderEditServicesTable();
                calculateEditTotals();
            }
            renderServicesTable();
            calculateTotals();
        }
        
        addServiceModal.hide();
    }


    function resetAddServiceForm() {
        document.getElementById('service-select-input').value = '';
        document.getElementById('service-unit').value = '';
        document.getElementById('service-price').value = '';
        document.getElementById('service-factor').value = '1';
        document.getElementById('service-tax').value = '8';
    }

    function calculateTotals() {
        let totalBeforeTax = 0;
        let totalAfterTax = 0;
        
        currentServices.forEach(service => {
            const usage = parseFloat(service.usage) || 0;
            const unitPrice = parseFloat(service.unit_price) || 0;
            const taxRate = parseFloat(service.tax_rate) || 0;
            
            const beforeTax = usage * unitPrice;
            const afterTax = beforeTax * (1 + taxRate / 100);
            
            totalBeforeTax += beforeTax;
            totalAfterTax += afterTax;
        });
        
        // Tính giảm trừ và tiền cần thanh toán theo công thức mới
        const discount = parseFloat(document.getElementById('create-discount').value) || 0;
        const discountAmount = totalBeforeTax * (discount / 100);
        const finalAmount = totalAfterTax - discountAmount;
        
        // Update display
        document.getElementById('total-before-tax').textContent = formatCurrency(totalBeforeTax);
        document.getElementById('total-after-tax').textContent = formatCurrency(totalAfterTax);
        document.getElementById('discount-amount').textContent = formatCurrency(discountAmount);
        document.getElementById('final-amount').textContent = formatCurrency(finalAmount);
    }

    function saveNotification(createNew = false) {
        // Validation
        const company = document.getElementById('create-company').value;
        const period = document.getElementById('create-period').value;
        const sotbdv = document.getElementById('create-sotbdv').value;
        
        if (!company) {
            alert('Vui lòng chọn công ty');
            return;
        }
        
        if (!period) {
            alert('Vui lòng chọn kỳ thanh toán');
            return;
        }
        
        if (!sotbdv.trim()) {
            alert('Vui lòng nhập số TBDV');
            return;
        }
        
        if (currentServices.length === 0) {
            alert('Vui lòng thêm ít nhất một dịch vụ');
            return;
        }
        
        // Validate services
        for (let service of currentServices) {
            if (!service.service_id) {
                alert('Vui lòng chọn dịch vụ cho tất cả các dòng');
                return;
            }
            if (!service.unit || !service.unit.trim()) {
                alert('Vui lòng nhập đơn vị tính cho tất cả các dịch vụ');
                return;
            }
            const unitPrice = parseFloat(service.unit_price) || 0;
            if (unitPrice <= 0) {
                alert('Đơn giá phải lớn hơn 0');
                return;
            }
        }
        
        // Prepare data
        const dateObj = new Date(period);
        const discount = parseFloat(document.getElementById('create-discount').value) || 0;
        
        const data = {
            company: company,
            period: {
                year: dateObj.getFullYear(),
                month: dateObj.getMonth() + 1,
                day: dateObj.getDate(),
                full_date: period
            },
            sotbdv: sotbdv.trim(),
            discount: discount,
            services: currentServices.map(service => ({
                service_id: service.service_id,
                unit: service.unit.trim(),
                old_reading: parseFloat(service.old_reading) || null,
                new_reading: parseFloat(service.new_reading) || null,
                factor: parseFloat(service.factor) || 1,
                unit_price: parseFloat(service.unit_price) || 0,
                usage: parseFloat(service.usage) || 0,
                tax_rate: parseFloat(service.tax_rate) || 8
            }))
        };
        
        // Show loading
        const saveBtn = createNew ? 
            document.getElementById('btn-save-and-create-new') : 
            document.getElementById('btn-save-notification');
        const originalText = saveBtn.innerHTML;
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang lưu...';
        
        // ✅ SỬ DỤNG fetchWithCsrf THAY VÌ fetch
        fetchWithCsrf('/dichvudiennuoc/api/tao-moi-thong-bao/', {
            method: 'POST',
            body: JSON.stringify(data)
        })
        .then(response => response.json())
        .then(result => {
            if (result.success) {
                showSuccessMessage('Thông báo đã được tạo thành công!');
                
                if (createNew) {
                    resetCreateForm();
                    loadAvailableCompanies();
                } else {
                    createNotificationModal.hide();
                    loadNotifications();
                }
            } else {
                showError('Có lỗi xảy ra: ' + result.error);
            }
        })
        .catch(error => {
            console.error('Error saving notification:', error);
            showError('Có lỗi xảy ra khi lưu thông báo');
        })
        .finally(() => {
            // Restore button
            saveBtn.disabled = false;
            saveBtn.innerHTML = originalText;
        });
    }

    function loadNotificationDetails(id) {
        if (!editNotificationModal) {
            showError('Modal chưa được khởi tạo');
            return;
        }
        
        // Show loading
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'modal-loading';
        loadingDiv.innerHTML = `
            <div class="loading-spinner">
                <div class="spinner"></div>
                <p>Đang tải thông tin...</p>
            </div>
        `;
        document.getElementById('editNotificationModal').querySelector('.modal-content').style.position = 'relative';
        document.getElementById('editNotificationModal').querySelector('.modal-content').appendChild(loadingDiv);
        
        fetch(`/dichvudiennuoc/api/chi-tiet-thong-bao/${id}/`)
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    currentEditingNotification = data.notification;
                    populateEditForm(data.notification);
                    editNotificationModal.show();
                } else {
                    showError('Có lỗi xảy ra: ' + data.error);
                }
            })
            .catch(error => {
                console.error('Error loading notification details:', error);
                showError('Không thể tải thông tin thông báo');
            })
            .finally(() => {
                // Remove loading
                const loadingEl = document.querySelector('.modal-loading');
                if (loadingEl) {
                    loadingEl.remove();
                }
            });
    }

    function populateEditForm(notification) {
        // Fill basic info (read-only)
        document.getElementById('edit-company').value = notification.company;
        
        // Format period display properly
        document.getElementById('edit-period').value = formatPeriodDisplay(notification.period);
        
        document.getElementById('edit-sotbdv').value = notification.sotbdv;
        document.getElementById('edit-discount').value = notification.discount || 0;
        
        // Load services cho edit mode
        currentServices = notification.services.map((service, index) => ({
            ...service,
            id: ++serviceCounter
        }));
        
        renderEditServicesTable();
        calculateEditTotals();
        
        const addServiceSection = document.getElementById('edit-add-service-section');
        if (addServiceSection) {
            addServiceSection.style.display = 'block';
        }
    }

    function formatPeriodDisplay(period) {
        // period có thể là string "2025-06-15" hoặc object
        if (typeof period === 'string') {
            const dateObj = new Date(period);
            return `${String(dateObj.getMonth() + 1).padStart(2, '0')}/${dateObj.getFullYear()}`;
        }
        return period;
    }

    // THÊM FUNCTION MỚI - renderEditServicesTable() (tương tự renderServicesTable nhưng có prefix edit-)
    function renderEditServicesTable() {
        const tbody = document.getElementById('edit-services-tbody');
        tbody.innerHTML = '';
        
        if (currentServices.length === 0) {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td colspan="10" class="text-center text-muted">
                    <i class="fas fa-inbox"></i><br>
                    Chưa có dịch vụ nào. Nhấn "Thêm dịch vụ" để bắt đầu.
                </td>
            `;
            tbody.appendChild(tr);
            return;
        }
        
        currentServices.forEach((service, index) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="text-center">${index + 1}</td>
                <td>
                    <input type="text" class="form-control form-control-sm service-name-input" 
                        list="edit-services-datalist" data-id="${service.id}" 
                        value="${service.name || ''}"
                        placeholder="Tìm dịch vụ...">
                    <datalist id="edit-services-datalist">
                        ${availableServices.map(s => 
                            `<option value="${s.name}" data-id="${s.id}">${s.name}</option>`
                        ).join('')}
                    </datalist>
                </td>
                <td>
                    <input type="text" class="form-control form-control-sm" 
                        value="${service.unit || ''}" data-field="unit" data-id="${service.id}"
                        list="edit-units-datalist" placeholder="Chọn hoặc nhập ĐVT">
                    <datalist id="edit-units-datalist">
                        <option value="m³">m³</option>
                        <option value="m²">m²</option>
                        <option value="kwh">kwh</option>
                        <option value="người">người</option>
                        <option value="tháng">tháng</option>
                        <option value="xe">xe</option>
                        <option value="phòng">phòng</option>
                        <option value="m">m</option>
                    </datalist>
                </td>
                <td>
                    <input type="number" class="form-control form-control-sm" 
                        value="${service.old_reading || ''}" min="0" step="0.1" 
                        data-field="old_reading" data-id="${service.id}">
                </td>
                <td>
                    <input type="number" class="form-control form-control-sm" 
                        value="${service.new_reading || ''}" min="0" step="0.1" 
                        data-field="new_reading" data-id="${service.id}">
                </td>
                <td>
                    <input type="number" class="form-control form-control-sm" 
                        value="${service.factor || 1}" min="0" step="0.1" 
                        data-field="factor" data-id="${service.id}">
                </td>
                <td>
                    <input type="number" class="form-control form-control-sm" 
                        value="${service.unit_price || 0}" min="0" step="0.01" 
                        data-field="unit_price" data-id="${service.id}">
                </td>
                <td>
                    <input type="number" class="form-control form-control-sm" 
                        value="${service.usage || ''}" min="0" step="0.1" 
                        data-field="usage" data-id="${service.id}">
                </td>
                <td>
                    <input type="number" class="form-control form-control-sm" 
                        value="${service.tax_rate || 8}" min="0" max="100" step="0.1" 
                        data-field="tax_rate" data-id="${service.id}">
                </td>
                <td class="text-center">
                    <button type="button" class="btn btn-danger btn-sm" 
                            onclick="removeEditService(${service.id})" title="Xóa dịch vụ">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
        
        // Add event listeners for inputs
        tbody.querySelectorAll('input, select').forEach(input => {
            input.addEventListener('input', handleEditServiceInputChange);
        });
    }

    // THÊM FUNCTION MỚI - handleEditServiceInputChange() (tương tự handleServiceInputChange)
    function handleEditServiceInputChange(event) {
        const serviceId = parseInt(event.target.dataset.id);
        const field = event.target.dataset.field;
        const value = event.target.value;
        
        const service = currentServices.find(s => s.id === serviceId);
        if (!service) return;
        
        // Xử lý trường hợp input tên dịch vụ (không có data-field)
        if (!field && event.target.classList.contains('service-name-input')) {
            const selectedService = availableServices.find(s => s.name === value);
            if (selectedService) {
                service.service_id = selectedService.id;
                service.name = selectedService.name;
            } else {
                service.name = value; // Cho phép nhập tự do
            }
        } else if (field) {
            service[field] = value;
        }
        
        // Auto calculate usage if readings are provided
        if (field === 'new_reading' || field === 'old_reading' || field === 'factor') {
            const newReading = parseFloat(service.new_reading) || 0;
            const oldReading = parseFloat(service.old_reading) || 0;
            const factor = parseFloat(service.factor) || 1;
            
            if (newReading > 0 && oldReading >= 0) {
                service.usage = (newReading - oldReading) * factor;
                // Update the usage input
                const usageInput = document.querySelector(`input[data-field="usage"][data-id="${serviceId}"]`);
                if (usageInput) {
                    usageInput.value = service.usage;
                }
            }
        }
        
        calculateEditTotals();
    }

    // THÊM FUNCTION MỚI - calculateEditTotals()
    function calculateEditTotals() {
        let totalBeforeTax = 0;
        let totalAfterTax = 0;
        
        currentServices.forEach(service => {
            const usage = parseFloat(service.usage) || 0;
            const unitPrice = parseFloat(service.unit_price) || 0;
            const taxRate = parseFloat(service.tax_rate) || 0;
            
            const beforeTax = usage * unitPrice;
            const afterTax = beforeTax * (1 + taxRate / 100);
            
            totalBeforeTax += beforeTax;
            totalAfterTax += afterTax;
        });
        
        // Tính giảm trừ và tiền cần thanh toán theo công thức mới
        const discount = parseFloat(document.getElementById('edit-discount').value) || 0;
        const discountAmount = totalBeforeTax * (discount / 100);
        const finalAmount = totalAfterTax - discountAmount;
        
        // Update display
        document.getElementById('edit-total-before-tax').textContent = formatCurrency(totalBeforeTax);
        document.getElementById('edit-total-after-tax').textContent = formatCurrency(totalAfterTax);
        document.getElementById('edit-discount-amount').textContent = formatCurrency(discountAmount);
        document.getElementById('edit-final-amount').textContent = formatCurrency(finalAmount);
    }

    // THÊM FUNCTION MỚI - removeEditService()
    window.removeEditService = function(serviceId) {
        if (confirm('Bạn có chắc chắn muốn xóa dịch vụ này không?')) {
            currentServices = currentServices.filter(s => s.id !== serviceId);
            renderEditServicesTable();
            calculateEditTotals();
        }
    };

    // THÊM FUNCTION MỚI - showEditAddServiceModal()
    function showEditAddServiceModal() {
        resetAddServiceForm();
        
        if (!addServiceModal) {
            console.error('addServiceModal not initialized');
            return;
        }
        
        addServiceModal.show();
    }

    // THÊM FUNCTION MỚI - saveEditNotification()
    function saveEditNotification() {
        if (!currentEditingNotification) {
            showError('Không có thông báo đang được chỉnh sửa');
            return;
        }
        
        // Validate services
        if (currentServices.length === 0) {
            alert('Vui lòng thêm ít nhất một dịch vụ');
            return;
        }
        
        for (let service of currentServices) {
            if (!service.service_id) {
                alert('Vui lòng chọn dịch vụ cho tất cả các dòng');
                return;
            }
            if (!service.unit || !service.unit.trim()) {
                alert('Vui lòng nhập đơn vị tính cho tất cả các dịch vụ');
                return;
            }
            const unitPrice = parseFloat(service.unit_price) || 0;
            if (unitPrice <= 0) {
                alert('Đơn giá phải lớn hơn 0');
                return;
            }
        }
        
        // Prepare data
        const discount = parseFloat(document.getElementById('edit-discount').value) || 0;
        
        const data = {
            discount: discount,
            services: currentServices.map(service => ({
                id: service.original_id || null,
                service_id: service.service_id,
                unit: service.unit.trim(),
                old_reading: parseFloat(service.old_reading) || null,
                new_reading: parseFloat(service.new_reading) || null,
                factor: parseFloat(service.factor) || 1,
                unit_price: parseFloat(service.unit_price) || 0,
                usage: parseFloat(service.usage) || 0,
                tax_rate: parseFloat(service.tax_rate) || 8
            }))
        };
        
        // Show loading
        const saveBtn = document.getElementById('btn-save-edit-notification');
        const originalText = saveBtn.innerHTML;
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang lưu...';
        
        // ✅ SỬ DỤNG fetchWithCsrf
        fetchWithCsrf(`/dichvudiennuoc/api/cap-nhat-thong-bao/${currentEditingNotification.id}/`, {
            method: 'PUT',
            body: JSON.stringify(data)
        })
        .then(response => response.json())
        .then(result => {
            if (result.success) {
                showSuccessMessage('Thông báo đã được cập nhật thành công!');
                editNotificationModal.hide();
                loadNotifications();
            } else {
                showError('Có lỗi xảy ra: ' + result.error);
            }
        })
        .catch(error => {
            console.error('Error saving notification:', error);
            showError('Có lỗi xảy ra khi lưu thông báo');
        })
        .finally(() => {
            saveBtn.disabled = false;
            saveBtn.innerHTML = originalText;
        });
    }

    function handlePrintMultiple() {
        if (selectedNotifications.length === 0) {
            alert('Vui lòng chọn ít nhất một thông báo để in');
            return;
        }
        
        // Gọi API để in nhiều thông báo
        const printIds = selectedNotifications.join(',');
        
        fetch(`/dichvudiennuoc/api/in-nhieu-thong-bao/?ids=${printIds}`)
            .then(response => {
                if (!response.ok) {
                    throw new Error('Có lỗi xảy ra khi tạo file in');
                }
                return response.json();
            })
            .then(data => {
                if (data.success) {
                    // Mở từng thông báo trong tab/cửa sổ riêng
                    data.print_urls.forEach((url, index) => {
                        setTimeout(() => {
                            const printWindow = window.open('', `_blank_${index}`);
                            fetch(url)
                                .then(response => response.text())
                                .then(htmlContent => {
                                    printWindow.document.write(htmlContent);
                                    printWindow.document.close();
                                    printWindow.onload = function() {
                                        printWindow.focus();
                                        printWindow.print();
                                    };
                                });
                        }, index * 500); // Delay giữa các lần mở để tránh block
                    });
                    
                    showSuccessMessage(`Đang chuẩn bị in ${selectedNotifications.length} thông báo...`);
                } else {
                    showError('Có lỗi xảy ra: ' + data.error);
                }
            })
            .catch(error => {
                console.error('Error printing multiple notifications:', error);
                showError('Có lỗi xảy ra khi in thông báo: ' + error.message);
            });
    }

    function handleSelectAll() {
        const checkboxes = document.querySelectorAll('.row-checkbox');
        const isChecked = selectAllCheckbox.checked;
        
        checkboxes.forEach(checkbox => {
            checkbox.checked = isChecked;
            const id = parseInt(checkbox.value);
            
            if (isChecked && !selectedNotifications.includes(id)) {
                selectedNotifications.push(id);
            } else if (!isChecked && selectedNotifications.includes(id)) {
                selectedNotifications = selectedNotifications.filter(selectedId => selectedId !== id);
            }
        });
        
        updateBulkActionsVisibility();
    }

    function handleRowSelection(event) {
        const id = parseInt(event.target.value);
        const isChecked = event.target.checked;
        
        if (isChecked && !selectedNotifications.includes(id)) {
            selectedNotifications.push(id);
        } else if (!isChecked && selectedNotifications.includes(id)) {
            selectedNotifications = selectedNotifications.filter(selectedId => selectedId !== id);
        }
        
        // Update select all checkbox state
        const allCheckboxes = document.querySelectorAll('.row-checkbox');
        const checkedCheckboxes = document.querySelectorAll('.row-checkbox:checked');
        
        selectAllCheckbox.indeterminate = checkedCheckboxes.length > 0 && checkedCheckboxes.length < allCheckboxes.length;
        selectAllCheckbox.checked = checkedCheckboxes.length === allCheckboxes.length && allCheckboxes.length > 0;
        
        updateBulkActionsVisibility();
    }

    function handleConfirmDelete() {
        if (currentDeleteId === null) return;
        
        // ✅ SỬ DỤNG fetchWithCsrf
        fetchWithCsrf(`/dichvudiennuoc/api/xoa-thong-bao/${currentDeleteId}/`, {
            method: 'DELETE'
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                loadNotifications();
                showSuccessMessage('Thông báo đã được xóa thành công');
            } else {
                showError('Có lỗi xảy ra: ' + data.error);
            }
            
            // Hide modal
            const modal = bootstrap.Modal.getInstance(deleteModal);
            modal.hide();
            
            currentDeleteId = null;
        })
        .catch(error => {
            console.error('Error deleting notification:', error);
            showError('Có lỗi xảy ra khi xóa thông báo');
        });
    }

    function getCsrfToken() {
        // Phương pháp 1: Lấy từ hidden input {% csrf_token %}
        const hiddenInput = document.querySelector('input[name="csrfmiddlewaretoken"]');
        if (hiddenInput && hiddenInput.value) {
            console.log('✅ CSRF token loaded from hidden input');
            return hiddenInput.value;
        }
        
        // Phương pháp 2: Lấy từ meta tag (backup)
        const metaTag = document.querySelector('meta[name="csrf-token"]');
        if (metaTag && metaTag.content) {
            console.log('✅ CSRF token loaded from meta tag');
            return metaTag.content;
        }
        
        // Không tìm thấy token
        console.error('❌ CSRF token not found! Please refresh the page.');
        return null;
    }

    function validateCsrfToken() {
        const token = getCsrfToken();
        
        if (!token) {
            showError('Lỗi bảo mật: Không tìm thấy CSRF token. Vui lòng tải lại trang.');
            return false;
        }
        
        if (token.length < 32) {
            showError('Lỗi bảo mật: CSRF token không hợp lệ. Vui lòng tải lại trang.');
            return false;
        }
        
        return true;
    }

    async function fetchWithCsrf(url, options = {}) {
        // Kiểm tra token trước khi gọi API
        if (!validateCsrfToken()) {
            throw new Error('CSRF token validation failed');
        }
        
        const csrfToken = getCsrfToken();
        
        // Merge headers
        options.headers = {
            ...options.headers,
            'X-CSRFToken': csrfToken,  // ← CSRF token từ DOM
            'Content-Type': 'application/json'
        };
        
        // Gọi fetch
        const response = await fetch(url, options);
        
        // Xử lý lỗi CSRF
        if (response.status === 403) {
            const data = await response.json();
            if (data.error && data.error.includes('CSRF')) {
                showError('Lỗi bảo mật. Vui lòng tải lại trang và thử lại.');
                // Tự động reload sau 2 giây
                setTimeout(() => window.location.reload(), 2000);
            }
            throw new Error('CSRF validation failed');
        }
        
        return response;
    }

    function updateBulkActionsVisibility() {
        const bulkActions = document.querySelector('.bulk-actions');
        if (bulkActions) {
            if (selectedNotifications.length > 0) {
                bulkActions.classList.add('show');
            } else {
                bulkActions.classList.remove('show');
            }
        }
        
        // Update print multiple button state
        btnPrintMultiple.disabled = selectedNotifications.length === 0;
    }

    function showSuccessMessage(message) {
        // TODO: Implement better notification system
        alert(message);
    }

    // Global functions for onclick handlers
    window.changePage = function(page) {
        if (page < 1 || page > totalPages) return;
        currentPage = page;
        loadNotifications(); // Gọi loadNotifications() thay vì displayNotifications()
        
        // Scroll to top of table
        notificationsTable.scrollIntoView({ behavior: 'smooth' });
    };

    window.viewNotification = function(id) {
        const notification = notifications.find(item => item.id === id);
        if (!notification) {
            showError('Không tìm thấy thông báo');
            return;
        }
        
        loadNotificationDetails(id);
    };

    window.downloadNotification = function(id) {
        console.log('Downloading notification:', id);
        
        // Show loading
        const loadingToast = showLoadingToast('Đang tạo file in...');
        
        // Gọi API để tạo PDF và mở cửa sổ in
        fetch(`/dichvudiennuoc/api/in-thong-bao/${id}/`)
            .then(response => {
                if (!response.ok) {
                    throw new Error('Có lỗi xảy ra khi tạo file in');
                }
                return response.text();
            })
            .then(htmlContent => {
                // Ẩn loading
                hideLoadingToast(loadingToast);
                
                // Tạo cửa sổ in mới
                const printWindow = window.open('', '_blank');
                printWindow.document.write(htmlContent);
                printWindow.document.close();
                
                // Tự động mở hộp thoại in khi trang đã load xong
                printWindow.onload = function() {
                    printWindow.focus();
                    printWindow.print();
                };
                
                showSuccessMessage('File in đã được tạo thành công!');
            })
            .catch(error => {
                hideLoadingToast(loadingToast);
                console.error('Error printing notification:', error);
                showError('Có lỗi xảy ra khi in thông báo: ' + error.message);
            });
    };

    // Thêm các hàm helper cho loading toast
    function showLoadingToast(message) {
        const toast = document.createElement('div');
        toast.className = 'toast-loading';
        toast.innerHTML = `
            <div class="toast-content">
                <i class="fas fa-spinner fa-spin"></i>
                <span>${message}</span>
            </div>
        `;
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #007bff;
            color: white;
            padding: 15px 20px;
            border-radius: 5px;
            z-index: 9999;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        `;
        document.body.appendChild(toast);
        return toast;
    }

    function hideLoadingToast(toast) {
        if (toast && toast.parentNode) {
            toast.parentNode.removeChild(toast);
        }
    }
    window.deleteNotification = function(id) {
        currentDeleteId = id;
        const notification = notifications.find(item => item.id === id);
        
        if (notification) {
            // Update modal content with notification details
            const modalBody = deleteModal.querySelector('#delete-message');
            modalBody.textContent = `Bạn có chắc chắn muốn xóa thông báo "${notification.sotbdv}" của ${notification.tencongty} không?`;
            
            // Show modal
            const modal = new bootstrap.Modal(deleteModal);
            modal.show();
        }
    };

    window.removeService = function(serviceId) {
        if (confirm('Bạn có chắc chắn muốn xóa dịch vụ này không?')) {
            currentServices = currentServices.filter(s => s.id !== serviceId);
            renderServicesTable();
            calculateTotals();
        }
    };

    // Keyboard shortcuts
    document.addEventListener('keydown', function(e) {
        // Ctrl+F: Focus on company filter
        if (e.ctrlKey && e.key === 'f') {
            e.preventDefault();
            filterCompany.focus();
        }
        
        // Ctrl+N: Create new notification
        if (e.ctrlKey && e.key === 'n') {
            e.preventDefault();
            handleCreateNew();
        }
        
        // Escape: Clear filters and hide dropdown
        if (e.key === 'Escape') {
            const dropdown = document.getElementById('filter-company-dropdown');
            if (dropdown.style.display === 'block') {
                dropdown.style.display = 'none';
            } else {
                filterMonth.value = '';
                filterYear.value = '';
                clearCompanyFilter();
                handleFilter();
            }
        }
    });

    // Handle window resize for responsive table
    window.addEventListener('resize', function() {
        // Update table responsiveness if needed
        const table = document.querySelector('.table-responsive');
        if (window.innerWidth < 768) {
            table.classList.add('table-sm');
        } else {
            table.classList.remove('table-sm');
        }
    });
});