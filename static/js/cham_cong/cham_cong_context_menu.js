class ChamCongContextMenu {
    constructor(manager) {
        this.manager = manager; 
        this.menu = null;
        this.activeRow = null; 
        this.overlay = null;
        this.init();
    }

    init() {
        this.createMenuDOM();
        this.attachGlobalEvents();
    }

    createMenuDOM() {
        this.overlay = document.createElement('div');
        this.overlay.className = 'fixed inset-0 z-[49] hidden';
        this.overlay.onclick = () => this.hide();
        document.body.appendChild(this.overlay);

        this.menu = document.createElement('div');
        this.menu.className = 'fixed z-[50] bg-white rounded-lg shadow-xl border border-slate-200 w-64 hidden py-1 text-sm font-sans animation-fade-in';
        this.menu.innerHTML = `
            <div class="px-3 py-2 border-b border-slate-100 bg-slate-50 rounded-t-lg">
                <span class="text-xs font-bold text-slate-500 uppercase">Thao tác nhanh</span>
            </div>
            
            <div class="p-2 hover:bg-slate-50 transition-colors flex items-center gap-2 group">
                <div class="w-8 h-8 rounded bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                    <i class="fa-solid fa-arrow-up"></i>
                </div>
                <div class="flex-1">
                    <div class="text-slate-700 font-medium text-xs mb-1">Điền lên trên</div>
                    <div class="flex gap-1">
                        <input type="number" min="1" value="1" id="ctx-fill-up-val" class="w-full text-xs border border-slate-300 rounded px-1 py-0.5 focus:border-blue-500 outline-none">
                        <button id="btn-fill-up" class="px-2 py-0.5 bg-blue-600 text-white rounded text-xs hover:bg-blue-700">OK</button>
                    </div>
                </div>
            </div>

            <div class="p-2 hover:bg-slate-50 transition-colors flex items-center gap-2 group border-t border-slate-100">
                <div class="w-8 h-8 rounded bg-orange-50 text-orange-600 flex items-center justify-center shrink-0">
                    <i class="fa-solid fa-arrow-down"></i>
                </div>
                <div class="flex-1">
                    <div class="text-slate-700 font-medium text-xs mb-1">Điền xuống dưới</div>
                    <div class="flex gap-1">
                        <input type="number" min="1" value="1" id="ctx-fill-down-val" class="w-full text-xs border border-slate-300 rounded px-1 py-0.5 focus:border-orange-500 outline-none">
                        <button id="btn-fill-down" class="px-2 py-0.5 bg-orange-600 text-white rounded text-xs hover:bg-orange-700">OK</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(this.menu);

        document.getElementById('btn-fill-up').addEventListener('click', () => this.executeFill('up'));
        document.getElementById('btn-fill-down').addEventListener('click', () => this.executeFill('down'));
        
        const bindEnter = (id, direction) => {
            document.getElementById(id).addEventListener('keyup', (e) => {
                if (e.key === 'Enter') this.executeFill(direction);
            });
        };
        bindEnter('ctx-fill-up-val', 'up');
        bindEnter('ctx-fill-down-val', 'down');
    }

    attachGlobalEvents() {
        this._handleContextMenu = (e) => {
            const row = e.target.closest('tr');
            if (row && row.classList.contains('group') && (row.closest('#vp-body') || row.closest('#sx-body'))) {
                e.preventDefault();
                this.show(e.pageX, e.pageY, row);
            }
        };
        
        this._handleScroll = () => this.hide();

        document.addEventListener('contextmenu', this._handleContextMenu);
        document.addEventListener('scroll', this._handleScroll, true);
    }

    show(x, y, row) {
        this.activeRow = row;
        this.activeRow.classList.add('bg-blue-100');
        
        this.overlay.classList.remove('hidden');
        this.menu.classList.remove('hidden');
        
        const winW = window.innerWidth;
        const winH = window.innerHeight;
        const menuRect = this.menu.getBoundingClientRect();
        
        let posX = x;
        let posY = y;

        if (x + menuRect.width > winW) posX = x - menuRect.width;
        if (y + menuRect.height > winH) posY = y - menuRect.height;

        this.menu.style.left = `${posX}px`;
        this.menu.style.top = `${posY}px`;

        setTimeout(() => document.getElementById('ctx-fill-down-val').focus(), 50);
    }

    hide() {
        if (this.activeRow) this.activeRow.classList.remove('bg-blue-100');
        this.overlay.classList.add('hidden');
        this.menu.classList.add('hidden');
        this.activeRow = null;
    }

    executeFill(direction) {
        if (!this.activeRow) return;

        const inputId = direction === 'up' ? 'ctx-fill-up-val' : 'ctx-fill-down-val';
        const count = parseInt(document.getElementById(inputId).value) || 0;

        if (count <= 0) return;

        const sourceData = this.extractRowData(this.activeRow);
        const tbody = this.activeRow.parentElement;
        const allRows = Array.from(tbody.children);
        const currentIndex = allRows.indexOf(this.activeRow);

        let targetRows = [];
        if (direction === 'up') {
            targetRows = allRows.slice(Math.max(0, currentIndex - count), currentIndex);
        } else {
            targetRows = allRows.slice(currentIndex + 1, currentIndex + 1 + count);
        }

        let successCount = 0;
        targetRows.forEach(targetRow => {
            const checkbox = targetRow.querySelector('.row-cb');
            if (checkbox && checkbox.checked) {
                this.applyDataToRow(targetRow, sourceData);
                successCount++;
            }
        });

        if (successCount > 0) {
            AppUtils.Notify.success(`Đã sao chép dữ liệu cho ${successCount} dòng!`);
        } else {
            AppUtils.Notify.info("Không có dòng nào hợp lệ để điền.");
        }

        this.hide();
    }

    extractRowData(tr) {
        const empId = parseInt(tr.dataset.id);
        const emp = this.manager.employees.find(e => e.id === empId);
        if (!emp || !emp.uiState) return null;

        const ui = emp.uiState;
        
        // Deep clone data state
        return {
            in: ui.in,
            out: ui.out,
            lunch: ui.lunch,
            ot: ui.ot,
            jobs: ui.jobs ? JSON.parse(JSON.stringify(ui.jobs)) : []
        };
    }

    applyDataToRow(tr, data) {
        if (!data) return;

        const empId = parseInt(tr.dataset.id);
        const emp = this.manager.employees.find(e => e.id === empId);
        
        if (emp) {
            // Update State
            if (!emp.uiState) emp.uiState = {};
            emp.uiState.in = data.in;
            emp.uiState.out = data.out;
            emp.uiState.lunch = data.lunch;
            emp.uiState.ot = data.ot;
            
            if (data.jobs && data.jobs.length > 0) {
                 // Deep copy jobs array to avoid shared references
                 emp.uiState.jobs = JSON.parse(JSON.stringify(data.jobs));
            } else {
                // Nếu copy từ VP sang SX hoặc ngược lại, cần handle
                // Tạm thời logic này áp dụng đúng tab vì menu chỉ fill trong cùng table
            }
            
            // Trigger UI update using manager's logic (Create new HTML for row)
            const type = tr.closest('#vp-body') ? 'vp' : 'sx';
            this.manager.refreshRow(tr, emp, type);
            
            // Highlight effect on the new row (cần lấy lại reference vì tr đã bị thay thế trong refreshRow)
            const newTr = document.querySelector(`tr[data-id="${empId}"]`);
            if (newTr) {
                newTr.classList.add('bg-green-50');
                setTimeout(() => newTr.classList.remove('bg-green-50'), 500);
            }
        }
    }

    destroy() {
        if (this.menu) this.menu.remove();
        if (this.overlay) this.overlay.remove();
        document.removeEventListener('contextmenu', this._handleContextMenu);
        document.removeEventListener('scroll', this._handleScroll, true);
    }
}