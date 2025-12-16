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
        this.loadResources();
        this.switchTab('vp');

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
            tabVpView: $('tab-vp'), tabSxView: $('tab-sx'), masterSxRow: $('master-sx-row'),
            btnQuickAction: $('btn-quick-action'), iconQuickAction: $('icon-quick-action'), textQuickAction: $('text-quick-action')
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
            
            // Xử lý logic lấy ID loại nhân viên SX
            if (typeRes.data && typeRes.data.length > 0) {
                // Lấy phần tử đầu tiên tìm được (hoặc find chính xác theo tên nếu cần chắc chắn)
                const factoryType = typeRes.data.find(t => t.TenLoaiNV.toLowerCase() === 'công nhân');
                this.productionTypeId = factoryType ? factoryType.id : null;
            } else {
                console.warn("Không tìm thấy loại nhân viên 'Công nhân'");
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
            // 1. Filter theo Search (Tên hoặc Mã NV)
            const nameMatch = !search || 
                (e.hovaten && e.hovaten.toLowerCase().includes(search)) || 
                (e.manhanvien && e.manhanvien.toLowerCase().includes(search));
            
            // 2. Filter theo Phòng ban
            const deptMatch = dept === 'all' || e.cong_tac?.phong_ban === dept;
            
            // 3. Phân loại VP/SX dựa trên ID loại nhân viên
            let isFactory = false;
            
            if (this.productionTypeId !== null) {
                // Nếu lấy được ID từ API thì so sánh chính xác
                isFactory = (e.loainv === this.productionTypeId);
            } else {
                // Fallback (Dự phòng): Nếu API lỗi hoặc chưa cấu hình, dùng logic cũ theo tên phòng ban
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
            <td class="p-0.5 border-r border-slate-200"><input type="time" class="cell-input inp-in" onchange="window.ChamCongManager.analyzeTime(this)"></td>
            <td class="p-0.5 border-r border-slate-200"><input type="time" class="cell-input inp-out" onchange="window.ChamCongManager.analyzeTime(this)"></td>`;

        tr.innerHTML = empInfo + (type === 'vp' ? this.getVPCells() : this.getSXCells(jobOptions));
        return tr;
    }

    getVPCells() {
        return `
            <td class="px-2 py-1 border-r border-slate-200"><div class="analysis-result flex flex-wrap gap-0.5 min-h-[14px]"><span class="text-[9px] text-slate-300">-</span></div></td>
            <td class="p-0.5 border-r border-slate-200 text-center"><input type="checkbox" class="chk-lunch w-3.5 h-3.5 cursor-pointer accent-blue-600" checked></td>
            <td class="p-0.5 border-r border-slate-200 text-center"><input type="checkbox" class="chk-ot w-3.5 h-3.5 accent-orange-500 cursor-pointer"></td>
            <td class="px-2 py-1"><input type="text" class="w-full text-[11px] border-b border-transparent focus:border-blue-300 outline-none bg-transparent placeholder-slate-300" placeholder="..."></td>`;
    }

    getSXCells(jobOptions) {
        return `
            <td class="px-1 py-1 border-r border-slate-200"><select class="job-select w-full text-[11px] border border-slate-200 rounded py-0.5 px-1 focus:border-orange-400 outline-none bg-white" onchange="window.ChamCongManager.renderRowParams(this)"><option value="">--</option>${jobOptions}</select></td>
            <td class="px-1 py-1 border-r border-slate-200"><div class="params-container flex flex-wrap items-center gap-0.5 min-h-[18px]"></div></td>
            <td class="p-0.5 border-r border-slate-200 text-center"><input type="checkbox" class="chk-lunch w-3.5 h-3.5 cursor-pointer accent-blue-600" checked></td>
            <td class="p-0.5 text-center"><input type="checkbox" class="chk-ot w-3.5 h-3.5 accent-orange-500 cursor-pointer"></td>`;
    }

    analyzeTime(input) {
        const tr = input.closest('tr');
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

    quickAction() {
        this.state.activeTab === 'vp' ? this.autoFillVP() : (this.elements.masterSxRow?.classList.remove('hidden'), document.getElementById('m-in')?.focus());
    }

    autoFillVP() {
        this.elements.vpBody.querySelectorAll('tr').forEach(tr => {
            const cb = tr.querySelector('.row-cb');
            if (!cb?.checked) return;
            const inp = tr.querySelector('.inp-in'), out = tr.querySelector('.inp-out');
            if (inp && !inp.value) inp.value = tr.dataset.scheduleIn;
            if (out && !out.value) out.value = tr.dataset.scheduleOut;
            if (inp) this.analyzeTime(inp);
        });
        AppUtils.Notify.success('Đã điền giờ chuẩn!');
    }

    renderRowParams(select) {
        const container = select.closest('tr').querySelector('.params-container');
        if (!container) return;
        container.innerHTML = '';
        const job = this.jobs.find(j => j.id == select.value);
        if (!job) return;
        
        const params = this.parseParams(job.danhsachthamso);
        params.forEach(p => {
            const div = document.createElement('div');
            div.className = 'param-group';
            div.innerHTML = `<label class="param-label">${p.ma}</label><input type="text" class="param-val" data-key="${p.ma}" value="${p.giatri_macdinh || ''}">`;
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
        const timeIn = document.getElementById('m-in')?.value, timeOut = document.getElementById('m-out')?.value, jobId = document.getElementById('m-job')?.value;
        const mParams = {};
        document.querySelectorAll('.m-p-val').forEach(i => mParams[i.dataset.key] = i.value);

        let count = 0;
        this.elements.sxBody.querySelectorAll('tr').forEach(tr => {
            if (!tr.querySelector('.row-cb')?.checked) return;
            if (timeIn) tr.querySelector('.inp-in').value = timeIn;
            if (timeOut) tr.querySelector('.inp-out').value = timeOut;
            if (jobId) {
                const jobSelect = tr.querySelector('.job-select');
                if (jobSelect && jobSelect.value !== jobId) { jobSelect.value = jobId; this.renderRowParams(jobSelect); }
                tr.querySelectorAll('.param-val').forEach(rp => { if (mParams[rp.dataset.key] !== undefined) rp.value = mParams[rp.dataset.key]; });
            }
            count++;
        });
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

    switchTab(tab) {
        this.state.activeTab = tab;
        const isVP = tab === 'vp';
        
        this.elements.tabVpBtn.className = `tab-btn px-2.5 py-1 text-[11px] font-semibold rounded transition-all ${isVP ? 'active-vp' : ''}`;
        this.elements.tabSxBtn.className = `tab-btn px-2.5 py-1 text-[11px] font-semibold rounded transition-all ${!isVP ? 'active-sx' : ''}`;
        this.elements.tabVpView.classList.toggle('hidden', !isVP);
        this.elements.tabSxView.classList.toggle('hidden', isVP);
        this.elements.masterSxRow?.classList.toggle('hidden', isVP);
        
        if (this.elements.btnQuickAction) {
            this.elements.btnQuickAction.className = `hidden sm:flex items-center gap-1 px-2 py-1 text-xs border rounded transition-colors ${tab}-mode`;
            if (this.elements.iconQuickAction) this.elements.iconQuickAction.className = isVP ? 'fa-solid fa-wand-magic-sparkles' : 'fa-solid fa-copy';
            if (this.elements.textQuickAction) this.elements.textQuickAction.textContent = isVP ? 'Điền chuẩn' : 'Master';
        }
        this.render();
    }

    destroy() {
        this.eventManager.removeAll();
        this.employees = [];
        this.jobs = [];
    }
}