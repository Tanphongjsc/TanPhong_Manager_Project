/**
 * Class quản lý Context Menu (Chuột phải) cho Bảng Chấm Công
 * Tận dụng: AppUtils (EventManager, Notify)
 */
class ChamCongContextMenu {
    constructor(manager) {
        if (typeof AppUtils === 'undefined') {
            console.error('⛔ ChamCongContextMenu: AppUtils is required');
            return;
        }

        this.manager = manager;
        this.menu = null;
        this.overlay = null;
        this.activeRow = null;
        
        // Tận dụng EventManager để quản lý sự kiện nội bộ
        this.eventManager = AppUtils.EventManager.create();
        
        // Cache hàm bind để dùng cho removeEventListener (trường hợp đặc biệt)
        this._handleScroll = this.hide.bind(this);

        this.init();
    }

    init() {
        this.createDOM();
        this.attachGlobalEvents();
    }

    createDOM() {
        // 1. Create Overlay
        this.overlay = document.createElement('div');
        this.overlay.className = 'fixed inset-0 z-[49] hidden'; // Transparent overlay
        
        // 2. Create Menu
        this.menu = document.createElement('div');
        this.menu.className = 'fixed z-[50] bg-white rounded-lg shadow-xl border border-slate-200 w-64 hidden py-1 text-sm font-sans animation-fade-in';
        this.menu.innerHTML = `
            <div class="px-3 py-2 border-b border-slate-100 bg-slate-50 rounded-t-lg">
                <span class="text-xs font-bold text-slate-500 uppercase">Thao tác nhanh</span>
            </div>
            
            <div class="p-2 hover:bg-slate-50 transition-colors flex items-center gap-2 group cursor-pointer" id="ctx-btn-up">
                <div class="w-8 h-8 rounded bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                    <i class="fa-solid fa-arrow-up"></i>
                </div>
                <div class="flex-1">
                    <div class="text-slate-700 font-medium text-xs mb-1">Điền lên trên</div>
                    <div class="flex gap-1" onclick="event.stopPropagation()">
                        <input type="number" min="1" value="1" id="ctx-fill-up-val" class="w-full text-xs border border-slate-300 rounded px-1 py-0.5 focus:border-blue-500 outline-none">
                        <button id="btn-fill-up" class="px-2 py-0.5 bg-blue-600 text-white rounded text-xs hover:bg-blue-700">OK</button>
                    </div>
                </div>
            </div>

            <div class="p-2 hover:bg-slate-50 transition-colors flex items-center gap-2 group border-t border-slate-100 cursor-pointer" id="ctx-btn-down">
                <div class="w-8 h-8 rounded bg-orange-50 text-orange-600 flex items-center justify-center shrink-0">
                    <i class="fa-solid fa-arrow-down"></i>
                </div>
                <div class="flex-1">
                    <div class="text-slate-700 font-medium text-xs mb-1">Điền xuống dưới</div>
                    <div class="flex gap-1" onclick="event.stopPropagation()">
                        <input type="number" min="1" value="1" id="ctx-fill-down-val" class="w-full text-xs border border-slate-300 rounded px-1 py-0.5 focus:border-orange-500 outline-none">
                        <button id="btn-fill-down" class="px-2 py-0.5 bg-orange-600 text-white rounded text-xs hover:bg-orange-700">OK</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(this.overlay);
        document.body.appendChild(this.menu);

        this.bindMenuEvents();
    }

    bindMenuEvents() {
        const em = this.eventManager;
        const $ = id => this.menu.querySelector('#' + id);

        // Click Overlay -> Hide
        em.add(this.overlay, 'click', () => this.hide());

        // Buttons Click
        em.add($('btn-fill-up'), 'click', () => this.executeFill('up'));
        em.add($('btn-fill-down'), 'click', () => this.executeFill('down'));

        // Enter Key support
        const bindEnter = (id, direction) => {
            em.add($(id), 'keyup', (e) => {
                if (e.key === 'Enter') this.executeFill(direction);
            });
        };
        bindEnter('ctx-fill-up-val', 'up');
        bindEnter('ctx-fill-down-val', 'down');
    }

    attachGlobalEvents() {
        // 1. Right Click (Context Menu)
        this.eventManager.add(document, 'contextmenu', (e) => {
            // Logic tìm row: closest tr -> check if inside correct body
            const row = e.target.closest('tr');
            if (row && row.classList.contains('group') && (row.closest('#vp-body') || row.closest('#sx-body'))) {
                e.preventDefault();
                this.show(e.pageX, e.pageY, row);
            }
        });

        // 2. Scroll (Đóng menu khi scroll)
        document.addEventListener('scroll', this._handleScroll, true); 
    }

    show(x, y, row) {
        this.activeRow = row;
        this.activeRow.classList.add('bg-blue-100'); // Highlight row
        
        this.overlay.classList.remove('hidden');
        this.menu.classList.remove('hidden');
        
        // Positioning Logic (Tránh bị tràn màn hình)
        const winW = window.innerWidth;
        const winH = window.innerHeight;
        const menuRect = this.menu.getBoundingClientRect();
        
        let posX = x;
        let posY = y;

        if (x + menuRect.width > winW) posX = x - menuRect.width;
        if (y + menuRect.height > winH) posY = y - menuRect.height;

        this.menu.style.left = `${posX}px`;
        this.menu.style.top = `${posY}px`;

        // Auto focus input down (UX)
        setTimeout(() => {
            const input = this.menu.querySelector('#ctx-fill-down-val');
            if (input) input.focus();
        }, 50);
    }

    hide() {
        if (this.activeRow) {
            this.activeRow.classList.remove('bg-blue-100');
            this.activeRow = null;
        }
        if (this.overlay) this.overlay.classList.add('hidden');
        if (this.menu) this.menu.classList.add('hidden');
    }

    executeFill(direction) {
        if (!this.activeRow) return;

        const inputId = direction === 'up' ? '#ctx-fill-up-val' : '#ctx-fill-down-val';
        const input = this.menu.querySelector(inputId);
        const count = parseInt(input.value) || 0;

        if (count <= 0) return;

        // Data extraction
        const sourceData = this.extractRowData(this.activeRow);
        if (!sourceData) {
            AppUtils.Notify.error("Không thể đọc dữ liệu dòng hiện tại");
            return;
        }

        const tbody = this.activeRow.parentElement;
        const allRows = Array.from(tbody.children);
        const currentIndex = allRows.indexOf(this.activeRow);

        // Determine target rows
        let targetRows = [];
        if (direction === 'up') {
            targetRows = allRows.slice(Math.max(0, currentIndex - count), currentIndex);
        } else {
            targetRows = allRows.slice(currentIndex + 1, currentIndex + 1 + count);
        }

        // Apply Data
        let successCount = 0;
        targetRows.forEach(targetRow => {
            // Chỉ điền vào những dòng ĐANG ĐƯỢC CHECK
            const checkbox = targetRow.querySelector('.row-cb');
            if (checkbox && checkbox.checked) {
                this.applyDataToRow(targetRow, sourceData);
                successCount++;
            }
        });

        if (successCount > 0) {
            AppUtils.Notify.success(`Đã sao chép dữ liệu cho ${successCount} dòng!`);
        } else {
            AppUtils.Notify.info("Không có dòng nào được chọn (checked) để điền.");
        }

        this.hide();
    }

    extractRowData(tr) {
        // Tương tác trực tiếp với dữ liệu trong Manager
        const empId = parseInt(tr.dataset.id);
        const emp = this.manager.getEmpById(empId); // Dùng hàm helper mới của Manager
        if (!emp || !emp.uiState) return null;

        // Deep Copy data state
        return JSON.parse(JSON.stringify(emp.uiState));
    }

    applyDataToRow(tr, data) {
        if (!data) return;

        const empId = parseInt(tr.dataset.id);
        const emp = this.manager.getEmpById(empId);
        
        if (emp) {
            // Merge state: Giữ lại isActive, update các trường data
            emp.uiState = {
                ...emp.uiState,
                in: data.in,
                out: data.out,
                lunch: data.lunch,
                ot: data.ot,
                jobs: JSON.parse(JSON.stringify(data.jobs || [])) // Deep copy jobs
            };
            
            // Refresh UI thông qua Manager
            const type = tr.closest('#vp-body') ? 'vp' : 'sx';
            this.manager.refreshRow(tr, emp, type);
            
            // Visual feedback (Flash effect)
            const newTr = document.querySelector(`tr[data-id="${empId}"]`);
            if (newTr) {
                newTr.classList.add('bg-green-50');
                setTimeout(() => newTr.classList.remove('bg-green-50'), 500);
            }
        }
    }

    destroy() {
        // 1. Remove DOM elements
        if (this.menu) this.menu.remove();
        if (this.overlay) this.overlay.remove();
        
        // 2. Remove Scroll Listener (Managed manually)
        document.removeEventListener('scroll', this._handleScroll, true);
        
        // 3. Remove All Other Listeners (Managed by EventManager)
        this.eventManager.removeAll();

        // 4. Clear References
        this.manager = null;
        this.activeRow = null;
    }
}