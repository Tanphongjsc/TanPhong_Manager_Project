/**
 * QUẢN LÝ CÂY TỔ CHỨC & NHÂN SỰ
 * Optimized with AppUtils: Form, API, Validation, EventManager, UI.
 */

// --- 1. QUẢN LÝ CÂY TỔ CHỨC ---
class TreeManager {
    constructor() {
        this.els = {
            root: document.getElementById('tree-root'),
            template: document.getElementById('tree-node-template'),
            title: document.getElementById('list-title'),
            viewAll: document.getElementById('view-all-employees'),
            sidebar: document.getElementById('tree-sidebar'),
            overlay: document.getElementById('sidebar-overlay'),
            search: document.getElementById('tree-search-input')
        };
        this.apiUrl = '/hrm/to-chuc-nhan-su/api/v1/phong-ban/tree/';
        this.eventManager = AppUtils.EventManager.create();
    }

    init() {
        this.fetchTree();
        this.initEvents();
    }

    async fetchTree() {
        this.els.root.innerHTML = '<div class="text-center py-4 text-slate-400 text-xs"><i class="fas fa-spinner fa-spin"></i> Đang tải...</div>';
        try {
            const res = await AppUtils.API.get(this.apiUrl);
            this.renderTree(res.data || []);
        } catch (e) {
            this.els.root.innerHTML = '<div class="text-center py-4 text-red-400 text-xs">Lỗi tải dữ liệu</div>';
            AppUtils.Notify.error('Không thể tải cây tổ chức');
        }
    }

    renderTree(data) {
        this.els.root.innerHTML = '';
        if (!data.length) return this.els.root.innerHTML = '<div class="text-center py-4 text-slate-400 text-xs">Chưa có dữ liệu</div>';

        const build = (items, container) => {
            items.forEach(item => {
                const clone = this.els.template.content.cloneNode(true);
                const li = clone.querySelector('li');
                const div = clone.querySelector('.tree-item');
                const childrenUl = clone.querySelector('.tree-children');

                const isCompany = item.type === 'company' || (!item.phongbancha_id && item.tencongty_vi);
                const name = isCompany ? item.tencongty_vi : item.tenphongban;
                const companyId = isCompany ? item.id : (item.congty_id || item.company_id || item.congty?.id);

                div.dataset.id = item.id;
                div.dataset.companyId = companyId || '';

                clone.querySelector('.tree-name').textContent = name;
                clone.querySelector('.tree-icon').className = `tree-icon fas ${isCompany ? 'fa-building text-blue-600' : 'fa-folder text-yellow-500'}`;

                // Mobile Actions
                if (window.innerWidth < 1024) {
                    const actions = clone.querySelector('.group-hover\\:flex');
                    if(actions) actions.classList.replace('hidden', 'flex'); // Simplified class switch
                    if(actions) actions.classList.add('lg:hidden', 'lg:group-hover:flex');
                }

                // Children
                const children = item.children || item.departments;
                if (children?.length) {
                    const toggle = clone.querySelector('.tree-toggle');
                    toggle.classList.remove('invisible');
                    toggle.onclick = (e) => {
                        e.stopPropagation();
                        childrenUl.classList.toggle('hidden');
                        const icon = toggle.querySelector('i');
                        icon.classList.toggle('fa-chevron-right');
                        icon.classList.toggle('fa-chevron-down');
                    };
                    build(children, childrenUl);
                }

                // Node Selection
                div.onclick = (e) => {
                    if (e.target.closest('button')) return;
                    this.selectNode(div, item.id, name, isCompany);
                };

                // CRUD Buttons
                const bind = (sel, fn) => { const b = div.querySelector(sel); if(b) b.onclick = (e) => { e.stopPropagation(); fn(); }; };
                
                if (isCompany) {
                    bind('.btn-add-sub', () => window.DeptManager.openAddSub(item.id, true, name, companyId));
                    bind('.btn-edit', () => window.CompanyManager.openEditCompany(item.id));
                    bind('.btn-delete', () => window.CompanyManager.deleteCompany(item.id, name));
                } else {
                    bind('.btn-add-sub', () => window.DeptManager.openAddSub(item.id, false, name, companyId));
                    bind('.btn-edit', () => window.DeptManager.openEditDept(item.id));
                    bind('.btn-delete', () => window.DeptManager.deleteDept(item.id, name));
                }
                container.appendChild(li);
            });
        };
        build(data, this.els.root);
    }

    selectNode(el, id, name, isCompany) {
        document.querySelectorAll('.tree-item').forEach(i => i.classList.remove('bg-blue-50', 'text-blue-700', 'font-medium'));
        this.els.viewAll.classList.remove('bg-blue-50', 'text-blue-700', 'font-medium');
        
        el.classList.add('bg-blue-50', 'text-blue-700', 'font-medium');
        this.els.title.textContent = name;
        this.toggleSidebar(false);

        window.EmployeeManager.filterByOrg(isCompany ? { congty_id: id, phongban_id: null } : { phongban_id: id, congty_id: null });
    }

    toggleSidebar(show) {
        this.els.sidebar.classList.toggle('open', show);
        this.els.overlay.classList.toggle('hidden', !show);
    }

    initEvents() {
        this.eventManager.add(this.els.viewAll, 'click', () => {
            this.selectNode(this.els.viewAll, null, 'Tất cả nhân viên', false);
            window.EmployeeManager.resetFilter();
        });

        // Debounce Search using AppUtils.Helper
        this.eventManager.add(this.els.search, 'input', AppUtils.Helper.debounce((e) => {
            const val = AppUtils.Helper.removeAccents(e.target.value.toLowerCase());
            this.els.root.querySelectorAll('.tree-item').forEach(item => {
                const li = item.closest('li');
                const text = AppUtils.Helper.removeAccents(item.textContent.toLowerCase());
                const match = text.includes(val);
                li.style.display = match ? 'block' : 'none';
                if (match && val) { // Show parents
                    let p = li.parentElement.closest('li');
                    while(p) { p.style.display = 'block'; p.querySelector('.tree-children')?.classList.remove('hidden'); p = p.parentElement.closest('li'); }
                }
            });
            if(!val) this.els.root.querySelectorAll('li').forEach(li => li.style.display = 'block');
        }, 300));
    }
}

// --- 2. QUẢN LÝ NHÂN VIÊN ---
class EmployeeManager extends BaseCRUDManager {
    constructor() {
        super({
            sidebarId: 'employee-sidebar',
            overlayId: 'employee-sidebar-overlay',
            formId: 'employee-form',
            codeField: 'manhanvien',
            entityName: 'nhân viên',
            autoCode: { sourceField: 'hovaten', targetField: 'manhanvien' },
            apiUrls: {
                detail: (id) => `/hrm/to-chuc-nhan-su/api/v1/nhan-vien/${id}/`,
                create: '/hrm/to-chuc-nhan-su/api/v1/nhan-vien/',
                update: (id) => `/hrm/to-chuc-nhan-su/api/v1/nhan-vien/${id}/`,
                delete: (id) => `/hrm/to-chuc-nhan-su/api/v1/nhan-vien/${id}/`,
            },
            onRefreshTable: () => this.tableManager?.refresh(),
            fillFormData: (data) => this._fillEmployeeForm(data),
            onResetForm: () => this._resetCustomState()
        });

        this.lookupData = { chucvu: [], nganhang: [], phongban: [] };
        this.phongbanDropdown = { isOpen: false, selectedId: null, selectedText: '' };
        this.currentCongTac = null;
        this.eventManager = AppUtils.EventManager.create();
    }

    init() {
        super.init();
        this.initTable();
        this.loadLookupData();
        this._initExtraButtons();
        this._initBulkActions();
    }

    async loadLookupData() {
        try {
            const [cv, nh, pb] = await Promise.all([
                AppUtils.API.get('/hrm/to-chuc-nhan-su/api/v1/chuc-vu/'),
                AppUtils.API.get('/hrm/to-chuc-nhan-su/api/ngan-hang/list/'),
                AppUtils.API.get('/hrm/to-chuc-nhan-su/api/v1/phong-ban/')
            ]);
            this.lookupData = { chucvu: cv.data || [], nganhang: nh.data || [], phongban: pb.data || [] };
            
            // Render basic selects
            const fillSelect = (id, items, valK, textK) => {
                const el = document.getElementById(id);
                if(el) el.innerHTML = '<option value="">-- Chọn --</option>' + items.map(i => `<option value="${i[valK]}">${i[textK] || i[valK]}</option>`).join('');
            };
            fillSelect('chucvu', this.lookupData.chucvu, 'id', 'tenvitricongviec');
            fillSelect('nganhang', this.lookupData.nganhang, 'id', 'TenNganHang');
            
            this._initPhongbanDropdown();
        } catch (e) { console.error('Lookup Data Error', e); }
    }

    _initExtraButtons() {
        this.extraActionsContainer = document.getElementById('employee-sidebar-extra-actions');
    }

// --- LOGIC XỬ LÝ HÀNG LOẠT (BULK) ---
    _initBulkActions() {
        // UI Elements
        const els = {
            btnMore: document.getElementById('btn-bulk-more'),
            menu: document.getElementById('bulk-options-menu'),
            transferModalBtn: document.getElementById('btn-save-transfer'),
            actionsContainer: document.querySelector('.bulk-actions-container') // Container chính
        };

        if (!els.btnMore) return;

        // 1. Toggle Dropdown Menu
        this.eventManager.add(els.btnMore, 'click', (e) => {
            e.stopPropagation();
            els.menu.classList.toggle('hidden');
        });

        // 2. Close Menu when clicking outside
        this.eventManager.add(document, 'click', (e) => {
            if (!els.btnMore.contains(e.target) && !els.menu.contains(e.target)) {
                els.menu.classList.add('hidden');
            }
        });

        // 3. Handle Action Clicks (Event Delegation)
        // Lắng nghe click vào các nút con có attribute [data-action]
        this.eventManager.add(els.menu, 'click', (e) => {
            const actionBtn = e.target.closest('[data-action]');
            if (!actionBtn) return;
            
            els.menu.classList.add('hidden'); // Ẩn menu ngay
            const actionType = actionBtn.dataset.action;
            this.handleBulkAction(actionType);
        });

        // 4. Handle Modal Submit (Transfer)
        if (els.transferModalBtn) {
            this.eventManager.add(els.transferModalBtn, 'click', () => this.submitBulkTransfer());
        }
    }

    /**
     * Hàm điều phối xử lý hành động
     * @param {string} actionType - 'transfer' | 'terminate'
     */
    handleBulkAction(actionType) {
        const selectedIds = this.tableManager.getSelectedItems();
        if (!selectedIds.length) return AppUtils.Notify.warning('Chưa chọn nhân viên nào');

        switch (actionType) {
            case 'transfer':
                this.openTransferModal(selectedIds.length);
                break;
                
            case 'terminate':
                AppUtils.Modal.showConfirm({
                    title: 'Xác nhận nghỉ việc',
                    message: `Bạn có chắc chắn muốn thiết lập trạng thái <b>"Đã nghỉ việc"</b> cho <b class="text-red-600">${selectedIds.length}</b> nhân viên đã chọn?`,
                    type: 'danger',
                    confirmText: 'Đồng ý',
                    onConfirm: () => this.executeBulkAPI('terminate', selectedIds)
                });
                break;
        }
    }

    // --- Logic Modal Chuyển công tác ---
    
    openTransferModal(count) {
        // 1. Fill data
        const countEl = document.getElementById('bulk-transfer-count');
        const select = document.getElementById('bulk-transfer-select');
        
        if (countEl) countEl.textContent = count;
        
        // Populate Select từ lookupData đã cache (Tránh gọi lại API)
        if (select && this.lookupData.phongban) {
            select.innerHTML = '<option value="">-- Chọn phòng ban mới --</option>' + 
                this.lookupData.phongban.map(pb => `<option value="${pb.id}">${pb.tenphongban}</option>`).join('');
        }

        // 2. Clear error & form
        const errEl = document.getElementById('err-bulk-dept');
        if(errEl) errEl.classList.add('hidden');
        document.getElementById('form-bulk-transfer')?.reset();

        // 3. Show Modal
        this.toggleModal('modal-bulk-transfer', true);
    }

    toggleModal(modalId, show) {
        const modal = document.getElementById(modalId);
        if(!modal) return;
        
        // Sử dụng Tailwind classes để show/hide
        if(show) {
            modal.classList.remove('hidden');
            // Animation nhẹ (Optional)
            modal.querySelector('div[class*="transform"]')?.classList.add('scale-100');
        } else {
            modal.classList.add('hidden');
        }
    }

    async submitBulkTransfer() {
        const form = document.getElementById('form-bulk-transfer');
        const errEl = document.getElementById('err-bulk-dept');
        const btn = document.getElementById('btn-save-transfer');

        // 1. Validation dùng AppUtils
        const formData = AppUtils.Form.getData(form);
        if (!formData.phong_ban_id) {
            if(errEl) errEl.classList.remove('hidden');
            return;
        }

        // 2. Prepare Data
        const selectedIds = this.tableManager.getSelectedItems();
        const payload = {
            nhan_vien_ids: selectedIds,
            phong_ban_id: formData.phong_ban_id
        };

        // 3. Call API with Loading State
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-circle-notch fa-spin mr-2"></i>Đang xử lý...';
        btn.disabled = true;

        try {
            await this.executeBulkAPI('transfer', payload, false); // false = don't double call logic
            this.toggleModal('modal-bulk-transfer', false);
        } catch (e) {
            // Error handled in executeBulkAPI or here if specifically needed
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }

    /**
     * Hàm gọi API chung cho Bulk Actions
     * @param {string} type - 'transfer' | 'terminate'
     * @param {any} payload - Data body
     * @param {boolean} showSuccessMsg - Có hiển thị toast success mặc định không
     */
    async executeBulkAPI(type, payload, showSuccessMsg = true) {
        let url = '';
        let body = payload;

        if (type === 'transfer') {
            url = '/hrm/to-chuc-nhan-su/api/v1/lich-su-cong-tac/chuyen-cong-tac/';
        } else if (type === 'terminate') {
            // Giả sử API nghỉ việc
            url = '/hrm/to-chuc-nhan-su/api/v1/nhan-vien/nghi-viec-bulk/'; 
            body = { ids: payload };
        }

        try {
            const res = await AppUtils.API.post(url, body);

            if (showSuccessMsg) AppUtils.Notify.success('Thao tác thành công!');
            
            // Refresh UI
            this.tableManager.clearSelection();
            this.tableManager.refresh(); 
            window.TreeManager.fetchTree(); // Refresh cây tổ chức

        } catch (error) {
            console.error(error);
            AppUtils.Notify.error(error.message || 'Có lỗi xảy ra');
        }
    }


    // --- LOGIC FORM & DATA ---

    openSidebar(mode, itemId = null) {
        this._resetCustomState();
        if (mode === 'create') {
            const idInput = this.elements.form.querySelector('input[name="id"]');
            if(idInput) { idInput.value = ''; idInput.setAttribute('value', ''); }
        }
        this.currentItemId = itemId;
        super.openSidebar(mode, itemId); // Call Parent

        // Render Extra UI
        const c = this.extraActionsContainer;
        if (!c) return;
        c.innerHTML = '';
        c.classList.toggle('hidden', false);

        if (mode === 'create') {
            c.innerHTML = `<button type="button" id="btn-save-and-new" class="px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors flex items-center gap-2"><i class="fas fa-plus"></i> <span>Lưu & Thêm mới</span></button>`;
            this.eventManager.add(document.getElementById('btn-save-and-new'), 'click', () => this.submitForm(true));
        } else {
            c.innerHTML = `<button type="button" id="btn-view-detail" class="px-4 py-2 text-sm font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors flex items-center gap-2"><i class="fas fa-external-link-alt"></i> <span>Xem chi tiết</span></button>`;
            this.eventManager.add(document.getElementById('btn-view-detail'), 'click', () => {
                if(this.currentItemId) window.location.href = document.getElementById('url-emp-detail-pattern').value.replace('0', this.currentItemId);
            });
        }
    }

    async loadItemData(id) {
        try {
            const [empRes, congTacRes] = await Promise.all([
                AppUtils.API.get(this.config.apiUrls.detail(id)),
                AppUtils.API.get(`/hrm/to-chuc-nhan-su/api/v1/lich-su-cong-tac/${id}/`, { trangthai: 'active' })
            ]);

            const empData = empRes.data || empRes;
            // Use DateUtils to ensure input[type=date] works
            ['ngaysinh', 'ngayvaolam'].forEach(field => {
                if (empData[field]) empData[field] = AppUtils.DateUtils.toInputValue(empData[field]);
            });

            this._fillEmployeeForm(empData);
            
            this.currentCongTac = Array.isArray(congTacRes.data) ? congTacRes.data[0] : (congTacRes.data || congTacRes);
            if (this.currentCongTac) this._fillCongTacData(this.currentCongTac);
            
        } catch (e) {
            console.error(e);
            AppUtils.Notify.error('Không thể tải thông tin chi tiết');
        }
    }

    _fillEmployeeForm(data) {
        AppUtils.Form.setData(this.elements.form, data);
        if (data.nganhang) {
            const nhId = typeof data.nganhang === 'object' ? data.nganhang.id : data.nganhang;
            const el = this.elements.form.querySelector('[name="nganhang"]');
            if(el) el.value = nhId || '';
        }
    }

    _fillCongTacData(congTac) {
        const cvId = congTac.chucvu_id || congTac.chucvu?.id || congTac.chucvu;
        const form = this.elements.form;
        if(form.elements['chucvu']) form.elements['chucvu'].value = cvId || '';

        const pbId = congTac.phongban_id || congTac.phongban?.id || congTac.phongban;
        let pbName = congTac.noicongtac || congTac.phongban?.tenphongban;
        if (!pbName && pbId) {
            const found = this.lookupData.phongban.find(p => p.id == pbId);
            if(found) pbName = found.tenphongban;
        }
        this._selectPhongban(pbId, pbName);
    }

    _resetCustomState() {
        this._selectPhongban('', '');
        this.currentCongTac = null;
        const cv = this.elements.form.querySelector('[name="chucvu"]');
        if(cv) cv.value = '';
    }

    // --- MAIN SUBMIT LOGIC (Refactored) ---
    async submitForm(saveAndNew = false) {
        const form = this.elements.form;
        AppUtils.Form.clearErrors(form);

        // 1. Validate
        const cvVal = form.querySelector('[name="chucvu"]')?.value;
        const pbVal = form.querySelector('[name="phongban"]')?.value;
        
        if (!AppUtils.Validation.required(cvVal)) return AppUtils.Notify.warning('Vui lòng chọn chức vụ');
        if (!AppUtils.Validation.required(pbVal)) return AppUtils.Notify.warning('Vui lòng chọn phòng ban');

        // 2. Button Loading Helper
        const submitBtn = document.querySelector(`#${this.config.sidebarId} [data-sidebar-submit]`);
        const saveNewBtn = document.getElementById('btn-save-and-new');
        const setBtnLoading = (btn, isLoading) => {
            if(!btn) return;
            if(isLoading) {
                btn.dataset.originalHtml = btn.innerHTML;
                btn.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i> Đang xử lý...`;
                btn.disabled = true;
            } else {
                btn.innerHTML = btn.dataset.originalHtml || btn.innerHTML;
                btn.disabled = false;
            }
        };

        const activeBtn = saveAndNew ? saveNewBtn : submitBtn;
        setBtnLoading(activeBtn, true);
        if(submitBtn && submitBtn !== activeBtn) submitBtn.disabled = true;

        try {
            // 3. Prepare Data
            const data = AppUtils.Form.getData(form);
            const isEdit = !!data.id;
            
            const empPayload = { ...data };
            delete empPayload.chucvu; 
            delete empPayload.phongban;

            const url = isEdit ? this.config.apiUrls.update(data.id) : this.config.apiUrls.create;
            const res = await AppUtils.API[isEdit ? 'put' : 'post'](url, empPayload);
            const nhanvienId = res.data?.id || res.id;

            // 4. Create History Record (Transaction-like)
            if (nhanvienId) {
                await AppUtils.API.post('/hrm/to-chuc-nhan-su/api/v1/lich-su-cong-tac/', {
                    nhanvien_id: nhanvienId,
                    phongban_id: pbVal,
                    chucvu_id: cvVal,
                    noicongtac: this.phongbanDropdown.selectedText,
                    trangthai: 'active'
                });
            }

            AppUtils.Notify.success(isEdit ? 'Cập nhật thành công' : 'Thêm mới thành công');
            this.config.onRefreshTable?.();

            if (saveAndNew) {
                AppUtils.Form.reset(form);
                this._resetCustomState();
                // Ensure ID is cleared
                const idInput = form.querySelector('input[name="id"]');
                if(idInput) { idInput.value = ''; idInput.removeAttribute('value'); }
                form.querySelector('[name="hovaten"]')?.focus();
            } else {
                this.sidebar.close();
            }

        } catch (err) {
            console.error(err);
            const errs = err?.errors || err?.data?.errors;
            if (errs) AppUtils.Form.showErrors(form, errs);
            else AppUtils.Notify.error('Lỗi khi lưu dữ liệu. Vui lòng thử lại.');
        } finally {
            setBtnLoading(activeBtn, false);
            if(submitBtn) submitBtn.disabled = false;
            if(saveNewBtn) saveNewBtn.disabled = false;
        }
    }

    // --- CUSTOM DROPDOWN (Cleaned) ---
    _initPhongbanDropdown() {
        const els = {
            btn: document.getElementById('phongban-dropdown-btn'),
            menu: document.getElementById('phongban-dropdown-menu'),
            search: document.getElementById('phongban-search-input'),
            list: document.getElementById('phongban-dropdown-list'),
            icon: document.getElementById('phongban-dropdown-icon')
        };
        if (!els.btn) return;

        this._renderPhongbanList('');

        // Use EventManager for everything
        this.eventManager.add(els.btn, 'click', (e) => {
            e.stopPropagation();
            this.phongbanDropdown.isOpen = !this.phongbanDropdown.isOpen;
            els.menu.classList.toggle('hidden', !this.phongbanDropdown.isOpen);
            els.icon?.classList.toggle('rotate-180', this.phongbanDropdown.isOpen);
            if(this.phongbanDropdown.isOpen) setTimeout(() => els.search?.focus(), 100);
        });

        this.eventManager.add(els.search, 'input', AppUtils.Helper.debounce((e) => this._renderPhongbanList(e.target.value), 200));
        
        this.eventManager.add(document, 'click', (e) => {
            if (!els.btn.contains(e.target) && !els.menu.contains(e.target)) {
                this.phongbanDropdown.isOpen = false;
                els.menu.classList.add('hidden');
                els.icon?.classList.remove('rotate-180');
            }
        });

        this.eventManager.add(els.list, 'click', (e) => {
            const li = e.target.closest('li[data-phongban-id]');
            if (li) this._selectPhongban(li.dataset.phongbanId, li.dataset.phongbanName);
        });
    }

    _renderPhongbanList(term) {
        const list = document.getElementById('phongban-dropdown-list');
        const search = AppUtils.Helper.removeAccents(term.toLowerCase());
        const matches = this.lookupData.phongban.filter(pb => 
            AppUtils.Helper.removeAccents((pb.tenphongban || '').toLowerCase()).includes(search)
        );

        if (!matches.length) return list.innerHTML = '<li class="px-3 py-2 text-sm text-slate-400 text-center">Không tìm thấy</li>';

        let html = `<li class="px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-50 cursor-pointer border-b border-slate-100" data-phongban-id="" data-phongban-name="-- Chọn phòng ban --"><i class="fas fa-times-circle mr-1"></i> Bỏ chọn</li>`;
        html += matches.map(pb => {
            const isSel = this.phongbanDropdown.selectedId == pb.id;
            return `<li class="px-3 py-1.5 text-sm hover:bg-blue-50 cursor-pointer flex items-center justify-between ${isSel ? 'bg-blue-50 text-blue-700' : 'text-slate-700'}" data-phongban-id="${pb.id}" data-phongban-name="${pb.tenphongban}"><span><i class="fas fa-folder text-yellow-500 mr-2 text-xs"></i>${pb.tenphongban}</span></li>`;
        }).join('');
        list.innerHTML = html;
    }

    _selectPhongban(id, name) {
        this.phongbanDropdown.selectedId = id || null;
        this.phongbanDropdown.selectedText = name || '-- Chọn phòng ban --';
        
        const input = document.getElementById('phongban');
        const display = document.getElementById('phongban-selected-text');
        
        if (input) input.value = id || '';
        if (display) {
            display.textContent = this.phongbanDropdown.selectedText;
            display.className = id ? 'text-slate-900 text-sm' : 'text-slate-500 text-sm';
        }
        
        document.getElementById('phongban-dropdown-menu')?.classList.add('hidden');
        document.getElementById('phongban-dropdown-icon')?.classList.remove('rotate-180');
        this.phongbanDropdown.isOpen = false;
    }

    // --- TABLE ---
    initTable() {
        this.tableManager = new TableManager({
            tableBody: document.getElementById('table-body'),
            paginationContainer: document.querySelector('.pagination-container'),
            searchInput: document.getElementById('search-input'),
            filtersForm: document.getElementById('filter-form'),
            selectAllCheckbox: document.getElementById('select-all-checkbox'),
            bulkActionsContainer: document.getElementById('bulk-actions'),
            enableBulkActions: true,
            apiEndpoint: "/hrm/to-chuc-nhan-su/api/v1/phong-ban/employee/",
            onBulkDelete: (ids) => this.deleteMultipleItems(ids),
            onRenderRow: (item) => this._renderRow(item)
        });
    }

    _renderRow(item) {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50 transition-colors border-b border-slate-200';
        
        const statusMap = { 'Đang làm việc': 'green', 'Đã nghỉ việc': 'red', 'default': 'blue' };
        const color = statusMap[item.trangthainv] || statusMap['default'];
        const statusClass = `bg-${color}-100 text-${color}-700`;
        
        const pbName = item.cong_tac?.phong_ban || '-';
        // Use DateUtils
        const ngayVaoLam = AppUtils.DateUtils.format(item.ngayvaolam, 'dd/MM/yyyy') || '-';

        tr.innerHTML = `
            <td class="px-4 py-2 text-center"><input type="checkbox" class="row-checkbox w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer" data-id="${item.id}"></td>
            <td class="px-3 py-2"><a href="javascript:void(0);" onclick="window.EmployeeManager.openSidebar('edit', ${item.id})" class="text-blue-600 hover:text-blue-700 font-medium block">${item.hovaten || ''}</a><span class="text-xs text-slate-500">${item.email || ''}</span></td>
            <td class="px-3 py-2 font-mono text-xs text-slate-600">${item.manhanvien || ''}</td>
            <td class="px-3 py-2 whitespace-nowrap"><span class="px-2 py-0.5 rounded-full text-xs font-medium ${statusClass}">${item.trangthainv || '-'}</span></td>
            <td class="px-3 py-2 text-sm text-slate-600">${pbName}</td>
            <td class="px-3 py-2 text-sm text-slate-500 whitespace-nowrap">${ngayVaoLam}</td>
            <td class="px-3 py-2 whitespace-nowrap"><div class="flex items-center justify-end gap-1">
                <button type="button" onclick="window.EmployeeManager.openSidebar('edit', ${item.id})" class="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors" title="Sửa"><i class="fas fa-pen w-4 h-4"></i></button>
                <button type="button" onclick="window.EmployeeManager.deleteItem(${item.id}, '${item.hovaten}')" class="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors" title="Xóa"><i class="fas fa-trash w-4 h-4"></i></button>
            </div></td>`;
        return tr;
    }

    filterByOrg(params) { 
        if (this.tableManager) {
            this.tableManager.options.currentPage = 1;
            this.tableManager.setApiParams(params); 
            this.tableManager.refresh();
        }
    }
    resetFilter() { this.filterByOrg({ phongban_id: null, congty_id: null }); }
}

// --- 3. QUẢN LÝ CÔNG TY (Cleaned) ---
class CompanyManager extends BaseCRUDManager {
    constructor() {
        super({
            sidebarId: 'company-sidebar',
            overlayId: 'company-sidebar-overlay',
            formId: 'company-form',
            entityName: 'công ty',
            codeField: 'macongty',
            autoCode: { sourceField: 'tencongty_vi', targetField: 'macongty' },
            apiUrls: {
                detail: (id) => `/hrm/to-chuc-nhan-su/api/v1/cong-ty/${id}/`,
                create: '/hrm/to-chuc-nhan-su/api/v1/cong-ty/',
                update: (id) => `/hrm/to-chuc-nhan-su/api/v1/cong-ty/${id}/`,
                delete: (id) => `/hrm/to-chuc-nhan-su/api/v1/cong-ty/${id}/`,
            },
            onRefreshTable: () => window.TreeManager.fetchTree(),
            fillFormData: (data) => AppUtils.Form.setData(this.elements.form, data)
        });
    }
    openAddCompany() { this.openSidebar('create'); this.sidebar.setTitle("Thêm công ty mới"); }
    openEditCompany(id) { this.openSidebar('edit', id); this.sidebar.setTitle("Sửa công ty"); }
    deleteCompany(id, name) { this.deleteItem(id, name); }
}

// --- 4. QUẢN LÝ PHÒNG BAN (Cleaned) ---
class DeptManager extends BaseCRUDManager {
    constructor() {
        super({
            sidebarId: 'dept-sidebar',
            overlayId: 'dept-sidebar-overlay',
            formId: 'dept-form',
            entityName: 'phòng ban',
            codeField: 'maphongban',
            autoCode: { sourceField: 'tenphongban', targetField: 'maphongban' },
            apiUrls: {
                detail: (id) => `/hrm/to-chuc-nhan-su/api/v1/phong-ban/${id}/`,
                create: '/hrm/to-chuc-nhan-su/api/v1/phong-ban/',
                update: (id) => `/hrm/to-chuc-nhan-su/api/v1/phong-ban/${id}/`,
                delete: (id) => `/hrm/to-chuc-nhan-su/api/v1/phong-ban/${id}/`,
            },
            onRefreshTable: () => window.TreeManager.fetchTree(),
            fillFormData: (data) => {
                AppUtils.Form.setData(this.elements.form, data);
                this._updateParentInfo(data.congty_ten || data.phongbancha_ten);
            }
        });
    }

    openAddSub(parentId, isParentCompany, parentName, companyId = null) {
        this.openSidebar('create');
        this.sidebar.setTitle(isParentCompany ? "Thêm phòng ban thuộc công ty" : "Thêm phòng ban con");
        const form = this.elements.form;
        form.querySelector('[name="congty_id"]').value = isParentCompany ? parentId : (companyId || '');
        form.querySelector('[name="phongbancha_id"]').value = !isParentCompany ? parentId : '';
        this._updateParentInfo(parentName);
    }

    openEditDept(id) {
        this.openSidebar('edit', id);
        this.sidebar.setTitle("Sửa phòng ban");
    }

    _updateParentInfo(name) {
        const el = document.getElementById('parent-info-display');
        if (el) {
            el.textContent = name ? `Trực thuộc: ${name}` : '';
            el.classList.toggle('hidden', !name);
        }
    }
    deleteDept(id, name) { this.deleteItem(id, name); }
}

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    // 1. Chỉ khởi tạo TreeManager nếu có cây (trang Index)
    if (document.getElementById('tree-root')) {
        window.TreeManager = new TreeManager();
        window.TreeManager.init();
    }

    // 2. Chỉ khởi tạo CompanyManager nếu có form công ty
    if (document.getElementById('company-sidebar')) {
        window.CompanyManager = new CompanyManager();
        window.CompanyManager.init();
    }

    // 3. Chỉ khởi tạo DeptManager nếu có form phòng ban
    if (document.getElementById('dept-sidebar')) {
        window.DeptManager = new DeptManager();
        window.DeptManager.init();
    }

    // 4. EmployeeManager: Cần dùng chung cho cả Index (tạo mới) và Detail (sửa)
    // Kiểm tra nếu có sidebar nhân viên thì mới khởi tạo
    if (document.getElementById('employee-sidebar')) {
        window.EmployeeManager = new EmployeeManager();
        
        // Nếu đang ở trang Detail (không có bảng table-body), 
        // ta override hàm onRefreshTable để reload trang thay vì refresh bảng
        if (!document.getElementById('table-body')) {
            window.EmployeeManager.init(); // Init cơ bản
            window.EmployeeManager.config.onRefreshTable = () => window.location.reload();
        } else {
            window.EmployeeManager.init(); // Init đầy đủ có bảng
        }
    }
});