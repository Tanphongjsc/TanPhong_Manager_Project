class ChamCongManager {
    constructor(config) {
        if (typeof AppUtils === 'undefined') {
            console.error('⛔ AppUtils is required');
            return;
        }

        this.apiUrls = config.apiUrls || {};
        // Tận dụng getter csrfToken từ AppUtils
        this.csrfToken = AppUtils.csrfToken; 

        // Data State
        this.employees = [];
        this.jobs = [];
        this.productionTypeId = null;
        // Tận dụng DateUtils để format đúng chuẩn YYYY-MM-DD cho input date
        this.currentDate = AppUtils.DateUtils.toInputValue(new Date());

        // UI State
        this.state = { 
            filters: { search: '', dept: 'all' }, 
            activeTab: 'vp', 
            isLoading: false,
            // Controller để hủy request nếu user spam nút reload (Pattern từ BaseCRUDManager)
            loadController: null 
        };

        this.elements = {};
        this.eventManager = AppUtils.EventManager.create();
        
        // Tận dụng debounce có sẵn
        this.debouncedFilter = AppUtils.Helper.debounce(this.handleFilter.bind(this), 300);
    }

    init() {
        this.cacheElements();
        if (this.elements.dateInput) {
            this.elements.dateInput.value = this.currentDate;
        }
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
        const em = this.eventManager;

        // 1. Checkbox Master
        if (this.elements.checkAllVp) em.add(this.elements.checkAllVp, 'change', e => this.toggleAll(e.target, 'vp-body'));
        if (this.elements.checkAllSx) em.add(this.elements.checkAllSx, 'change', e => this.toggleAll(e.target, 'sx-body'));

        // 2. Filters
        if (this.elements.searchInput) em.add(this.elements.searchInput, 'input', this.debouncedFilter);
        if (this.elements.deptSelect) {
            em.add(this.elements.deptSelect, 'change', () => {
                this.state.filters.dept = this.elements.deptSelect.value;
                this.render();
            });
        }

        // 3. Grid Interactions (Input Change & Click) - Event Delegation tối ưu
        const handleDataChange = (e) => this.handleGridInputChange(e);
        em.add(this.elements.vpBody, 'change', handleDataChange);
        em.add(this.elements.sxBody, 'change', handleDataChange);
        em.add(this.elements.sxBody, 'click', (e) => this.handleGridClick(e));
    }

    async loadResources() {
        // Pattern hủy request cũ (học từ BaseCRUDManager)
        if (this.state.loadController) {
            this.state.loadController.abort();
        }
        this.state.loadController = new AbortController();
        this.state.isLoading = true;

        try {
            // Sử dụng AppUtils.API hỗ trợ signal hủy request
            const options = { signal: this.state.loadController.signal };
            
            const [empRes, jobRes, typeRes] = await Promise.all([
                AppUtils.API.get(this.apiUrls.employees, { page_size: 1000 }, options), 
                AppUtils.API.get(this.apiUrls.jobs, { status: 'active', page_size: 1000 }, options),
                AppUtils.API.get(this.apiUrls.employeeTypes, { search: 'Công nhân' }, options)
            ]);

            this.employees = empRes.data || [];
            this.jobs = jobRes.data || [];
            
            // Tìm ID loại nhân viên SX thông minh hơn
            if (typeRes.data?.length) {
                // removeAccents để so sánh chính xác hơn
                const key = AppUtils.Helper.removeAccents('Công nhân').toLowerCase();
                const factoryType = typeRes.data.find(t => 
                    AppUtils.Helper.removeAccents(t.TenLoaiNV).toLowerCase().includes(key)
                );
                this.productionTypeId = factoryType ? factoryType.id : null;
            }
            
            this.initDeptFilter();
            this.initMasterSelect();
            this.render();

        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error("Data Load Error:", error);
                AppUtils.Notify.error("Không thể tải dữ liệu: " + error.message);
            }
        } finally {
            this.state.isLoading = false;
            this.state.loadController = null;
        }
    }

    initDeptFilter() {
        if (!this.elements.deptSelect) return;
        const depts = [...new Set(this.employees.map(e => e.cong_tac?.phong_ban).filter(Boolean))].sort();
        const html = ['<option value="all">Tất cả PB</option>', ...depts.map(d => `<option value="${d}">${d}</option>`)];
        this.elements.deptSelect.innerHTML = html.join('');
    }

    initMasterSelect() {
        if (!this.elements.masterJobSelect) return;
        const html = ['<option value="">-- Công việc --</option>', ...this.jobs.map(j => `<option value="${j.id}">${j.tencongviec}</option>`)];
        this.elements.masterJobSelect.innerHTML = html.join('');
    }

    handleFilter() {
        // Tận dụng AppUtils.Helper.removeAccents để tìm kiếm Tiếng Việt không dấu
        const val = this.elements.searchInput.value;
        this.state.filters.search = AppUtils.Helper.removeAccents(val).toLowerCase();
        this.render();
    }

    getFilteredEmployees(type) {
        const { search, dept } = this.state.filters;
        return this.employees.filter(e => {
            // Logic tìm kiếm nâng cao dùng removeAccents
            const name = AppUtils.Helper.removeAccents(e.hovaten || '').toLowerCase();
            const code = (e.manhanvien || '').toLowerCase();
            const nameMatch = !search || name.includes(search) || code.includes(search);
            
            const deptMatch = dept === 'all' || e.cong_tac?.phong_ban === dept;
            
            let isFactory = false;
            if (this.productionTypeId !== null) {
                isFactory = (e.loainv === this.productionTypeId);
            } else {
                const deptName = AppUtils.Helper.removeAccents(e.cong_tac?.phong_ban || '').toLowerCase();
                isFactory = deptName.includes('xuong') || deptName.includes('san xuat');
            }
            
            return nameMatch && deptMatch && (type === 'vp' ? !isFactory : isFactory);
        });
    }

    render() {
        const type = this.state.activeTab;
        const tbody = type === 'vp' ? this.elements.vpBody : this.elements.sxBody;
        if (!tbody) return;

        const list = this.getFilteredEmployees(type);
        
        // Tận dụng AppUtils.UI.renderEmptyState
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
        
        Object.assign(tr.dataset, { id: emp.id, scheduleIn: '08:00', scheduleOut: '17:00' });

        const s = emp.uiState;
        const accent = type === 'vp' ? 'blue' : 'orange';
        const isChecked = s.isActive !== false ? 'checked' : '';
        
        // Sử dụng Template Literal tối ưu
        const commonHtml = `
            <td class="p-1 border-r border-slate-200 text-center sticky left-0 bg-inherit z-[2]">
                <input type="checkbox" ${isChecked} class="row-cb accent-${accent}-600 w-3.5 h-3.5 cursor-pointer mt-1.5">
            </td>
            <td class="px-2 py-1.5 border-r border-slate-200 sticky left-8 bg-inherit z-[2]">
                <div class="font-bold text-slate-700 text-xs truncate max-w-[160px]">${emp.hovaten}</div>
                <div class="text-[10px] text-slate-500 truncate flex items-center gap-1">
                    <span class="bg-slate-100 px-1 rounded border border-slate-200">${emp.manhanvien || '-'}</span>
                    <span>${emp.cong_tac?.phong_ban || ''}</span>
                </div>
            </td>
            <td class="p-0.5 border-r border-slate-200"><input type="time" value="${s.in || ''}" class="cell-input inp-in mt-1"></td>
            <td class="p-0.5 border-r border-slate-200"><input type="time" value="${s.out || ''}" class="cell-input inp-out mt-1"></td>`;

        tr.innerHTML = commonHtml + (type === 'vp' ? this.getVPCells(s) : this.getSXCells(s));
        
        if (!s.isActive) this.toggleRowInputs(tr, false);
        if (type === 'vp' && s.isActive && (s.in || s.out)) this.analyzeTime(tr);

        return tr;
    }

    getVPCells(s) {
        return `
            <td class="px-2 py-1 border-r border-slate-200"><div class="analysis-result flex flex-wrap gap-0.5 min-h-[14px] mt-1"><span class="text-[9px] text-slate-300">-</span></div></td>
            <td class="p-0.5 border-r border-slate-200 text-center"><input type="checkbox" class="chk-lunch w-3.5 h-3.5 cursor-pointer accent-blue-600 mt-1.5" ${s.lunch ? 'checked' : ''}></td>
            <td class="p-0.5 border-r border-slate-200 text-center"><input type="checkbox" class="chk-ot w-3.5 h-3.5 accent-orange-500 cursor-pointer mt-1.5" ${s.ot ? 'checked' : ''}></td>
            <td class="px-2 py-1"><input type="text" class="w-full text-[11px] border-b border-transparent focus:border-blue-300 outline-none bg-transparent placeholder-slate-300 mt-0.5" placeholder="..."></td>`;
    }

    getSXCells(s) {
        // Tối ưu tạo HTML cho options
        const jobOpts = this.jobs.map(j => `<option value="${j.id}">${j.tencongviec}</option>`);

        const jobListHtml = s.jobs.map((jobItem, index) => {
            // Replace string để set selected nhanh hơn render lại từ đầu
            const currentOpts = jobItem.jobId 
                ? jobOpts.join('').replace(`value="${jobItem.jobId}"`, `value="${jobItem.jobId}" selected`)
                : jobOpts.join('');
            
            const showDelete = index > 0 || s.jobs.length > 1 || jobItem.jobId;
            const deleteBtn = showDelete
                ? `<button class="btn-remove-job w-6 h-6 flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-all ml-auto shrink-0" data-index="${index}" title="Xóa"><i class="fa-solid fa-xmark"></i></button>` 
                : `<div class="w-6 h-6 ml-auto shrink-0"></div>`;

            return `
                <div class="job-row flex items-center gap-2 p-1.5 border-b border-dashed border-slate-200 last:border-0 hover:bg-orange-50/40 transition-colors group/job relative">
                    <div class="w-5 h-5 flex items-center justify-center bg-orange-100 text-orange-700 text-[10px] font-bold rounded-full border border-orange-200 shadow-sm select-none shrink-0">${index + 1}</div>
                    <div class="w-[140px] shrink-0">
                        <select class="job-select w-full text-[11px] font-medium text-slate-700 border border-slate-200 rounded py-0.5 px-1.5 focus:border-orange-500 outline-none bg-white shadow-sm h-[24px]" data-index="${index}">
                            <option value="">--</option>${currentOpts}
                        </select>
                    </div>
                    <div class="flex-1 flex flex-wrap items-center gap-2 min-h-[24px]">
                        ${this.renderJobParams(jobItem, index)}
                    </div>
                    ${deleteBtn}
                </div>`;
        }).join('');

        return `
            <td class="p-0 border-r border-slate-200 align-top">
                <div class="flex flex-col w-full">
                    ${jobListHtml}
                    <div class="flex justify-center py-1.5">
                        <button class="btn-add-job text-[11px] text-slate-400 hover:text-orange-500 font-medium transition-colors" title="Thêm">+ Thêm</button>
                    </div>
                </div>
            </td>
            <td class="p-0.5 border-r border-slate-200 text-center align-top pt-3"><input type="checkbox" class="chk-lunch w-3.5 h-3.5 cursor-pointer accent-blue-600" ${s.lunch ? 'checked' : ''}></td>
            <td class="p-0.5 text-center align-top pt-3"><input type="checkbox" class="chk-ot w-3.5 h-3.5 accent-orange-500 cursor-pointer" ${s.ot ? 'checked' : ''}></td>`;
    }

    renderJobParams(jobItem, index) {
        if (!jobItem.jobId) return `<span class="text-[10px] text-slate-300 italic pl-1 select-none font-light">Chọn công việc...</span>`;
        
        const jobDef = this.jobs.find(j => j.id == jobItem.jobId);
        if (!jobDef) return '';

        const paramsDef = this.parseParams(jobDef.danhsachthamso);
        return paramsDef.map(p => {
            const val = jobItem.params[p.ma] !== undefined ? jobItem.params[p.ma] : (p.giatri_macdinh || '');
            return `
                <div class="flex items-center bg-white border border-slate-200 rounded overflow-hidden h-[22px] shadow-sm hover:border-orange-300 transition-colors">
                    <div class="bg-slate-50 text-[9px] text-slate-500 font-bold px-1.5 h-full flex items-center border-r border-slate-100 uppercase tracking-wider select-none">${p.ma}</div>
                    <input type="text" class="param-val w-10 text-center text-[11px] font-semibold text-slate-700 bg-transparent border-none outline-none h-full focus:bg-orange-50 px-1" 
                        data-index="${index}" data-key="${p.ma}" value="${val}">
                </div>`;
        }).join('');
    }

    // --- INTERACTION HANDLERS ---
    handleGridInputChange(e) {
        const target = e.target;
        const tr = target.closest('tr');
        if (!tr || !tr.dataset.id) return;

        const emp = this.getEmpById(tr.dataset.id);
        if (!emp) return;

        // Xử lý Checkbox Row
        if (target.classList.contains('row-cb')) {
            emp.uiState.isActive = target.checked;
            this.toggleRowInputs(tr, target.checked);
            this.updateMasterCheckbox();
            return;
        }

        // Map Input -> State
        if (target.classList.contains('inp-in')) {
            emp.uiState.in = target.value;
            this.analyzeTime(tr);
        } else if (target.classList.contains('inp-out')) {
            emp.uiState.out = target.value;
            this.analyzeTime(tr);
        } else if (target.classList.contains('chk-lunch')) {
            emp.uiState.lunch = target.checked;
        } else if (target.classList.contains('chk-ot')) {
            emp.uiState.ot = target.checked;
        } else if (target.classList.contains('job-select')) {
            const idx = parseInt(target.dataset.index);
            if (emp.uiState.jobs[idx]) {
                emp.uiState.jobs[idx].jobId = target.value;
                emp.uiState.jobs[idx].params = {};
                this.refreshRow(tr, emp, 'sx');
            }
        } else if (target.classList.contains('param-val')) {
            const idx = parseInt(target.dataset.index);
            const key = target.dataset.key;
            if (emp.uiState.jobs[idx]) emp.uiState.jobs[idx].params[key] = target.value;
        }
    }

    handleGridClick(e) {
        const btn = e.target.closest('button');
        if (!btn) return;
        const tr = btn.closest('tr');
        if (!tr || !tr.dataset.id) return;
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

    // --- LOGIC UTILS ---
    initEmpState(emp) {
        if (!emp.uiState) {
            emp.uiState = { in: '', out: '', lunch: true, ot: false, isActive: true, jobs: [{ jobId: '', params: {} }] };
        }
        if (emp.uiState.isActive === undefined) emp.uiState.isActive = true;
        if (!emp.uiState.jobs?.length) emp.uiState.jobs = [{ jobId: '', params: {} }];
    }

    getEmpById(id) { return this.employees.find(x => x.id === parseInt(id)); }
    refreshRow(tr, emp, type) { tr.replaceWith(this.createRow(emp, type)); }

    toggleRowInputs(tr, enable) {
        tr.classList.toggle('inactive', !enable);
        tr.querySelectorAll('input:not(.row-cb), select, button').forEach(e => e.disabled = !enable);
        if (!enable) {
            const res = tr.querySelector('.analysis-result');
            if(res) res.innerHTML = '<span class="text-[9px] text-slate-300">-</span>';
            tr.querySelectorAll('.cell-input').forEach(i => i.classList.remove('text-red-600'));
        } else {
            this.analyzeTime(tr);
        }
    }

    resetMasterCheckbox(type) {
        const cb = type === 'vp' ? this.elements.checkAllVp : this.elements.checkAllSx;
        if(cb) { cb.checked = false; cb.indeterminate = false; }
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
            if(cb) cb.checked = isChecked;
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

        const inVal = inpIn?.value;
        const outVal = inpOut?.value;
        const { scheduleIn, scheduleOut } = tr.dataset;

        if (!inVal && !outVal) { res.innerHTML = '<span class="text-[9px] text-slate-300">-</span>'; return; }

        const toMin = t => { const [h,m] = t.split(':').map(Number); return h*60+m; };
        const badge = (text, isOk) => `<span class="text-[9px] ${isOk ? 'bg-green-50 text-green-600 border-green-100' : 'bg-red-50 text-red-600 border-red-100'} px-1 rounded border font-medium">${text}</span>`;
        
        let html = '';
        if (inVal && scheduleIn) {
            const late = toMin(inVal) - toMin(scheduleIn);
            if (late > 0) { html += badge(`Muộn ${late}p`, false); inpIn.classList.add('text-red-600'); }
            else inpIn.classList.remove('text-red-600');
        }
        if (outVal && scheduleOut) {
            const early = toMin(scheduleOut) - toMin(outVal);
            if (early > 0) { html += badge(`Sớm ${early}p`, false); inpOut.classList.add('text-red-600'); }
            else inpOut.classList.remove('text-red-600');
        }
        res.innerHTML = html || badge('✓ OK', true);
    }

    // --- MASTER ACTIONS ---
    renderMasterParams() {
        const container = document.getElementById('m-params');
        if (!container) return;
        const job = this.jobs.find(j => j.id == this.elements.masterJobSelect.value);
        if (!job) { container.innerHTML = ''; return; }
        
        const params = this.parseParams(job.danhsachthamso);
        container.innerHTML = params.map(p => `
            <div class="param-group bg-orange-50 border-orange-200">
                <label class="param-label text-orange-700">${p.ma}</label>
                <input type="text" class="param-val m-p-val text-orange-800" data-key="${p.ma}" value="${p.giatri_macdinh || ''}">
            </div>
        `).join('');
    }

    applyMaster() {
        const type = this.state.activeTab;
        const tbody = type === 'vp' ? this.elements.vpBody : this.elements.sxBody;
        const checkedRows = tbody.querySelectorAll('tr .row-cb:checked');
        
        if (checkedRows.length === 0) {
            // Tận dụng AppUtils.Notify
            AppUtils.Notify.warning('Chưa chọn nhân viên nào!');
            return;
        }

        const timeIn = document.getElementById('m-in')?.value;
        const timeOut = document.getElementById('m-out')?.value;
        
        // Build Master Job
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

            // Sử dụng Validation cơ bản (kiểm tra rỗng) cho time nếu cần thiết
            if (timeIn) emp.uiState.in = timeIn;
            if (timeOut) emp.uiState.out = timeOut;

            if (type === 'sx' && masterJob) {
                const emptyIdx = emp.uiState.jobs.findIndex(j => !j.jobId);
                const newJob = JSON.parse(JSON.stringify(masterJob));
                if (emptyIdx !== -1) emp.uiState.jobs[emptyIdx] = newJob;
                else emp.uiState.jobs.push(newJob);
            }
            count++;
        });

        this.render();
        AppUtils.Notify.success(`Đã cập nhật dữ liệu cho ${count} nhân viên.`);
    }

    async saveData() {
        // 1. Lấy dữ liệu đã qua xử lý
        const payload = this.prepareSavePayload();

        if (!payload.length) {
            AppUtils.Notify.warning('Không có dữ liệu hợp lệ để lưu (Vui lòng kiểm tra nhân viên được chọn).');
            return;
        }

        // 2. Confirm trước khi lưu (Optional nhưng UX tốt hơn)
        AppUtils.Modal.showConfirm({
            title: 'Lưu bảng chấm công',
            message: `Bạn có chắc muốn lưu dữ liệu chấm công cho ${payload.length} bản ghi?`,
            confirmText: 'Lưu dữ liệu',
            onConfirm: async () => {
                this.executeSave(payload);
            }
        });
    }

    async executeSave(payload) {
        this.state.isLoading = true;
        // Hiển thị loading overlay nếu cần (hoặc dựa vào UI framework của bạn)
        
        try {
            // Gọi API POST
            const response = await AppUtils.API.post(this.apiUrls.saveChamCong, payload);

            if (response.success || response.id || Array.isArray(response)) {
                AppUtils.Notify.success('Lưu dữ liệu chấm công thành công!');
                // Reset dirty state hoặc reload lại data nếu cần
                // this.loadResources(); 
            } else {
                throw new Error(response.message || 'Lỗi không xác định từ server');
            }
        } catch (error) {
            console.error('Save Error:', error);
            AppUtils.Notify.error('Lưu thất bại: ' + error.message);
        } finally {
            this.state.isLoading = false;
        }
    }

    prepareSavePayload() {
        const type = this.state.activeTab; // 'vp' hoặc 'sx'
        const tbody = type === 'vp' ? this.elements.vpBody : this.elements.sxBody;
        
        // Chỉ lấy những dòng có checkbox được chọn
        const checkedRows = Array.from(tbody.querySelectorAll('.row-cb:checked')).map(cb => cb.closest('tr'));
        
        const payload = [];
        const workDate = this.elements.dateInput.value; // YYYY-MM-DD
        
        // Giờ chuẩn (Có thể cấu hình động sau này, hiện tại hardcode theo UI cũ)
        const STANDARD_IN = '08:00';
        const STANDARD_OUT = '17:00';

        checkedRows.forEach(tr => {
            const empId = tr.dataset.id;
            const emp = this.getEmpById(empId);
            if (!emp || !emp.uiState) return;

            const s = emp.uiState;
            
            // --- LOGIC TÍNH TOÁN THỜI GIAN ---
            // timeIn - standardIn: > 0 là muộn, < 0 là sớm
            const diffIn = AppUtils.TimeUtils.diffMinutes(s.in, STANDARD_IN);
            // standardOut - timeOut: > 0 là sớm, < 0 là muộn
            const diffOut = AppUtils.TimeUtils.diffMinutes(STANDARD_OUT, s.out);

            const timeData = {
                thoigiandimuon: diffIn > 0 ? diffIn : 0,
                thoigiandisom: diffIn < 0 ? Math.abs(diffIn) : 0,
                thoigianvesom: diffOut > 0 ? diffOut : 0,
                thoigianvemuon: diffOut < 0 ? Math.abs(diffOut) : 0
            };

            // Dữ liệu cơ bản
            const baseObj = {
                nhanvien_id: emp.id,
                ngaylamviec: workDate,
                thoigianchamcongvao: s.in || null,
                thoigianchamcongra: s.out || null,
                cotinhlamthem: s.ot || false,
                coantrua: s.lunch || false,
                loaichamcong: type.toUpperCase(), // "VP" hoặc "SX"
                id: null, // Luôn null để tạo mới theo yêu cầu
                ...timeData
            };

            if (type === 'vp') {
                // --- VĂN PHÒNG ---
                // Lấy ghi chú từ input cuối cùng
                const noteInput = tr.querySelector('input[type="text"]:not(.cell-input)');
                
                payload.push({
                    ...baseObj,
                    congviec_id: null,
                    tencongviec: noteInput ? noteInput.value : 'Hành chính', // Default text
                    thamsotinhluong: {}, // Object rỗng
                    ghichu: noteInput ? noteInput.value : ''
                });

            } else {
                // --- SẢN XUẤT ---
                // Duyệt qua danh sách jobs trong UI State
                s.jobs.forEach(jobItem => {
                    // Chỉ xử lý nếu đã chọn công việc
                    if (jobItem.jobId) {
                        const jobDef = this.jobs.find(j => j.id == jobItem.jobId);
                        
                        if (jobDef) {
                            // Xử lý tham số lương (Quan trọng: ép kiểu dữ liệu)
                            const formattedParams = this.formatJobParams(jobItem.params, jobDef.danhsachthamso);

                            const salaryParams = {
                                tham_so: formattedParams,
                                bieu_thuc: jobDef.bieuthuctinhtoan,
                                loaicv: jobDef.loaicongviec
                            };

                            payload.push({
                                ...baseObj,
                                congviec_id: parseInt(jobItem.jobId),
                                tencongviec: jobDef.tencongviec,
                                thamsotinhluong: salaryParams, // Backend tự xử lý JSON field này hoặc gửi object tùy framework (Django REST thường nhận JSON object nếu field là JSONField)
                                ghichu: ''
                            });
                        }
                    } else if (s.jobs.length === 1 && !s.jobs[0].jobId) {
                        // Case: SX nhưng chưa chọn việc (chỉ chấm giờ)
                         payload.push({
                            ...baseObj,
                            congviec_id: null,
                            tencongviec: 'Chấm công giờ',
                            thamsotinhluong: {},
                            ghichu: ''
                        });
                    }
                });
            }
        });

        return payload;
    }

    // Hàm format tham số dựa trên kiểu dữ liệu định nghĩa trong Job
    formatJobParams(userParams, paramsDef) {
        let definitions = [];
        try {
            // Parse định nghĩa nếu nó là chuỗi JSON
            definitions = typeof paramsDef === 'string' ? JSON.parse(paramsDef) : paramsDef;
        } catch (e) {
            definitions = [];
        }
        if (!Array.isArray(definitions)) definitions = [];

        const result = {};

        definitions.forEach(def => {
            const key = def.ma;
            const rawValue = userParams[key];
            const type = def.kieu; // 'number', 'currency', 'percent', 'text'...

            // Lấy giá trị mặc định nếu user không nhập
            let val = (rawValue !== undefined && rawValue !== null && rawValue !== '') 
                ? rawValue 
                : (def.giatri_macdinh || '');

            // --- LOGIC ÉP KIỂU QUAN TRỌNG ---
            if (['number', 'currency', 'percent'].includes(type)) {
                // Ép sang số
                const num = Number(val);
                result[key] = isNaN(num) ? 0 : num;
            } else {
                // Giữ nguyên chuỗi
                result[key] = String(val);
            }
        });

        return result;
    }

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

    parseParams(data) {
        try { return typeof data === 'string' ? JSON.parse(data) : data || []; } catch { return []; }
    }

    destroy() {
        if (this.state.loadController) this.state.loadController.abort();
        this.eventManager.removeAll();
        if (this.contextMenu?.destroy) this.contextMenu.destroy();
        this.employees = [];
        this.jobs = [];
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.ChamCongManager = new ChamCongManager({
        apiUrls: {
            employees: '/hrm/to-chuc-nhan-su/api/v1/phong-ban/employee/',
            jobs: '/hrm/to-chuc-nhan-su/api/cong-viec/list/',
            employeeTypes: '/hrm/to-chuc-nhan-su/api/loai-nhan-vien/list/',
            saveChamCong: '/hrm/cham-cong/api/bang-cham-cong/list/'
        }
    });
    window.ChamCongManager.init();
});