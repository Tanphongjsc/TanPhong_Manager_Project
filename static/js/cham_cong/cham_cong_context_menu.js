/**
 * ChamCongContextMenu - Context Menu (Chuột phải) cho Bảng Chấm Công
 * Tối ưu: Tận dụng AppUtils, gọn gàng DOM và events
 */
class ChamCongContextMenu {
    constructor(manager) {
        if (typeof AppUtils === 'undefined') { console.error('⛔ ChamCongContextMenu: AppUtils is required'); return; }
        this.manager = manager;
        this.menu = null; this.overlay = null; this.activeRow = null;
        this.eventManager = AppUtils.EventManager.create();
        this._handleScroll = this.hide.bind(this);
        this.init();
    }

    init() { this.createDOM(); this.attachGlobalEvents(); }

    createDOM() {
        this.overlay = document.createElement('div');
        this.overlay.className = 'fixed inset-0 z-[49] hidden';
        
        this.menu = document.createElement('div');
        this.menu.className = 'fixed z-[50] bg-white rounded-lg shadow-xl border border-slate-200 w-64 hidden py-1 text-sm font-sans animation-fade-in';
        this.menu.innerHTML = `
            <div class="px-3 py-2 border-b border-slate-100 bg-slate-50 rounded-t-lg"><span class="text-xs font-bold text-slate-500 uppercase">Thao tác nhanh</span></div>
            ${['up', 'down'].map(dir => `
            <div class="p-2 hover:bg-slate-50 transition-colors flex items-center gap-2 group ${dir === 'down' ? 'border-t border-slate-100' : ''} cursor-pointer" id="ctx-btn-${dir}">
                <div class="w-8 h-8 rounded ${dir === 'up' ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-600'} flex items-center justify-center shrink-0"><i class="fa-solid fa-arrow-${dir}"></i></div>
                <div class="flex-1">
                    <div class="text-slate-700 font-medium text-xs mb-1">Điền ${dir === 'up' ? 'lên trên' : 'xuống dưới'}</div>
                    <div class="flex gap-1" onclick="event.stopPropagation()">
                        <input type="number" min="1" value="1" id="ctx-fill-${dir}-val" class="w-full text-xs border border-slate-300 rounded px-1 py-0.5 focus:border-${dir === 'up' ? 'blue' : 'orange'}-500 outline-none">
                        <button id="btn-fill-${dir}" class="px-2 py-0.5 ${dir === 'up' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-orange-600 hover:bg-orange-700'} text-white rounded text-xs">OK</button>
                    </div>
                </div>
            </div>`).join('')}`;

        document.body.appendChild(this.overlay);
        document.body.appendChild(this.menu);
        this.bindMenuEvents();
    }

    bindMenuEvents() {
        const em = this.eventManager, $ = id => this.menu.querySelector('#' + id);
        em.add(this.overlay, 'click', () => this.hide());
        ['up', 'down'].forEach(dir => {
            em.add($(`btn-fill-${dir}`), 'click', () => this.executeFill(dir));
            em.add($(`ctx-fill-${dir}-val`), 'keyup', e => { if (e.key === 'Enter') this.executeFill(dir); });
        });
    }

    attachGlobalEvents() {
        this.eventManager.add(document, 'contextmenu', e => {
            const row = e.target.closest('tr');
            if (row && row.classList.contains('group') && (row.closest('#vp-body') || row.closest('#sx-body'))) {
                e.preventDefault(); this.show(e.pageX, e.pageY, row);
            }
        });
        document.addEventListener('scroll', this._handleScroll, true);
    }

    show(x, y, row) {
        this.activeRow = row;
        this.activeRow.classList.add('bg-blue-100');
        this.overlay.classList.remove('hidden');
        this.menu.classList.remove('hidden');
        
        const winW = window.innerWidth, winH = window.innerHeight, rect = this.menu.getBoundingClientRect();
        this.menu.style.left = `${x + rect.width > winW ? x - rect.width : x}px`;
        this.menu.style.top = `${y + rect.height > winH ? y - rect.height : y}px`;
        setTimeout(() => this.menu.querySelector('#ctx-fill-down-val')?.focus(), 50);
    }

    hide() {
        if (this.activeRow) { this.activeRow.classList.remove('bg-blue-100'); this.activeRow = null; }
        this.overlay?.classList.add('hidden');
        this.menu?.classList.add('hidden');
    }

    executeFill(direction) {
        if (!this.activeRow) return;
        const count = parseInt(this.menu.querySelector(`#ctx-fill-${direction}-val`).value) || 0;
        if (count <= 0) return;

        const sourceData = this.extractRowData(this.activeRow);
        if (!sourceData) { AppUtils.Notify.error("Không thể đọc dữ liệu dòng hiện tại"); return; }

        const allRows = Array.from(this.activeRow.parentElement.children);
        const currentIndex = allRows.indexOf(this.activeRow);
        const targetRows = direction === 'up' ? allRows.slice(Math.max(0, currentIndex - count), currentIndex) : allRows.slice(currentIndex + 1, currentIndex + 1 + count);

        let successCount = 0;
        targetRows.forEach(targetRow => {
            const checkbox = targetRow.querySelector('.row-cb');
            if (checkbox?.checked) { this.applyDataToRow(targetRow, sourceData); successCount++; }
        });

        successCount > 0 ? AppUtils.Notify.success(`Đã sao chép dữ liệu cho ${successCount} dòng!`) : AppUtils.Notify.info("Không có dòng nào được chọn (checked) để điền.");
        this.hide();
    }

    extractRowData(tr) {
        const emp = this.manager.getEmpById(parseInt(tr.dataset.id));
        return emp?.uiState ? JSON.parse(JSON.stringify(emp.uiState)) : null;
    }

    applyDataToRow(tr, data) {
        if (!data) return;
        const emp = this.manager.getEmpById(parseInt(tr.dataset.id));
        if (!emp) return;
        emp.uiState = { ...emp.uiState, in: data.in, out: data.out, lunch: data.lunch, ot: data.ot, jobs: JSON.parse(JSON.stringify(data.jobs || [])) };
        const type = tr.closest('#vp-body') ? 'vp' : 'sx';
        this.manager.refreshRow(tr, emp, type);
        const newTr = document.querySelector(`tr[data-id="${emp.id}"]`);
        if (newTr) { newTr.classList.add('bg-green-50'); setTimeout(() => newTr.classList.remove('bg-green-50'), 500); }
    }

    destroy() {
        this.menu?.remove(); this.overlay?.remove();
        document.removeEventListener('scroll', this._handleScroll, true);
        this.eventManager.removeAll();
        this.manager = null; this.activeRow = null;
    }
}
