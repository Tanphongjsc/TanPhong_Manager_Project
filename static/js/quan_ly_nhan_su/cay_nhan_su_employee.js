// ============ CÂY NHÂN SỰ - EMPLOYEE MODULE ============
// File: cay_nhan_su_employee.js

document.addEventListener('DOMContentLoaded', () => {
    const { HRState, HRDom, HRUtils, HRAPI, HRConfig } = window;
    
    // ============ EMPLOYEE FUNCTIONS ============
    
    async function fetchEmployees(resetPage = false) {
        if (resetPage) HRState.currentPage = 1;

        // Cancel previous request
        if (HRState.employeeFetchController) {
            HRState.employeeFetchController.abort();
        }
        HRState.employeeFetchController = new AbortController();
        
        HRDom.employeeTableBody.innerHTML = '<tr><td colspan="7" class="px-6 py-10 text-center text-slate-500"><i class="fas fa-spinner fa-spin mr-2"></i>Đang tải...</td></tr>';
        
        const params = new URLSearchParams({
            page: HRState.currentPage,
            page_size: HRState.pageSize
        });
        
        if (HRState.selectedDeptId) params.append('phongban_id', HRState.selectedDeptId);
        else if (HRState.selectedCompanyId) params.append('congty_id', HRState.selectedCompanyId);
        if (HRState.filters.search) params.append('search', HRState.filters.search);
        if (HRState.filters.trangThai) params.append('trangthainv', HRState.filters.trangThai);
        if (HRState.filters.gioiTinh) params.append('gioitinh', HRState.filters.gioiTinh);

        try {
            const result = await HRUtils.apiFetch(`${HRAPI.EMPLOYEES}?${params}`, {
                signal: HRState.employeeFetchController.signal
            });
            
            const employees = result.data || [];
            const pagination = result.pagination || {
                page: 1,
                page_size: HRState.pageSize,
                total: employees.length,
                total_pages: 1,
                has_next: false,
                has_prev: false
            };
            
            // Update state
            Object.assign(HRState, {
                currentPage: pagination.page,
                totalPages: pagination.total_pages,
                hasNext: pagination.has_next
            });
            
            renderEmployeeTable(employees);
            updatePaginationUI(pagination);
            
            if (!HRState.selectedDeptId && !Object.values(HRState.filters).some(v => v)) {
                HRDom.totalEmployeeCount.textContent = `(${pagination.total})`;
            }
        } catch (error) {
            if (error.name !== 'AbortError') {
                HRDom.employeeTableBody.innerHTML = '<tr><td colspan="7" class="px-6 py-10 text-center text-red-500">Không thể tải danh sách.</td></tr>';
                updatePaginationUI({ total: 0, page: 1, total_pages: 0 });
                HRUtils.showToast('Lỗi: ' + error.message, true);
            }
        }
    }

    function renderEmployeeTable(employees) {
        HRDom.employeeTableBody.innerHTML = '';
        HRState.selectedEmployees.clear();
        updateBulkActions();
        
        if (!employees.length) {
            HRDom.employeeTableBody.innerHTML = '<tr><td colspan="7" class="px-6 py-10 text-center text-slate-500">Không tìm thấy nhân viên.</td></tr>';
            return;
        }

        const fragment = document.createDocumentFragment();
        employees.forEach(emp => {
            const clone = HRDom.employeeRowTemplate.content.cloneNode(true);
            
            // Checkbox
            clone.querySelector('.employee-checkbox').dataset.id = emp.id;
            
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

            // Actions
            clone.querySelector('.btn-edit-employee').onclick = () => editEmployee(emp.id);
            clone.querySelector('.btn-delete-employee').onclick = () => HRUtils.openDeleteModal(emp.id, name, 'employee');

            fragment.appendChild(clone);
        });
        HRDom.employeeTableBody.appendChild(fragment);
    }

    function updatePaginationUI(pagination) {
        const { total, page, total_pages, has_next, has_prev } = pagination;
        
        // Update info text
        if (HRDom.paginationInfo) {
            const start = (page - 1) * HRState.pageSize + 1;
            const end = Math.min(page * HRState.pageSize, total);
            HRDom.paginationInfo.textContent = total > 0 
                ? `Hiển thị ${start}-${end} trong tổng ${total} nhân viên`
                : 'Không có nhân viên';
        }
        
        // Update current page
        if (HRDom.currentPageSpan) {
            HRDom.currentPageSpan.textContent = `Trang ${page} / ${total_pages || 1}`;
        }
        
        // Update buttons
        if (HRDom.prevPageBtn) {
            HRDom.prevPageBtn.disabled = !has_prev;
            HRDom.prevPageBtn.classList.toggle('opacity-50', !has_prev);
            HRDom.prevPageBtn.classList.toggle('cursor-not-allowed', !has_prev);
        }
        
        if (HRDom.nextPageBtn) {
            HRDom.nextPageBtn.disabled = !has_next;
            HRDom.nextPageBtn.classList.toggle('opacity-50', !has_next);
            HRDom.nextPageBtn.classList.toggle('cursor-not-allowed', !has_next);
        }
    }

    // ============ PAGINATION FUNCTIONS ============
    
    function goToPage(pageNumber) {
        if (pageNumber < 1 || pageNumber > HRState.totalPages) return;
        HRState.currentPage = pageNumber;
        fetchEmployees();
    }

    // ============ BULK SELECTION FUNCTIONS ============
    
    function updateBulkActions() {
        const count = HRState.selectedEmployees.size;
        HRDom.selectedCount.textContent = `${count} đã chọn`;
        HRDom.bulkActions.classList.toggle('show', count > 0);
        
        const allCheckboxes = document.querySelectorAll('.employee-checkbox');
        const checkedCount = document.querySelectorAll('.employee-checkbox:checked').length;
        HRDom.selectAllCheckbox.checked = allCheckboxes.length > 0 && checkedCount === allCheckboxes.length;
        HRDom.selectAllCheckbox.indeterminate = checkedCount > 0 && checkedCount < allCheckboxes.length;
    }

    function handleSelectAll(checked) {
        HRState.selectedEmployees.clear();
        document.querySelectorAll('.employee-checkbox').forEach(cb => {
            cb.checked = checked;
            if (checked) HRState.selectedEmployees.add(cb.dataset.id);
        });
        updateBulkActions();
    }

    function handleEmployeeCheckbox(checkbox) {
        const id = checkbox.dataset.id;
        checkbox.checked ? HRState.selectedEmployees.add(id) : HRState.selectedEmployees.delete(id);
        updateBulkActions();
    }

    function clearSelection() {
        HRState.selectedEmployees.clear();
        document.querySelectorAll('.employee-checkbox').forEach(cb => cb.checked = false);
        HRDom.selectAllCheckbox.checked = false;
        updateBulkActions();
    }

    function bulkDelete() {
        if (HRState.selectedEmployees.size === 0) return;
        const ids = Array.from(HRState.selectedEmployees);
        const name = `${HRState.selectedEmployees.size} nhân viên`;
        HRUtils.openDeleteModal(null, name, 'employees', ids);
    }

    function bulkExport() {
        if (HRState.selectedEmployees.size === 0) return;
        HRUtils.showToast(`Đang xuất ${HRState.selectedEmployees.size} nhân viên...`);
    }

    // ============ EMPLOYEE MODAL FUNCTIONS ============

    async function editEmployee(id) {
        try {
            const emp = await HRUtils.apiFetch(`${HRAPI.EMPLOYEE}${id}/`);
            openEmployeeModal('edit', emp);
        } catch (error) {
            HRUtils.showToast('Lỗi khi tải dữ liệu nhân viên', true);
        }
    }

    function openEmployeeModal(mode, emp = null) {
        HRDom.employeeForm.reset();
        HRDom.employeeIdInput.value = '';
        
        if (mode === 'add') {
            HRDom.employeeModalTitle.textContent = 'Thêm nhân viên';
            HRDom.employeeModalParentInfo.textContent = '';
        } else if (mode === 'edit' && emp) {
            HRDom.employeeModalTitle.textContent = 'Cập nhật nhân viên';
            HRDom.employeeModalParentInfo.textContent = `Đang sửa: ${emp.hovaten}`;
            HRDom.employeeIdInput.value = emp.id;
            HRDom.manhanvienInput.value = emp.manhanvien || '';
            HRDom.hovatenInput.value = emp.hovaten || '';
            HRDom.emailInput.value = emp.email || '';
            HRDom.sodienthoaiInput.value = emp.sodienthoai || '';
            HRDom.diachiInput.value = emp.diachi || '';
            HRDom.gioitinhInput.value = emp.gioitinh || '';
            HRDom.ngaysinhInput.value = emp.ngaysinh || '';
            HRDom.socccdInput.value = emp.socccd || '';
            HRDom.ngayvaolamInput.value = emp.ngayvaolam || '';
            HRDom.loainvInput.value = emp.loainv || '';
            HRDom.trangthainvInput.value = emp.trangthainv || '';
            HRDom.nganhangInput.value = emp.nganhang || '';
            HRDom.sotknganhangInput.value = emp.sotknganhang || '';
            HRDom.tentknganhangInput.value = emp.tentknganhang || '';
            HRDom.masothueInput.value = emp.masothue || '';
            HRDom.trangthaiInput.value = emp.trangthai || '';
            HRDom.userIdInput.value = emp.user_id || '';
        }
        
        HRUtils.showModal(HRDom.employeeModal, HRDom.employeeModalContent, () => HRDom.hovatenInput.focus());
    }

    const closeEmployeeModal = () => HRUtils.closeModal(HRDom.employeeModal, HRDom.employeeModalContent);

    async function saveEmployee(e) {
        e.preventDefault();
        const id = HRDom.employeeIdInput.value;
        
        await HRUtils.executeWithLoading(HRDom.saveEmployeeBtn, 'Đang xử lý...', async () => {
            const url = id ? `${HRAPI.EMPLOYEE}${id}/` : HRAPI.EMPLOYEE;
            const method = id ? 'PUT' : 'POST';
            const data = {
                manhanvien: HRDom.manhanvienInput.value.trim() || null,
                hovaten: HRDom.hovatenInput.value.trim(),
                email: HRDom.emailInput.value.trim() || null,
                sodienthoai: HRDom.sodienthoaiInput.value.trim() || null,
                diachi: HRDom.diachiInput.value.trim() || null,
                gioitinh: HRDom.gioitinhInput.value || null,
                ngaysinh: HRDom.ngaysinhInput.value || null,
                socccd: HRDom.socccdInput.value.trim() || null,
                ngayvaolam: HRDom.ngayvaolamInput.value || null,
                loainv: HRDom.loainvInput.value.trim() || null,
                trangthainv: HRDom.trangthainvInput.value || null,
                nganhang: HRDom.nganhangInput.value.trim() || null,
                sotknganhang: HRDom.sotknganhangInput.value.trim() || null,
                tentknganhang: HRDom.tentknganhangInput.value.trim() || null,
                masothue: HRDom.masothueInput.value.trim() || null,
                trangthai: HRDom.trangthaiInput.value.trim() || null,
                user_id: HRDom.userIdInput.value || null
            };

            const result = await HRUtils.apiFetch(url, { method, body: data });
            if (result?.success) {
                HRUtils.showToast(result.message || `Đã ${id ? 'cập nhật' : 'thêm'} nhân viên thành công.`);
                closeEmployeeModal();
                fetchEmployees(true);
            } else {
                HRUtils.showToast(result?.message || 'Đã xảy ra lỗi.', true);
            }
        });
    }

    // ============ EVENT LISTENERS ============
    
    // Filters
    HRDom.filterForm?.addEventListener('submit', (e) => e.preventDefault());
    
    let searchTimer;
    HRDom.filterSearch?.addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
            HRState.filters.search = HRDom.filterSearch.value.trim();
            fetchEmployees(true);
        }, HRConfig.SEARCH_DEBOUNCE);
    });
    
    HRDom.filterTrangThai?.addEventListener('change', () => {
        HRState.filters.trangThai = HRDom.filterTrangThai.value;
        fetchEmployees(true);
    });
    
    HRDom.filterGioiTinh?.addEventListener('change', () => {
        HRState.filters.gioiTinh = HRDom.filterGioiTinh.value;
        fetchEmployees(true);
    });

    // Bulk Actions
    HRDom.selectAllCheckbox?.addEventListener('change', (e) => handleSelectAll(e.target.checked));
    HRDom.employeeTableBody?.addEventListener('change', (e) => {
        if (e.target.classList.contains('employee-checkbox')) {
            handleEmployeeCheckbox(e.target);
        }
    });
    HRDom.clearSelectionBtn?.addEventListener('click', clearSelection);
    HRDom.bulkDeleteBtn?.addEventListener('click', bulkDelete);
    HRDom.bulkExportBtn?.addEventListener('click', bulkExport);

    // Pagination
    HRDom.prevPageBtn?.addEventListener('click', () => {
        if (HRState.currentPage > 1) goToPage(HRState.currentPage - 1);
    });
    HRDom.nextPageBtn?.addEventListener('click', () => {
        if (HRState.hasNext) goToPage(HRState.currentPage + 1);
    });
    HRDom.pageSizeSelect?.addEventListener('change', (e) => {
        HRState.pageSize = parseInt(e.target.value, 10);
        fetchEmployees(true);
    });

    // Employee Modals
    HRDom.addEmployeeBtn = document.getElementById('add-employee-btn');
    HRDom.addEmployeeBtn?.addEventListener('click', () => openEmployeeModal('add'));
    HRDom.employeeForm?.addEventListener('submit', saveEmployee);
    HRDom.closeEmployeeModalBtn?.addEventListener('click', closeEmployeeModal);
    HRDom.closeEmployeeModalBtnX?.addEventListener('click', closeEmployeeModal);
    HRDom.employeeModal?.addEventListener('click', (e) => e.target === HRDom.employeeModal && closeEmployeeModal());

    // ============ EXPORT PUBLIC API ============
    window.HREmployee = { fetchEmployees, goToPage, clearSelection };

    // ============ INITIALIZATION ============
    fetchEmployees();
});