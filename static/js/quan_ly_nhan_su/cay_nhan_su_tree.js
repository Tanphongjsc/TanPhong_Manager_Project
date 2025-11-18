// ============ CÂY NHÂN SỰ - TREE MODULE ============
// File: cay_nhan_su_tree.js

document.addEventListener('DOMContentLoaded', () => {
    const { HRState, HRDom, HRUtils, HRAPI } = window;
    
    // ============ TREE FUNCTIONS ============
    
    async function fetchTree(forceRefresh = false) {
        if (HRState.treeCache && !forceRefresh) {
            return renderTree(HRState.treeCache);
        }
        
        HRDom.treeContainer.innerHTML = '<div class="text-center text-slate-500 py-4"><i class="fas fa-spinner fa-spin mr-2"></i>Đang tải...</div>';
        
        try {
            const result = await HRUtils.apiFetch(HRAPI.TREE);
            HRState.treeCache = result.data || [];
            renderTree(HRState.treeCache);
        } catch (error) {
            HRDom.treeContainer.innerHTML = '<div class="text-center text-red-500 py-4">Không thể tải cây tổ chức.</div>';
            HRUtils.showToast('Lỗi: ' + error.message, true);
        }
    }

    function renderTree(companies) {
        HRDom.treeContainer.innerHTML = '';
        if (!companies.length) {
            HRDom.treeContainer.innerHTML = '<div class="text-center text-slate-500 py-4">Chưa có dữ liệu.</div>';
            return;
        }

        const fragment = document.createDocumentFragment();
        companies.forEach(company => {
            const clone = createTreeItem(company, 'company');
            
            // Setup company actions
            setupTreeActions(clone, {
                onAdd: () => openDeptModal('add-sub', null, company.tencongty_vi, company.id, 1),
                onEdit: () => openCompanyModal('edit', company),
                onDelete: () => HRUtils.openDeleteModal(company.id, company.tencongty_vi, 'company'),
                onClick: () => selectCompany(company.id, company.tencongty_vi)
            });

            // Render departments
            if (company.departments?.length) {
                const children = clone.querySelector('.tree-children');
                renderDeptTree(company.departments, children, company.id);
            }

            fragment.appendChild(clone);
        });
        HRDom.treeContainer.appendChild(fragment);
    }

    function createTreeItem(item, type) {
        const clone = HRDom.treeItemTemplate.content.cloneNode(true);
        const treeItem = clone.querySelector('.tree-item');
        const toggle = clone.querySelector('.tree-toggle');
        const icon = clone.querySelector('.tree-icon');
        const name = clone.querySelector('.tree-name');
        const children = clone.querySelector('.tree-children');

        const isCompany = type === 'company';
        const displayName = isCompany ? item.tencongty_vi : item.tenphongban;

        // Set data attributes
        Object.assign(treeItem.dataset, {
            id: item.id,
            name: displayName,
            type: type
        });

        name.textContent = displayName;
        name.title = displayName;

        // Icon setup
        icon.className = `fas ${isCompany ? 'fa-building text-blue-600' : 'fa-folder text-yellow-500'} h-5 w-5 flex-shrink-0 tree-icon`;

        // Toggle handler
        const hasChildren = isCompany ? item.departments?.length : item.children?.length;
        if (hasChildren) {
            toggle.classList.remove('invisible');
            toggle.onclick = (e) => {
                e.stopPropagation();
                children.classList.toggle('hidden');
                toggle.querySelector('i').classList.toggle('fa-chevron-right');
                toggle.querySelector('i').classList.toggle('fa-chevron-down');
            };
        }

        return clone;
    }

    function setupTreeActions(clone, { onAdd, onEdit, onDelete, onClick }) {
        const treeItem = clone.querySelector('.tree-item');
        const btnAdd = clone.querySelector('.btn-add-sub');
        const btnEdit = clone.querySelector('.btn-edit-dept');
        const btnDelete = clone.querySelector('.btn-delete-dept');

        treeItem.onclick = onClick;
        
        btnAdd.onclick = (e) => { e.stopPropagation(); onAdd(); };
        btnEdit.onclick = (e) => { e.stopPropagation(); onEdit(); };
        btnDelete.onclick = (e) => { e.stopPropagation(); onDelete(); };
    }

    function renderDeptTree(departments, container, companyId) {
        const fragment = document.createDocumentFragment();
        departments?.forEach(dept => {
            const clone = createTreeItem(dept, 'department');
            const treeItem = clone.querySelector('.tree-item');
            treeItem.dataset.companyId = companyId;
            treeItem.dataset.level = dept.level;

            // Setup department actions
            setupTreeActions(clone, {
                onAdd: () => openDeptModal('add-sub', dept.id, dept.tenphongban, companyId, dept.level + 1),
                onEdit: () => openDeptModal('edit', dept.id, dept.tenphongban, companyId, dept.level, dept.maphongban),
                onDelete: () => HRUtils.openDeleteModal(dept.id, dept.tenphongban, 'department'),
                onClick: () => selectDept(dept.id, dept.tenphongban, companyId, dept.level)
            });

            // Recursive children
            if (dept.children?.length) {
                const children = clone.querySelector('.tree-children');
                renderDeptTree(dept.children, children, companyId);
            }

            fragment.appendChild(clone);
        });
        container.appendChild(fragment);
    }

    function selectCompany(id, name) {
        updateSelection({ selectedCompanyId: id, selectedDeptId: null, selectedLevel: 0, deptName: name });
        highlightTreeItem(`[data-id="${id}"][data-type="company"]`);
        HRDom.employeeListTitle.textContent = name;
        window.HREmployee.fetchEmployees(true);
        HRUtils.closeSidebar();
    }

    function selectDept(id, name, companyId, level) {
        updateSelection({ selectedDeptId: id, selectedCompanyId: companyId, selectedLevel: level, deptName: name });
        highlightTreeItem(`[data-id="${id}"][data-type="department"]`);
        HRDom.employeeListTitle.textContent = name;
        window.HREmployee.fetchEmployees(true);
        HRUtils.closeSidebar();
    }

    function updateSelection(updates) {
        Object.assign(HRState, updates);
    }

    function highlightTreeItem(selector) {
        document.querySelectorAll('.tree-item.selected').forEach(el => el.classList.remove('selected'));
        HRDom.viewAllEmployees?.classList.remove('selected');
        HRDom.treeContainer.querySelector(`.tree-item${selector}`)?.classList.add('selected');
    }

    // ============ MODAL FUNCTIONS ============
    
    function openDeptModal(mode, id = null, name = '', companyId = null, level = 1, code = '') {
        HRDom.deptForm.reset();
        [HRDom.deptIdInput, HRDom.parentIdInput, HRDom.companyIdInput, HRDom.deptLevelInput].forEach(el => el.value = '');
        HRDom.saveDeptBtn.disabled = HRDom.deptCodeInput.disabled = false;
        
        if (mode === 'add-sub') {
            HRDom.deptModalTitle.textContent = 'Thêm phòng ban con';
            HRDom.deptModalParentInfo.textContent = `Thêm phòng ban con cho: ${name}`;
            HRDom.parentIdInput.value = id;
            HRDom.companyIdInput.value = companyId;
            HRDom.deptLevelInput.value = level;
        } else if (mode === 'edit') {
            HRDom.deptModalTitle.textContent = 'Cập nhật phòng ban';
            HRDom.deptModalParentInfo.textContent = `Đang sửa: ${name}`;
            HRDom.deptIdInput.value = id;
            HRDom.companyIdInput.value = companyId;
            HRDom.deptLevelInput.value = level;
            HRDom.deptNameInput.value = name;
            HRDom.deptCodeInput.value = code || '';
            HRDom.deptCodeInput.disabled = true;
        }
        
        HRUtils.showModal(HRDom.deptModal, HRDom.deptModalContent, () => HRDom.deptNameInput.focus());
    }

    function openCompanyModal(mode, company = null) {
        HRDom.deptForm.reset();
        [HRDom.deptIdInput, HRDom.parentIdInput, HRDom.companyIdInput, HRDom.deptLevelInput].forEach(el => el.value = '');
        HRDom.saveDeptBtn.disabled = HRDom.deptCodeInput.disabled = false;
        
        if (mode === 'add') {
            HRDom.deptModalTitle.textContent = 'Thêm công ty mới';
            HRDom.deptModalParentInfo.textContent = '';
        } else if (mode === 'edit' && company) {
            HRDom.deptModalTitle.textContent = 'Cập nhật công ty';
            HRDom.deptModalParentInfo.textContent = `Đang sửa: ${company.tencongty_vi}`;
            HRDom.deptIdInput.value = company.id;
            HRDom.deptNameInput.value = company.tencongty_vi;
            HRDom.deptCodeInput.value = company.macongty || '';
            HRDom.deptCodeInput.disabled = true;
        }
        
        HRUtils.showModal(HRDom.deptModal, HRDom.deptModalContent, () => HRDom.deptNameInput.focus());
    }

    function openDeleteModal(id, name, type, ids = null) {
        HRState.deleteItem = { id, name, type, ids };
        HRDom.deleteDeptName.textContent = name;
        if (type === 'company') {
            HRDom.deleteModalTitle.textContent = 'Xác nhận xóa công ty';
        } else if (type === 'department') {
            HRDom.deleteModalTitle.textContent = 'Xác nhận xóa phòng ban';
        } else if (type === 'employee') {
            HRDom.deleteModalTitle.textContent = 'Xác nhận xóa nhân viên';
        } else if (type === 'employees') {
            HRDom.deleteModalTitle.textContent = 'Xác nhận xóa nhiều nhân viên';
        }
        HRUtils.showModal(HRDom.deleteDeptModal, HRDom.deleteModalContent);
    }

    const closeDeptModal = () => HRUtils.closeModal(HRDom.deptModal, HRDom.deptModalContent);
    
    const closeDeleteModal = () => HRUtils.closeModal(HRDom.deleteDeptModal, HRDom.deleteModalContent, () => {
        HRState.deleteItem = { id: null, ids: null, type: null, name: '' };
    });

    // ============ SAVE & DELETE FUNCTIONS ============
    
    async function saveItem(e) {
        e.preventDefault();
        const id = HRDom.deptIdInput.value;
        const isCompany = !HRDom.companyIdInput.value && !HRDom.parentIdInput.value;
        
        await HRUtils.executeWithLoading(HRDom.saveDeptBtn, 'Đang xử lý...', async () => {
            const url = isCompany 
                ? (id ? `${HRAPI.COMPANY}${id}/` : HRAPI.COMPANY)
                : (id ? `${HRAPI.DEPT}${id}/` : HRAPI.DEPT);
            const method = id ? 'PUT' : 'POST';
            const data = isCompany
                ? { tencongty_vi: HRDom.deptNameInput.value.trim(), macongty: HRDom.deptCodeInput.value.trim() || null }
                : { tenphongban: HRDom.deptNameInput.value.trim(), maphongban: HRDom.deptCodeInput.value.trim() || null };
            
            if (!isCompany && !id) {
                data.phongbancha_id = HRDom.parentIdInput.value || null;
                data.congty = HRDom.companyIdInput.value;
            }

            const result = await HRUtils.apiFetch(url, { method, body: data });
            if (result?.success) {
                HRUtils.showToast(result.message || `Đã ${id ? 'cập nhật' : 'thêm'} thành công.`);
                closeDeptModal();
                HRState.treeCache = null;
                await fetchTree(true);
            } else {
                HRUtils.showToast(result?.message || 'Đã xảy ra lỗi.', true);
            }
        });
    }

    async function deleteItem() {
        if (!HRState.deleteItem.id && !HRState.deleteItem.ids) return;
        
        await HRUtils.executeWithLoading(HRDom.confirmDeleteDeptBtn, 'Đang xóa...', async () => {
            let url, body = null;
            const method = 'DELETE';
            const { type, id, ids } = HRState.deleteItem;
            if (type === 'company') {
                url = `${HRAPI.COMPANY}${id}/`;
            } else if (type === 'department') {
                url = `${HRAPI.DEPT}${id}/`;
            } else if (type === 'employee') {
                url = `${HRAPI.EMPLOYEE}${id}/`;
            } else if (type === 'employees') {
                url = HRAPI.EMPLOYEE;
                body = { ids };
            }
            
            const result = await HRUtils.apiFetch(url, { method, body });
            if (result?.success) {
                HRUtils.showToast(result.message || 'Xóa thành công!');
                closeDeleteModal();
                if (type === 'company' || type === 'department') {
                    HRState.treeCache = null;
                    await fetchTree(true);
                    
                    if (HRState.selectedDeptId === id) {
                        HRState.selectedDeptId = HRState.selectedCompanyId = null;
                        HRDom.employeeListTitle.textContent = 'Tất cả nhân viên';
                        window.HREmployee.fetchEmployees(true);
                    }
                } else {
                    window.HREmployee.clearSelection();
                    window.HREmployee.fetchEmployees(true);
                }
            } else {
                HRUtils.showToast(result?.message || 'Không thể xóa.', true);
            }
        });
    }

    // ============ EVENT LISTENERS ============
    
    // Sidebar
    HRDom.openSidebarBtn?.addEventListener('click', () => HRUtils.toggleSidebar(true));
    HRDom.closeSidebarBtn?.addEventListener('click', () => HRUtils.toggleSidebar(false));
    HRDom.sidebarOverlay?.addEventListener('click', () => HRUtils.toggleSidebar(false));

    // View All
    HRDom.viewAllEmployees?.addEventListener('click', () => {
        updateSelection({ selectedDeptId: null, selectedCompanyId: null, selectedLevel: 0, deptName: 'Tất cả nhân viên' });
        highlightTreeItem('');
        HRDom.viewAllEmployees.classList.add('selected');
        HRDom.employeeListTitle.textContent = 'Tất cả nhân viên';
        window.HREmployee.fetchEmployees(true);
        HRUtils.closeSidebar();
    });

    // Company & Dept Modals
    HRDom.addCompanyBtn?.addEventListener('click', () => openCompanyModal('add'));
    HRDom.deptForm?.addEventListener('submit', saveItem);
    HRDom.closeDeptModalBtn?.addEventListener('click', closeDeptModal);
    HRDom.closeDeptModalBtnX?.addEventListener('click', closeDeptModal);
    HRDom.confirmDeleteDeptBtn?.addEventListener('click', deleteItem);
    HRDom.cancelDeleteDeptBtn?.addEventListener('click', closeDeleteModal);
    
    // Close modal on backdrop click
    HRDom.deptModal?.addEventListener('click', (e) => e.target === HRDom.deptModal && closeDeptModal());
    HRDom.deleteDeptModal?.addEventListener('click', (e) => e.target === HRDom.deleteDeptModal && closeDeleteModal());

    // Tree search with debounce
    let treeSearchTimer;
    HRDom.treeSearchInput?.addEventListener('input', () => {
        clearTimeout(treeSearchTimer);
        treeSearchTimer = setTimeout(() => {
            const query = (HRDom.treeSearchInput.value || '').toLowerCase().trim();
            document.querySelectorAll('.tree-item').forEach(item => {
                const li = item.closest('li');
                if (li) {
                    const name = (item.dataset.name || '').toLowerCase();
                    li.style.display = (!query || name.includes(query)) ? '' : 'none';
                }
            });
        }, 200);
    });

    // Auto-generate code from name
    if (HRDom.deptNameInput && typeof generatePositionCode === 'function') {
        HRDom.deptNameInput.addEventListener('input', () => {
            if (!HRDom.deptIdInput.value && !HRDom.deptCodeInput.disabled) {
                HRDom.deptCodeInput.value = generatePositionCode(HRDom.deptNameInput.value || '');
            }
        });
    }

    // Share modal functions
    HRUtils.openDeleteModal = openDeleteModal;
    HRUtils.closeDeleteModal = closeDeleteModal;
    HRUtils.deleteItem = deleteItem;

    // ============ INITIALIZATION ============
    fetchTree();
});