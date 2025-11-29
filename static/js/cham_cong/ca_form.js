/**
 * File: static/js/cham_cong/ca_form.js
 * Mô tả: Logic Form Ca làm việc (Fix lỗi TimePicker & Scroll)
 */

// ============================================================
// 1. CUSTOM TIME PICKER (Fix: Absolute Position, Allow Type)
// ============================================================
class CustomTimePicker {
    constructor() {
        this.activeInput = null;
        this.dropdown = null;
        this.isCreated = false;
        
        // Bind hàm để dùng trong event listener
        this.reposition = this.reposition.bind(this);
    }

    createDropdown() {
        if (this.isCreated) return;

        this.dropdown = document.createElement('div');
        this.dropdown.className = 'hidden fixed z-[9999] bg-white border border-slate-300 shadow-xl rounded-lg flex text-sm w-40 h-60 overflow-hidden font-mono select-none mt-1';
        
        const hourCol = document.createElement('div');
        hourCol.className = 'flex-1 overflow-y-auto custom-scrollbar border-r border-slate-100';
        for(let i=0; i<24; i++) {
            const div = document.createElement('div');
            div.className = 'px-2 py-2 hover:bg-green-50 cursor-pointer text-center text-slate-700 hover:text-green-700 transition-colors';
            div.textContent = i.toString().padStart(2, '0');
            div.onmousedown = (e) => { e.preventDefault(); this.selectHour(div.textContent); };
            hourCol.appendChild(div);
        }

        const minCol = document.createElement('div');
        minCol.className = 'flex-1 overflow-y-auto custom-scrollbar';
        for(let i=0; i<60; i++) { 
            const div = document.createElement('div');
            div.className = 'px-2 py-2 hover:bg-green-50 cursor-pointer text-center text-slate-700 hover:text-green-700 transition-colors';
            div.textContent = i.toString().padStart(2, '0');
            div.onmousedown = (e) => { e.preventDefault(); this.selectMinute(div.textContent); };
            minCol.appendChild(div);
        }

        this.dropdown.appendChild(hourCol);
        this.dropdown.appendChild(minCol);
        document.body.appendChild(this.dropdown);
        
        document.addEventListener('mousedown', (e) => {
            if (this.dropdown && !this.dropdown.contains(e.target) && this.activeInput && !this.activeInput.contains(e.target)) {
                this.hide();
            }
        });

        // Lắng nghe sự kiện scroll để cập nhật vị trí
        window.addEventListener('scroll', this.reposition, true);
        window.addEventListener('resize', this.reposition);

        this.isCreated = true;
    }

    attach(input) {
        if (!this.isCreated) this.createDropdown();
        if (input.dataset.pickerAttached === 'true') return;
        
        input.setAttribute('autocomplete', 'off');
        input.classList.add('bg-white'); 
        
        input.addEventListener('click', (e) => {
            e.stopPropagation();
            this.show(input);
        });
        input.addEventListener('focus', () => this.show(input));

        // INPUT MASKING (Chặn chữ, Format HH:MM)
        input.addEventListener('input', (e) => {
            this.activeInput = input;
            let val = input.value.replace(/[^0-9]/g, ''); // Chỉ giữ số
            if (val.length > 4) val = val.slice(0, 4); // Max 4 số
            
            if (val.length > 2) {
                val = val.slice(0, 2) + ':' + val.slice(2);
            }
            input.value = val;
            
            // Validate giờ phút hợp lệ
            if (val.length === 5) {
                const [h, m] = val.split(':').map(Number);
                if (h > 23 || m > 59) {
                    input.classList.add('border-red-500', 'text-red-600');
                } else {
                    input.classList.remove('border-red-500', 'text-red-600');
                }
            }
        });

        input.dataset.pickerAttached = 'true';
    }

    show(input) {
        this.activeInput = input;
        this.updatePosition();
        this.dropdown.classList.remove('hidden');
    }

    updatePosition() {
        if (!this.activeInput) return;
        const rect = this.activeInput.getBoundingClientRect();
        this.dropdown.style.top = (rect.bottom + 2) + 'px';
        this.dropdown.style.left = rect.left + 'px';
    }

    reposition() {
        if (!this.activeInput || this.dropdown.classList.contains('hidden')) return;
        this.updatePosition();
    }

    hide() {
        if(this.dropdown) this.dropdown.classList.add('hidden');
        this.activeInput = null;  // Reset activeInput để tránh trạng thái cũ
    }

    selectHour(hour) {
        if(!this.activeInput) return;
        let current = this.activeInput.value || '00:00';
        const parts = current.includes(':') ? current.split(':') : [current, '00'];
        const m = parts[1] && parts[1].length === 2 ? parts[1] : '00';
        this.updateValue(`${hour}:${m}`);
    }

    selectMinute(minute) {
        if(!this.activeInput) return;
        let current = this.activeInput.value || '00:00';
        const parts = current.includes(':') ? current.split(':') : ['00', current];
        const h = parts[0] && parts[0].length === 2 ? parts[0] : '00';
        this.updateValue(`${h}:${minute}`);
        this.hide();
    }

    updateValue(val) {
        if(this.activeInput) {
            this.activeInput.value = val;
            this.activeInput.classList.remove('border-red-500', 'text-red-600'); // Reset error if any
            this.activeInput.dispatchEvent(new Event('change', { bubbles: true }));
            this.activeInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }
}

// ============================================================
// 2. MAIN CONTROLLER
// ============================================================
class CaFormController {
    constructor() {
        this.form = document.getElementById('ca-form');
        this.segmentsContainer = document.getElementById('segments-container');
        this.totalWorkdayInput = document.getElementById('total-workday');
        this.timePicker = new CustomTimePicker();
        
        this.apiCreate = '/hrm/cham-cong/api/ca-lam-viec/create/';
        this.apiDetail = (id) => `/hrm/cham-cong/api/ca-lam-viec/detail/${id}/`;
        this.apiUpdate = (id) => `/hrm/cham-cong/api/ca-lam-viec/${id}/update/`;

        const matches = window.location.pathname.match(/\/ca-lam-viec\/(\d+)\/update\//);
        this.currentId = matches ? matches[1] : null;
        this.isUpdateMode = !!this.currentId;
        // Regex Mã: Chữ hoa, số, gạch dưới
        this.codeRegex = /^[A-Z0-9_]+$/;
    }

    init() {
        this.updateHeaderTitle();
        this.bindEvents();
        this.setupInputConstraints();
        
        if (this.isUpdateMode) {
            this.loadDataForUpdate(this.currentId);
        } else {
            this.renderFixedSegments(1);
            this.renderTimekeepingOptions(1);
            this.checkTuDoVisibility();
            // Attach picker cho Linh động/Tự do (các ô có sẵn trong HTML)
            this.attachAllTimePickers(); 
        }
        
        this.checkLunchBreakVisibility();
    }

    updateHeaderTitle() {
        const pageTitle = document.getElementById('page-title');
        if (pageTitle) {
            const title = this.isUpdateMode ? "Cập nhật ca làm việc" : "Thêm mới ca làm việc";
            pageTitle.textContent = title;
            document.title = `${title}`;
        }
    }

    // Ràng buộc nhập liệu trực tiếp trên Input
    setupInputConstraints() {
        // 1. Chặn ký tự đặc biệt ô Mã Ca (Chỉ A-Z, 0-9, _)
        const codeInput = this.form.querySelector('input[name="macalamviec"]');
        if(codeInput) {
            codeInput.addEventListener('input', (e) => {
                e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '');
            });
        }
        
        // 2. Giới hạn độ dài ô nhập phút (Max 4 số)
        this.form.addEventListener('input', (e) => {
            if (e.target.type === 'number' && !e.target.name.includes('cong')) {
                if (e.target.value.length > 4) e.target.value = e.target.value.slice(0, 4);
            }
        });
    }

    bindEvents() {
        const typeRadios = document.querySelectorAll('input[name="loaichamcong"]');
        typeRadios.forEach(radio => {
            radio.addEventListener('change', (e) => this.switchShiftType(e.target.value));
        });

        const segmentRadios = document.querySelectorAll('input[name="sokhunggio"]');
        segmentRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                const count = parseInt(e.target.value);
                this.renderFixedSegments(count);
                this.renderTimekeepingOptions(count);
                this.checkLunchBreakVisibility();
            });
        });

        const todoToggle = document.getElementById('toggle-yeucau');
        if(todoToggle) {
            todoToggle.addEventListener('change', () => this.checkTuDoVisibility());
        }

        const lunchToggle = document.getElementById('has-lunch-break');
        if(lunchToggle) {
            lunchToggle.addEventListener('change', (e) => {
                const div = document.getElementById('lunch-time-inputs');
                if(e.target.checked) div.classList.remove('hidden');
                else div.classList.add('hidden');
                this.calculateTotalWorkTime();
            });
        }

        const ldLunchToggle = document.getElementById('ld-has-lunch-break');
        if(ldLunchToggle) {
            ldLunchToggle.addEventListener('change', (e) => {
                const div = document.getElementById('ld-lunch-time-inputs');
                if(e.target.checked) div.classList.remove('hidden');
                else div.classList.add('hidden');
                this.calculateTotalWorkTime();
            });
        }

        this.segmentsContainer.addEventListener('input', (e) => {
            if (e.target.classList.contains('segment-workday')) this.calculateTotalWorkday();
        });
        this.form.addEventListener('change', (e) => {
            if (e.target.classList.contains('time-input') || e.target.type === 'time' || e.target.type === 'checkbox') {
                this.calculateTotalWorkTime();
            }
        });

        document.getElementById('btn-save').addEventListener('click', () => this.submitForm());
    }

    // --- UI HELPERS ---

    // Hàm quét và gắn TimePicker cho tất cả input có class time-input đang hiển thị
    attachAllTimePickers() {
        // Lấy tất cả input, kể cả những cái ẩn trong tab Linh động/Tự do
        const inputs = document.querySelectorAll('.time-input');
        inputs.forEach(input => {
            this.timePicker.attach(input);
        });
    }

    renderTimekeepingOptions(segmentCount) {
        const container = document.getElementById('timekeeping-count-options');
        if (!container) return;
        container.innerHTML = '';

        let html = `
            <label class="inline-flex items-center cursor-pointer">
                <input type="radio" name="solanchamcong" value="1" checked class="text-green-600 focus:ring-green-500 w-4 h-4">
                <span class="ml-2 text-sm text-slate-700">1 lần</span>
            </label>
        `;

        // Nếu 2 khung -> thêm option 2 lần
        if (segmentCount >= 2) {
            html += `
                <label class="inline-flex items-center cursor-pointer">
                    <input type="radio" name="solanchamcong" value="2" class="text-green-600 focus:ring-green-500 w-4 h-4">
                    <span class="ml-2 text-sm text-slate-700">2 lần</span>
                </label>
            `;
        }
        // Nếu 3 khung -> Thay thế option 2 lần bằng 3 lần (theo logic bạn yêu cầu trước đó)
        // Hoặc thêm cả 3? Theo mô tả "nút 2 lần đổi thành 3 lần":
        if (segmentCount === 3) {
             html = `
                <label class="inline-flex items-center cursor-pointer">
                    <input type="radio" name="solanchamcong" value="1" checked class="text-green-600 focus:ring-green-500 w-4 h-4">
                    <span class="ml-2 text-sm text-slate-700">1 lần</span>
                </label>
                <label class="inline-flex items-center cursor-pointer">
                    <input type="radio" name="solanchamcong" value="3" class="text-green-600 focus:ring-green-500 w-4 h-4">
                    <span class="ml-2 text-sm text-slate-700">3 lần</span>
                </label>
            `;
        }
        container.innerHTML = html;
    }

    renderFixedSegments(count) {
        this.segmentsContainer.innerHTML = '';
        
        // === LOGIC MỚI: Chỉ hiện dấu sao nếu có từ 2 khung trở lên ===
        const reqHtml = count > 1 ? '<span class="text-red-500 ml-1">*</span>' : '';

        for (let i = 1; i <= count; i++) {
            const html = `
                <div class="border border-slate-200 rounded-lg p-6 bg-white relative shadow-sm animate-fade-in mb-4">
                    <div class="absolute -top-3 left-3 bg-green-100 text-green-800 text-xs font-bold px-3 py-1 rounded uppercase border border-green-200">
                        Khung giờ ${i}
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6 mt-2">
                        <div class="space-y-4">
                            <div class="flex items-center justify-between">
                                <label class="text-sm font-bold text-slate-700 w-32">Giờ bắt đầu <span class="text-red-500">*</span></label>
                                <div class="w-36 relative">
                                    <input type="text" name="segment_${i}_start" required class="time-input w-full pl-3 pr-20 py-2 border border-slate-300 rounded-lg text-left font-medium bg-white focus:border-green-500 focus:ring-1 focus:ring-green-500 shadow-sm" placeholder="08:00">
                                </div>
                            </div>
                            <div class="pl-4 border-l-2 border-slate-100 space-y-3">
                                <div class="flex justify-between items-center">
                                    <span class="text-xs text-slate-600">Thời gian cho phép đến muộn (phút)</span>
                                    <input type="number" name="segment_${i}_late_grace" class="w-24 px-2 py-1 text-sm border border-slate-300 rounded focus:border-green-500 focus:ring-1 focus:ring-green-500 text-right shadow-sm" placeholder="0">
                                </div>
                                <div class="flex justify-between items-center">
                                    <span class="text-xs text-slate-600">Không ghi nhận công nếu muộn hơn (phút)</span>
                                    <input type="number" name="segment_${i}_late_cutoff" class="w-24 px-2 py-1 text-sm border border-slate-300 rounded focus:border-green-500 focus:ring-1 focus:ring-green-500 text-right shadow-sm" placeholder="∞">
                                </div>
                                <div class="flex justify-between items-center">
                                    <span class="text-xs text-slate-600">Check-in sớm nhất${reqHtml}</span>
                                    <div class="w-24 relative">
                                        <input type="text" name="segment_${i}_early_in" class="time-input w-full px-2 py-1 text-sm border border-slate-300 rounded text-center bg-white focus:border-green-500 focus:ring-1 focus:ring-green-500 shadow-sm" placeholder="--:--">
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="space-y-4">
                            <div class="flex items-center justify-between">
                                <label class="text-sm font-bold text-slate-700 w-32">Giờ kết thúc <span class="text-red-500">*</span></label>
                                <div class="w-36 relative">
                                    <input type="text" name="segment_${i}_end" required class="time-input w-full pl-3 pr-20 py-2 border border-slate-300 rounded-lg text-left font-medium bg-white focus:border-green-500 focus:ring-1 focus:ring-green-500 shadow-sm" placeholder="17:00">
                                </div>
                            </div>
                            <div class="pl-4 border-l-2 border-slate-100 space-y-3">
                                <div class="flex justify-between items-center">
                                    <span class="text-xs text-slate-600">Thời gian cho phép về sớm nhất (phút)</span>
                                    <input type="number" name="segment_${i}_early_out_grace" class="w-24 px-2 py-1 text-sm border border-slate-300 rounded focus:border-green-500 focus:ring-1 focus:ring-green-500 text-right shadow-sm" placeholder="0">
                                </div>
                                <div class="flex justify-between items-center">
                                    <span class="text-xs text-slate-600">Không ghi nhận công nếu về sớm hơn (phút)</span>
                                    <input type="number" name="segment_${i}_early_cutoff" class="w-24 px-2 py-1 text-sm border border-slate-300 rounded focus:border-green-500 focus:ring-1 focus:ring-green-500 text-right shadow-sm" placeholder="∞">
                                </div>
                                <div class="flex justify-between items-center">
                                    <span class="text-xs text-slate-600">Check-out muộn nhất${reqHtml}</span>
                                    <div class="w-24 relative">
                                        <input type="text" name="segment_${i}_late_out" class="time-input w-full px-2 py-1 text-sm border border-slate-300 rounded text-center bg-white focus:border-green-500 focus:ring-1 focus:ring-green-500 shadow-sm" placeholder="--:--">
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    ${count > 1 ? `
                    <div class="mt-4 border-t border-slate-100 pt-3 flex justify-end items-center gap-4">
                        <label class="text-sm font-bold text-slate-700">Công của khung giờ ${i} <span class="text-red-500">*</span></label>
                        <input type="number" step="0.1" name="segment_${i}_workday" class="segment-workday w-24 px-3 py-1.5 rounded border border-slate-300 text-right font-bold text-green-700" placeholder="0.5">
                    </div>` : ''}
                </div>
            `;
            this.segmentsContainer.insertAdjacentHTML('beforeend', html);
        }
        
        this.attachAllTimePickers();
        if (count > 1) {
            this.totalWorkdayInput.readOnly = true;
            this.totalWorkdayInput.classList.add('bg-slate-100', 'cursor-not-allowed');
            this.totalWorkdayInput.value = '';
        } else {
            this.totalWorkdayInput.readOnly = false;
            this.totalWorkdayInput.classList.remove('bg-slate-100', 'cursor-not-allowed');
        }
        this.calculateTotalWorkTime();
    }

    // Logic hiển thị Badge "Hôm sau" (Tuyến tính: Start -> End -> Start -> End...)
    updateNextDayBadges() {
        const type = document.querySelector('input[name="loaichamcong"]:checked').value;
        if (type !== 'CO_DINH') return;

        const count = parseInt(document.querySelector('input[name="sokhunggio"]:checked').value);
        let previousStepMinutes = -1; 
        let dayOffset = 0;

        const getMin = (val) => {
            if (!val || val === '--:--' || val.length < 5) return null;
            const [h, m] = val.split(':').map(Number);
            return h * 60 + m;
        };

        const toggleBadge = (inputName, offset) => {
            const input = document.querySelector(`input[name="${inputName}"]`);
            if (!input) return;
            
            const wrapper = input.parentElement; 
            let badge = wrapper.querySelector('.next-day-badge');

            if (offset > 0) {
                if (!badge) {
                    badge = document.createElement('span');
                    // SỬA CSS: right-2 (Nằm trong input), top-1/2 (Căn giữa dọc)
                    badge.className = 'next-day-badge absolute top-1/2 -translate-y-1/2 right-2 bg-green-100 text-green-700 text-[9px] font-bold px-1.5 py-0.5 rounded border border-green-200 uppercase tracking-tight pointer-events-none z-10';
                    wrapper.appendChild(badge);
                }
                badge.innerText = offset === 1 ? 'Hôm sau' : `Ngày +${offset}`;
            } else {
                if (badge) badge.remove();
            }
        };

        for (let i = 1; i <= count; i++) {
            const startName = `segment_${i}_start`;
            const endName = `segment_${i}_end`;
            const startVal = getMin(document.querySelector(`input[name="${startName}"]`)?.value);
            const endVal = getMin(document.querySelector(`input[name="${endName}"]`)?.value);

            // 1. Check Start
            if (startVal !== null) {
                if (previousStepMinutes !== -1 && startVal < previousStepMinutes) {
                    dayOffset++; 
                }
                previousStepMinutes = startVal;
                toggleBadge(startName, dayOffset);
            } else {
                toggleBadge(startName, 0);
            }

            // 2. Check End
            if (endVal !== null) {
                const compareBase = (startVal !== null) ? startVal : previousStepMinutes;
                
                // Logic: End <= Start (cùng 1 khung) -> Qua đêm
                if (compareBase !== -1 && endVal <= compareBase) {
                    dayOffset++;
                }
                previousStepMinutes = endVal;
                toggleBadge(endName, dayOffset);
            } else {
                toggleBadge(endName, 0);
            }
        }
    }

    calculateTotalWorkTime() {
        let totalMinutes = 0;
        const type = document.querySelector('input[name="loaichamcong"]:checked').value;

        const getMin = (val) => {
            if (!val || val === '--:--' || val.length < 5) return null;
            const [h, m] = val.split(':').map(Number);
            if (isNaN(h) || isNaN(m)) return null;
            return h * 60 + m;
        };

        if (type === 'CO_DINH') {
            const count = parseInt(document.querySelector('input[name="sokhunggio"]:checked').value);
            for (let i = 1; i <= count; i++) {
                const startVal = document.querySelector(`input[name="segment_${i}_start"]`)?.value;
                const endVal = document.querySelector(`input[name="segment_${i}_end"]`)?.value;
                
                const start = getMin(startVal);
                const end = getMin(endVal);

                if (start !== null && end !== null) {
                    if (end > start) totalMinutes += (end - start);
                    else totalMinutes += (1440 - start + end); // Qua đêm
                }
            }
            if (count === 1 && document.getElementById('has-lunch-break')?.checked) {
                const lStart = getMin(document.querySelector('input[name="batdaunghigiuaca"]')?.value);
                const lEnd = getMin(document.querySelector('input[name="ketthucnghigiuaca"]')?.value);
                
                // Trừ nghỉ trưa (Chỉ trừ khi hợp lệ)
                if (lStart !== null && lEnd !== null) {
                     if (lEnd > lStart) totalMinutes -= (lEnd - lStart);
                     // Nếu nghỉ trưa qua đêm (hiếm nhưng có thể): 23:30 - 00:30
                     else totalMinutes -= (1440 - lStart + lEnd);
                }
            }
        } 
        else if (type === 'LINH_DONG') {
            const start = getMin(document.querySelector('input[name="ld_batdau"]')?.value);
            const end = getMin(document.querySelector('input[name="ld_ketthuc"]')?.value);
            
            if (start !== null && end !== null) {
                if (end > start) totalMinutes += (end - start);
                else totalMinutes += (1440 - start + end);
            }
            
            if (document.getElementById('ld-has-lunch-break')?.checked) {
                const lStart = getMin(document.querySelector('input[name="ld_batdaunghi"]')?.value);
                const lEnd = getMin(document.querySelector('input[name="ld_ketthucnghi"]')?.value);
                if (lStart !== null && lEnd !== null) {
                     if (lEnd > lStart) totalMinutes -= (lEnd - lStart);
                     else totalMinutes -= (1440 - lStart + lEnd);
                }
            }
        }

        const safeTotal = Math.max(0, totalMinutes);
        const h = Math.floor(safeTotal / 60);
        const m = safeTotal % 60;
        const display = `${h.toString().padStart(2, '0')} giờ ${m.toString().padStart(2, '0')} phút`;
        
        const elFixed = document.getElementById('total-work-time');
        const elLinhDong = document.getElementById('ld-total-work-time');
        if (elFixed) elFixed.textContent = display;
        if (elLinhDong) elLinhDong.textContent = display;

        // Cập nhật Badge ngay sau khi tính toán xong
        this.updateNextDayBadges(); 
    }

    calculateTotalWorkday() {
        const inputs = document.querySelectorAll('.segment-workday');
        let total = 0;
        inputs.forEach(input => { total += parseFloat(input.value || 0); });
        if (inputs.length > 0) {
            this.totalWorkdayInput.value = total > 0 ? total : '';
        }
    }

    // Hàm hỗ trợ bật/tắt input trong 1 khối
    toggleBlockInputs(blockId, enable) {
        const block = document.getElementById(blockId);
        if (!block) return;
        
        // Tìm tất cả input, select, textarea trong block
        const inputs = block.querySelectorAll('input, select, textarea');
        inputs.forEach(input => {
            input.disabled = !enable; // Disable nếu không enable
        });
    }

    switchShiftType(type) {
        // 1. Ẩn tất cả các khối
        ['block-co-dinh', 'block-linh-dong', 'block-tu-do'].forEach(id => {
            document.getElementById(id).classList.add('hidden');
        });
        ['desc-co-dinh', 'desc-linh-dong', 'desc-tu-do'].forEach(id => {
            document.getElementById(id).classList.add('hidden');
        });

        // 2. Logic hiển thị từng loại
        if (type === 'CO_DINH') {
            document.getElementById('block-co-dinh').classList.remove('hidden');
            document.getElementById('desc-co-dinh').classList.remove('hidden');
            
            this.toggleBlockInputs('block-co-dinh', true);
            this.toggleBlockInputs('block-linh-dong', false);
            this.toggleBlockInputs('block-tu-do', false);

            if(!this.segmentsContainer.innerHTML) {
                this.renderFixedSegments(1);
                this.renderTimekeepingOptions(1);
            } else {
                // Nếu đã có segments, check lại số lượng để khóa/mở ô công
                const count = this.segmentsContainer.children.length;
                if (count > 1) {
                    this.totalWorkdayInput.readOnly = true;
                    this.totalWorkdayInput.classList.add('bg-slate-100', 'cursor-not-allowed');
                } else {
                    this.totalWorkdayInput.readOnly = false;
                    this.totalWorkdayInput.classList.remove('bg-slate-100', 'cursor-not-allowed');
                }
            }
        } 
        else if (type === 'LINH_DONG') {
            document.getElementById('block-linh-dong').classList.remove('hidden');
            document.getElementById('desc-linh-dong').classList.remove('hidden');
            
            this.toggleBlockInputs('block-linh-dong', true);
            this.toggleBlockInputs('block-co-dinh', false);
            this.toggleBlockInputs('block-tu-do', false);

            // === FIX: LUÔN MỞ KHÓA Ô CÔNG CHO LINH ĐỘNG ===
            this.totalWorkdayInput.readOnly = false;
            this.totalWorkdayInput.classList.remove('bg-slate-100', 'cursor-not-allowed');
            // ==============================================

            this.attachAllTimePickers(); 
        } 
        else if (type === 'TU_DO') {
            document.getElementById('block-tu-do').classList.remove('hidden');
            document.getElementById('desc-tu-do').classList.remove('hidden');
            
            this.toggleBlockInputs('block-tu-do', true);
            this.toggleBlockInputs('block-co-dinh', false);
            this.toggleBlockInputs('block-linh-dong', false);

            // === FIX: LUÔN MỞ KHÓA Ô CÔNG CHO TỰ DO ===
            this.totalWorkdayInput.readOnly = false;
            this.totalWorkdayInput.classList.remove('bg-slate-100', 'cursor-not-allowed');
            // ==========================================

            this.attachAllTimePickers(); 
            this.checkTuDoVisibility();
        }
        
        this.calculateTotalWorkTime();
    }

    checkTuDoVisibility() {
        const toggle = document.getElementById('toggle-yeucau');
        const container = document.getElementById('min-work-time-container');
        
        if(toggle && container) {
            // Tìm ô input bên trong container
            const input = container.querySelector('input[name="thoigianlamviectoithieu"]');
            
            if(toggle.checked) {
                container.classList.remove('hidden');
                if (input) input.disabled = false; // Hiện -> Cho nhập
            } else {
                container.classList.add('hidden');
                if (input) input.disabled = true;  // Ẩn -> Vô hiệu hóa (Để né lỗi required)
            }
        }
    }

    checkLunchBreakVisibility() {
        const type = document.querySelector('input[name="loaichamcong"]:checked').value;
        const segments = document.querySelector('input[name="sokhunggio"]:checked') ? document.querySelector('input[name="sokhunggio"]:checked').value : '1';
        const lunchSection = document.getElementById('lunch-break-section');
        if (type === 'CO_DINH' && segments == '1') {
            lunchSection.classList.remove('hidden');
        } else {
            lunchSection.classList.add('hidden');
        }
    }

    async loadDataForUpdate(id) {
        try {
            const res = await AppUtils.API.get(this.apiDetail(id));
            if (res.success) {
                this.fillFormData(res.data);
                this.attachAllTimePickers();
                this.calculateTotalWorkTime();
            } else {
                AppUtils.Notify.error(res.message);
            }
        } catch (err) {
            AppUtils.Notify.error("Lỗi kết nối");
        }
    }

    fillFormData(data) {
        const setVal = (name, val) => {
            const el = this.form.querySelector(`[name="${name}"]`);
            if (el) {
                el.value = val !== null && val !== undefined ? val : '';
                el.dispatchEvent(new Event('input')); 
            }
        };
        
        // 1. Master Data
        setVal('tencalamviec', data.TenCa);
        setVal('macalamviec', data.MaCa);
        setVal('congcuaca', data.TongCong);

        // === KHÓA MÃ CA KHI SỬA ===
        const codeInput = this.form.querySelector('input[name="macalamviec"]');
        if (codeInput) {
            codeInput.readOnly = true;
            codeInput.classList.add('bg-slate-100', 'cursor-not-allowed', 'text-slate-500');
            // Xóa sự kiện input chặn ký tự đặc biệt nếu cần (hoặc giữ nguyên cũng ko sao vì readOnly ko gõ được)
        }
        // ================================

        const chkCheckout = this.form.querySelector('[name="khongcancheckout"]');
        if (chkCheckout) chkCheckout.checked = data.KhongCanCheckout;

        // 2. Loại Ca
        const typeRadio = this.form.querySelector(`input[name="loaichamcong"][value="${data.LoaiCa}"]`);
        if (typeRadio) {
            typeRadio.checked = true;
            this.switchShiftType(data.LoaiCa); 
        }

        // 3. Detail
        if (data.LoaiCa === 'CO_DINH') {
            const count = (data.ChiTietKhungGio && data.ChiTietKhungGio.length > 0) ? data.ChiTietKhungGio.length : 1;
            
            const countRadio = this.form.querySelector(`input[name="sokhunggio"][value="${count}"]`);
            if (countRadio) countRadio.checked = true;

            this.renderFixedSegments(count);
            this.renderTimekeepingOptions(count);

            // === BỔ SUNG DÒNG NÀY ĐỂ ẨN NGHỈ TRƯA NẾU > 1 KHUNG ===
            this.checkLunchBreakVisibility(); 
            // ======================================================

            // Check lại số lần chấm công
            const soLan = data.SoLanChamCong || 1;
            const radioSoLan = this.form.querySelector(`input[name="solanchamcong"][value="${soLan}"]`);
            if (radioSoLan) radioSoLan.checked = true;

            if (data.ChiTietKhungGio) {
                data.ChiTietKhungGio.forEach((kg, idx) => {
                    const i = idx + 1;
                    setVal(`segment_${i}_start`, kg.GioBatDau);
                    setVal(`segment_${i}_end`, kg.GioKetThuc);
                    setVal(`segment_${i}_workday`, kg.Cong);
                    
                    setVal(`segment_${i}_late_grace`, kg.DenMuonCP);
                    setVal(`segment_${i}_late_cutoff`, kg.KhongTinhCongNeuMuonHon);
                    setVal(`segment_${i}_early_in`, kg.CheckInSomNhat);
                    
                    setVal(`segment_${i}_early_out_grace`, kg.VeSomCP);
                    setVal(`segment_${i}_early_cutoff`, kg.KhongTinhCongNeuSomHon);
                    setVal(`segment_${i}_late_out`, kg.CheckOutMuonNhat);
                });
            }
            
            // Chỉ điền nghỉ trưa nếu logic cho phép (1 khung)
            if (data.NghiTrua && count === 1) {
                const lunchCheck = document.getElementById('has-lunch-break');
                if (lunchCheck) {
                    lunchCheck.checked = true;
                    const lunchDiv = document.getElementById('lunch-time-inputs');
                    if(lunchDiv) lunchDiv.classList.remove('hidden');
                    
                    setVal('batdaunghigiuaca', data.NghiTrua.BatDau);
                    setVal('ketthucnghigiuaca', data.NghiTrua.KetThuc);
                }
            }
        }
        else if (data.LoaiCa === 'LINH_DONG' && data.ChiTietKhungGio.length > 0) {
            const kg = data.ChiTietKhungGio[0];
            setVal('ld_batdau', kg.GioBatDau);
            setVal('ld_ketthuc', kg.GioKetThuc);
            setVal('ld_late_cutoff', kg.KhongTinhCongNeuMuonHon);
            setVal('ld_early_in', kg.CheckInSomNhat);
            setVal('ld_early_cutoff', kg.KhongTinhCongNeuSomHon);
            setVal('ld_late_out', kg.CheckOutMuonNhat);
            setVal('ld_flex_late', kg.LinhDongDenMuon);
            setVal('ld_flex_early', kg.LinhDongVeSom);
            
            if (data.NghiTrua) {
                const ldLunchCheck = document.getElementById('ld-has-lunch-break');
                if (ldLunchCheck) {
                    ldLunchCheck.checked = true;
                    document.getElementById('ld-lunch-time-inputs').classList.remove('hidden');
                    setVal('ld_batdaunghi', data.NghiTrua.BatDau);
                    setVal('ld_ketthucnghi', data.NghiTrua.KetThuc);
                }
            }
        }
        else if (data.LoaiCa === 'TU_DO' && data.ChiTietKhungGio.length > 0) {
            const kg = data.ChiTietKhungGio[0];
            setVal('td_batdau', kg.GioBatDau);
            setVal('td_ketthuc', kg.GioKetThuc);
            setVal('thoigianlamviectoithieu', kg.MinPhutLamViec);
            
            const todoCheck = document.getElementById('toggle-yeucau');
            if (todoCheck) {
                todoCheck.checked = kg.YeuCauChamCong;
                this.checkTuDoVisibility();
            }
        }

        this.attachAllTimePickers();
        this.calculateTotalWorkTime();
        this.updateNextDayBadges();
        
        const btnSave = document.getElementById('btn-save');
        if(btnSave) btnSave.innerHTML = '<i class="fas fa-save mr-2"></i>Cập nhật';
    }

    // === VALIDATE LOGIC (EXPERT VERSION - FULL RULES) ===
    validateData(payload) {
        // 1. Check cơ bản
        if (!payload.TenCa.trim()) return "Tên ca không được để trống";
        if (!payload.MaCa.trim()) return "Mã ca không được để trống";
        
        const toMin = (timeStr) => {
            if (!timeStr || timeStr.length < 5) return null;
            const [h, m] = timeStr.split(':').map(Number);
            return h * 60 + m;
        };

        // Biến theo dõi mốc thời gian tuyệt đối của khung trước (Linear Time Tracker)
        // Dùng để kiểm tra quy tắc "Tiếp nối & Tách biệt"
        let previousSlotLatestOutAbs = -1; 
        let currentDayOffset = 0; 

        // 2. Validate Chi tiết từng khung giờ
        for (let i = 0; i < payload.ChiTietKhungGio.length; i++) {
            const kg = payload.ChiTietKhungGio[i];
            const label = payload.LoaiCa === 'CO_DINH' && payload.ChiTietKhungGio.length > 1 
                          ? `[Khung giờ ${i + 1}]` : 'Khung giờ:';

            // --- RULE 1: BẮT BUỘC NHẬP ---
            if (!kg.GioBatDau || !kg.GioKetThuc) return `${label} Vui lòng nhập đủ giờ bắt đầu và kết thúc`;

            // Nếu có từ 2 khung trở lên -> Bắt buộc nhập giới hạn để phân tách ca
            if (payload.LoaiCa === 'CO_DINH' && payload.ChiTietKhungGio.length > 1) {
                if (!kg.CheckInSomNhat) return `${label} Bắt buộc nhập 'Thời gian cho phép chấm công sớm nhất' (để phân biệt với khung giờ khác)`;
                if (!kg.CheckOutMuonNhat) return `${label} Bắt buộc nhập 'Thời gian cho phép về muộn nhất' (để phân biệt với khung giờ khác)`;
            }

            // --- RULE 4: DÒNG THỜI GIAN TUYẾN TÍNH (LINEAR TIME FLOW) ---
            let start = toMin(kg.GioBatDau);
            let end = toMin(kg.GioKetThuc);
            
            // 1. Xác định Start Absolute
            // Nếu Start nhỏ hơn mốc cũ (phần dư trong ngày) -> Qua đêm -> Tăng ngày
            let startAbs = start + (currentDayOffset * 1440);
            if (previousSlotLatestOutAbs !== -1 && start < (previousSlotLatestOutAbs % 1440)) {
                currentDayOffset++;
                startAbs = start + (currentDayOffset * 1440);
            }

            // 2. Xác định End Absolute
            let endAbs = end + (currentDayOffset * 1440);
            if (end <= start) { // Qua đêm nội bộ khung
                endAbs += 1440;
            }

            // 3. Xác định Early In Absolute
            let earlyInAbs = null;
            if (kg.CheckInSomNhat) {
                let earlyIn = toMin(kg.CheckInSomNhat);
                earlyInAbs = earlyIn + (currentDayOffset * 1440);
                // Xử lý trường hợp đặc biệt: Start 08:00 (Hôm sau), CheckIn 23:00 (Hôm nay)
                // Nếu EarlyIn > Start (trong cùng ngày) -> Có thể là EarlyIn của ngày hôm trước
                // Logic: Nếu khoảng cách quá lớn (>12h) thì lùi 1 ngày
                if (earlyIn > start && (start + 1440 - earlyIn) < (earlyIn - start)) {
                     earlyInAbs -= 1440;
                }
            }

            // 4. Xác định Late Out Absolute
            let lateOutAbs = null;
            if (kg.CheckOutMuonNhat) {
                let lateOut = toMin(kg.CheckOutMuonNhat);
                // LateOut thường >= End.
                // Tính toán dựa trên EndAbs
                lateOutAbs = lateOut + (Math.floor(endAbs / 1440) * 1440);
                // Nếu LateOut nhỏ hơn End (phần dư) -> Có thể đã sang ngày mới so với End
                if (lateOut < (endAbs % 1440)) {
                    lateOutAbs += 1440;
                }
            }

            // --- RULE 2: BAO BỌC (ENCLOSURE) ---
            
            // CheckIn Sớm nhất < Giờ Bắt đầu
            if (earlyInAbs !== null && earlyInAbs >= startAbs) {
                return `${label} Thời gian check-in sớm nhất (${kg.CheckInSomNhat}) phải nhỏ hơn Giờ bắt đầu (${kg.GioBatDau})`;
            }

            // CheckOut Muộn nhất > Giờ Kết thúc
            if (lateOutAbs !== null && lateOutAbs <= endAbs) {
                return `${label} Thời gian check-out muộn nhất (${kg.CheckOutMuonNhat}) phải lớn hơn Giờ kết thúc (${kg.GioKetThuc})`;
            }

            // --- RULE 3: TIẾP NỐI & TÁCH BIỆT (SEQUENTIAL & SEPARATION) ---
            // "Thời gian Check-in sớm nhất của Khung sau phải lớn hơn Thời gian Check-out muộn nhất của Khung trước"
            if (previousSlotLatestOutAbs !== -1) {
                // Mốc bắt đầu tính chấm công của khung hiện tại là EarlyIn (nếu có) hoặc Start
                const currentSlotStartPoint = earlyInAbs !== null ? earlyInAbs : startAbs;
                
                if (currentSlotStartPoint <= previousSlotLatestOutAbs) {
                    return `${label} Thời gian bắt đầu chấm công đang bị chồng chéo với Khung giờ trước đó. Vui lòng kiểm tra lại khoảng cách giữa các ca.`;
                }
            }

            // --- Validate Grace Period (Như cũ) ---
            if (kg.KhongTinhCongNeuMuonHon > 0 && kg.DenMuonCP >= kg.KhongTinhCongNeuMuonHon) {
                return `${label} Thời gian cho phép đến muộn (${kg.DenMuonCP}p) phải nhỏ hơn Thời gian không ghi nhận công (${kg.KhongTinhCongNeuMuonHon}p)`;
            }
            if (kg.KhongTinhCongNeuSomHon > 0 && kg.VeSomCP >= kg.KhongTinhCongNeuSomHon) {
                return `${label} Thời gian cho phép về sớm (${kg.VeSomCP}p) phải nhỏ hơn Thời gian không ghi nhận công (${kg.KhongTinhCongNeuSomHon}p)`;
            }

            // Cập nhật mốc cho vòng lặp sau
            // Mốc kết thúc chấm công của khung hiện tại là LateOut (nếu có) hoặc End
            previousSlotLatestOutAbs = lateOutAbs !== null ? lateOutAbs : endAbs;
            
            // Cập nhật offset ngày chuẩn cho vòng sau
            currentDayOffset = Math.floor(endAbs / 1440);
        }

        // 3. Validate Nghỉ trưa (Giữ nguyên logic cũ đã ổn)
        if (payload.NghiTrua) {
            const breakStart = toMin(payload.NghiTrua.BatDau);
            const breakEnd = toMin(payload.NghiTrua.KetThuc);
            if (breakStart === null || breakEnd === null) return "Vui lòng nhập đầy đủ giờ nghỉ trưa";
            
            const kg = payload.ChiTietKhungGio[0];
            let workStart = toMin(kg.GioBatDau);
            let workEnd = toMin(kg.GioKetThuc);
            if (workEnd <= workStart) workEnd += 1440;

            let bs = breakStart;
            let be = breakEnd;
            if (be <= bs) be += 1440;
            // Đồng bộ trục thời gian nghỉ trưa
            if (bs < workStart) { bs += 1440; be += 1440; }

            if (bs < workStart || be > workEnd) return "Thời gian nghỉ trưa phải nằm trong khoảng thời gian làm việc của ca";
            if (be <= bs) return "Giờ kết thúc nghỉ trưa phải lớn hơn giờ bắt đầu";
        }
        
        return null;
    }

    async submitForm() {
        // 1. Validate Form HTML (Cơ bản)
        if (!this.form.checkValidity()) {
            this.form.reportValidity();
            return;
        }

        const formData = new FormData(this.form);
        const loaiCa = formData.get('loaichamcong');
        const solanchamcong = this.form.querySelector('input[name="solanchamcong"]:checked')?.value || 1;
        
        // --- LOGIC TÍNH SỐ KHUNG GIỜ & TỔNG CÔNG ---
        let soKhungGio = 1;
        let tongCong = parseFloat(formData.get('congcuaca') || 0);

        if (loaiCa === 'CO_DINH') {
            soKhungGio = parseInt(document.querySelector('input[name="sokhunggio"]:checked').value);
            
            // Nếu nhiều khung giờ -> Tổng công phải bằng tổng các khung con (vì ô tổng bị disable)
            if (soKhungGio > 1) {
                let sum = 0;
                for (let i = 1; i <= soKhungGio; i++) {
                    const val = parseFloat(formData.get(`segment_${i}_workday`) || 0);
                    sum += val;
                }
                tongCong = sum;
            }
        }
        // ------------------------------------------------

        const payload = {
            TenCa: formData.get('tencalamviec'),
            MaCa: formData.get('macalamviec'),
            LoaiCa: loaiCa,
            TongCong: tongCong, // Sử dụng biến đã tính toán chuẩn ở trên
            KhongCanCheckout: this.form.querySelector('[name="khongcancheckout"]').checked,
            SoLanChamCong: parseInt(solanchamcong),
            SoKhungGio: soKhungGio,
            ChiTietKhungGio: []
        };

        // --- Build ChiTietKhungGio ---
        if (payload.LoaiCa === 'CO_DINH') {
            const count = parseInt(document.querySelector('input[name="sokhunggio"]:checked').value);
            for(let i=1; i<=count; i++) {
                // Lấy công từng thành phần
                let cong = (count === 1) ? payload.TongCong : parseFloat(formData.get(`segment_${i}_workday`) || 0);
                
                payload.ChiTietKhungGio.push({
                    GioBatDau: formData.get(`segment_${i}_start`),
                    GioKetThuc: formData.get(`segment_${i}_end`),
                    Cong: cong,
                    DenMuonCP: parseInt(formData.get(`segment_${i}_late_grace`)||0),
                    VeSomCP: parseInt(formData.get(`segment_${i}_early_out_grace`)||0),
                    KhongTinhCongNeuMuonHon: parseInt(formData.get(`segment_${i}_late_cutoff`)||0),
                    KhongTinhCongNeuSomHon: parseInt(formData.get(`segment_${i}_early_cutoff`)||0),
                    CheckInSomNhat: formData.get(`segment_${i}_early_in`),
                    CheckOutMuonNhat: formData.get(`segment_${i}_late_out`),
                });
            }
            if(count === 1 && document.getElementById('has-lunch-break').checked) {
                payload.NghiTrua = {
                    BatDau: formData.get('batdaunghigiuaca'),
                    KetThuc: formData.get('ketthucnghigiuaca')
                };
            }
        }
        else if (payload.LoaiCa === 'LINH_DONG') {
            payload.ChiTietKhungGio.push({
                GioBatDau: formData.get('ld_batdau'),
                GioKetThuc: formData.get('ld_ketthuc'),
                Cong: payload.TongCong,
                KhongTinhCongNeuMuonHon: parseInt(formData.get('ld_late_cutoff')||0),
                KhongTinhCongNeuSomHon: parseInt(formData.get('ld_early_cutoff')||0),
                CheckInSomNhat: formData.get('ld_early_in'),
                CheckOutMuonNhat: formData.get('ld_late_out'),
                LinhDongDenMuon: parseInt(formData.get('ld_flex_late')||0),
                LinhDongVeSom: parseInt(formData.get('ld_flex_early')||0),
            });
            if(document.getElementById('ld-has-lunch-break').checked) {
                payload.NghiTrua = {
                    BatDau: formData.get('ld_batdaunghi'),
                    KetThuc: formData.get('ld_ketthucnghi')
                };
            }
        }
        else if (payload.LoaiCa === 'TU_DO') {
            payload.ChiTietKhungGio.push({
                GioBatDau: formData.get('td_batdau'),
                GioKetThuc: formData.get('td_ketthuc'),
                Cong: payload.TongCong,
                YeuCauChamCong: document.getElementById('toggle-yeucau').checked,
                MinPhutLamViec: parseInt(formData.get('thoigianlamviectoithieu') || 0)
            });
        }

        // 3. VALIDATE LOGIC NGHIỆP VỤ
        const errorMsg = this.validateData(payload);
        if (errorMsg) {
            AppUtils.Notify.error(errorMsg);
            return;
        }

        // 4. GỬI API
        const btn = document.getElementById('btn-save');
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Đang lưu...';

        try {
            let res;
            // Chia trường hợp gọi đúng hàm có trong utils.js
            if (this.isUpdateMode) {
                res = await AppUtils.API.put(this.apiUpdate(this.currentId), payload);
            } else {
                res = await AppUtils.API.post(this.apiCreate, payload);
            }

            if (res.success) {
                AppUtils.Notify.success(this.isUpdateMode ? "Cập nhật thành công!" : "Thêm mới thành công!");
                setTimeout(() => window.location.href = '/hrm/cham-cong/thiet-ke-lich/ca-lam-viec/', 1000);
            } else {
                AppUtils.Notify.error(res.message || "Có lỗi xảy ra");
                btn.disabled = false;
                btn.innerHTML = originalText;
            }
        } catch (err) {
            console.error(err);
            AppUtils.Notify.error("Lỗi hệ thống: " + (err.message || err));
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const controller = new CaFormController();
    controller.init();
});