class ChamCongManager {
    constructor(config) {
        this.apiUrls = config.apiUrls || {};
        this.csrfToken = config.csrfToken || '';
        this.employees = [];
        this.jobs = [];
        this.productionTypeId = null;
        this.currentDate = new Date().toISOString().split('T')[0];
        
        this.state = { filters: { search: '', dept: 'all' }, activeTab: 'vp', isLoading: false };
        this.elements = {};
        this.eventManager = AppUtils.EventManager.create();
        this.debouncedFilter = AppUtils.Helper.debounce(this.handleFilter.bind(this), 300);
    }

    init() {
        this.cacheElements();
        if (this.elements.dateInput) this.elements.dateInput.value = this.currentDate;
        this.setupEventListeners();
        
        // Tab mặc định là VP, false để không render ngay (chờ loadResources)
        this.switchTab('vp', false); 
        this.loadResources();

        if (typeof ChamCongContextMenu !== 'undefined') {
            this.contextMenu = new ChamCongContextMenu(this);
        }
    }

    cacheElements() {
        const $ = id => document.getElementById(id);
        this.elements = {
            vpBody: $('vp-body'), sxBody: $('sx-body'), masterJobSelect: $('m-job'),
            dateInput: $('work-date'), deptSelect: $('dept-filter'), searchInput: $('search-input'),
            tabVpBtn: $('btn-tab-vp'), tabSxBtn: $('btn-tab-sx'),
            tabVpView: $('tab-vp'), tabSxView: $('tab-sx'),
            masterSxEls: Array.from(document.querySelectorAll('.master-sx-el'))
        };
    }

    setupEventListeners() {
        const em = this.eventManager;
        em.add(document.getElementById('check-all-vp'), 'change', e => this.toggleAll(e.target, 'vp-body'));
        em.add(document.getElementById('check-all-sx'), 'change', e => this.toggleAll(e.target, 'sx-body'));
        em.add(this.elements.searchInput, 'input', this.debouncedFilter);
        
        if (this.elements.deptSelect) {
            em.add(this.elements.deptSelect, 'change', () => {
                this.state.filters.dept = this.elements.deptSelect.value;
                this.render();
            });
        }

        const handleDataChange = (e) => {
            const input = e.target;
            const tr = input.closest('tr');
            if (!tr || !tr.dataset.id) return;

            const empId = parseInt(tr.dataset.id);
            const emp = this.employees.find(x => x.id === empId);
            if (!emp) return;

            if (!emp.uiState) emp.uiState = { params: {} };

            if (input.classList.contains('inp-in')) emp.uiState.in = input.value;
            else if (input.classList.contains('inp-out')) emp.uiState.out = input.value;
            else if (input.classList.contains('chk-lunch')) emp.uiState.lunch = input.checked;
            else if (input.classList.contains('chk-ot')) emp.uiState.ot = input.checked;
            else if (input.classList.contains('job-select')) {
                emp.uiState.jobId = input.value;
                emp.uiState.params = {}; 
            } 
            else if (input.classList.contains('param-val')) {
                const key = input.dataset.key;
                if (key) emp.uiState.params[key] = input.value;
            }
        };

        this.elements.vpBody.addEventListener('change', handleDataChange);
        this.elements.sxBody.addEventListener('change', handleDataChange);
    }

    async loadResources() {
        this.state.isLoading = true;
        try {
            const [empRes, jobRes, typeRes] = await Promise.all([
                AppUtils.API.get(`${this.apiUrls.employees}?page_size=1000`), 
                AppUtils.API.get(`${this.apiUrls.jobs}?status=active&page_size=1000`),
                AppUtils.API.get(`${this.apiUrls.employeeTypes}?search=Công nhân`)
            ]);
            this.employees = empRes.data || [];
            this.jobs = jobRes.data || [];
            
            if (typeRes.data && typeRes.data.length > 0) {
                const factoryType = typeRes.data.find(t => t.TenLoaiNV.toLowerCase() === 'công nhân');
                this.productionTypeId = factoryType ? factoryType.id : null;
            } else {
                this.productionTypeId = null;
            }
            
            this.initDeptFilter();
            this.initMasterSelect();
            this.render();
        } catch (error) {
            console.error("Data Load Error:", error);
            AppUtils.Notify.error("Không thể tải dữ liệu.");
        } finally {
            this.state.isLoading = false;
        }
    }

    initDeptFilter() {
        const depts = [...new Set(this.employees.map(e => e.cong_tac?.phong_ban).filter(Boolean))].sort();
        if (this.elements.deptSelect) {
            this.elements.deptSelect.innerHTML = '<option value="all">Tất cả PB</option>' + 
                depts.map(d => `<option value="${d}">${d}</option>`).join('');
        }
    }

    initMasterSelect() {
        if (this.elements.masterJobSelect) {
            this.elements.masterJobSelect.innerHTML = '<option value="">-- Công việc --</option>' + 
                this.jobs.map(j => `<option value="${j.id}">${j.tencongviec}</option>`).join('');
        }
    }

    handleFilter() {
        this.state.filters.search = this.elements.searchInput.value.toLowerCase();
        this.render();
    }

    getFilteredEmployees(type) {
        const { search, dept } = this.state.filters;
        return this.employees.filter(e => {
            const nameMatch = !search || 
                (e.hovaten && e.hovaten.toLowerCase().includes(search)) || 
                (e.manhanvien && e.manhanvien.toLowerCase().includes(search));
            
            const deptMatch = dept === 'all' || e.cong_tac?.phong_ban === dept;
            
            let isFactory = false;
            if (this.productionTypeId !== null) {
                isFactory = (e.loainv === this.productionTypeId);
            } else {
                const deptName = (e.cong_tac?.phong_ban || '').toLowerCase();
                isFactory = deptName.includes('xưởng') || deptName.includes('sản xuất');
            }
            return nameMatch && deptMatch && (type === 'vp' ? !isFactory : isFactory);
        });
    }

    render() {
        this.state.activeTab === 'vp' ? this.renderTable('vp') : this.renderTable('sx');
    }

    renderTable(type) {
        const tbody = type === 'vp' ? this.elements.vpBody : this.elements.sxBody;
        const list = this.getFilteredEmployees(type);
        
        if (!list.length) {
            AppUtils.UI.renderEmptyState(tbody, { message: 'Không có dữ liệu', colspan: 8 });
            return;
        }
        
        tbody.innerHTML = '';
        const jobOpts = type === 'sx' ? this.jobs.map(j => `<option value="${j.id}">${j.tencongviec}</option>`).join('') : '';
        const fragment = document.createDocumentFragment();
        list.forEach(emp => fragment.appendChild(this.createRow(emp, type, jobOpts)));
        tbody.appendChild(fragment);
    }

    createRow(emp, type, jobOptions = '') {
        const tr = document.createElement('tr');
        tr.className = 'group hover:bg-blue-50/30 transition-colors border-b border-slate-100';
        Object.assign(tr.dataset, { id: emp.id, scheduleIn: '08:00', scheduleOut: '17:00' });

        const s = emp.uiState || {}; 
        const accent = type === 'vp' ? 'blue' : 'orange';
        
        const empInfo = `
            <td class="p-1 border-r border-slate-200 text-center sticky left-0 bg-inherit z-[2]">
                <input type="checkbox" checked class="row-cb accent-${accent}-600 w-3.5 h-3.5 cursor-pointer" onchange="window.ChamCongManager.toggleRow(this)">
            </td>
            <td class="px-2 py-1 border-r border-slate-200 sticky left-8 bg-inherit z-[2]">
                <div class="font-semibold text-slate-700 text-xs truncate max-w-[160px]">${emp.hovaten}</div>
                <div class="text-[10px] text-slate-400 truncate">
                    <span class="bg-slate-100 px-1 rounded">${emp.manhanvien || '-'}</span>
                    <span class="ml-1">${emp.cong_tac?.phong_ban || ''}</span>
                </div>
            </td>
            <td class="p-0.5 border-r border-slate-200"><input type="time" value="${s.in || ''}" class="cell-input inp-in" onchange="window.ChamCongManager.analyzeTime(this)"></td>
            <td class="p-0.5 border-r border-slate-200"><input type="time" value="${s.out || ''}" class="cell-input inp-out" onchange="window.ChamCongManager.analyzeTime(this)"></td>`;

        tr.innerHTML = empInfo + (type === 'vp' ? this.getVPCells(s) : this.getSXCells(jobOptions, s));
        
        // Thực thi ngay lập tức, không cần setTimeout
        if(s.in || s.out) this.analyzeTime(tr.querySelector('.inp-in'));
        if(type === 'sx' && s.jobId) this.renderRowParams(tr.querySelector('.job-select'), s.params);

        return tr;
    }

    getVPCells(s) {
        const chkLunch = s.lunch !== false ? 'checked' : '';
        const chkOt = s.ot ? 'checked' : '';

        return `
            <td class="px-2 py-1 border-r border-slate-200"><div class="analysis-result flex flex-wrap gap-0.5 min-h-[14px]"><span class="text-[9px] text-slate-300">-</span></div></td>
            <td class="p-0.5 border-r border-slate-200 text-center"><input type="checkbox" class="chk-lunch w-3.5 h-3.5 cursor-pointer accent-blue-600" ${chkLunch}></td>
            <td class="p-0.5 border-r border-slate-200 text-center"><input type="checkbox" class="chk-ot w-3.5 h-3.5 accent-orange-500 cursor-pointer" ${chkOt}></td>
            <td class="px-2 py-1"><input type="text" class="w-full text-[11px] border-b border-transparent focus:border-blue-300 outline-none bg-transparent placeholder-slate-300" placeholder="..."></td>`;
    }

    getSXCells(jobOptions, s) {
        const chkLunch = s.lunch !== false ? 'checked' : '';
        const chkOt = s.ot ? 'checked' : '';
        
        let finalOpts = jobOptions;
        if (s.jobId) {
            finalOpts = jobOptions.replace(`value="${s.jobId}"`, `value="${s.jobId}" selected`);
        }

        return `
            <td class="px-1 py-1 border-r border-slate-200"><select class="job-select w-full text-[11px] border border-slate-200 rounded py-0.5 px-1 focus:border-orange-400 outline-none bg-white" onchange="window.ChamCongManager.renderRowParams(this)"><option value="">--</option>${finalOpts}</select></td>
            <td class="px-1 py-1 border-r border-slate-200"><div class="params-container flex flex-wrap items-center gap-0.5 min-h-[18px]"></div></td>
            <td class="p-0.5 border-r border-slate-200 text-center"><input type="checkbox" class="chk-lunch w-3.5 h-3.5 cursor-pointer accent-blue-600" ${chkLunch}></td>
            <td class="p-0.5 text-center"><input type="checkbox" class="chk-ot w-3.5 h-3.5 accent-orange-500 cursor-pointer" ${chkOt}></td>`;
    }

    analyzeTime(input) {
        const tr = input.closest('tr');
        // Check kỹ hơn vì input có thể chưa gắn vào DOM khi gọi trực tiếp
        const inVal = tr.querySelector('.inp-in').value;
        const outVal = tr.querySelector('.inp-out').value;
        const { scheduleIn: schedIn, scheduleOut: schedOut } = tr.dataset;
        const resultDiv = tr.querySelector('.analysis-result');
        
        if (!resultDiv) return;
        if (!inVal && !outVal) { resultDiv.innerHTML = '<span class="text-[9px] text-slate-300">-</span>'; return; }

        const diffMin = (t1, t2) => { const [h1,m1] = t1.split(':').map(Number), [h2,m2] = t2.split(':').map(Number); return (h1*60+m1) - (h2*60+m2); };
        const badge = (text, isOk) => `<span class="text-[9px] ${isOk ? 'bg-green-50 text-green-600 border-green-100' : 'bg-red-50 text-red-600 border-red-100'} px-1 rounded border font-medium">${text}</span>`;
        
        let html = '';
        if (inVal && schedIn) {
            const late = diffMin(inVal, schedIn);
            if (late > 0) html += badge(`Muộn ${late}p`, false);
            tr.querySelector('.inp-in').classList.toggle('text-red-600', late > 0);
        }
        if (outVal && schedOut) {
            const early = diffMin(schedOut, outVal);
            if (early > 0) html += badge(`Sớm ${early}p`, false);
            tr.querySelector('.inp-out').classList.toggle('text-red-600', early > 0);
        }
        resultDiv.innerHTML = html || (inVal && outVal ? badge('✓ OK', true) : '');
    }

    renderRowParams(select, savedParams = null) {
        const container = select.closest('tr').querySelector('.params-container');
        if (!container) return;
        container.innerHTML = '';
        const job = this.jobs.find(j => j.id == select.value);
        if (!job) return;
        
        const params = this.parseParams(job.danhsachthamso);
        params.forEach(p => {
            const val = savedParams && savedParams[p.ma] !== undefined ? savedParams[p.ma] : (p.giatri_macdinh || '');
            const div = document.createElement('div');
            div.className = 'param-group';
            div.innerHTML = `<label class="param-label">${p.ma}</label><input type="text" class="param-val" data-key="${p.ma}" value="${val}">`;
            container.appendChild(div);
        });
    }

    renderMasterParams() {
        const container = document.getElementById('m-params');
        if (!container) return;
        container.innerHTML = '';
        const job = this.jobs.find(j => j.id == this.elements.masterJobSelect.value);
        if (!job) return;
        
        this.parseParams(job.danhsachthamso).forEach(p => {
            const div = document.createElement('div');
            div.className = 'param-group bg-orange-50 border-orange-200';
            div.innerHTML = `<label class="param-label text-orange-700">${p.ma}</label><input type="text" class="param-val m-p-val text-orange-800" data-key="${p.ma}" value="${p.giatri_macdinh || ''}">`;
            container.appendChild(div);
        });
    }

    parseParams(data) {
        try { return typeof data === 'string' ? JSON.parse(data) : data || []; } catch { return []; }
    }

    applyMaster() {
        const type = this.state.activeTab;
        const timeIn = document.getElementById('m-in')?.value;
        const timeOut = document.getElementById('m-out')?.value;

        let jobId = null;
        const mParams = {};
        if (type === 'sx') {
            jobId = document.getElementById('m-job')?.value;
            document.querySelectorAll('.m-p-val').forEach(i => mParams[i.dataset.key] = i.value);
        }

        const visibleEmployees = this.getFilteredEmployees(type);
        let count = 0;

        visibleEmployees.forEach(emp => {     
            if (!emp.uiState) emp.uiState = { params: {} };
            
            if (timeIn) emp.uiState.in = timeIn;
            if (timeOut) emp.uiState.out = timeOut;
            if (type === 'sx' && jobId) {
                emp.uiState.jobId = jobId;
                if (!emp.uiState.params) emp.uiState.params = {};
                Object.assign(emp.uiState.params, mParams);
            }
            count++;
        });

        this.render();
        AppUtils.Notify.success(`Đã áp dụng cho ${count} nhân viên!`);
    }

    toggleRow(cb) {
        const tr = cb.closest('tr');
        tr.classList.toggle('inactive', !cb.checked);
        tr.querySelectorAll('input:not(.row-cb), select').forEach(e => e.disabled = !cb.checked);
        if (!cb.checked) {
            tr.querySelector('.analysis-result')?.replaceChildren(Object.assign(document.createElement('span'), { className: 'text-[9px] text-slate-300', textContent: '-' }));
            tr.querySelectorAll('.cell-input').forEach(i => i.classList.remove('text-red-600'));
        }
    }

    toggleAll(masterCb, tbodyId) {
        document.getElementById(tbodyId)?.querySelectorAll('.row-cb').forEach(c => { c.checked = masterCb.checked; this.toggleRow(c); });
    }

    async saveData() { AppUtils.Notify.success('Đã lưu dữ liệu chấm công!'); }

    switchTab(tab, shouldRender = true) {
        this.state.activeTab = tab;
        const isVP = tab === 'vp';
        
        // 1. Toggle Tab Button Style
        this.elements.tabVpBtn.className = `tab-btn px-2.5 py-1 text-[11px] font-semibold rounded transition-all ${isVP ? 'active-vp' : ''}`;
        this.elements.tabSxBtn.className = `tab-btn px-2.5 py-1 text-[11px] font-semibold rounded transition-all ${!isVP ? 'active-sx' : ''}`;
        
        // 2. Toggle View Visibility
        this.elements.tabVpView.classList.toggle('hidden', !isVP);
        this.elements.tabSxView.classList.toggle('hidden', isVP);
        
        // 3. Update Master Controls Visibility
        this.updateMasterControls(tab);

        // 4. Update Master Bar Colors (Xanh vs Cam)
        const mIn = document.getElementById('m-in');
        const mOut = document.getElementById('m-out');
        const btnApply = document.getElementById('btn-apply-master');

        // Class cơ bản giữ nguyên, chỉ thay đổi phần màu
        const inputBase = "bg-white border rounded px-3 py-1.5 w-28 text-center font-medium focus:ring-1";
        const btnBase = "ml-auto px-3 py-1.5 text-white rounded font-semibold transition-colors";

        if (isVP) {
            // Theme Văn Phòng (Blue)
            if(mIn) mIn.className = `${inputBase} border-blue-200 focus:ring-blue-400`;
            if(mOut) mOut.className = `${inputBase} border-blue-200 focus:ring-blue-400`;
            if(btnApply) btnApply.className = `${btnBase} bg-blue-600 hover:bg-blue-700`;
        } else {
            // Theme Sản Xuất (Orange)
            if(mIn) mIn.className = `${inputBase} border-orange-200 focus:ring-orange-400`;
            if(mOut) mOut.className = `${inputBase} border-orange-200 focus:ring-orange-400`;
            if(btnApply) btnApply.className = `${btnBase} bg-orange-500 hover:bg-orange-600`;
        }

        if (shouldRender) this.render();
    }

    updateMasterControls(tab) {
        const isVP = tab === 'vp';
        (this.elements.masterSxEls || []).forEach(el => el.classList.toggle('hidden', isVP));
    }

    destroy() {
        this.eventManager.removeAll();
        if (this.contextMenu) this.contextMenu.destroy();
        this.employees = [];
        this.jobs = [];
    }
}