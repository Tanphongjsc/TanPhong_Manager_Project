/**
 * ChamCongManager - Quản lý Bảng Chấm Công
 * Tối ưu: Sử dụng AppUtils, ChamCongRenderHelper, ChamCongTimeValidator
 */
class ChamCongManager {
    constructor(config) {
        if (typeof AppUtils === 'undefined') {
            console.error('⛔ AppUtils is required');
            return;
        }

        this.apiUrls = config.apiUrls || {};

        // Data State
        this.employees = [];
        this.jobs = [];
        this.departments = [];
        this.departmentMap = {};
        this.productionTypeId = null;
        this.currentDate = AppUtils.DateUtils.toInputValue(new Date());

        // UI State
        this.state = {
            filters: { search: '', dept: 'all' },
            activeTab: 'vp',
            isLoading: false,
            loadController: null
        };

        this.elements = {};
        this.eventManager = AppUtils.EventManager.create();
        this.debouncedFilter = AppUtils.Helper.debounce(() => this.handleFilter(), 300);
        
        // External modules (shorthand)
        this.validator = window.ChamCongTimeValidator || null;
        this.render$ = window.ChamCongRenderHelper || null;
    }

    init() {
        this.cacheElements();
        this.initViolationsModal();
        if (this.elements.dateInput) this.elements.dateInput.value = this.currentDate;
        this.setupEventListeners();
        this.switchTab('vp', false);
        this.loadResources();

        if (typeof ChamCongContextMenu !== 'undefined') {
            this.contextMenu = new ChamCongContextMenu(this);
        }
    }

    cacheElements() {
        const $ = id => document.getElementById(id);
        this.elements = {
            vpBody: $('vp-body'), sxBody: $('sx-body'),
            masterJobSelect: $('m-job'), dateInput: $('work-date'),
            deptSelect: $('dept-filter'), searchInput: $('search-input'),
            tabVpBtn: $('btn-tab-vp'), tabSxBtn: $('btn-tab-sx'),
            tabVpView: $('tab-vp'), tabSxView: $('tab-sx'),
            masterSxEls: Array.from(document.querySelectorAll('.master-sx-el')),
            checkAllVp: $('check-all-vp'), checkAllSx: $('check-all-sx')
        };
    }

    setupEventListeners() {
        const { checkAllVp, checkAllSx, searchInput, deptSelect, dateInput, vpBody, sxBody } = this.elements;
        const em = this.eventManager;

        // Checkbox Master
        if (checkAllVp) em.add(checkAllVp, 'change', e => this.toggleAll(e.target, 'vp-body'));
        if (checkAllSx) em.add(checkAllSx, 'change', e => this.toggleAll(e.target, 'sx-body'));

        // Filters
        if (searchInput) em.add(searchInput, 'input', this.debouncedFilter);
        if (deptSelect) em.add(deptSelect, 'change', () => {
            this.state.filters.dept = deptSelect.value;
            this.render();
        });

        // Date change -> reload employees
        if (dateInput) em.add(dateInput, 'change', e => {
            this.currentDate = e.target.value;
            this.loadDailyData();
        });

        // Grid Interactions (Event Delegation)
        em.add(vpBody, 'change', e => this.handleGridInputChange(e));
        em.add(sxBody, 'change', e => this.handleGridInputChange(e));
        em.add(sxBody, 'click', e => this.handleGridClick(e));
    }

    // ===== DATA LOADING =====
    async loadResources() {
        if (this.state.loadController) this.state.loadController.abort();
        this.state.loadController = new AbortController();
        this.state.isLoading = true;

        try {
            const opts = { signal: this.state.loadController.signal };
            const [deptRes, jobRes, typeRes] = await Promise.all([
                AppUtils.API.get(this.apiUrls.departments, { page_size: 1000 }, opts),
                AppUtils.API.get(this.apiUrls.jobs, { status: 'active', page_size: 1000 }, opts),
                AppUtils.API.get(this.apiUrls.employeeTypes, { search: 'Công nhân' }, opts)
            ]);

            // Process departments
            this.departments = deptRes.data || [];
            this.departmentMap = this.departments.reduce((acc, d) => ({ ...acc, [d.id]: d.tenphongban }), {});
            this.initDeptFilter();

            // Process jobs
            this.jobs = jobRes.data || [];
            this.initMasterSelect();

            // Process employee types
            if (typeRes.data?.length) {
                const key = AppUtils.Helper.removeAccents('Công nhân').toLowerCase();
                const factoryType = typeRes.data.find(t => 
                    AppUtils.Helper.removeAccents(t.TenLoaiNV).toLowerCase().includes(key)
                );
                this.productionTypeId = factoryType?.id || null;
            }

            await this.loadDailyData(opts);
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error("Load Error:", error);
                AppUtils.Notify.error("Không thể tải dữ liệu: " + error.message);
            }
        } finally {
            this.state.isLoading = false;
            this.state.loadController = null;
        }
    }

    async loadDailyData(existingOpts = null) {
        let opts = existingOpts;
        if (!opts) {
            if (this.state.loadController) this.state.loadController.abort();
            this.state.loadController = new AbortController();
            opts = { signal: this.state.loadController.signal };
            this.state.isLoading = true;
        }

        try {
            const res = await AppUtils.API.get(this.apiUrls.employees, { 
                ngaylamviec: this.currentDate, page_size: 2000 
            }, opts);

            this.employees = (res.data || []).map(e => ({
                id: e.nhanvien_id,
                hovaten: e.hovaten,
                manhanvien: e.manhanvien,
                phongban_id: e.phongban_id,
                loainv: e.loainv,
                calamviec_id: e.calamviec_id,
                khunggiolamviec: e.khunggiolamviec || {},
                khunggionghitrua: e.khunggionghitrua || [],
                solanchamcongtrongngay: e.solanchamcongtrongngay || 0,
                sokhunggiotrongca: e.sokhunggiotrongca || 1
            }));

            this.render();
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error("Employee Load Error:", error);
                AppUtils.Notify.error("Lỗi tải danh sách nhân viên: " + error.message);
            }
        } finally {
            if (!existingOpts) {
                this.state.isLoading = false;
                this.state.loadController = null;
            }
        }
    }

    initDeptFilter() {
        if (!this.elements.deptSelect) return;
        this.elements.deptSelect.innerHTML = [
            '<option value="all">Tất cả PB</option>',
            ...this.departments.map(d => `<option value="${d.id}">${d.tenphongban}</option>`)
        ].join('');
    }

    initMasterSelect() {
        if (!this.elements.masterJobSelect) return;
        this.elements.masterJobSelect.innerHTML = [
            '<option value="">-- Công việc --</option>',
            ...this.jobs.map(j => `<option value="${j.id}">${j.tencongviec}</option>`)
        ].join('');
    }

    // ===== FILTERING & RENDERING =====
    handleFilter() {
        this.state.filters.search = AppUtils.Helper.removeAccents(this.elements.searchInput.value).toLowerCase();
        this.render();
    }

    getFilteredEmployees(type) {
        const { search, dept } = this.state.filters;
        
        return this.employees.filter(e => {
            const name = AppUtils.Helper.removeAccents(e.hovaten || '').toLowerCase();
            const code = (e.manhanvien || '').toLowerCase();
            const nameMatch = !search || name.includes(search) || code.includes(search);
            const deptMatch = dept === 'all' || e.phongban_id == dept;
            
            let isFactory = this.productionTypeId !== null 
                ? (e.loainv === this.productionTypeId)
                : (AppUtils.Helper.removeAccents(this.departmentMap[e.phongban_id] || '').toLowerCase().match(/xuong|san xuat/));
            
            return nameMatch && deptMatch && (type === 'vp' ? !isFactory : isFactory);
        });
    }

    render() {
        const type = this.state.activeTab;
        const tbody = type === 'vp' ? this.elements.vpBody : this.elements.sxBody;
        if (!tbody) return;

        const list = this.getFilteredEmployees(type);

        if (!list.length) {
            AppUtils.UI.renderEmptyState(tbody, {
                message: 'Không tìm thấy nhân viên phù hợp',
                colspan: type === 'vp' ? 8 : 7,
                icon: 'search'
            });
            this.resetMasterCheckbox(type);
            return;
        }

        tbody.innerHTML = '';
        const fragment = document.createDocumentFragment();
        list.forEach(emp => fragment.appendChild(this.createRow(emp, type)));
        tbody.appendChild(fragment);
        this.updateMasterCheckbox();
    }

    createRow(emp, type) {
        this.initEmpState(emp);
        const tr = document.createElement('tr');
        tr.className = 'group hover:bg-blue-50/20 transition-colors border-b-2 border-slate-300 align-top';
        if (!emp.uiState.isActive) tr.classList.add('inactive');

        const scheduleIn = this.render$.formatTimeDisplay(emp.khunggiolamviec?.thoigianbatdau) || '08:00';
        const scheduleOut = this.render$.formatTimeDisplay(emp.khunggiolamviec?.thoigianketthuc) || '17:00';
        Object.assign(tr.dataset, { id: emp.id, scheduleIn, scheduleOut });

        const accent = type === 'vp' ? 'blue' : 'orange';
        tr.innerHTML = this.render$.renderCommonCells(emp, scheduleIn, scheduleOut, accent) 
            + (type === 'vp' 
                ? this.render$.renderVPCells(emp.uiState) 
                : this.render$.renderSXCells(emp.uiState, this.jobs));

        if (!emp.uiState.isActive) this.toggleRowInputs(tr, false);
        if (type === 'vp' && emp.uiState.isActive && (emp.uiState.in || emp.uiState.out)) {
            this.analyzeTime(tr);
        }

        return tr;
    }

    // ===== GRID INTERACTION HANDLERS =====
    handleGridInputChange(e) {
        const target = e.target;
        const tr = target.closest('tr');
        if (!tr?.dataset.id) return;

        const emp = this.getEmpById(tr.dataset.id);
        if (!emp) return;

        const cls = target.classList;

        if (cls.contains('row-cb')) {
            emp.uiState.isActive = target.checked;
            this.toggleRowInputs(tr, target.checked);
            this.updateMasterCheckbox();
        } else if (cls.contains('inp-in')) {
            emp.uiState.in = target.value;
            this.analyzeTime(tr);
        } else if (cls.contains('inp-out')) {
            emp.uiState.out = target.value;
            this.analyzeTime(tr);
        } else if (cls.contains('chk-lunch')) {
            emp.uiState.lunch = target.checked;
        } else if (cls.contains('chk-ot')) {
            emp.uiState.ot = target.checked;
        } else if (cls.contains('job-select')) {
            const idx = parseInt(target.dataset.index);
            if (emp.uiState.jobs[idx]) {
                emp.uiState.jobs[idx] = { jobId: target.value, params: {} };
                this.refreshRow(tr, emp, 'sx');
            }
        } else if (cls.contains('param-val')) {
            const { index, key } = target.dataset;
            if (emp.uiState.jobs[index]) emp.uiState.jobs[index].params[key] = target.value;
        }
    }

    handleGridClick(e) {
        const btn = e.target.closest('button');
        if (!btn) return;
        
        const tr = btn.closest('tr');
        if (!tr?.dataset.id) return;
        
        const emp = this.getEmpById(tr.dataset.id);

        if (btn.classList.contains('btn-add-job')) {
            emp.uiState.jobs.push({ jobId: '', params: {} });
            this.refreshRow(tr, emp, 'sx');
        } else if (btn.classList.contains('btn-remove-job')) {
            const idx = parseInt(btn.dataset.index);
            emp.uiState.jobs.splice(idx, 1);
            if (!emp.uiState.jobs.length) emp.uiState.jobs.push({ jobId: '', params: {} });
            this.refreshRow(tr, emp, 'sx');
        }
    }

    // ===== UTILITY METHODS =====
    initEmpState(emp) {
        if (!emp.uiState) {
            emp.uiState = { in: '', out: '', lunch: true, ot: false, isActive: true, jobs: [{ jobId: '', params: {} }] };
        }
        emp.uiState.isActive ??= true;
        if (!emp.uiState.jobs?.length) emp.uiState.jobs = [{ jobId: '', params: {} }];
    }

    getEmpById(id) { return this.employees.find(x => x.id === parseInt(id)); }
    refreshRow(tr, emp, type) { tr.replaceWith(this.createRow(emp, type)); }

    toggleRowInputs(tr, enable) {
        tr.classList.toggle('inactive', !enable);
        tr.querySelectorAll('input:not(.row-cb), select, button').forEach(el => el.disabled = !enable);
        
        if (!enable) {
            const res = tr.querySelector('.analysis-result');
            if (res) res.innerHTML = '<span class="text-[10px] text-slate-300">-</span>';
            tr.querySelectorAll('.cell-input').forEach(i => i.classList.remove('text-red-600'));
        } else {
            this.analyzeTime(tr);
        }
    }

    resetMasterCheckbox(type) {
        const cb = type === 'vp' ? this.elements.checkAllVp : this.elements.checkAllSx;
        if (cb) { cb.checked = false; cb.indeterminate = false; }
    }

    updateMasterCheckbox() {
        const type = this.state.activeTab;
        const tbody = type === 'vp' ? this.elements.vpBody : this.elements.sxBody;
        const cb = type === 'vp' ? this.elements.checkAllVp : this.elements.checkAllSx;
        
        if (!cb || !tbody) return;
        const all = tbody.querySelectorAll('.row-cb');
        const checked = tbody.querySelectorAll('.row-cb:checked');
        
        cb.checked = all.length > 0 && checked.length === all.length;
        cb.indeterminate = checked.length > 0 && checked.length < all.length;
    }

    toggleAll(masterCb, tbodyId) {
        const tbody = document.getElementById(tbodyId);
        if (!tbody) return;
        
        const isChecked = masterCb.checked;
        tbody.querySelectorAll('tr').forEach(tr => {
            const cb = tr.querySelector('.row-cb');
            if (cb) cb.checked = isChecked;
            const emp = this.getEmpById(tr.dataset.id);
            if (emp) emp.uiState.isActive = isChecked;
            this.toggleRowInputs(tr, isChecked);
        });
    }

    analyzeTime(tr) {
        if (!tr) return;
        const inpIn = tr.querySelector('.inp-in');
        const inpOut = tr.querySelector('.inp-out');
        const res = tr.querySelector('.analysis-result');
        if (!res) return;

        const { scheduleIn, scheduleOut } = tr.dataset;
        const inVal = inpIn?.value;
        const outVal = inpOut?.value;

        if (!inVal && !outVal) {
            res.innerHTML = '<span class="text-[10px] text-slate-300">-</span>';
            return;
        }

        let html = '';
        
        if (inVal && scheduleIn) {
            const late = AppUtils.TimeUtils.diffMinutes(inVal, scheduleIn);
            if (late > 0) {
                html += this.render$.renderAnalysisBadge(`Muộn ${late}p`, false);
                inpIn.classList.add('text-red-600');
            } else {
                inpIn.classList.remove('text-red-600');
            }
        }
        
        if (outVal && scheduleOut) {
            const early = AppUtils.TimeUtils.diffMinutes(scheduleOut, outVal);
            if (early > 0) {
                html += this.render$.renderAnalysisBadge(`Sớm ${early}p`, false);
                inpOut.classList.add('text-red-600');
            } else {
                inpOut.classList.remove('text-red-600');
            }
        }
        
        res.innerHTML = html || this.render$.renderAnalysisBadge('✓ OK', true);
    }

    // ===== MASTER ACTIONS =====
    renderMasterParams() {
        const container = document.getElementById('m-params');
        if (!container) return;
        
        const job = this.jobs.find(j => j.id == this.elements.masterJobSelect.value);
        container.innerHTML = job ? this.render$.renderMasterParams(job) : '';
    }

    applyMaster() {
        const type = this.state.activeTab;
        const tbody = type === 'vp' ? this.elements.vpBody : this.elements.sxBody;
        const checkedRows = tbody.querySelectorAll('tr .row-cb:checked');
        
        if (!checkedRows.length) {
            AppUtils.Notify.warning('Chưa chọn nhân viên nào!');
            return;
        }

        const timeIn = document.getElementById('m-in')?.value;
        const timeOut = document.getElementById('m-out')?.value;
        
        let masterJob = null;
        if (type === 'sx' && this.elements.masterJobSelect?.value) {
            const mParams = {};
            document.querySelectorAll('.m-p-val').forEach(i => mParams[i.dataset.key] = i.value);
            masterJob = { jobId: this.elements.masterJobSelect.value, params: mParams };
        }

        let count = 0;
        checkedRows.forEach(cb => {
            const emp = this.getEmpById(cb.closest('tr').dataset.id);
            if (!emp) return;

            if (timeIn) emp.uiState.in = timeIn;
            if (timeOut) emp.uiState.out = timeOut;

            if (type === 'sx' && masterJob) {
                const emptyIdx = emp.uiState.jobs.findIndex(j => !j.jobId);
                const newJob = JSON.parse(JSON.stringify(masterJob));
                emptyIdx !== -1 ? emp.uiState.jobs[emptyIdx] = newJob : emp.uiState.jobs.push(newJob);
            }
            count++;
        });

        this.render();
        AppUtils.Notify.success(`Đã cập nhật dữ liệu cho ${count} nhân viên.`);
    }

    // ===== SAVE OPERATIONS =====
    async saveData() {
        const payload = this.prepareSavePayload();

        if (!payload.length) {
            AppUtils.Notify.warning('Không có dữ liệu hợp lệ để lưu.');
            return;
        }

        // Validate time constraints
        const validationResult = this.validateTimeConstraints(payload);
        
        if (!validationResult.isValid) {
            this.showViolationsModal(validationResult, payload);
            return;
        }

        AppUtils.Modal.showConfirm({
            title: 'Lưu bảng chấm công',
            message: `Bạn có chắc muốn lưu dữ liệu chấm công cho ${payload.length} bản ghi?`,
            confirmText: 'Lưu dữ liệu',
            onConfirm: () => this.executeSave(payload)
        });
    }

    async executeSave(payload) {
        this.state.isLoading = true;
        try {
            const response = await AppUtils.API.post(this.apiUrls.saveChamCong, payload);
            if (response.success || response.id || Array.isArray(response)) {
                AppUtils.Notify.success('Lưu dữ liệu chấm công thành công!');
            } else {
                throw new Error(response.message || 'Lỗi không xác định');
            }
        } catch (error) {
            console.error('Save Error:', error);
            AppUtils.Notify.error('Lưu thất bại: ' + error.message);
        } finally {
            this.state.isLoading = false;
        }
    }

    prepareSavePayload() {
        const type = this.state.activeTab;
        const tbody = type === 'vp' ? this.elements.vpBody : this.elements.sxBody;
        const checkedRows = Array.from(tbody.querySelectorAll('.row-cb:checked')).map(cb => cb.closest('tr'));
        const payload = [];

        checkedRows.forEach(tr => {
            const emp = this.getEmpById(tr.dataset.id);
            if (!emp?.uiState) return;

            const s = emp.uiState;
            const scheduleIn = this.render$.formatTimeDisplay(emp.khunggiolamviec?.thoigianbatdau) || '08:00';
            const scheduleOut = this.render$.formatTimeDisplay(emp.khunggiolamviec?.thoigianketthuc) || '17:00';

            const diffIn = AppUtils.TimeUtils.diffMinutes(s.in, scheduleIn);
            const diffOut = AppUtils.TimeUtils.diffMinutes(scheduleOut, s.out);

            const baseObj = {
                nhanvien_id: emp.id,
                ngaylamviec: this.currentDate,
                thoigianchamcongvao: s.in || null,
                thoigianchamcongra: s.out || null,
                cotinhlamthem: s.ot || false,
                coantrua: s.lunch || false,
                loaichamcong: type.toUpperCase(),
                id: null,
                thoigiandimuon: diffIn > 0 ? diffIn : 0,
                thoigiandisom: diffIn < 0 ? Math.abs(diffIn) : 0,
                thoigianvesom: diffOut > 0 ? diffOut : 0,
                thoigianvemuon: diffOut < 0 ? Math.abs(diffOut) : 0
            };

            if (type === 'vp') {
                const noteInput = tr.querySelector('input[type="text"]:not(.cell-input)');
                payload.push({
                    ...baseObj,
                    congviec_id: null,
                    tencongviec: noteInput?.value || 'Hành chính',
                    thamsotinhluong: {},
                    ghichu: noteInput?.value || ''
                });
            } else {
                s.jobs.forEach(jobItem => {
                    if (jobItem.jobId) {
                        const jobDef = this.jobs.find(j => j.id == jobItem.jobId);
                        if (jobDef) {
                            payload.push({
                                ...baseObj,
                                congviec_id: parseInt(jobItem.jobId),
                                tencongviec: jobDef.tencongviec,
                                thamsotinhluong: {
                                    tham_so: this.formatJobParams(jobItem.params, jobDef.danhsachthamso),
                                    bieu_thuc: jobDef.bieuthuctinhtoan,
                                    loaicv: jobDef.loaicongviec
                                },
                                ghichu: ''
                            });
                        }
                    } else if (s.jobs.length === 1) {
                        payload.push({ ...baseObj, congviec_id: null, tencongviec: 'Chấm công giờ', thamsotinhluong: {}, ghichu: '' });
                    }
                });
            }
        });

        return payload;
    }

    formatJobParams(userParams, paramsDef) {
        const defs = this.render$.parseParams(paramsDef);
        const result = {};
        
        defs.forEach(def => {
            const val = userParams[def.ma] ?? def.giatri_macdinh ?? '';
            result[def.ma] = ['number', 'currency', 'percent'].includes(def.kieu) 
                ? (Number(val) || 0) 
                : String(val);
        });
        
        return result;
    }

    // ===== TAB SWITCHING =====
    switchTab(tab, shouldRender = true) {
        this.state.activeTab = tab;
        const isVP = tab === 'vp';
        
        this.elements.tabVpBtn.classList.toggle('active-vp', isVP);
        this.elements.tabSxBtn.classList.toggle('active-sx', !isVP);
        this.elements.tabVpView.classList.toggle('hidden', !isVP);
        this.elements.tabSxView.classList.toggle('hidden', isVP);
        this.elements.masterSxEls.forEach(el => el.classList.toggle('hidden', isVP));

        const btnApply = document.getElementById('btn-apply-master');
        if (btnApply) {
            btnApply.className = `ml-auto px-3 py-1.5 text-white rounded font-semibold transition-colors flex items-center gap-2 ${isVP ? 'bg-blue-600 hover:bg-blue-700' : 'bg-orange-500 hover:bg-orange-600'}`;
            btnApply.innerHTML = isVP ? 'Áp dụng' : '<i class="fa-solid fa-plus text-xs"></i> Thêm';
        }

        if (shouldRender) this.render();
    }

    // ===== VIOLATIONS MODAL =====
    initViolationsModal() {
        this.elements.violationsModal = document.getElementById('violations-modal');
        this.elements.violationsModalBody = document.getElementById('violations-modal-body');
        
        if (!this.elements.violationsModal) return;

        // Close buttons
        this.elements.violationsModal.querySelectorAll('[data-modal-close]').forEach(btn => {
            this.eventManager.add(btn, 'click', () => this.closeViolationsModal());
        });

        // Click outside
        this.eventManager.add(this.elements.violationsModal, 'click', e => {
            if (e.target === this.elements.violationsModal) this.closeViolationsModal();
        });

        // Force save button
        const forceSaveBtn = document.getElementById('btn-force-save');
        if (forceSaveBtn) {
            this.eventManager.add(forceSaveBtn, 'click', () => {
                this.closeViolationsModal();
                if (this._pendingPayload) {
                    AppUtils.Modal.showConfirm({
                        title: 'Xác nhận lưu',
                        message: `Bạn đã chọn bỏ qua cảnh báo. Tiếp tục lưu ${this._pendingPayload.length} bản ghi?`,
                        confirmText: 'Lưu ngay',
                        type: 'warning',
                        onConfirm: () => {
                            this.executeSave(this._pendingPayload);
                            this._pendingPayload = null;
                        }
                    });
                }
            });
        }
    }

    validateTimeConstraints(payload) {
        if (!this.validator) return { isValid: true, violations: [] };

        const records = [];
        const processedIds = new Set();

        payload.forEach(item => {
            if (processedIds.has(item.nhanvien_id)) return;
            processedIds.add(item.nhanvien_id);

            const emp = this.getEmpById(item.nhanvien_id);
            if (emp) {
                records.push({
                    checkIn: item.thoigianchamcongvao,
                    checkOut: item.thoigianchamcongra,
                    employee: emp
                });
            }
        });

        return this.validator.validateAll(records);
    }

    showViolationsModal(validationResult, payload) {
        if (!this.elements.violationsModal || !this.elements.violationsModalBody) {
            AppUtils.Notify.warning(`Phát hiện ${validationResult.violations.length} vi phạm. Vui lòng kiểm tra lại.`);
            return;
        }

        this._pendingPayload = payload;
        this.elements.violationsModalBody.innerHTML = this.validator.renderViolationsModal(validationResult, this.employees);
        AppUtils.Modal.open(this.elements.violationsModal);
    }

    closeViolationsModal() {
        if (this.elements.violationsModal) AppUtils.Modal.close(this.elements.violationsModal);
    }

    // ===== CLEANUP =====
    destroy() {
        if (this.state.loadController) this.state.loadController.abort();
        this.eventManager.removeAll();
        if (this.contextMenu?.destroy) this.contextMenu.destroy();
        this.employees = [];
        this.jobs = [];
        this._pendingPayload = null;
    }
}

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', () => {
    window.ChamCongManager = new ChamCongManager({
        apiUrls: {
            employees: '/hrm/cham-cong/api/bang-cham-cong/nhan-vien-list/',
            departments: '/hrm/to-chuc-nhan-su/api/v1/phong-ban/',
            jobs: '/hrm/to-chuc-nhan-su/api/cong-viec/list/',
            employeeTypes: '/hrm/to-chuc-nhan-su/api/loai-nhan-vien/list/',
            saveChamCong: '/hrm/cham-cong/api/bang-cham-cong/list/'
        }
    });
    window.ChamCongManager.init();
});