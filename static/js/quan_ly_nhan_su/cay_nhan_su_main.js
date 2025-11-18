// ============ CÂY NHÂN SỰ - MAIN MODULE ============
// File: cay_nhan_su_main.js

document.addEventListener('DOMContentLoaded', () => {
    // ============ CONFIGURATION ============
    const CONFIG = {
        API_BASE: '/hrm/to-chuc-nhan-su/api/v1',
        CSRF_TOKEN: document.getElementById('csrf-token')?.value || '',
        PAGE_SIZE: 10,
        TOAST_DURATION: 3000,
        SEARCH_DEBOUNCE: 400
    };

    const API = {
        TREE: `${CONFIG.API_BASE}/phong-ban/tree/`,
        EMPLOYEES: `${CONFIG.API_BASE}/phong-ban/employee/`,
        DEPT: `${CONFIG.API_BASE}/phong-ban/`,
        COMPANY: `${CONFIG.API_BASE}/cong-ty/`,
        EMPLOYEE: `${CONFIG.API_BASE}/nhan-vien/`
    };

    // ============ GLOBAL STATE ============
    window.HRState = {
        selectedDeptId: null,
        selectedCompanyId: null,
        selectedLevel: 0,
        deptName: 'Tất cả nhân viên',
        filters: { search: '', trangThai: '', gioiTinh: '' },
        deleteItem: { id: null, ids: null, type: null, name: '' },
        selectedEmployees: new Set(),
        treeCache: null,
        employeeFetchController: null,
        toastTimer: null,
        currentPage: 1,
        pageSize: CONFIG.PAGE_SIZE,
        totalPages: 1,
        hasNext: false
    };

    // ============ DOM CACHE ============
    const $ = id => document.getElementById(id);
    const $$ = sel => document.querySelectorAll(sel);

    window.HRDom = {
        // Tree & Sidebar
        treeContainer: $('org-tree-container'),
        viewAllEmployees: $('view-all-employees'),
        treeSearchInput: $('tree-search-input'),
        addCompanyBtn: $('add-company-btn'),
        openSidebarBtn: $('open-sidebar-btn'),
        closeSidebarBtn: $('close-sidebar-btn'),
        sidebarOverlay: $('sidebar-overlay'),
        treeSidebar: $('tree-sidebar'),
        totalEmployeeCount: $('total-employee-count'),
        
        // Employee Table
        employeeTableBody: $('employee-table-body'),
        employeeListTitle: $('employee-list-title'),
        pageTotal: $('page-total'),
        selectAllCheckbox: $('select-all-checkbox'),
        
        // Bulk Actions
        bulkActions: $('bulk-actions'),
        selectedCount: $('selected-count'),
        bulkDeleteBtn: $('bulk-delete-btn'),
        bulkExportBtn: $('bulk-export-btn'),
        clearSelectionBtn: $('clear-selection-btn'),
        
        // Filters
        filterForm: $('employee-filter-form'),
        filterSearch: $('filter-search'),
        filterTrangThai: $('filter-trang-thai'),
        filterGioiTinh: $('filter-gioi-tinh'),
        
        // Modals
        deptModal: $('dept-modal'),
        deptModalContent: $('dept-modal-content'),
        deptForm: $('dept-form'),
        deptModalTitle: $('dept-modal-title'),
        deptModalParentInfo: $('dept-modal-parent-info'),
        deptIdInput: $('dept-id-input'),
        parentIdInput: $('parent-id-input'),
        companyIdInput: $('company-id-input'),
        deptLevelInput: $('dept-level-input'),
        deptNameInput: $('dept-name-input'),
        deptCodeInput: $('dept-code-input'),
        closeDeptModalBtn: $('close-dept-modal-btn'),
        closeDeptModalBtnX: $('close-dept-modal-btn-x'),
        saveDeptBtn: $('save-dept-btn'),
        
        employeeModal: $('employee-modal'),
        employeeModalContent: $('employee-modal-content'),
        employeeForm: $('employee-form'),
        employeeModalTitle: $('employee-modal-title'),
        employeeModalParentInfo: $('employee-modal-parent-info'),
        employeeIdInput: $('employee-id-input'),
        manhanvienInput: $('manhanvien-input'),
        hovatenInput: $('hovaten-input'),
        emailInput: $('email-input'),
        sodienthoaiInput: $('sodienthoai-input'),
        diachiInput: $('diachi-input'),
        gioitinhInput: $('gioitinh-input'),
        ngaysinhInput: $('ngaysinh-input'),
        socccdInput: $('socccd-input'),
        ngayvaolamInput: $('ngayvaolam-input'),
        loainvInput: $('loainv-input'),
        trangthainvInput: $('trangthainv-input'),
        nganhangInput: $('nganhang-input'),
        sotknganhangInput: $('sotknganhang-input'),
        tentknganhangInput: $('tentknganhang-input'),
        masothueInput: $('masothue-input'),
        trangthaiInput: $('trangthai-input'),
        userIdInput: $('user_id-input'),
        closeEmployeeModalBtn: $('close-employee-modal-btn'),
        closeEmployeeModalBtnX: $('close-employee-modal-btn-x'),
        saveEmployeeBtn: $('save-employee-btn'),
        
        deleteDeptModal: $('delete-dept-modal'),
        deleteModalContent: $('delete-modal-content'),
        deleteDeptName: $('delete-dept-name'),
        deleteModalTitle: $('delete-modal-title'),
        confirmDeleteDeptBtn: $('confirm-delete-dept-btn'),
        cancelDeleteDeptBtn: $('cancel-delete-dept-btn'),
        
        // Pagination
        paginationInfo: $('pagination-info'),
        prevPageBtn: $('prev-page-btn'),
        nextPageBtn: $('next-page-btn'),
        currentPageSpan: $('current-page'),
        pageSizeSelect: $('page-size-select'),
        
        // Templates & Toast
        treeItemTemplate: $('tree-item-template'),
        employeeRowTemplate: $('employee-row-template'),
        toast: $('toast-notification'),
        toastMessage: $('toast-message')
    };

    // ============ UTILITY FUNCTIONS ============
    
    window.HRUtils = {
        // API Helper
        async apiFetch(url, options = {}) {
            const config = {
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': CONFIG.CSRF_TOKEN
                },
                ...options
            };
            if (options.body) config.body = JSON.stringify(options.body);
            
            const response = await fetch(url, config);
            const data = response.status === 204 ? null : await response.json();
            
            if (!response.ok) {
                throw new Error(data?.message || `Lỗi ${response.status}`);
            }
            return data;
        },

        // Toast Notification
        showToast(message, isError = false) {
            const { toast, toastMessage } = window.HRDom;
            if (!toast || !toastMessage) return;
            
            clearTimeout(window.HRState.toastTimer);
            
            toastMessage.textContent = message;
            toast.className = `fixed bottom-5 right-5 z-50 px-4 py-3 rounded-md shadow-lg transition-all duration-300
                ${isError ? 'bg-red-600' : 'bg-green-600'} text-white max-w-sm`;
            toast.style.display = 'block';
            
            requestAnimationFrame(() => {
                toast.classList.remove('opacity-0', 'translate-x-full', 'pointer-events-none');
                toast.classList.add('opacity-100', 'translate-x-0');
            });
            
            window.HRState.toastTimer = setTimeout(() => {
                toast.classList.add('opacity-0', 'translate-x-full', 'pointer-events-none');
                toast.classList.remove('opacity-100', 'translate-x-0');
                setTimeout(() => {
                    toast.style.display = 'none';
                }, 300);
            }, CONFIG.TOAST_DURATION);
        },

        // Execute with loading state
        async executeWithLoading(button, loadingText, action) {
            const originalText = button.textContent;
            button.disabled = true;
            button.textContent = loadingText;
            try {
                await action();
            } catch (error) {
                this.showToast('Lỗi: ' + error.message, true);
            } finally {
                button.disabled = false;
                button.textContent = originalText;
            }
        },

        // Modal Management
        showModal(modal, content, onShow) {
            modal.classList.remove('hidden');
            modal.classList.add('flex');
            requestAnimationFrame(() => {
                modal.classList.remove('opacity-0');
                content.classList.add('scale-100');
                content.classList.remove('scale-95');
                if (onShow) setTimeout(onShow, 100);
            });
        },

        closeModal(modal, content, onClose) {
            modal.classList.add('opacity-0');
            content.classList.add('scale-95');
            content.classList.remove('scale-100');
            setTimeout(() => {
                modal.classList.add('hidden');
                modal.classList.remove('flex');
                if (onClose) onClose();
            }, 200);
        },

        // Sidebar Toggle
        toggleSidebar(show) {
            window.HRDom.treeSidebar?.classList.toggle('show', show);
            window.HRDom.sidebarOverlay?.classList.toggle('show', show);
        },

        closeSidebar() {
            if (window.innerWidth < 1024) this.toggleSidebar(false);
        }
    };

    // Export config and API
    window.HRAPI = API;
    window.HRConfig = CONFIG;
});