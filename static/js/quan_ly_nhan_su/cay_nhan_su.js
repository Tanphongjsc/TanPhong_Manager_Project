document.addEventListener('DOMContentLoaded', () => {
    // API Configuration
    const API_BASE = '/hrm/to-chuc-nhan-su/api/v1';
    const API_TREE = `${API_BASE}/phong-ban/tree/`;
    const API_EMPLOYEES = `${API_BASE}/phong-ban/employee/`;
    const API_DEPT = `${API_BASE}/phong-ban/`;
    const API_COMPANY = `${API_BASE}/cong-ty/`;
    const CSRF_TOKEN = document.getElementById('csrf-token')?.value || '';

    // State
    const state = {
        selectedDeptId: null,
        selectedCompanyId: null,
        selectedLevel: 0,
        deptName: 'Tất cả nhân viên',
        filters: { search: '', trangThai: '', gioiTinh: '' },
        deleteItem: { id: null, type: null, name: '' }
    };

    // DOM Cache - Optimized selector
    const dom = {
        treeContainer: document.getElementById('org-tree-container'),
        employeeTableBody: document.getElementById('employee-table-body'),
        employeeListTitle: document.getElementById('employee-list-title'),
        totalEmployeeCount: document.getElementById('total-employee-count'),
        viewAllEmployees: document.getElementById('view-all-employees'),
        treeItemTemplate: document.getElementById('tree-item-template'),
        employeeRowTemplate: document.getElementById('employee-row-template'),
        filterForm: document.getElementById('employee-filter-form'),
        filterSearch: document.getElementById('filter-search'),
        filterTrangThai: document.getElementById('filter-trang-thai'),
        filterGioiTinh: document.getElementById('filter-gioi-tinh'),
        pageTotal: document.getElementById('page-total'),
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
        addCompanyBtn: document.getElementById('add-company-btn'),
        deleteDeptModal: document.getElementById('delete-dept-modal'),
        deleteModalContent: document.getElementById('delete-modal-content'),
        deleteDeptName: document.getElementById('delete-dept-name'),
        deleteModalTitle: document.getElementById('delete-modal-title'),
        confirmDeleteDeptBtn: document.getElementById('confirm-delete-dept-btn'),
        cancelDeleteDeptBtn: document.getElementById('cancel-delete-dept-btn'),
        toast: document.getElementById('toast-notification'),
        toastMessage: document.getElementById('toast-message'),
        treeSearchInput: document.getElementById('tree-search-input')
    };

    let toastTimer;

    // API Helper - Optimized error handling
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

    // Toast Notification (REWORKED giống chucvu.html)
    function showToast(message, isError = false) {
        if (!dom.toast || !dom.toastMessage) return;
        clearTimeout(toastTimer);
        dom.toastMessage.textContent = message;
        // Gán base class + màu
        dom.toast.className = `fixed bottom-5 right-5 sm:left-auto left-4 sm:right-5 z-50 px-4 py-3 rounded-md shadow-lg transition-all duration-300 ${isError ? 'bg-red-600' : 'bg-green-600'} text-white max-w-sm`;
        // Force reflow
        void dom.toast.offsetWidth;
        // Hiển thị
        dom.toast.classList.remove('opacity-0', 'translate-x-full', 'pointer-events-none');
        dom.toast.classList.add('opacity-100', 'translate-x-0');
        toastTimer = setTimeout(() => {
            dom.toast.classList.add('opacity-0', 'translate-x-full', 'pointer-events-none');
            dom.toast.classList.remove('opacity-100', 'translate-x-0');
        }, 3000);
    }

    // Fetch Tree with caching
    let treeCache = null;
    async function fetchTree(forceRefresh = false) {
        if (treeCache && !forceRefresh) {
            renderTree(treeCache);
            return;
        }
        
        dom.treeContainer.innerHTML = '<div class="text-center text-slate-500 py-4"><i class="fas fa-spinner fa-spin mr-2"></i>Đang tải...</div>';
        try {
            const result = await apiFetch(API_TREE);
            treeCache = result.data || [];
            renderTree(treeCache);
        } catch (error) {
            dom.treeContainer.innerHTML = '<div class="text-center text-red-500 py-4">Không thể tải cây tổ chức.</div>';
            showToast('Lỗi kết nối: ' + error.message, true);
        }
    }

    // Fetch Employees with debouncing
    let employeeFetchAbortController = null;
    async function fetchEmployees() {
        // Cancel previous request
        if (employeeFetchAbortController) {
            employeeFetchAbortController.abort();
        }
        employeeFetchAbortController = new AbortController();
        
        dom.employeeTableBody.innerHTML = '<tr><td colspan="6" class="px-6 py-10 text-center text-slate-500"><i class="fas fa-spinner fa-spin mr-2"></i>Đang tải...</td></tr>';
        
        const params = new URLSearchParams();
        if (state.selectedDeptId) params.append('phongban_id', state.selectedDeptId);
        else if (state.selectedCompanyId) params.append('congty_id', state.selectedCompanyId);
        if (state.filters.search) params.append('search', state.filters.search);
        if (state.filters.trangThai) params.append('trangthainv', state.filters.trangThai);
        if (state.filters.gioiTinh) params.append('gioitinh', state.filters.gioiTinh);

        try {
            const result = await apiFetch(`${API_EMPLOYEES}?${params}`, {
                signal: employeeFetchAbortController.signal
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
                dom.employeeTableBody.innerHTML = '<tr><td colspan="6" class="px-6 py-10 text-center text-red-500">Không thể tải danh sách.</td></tr>';
                dom.pageTotal.textContent = 0;
                showToast('Lỗi kết nối: ' + error.message, true);
            }
        }
    }

    // Render Tree - Optimized with DocumentFragment
    function renderTree(companies) {
        dom.treeContainer.innerHTML = '';
        if (!companies.length) {
            dom.treeContainer.innerHTML = '<div class="text-center text-slate-500 py-4">Chưa có dữ liệu.</div>';
            return;
        }

        const fragment = document.createDocumentFragment();
        companies.forEach(company => {
            const clone = dom.treeItemTemplate.content.cloneNode(true);
            const item = clone.querySelector('.tree-item');
            const toggle = clone.querySelector('.tree-toggle');
            const icon = clone.querySelector('.tree-icon');
            const name = clone.querySelector('.tree-name');
            const children = clone.querySelector('.tree-children');
            const btnAddSub = clone.querySelector('.btn-add-sub');

            item.dataset.id = company.id;
            item.dataset.name = company.tencongty_vi;
            item.dataset.type = 'company';
            name.textContent = company.tencongty_vi;
            icon.className = 'fas fa-building h-5 w-5 text-blue-600 flex-shrink-0';

            item.onclick = () => selectCompany(company.id, company.tencongty_vi);

            // HIỂN THỊ nút thêm phòng ban cho công ty (cấp 1)
            btnAddSub.classList.remove('hidden');
            btnAddSub.onclick = (e) => {
                e.stopPropagation();
                // Thêm phòng ban cấp 1 (không có phòng ban cha)
                openDeptModal('add-sub', null, company.tencongty_vi, company.id, 1);
            };

            if (company.departments?.length) {
                toggle.classList.remove('invisible');
                toggle.onclick = (e) => toggleTree(e, children, toggle);
                renderDeptTree(company.departments, children, company.id);
            }

            clone.querySelector('.btn-edit-dept').onclick = (e) => {
                e.stopPropagation();
                openCompanyModal('edit', company);
            };
            clone.querySelector('.btn-delete-dept').onclick = (e) => {
                e.stopPropagation();
                openDeleteModal(company.id, company.tencongty_vi, 'company');
            };

            fragment.appendChild(clone);
        });
        dom.treeContainer.appendChild(fragment);
    }

    function renderDeptTree(departments, container, companyId) {
        const fragment = document.createDocumentFragment();
        departments?.forEach(dept => {
            const clone = dom.treeItemTemplate.content.cloneNode(true);
            const item = clone.querySelector('.tree-item');
            const toggle = clone.querySelector('.tree-toggle');
            const icon = clone.querySelector('.tree-icon');
            const name = clone.querySelector('.tree-name');
            const children = clone.querySelector('.tree-children');

            item.dataset.id = dept.id;
            item.dataset.name = dept.tenphongban;
            item.dataset.type = 'department';
            item.dataset.companyId = companyId;
            item.dataset.level = dept.level;
            name.textContent = dept.tenphongban;
            icon.className = 'fas fa-folder h-5 w-5 text-yellow-500 flex-shrink-0';

            if (dept.children?.length) {
                toggle.classList.remove('invisible');
                toggle.onclick = (e) => toggleTree(e, children, toggle);
                renderDeptTree(dept.children, children, companyId);
            }

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

            item.onclick = () => selectDept(dept.id, dept.tenphongban, companyId, dept.level);

            fragment.appendChild(clone);
        });
        container.appendChild(fragment);
    }

    function toggleTree(e, submenu, toggle) {
        e.stopPropagation();
        submenu.classList.toggle('hidden');
        const icon = toggle.querySelector('i');
        icon.classList.toggle('fa-chevron-right');
        icon.classList.toggle('fa-chevron-down');
    }

    // Render Employee Table - Optimized
    function renderEmployeeTable(employees) {
        dom.employeeTableBody.innerHTML = '';
        if (!employees.length) {
            dom.employeeTableBody.innerHTML = '<tr><td colspan="6" class="px-6 py-10 text-center text-slate-500">Không tìm thấy nhân viên.</td></tr>';
            return;
        }

        const fragment = document.createDocumentFragment();
        employees.forEach(emp => {
            const clone = dom.employeeRowTemplate.content.cloneNode(true);
            const name = emp.hovaten || 'N/A';
            const initials = name.split(' ').map(n => n[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?';
            
            clone.querySelector('.employee-avatar-placeholder span').textContent = initials;
            clone.querySelector('.employee-name').textContent = name;
            clone.querySelector('.employee-email-small').textContent = emp.email || '';
            clone.querySelector('.employee-code').textContent = emp.manhanvien || 'N/A';
            clone.querySelector('.employee-email-main').textContent = emp.email || 'N/A';
            clone.querySelector('.employee-dept').textContent = emp.cong_tac?.phong_ban || 'N/A';

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

    // Selectors
    function selectCompany(id, name) {
        state.selectedCompanyId = id;
        state.selectedDeptId = null;
        state.selectedLevel = 0;
        state.deptName = name;

        document.querySelectorAll('.tree-item.selected').forEach(el => {
            el.classList.remove('selected');
        });
        dom.viewAllEmployees.classList.remove('selected');

        const selected = dom.treeContainer.querySelector(`.tree-item[data-id="${id}"][data-type="company"]`);
        selected?.classList.add('selected');

        dom.employeeListTitle.textContent = name;
        fetchEmployees();
    }

    function selectDept(id, name, companyId, level) {
        state.selectedDeptId = id;
        state.selectedCompanyId = companyId;
        state.selectedLevel = level;
        state.deptName = name;

        document.querySelectorAll('.tree-item.selected').forEach(el => {
            el.classList.remove('selected');
        });
        dom.viewAllEmployees.classList.remove('selected');

        const selected = dom.treeContainer.querySelector(`.tree-item[data-id="${id}"]`);
        selected?.classList.add('selected');

        dom.employeeListTitle.textContent = name;
        fetchEmployees();
    }

    // Modal Management - Department (FIXED)
    function openDeptModal(mode, id = null, name = '', companyId = null, level = 1, code = '') {
        console.log('Opening dept modal:', mode, { id, name, companyId, level, code });
        
        dom.deptForm.reset();
        dom.deptIdInput.value = '';
        dom.parentIdInput.value = '';
        dom.companyIdInput.value = '';
        dom.deptLevelInput.value = '';
        dom.saveDeptBtn.disabled = false;
        dom.deptCodeInput.disabled = false;
        
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
        
        // Show modal with proper animation
        dom.deptModal.classList.remove('hidden');
        dom.deptModal.classList.add('flex');
        dom.deptModal.style.display = 'flex';
        
        requestAnimationFrame(() => {
            dom.deptModal.classList.remove('opacity-0');
            dom.deptModalContent.classList.remove('scale-95');
            dom.deptModalContent.classList.add('scale-100');
        });
        
        // Focus first input
        setTimeout(() => dom.deptNameInput.focus(), 100);
    }

    function closeDeptModal() {
        dom.deptModal.classList.add('opacity-0');
        dom.deptModalContent.classList.remove('scale-100');
        dom.deptModalContent.classList.add('scale-95');
        setTimeout(() => {
            dom.deptModal.classList.add('hidden');
            dom.deptModal.classList.remove('flex');
            dom.deptModal.style.display = 'none';
        }, 200);
    }

    // Modal Management - Company (FIXED)
    function openCompanyModal(mode, company = null) {
        console.log('Opening company modal:', mode, company);
        
        dom.deptForm.reset();
        dom.deptIdInput.value = '';
        dom.parentIdInput.value = '';
        dom.companyIdInput.value = '';
        dom.deptLevelInput.value = '';
        dom.saveDeptBtn.disabled = false;
        dom.deptCodeInput.disabled = false;
        
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
        
        // Show modal with proper animation
        dom.deptModal.classList.remove('hidden');
        dom.deptModal.classList.add('flex');
        dom.deptModal.style.display = 'flex';
        
        requestAnimationFrame(() => {
            dom.deptModal.classList.remove('opacity-0');
            dom.deptModalContent.classList.remove('scale-95');
            dom.deptModalContent.classList.add('scale-100');
        });
        
        // Focus first input
        setTimeout(() => dom.deptNameInput.focus(), 100);
    }

    function openDeleteModal(id, name, type) {
        state.deleteItem = { id, name, type };
        dom.deleteDeptName.textContent = name;
        dom.deleteModalTitle.textContent = type === 'company' ? 'Xác nhận xóa công ty' : 'Xác nhận xóa phòng ban';
        
        dom.deleteDeptModal.classList.remove('hidden');
        dom.deleteDeptModal.classList.add('flex');
        dom.deleteDeptModal.style.display = 'flex';
        
        requestAnimationFrame(() => {
            dom.deleteDeptModal.classList.remove('opacity-0');
            dom.deleteModalContent.classList.remove('scale-95');
            dom.deleteModalContent.classList.add('scale-100');
        });
    }

    function closeDeleteModal() {
        dom.deleteDeptModal.classList.add('opacity-0');
        dom.deleteModalContent.classList.remove('scale-100');
        dom.deleteModalContent.classList.add('scale-95');
        setTimeout(() => {
            state.deleteItem = { id: null, type: null, name: '' };
            dom.deleteDeptModal.classList.add('hidden');
            dom.deleteDeptModal.classList.remove('flex');
            dom.deleteDeptModal.style.display = 'none';
        }, 200);
    }

    // Save Department/Company (FIXED - Added proper logging)
    async function saveItem(e) {
        e.preventDefault();
        console.log('Form submit triggered');
        
        const id = dom.deptIdInput.value;
        const isCompany = !dom.companyIdInput.value && !dom.parentIdInput.value;
        const originalText = dom.saveDeptBtn.textContent;
        
        console.log('Saving item:', { id, isCompany, name: dom.deptNameInput.value });
        
        dom.saveDeptBtn.disabled = true;
        dom.saveDeptBtn.textContent = 'Đang xử lý...';
        
        try {
            let url, method, data;
            
            if (isCompany) {
                url = id ? `${API_COMPANY}${id}/` : API_COMPANY;
                method = id ? 'PUT' : 'POST';
                data = {
                    tencongty_vi: dom.deptNameInput.value.trim(),
                    macongty: dom.deptCodeInput.value.trim() || null
                };
            } else {
                url = id ? `${API_DEPT}${id}/` : API_DEPT;
                method = id ? 'PUT' : 'POST';
                data = {
                    tenphongban: dom.deptNameInput.value.trim(),
                    maphongban: dom.deptCodeInput.value.trim() || null
                };
                if (!id) {
                    data.phongbancha_id = dom.parentIdInput.value || null;
                    data.congty = dom.companyIdInput.value;
                }
            }

            console.log('API Request:', method, url, data);
            const result = await apiFetch(url, { method, body: data });
            console.log('API Response:', result);
            
            if (result?.success) {
                showToast(result.message || `Đã ${id ? 'cập nhật' : 'thêm'} thành công.`);
                closeDeptModal();
                await fetchTree(true); // Force refresh
                treeCache = null; // Clear cache
            } else {
                showToast(result?.message || 'Đã xảy ra lỗi.', true);
            }
        } catch (error) {
            console.error('Save error:', error);
            showToast('Lỗi kết nối: ' + error.message, true);
        } finally {
            dom.saveDeptBtn.disabled = false;
            dom.saveDeptBtn.textContent = originalText;
        }
    }

    // Delete Item
    async function deleteItem() {
        if (!state.deleteItem.id) return;
        const originalText = dom.confirmDeleteDeptBtn.textContent;
        dom.confirmDeleteDeptBtn.disabled = true;
        dom.confirmDeleteDeptBtn.textContent = 'Đang xóa...';

        try {
            const url = state.deleteItem.type === 'company' 
                ? `${API_COMPANY}${state.deleteItem.id}/`
                : `${API_DEPT}${state.deleteItem.id}/`;
            
            const result = await apiFetch(url, { method: 'DELETE' });
            if (result?.success) {
                showToast(result.message || 'Xóa thành công!');
                closeDeleteModal();
                await fetchTree(true);
                treeCache = null;
                if (state.selectedDeptId === state.deleteItem.id) {
                    state.selectedDeptId = null;
                    state.selectedCompanyId = null;
                    dom.employeeListTitle.textContent = 'Tất cả nhân viên';
                    fetchEmployees();
                }
            } else {
                showToast(result?.message || 'Không thể xóa.', true);
            }
        } catch (error) {
            showToast('Lỗi kết nối: ' + error.message, true);
        } finally {
            dom.confirmDeleteDeptBtn.disabled = false;
            dom.confirmDeleteDeptBtn.textContent = originalText;
        }
    }

    // Auto-generate code from name
    if (dom.deptNameInput && typeof generatePositionCode === 'function') {
        dom.deptNameInput.addEventListener('input', () => {
            if (!dom.deptIdInput.value && !dom.deptCodeInput.disabled) {
                dom.deptCodeInput.value = generatePositionCode(dom.deptNameInput.value || '');
            }
        });
    }

    // Event Listeners - Properly attached
    if (dom.viewAllEmployees) {
        dom.viewAllEmployees.onclick = () => {
            state.selectedDeptId = null;
            state.selectedCompanyId = null;
            state.selectedLevel = 0;
            state.deptName = 'Tất cả nhân viên';
            document.querySelectorAll('.tree-item.bg-slate-100').forEach(el => {
                el.classList.remove('bg-slate-100', 'font-semibold');
            });
            dom.viewAllEmployees.classList.add('bg-slate-100', 'font-semibold');
            dom.employeeListTitle.textContent = 'Tất cả nhân viên';
            fetchEmployees();
        };
    }
    
    if (dom.filterForm) dom.filterForm.onsubmit = (e) => e.preventDefault();
    
    // Debounced search
    let searchTimer;
    if (dom.filterSearch) {
        dom.filterSearch.oninput = () => {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(() => {
                state.filters.search = dom.filterSearch.value.trim();
                fetchEmployees();
            }, 400);
        };
    }
    
    if (dom.filterTrangThai) {
        dom.filterTrangThai.onchange = () => {
            state.filters.trangThai = dom.filterTrangThai.value;
            fetchEmployees();
        };
    }
    
    if (dom.filterGioiTinh) {
        dom.filterGioiTinh.onchange = () => {
            state.filters.gioiTinh = dom.filterGioiTinh.value;
            fetchEmployees();
        };
    }
    
    if (dom.addCompanyBtn) {
        dom.addCompanyBtn.onclick = () => openCompanyModal('add');
    }
    
    // CRITICAL FIX: Properly attach form submit handler
    if (dom.deptForm) {
        dom.deptForm.addEventListener('submit', saveItem);
        console.log('Form submit handler attached');
    }
    
    if (dom.closeDeptModalBtn) dom.closeDeptModalBtn.onclick = closeDeptModal;
    if (dom.closeDeptModalBtnX) dom.closeDeptModalBtnX.onclick = closeDeptModal;
    if (dom.confirmDeleteDeptBtn) dom.confirmDeleteDeptBtn.onclick = deleteItem;
    if (dom.cancelDeleteDeptBtn) dom.cancelDeleteDeptBtn.onclick = closeDeleteModal;
    
    // Close modal on backdrop click
    if (dom.deptModal) {
        dom.deptModal.onclick = (e) => {
            if (e.target === dom.deptModal) closeDeptModal();
        };
    }
    if (dom.deleteDeptModal) {
        dom.deleteDeptModal.onclick = (e) => {
            if (e.target === dom.deleteDeptModal) closeDeleteModal();
        };
    }

    // Tree search - Optimized
    if (dom.treeSearchInput) {
        let searchDebounceTimer;
        dom.treeSearchInput.addEventListener('input', () => {
            clearTimeout(searchDebounceTimer);
            searchDebounceTimer = setTimeout(() => {
                const q = (dom.treeSearchInput.value || '').toLowerCase().trim();
                const nodes = dom.treeContainer.querySelectorAll('.tree-item');
                nodes.forEach(n => {
                    const name = (n.dataset.name || '').toLowerCase();
                    const li = n.closest('li');
                    if (li) {
                        li.style.display = (!q || name.includes(q)) ? '' : 'none';
                    }
                });
            }, 200);
        });
    }

    // Initialize
    console.log('Initializing...');
    fetchTree();
    fetchEmployees();
});