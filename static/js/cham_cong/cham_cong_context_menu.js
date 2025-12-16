/**
 * Class quản lý Context Menu và tính năng Fill Data
 * Giúp tách biệt logic xử lý giao diện menu khỏi logic nghiệp vụ chính
 */
class ChamCongContextMenu {
    constructor(manager) {
        this.manager = manager; // Tham chiếu ngược lại ChamCongManager để gọi các hàm render/analyze
        this.menu = null;
        this.activeRow = null; // Dòng đang được click chuột phải
        this.overlay = null;
        
        this.init();
    }

    init() {
        this.createMenuDOM();
        this.attachGlobalEvents();
    }

    createMenuDOM() {
        // Tạo overlay trong suốt để click ra ngoài thì đóng menu
        this.overlay = document.createElement('div');
        this.overlay.className = 'fixed inset-0 z-[49] hidden';
        this.overlay.onclick = () => this.hide();
        document.body.appendChild(this.overlay);

        // Tạo Menu
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

        // Bind events cho các nút trong menu
        document.getElementById('btn-fill-up').addEventListener('click', () => this.executeFill('up'));
        document.getElementById('btn-fill-down').addEventListener('click', () => this.executeFill('down'));
        
        // Cho phép ấn Enter trong input
        const bindEnter = (id, direction) => {
            document.getElementById(id).addEventListener('keyup', (e) => {
                if (e.key === 'Enter') this.executeFill(direction);
            });
        };
        bindEnter('ctx-fill-up-val', 'up');
        bindEnter('ctx-fill-down-val', 'down');
    }

    attachGlobalEvents() {
        // Lắng nghe sự kiện click chuột phải trên toàn bộ bảng
        document.addEventListener('contextmenu', (e) => {
            const row = e.target.closest('tr');
            // Chỉ hiện menu nếu click vào dòng nhân viên (có class group) và nằm trong tbody
            if (row && row.classList.contains('group') && (row.closest('#vp-body') || row.closest('#sx-body'))) {
                e.preventDefault();
                this.show(e.pageX, e.pageY, row);
            }
        });
        
        // Ẩn menu khi scroll
        document.addEventListener('scroll', () => this.hide(), true);
    }

    show(x, y, row) {
        this.activeRow = row;
        
        // Highlight dòng đang chọn
        this.activeRow.classList.add('bg-blue-100');
        
        // Hiển thị menu
        this.overlay.classList.remove('hidden');
        this.menu.classList.remove('hidden');
        
        // Tính toán vị trí để không bị tràn màn hình
        const winW = window.innerWidth;
        const winH = window.innerHeight;
        const menuRect = this.menu.getBoundingClientRect();
        
        let posX = x;
        let posY = y;

        if (x + menuRect.width > winW) posX = x - menuRect.width;
        if (y + menuRect.height > winH) posY = y - menuRect.height;

        this.menu.style.left = `${posX}px`;
        this.menu.style.top = `${posY}px`;

        // Focus vào input fill down mặc định (vì fill down dùng nhiều hơn)
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

        // Lấy dữ liệu nguồn
        const sourceData = this.extractRowData(this.activeRow);
        
        // Lấy danh sách tất cả các dòng hiện tại trong bảng (để hỗ trợ việc đã filter)
        const tbody = this.activeRow.parentElement;
        const allRows = Array.from(tbody.children);
        const currentIndex = allRows.indexOf(this.activeRow);

        let targetRows = [];
        if (direction === 'up') {
            // Lấy x dòng phía trên
            targetRows = allRows.slice(Math.max(0, currentIndex - count), currentIndex);
        } else {
            // Lấy x dòng phía dưới
            targetRows = allRows.slice(currentIndex + 1, currentIndex + 1 + count);
        }

        // Thực hiện điền dữ liệu
        let successCount = 0;
        targetRows.forEach(targetRow => {
            // Chỉ điền vào dòng nào đang được check (active)
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
        const isSX = !!tr.querySelector('.job-select');
        
        const data = {
            in: tr.querySelector('.inp-in')?.value,
            out: tr.querySelector('.inp-out')?.value,
            lunch: tr.querySelector('.chk-lunch')?.checked,
            ot: tr.querySelector('.chk-ot')?.checked,
            isSX: isSX
        };

        if (isSX) {
            data.jobId = tr.querySelector('.job-select')?.value;
            data.params = {};
            tr.querySelectorAll('.param-val').forEach(inp => {
                data.params[inp.dataset.key] = inp.value;
            });
        }
        
        return data;
    }

    applyDataToRow(tr, data) {
        // 1. Điền giờ vào/ra
        const inpIn = tr.querySelector('.inp-in');
        const inpOut = tr.querySelector('.inp-out');
        
        if (inpIn) inpIn.value = data.in;
        if (inpOut) inpOut.value = data.out;

        // Điền trạng thái Ăn và OT
        const chkLunch = tr.querySelector('.chk-lunch');
        const chkOt = tr.querySelector('.chk-ot');
        // Sử dụng !!data.lunch để ép kiểu về boolean an toàn
        if (chkLunch) chkLunch.checked = !!data.lunch;
        if (chkOt) chkOt.checked = !!data.ot;

        // 2. Logic riêng cho SX (Giữ nguyên)
        if (data.isSX) {
            const jobSelect = tr.querySelector('.job-select');
            // Chỉ render lại params nếu Job ID thực sự thay đổi (Tối ưu performance)
            if (jobSelect && jobSelect.value !== data.jobId) {
                jobSelect.value = data.jobId;
                this.manager.renderRowParams(jobSelect); 
            }

            // Điền params
            const paramInputs = tr.querySelectorAll('.param-val');
            paramInputs.forEach(inp => {
                if (data.params[inp.dataset.key] !== undefined) {
                    inp.value = data.params[inp.dataset.key];
                }
            });
        }

        // 3. Trigger tính toán lại (Analysis cho VP)
        if (!data.isSX && inpIn) {
            this.manager.analyzeTime(inpIn); 
        }

        // 4. Hiệu ứng visual (Giữ nguyên)
        tr.classList.add('bg-green-50');
        setTimeout(() => tr.classList.remove('bg-green-50'), 500);
    }
}