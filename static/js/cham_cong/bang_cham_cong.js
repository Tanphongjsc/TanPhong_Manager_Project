/**
 * Class quản lý chấm công - Updated for Multi-Job Support
 */
class ChamCongManager {
    constructor(config) {
        this.apiUrls = config.apiUrls || {};
        this.csrfToken = config.csrfToken || '';
        this.employees = [];
        this.jobs = [];
        this.productionTypeId = null;
        this.currentDate = new Date().toISOString().split('T')[0];
        
        // State jobs sẽ là array trong uiState.jobs
        this.state = { filters: { search: '', dept: 'all' }, activeTab: 'vp', isLoading: false };
        this.elements = {};
        this.eventManager = AppUtils.EventManager.create();
        this.debouncedFilter = AppUtils.Helper.debounce(this.handleFilter.bind(this), 300);
    }

    init() {
        this.cacheElements();
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

        // Global Event Delegation for Dynamic Inputs
        const handleDataChange = (e) => {
            const target = e.target;
            const tr = target.closest('tr');
            if (!tr || !tr.dataset.id) return;

            const empId = parseInt(tr.dataset.id);
            const emp = this.employees.find(x => x.id === empId);
            if (!emp) return;

            // Ensure uiState exists
            if (!emp.uiState) this.initEmpState(emp);

            // Xử lý các trường chung (Giờ vào/ra/ăn/OT)
            if (target.classList.contains('inp-in')) emp.uiState.in = target.value;
            else if (target.classList.contains('inp-out')) emp.uiState.out = target.value;
            else if (target.classList.contains('chk-lunch')) emp.uiState.lunch = target.checked;
            else if (target.classList.contains('chk-ot')) emp.uiState.ot = target.checked;
            
            // Xử lý Multi-Job (Sản Xuất)
            else if (target.classList.contains('job-select')) {
                const index = parseInt(target.dataset.index);
                if (emp.uiState.jobs[index]) {
                    emp.uiState.jobs[index].jobId = target.value;
                    emp.uiState.jobs[index].params = {}; // Reset params khi đổi job
                    // Re-render row để cập nhật input params tương ứng
                    this.refreshRow(tr, emp, 'sx');
                }
            } 
            else if (target.classList.contains('param-val')) {
                const index = parseInt(target.dataset.index);
                const key = target.dataset.key;
                if (emp.uiState.jobs[index]) {
                    emp.uiState.jobs[index].params[key] = target.value;
                }
            }
        };

        this.elements.vpBody.addEventListener('change', handleDataChange);
        this.elements.sxBody.addEventListener('change', handleDataChange);
        
        // Click events delegation (Add/Remove Job)
        this.elements.sxBody.addEventListener('click', (e) => {
            const btn = e.target.closest('button');
            if (!btn) return;
            
            const tr = btn.closest('tr');
            if (!tr) return;
            const empId = parseInt(tr.dataset.id);
            const emp = this.employees.find(x => x.id === empId);
            if (!emp) return;
            if (!emp.uiState) this.initEmpState(emp);

            if (btn.classList.contains('btn-add-job')) {
                emp.uiState.jobs.push({ jobId: '', params: {} });
                this.refreshRow(tr, emp, 'sx');
            } else if (btn.classList.contains('btn-remove-job')) {
                const index = parseInt(btn.dataset.index);
                emp.uiState.jobs.splice(index, 1);
                // Nếu xóa hết thì để lại 1 dòng trống
                if (emp.uiState.jobs.length === 0) emp.uiState.jobs.push({ jobId: '', params: {} });
                this.refreshRow(tr, emp, 'sx');
            }
        });
    }

    initEmpState(emp) {
        if (!emp.uiState) {
            emp.uiState = { 
                in: '', out: '', lunch: true, ot: false, 
                jobs: [{ jobId: '', params: {} }] // Mặc định 1 job trống
            };
        }
        // Migration logic: Nếu dữ liệu cũ (jobId đơn lẻ) còn tồn tại, chuyển sang array
        if (emp.uiState.jobId && (!emp.uiState.jobs || emp.uiState.jobs.length === 0)) {
             emp.uiState.jobs = [{ jobId: emp.uiState.jobId, params: emp.uiState.params || {} }];
             delete emp.uiState.jobId;
             delete emp.uiState.params;
        }
        if (!emp.uiState.jobs || emp.uiState.jobs.length === 0) {
            emp.uiState.jobs = [{ jobId: '', params: {} }];
        }
    }

    // ... loadResources, initDeptFilter, initMasterSelect, handleFilter, getFilteredEmployees giữ nguyên ...
    // Copy lại các hàm này từ code gốc nếu không thay đổi logic

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
        const fragment = document.createDocumentFragment();
        list.forEach(emp => fragment.appendChild(this.createRow(emp, type)));
        tbody.appendChild(fragment);
    }

    // Hàm refreshRow để render lại 1 dòng thay vì cả bảng (Tối ưu performance)
    refreshRow(tr, emp, type) {
        const newTr = this.createRow(emp, type);
        tr.replaceWith(newTr);
        // Re-focus logic if needed, but for simplicity we rely on users clicking back.
        // If strictly needed, we can track focused element ID.
        if (type === 'sx') {
            // Re-render params is handled inside createRow -> getSXCells logic
        }
    }

    createRow(emp, type) {
        this.initEmpState(emp); 
        const tr = document.createElement('tr');
        
        // UPDATE: Thay đổi border-b (mỏng) thành border-b-2 border-slate-300 (đậm hơn) 
        // để tách biệt rõ ràng giữa các nhân viên
        tr.className = 'group hover:bg-blue-50/20 transition-colors border-b-2 border-slate-300 align-top'; 
        
        Object.assign(tr.dataset, { id: emp.id, scheduleIn: '08:00', scheduleOut: '17:00' });

        const s = emp.uiState;
        const accent = type === 'vp' ? 'blue' : 'orange';
        
        // Phần thông tin nhân viên (Giữ nguyên)
        const empInfo = `
            <td class="p-1 border-r border-slate-200 text-center sticky left-0 bg-inherit z-[2]">
                <input type="checkbox" checked class="row-cb accent-${accent}-600 w-3.5 h-3.5 cursor-pointer mt-1.5" onchange="window.ChamCongManager.toggleRow(this)">
            </td>
            <td class="px-2 py-1.5 border-r border-slate-200 sticky left-8 bg-inherit z-[2]">
                <div class="font-bold text-slate-700 text-xs truncate max-w-[160px]">${emp.hovaten}</div>
                <div class="text-[10px] text-slate-500 truncate flex items-center gap-1">
                    <span class="bg-slate-100 px-1 rounded border border-slate-200">${emp.manhanvien || '-'}</span>
                    <span>${emp.cong_tac?.phong_ban || ''}</span>
                </div>
            </td>
            <td class="p-0.5 border-r border-slate-200"><input type="time" value="${s.in || ''}" class="cell-input inp-in mt-1" onchange="window.ChamCongManager.analyzeTime(this)"></td>
            <td class="p-0.5 border-r border-slate-200"><input type="time" value="${s.out || ''}" class="cell-input inp-out mt-1" onchange="window.ChamCongManager.analyzeTime(this)"></td>`;

        tr.innerHTML = empInfo + (type === 'vp' ? this.getVPCells(s) : this.getSXCells(s));
        
        if (type === 'vp' && (s.in || s.out)) {
             const inpIn = tr.querySelector('.inp-in');
             if (inpIn) this.analyzeTime(inpIn);
        }

        return tr;
    }

    getVPCells(s) {
        const chkLunch = s.lunch !== false ? 'checked' : '';
        const chkOt = s.ot ? 'checked' : '';
        return `
            <td class="px-2 py-1 border-r border-slate-200"><div class="analysis-result flex flex-wrap gap-0.5 min-h-[14px] mt-1"><span class="text-[9px] text-slate-300">-</span></div></td>
            <td class="p-0.5 border-r border-slate-200 text-center"><input type="checkbox" class="chk-lunch w-3.5 h-3.5 cursor-pointer accent-blue-600 mt-1.5" ${chkLunch}></td>
            <td class="p-0.5 border-r border-slate-200 text-center"><input type="checkbox" class="chk-ot w-3.5 h-3.5 accent-orange-500 cursor-pointer mt-1.5" ${chkOt}></td>
            <td class="px-2 py-1"><input type="text" class="w-full text-[11px] border-b border-transparent focus:border-blue-300 outline-none bg-transparent placeholder-slate-300 mt-0.5" placeholder="..."></td>`;
    }

    getSXCells(s) {
        const chkLunch = s.lunch !== false ? 'checked' : '';
        const chkOt = s.ot ? 'checked' : '';
        
        let jobListHtml = '';

        s.jobs.forEach((jobItem, index) => {
            const jobOpts = this.jobs.map(j => 
                `<option value="${j.id}" ${j.id == jobItem.jobId ? 'selected' : ''}>${j.tencongviec}</option>`
            ).join('');
            
            // Nút xóa chỉ hiện khi cần thiết
            const showDelete = index > 0 || s.jobs.length > 1 || jobItem.jobId;
            const deleteBtn = showDelete
                ? `<button class="btn-remove-job w-6 h-6 flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-all ml-auto shrink-0" data-index="${index}" title="Xóa"><i class="fa-solid fa-xmark"></i></button>` 
                : `<div class="w-6 h-6 ml-auto shrink-0"></div>`;

            let paramsContent = '';
            if (jobItem.jobId) {
                const jobDef = this.jobs.find(j => j.id == jobItem.jobId);
                if (jobDef) {
                    const paramsDef = this.parseParams(jobDef.danhsachthamso);
                    paramsContent = paramsDef.map(p => {
                        const val = jobItem.params[p.ma] !== undefined ? jobItem.params[p.ma] : (p.giatri_macdinh || '');
                        return `
                            <div class="flex items-center bg-white border border-slate-200 rounded overflow-hidden h-[22px] shadow-sm hover:border-orange-300 transition-colors">
                                <div class="bg-slate-50 text-[9px] text-slate-500 font-bold px-1.5 h-full flex items-center border-r border-slate-100 uppercase tracking-wider select-none">
                                    ${p.ma}
                                </div>
                                <input type="text" class="param-val w-10 text-center text-[11px] font-semibold text-slate-700 bg-transparent border-none outline-none h-full focus:bg-orange-50 px-1" 
                                    data-index="${index}" data-key="${p.ma}" value="${val}">
                            </div>`;
                    }).join('');
                }
            } else {
                paramsContent = `<span class="text-[10px] text-slate-300 italic pl-1 select-none font-light">Chọn công việc...</span>`;
            }

            const rowNumber = `<div class="w-5 h-5 flex items-center justify-center bg-orange-100 text-orange-700 text-[10px] font-bold rounded-full border border-orange-200 shadow-sm select-none shrink-0">${index + 1}</div>`;
            
            // Dòng công việc
            jobListHtml += `
                <div class="job-row flex items-center gap-2 p-1.5 border-b border-dashed border-slate-200 last:border-0 hover:bg-orange-50/40 transition-colors group/job relative">
                    ${rowNumber}

                    <div class="w-[140px] shrink-0">
                        <select class="job-select w-full text-[11px] font-medium text-slate-700 border border-slate-200 rounded py-0.5 px-1.5 focus:border-orange-500 focus:ring-1 focus:ring-orange-200 outline-none bg-white shadow-sm h-[24px]" data-index="${index}">
                            <option value="">--</option>${jobOpts}
                        </select>
                    </div>

                    <div class="flex-1 flex flex-wrap items-center gap-2 min-h-[24px]">
                        ${paramsContent}
                    </div>

                    ${deleteBtn}
                </div>`;
        });

        // --- NÚT THÊM VIỆC TỐI GIẢN ---
        const addBtnHtml = `
            <div class="flex justify-center py-1.5">
                <button class="btn-add-job text-[11px] text-slate-400 hover:text-orange-500 font-medium transition-colors" title="Thêm đầu việc">
                    + Thêm
                </button>
            </div>
        `;

        return `
            <td class="p-0 border-r border-slate-200 align-top">
                <div class="flex flex-col w-full">
                    ${jobListHtml}
                    ${addBtnHtml}
                </div>
            </td>
            
            <td class="p-0.5 border-r border-slate-200 text-center align-top pt-3"><input type="checkbox" class="chk-lunch w-3.5 h-3.5 cursor-pointer accent-blue-600" ${chkLunch}></td>
            <td class="p-0.5 text-center align-top pt-3"><input type="checkbox" class="chk-ot w-3.5 h-3.5 accent-orange-500 cursor-pointer" ${chkOt}></td>`;
    }

    // Logic tính toán Master Apply (THÊM vào thay vì GHI ĐÈ)
    applyMaster() {
        const type = this.state.activeTab;
        const timeIn = document.getElementById('m-in')?.value;
        const timeOut = document.getElementById('m-out')?.value;

        // Lấy thông tin master job (nếu có)
        let masterJob = null;
        if (type === 'sx') {
            const mJobId = document.getElementById('m-job')?.value;
            if (mJobId) {
                const mParams = {};
                document.querySelectorAll('.m-p-val').forEach(i => mParams[i.dataset.key] = i.value);
                masterJob = { jobId: mJobId, params: mParams };
            }
        }

        const visibleEmployees = this.getFilteredEmployees(type);
        let count = 0;

        visibleEmployees.forEach(emp => {     
            this.initEmpState(emp);
            
            // Apply Time (Chỉ update nếu master có giá trị)
            if (timeIn) emp.uiState.in = timeIn;
            if (timeOut) emp.uiState.out = timeOut;
            
            // Apply Job (APPEND mode)
            if (type === 'sx' && masterJob) {
                // Kiểm tra xem dòng hiện tại có job trống nào không, nếu có thì điền vào đó trước
                const emptyJobIndex = emp.uiState.jobs.findIndex(j => !j.jobId);
                
                // Deep copy master job để tránh tham chiếu
                const newJob = JSON.parse(JSON.stringify(masterJob));

                if (emptyJobIndex !== -1) {
                    emp.uiState.jobs[emptyJobIndex] = newJob;
                } else {
                    emp.uiState.jobs.push(newJob);
                }
            }
            count++;
        });

        this.render(); // Re-render toàn bộ để thấy thay đổi
        AppUtils.Notify.success(`Đã cập nhật dữ liệu cho ${count} nhân viên!`);
    }
    
    analyzeTime(input) {
        // Logic giữ nguyên, chỉ cần check null safety
        if (!input) return;
        const tr = input.closest('tr');
        if (!tr) return;
        const inpIn = tr.querySelector('.inp-in');
        const inpOut = tr.querySelector('.inp-out');
        const resultDiv = tr.querySelector('.analysis-result');
        
        if (!resultDiv) return; // Tab SX không có cột phân tích
        
        const inVal = inpIn?.value;
        const outVal = inpOut?.value;
        const { scheduleIn: schedIn, scheduleOut: schedOut } = tr.dataset;

        if (!inVal && !outVal) { resultDiv.innerHTML = '<span class="text-[9px] text-slate-300">-</span>'; return; }

        const diffMin = (t1, t2) => { const [h1,m1] = t1.split(':').map(Number), [h2,m2] = t2.split(':').map(Number); return (h1*60+m1) - (h2*60+m2); };
        const badge = (text, isOk) => `<span class="text-[9px] ${isOk ? 'bg-green-50 text-green-600 border-green-100' : 'bg-red-50 text-red-600 border-red-100'} px-1 rounded border font-medium">${text}</span>`;
        
        let html = '';
        if (inVal && schedIn) {
            const late = diffMin(inVal, schedIn);
            if (late > 0) { html += badge(`Muộn ${late}p`, false); inpIn.classList.add('text-red-600'); }
            else inpIn.classList.remove('text-red-600');
        }
        if (outVal && schedOut) {
            const early = diffMin(schedOut, outVal);
            if (early > 0) { html += badge(`Sớm ${early}p`, false); inpOut.classList.add('text-red-600'); }
            else inpOut.classList.remove('text-red-600');
        }
        resultDiv.innerHTML = html || (inVal && outVal ? badge('✓ OK', true) : '');
    }

    renderMasterParams() {
        // Giữ nguyên logic cũ
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

    // Các hàm toggleRow, toggleAll, saveData, switchTab, updateMasterControls, destroy giữ nguyên
    toggleRow(cb) {
        const tr = cb.closest('tr');
        tr.classList.toggle('inactive', !cb.checked);
        // Disable inputs, select, buttons inside
        tr.querySelectorAll('input:not(.row-cb), select, button').forEach(e => e.disabled = !cb.checked);
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
        this.elements.tabVpBtn.className = `tab-btn px-2.5 py-1 text-[11px] font-semibold rounded transition-all ${isVP ? 'active-vp' : ''}`;
        this.elements.tabSxBtn.className = `tab-btn px-2.5 py-1 text-[11px] font-semibold rounded transition-all ${!isVP ? 'active-sx' : ''}`;
        this.elements.tabVpView.classList.toggle('hidden', !isVP);
        this.elements.tabSxView.classList.toggle('hidden', isVP);
        this.updateMasterControls(tab);
        const mIn = document.getElementById('m-in');
        const mOut = document.getElementById('m-out');
        const btnApply = document.getElementById('btn-apply-master');
        const inputBase = "bg-white border rounded px-3 py-1.5 w-28 text-center font-medium focus:ring-1";
        const btnBase = "ml-auto px-3 py-1.5 text-white rounded font-semibold transition-colors flex items-center gap-2"; // Added flex gap
        if (isVP) {
            if(mIn) mIn.className = `${inputBase} border-blue-200 focus:ring-blue-400`;
            if(mOut) mOut.className = `${inputBase} border-blue-200 focus:ring-blue-400`;
            if(btnApply) {
                btnApply.className = `${btnBase} bg-blue-600 hover:bg-blue-700`;
                btnApply.innerHTML = `Áp dụng`; // VP giữ nguyên áp dụng (hoặc đổi thành Áp dụng thời gian)
            }
        } else {
            if(mIn) mIn.className = `${inputBase} border-orange-200 focus:ring-orange-400`;
            if(mOut) mOut.className = `${inputBase} border-orange-200 focus:ring-orange-400`;
            if(btnApply) {
                btnApply.className = `${btnBase} bg-orange-500 hover:bg-orange-600`;
                btnApply.innerHTML = `<i class="fa-solid fa-plus text-xs"></i> Thêm`; // Đổi text thành Thêm
            }
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

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    // Lấy CSRF token từ input hidden
    const csrfInput = document.getElementById('csrf-token');
    const csrfToken = csrfInput ? csrfInput.value : '';

    // Khởi tạo ChamCongManager
    const manager = new ChamCongManager({
        apiUrls: {
            employees: '/hrm/to-chuc-nhan-su/api/v1/phong-ban/employee/',
            jobs: '/hrm/to-chuc-nhan-su/api/cong-viec/list/',
            employeeTypes: '/hrm/to-chuc-nhan-su/api/loai-nhan-vien/list/'
        },
        csrfToken: csrfToken
    });
    
    manager.init();
    
    // Gán vào window để có thể truy cập global
    window.ChamCongManager = manager;
});