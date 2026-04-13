/**
 * ChamCongManager - Quản lý Bảng Chấm Công
 * Tối ưu: Tận dụng AppUtils, giảm code trùng lặp, gọn gàng hóa
 */
class ChamCongManager {
    constructor(config) {
        if (typeof AppUtils === 'undefined') { console.error('⛔ AppUtils is required'); return; }
        this.apiUrls = config.apiUrls || {};
        this.employees = []; this.jobs = []; this.departments = []; this.departmentMap = {};
        
        const urlParams = new URLSearchParams(window.location.search);
        const dateParam = urlParams.get('ngaylamviec');
        this.mode = this.normalizeMode(urlParams.get('mode'));
        this.currentDate = dateParam || AppUtils.DateUtils.toInputValue(new Date());

        this.state = { filters: { search: '', dept: 'all' }, isLoading: false, loadController: null };
        this.elements = {};
        this.eventManager = AppUtils.EventManager.create();
        this.debouncedFilter = AppUtils.Helper.debounce(() => this.handleFilter(), 300);
        this.debouncedDateChange = AppUtils.Helper.debounce((val) => { this.currentDate = val; this.loadDailyData(); }, 500);
        this.validator = window.ChamCongTimeValidator || null;
        this.render$ = window.ChamCongRenderHelper || null;
        this.timeParamKeyCache = new Map();
    }

    init() {
        this.cacheElements();
        this.initViolationsModal();
        if (this.elements.dateInput) this.elements.dateInput.value = this.currentDate;
        this.setupEventListeners();
        this.loadResources();
        if (typeof ChamCongContextMenu !== 'undefined') this.contextMenu = new ChamCongContextMenu(this);
    }

    cacheElements() {
        const $ = id => document.getElementById(id);
        this.elements = {
            hybridBody: $('hybrid-body'), masterJobSelect: $('m-job'), dateInput: $('work-date'),
            deptSelect: $('dept-filter'), searchInput: $('search-input'),
            checkAllHybrid: $('check-all-hybrid')
        };
    }

    normalizeMode(modeValue) {
        const mode = String(modeValue || 'create').toLowerCase();
        return mode === 'update' ? 'update' : 'create';
    }

    toInputTime(value) {
        if (!value) return '';
        const normalized = AppUtils.TimeUtils.normalize(value, null);
        return normalized || '';
    }

    getJobsFromApiRecord(record, isExtra = false) {
        const emptyJobs = [{ jobId: '', params: {} }];
        if (this.mode !== 'update') return emptyJobs;

        let salaryConfig = record.thamsotinhluong;
        if (typeof salaryConfig === 'string') {
            try { salaryConfig = JSON.parse(salaryConfig); }
            catch { salaryConfig = null; }
        }

        if (Array.isArray(salaryConfig?.details)) {
            let details = salaryConfig.details;
            if (isExtra) {
                details = details.filter(detail => detail.pay_role === 'extra');
            } else {
                details = details.filter(detail => detail.pay_role !== 'extra');
            }
            const jobs = details
                .filter(detail => detail?.congviec_id)
                .map(detail => ({
                    jobId: String(detail.congviec_id),
                    params: detail?.thamsotinhluong?.tham_so || detail?.tham_so || {}
                }));
            return jobs.length ? jobs : emptyJobs;
        }

        // Single job case
        if (record.congviec_id) {
            const hasPayRoleExtra = salaryConfig?.pay_role === 'extra';
            if ((isExtra && hasPayRoleExtra) || (!isExtra && !hasPayRoleExtra)) {
                return [{
                    jobId: String(record.congviec_id),
                    params: salaryConfig?.tham_so || salaryConfig?.thamsotinhluong?.tham_so || {}
                }];
            }
        }

        return emptyJobs;
    }

    mapEmployeeRecord(record) {
        const rowId = this.mode === 'update' ? (record.id ?? record.nhanvien_id) : record.nhanvien_id;
        const otMinutes = Number(record.sophutot ?? record.thoigianlamthem ?? 0);
        const isLeaveRecord = record.codilam === false;
        const defaultSelected = this.mode === 'create' && !isLeaveRecord;
        const salaryMode = record.phuongthuctinhluong || 'daily';
        const isMonthly = salaryMode === 'monthly';
        const baseJobs = this.getJobsFromApiRecord(record, false);
        const extraJobs = this.getJobsFromApiRecord(record, true);
        
        let initialShiftType = record.loaichamcong;
        if (initialShiftType !== 'VP' && initialShiftType !== 'SX') {
            initialShiftType = isMonthly ? 'VP' : 'SX';
        }

        return {
            rowId,
            id: record.nhanvien_id,
            recordId: record.id || null,
            hovaten: record.hovaten,
            manhanvien: record.manhanvien,
            phongban_id: record.phongban_id,
            loainv: record.loainv,
            phuongthuctinhluong: salaryMode,
            calamviec_id: record.calamviec_id,
            khunggiolamviec: this.buildKhungGioPayload(record.khunggiolamviec),
            khunggionghitrua: record.khunggionghitrua || [],
            solanchamcongtrongngay: record.solanchamcongtrongngay || 0,
            sokhunggiotrongca: record.sokhunggiotrongca || 1,
            cocancheckout: record.cocancheckout === true,
            loaichamcong: record.loaichamcong || 'CO_DINH',
            loaicalamviec: record.loaicalamviec || 'CO_DINH',
            tongthoigianlamvieccuaca: record.tongthoigianlamvieccuaca || 0,
            cophaingaynghi: record.cophaingaynghi === true,
            uiState: {
                in: this.toInputTime(record.thoigianchamcongvao),
                out: this.toInputTime(record.thoigianchamcongra),
                lunch: record.coantrua !== false,
                ot: record.cotinhlamthem === true,
                otMinutes: Number.isFinite(otMinutes) && otMinutes > 0 ? String(parseInt(otMinutes, 10)) : '',
                isSelected: defaultSelected,
                isLeave: isLeaveRecord,
                shiftType: initialShiftType,
                jobs: initialShiftType === 'VP' ? extraJobs : baseJobs,
                extraJobs,
                note: record.ghichu || ''
            }
        };
    }

    setupEventListeners() {
        const { checkAllHybrid, searchInput, deptSelect, dateInput, hybridBody } = this.elements;
        const em = this.eventManager;
        if (checkAllHybrid) em.add(checkAllHybrid, 'change', e => this.toggleAll(e.target, 'hybrid-body'));
        if (searchInput) em.add(searchInput, 'input', this.debouncedFilter);
        if (deptSelect) em.add(deptSelect, 'change', () => { this.state.filters.dept = deptSelect.value; this.render(); });
        if (dateInput) em.add(dateInput, 'change', e => this.debouncedDateChange(e.target.value));
        if (hybridBody) {
            em.add(hybridBody, 'change', e => this.handleGridInputChange(e));
            em.add(hybridBody, 'click', e => this.handleGridClick(e));
        }
    }

    async loadResources() {
        if (this.state.loadController) this.state.loadController.abort();
        this.state.loadController = new AbortController();
        this.state.isLoading = true;
        try {
            const opts = { signal: this.state.loadController.signal };
            const [deptRes, jobRes] = await Promise.all([
                AppUtils.API.get(this.apiUrls.departments, { page_size: 1000 }, opts),
                AppUtils.API.get(this.apiUrls.jobs, { status: 'active', page_size: 1000 }, opts)
            ]);
            this.departments = deptRes.data || [];
            this.departmentMap = Object.fromEntries(this.departments.map(d => [d.id, d.tenphongban]));
            this.initDeptFilter();
            this.jobs = jobRes.data || [];
            this.timeParamKeyCache.clear();
            this.initMasterSelect();
            await this.loadDailyData(opts);
        } catch (error) {
            if (error.name !== 'AbortError') { console.error("Load Error:", error); AppUtils.Notify.error("Không thể tải dữ liệu: " + error.message); }
        } finally { this.state.isLoading = false; this.state.loadController = null; }
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
            const res = await AppUtils.API.get(this.apiUrls.employees, { ngaylamviec: this.currentDate, mode: this.mode, page_size: 2000 }, opts);
            this.employees = (res.data || []).map(e => this.mapEmployeeRecord(e));
            this.render();
        } catch (error) {
            if (error.name !== 'AbortError') { console.error("Employee Load Error:", error); AppUtils.Notify.error("Lỗi tải danh sách nhân viên: " + error.message); }
        } finally { if (!existingOpts) { this.state.isLoading = false; this.state.loadController = null; } }
    }

    initDeptFilter() {
        if (!this.elements.deptSelect) return;
        this.elements.deptSelect.innerHTML = '<option value="all">Tất cả PB</option>' + this.departments.map(d => `<option value="${d.id}">${d.tenphongban}</option>`).join('');
    }

    initMasterSelect() {
        if (!this.elements.masterJobSelect) return;
        this.elements.masterJobSelect.innerHTML = '<option value="">-- Công việc --</option>' + this.jobs.map(j => `<option value="${j.id}">${j.tencongviec}</option>`).join('');
        this.elements.masterJobSelect.dispatchEvent(new Event('css-update'));
    }

    buildKhungGioPayload(khungGio = {}) {
        const source = khungGio || {};
        const rawCong = source.congcuakhunggio;
        const parsedCong = rawCong === '' || rawCong === null || rawCong === undefined ? null : Number(rawCong);
        return {
            ...source,
            congcuakhunggio: Number.isFinite(parsedCong) ? parsedCong : null
        };
    }

    getAutoWorkHoursValue(emp) {
        const currentMinutes = emp?.uiState?.workHours?.actualMinutes;
        if (!Number.isFinite(currentMinutes) || currentMinutes < 0) return '';
        return (Math.round((currentMinutes / 60) * 100) / 100).toString();
    }

    isEmptyValue(value) {
        return value === '' || value === null || value === undefined;
    }

    getTimeParamKeyForJob(jobId) {
        if (!jobId) return null;
        const cacheKey = String(jobId);
        if (this.timeParamKeyCache.has(cacheKey)) return this.timeParamKeyCache.get(cacheKey);

        const jobDef = this.jobs.find(j => String(j.id) === cacheKey);
        const params = this.render$.parseParams(jobDef?.danhsachthamso);
        const key = value => AppUtils.Helper.generateCode(String(value || ''));
        const timeParamDef = params.find(def => {
            if (key(def?.ma) === 'THOI_GIAN') return true;
            return [def?.ten, def?.tenthamso, def?.ten_tham_so, def?.label, def?.name].some(name => key(name) === 'THOI_GIAN');
        });

        const timeKey = timeParamDef?.ma || null;
        this.timeParamKeyCache.set(cacheKey, timeKey);
        return timeKey;
    }

    setTimeParamForJob(jobItem, hourValue, options = {}) {
        const { overwrite = true, clearWhenEmpty = false } = options;
        const timeKey = this.getTimeParamKeyForJob(jobItem?.jobId);
        if (!timeKey) return null;

        if (!jobItem.params || typeof jobItem.params !== 'object') jobItem.params = {};
        
        if (jobItem._manualOverrides && jobItem._manualOverrides[timeKey]) return timeKey;

        const currentValue = jobItem.params[timeKey];
        const canWrite = overwrite || this.isEmptyValue(currentValue);
        if (!canWrite) return timeKey;

        if (hourValue) jobItem.params[timeKey] = hourValue;
        else if (clearWhenEmpty) jobItem.params[timeKey] = '';
        return timeKey;
    }

    syncTimeParamWithWorkHours(emp, options = {}) {
        const { clearWhenEmpty = false, tr = null } = options;
        if (!emp?.uiState?.jobs?.length) return;
        const hourValue = this.getAutoWorkHoursValue(emp);

        emp.uiState.jobs.forEach((jobItem, index) => {
            const timeKey = this.setTimeParamForJob(jobItem, hourValue, { overwrite: true, clearWhenEmpty });
            if (!tr || !timeKey) return;
            const input = tr.querySelector(`.param-val[data-index="${index}"][data-key="${timeKey}"]`);
            if (input) input.value = jobItem.params?.[timeKey] ?? '';
        });
    }

    applyAutoTimeParam(jobItem, emp, options = {}) {
        const { overwrite = true } = options;
        if (!jobItem?.jobId || !emp) return;
        const hourValue = this.getAutoWorkHoursValue(emp);
        this.setTimeParamForJob(jobItem, hourValue, { overwrite, clearWhenEmpty: false });
    }

    handleFilter() { this.state.filters.search = AppUtils.Helper.removeAccents(this.elements.searchInput?.value || '').toLowerCase(); this.render(); }

    getFilteredEmployees() {
        const { search, dept } = this.state.filters;
        return this.employees.filter(e => {
            const name = AppUtils.Helper.removeAccents(e.hovaten || '').toLowerCase();
            const code = (e.manhanvien || '').toLowerCase();
            const nameMatch = !search || name.includes(search) || code.includes(search);
            const deptMatch = dept === 'all' || e.phongban_id == dept;
            return nameMatch && deptMatch;
        });
    }

    render() {
        const tbody = this.elements.hybridBody;
        if (!tbody) return;
        const list = this.getFilteredEmployees();
        if (!list.length) {
            AppUtils.UI.renderEmptyState(tbody, { message: 'Không tìm thấy nhân viên phù hợp', colspan: 8, icon: 'search' });
            this.resetMasterCheckbox();
            return;
        }
        tbody.innerHTML = '';
        const fragment = document.createDocumentFragment();
        list.forEach(emp => fragment.appendChild(this.createRow(emp)));
        tbody.appendChild(fragment);
        this.updateMasterCheckbox();
    }

    createRow(emp) {
        this.initEmpState(emp);
        const tr = document.createElement('tr');
        tr.className = 'group hover:bg-blue-50/20 transition-colors border-b-2 border-slate-300 align-top';
        if (emp.uiState.isLeave) tr.classList.add('inactive');
        else if (!emp.uiState.isSelected) tr.classList.add('unselected');
        const scheduleIn = this.render$.formatTimeDisplay(emp.khunggiolamviec?.thoigianbatdau) || '08:00';
        const scheduleOut = this.render$.formatTimeDisplay(emp.khunggiolamviec?.thoigianketthuc) || '17:00';
        tr.dataset.id = emp.rowId;

        if (!emp.uiState.isLeave && (emp.uiState.in || !emp.cocancheckout)) {
            const schedule = this.validator?.normalizeSchedule(emp.khunggiolamviec);
            emp.uiState.workHours = this.validator?.calculateActualWorkHours({
                checkIn: emp.uiState.in, checkOut: emp.uiState.out, schedule, requiresCheckout: emp.cocancheckout === true, lunchBreaks: emp.khunggionghitrua || []
            });
        } else {
            emp.uiState.workHours = null;
        }

        tr.innerHTML = this.render$.renderCommonCells(emp, scheduleIn, scheduleOut, 'blue') + this.render$.renderHybridCells(emp, this.jobs);
        if (emp.uiState.isLeave) this.toggleRowInputs(tr, false);
        if (!emp.uiState.isLeave && (emp.uiState.in || !emp.cocancheckout)) this.analyzeTime(tr, { syncJobs: false });
        
        tr.querySelectorAll('.job-select').forEach(select => {
            if (window.CustomSelectManager) {
                window.CustomSelectManager.transform(select, 'h-[26px]', 'text-xs');
            }
        });
        
        return tr;
    }

    handleGridInputChange(e) {
        const target = e.target;
        const { tr, emp } = this.getRowContext(target);
        if (!tr || !emp) return;
        const cls = target.classList;

        if (cls.contains('row-cb')) {
            emp.uiState.isSelected = target.checked;
            this.updateMasterCheckbox();
            if (!emp.uiState.isLeave) tr.classList.toggle('unselected', !target.checked);
        }
        else if (cls.contains('shift-type-select')) {
            emp.uiState.shiftType = target.value;
            this.refreshRow(tr, emp);
        }
        else if (cls.contains('inp-in')) { emp.uiState.in = target.value; this.analyzeTime(tr); }
        else if (cls.contains('inp-out')) {
            emp.uiState.out = target.value;
            if (emp.uiState.ot) { emp.uiState.otMinutes = this.computeOtMinutes(emp, target.value); const otInp = tr.querySelector('.ot-minutes'); if (otInp) otInp.value = emp.uiState.otMinutes || ''; }
            this.analyzeTime(tr);
        }
        else if (cls.contains('chk-lunch')) { emp.uiState.lunch = target.checked; }
        else if (cls.contains('chk-ot')) {
            emp.uiState.ot = target.checked; emp.uiState.otMinutes = target.checked ? this.computeOtMinutes(emp, emp.uiState.out) : '';
            const otInp = tr.querySelector('.ot-minutes'); if (otInp) { otInp.disabled = !target.checked; otInp.value = target.checked ? (emp.uiState.otMinutes || '') : ''; }
        }
        else if (cls.contains('job-select')) {
            const idx = parseInt(target.dataset.index, 10);
            const targetJobs = emp.uiState.jobs;
            if (targetJobs[idx]) {
                const selectedJob = { jobId: target.value, params: {} };        
                this.applyAutoTimeParam(selectedJob, emp, { overwrite: true }); 
                targetJobs[idx] = selectedJob;
                this.refreshRow(tr, emp);
            }
        }
        else if (cls.contains('param-val')) {
            const { index, key } = target.dataset;
            const targetJobs = emp.uiState.jobs;
            if (targetJobs[index]) {
                const val = target.value;
                targetJobs[index].params[key] = val;
                
                if (!targetJobs[index]._manualOverrides) targetJobs[index]._manualOverrides = {};
                if (val === '') {
                    targetJobs[index]._manualOverrides[key] = false;
                } else {
                    targetJobs[index]._manualOverrides[key] = true;
                }
            }
        }
        else if (cls.contains('ot-minutes')) { emp.uiState.otMinutes = target.value; }
        else if (cls.contains('note-input')) { emp.uiState.note = target.value; }
    }

    handleGridClick(e) {
        const leaveBtn = e.target.closest('.leave-pill');
        if (leaveBtn) {
            const { tr, emp } = this.getRowContext(leaveBtn);
            if (!tr || !emp) return;
            this.toggleLeave(tr, emp);
            return;
        }

        const btn = e.target.closest('button');
        if (!btn) return;
        const { tr, emp } = this.getRowContext(btn);
        if (!tr || !emp) return;
        const targetJobs = emp.uiState.jobs;
        
        if (btn.classList.contains('btn-add-job')) { 
            targetJobs.push({ jobId: '', params: {} }); 
            this.refreshRow(tr, emp); 
        }
        else if (btn.classList.contains('btn-remove-job')) {
            const idx = parseInt(btn.dataset.index); 
            targetJobs.splice(idx, 1);
            if (!targetJobs.length) targetJobs.push({ jobId: '', params: {} });
            this.refreshRow(tr, emp);
        }
    }

    initEmpState(emp) {
        if (!emp.uiState) emp.uiState = { in: '', out: '', lunch: true, ot: false, otMinutes: '', isSelected: this.mode === 'create', isLeave: false, jobs: [{ jobId: '', params: {} }], extraJobs: [], note: '' };
        emp.uiState.isLeave = emp.uiState.isLeave === true;
        if (emp.uiState.isLeave) emp.uiState.isSelected = false;
        emp.uiState.isSelected ??= (this.mode === 'create');
        emp.uiState.otMinutes ??= ''; emp.uiState.note ??= '';
        if (!emp.uiState.jobs?.length) emp.uiState.jobs = [{ jobId: '', params: {} }];
    }

    getEmpById(id) { return this.employees.find(x => String(x.rowId) === String(id)); }
    getEmpByEmployeeId(id) { return this.employees.find(x => String(x.id) === String(id)); }

    getRowContext(target) {
        const tr = target?.closest('tr[data-id]');
        if (!tr) return { tr: null, emp: null };
        return { tr, emp: this.getEmpById(tr.dataset.id) };
    }

    getEnabledRowCheckboxes(tbody = this.elements.hybridBody) {
        return tbody ? Array.from(tbody.querySelectorAll('.row-cb:not(:disabled)')) : [];
    }

    getCheckedRowCheckboxes(tbody = this.elements.hybridBody) {
        return this.getEnabledRowCheckboxes(tbody).filter(cb => cb.checked);
    }

    toggleLeave(tr, emp) {
        emp.uiState.isLeave = !emp.uiState.isLeave;
        if (emp.uiState.isLeave) {
            emp.uiState.isSelected = false;
        } else {
            emp.uiState.isSelected = true;
        }
        this.refreshRow(tr, emp);
        this.updateMasterCheckbox();
    }

    refreshRow(tr, emp) {
        if (!tr) return null;
        const scrollWrap = tr.closest('.overflow-auto');
        const prevScrollTop = scrollWrap ? scrollWrap.scrollTop : 0;
        const prevScrollLeft = scrollWrap ? scrollWrap.scrollLeft : 0;
        const newRow = this.createRow(emp);
        tr.replaceWith(newRow);

        if (scrollWrap) {
            requestAnimationFrame(() => {
                const maxTop = Math.max(0, scrollWrap.scrollHeight - scrollWrap.clientHeight);
                scrollWrap.scrollTop = Math.min(prevScrollTop, maxTop);
                scrollWrap.scrollLeft = prevScrollLeft;
            });
        }
        return newRow;
    }

    computeOtMinutes(emp, outVal) {
        if (!outVal) return '';
        const scheduleEnd = this.render$.formatTimeDisplay(emp.khunggiolamviec?.thoigianketthuc) || null;
        if (!scheduleEnd) return '';
        const schedule = this.validator?.normalizeSchedule(emp.khunggiolamviec);
        const isOvernight = schedule && this.validator?.isOvernightShift(schedule);
        if (isOvernight) {
            let outMin = AppUtils.TimeUtils.toMinutesSafe(outVal);
            let endMin = schedule.endTime;
            outMin = this.validator.normalizeTimeForOvernight(outMin, schedule, 'checkOut');
            if (endMin < schedule.startTime) endMin += 1440;
            const diff = outMin - endMin;
            return diff > 0 ? diff : '';
        }
        const diff = AppUtils.TimeUtils.diffMinutes(outVal, scheduleEnd);
        return diff > 0 ? diff : '';
    }

    toggleRowInputs(tr, enable) {
        tr.classList.toggle('inactive', !enable);
        tr.querySelectorAll('input:not(.row-cb):not(.note-input), select, button:not(.leave-pill)').forEach(el => el.disabled = !enable);
        if (!enable) {
            const res = tr.querySelector('.analysis-result'); if (res) res.innerHTML = '<span class="text-[10px] text-slate-300">-</span>';
            tr.querySelectorAll('.cell-input').forEach(i => i.classList.remove('text-red-600'));
            const otInp = tr.querySelector('.ot-minutes'); if (otInp) otInp.disabled = true;
            const workHoursEl = tr.querySelector('.work-hours-display'); if (workHoursEl) { workHoursEl.textContent = '-'; workHoursEl.className = 'work-hours-display text-[12px] font-mono px-1.5 py-0.5 rounded text-slate-400'; }
        } else {
            const emp = this.getEmpById(tr.dataset.id);
            const inpOut = tr.querySelector('.inp-out'); if (inpOut && emp) inpOut.disabled = (emp.cocancheckout === false);
            const otInp = tr.querySelector('.ot-minutes'); if (otInp && emp) otInp.disabled = !emp.uiState.ot;
            this.analyzeTime(tr);
        }
    }

    resetMasterCheckbox() {
        const cb = this.elements.checkAllHybrid;
        if (cb) {
            cb.checked = false;
            cb.indeterminate = false;
        }
    }

    updateMasterCheckbox() {
        const tbody = this.elements.hybridBody;
        const cb = this.elements.checkAllHybrid;
        if (!cb || !tbody) return;
        const all = this.getEnabledRowCheckboxes(tbody);
        const checkedCount = all.filter(item => item.checked).length;
        cb.checked = all.length > 0 && checkedCount === all.length;
        cb.indeterminate = checkedCount > 0 && checkedCount < all.length;
    }

    toggleAll(masterCb, tbodyId) {
        const tbody = document.getElementById(tbodyId); if (!tbody) return;
        const isChecked = masterCb.checked;
        this.getEnabledRowCheckboxes(tbody).forEach(cb => {
            cb.checked = isChecked;
            const tr = cb.closest('tr[data-id]');
            const emp = tr ? this.getEmpById(tr.dataset.id) : null;
            if (emp) {
                emp.uiState.isSelected = isChecked;
                if (!emp.uiState.isLeave) tr.classList.toggle('unselected', !isChecked);
            }
        });
        this.updateMasterCheckbox();
    }

    analyzeTime(tr, opts = {}) {
        if (!tr) return;
        const inpIn = tr.querySelector('.inp-in'), inpOut = tr.querySelector('.inp-out'), res = tr.querySelector('.analysis-result');
        const workHoursEl = tr.querySelector('.work-hours-display'), otInp = tr.querySelector('.ot-minutes');
        const emp = this.getEmpById(tr.dataset.id); if (!emp) return;
        if (emp.uiState.isLeave) {
            if (res) res.innerHTML = '<span class="text-[10px] text-slate-300">-</span>';
            if (workHoursEl) {
                workHoursEl.textContent = '-';
                workHoursEl.className = 'work-hours-display text-[12px] font-mono px-1.5 py-0.5 rounded text-slate-400';
            }
            if (otInp) otInp.value = '';
            return;
        }
        const inVal = inpIn?.value, outVal = inpOut?.value;

        const schedule = this.validator?.normalizeSchedule(emp.khunggiolamviec);
        const analysis = this.validator?.getAnalysisDetails({ checkIn: inVal, checkOut: outVal, schedule, employee: emp });
        const workHours = this.validator?.calculateActualWorkHours({ checkIn: inVal, checkOut: outVal, schedule, requiresCheckout: emp.cocancheckout === true, lunchBreaks: emp.khunggionghitrua || [] });

        if (emp.uiState.ot) { emp.uiState.otMinutes = this.computeOtMinutes(emp, outVal); if (otInp) otInp.value = emp.uiState.otMinutes || ''; }
        emp.uiState.workHours = workHours || null;
        if (workHoursEl && workHours) {
            workHoursEl.textContent = workHours.formatted;
            workHoursEl.className = `work-hours-display text-[12px] font-mono px-1.5 py-0.5 rounded ${workHours.displayClass}`;
        } else if (workHoursEl) {
            workHoursEl.textContent = '-';
            workHoursEl.className = 'work-hours-display text-[12px] font-mono px-1.5 py-0.5 rounded text-slate-400';
        }

        if (opts.syncJobs !== false) this.syncTimeParamWithWorkHours(emp, { clearWhenEmpty: true, tr });
        if (res) res.innerHTML = !analysis ? '<span class="text-[10px] text-slate-300">-</span>' : this.render$.renderCompactAnalysis(analysis);

        const hasViolations = analysis?.violations?.length > 0, hasWarnings = analysis?.warnings?.length > 0;
        [inpIn, inpOut].forEach(inp => { if (inp) { inp.classList.remove('text-red-600', 'text-amber-600'); if (hasViolations) inp.classList.add('text-red-600'); else if (hasWarnings) inp.classList.add('text-amber-600'); } });
    }

    renderMasterParams() {
        const container = document.getElementById('m-params'); if (!container) return;
        const job = this.jobs.find(j => j.id == this.elements.masterJobSelect.value);
        container.innerHTML = job ? this.render$.renderMasterParams(job) : '';
    }

    applyMaster() {
        const filteredEmployees = this.getFilteredEmployees();
        const checkedEmployees = filteredEmployees.filter(emp => emp.uiState && emp.uiState.isSelected && !emp.uiState.isLeave);
        if (!checkedEmployees.length) { AppUtils.Notify.warning('Chưa chọn nhân viên nào!'); return; }

        const timeIn = document.getElementById('m-in')?.value, timeOut = document.getElementById('m-out')?.value;
        const mLunchEl = document.getElementById('m-lunch');
        const masterLunch = mLunchEl ? !!mLunchEl.checked : null;
        let masterJob = null;
        if (this.elements.masterJobSelect?.value) {
            const mParams = Object.fromEntries(Array.from(document.querySelectorAll('.m-p-val')).map(i => [i.dataset.key, i.value]));
            masterJob = { jobId: this.elements.masterJobSelect.value, params: mParams };
        }

        let count = 0;
        checkedEmployees.forEach(emp => {
            if (timeIn) emp.uiState.in = timeIn;
            if (timeOut && emp.cocancheckout === true) emp.uiState.out = timeOut;
            if (masterLunch !== null) emp.uiState.lunch = masterLunch;
            if (masterJob) {
                const targetJobs = emp.uiState.jobs;
                const emptyIdx = targetJobs.findIndex(j => !j.jobId);
                const newJob = JSON.parse(JSON.stringify(masterJob));
                this.applyAutoTimeParam(newJob, emp, { overwrite: false });
                
                if (!newJob._manualOverrides) newJob._manualOverrides = {};
                for (const pk in newJob.params) {
                    if (newJob.params[pk] !== '') newJob._manualOverrides[pk] = true;
                }
                
                emptyIdx !== -1 ? targetJobs[emptyIdx] = newJob : targetJobs.push(newJob);
            }
            count++;
        });
        this.render();
        AppUtils.Notify.success(`Đã cập nhật dữ liệu cho ${count} nhân viên.`);
    }

    async saveData() {
        const payload = this.prepareSavePayload();
        if (!payload.length) { AppUtils.Notify.warning('Không có dữ liệu hợp lệ để lưu.'); return; }
        const validationResult = this.validateTimeConstraints(payload);
        if (!validationResult.isValid) { this.showViolationsModal(validationResult, payload); return; }
        const stats = this.collectSaveStats();
        const uniqueEmployeeCount = new Set(payload.map(item => String(item.nhanvien_id))).size;
        const lines = [
            `• ${stats.selectedCount} nhân viên được chọn lưu chấm công`,
            `• ${stats.leaveCount} nhân viên được đánh dấu nghỉ`,
            `• ${stats.skippedCount} nhân viên bỏ qua (không gửi)`,
            `• Tổng ${uniqueEmployeeCount} nhân viên sẽ được gửi (VP + SX + Nghỉ)`
        ];
        const msg = `Bạn có chắc muốn lưu dữ liệu chấm công?\n${lines.join('\n')}`;
        AppUtils.Modal.showConfirm({ title: 'Lưu bảng chấm công', message: msg, confirmText: 'Lưu dữ liệu', onConfirm: () => this.executeSave(payload) });
    }

    collectSaveStats() {
        const rows = this.employees;
        const leaveCount = rows.filter(emp => emp.uiState?.isLeave === true).length;
        const selectedCount = rows.filter(emp => emp.uiState?.isSelected === true && emp.uiState?.isLeave !== true).length;
        const skippedCount = Math.max(rows.length - leaveCount - selectedCount, 0);
        return { selectedCount, leaveCount, skippedCount };
    }

    async executeSave(payload) {
        this.state.isLoading = true;
        try {
            const requestFn = this.mode === 'update' ? AppUtils.API.put : AppUtils.API.post;
            const response = await requestFn(this.apiUrls.saveChamCong, payload);
            if (response.success || response.id || Array.isArray(response)) {
                AppUtils.Notify.success('Lưu dữ liệu chấm công thành công!');
                await this.loadDailyData();
            }
            else throw new Error(response.message || 'Lỗi không xác định');
        } catch (error) { console.error('Save Error:', error); AppUtils.Notify.error('Lưu thất bại: ' + error.message); }
        finally { this.state.isLoading = false; }
    }

    prepareSavePayload() {
        const payload = [];

        this.employees.forEach(emp => {
            if (!emp?.uiState) return;
            const s = emp.uiState;

            const shouldSaveLeave = s.isLeave === true;
            const shouldSaveAttendance = s.isSelected === true && !shouldSaveLeave;
            if (!shouldSaveLeave && !shouldSaveAttendance) return;

            if (shouldSaveLeave) {
                payload.push({
                    nhanvien_id: emp.id,
                    ngaylamviec: this.currentDate,
                    thoigianchamcongvao: null,
                    thoigianchamcongra: null,
                    cotinhlamthem: false,
                    coantrua: false,
                    loaicalamviec: emp.loaicalamviec || 'CO_DINH',
                    cophaingaynghi: true,
                    id: this.mode === 'update' ? (emp.recordId || null) : null,
                    codilam: false,
                    calamviec_id: emp.calamviec_id,
                    khunggionghitrua: emp.khunggionghitrua || {},
                    khunggiolamviec: this.buildKhungGioPayload(emp.khunggiolamviec),
                    cocancheckout: emp.cocancheckout === true,
                    sogiolamthucte: 0,
                    sophutot: 0,
                    tongthoigianlamvieccuaca: emp.tongthoigianlamvieccuaca || 0,
                    loaichamcong: 'VP',
                    phuongthuctinhluong: 'monthly',
                    congviec_id: null,
                    tencongviec: 'Nghỉ phép',
                    thamsotinhluong: {},
                    ghichu: s.note || 'Nghỉ phép'
                });
                return;
            }

            const isActive = shouldSaveAttendance;
            const schedule = this.validator?.normalizeSchedule(emp.khunggiolamviec);
            const workHours = isActive ? this.validator?.calculateActualWorkHours({ checkIn: s.in, checkOut: s.out, schedule, requiresCheckout: emp.cocancheckout === true, lunchBreaks: emp.khunggionghitrua || [] }) : null;
            const validJobs = isActive ? (s.jobs || []).filter(jobItem => jobItem.jobId) : [];
            const validExtraJobs = validJobs;
            const hasProductionJobs = validJobs.length > 0;
            const isSXMode = s.shiftType === 'SX';

            const baseObj = {
                nhanvien_id: emp.id, ngaylamviec: this.currentDate,
                thoigianchamcongvao: isActive ? (s.in || null) : null,
                thoigianchamcongra: isActive ? (s.out || null) : null,
                cotinhlamthem: isActive ? (s.ot || false) : false,
                coantrua: isActive ? (s.lunch === true) : false,
                loaicalamviec: emp.loaicalamviec || 'CO_DINH',
                cophaingaynghi: false, id: this.mode === 'update' ? (emp.recordId || null) : null, codilam: isActive, calamviec_id: emp.calamviec_id,
                khunggionghitrua: emp.khunggionghitrua || {}, khunggiolamviec: this.buildKhungGioPayload(emp.khunggiolamviec), cocancheckout: emp.cocancheckout === true,
                sogiolamthucte: workHours?.actualMinutes || 0, sophutot: isActive && s.otMinutes ? parseInt(s.otMinutes, 10) || 0 : 0, tongthoigianlamvieccuaca: emp.tongthoigianlamvieccuaca || 0,
                phuongthuctinhluong: isSXMode ? 'daily' : 'monthly'
            };

            if (isSXMode) {
                if (hasProductionJobs) {
                    validJobs.forEach(jobItem => {
                        const jobDef = this.jobs.find(j => j.id == jobItem.jobId);
                        if (!jobDef) return;
                        payload.push({
                            ...baseObj,
                            loaichamcong: 'SX',
                            congviec_id: parseInt(jobItem.jobId),
                            tencongviec: jobDef.tencongviec,
                            thamsotinhluong: {
                                tham_so: this.formatJobParams(jobItem.params, jobDef.danhsachthamso),
                                bieu_thuc: jobDef.bieuthuctinhtoan,
                                loaicv: jobDef.loaicongviec
                            },
                            ghichu: s.note || ''
                        });
                    });
                } else {
                    payload.push({
                        ...baseObj,
                        loaichamcong: 'SX',
                        congviec_id: null,
                        tencongviec: isActive ? 'Chưa giao việc' : '',
                        thamsotinhluong: {},
                        ghichu: s.note || ''
                    });
                }
            } else { // monthly
                payload.push({
                    ...baseObj,
                    loaichamcong: 'VP',
                    congviec_id: null,
                    tencongviec: isActive ? 'Hành chính' : '',
                    thamsotinhluong: {},
                    ghichu: s.note || ''
                });

                validExtraJobs.forEach(jobItem => {
                    const jobDef = this.jobs.find(j => j.id == jobItem.jobId);
                    if (!jobDef) return;
                    payload.push({
                        ...baseObj,
                        loaichamcong: 'SX',
                        pay_role: 'extra',
                        congviec_id: parseInt(jobItem.jobId),
                        tencongviec: jobDef.tencongviec,
                        thamsotinhluong: {
                            tham_so: this.formatJobParams(jobItem.params, jobDef.danhsachthamso),
                            bieu_thuc: jobDef.bieuthuctinhtoan,
                            loaicv: jobDef.loaicongviec
                        },
                        ghichu: s.note || ''
                    });
                });
            }
        });
        return payload;
    }

    formatJobParams(userParams, paramsDef) {
        const defs = this.render$.parseParams(paramsDef), result = {};
        defs.forEach(def => { const val = userParams[def.ma] ?? def.giatri_macdinh ?? ''; result[def.ma] = ['number', 'currency', 'percent'].includes(def.kieu) ? (Number(val) || 0) : String(val); });
        return result;
    }

    switchTab(_tab, shouldRender = true) {
        if (shouldRender) this.render();
    }

    initViolationsModal() {
        const modal = document.getElementById('violations-modal');
        this.elements.violationsModalBody = document.getElementById('violations-modal-body');
        if (!modal) return;
        this.elements.violationsModal = modal;
        
        this.eventManager.addMultiple(modal.querySelectorAll('[data-modal-close]'), 'click', () => AppUtils.Modal.close(modal));
        this.eventManager.add(modal, 'click', e => { if (e.target === modal) AppUtils.Modal.close(modal); });
        
        const forceSaveBtn = document.getElementById('btn-force-save');
        if (forceSaveBtn) {
            this.eventManager.add(forceSaveBtn, 'click', () => {
                AppUtils.Modal.close(modal);
                if (this._pendingPayload) {
                    AppUtils.Modal.showConfirm({
                        title: 'Xác nhận lưu',
                        message: `Bạn đã chọn bỏ qua cảnh báo. Tiếp tục lưu ${this._pendingPayload.length} bản ghi?`,
                        confirmText: 'Lưu ngay', type: 'warning',
                        onConfirm: () => { this.executeSave(this._pendingPayload); this._pendingPayload = null; }
                    });
                }
            });
        }
    }

    validateTimeConstraints(payload) {
        if (!this.validator) return { isValid: true, violations: [] };
        const records = [], processedIds = new Set();
        payload.forEach(item => {
            if (processedIds.has(item.nhanvien_id) || !item.codilam) return;
            processedIds.add(item.nhanvien_id);
            const emp = this.getEmpByEmployeeId(item.nhanvien_id);
            if (emp) records.push({ checkIn: emp.uiState?.in || null, checkOut: emp.uiState?.out || null, employee: emp });
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

    destroy() {
        if (this.state.loadController) this.state.loadController.abort();
        this.eventManager.removeAll();
        if (this.contextMenu?.destroy) this.contextMenu.destroy();
        this.employees = []; this.jobs = []; this._pendingPayload = null;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.ChamCongManager = new ChamCongManager({
        apiUrls: { employees: '/hrm/cham-cong/api/bang-cham-cong/nhan-vien-list/', departments: '/hrm/to-chuc-nhan-su/api/v1/phong-ban/', jobs: '/hrm/to-chuc-nhan-su/api/cong-viec/list/', saveChamCong: '/hrm/cham-cong/api/bang-cham-cong/list/' }
    });
    window.ChamCongManager.init();
});
