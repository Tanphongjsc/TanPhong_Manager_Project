document.addEventListener('DOMContentLoaded', () => {
    // ============ CONFIGURATION ============
    const API_BASE = '/hrm/to-chuc-nhan-su/api/v1';
    const API = {
        TREE: `${API_BASE}/phong-ban/tree/`,
        EMPLOYEES: `${API_BASE}/phong-ban/employee/`,
        DEPT: `${API_BASE}/phong-ban/`,
        COMPANY: `${API_BASE}/cong-ty/`,
    };
    const CSRF_TOKEN = document.getElementById('csrf-token')?.value || '';

    // ============ STATE MANAGEMENT ============
    const state = {
        selectedDeptId: null,
        selectedCompanyId: null,
        selectedLevel: 0,
        deptName: 'Tất cả nhân viên',
        filters: { search: '', trangThai: '', gioiTinh: '' },
        deleteItem: { id: null, type: null, name: '' },
        selectedEmployees: new Set(), // Track selected employee IDs
        treeCache: null,
        employeeFetchController: null,
        toastTimer: null
    };

    // ============ DOM CACHE ============
    const dom = {
        // Tree & Sidebar
        treeContainer: document.getElementById('org-tree-container'),
        viewAllEmployees: document.getElementById('view-all-employees'),
        treeSearchInput: document.getElementById('tree-search-input'),
        addCompanyBtn: document.getElementById('add-company-btn'),
        openSidebarBtn: document.getElementById('open-sidebar-btn'),
        closeSidebarBtn: document.getElementById('close-sidebar-btn'),
        sidebarOverlay: document.getElementById('sidebar-overlay'),
        treeSidebar: document.getElementById('tree-sidebar'),
        totalEmployeeCount: document.getElementById('total-employee-count'),
        
        // Employee Table
        employeeTableBody: document.getElementById('employee-table-body'),
        employeeListTitle: document.getElementById('employee-list-title'),
        pageTotal: document.getElementById('page-total'),
        selectAllCheckbox: document.getElementById('select-all-checkbox'),
        
        // Bulk Actions
        bulkActions: document.getElementById('bulk-actions'),
        selectedCount: document.getElementById('selected-count'),
        bulkDeleteBtn: document.getElementById('bulk-delete-btn'),
        bulkExportBtn: document.getElementById('bulk-export-btn'),
        clearSelectionBtn: document.getElementById('clear-selection-btn'),
        
        // Filters
        filterForm: document.getElementById('employee-filter-form'),
        filterSearch: document.getElementById('filter-search'),
        filterTrangThai: document.getElementById('filter-trang-thai'),
        filterGioiTinh: document.getElementById('filter-gioi-tinh'),
        
        // Modals
        deptModal: document.getElementById('dept-modal'),
        deptModalContent: document.getElementById('dept-modal-content'),
        deptForm: document.getElementById('dept-form'),
        deptModalTitle: document.getElementById('dept-modal-title'),
        deptModalParentInfo: document.getElementById('dept-modal-parent-info'),
        deptIdInput: document.getElementById('dept-id-input'),
        parentIdInput: document.getElementById('parent-id-input'),
        companyIdInput: document.getElementById('company-id-input'),
        deptLevelInput: document.getElementById('dept-level-input'),
        deptNameInput: document.getElementById('dept-name-input'),
        deptCodeInput: document.getElementById('dept-code-input'),
        closeDeptModalBtn: document.getElementById('close-dept-modal-btn'),
        closeDeptModalBtnX: document.getElementById('close-dept-modal-btn-x'),
        saveDeptBtn: document.getElementById('save-dept-btn'),
        
        deleteDeptModal: document.getElementById('delete-dept-modal'),
        deleteModalContent: document.getElementById('delete-modal-content'),
        deleteDeptName: document.getElementById('delete-dept-name'),
        deleteModalTitle: document.getElementById('delete-modal-title'),
        confirmDeleteDeptBtn: document.getElementById('confirm-delete-dept-btn'),
        cancelDeleteDeptBtn: document.getElementById('cancel-delete-dept-btn'),
        
        // Templates & Toast
        treeItemTemplate: document.getElementById('tree-item-template'),
        employeeRowTemplate: document.getElementById('employee-row-template'),
        toast: document.getElementById('toast-notification'),
        toastMessage: document.getElementById('toast-message')
    };

    // ============ UTILITY FUNCTIONS ============
    
    // API Helper
    async function apiFetch(url, options = {}) {
        const config = {
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': CSRF_TOKEN,
            },
            ...options
        };
        if (options.body) config.body = JSON.stringify(options.body);
        
        try {
            const response = await fetch(url, config);
            const data = response.status === 204 ? null : await response.json();
            
            if (!response.ok) {
                throw new Error(data?.message || `Lỗi ${response.status}`);
            }
            return data;
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    }

    // Toast Notification
    function showToast(message, isError = false) {
        if (!dom.toast || !dom.toastMessage) return;
        clearTimeout(state.toastTimer);
        
        dom.toastMessage.textContent = message;
        dom.toast.className = `fixed bottom-5 right-5 z-50 px-4 py-3 rounded-md shadow-lg transition-all duration-300
            ${isError ? 'bg-red-600' : 'bg-green-600'} text-white max-w-sm opacity-0 translate-x-full pointer-events-none`;
        
        void dom.toast.offsetWidth; // Force reflow
        
        dom.toast.classList.remove('opacity-0', 'translate-x-full', 'pointer-events-none');
        dom.toast.classList.add('opacity-100', 'translate-x-0');
        
        state.toastTimer = setTimeout(() => {
            dom.toast.classList.add('opacity-0', 'translate-x-full', 'pointer-events-none');
            dom.toast.classList.remove('opacity-100', 'translate-x-0');
        }, 3000);
    }

    // Execute with loading state
    async function executeWithLoading(button, loadingText, action) {
        const originalText = button.textContent;
        button.disabled = true;
        button.textContent = loadingText;
        try {
            await action();
        } catch (error) {
            showToast('Lỗi kết nối: ' + error.message, true);
        } finally {
            button.disabled = false;
            button.textContent = originalText;
        }
    }

    // Modal Management
    function showModal(modal, content, onShow) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        modal.style.display = 'flex';
        requestAnimationFrame(() => {
            modal.classList.remove('opacity-0');
            content.classList.remove('scale-95');
            content.classList.add('scale-100');
            if (onShow) setTimeout(onShow, 100);
        });
    }

    function closeModal(modal, content, onClose) {
        modal.classList.add('opacity-0');
        content.classList.remove('scale-100');
        content.classList.add('scale-95');
        setTimeout(() => {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
            modal.style.display = 'none';
            if (onClose) onClose();
        }, 200);
    }

    // Sidebar Toggle
    const toggleSidebar = (show) => {
        dom.treeSidebar?.classList.toggle('show', show);
        dom.sidebarOverlay?.classList.toggle('show', show);
    };

    const closeSidebar = () => {
        if (window.innerWidth < 1024) toggleSidebar(false);
    };

    // ============ TREE FUNCTIONS ============
    
    async function fetchTree(forceRefresh = false) {
        if (state.treeCache && !forceRefresh) {
            renderTree(state.treeCache);
            return;
        }
        
        dom.treeContainer.innerHTML = '<div class="text-center text-slate-500 py-4"><i class="fas fa-spinner fa-spin mr-2"></i>Đang tải...</div>';
        try {
            const result = await apiFetch(API.TREE);
            state.treeCache = result.data || [];
            renderTree(state.treeCache);
        } catch (error) {
            dom.treeContainer.innerHTML = '<div class="text-center text-red-500 py-4">Không thể tải cây tổ chức.</div>';
            showToast('Lỗi kết nối: ' + error.message, true);
        }
    }

    function renderTree(companies) {
        dom.treeContainer.innerHTML = '';
        if (!companies.length) {
            dom.treeContainer.innerHTML = '<div class="text-center text-slate-500 py-4">Chưa có dữ liệu.</div>';
            return;
        }

        const fragment = document.createDocumentFragment();
        companies.forEach(company => {
            const clone = createTreeItem(company, 'company');
            
            // Company-specific setup
            const btnAddSub = clone.querySelector('.btn-add-sub');
            btnAddSub.classList.remove('hidden');
            btnAddSub.onclick = (e) => {
                e.stopPropagation();
                openDeptModal('add-sub', null, company.tencongty_vi, company.id, 1);
            };

            // Action buttons
            clone.querySelector('.btn-edit-dept').onclick = (e) => {
                e.stopPropagation();
                openCompanyModal('edit', company);
            };
            clone.querySelector('.btn-delete-dept').onclick = (e) => {
                e.stopPropagation();
                openDeleteModal(company.id, company.tencongty_vi, 'company');
            };

            // Render departments
            const children = clone.querySelector('.tree-children');
            if (company.departments?.length) {
                renderDeptTree(company.departments, children, company.id);
            }

            fragment.appendChild(clone);
        });
        dom.treeContainer.appendChild(fragment);
    }

    function createTreeItem(item, type) {
        const clone = dom.treeItemTemplate.content.cloneNode(true);
        const treeItem = clone.querySelector('.tree-item');
        const toggle = clone.querySelector('.tree-toggle');
        const icon = clone.querySelector('.tree-icon');
        const name = clone.querySelector('.tree-name');
        const children = clone.querySelector('.tree-children');

        // Set data
        const isCompany = type === 'company';
        Object.assign(treeItem.dataset, {
            id: item.id,
            name: isCompany ? item.tencongty_vi : item.tenphongban,
            type: type
        });

        const displayName = isCompany ? item.tencongty_vi : item.tenphongban;
        name.textContent = displayName;
        name.title = displayName;

        // Icon
        icon.className = isCompany 
            ? 'fas fa-building h-5 w-5 text-blue-600 flex-shrink-0 tree-icon'
            : 'fas fa-folder h-5 w-5 text-yellow-500 flex-shrink-0 tree-icon';

        // Click handler
        treeItem.onclick = () => {
            if (isCompany) {
                selectCompany(item.id, displayName);
            } else {
                selectDept(item.id, displayName, item.congty || treeItem.dataset.companyId, item.level);
            }
        };

        // Toggle handler
        const hasChildren = isCompany ? item.departments?.length : item.children?.length;
        if (hasChildren) {
            toggle.classList.remove('invisible');
            toggle.onclick = (e) => {
                e.stopPropagation();
                children.classList.toggle('hidden');
                const toggleIcon = toggle.querySelector('i');
                toggleIcon.classList.toggle('fa-chevron-right');
                toggleIcon.classList.toggle('fa-chevron-down');
            };
        }

        return clone;
    }

    function renderDeptTree(departments, container, companyId) {
        const fragment = document.createDocumentFragment();
        departments?.forEach(dept => {
            const clone = createTreeItem(dept, 'department');
            const treeItem = clone.querySelector('.tree-item');
            treeItem.dataset.companyId = companyId;
            treeItem.dataset.level = dept.level;

            // Action buttons
            clone.querySelector('.btn-add-sub').onclick = (e) => {
                e.stopPropagation();
                openDeptModal('add-sub', dept.id, dept.tenphongban, companyId, dept.level + 1);
            };
            clone.querySelector('.btn-edit-dept').onclick = (e) => {
                e.stopPropagation();
                openDeptModal('edit', dept.id, dept.tenphongban, companyId, dept.level, dept.maphongban);
            };
            clone.querySelector('.btn-delete-dept').onclick = (e) => {
                e.stopPropagation();
                openDeleteModal(dept.id, dept.tenphongban, 'department');
            };

            // Recursive children
            const children = clone.querySelector('.tree-children');
            if (dept.children?.length) {
                renderDeptTree(dept.children, children, companyId);
            }

            fragment.appendChild(clone);
        });
        container.appendChild(fragment);
    }

    function selectCompany(id, name) {
        updateSelection({ selectedCompanyId: id, selectedDeptId: null, selectedLevel: 0, deptName: name });
        highlightTreeItem(`[data-id="${id}"][data-type="company"]`);
        dom.employeeListTitle.textContent = name;
        fetchEmployees();
        closeSidebar();
    }

    function selectDept(id, name, companyId, level) {
        updateSelection({ selectedDeptId: id, selectedCompanyId: companyId, selectedLevel: level, deptName: name });
        highlightTreeItem(`[data-id="${id}"][data-type="department"]`);
        dom.employeeListTitle.textContent = name;
        fetchEmployees();
        closeSidebar();
    }

    function updateSelection(updates) {
        Object.assign(state, updates);
    }

    function highlightTreeItem(selector) {
        document.querySelectorAll('.tree-item.selected').forEach(el => el.classList.remove('selected'));
        dom.viewAllEmployees?.classList.remove('selected');
        dom.treeContainer.querySelector(`.tree-item${selector}`)?.classList.add('selected');
    }

    // ============ EMPLOYEE FUNCTIONS ============
    
    async function fetchEmployees() {
        // Cancel previous request
        if (state.employeeFetchController) {
            state.employeeFetchController.abort();
        }
        state.employeeFetchController = new AbortController();
        
        dom.employeeTableBody.innerHTML = '<tr><td colspan="7" class="px-6 py-10 text-center text-slate-500"><i class="fas fa-spinner fa-spin mr-2"></i>Đang tải...</td></tr>';
        
        const params = new URLSearchParams();
        if (state.selectedDeptId) params.append('phongban_id', state.selectedDeptId);
        else if (state.selectedCompanyId) params.append('congty_id', state.selectedCompanyId);
        if (state.filters.search) params.append('search', state.filters.search);
        if (state.filters.trangThai) params.append('trangthainv', state.filters.trangThai);
        if (state.filters.gioiTinh) params.append('gioitinh', state.filters.gioiTinh);

        try {
            const result = await apiFetch(`${API.EMPLOYEES}?${params}`, {
                signal: state.employeeFetchController.signal
            });
            const employees = result.data || [];
            const total = result.total || employees.length;
            
            renderEmployeeTable(employees);
            dom.pageTotal.textContent = total;
            
            if (!state.selectedDeptId && !Object.values(state.filters).some(v => v)) {
                dom.totalEmployeeCount.textContent = `(${total})`;
            }
        } catch (error) {
            if (error.name !== 'AbortError') {
                dom.employeeTableBody.innerHTML = '<tr><td colspan="7" class="px-6 py-10 text-center text-red-500">Không thể tải danh sách.</td></tr>';
                dom.pageTotal.textContent = 0;
                showToast('Lỗi kết nối: ' + error.message, true);
            }
        }
    }

    function renderEmployeeTable(employees) {
        dom.employeeTableBody.innerHTML = '';
        state.selectedEmployees.clear();
        updateBulkActions();
        
        if (!employees.length) {
            dom.employeeTableBody.innerHTML = '<tr><td colspan="7" class="px-6 py-10 text-center text-slate-500">Không tìm thấy nhân viên.</td></tr>';
            return;
        }

        const fragment = document.createDocumentFragment();
        employees.forEach(emp => {
            const clone = dom.employeeRowTemplate.content.cloneNode(true);
            
            // Checkbox
            const checkbox = clone.querySelector('.employee-checkbox');
            checkbox.dataset.id = emp.id;
            
            // Avatar
            const name = emp.hovaten || 'N/A';
            const initials = name.split(' ').map(n => n[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?';
            clone.querySelector('.employee-avatar-placeholder span').textContent = initials;
            
            // Employee info
            clone.querySelector('.employee-name').textContent = name;
            clone.querySelector('.employee-email-small').textContent = emp.email || '';
            clone.querySelector('.employee-code').textContent = emp.manhanvien || 'N/A';
            clone.querySelector('.employee-email-main').textContent = emp.email || 'N/A';
            clone.querySelector('.employee-dept').textContent = emp.cong_tac?.phong_ban || 'N/A';

            // Status
            const statusSpan = clone.querySelector('.employee-status');
            const status = emp.trangthainv || 'Khác';
            statusSpan.textContent = status;
            const statusClass = status === 'Đang làm việc' ? 'bg-green-100 text-green-700'
                              : status === 'Đã nghỉ việc' ? 'bg-red-100 text-red-700'
                              : 'bg-slate-100 text-slate-700';
            statusSpan.className = `employee-status inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusClass}`;

            fragment.appendChild(clone);
        });
        dom.employeeTableBody.appendChild(fragment);
    }

    // ============ BULK SELECTION FUNCTIONS ============
    
    function updateBulkActions() {
        const count = state.selectedEmployees.size;
        dom.selectedCount.textContent = `${count} đã chọn`;
        dom.bulkActions.classList.toggle('show', count > 0);
        
        // Update select all checkbox state
        const allCheckboxes = document.querySelectorAll('.employee-checkbox');
        const checkedCount = document.querySelectorAll('.employee-checkbox:checked').length;
        dom.selectAllCheckbox.checked = allCheckboxes.length > 0 && checkedCount === allCheckboxes.length;
        dom.selectAllCheckbox.indeterminate = checkedCount > 0 && checkedCount < allCheckboxes.length;
    }

    function handleSelectAll(checked) {
        state.selectedEmployees.clear();
        document.querySelectorAll('.employee-checkbox').forEach(cb => {
            cb.checked = checked;
            if (checked) state.selectedEmployees.add(cb.dataset.id);
        });
        updateBulkActions();
    }

    function handleEmployeeCheckbox(checkbox) {
        const id = checkbox.dataset.id;
        if (checkbox.checked) {
            state.selectedEmployees.add(id);
        } else {
            state.selectedEmployees.delete(id);
        }
        updateBulkActions();
    }

    function clearSelection() {
        state.selectedEmployees.clear();
        document.querySelectorAll('.employee-checkbox').forEach(cb => cb.checked = false);
        dom.selectAllCheckbox.checked = false;
        updateBulkActions();
    }

    async function bulkDelete() {
        if (state.selectedEmployees.size === 0) return;
        
        if (!confirm(`Bạn có chắc chắn muốn xóa ${state.selectedEmployees.size} nhân viên đã chọn?`)) {
            return;
        }

        await executeWithLoading(dom.bulkDeleteBtn, 'Đang xóa...', async () => {
            // Implement bulk delete API call here
            // For now, just simulate
            await new Promise(resolve => setTimeout(resolve, 1000));
            showToast(`Đã xóa ${state.selectedEmployees.size} nhân viên`);
            clearSelection();
            fetchEmployees();
        });
    }

    function bulkExport() {
        if (state.selectedEmployees.size === 0) return;
        
        // Implement export logic here
        showToast(`Đang xuất ${state.selectedEmployees.size} nhân viên...`);
        // You can collect selected employee data and export to Excel
    }

    // ============ MODAL FUNCTIONS ============
    
    function openDeptModal(mode, id = null, name = '', companyId = null, level = 1, code = '') {
        dom.deptForm.reset();
        [dom.deptIdInput, dom.parentIdInput, dom.companyIdInput, dom.deptLevelInput].forEach(el => el.value = '');
        dom.saveDeptBtn.disabled = dom.deptCodeInput.disabled = false;
        
        if (mode === 'add-sub') {
            dom.deptModalTitle.textContent = 'Thêm phòng ban con';
            dom.deptModalParentInfo.textContent = `Thêm phòng ban con cho: ${name}`;
            dom.parentIdInput.value = id;
            dom.companyIdInput.value = companyId;
            dom.deptLevelInput.value = level;
        } else if (mode === 'edit') {
            dom.deptModalTitle.textContent = 'Cập nhật phòng ban';
            dom.deptModalParentInfo.textContent = `Đang sửa: ${name}`;
            dom.deptIdInput.value = id;
            dom.companyIdInput.value = companyId;
            dom.deptLevelInput.value = level;
            dom.deptNameInput.value = name;
            dom.deptCodeInput.value = code || '';
            dom.deptCodeInput.disabled = true;
        }
        
        showModal(dom.deptModal, dom.deptModalContent, () => dom.deptNameInput.focus());
    }

    function openCompanyModal(mode, company = null) {
        dom.deptForm.reset();
        [dom.deptIdInput, dom.parentIdInput, dom.companyIdInput, dom.deptLevelInput].forEach(el => el.value = '');
        dom.saveDeptBtn.disabled = dom.deptCodeInput.disabled = false;
        
        if (mode === 'add') {
            dom.deptModalTitle.textContent = 'Thêm công ty mới';
            dom.deptModalParentInfo.textContent = '';
        } else if (mode === 'edit' && company) {
            dom.deptModalTitle.textContent = 'Cập nhật công ty';
            dom.deptModalParentInfo.textContent = `Đang sửa: ${company.tencongty_vi}`;
            dom.deptIdInput.value = company.id;
            dom.deptNameInput.value = company.tencongty_vi;
            dom.deptCodeInput.value = company.macongty || '';
            dom.deptCodeInput.disabled = true;
        }
        
        showModal(dom.deptModal, dom.deptModalContent, () => dom.deptNameInput.focus());
    }

    function openDeleteModal(id, name, type) {
        state.deleteItem = { id, name, type };
        dom.deleteDeptName.textContent = name;
        dom.deleteModalTitle.textContent = type === 'company' ? 'Xác nhận xóa công ty' : 'Xác nhận xóa phòng ban';
        showModal(dom.deleteDeptModal, dom.deleteModalContent);
    }

    const closeDeptModal = () => closeModal(dom.deptModal, dom.deptModalContent);
    
    const closeDeleteModal = () => closeModal(dom.deleteDeptModal, dom.deleteModalContent, () => {
        state.deleteItem = { id: null, type: null, name: '' };
    });

    // ============ SAVE & DELETE FUNCTIONS ============
    
    async function saveItem(e) {
        e.preventDefault();
        const id = dom.deptIdInput.value;
        const isCompany = !dom.companyIdInput.value && !dom.parentIdInput.value;
        
        await executeWithLoading(dom.saveDeptBtn, 'Đang xử lý...', async () => {
            const url = isCompany 
                ? (id ? `${API.COMPANY}${id}/` : API.COMPANY)
                : (id ? `${API.DEPT}${id}/` : API.DEPT);
            const method = id ? 'PUT' : 'POST';
            const data = isCompany
                ? { tencongty_vi: dom.deptNameInput.value.trim(), macongty: dom.deptCodeInput.value.trim() || null }
                : { tenphongban: dom.deptNameInput.value.trim(), maphongban: dom.deptCodeInput.value.trim() || null };
            
            if (!isCompany && !id) {
                data.phongbancha_id = dom.parentIdInput.value || null;
                data.congty = dom.companyIdInput.value;
            }

            const result = await apiFetch(url, { method, body: data });
            if (result?.success) {
                showToast(result.message || `Đã ${id ? 'cập nhật' : 'thêm'} thành công.`);
                closeDeptModal();
                state.treeCache = null;
                await fetchTree(true);
            } else {
                showToast(result?.message || 'Đã xảy ra lỗi.', true);
            }
        });
    }

    async function deleteItem() {
        if (!state.deleteItem.id) return;
        
        await executeWithLoading(dom.confirmDeleteDeptBtn, 'Đang xóa...', async () => {
            const url = state.deleteItem.type === 'company' 
                ? `${API.COMPANY}${state.deleteItem.id}/`
                : `${API.DEPT}${state.deleteItem.id}/`;
            
            const result = await apiFetch(url, { method: 'DELETE' });
            if (result?.success) {
                showToast(result.message || 'Xóa thành công!');
                closeDeleteModal();
                state.treeCache = null;
                await fetchTree(true);
                
                if (state.selectedDeptId === state.deleteItem.id) {
                    state.selectedDeptId = state.selectedCompanyId = null;
                    dom.employeeListTitle.textContent = 'Tất cả nhân viên';
                    fetchEmployees();
                }
            } else {
                showToast(result?.message || 'Không thể xóa.', true);
            }
        });
    }

    // ============ EVENT LISTENERS ============
    
    // Sidebar
    dom.openSidebarBtn?.addEventListener('click', () => toggleSidebar(true));
    dom.closeSidebarBtn?.addEventListener('click', () => toggleSidebar(false));
    dom.sidebarOverlay?.addEventListener('click', () => toggleSidebar(false));

    // View All
    dom.viewAllEmployees?.addEventListener('click', () => {
        updateSelection({ selectedDeptId: null, selectedCompanyId: null, selectedLevel: 0, deptName: 'Tất cả nhân viên' });
        highlightTreeItem(''); // Clear all
        dom.viewAllEmployees.classList.add('selected');
        dom.employeeListTitle.textContent = 'Tất cả nhân viên';
        fetchEmployees();
        closeSidebar();
    });

    // Filters
    dom.filterForm?.addEventListener('submit', (e) => e.preventDefault());
    
    let searchTimer;
    dom.filterSearch?.addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
            state.filters.search = dom.filterSearch.value.trim();
            fetchEmployees();
        }, 400);
    });
    
    dom.filterTrangThai?.addEventListener('change', () => {
        state.filters.trangThai = dom.filterTrangThai.value;
        fetchEmployees();
    });
    
    dom.filterGioiTinh?.addEventListener('change', () => {
        state.filters.gioiTinh = dom.filterGioiTinh.value;
        fetchEmployees();
    });

    // Bulk Actions
    dom.selectAllCheckbox?.addEventListener('change', (e) => handleSelectAll(e.target.checked));
    
    // Event delegation for employee checkboxes
    dom.employeeTableBody?.addEventListener('change', (e) => {
        if (e.target.classList.contains('employee-checkbox')) {
            handleEmployeeCheckbox(e.target);
        }
    });
    
    dom.clearSelectionBtn?.addEventListener('click', clearSelection);
    dom.bulkDeleteBtn?.addEventListener('click', bulkDelete);
    dom.bulkExportBtn?.addEventListener('click', bulkExport);

    // Company & Dept Modals
    dom.addCompanyBtn?.addEventListener('click', () => openCompanyModal('add'));
    dom.deptForm?.addEventListener('submit', saveItem);
    dom.closeDeptModalBtn?.addEventListener('click', closeDeptModal);
    dom.closeDeptModalBtnX?.addEventListener('click', closeDeptModal);
    dom.confirmDeleteDeptBtn?.addEventListener('click', deleteItem);
    dom.cancelDeleteDeptBtn?.addEventListener('click', closeDeleteModal);
    
    // Close modal on backdrop click
    dom.deptModal?.addEventListener('click', (e) => e.target === dom.deptModal && closeDeptModal());
    dom.deleteDeptModal?.addEventListener('click', (e) => e.target === dom.deleteDeptModal && closeDeleteModal());

    // Tree search with debounce
    let treeSearchTimer;
    dom.treeSearchInput?.addEventListener('input', () => {
        clearTimeout(treeSearchTimer);
        treeSearchTimer = setTimeout(() => {
            const query = (dom.treeSearchInput.value || '').toLowerCase().trim();
            dom.treeContainer.querySelectorAll('.tree-item').forEach(item => {
                const li = item.closest('li');
                if (li) {
                    const name = (item.dataset.name || '').toLowerCase();
                    li.style.display = (!query || name.includes(query)) ? '' : 'none';
                }
            });
        }, 200);
    });

    // Auto-generate code from name (if utils.js provides generatePositionCode)
    if (dom.deptNameInput && typeof generatePositionCode === 'function') {
        dom.deptNameInput.addEventListener('input', () => {
            if (!dom.deptIdInput.value && !dom.deptCodeInput.disabled) {
                dom.deptCodeInput.value = generatePositionCode(dom.deptNameInput.value || '');
            }
        });
    }

    // ============ INITIALIZATION ============
    fetchTree();
    fetchEmployees();
});