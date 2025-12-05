/**
 * File: static/js/cham_cong/ca_form.js
 * Version: 3.1 Refactored (Sửa lỗi tính toán qua đêm, tổng công, payload, và validate cơ bản)
 * Mô tả: Logic nghiệp vụ Ca làm việc
 */

class CaFormController extends BaseFormManager {
    // ✅ Helper chung parse HH:MM -> phút
    static parseTimeToMinutes(val) {
        if (!val || val === '--:--' || val.length < 5) return null;
        const [h, m] = val.split(':').map(Number);
        if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
        return h * 60 + m;
    }

    constructor() {
        super({
            formId: 'ca-form',
            submitBtnId: 'btn-save',
            apiUrls: {
                create: '/hrm/lich-lam-viec/api/ca-lam-viec/create/',
                update: (id) => `/hrm/lich-lam-viec/api/ca-lam-viec/${id}/update/`,
                detail: (id) => `/hrm/lich-lam-viec/api/ca-lam-viec/detail/${id}/`,
            },
            
            // Callbacks
            buildPayload: () => this.buildPayload(),
            validateLogic: (payload) => this.validateData(payload),
            fillFormData: (data) => this.fillData(data),
            onSuccess: () => {
                setTimeout(() => window.location.href = '/hrm/lich-lam-viec/thiet-ke-lich/ca-lam-viec/', 1000);
            }
        });

        // DOM Elements
        this.segmentsContainer = document.getElementById('segments-container');
        this.totalWorkdayInput = document.getElementById('total-workday');
        
        // ✅ Sử dụng CustomTimePicker Component
        this.timePicker = new CustomTimePicker();

        this.isCodeManuallyEdited = false;

        // Store total minutes for payload
        this.totalMinutes = 0;

        // Config cho toggle blocks - THÊM MỚI (thay vì để trong super config)
        this. shiftTypeBlocks = {
            'CO_DINH': 'block-co-dinh',
            'LINH_DONG': 'block-linh-dong',
            'TU_DO': 'block-tu-do'
        };
        
        this.shiftTypeDescs = {
            'CO_DINH': 'desc-co-dinh',
            'LINH_DONG': 'desc-linh-dong',
            'TU_DO': 'desc-tu-do'
        };
    }

    // ============================================================
    // LIFECYCLE HOOKS
    // ============================================================
    onAfterInit() {
        this.updateHeaderTitle();
        this.bindCaSpecificEvents();
        this.bindShiftTypeToggle();  
        this.bindAutoGenerateCode();

        if (!this.state.isUpdateMode) {
            this.renderFixedSegments(1);
            this.renderTimekeepingOptions(1);
            this.checkTuDoVisibility();
            this.timePicker.attachAll();
        }
        
        this.checkLunchBreakVisibility();
        this.calculateTotalWorkday(); // ✅ Đảm bảo tính tổng công ngay sau init
    }

    updateHeaderTitle() {
        const pageTitle = document.getElementById('page-title');
        if (pageTitle) {
            const title = this.state.isUpdateMode ? "Cập nhật ca làm việc" : "Thêm mới ca làm việc";
            pageTitle.textContent = title;
            document.title = title;
        }
    }

    // ============================================================
    // EVENT BINDING (Nghiệp vụ HRM cụ thể)
    // ============================================================
    bindCaSpecificEvents() {
        // Radio Số Khung Giờ
        document.querySelectorAll('input[name="sokhunggio"]').forEach(r => 
            r.addEventListener('change', (e) => {
                const count = parseInt(e.target.value);
                this.renderFixedSegments(count);
                this.renderTimekeepingOptions(count);
                this.checkLunchBreakVisibility();
            })
        );

        // Toggle Tự Do
        const todoToggle = document.getElementById('toggle-yeucau');
        if(todoToggle) todoToggle.addEventListener('change', () => this.checkTuDoVisibility());

        // Toggle Nghỉ trưa
        ['has-lunch-break', 'ld-has-lunch-break'].forEach(id => {
            const el = document.getElementById(id);
            if(el) el.addEventListener('change', (e) => {
                const targetId = id === 'has-lunch-break' ? 'lunch-time-inputs' : 'ld-lunch-time-inputs';
                const div = document.getElementById(targetId);
                if(e.target.checked) div.classList.remove('hidden');
                else div.classList.add('hidden');
                this.calculateTotalWorkTime();
            });
        });

        // Tính công tự động
        this.segmentsContainer.addEventListener('input', (e) => {
            if (e.target.classList.contains('segment-workday')) {
                this.calculateTotalWorkday();
            }
        });
        
        this.form.addEventListener('change', (e) => {
            if (e.target.classList.contains('time-input') || e.target.type === 'time' || e.target.type === 'checkbox') {
                this.calculateTotalWorkTime();
            }
        });
    }

    /**
     * Bind sự kiện chuyển đổi loại ca (Cố định/Linh động/Tự do)
     */
    bindShiftTypeToggle() {
        const radios = document.querySelectorAll('input[name="loaichamcong"]');
        
        radios. forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.handleShiftTypeSwitch(e.target.value);
            });
        });
    }


    /**
     * Auto-generate mã ca từ tên ca
     * - Chỉ hoạt động khi tạo mới (không phải update)
     * - Ngừng auto khi user sửa mã thủ công
     * - Tiếp tục auto nếu user xóa trắng ô mã
     */
    bindAutoGenerateCode() {
        const tenInput = this.form.querySelector('[name="tencalamviec"]');
        const maInput = this.form.querySelector('[name="macalamviec"]');
        
        if (! tenInput || !maInput) return;
        
        // Chỉ auto-generate khi tạo mới
        if (this.state.isUpdateMode) return;

        // Khi nhập tên → Tự động sinh mã
        tenInput.addEventListener('input', () => {
            if (! this.isCodeManuallyEdited) {
                maInput.value = AppUtils.Helper.generateCode(tenInput.value);
            }
        });

        // Khi user sửa mã thủ công
        maInput.addEventListener('input', (e) => {
            // Auto uppercase và remove ký tự đặc biệt
            e.target.value = e.target.value.toUpperCase(). replace(/[^A-Z0-9_]/g, '');
            
            if (e.target.value === '') {
                // User xóa trắng → Cho phép auto-generate lại
                this.isCodeManuallyEdited = false;
                maInput.value = AppUtils.Helper.generateCode(tenInput.value);
            } else {
                // User đã nhập/sửa → Ngừng auto
                this.isCodeManuallyEdited = true;
            }
        });
    }

    // ============================================================
    // UI RENDERING (Sử dụng Base Pattern nhưng giữ logic HRM)
    // ============================================================
    renderFixedSegments(count) {
        this.segmentsContainer.innerHTML = '';
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
                        <input type="number" step="0.1" required name="segment_${i}_workday" class="segment-workday w-24 px-3 py-1.5 rounded border border-slate-300 text-right font-bold text-green-700" placeholder="0.5">
                    </div>` : ''}
                </div>
            `;
            this.segmentsContainer.insertAdjacentHTML('beforeend', html);
        }
        
        this.timePicker.attachAll();
        
        // Khóa ô Tổng công nếu nhiều khung
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
        if (segmentCount >= 2) {
            html += `
                <label class="inline-flex items-center cursor-pointer">
                    <input type="radio" name="solanchamcong" value="2" class="text-green-600 focus:ring-green-500 w-4 h-4">
                    <span class="ml-2 text-sm text-slate-700">2 lần</span>
                </label>
            `;
        }
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

    // ============================================================
    // TOGGLE HANDLERS 
    // ============================================================
    handleShiftTypeSwitch(type) {
        // 1. Ẩn/hiện description
        Object.entries(this.shiftTypeDescs).forEach(([key, descId]) => {
            const el = document.getElementById(descId);
            if (el) {
                el.classList.toggle('hidden', key !== type);
            }
        });

        // 2.  Ẩn/hiện block nhập liệu (sử dụng helper từ base)
        Object.entries(this. shiftTypeBlocks).forEach(([key, blockId]) => {
            this.toggleBlock(blockId, key === type, true);
        });

        // 3.  Logic riêng cho từng loại - GIỮ NGUYÊN PHẦN NÀY
        if (type === 'CO_DINH') {
            if (! this.segmentsContainer.innerHTML) {
                this.renderFixedSegments(1);
                this.renderTimekeepingOptions(1);
            } else {
                const count = this.segmentsContainer.children.length;
                if (count > 1) {
                    this.totalWorkdayInput.readOnly = true;
                    this.totalWorkdayInput.classList.add('bg-slate-100', 'cursor-not-allowed');
                } else {
                    this.totalWorkdayInput. readOnly = false;
                    this.totalWorkdayInput. classList.remove('bg-slate-100', 'cursor-not-allowed');
                }
            }
        } else {
            this.totalWorkdayInput. readOnly = false;
            this.totalWorkdayInput. classList.remove('bg-slate-100', 'cursor-not-allowed');
            this.timePicker.attachAll();
            
            if (type === 'TU_DO') {
                this.checkTuDoVisibility();
            }
        }
        
        this.calculateTotalWorkTime();
        this.updateNextDayBadges();
    }


    checkTuDoVisibility() {
        const toggle = document.getElementById('toggle-yeucau');
        const container = document.getElementById('min-work-time-container');
        if(toggle && container) {
            const input = container.querySelector('input[name="thoigianlamviectoithieu"]');
            if(toggle.checked) {
                container.classList.remove('hidden');
                if(input) input.disabled = false;
            } else {
                container.classList.add('hidden');
                if(input) input.disabled = true;
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

    // ============================================================
    // Tính toán tổng thời gian và công
    // ============================================================
    calculateTotalWorkTime() {
        let totalMinutes = 0;
        const type = document.querySelector('input[name="loaichamcong"]:checked').value;

        const getMin = CaFormController.parseTimeToMinutes;

        if (type === 'CO_DINH') {
            const count = parseInt(document.querySelector('input[name="sokhunggio"]:checked').value);
            for (let i = 1; i <= count; i++) {
                const startVal = document.querySelector(`input[name="segment_${i}_start"]`)?.value;
                const endVal = document.querySelector(`input[name="segment_${i}_end"]`)?.value;
                
                const start = getMin(startVal);
                const end = getMin(endVal);

                if (start !== null && end !== null) {
                    if (end > start) {
                        totalMinutes += (end - start);
                    } else {
                        totalMinutes += (1440 - start + end); // Qua đêm
                    }
                }
            }
            // Xử lý nghỉ trưa cho CO_DINH
            if (count === 1 && document.getElementById('has-lunch-break')?.checked) {
                const lStart = getMin(document.querySelector('input[name="batdaunghigiuaca"]')?.value);
                const lEnd = getMin(document.querySelector('input[name="ketthucnghigiuaca"]')?.value);
                if (lStart !== null && lEnd !== null) {
                    if (lEnd > lStart) totalMinutes -= (lEnd - lStart);
                    else totalMinutes -= (1440 - lStart + lEnd);
                }
            }
        } 
        else if (type === 'LINH_DONG') {
            const start = getMin(document.querySelector('input[name="ld_batdau"]')?.value);
            const end = getMin(document.querySelector('input[name="ld_ketthuc"]')?.value);
            if (start !== null && end !== null) {
                if (end > start) totalMinutes += (end - start);
                else totalMinutes += (1440 - start + end); // ✅ Xử lý qua đêm
            }
            // Xử lý nghỉ trưa
            if (document.getElementById('ld-has-lunch-break')?.checked) {
                const lStart = getMin(document.querySelector('input[name="ld_batdaunghi"]')?.value);
                const lEnd = getMin(document.querySelector('input[name="ld_ketthucnghi"]')?.value);
                if (lStart !== null && lEnd !== null) {
                    if (lEnd > lStart) totalMinutes -= (lEnd - lStart);
                    else totalMinutes -= (1440 - lStart + lEnd);
                }
            }
        }
        else if (type === 'TU_DO') {
            // ✅ Thêm tính tổng thời gian cho TU_DO, xử lý qua đêm
            const start = getMin(document.querySelector('input[name="td_batdau"]')?.value);
            const end = getMin(document.querySelector('input[name="td_ketthuc"]')?.value);
            if (start !== null && end !== null) {
                if (end > start) totalMinutes += (end - start);
                else totalMinutes += (1440 - start + end); // ✅ Xử lý qua đêm
            }
        }

        const safeTotal = Math.max(0, totalMinutes);
        this.totalMinutes = safeTotal; // Store for payload
        const h = Math.floor(safeTotal / 60);
        const m = safeTotal % 60;
        const display = `${h.toString().padStart(2, '0')} giờ ${m.toString().padStart(2, '0')} phút`;
        
        const elFixed = document.getElementById('total-work-time');
        const elLinhDong = document.getElementById('ld-total-work-time');
        if (elFixed) elFixed.textContent = display;
        if (elLinhDong) elLinhDong.textContent = display;

        this.updateNextDayBadges();
    }

   updateNextDayBadges() {
        const type = document.querySelector('input[name="loaichamcong"]:checked').value;
        const getMin = CaFormController.parseTimeToMinutes;

        // ✅ Helper: Hiển thị/Ẩn badge (Đã FIX lỗi vị trí)
        const toggleBadge = (inputName, text = '') => {
            const input = document.querySelector(`input[name="${inputName}"]`);
            if (!input) return;
            
            const wrapper = input.parentElement;

            // 🔧 FIX 1: Bắt buộc thêm relative vào wrapper để badge nằm đúng trong ô input
            if (!wrapper.classList.contains('relative')) {
                wrapper.classList.add('relative');
            }

            let badge = wrapper.querySelector('.next-day-badge');
            
            if (text) {
                // 🔧 FIX 2: Tăng padding-right cho input để text giờ không bị badge che mất
                // (Giả lập class pr-16 của Tailwind nếu chưa có)
                if (!input.classList.contains('pr-16') && !input.classList.contains('pr-20')) {
                    input.classList.add('pr-16'); 
                }

                if (!badge) {
                    badge = document.createElement('span');
                    // Style chuẩn: nằm tuyệt đối bên phải, căn giữa theo chiều dọc
                    badge.className = 'next-day-badge absolute top-1/2 -translate-y-1/2 right-2 bg-green-100 text-green-700 text-[9px] font-bold px-1.5 py-0.5 rounded border border-green-200 uppercase tracking-tight pointer-events-none z-10';
                    wrapper.appendChild(badge);
                }
                badge.innerText = text;
            } else {
                if (badge) badge.remove();
                // (Tùy chọn) Có thể remove class pr-16 nếu muốn, nhưng giữ lại cũng không sao
            }
        };

        // Helper: So sánh logic
        const checkNextDay = (timeVal, rootTimeVal) => {
            if (timeVal === null || rootTimeVal === null) return '';
            return timeVal < rootTimeVal ? 'Hôm sau' : '';
        };

        // --- Logic tính toán ---
        if (type === 'CO_DINH') {
            const count = parseInt(document.querySelector('input[name="sokhunggio"]:checked').value);
            let previousStepMinutes = -1; 
            let dayOffset = 0;

            for (let i = 1; i <= count; i++) {
                const startVal = getMin(document.querySelector(`input[name="segment_${i}_start"]`)?.value);
                const endVal = getMin(document.querySelector(`input[name="segment_${i}_end"]`)?.value);

                if (startVal !== null) {
                    if (previousStepMinutes !== -1 && startVal < previousStepMinutes) dayOffset++;
                    previousStepMinutes = startVal;
                    toggleBadge(`segment_${i}_start`, dayOffset > 0 ? (dayOffset === 1 ? 'Hôm sau' : `Ngày +${dayOffset}`) : '');
                }

                if (endVal !== null) {
                    const compareBase = (startVal !== null) ? startVal : previousStepMinutes;
                    let localOffset = dayOffset;
                    if (compareBase !== -1 && endVal <= compareBase) localOffset++;
                    
                    previousStepMinutes = endVal;
                    toggleBadge(`segment_${i}_end`, localOffset > 0 ? (localOffset === 1 ? 'Hôm sau' : `Ngày +${localOffset}`) : '');
                }
            }

            // Xử lý nghỉ trưa (Cố định)
            if (count === 1 && document.getElementById('has-lunch-break')?.checked) {
                const shiftStart = getMin(document.querySelector('input[name="segment_1_start"]')?.value);
                const lStart = getMin(document.querySelector('input[name="batdaunghigiuaca"]')?.value);
                const lEnd = getMin(document.querySelector('input[name="ketthucnghigiuaca"]')?.value);

                if (shiftStart !== null) {
                    if (lStart !== null) toggleBadge('batdaunghigiuaca', checkNextDay(lStart, shiftStart));
                    if (lEnd !== null) {
                         let isNextDay = (lStart !== null && lEnd < lStart) || (lEnd < shiftStart);
                         if (lStart !== null && lStart < shiftStart) isNextDay = true;
                         toggleBadge('ketthucnghigiuaca', isNextDay ? 'Hôm sau' : '');
                    }
                }
            }
        } 
        else if (type === 'LINH_DONG') {
            const start = getMin(document.querySelector('input[name="ld_batdau"]')?.value);
            const end = getMin(document.querySelector('input[name="ld_ketthuc"]')?.value);
            
            // Badge Linh động
            if (start !== null && end !== null) toggleBadge('ld_ketthuc', checkNextDay(end, start));
            else toggleBadge('ld_ketthuc', '');

            // Badge Nghỉ trưa (Linh động)
            if (document.getElementById('ld-has-lunch-break')?.checked) {
                const lStart = getMin(document.querySelector('input[name="ld_batdaunghi"]')?.value);
                const lEnd = getMin(document.querySelector('input[name="ld_ketthucnghi"]')?.value);
                
                if (start !== null) {
                    if (lStart !== null) toggleBadge('ld_batdaunghi', checkNextDay(lStart, start));
                    
                    if (lEnd !== null) {
                        let isNextDay = (lStart !== null && lEnd < lStart) || (lEnd < start);
                        if (lStart !== null && lStart < start) isNextDay = true;
                        toggleBadge('ld_ketthucnghi', isNextDay ? 'Hôm sau' : '');
                    }
                }
            }
        }
        else if (type === 'TU_DO') {
            const start = getMin(document.querySelector('input[name="td_batdau"]')?.value);
            const end = getMin(document.querySelector('input[name="td_ketthuc"]')?.value);
            
            if (start !== null && end !== null) toggleBadge('td_ketthuc', checkNextDay(end, start));
            else toggleBadge('td_ketthuc', '');
        }
    }

    calculateTotalWorkday() {
        const inputs = this.segmentsContainer.querySelectorAll('.segment-workday');
        let total = 0;
        inputs.forEach(input => {
            const val = parseFloat(input.value);
            if (!isNaN(val)) total += val;
        });
        
        // ✅ Cập nhật ô Tổng công ngay lập tức
        if (inputs.length > 0) {
            this.totalWorkdayInput.value = total > 0 ? total.toFixed(1) : '';
        }
    }

    // ============================================================
    // Build Payload
    // ============================================================
    buildPayload() {
        const formData = new FormData(this.form);
        const loaiCa = formData.get('loaichamcong');
        const solanchamcong = this.form.querySelector('input[name="solanchamcong"]:checked')?.value || 1;
        
        let soKhungGio = 1;
        let tongCong = parseFloat(formData.get('congcuaca') || 0);

        if (loaiCa === 'CO_DINH') {
            soKhungGio = parseInt(document.querySelector('input[name="sokhunggio"]:checked').value);
            if (soKhungGio > 1) {
                let sum = 0;
                for (let i = 1; i <= soKhungGio; i++) {
                    sum += parseFloat(formData.get(`segment_${i}_workday`) || 0);
                }
                tongCong = sum;
            }
        }

        const payload = {
            TenCa: formData.get('tencalamviec'),
            MaCa: formData.get('macalamviec'),
            LoaiCa: loaiCa,
            TongCong: tongCong, 
            TongThoiGian: this.totalMinutes,  // ✅ Sử dụng TongThoiGian
            KhongCanCheckout: this.form.querySelector('[name="khongcancheckout"]').checked,
            SoLanChamCong: parseInt(solanchamcong),
            SoKhungGio: soKhungGio,
            ChiTietKhungGio: []
        };

        if (payload.LoaiCa === 'CO_DINH') {
             const count = parseInt(document.querySelector('input[name="sokhunggio"]:checked').value);
             for(let i=1; i<=count; i++) {
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
                payload.NghiTrua = { BatDau: formData.get('batdaunghigiuaca'), KetThuc: formData.get('ketthucnghigiuaca') };
            }
        }
        else if (payload.LoaiCa === 'LINH_DONG') {
            payload.ChiTietKhungGio.push({
                GioBatDau: formData.get('ld_batdau'), GioKetThuc: formData.get('ld_ketthuc'),
                Cong: payload.TongCong,
                KhongTinhCongNeuMuonHon: parseInt(formData.get('ld_late_cutoff')||0),
                KhongTinhCongNeuSomHon: parseInt(formData.get('ld_early_cutoff')||0),
                CheckInSomNhat: formData.get('ld_early_in'), CheckOutMuonNhat: formData.get('ld_late_out'),
                LinhDongDenMuon: parseInt(formData.get('ld_flex_late')||0),
                LinhDongVeSom: parseInt(formData.get('ld_flex_early')||0),
            });
            if(document.getElementById('ld-has-lunch-break').checked) {
                payload.NghiTrua = { BatDau: formData.get('ld_batdaunghi'), KetThuc: formData.get('ld_ketthucnghi') };
            }
        }
        else if (payload.LoaiCa === 'TU_DO') {
            payload.ChiTietKhungGio.push({
                GioBatDau: formData.get('td_batdau'), GioKetThuc: formData.get('td_ketthuc'),
                Cong: payload.TongCong,
                YeuCauChamCong: document.getElementById('toggle-yeucau').checked,
                MinPhutLamViec: parseInt(formData.get('thoigianlamviectoithieu') || 0)
            });
        }

        return payload;
    }

    // ============================================================
    // Validate Data (Cơ bản cho UX)
    // ============================================================
    validateData(payload) {
        if (!payload.TenCa.trim()) return "Tên ca không được để trống";
        if (!payload.MaCa.trim()) return "Mã ca không được để trống";
        
        // --- CASE 2: Validate Công thành phần (Cố định nhiều khung) ---
        if (payload.LoaiCa === 'CO_DINH' && payload.SoKhungGio > 1) {
            let totalCongSegments = 0;
            for (let i = 0; i < payload.SoKhungGio; i++) {
                const kg = payload.ChiTietKhungGio[i];
                if (!kg.Cong || parseFloat(kg.Cong) <= 0) {
                    return `Khung giờ ${i+1}: Vui lòng nhập Công (bắt buộc)`;
                }
                totalCongSegments += parseFloat(kg.Cong);
            }
            
        }

        // --- Validate giờ cơ bản ---
        for (let i = 0; i < payload.ChiTietKhungGio.length; i++) {
            const kg = payload.ChiTietKhungGio[i];
            if (!kg.GioBatDau || !kg.GioKetThuc) return `Khung giờ ${i+1}: Vui lòng nhập giờ bắt đầu và kết thúc`;
            
            // --- CASE 3: Validate Linh Động (Flex limits) ---
            if (payload.LoaiCa === 'LINH_DONG') {
                const start = CaFormController.parseTimeToMinutes(kg.GioBatDau);
                const end = CaFormController.parseTimeToMinutes(kg.GioKetThuc);
                
                // Tính tổng phút làm việc thực tế
                let totalWorkMinutes = 0;
                if (end > start) totalWorkMinutes = end - start;
                else totalWorkMinutes = 1440 - start + end; // Qua đêm

                // Kiểm tra Flex
                const flexLate = parseInt(kg.LinhDongDenMuon || 0);
                const flexEarly = parseInt(kg.LinhDongVeSom || 0);
                
                if ((flexLate + flexEarly) >= totalWorkMinutes) {
                    return "Thời gian linh động (đến muộn + về sớm) không được vượt quá tổng thời gian làm việc của ca.";
                }
            }
        }
        return null;
    }

    // ============================================================
    // Fill Data
    // ============================================================
    fillData(data) {
        this.isCodeManuallyEdited = true;  // Khi edit, không auto-generate
        // Helper: Set giá trị và trigger sự kiện input để tính toán lại
        const setVal = (name, val) => {
            const el = this.form.querySelector(`[name="${name}"]`);
            if (el) { 
                el.value = val !== null && val !== undefined ? val : ''; 
                el.dispatchEvent(new Event('input')); // Quan trọng: Trigger để validate và tính toán
            }
        };

        // 1. Điền thông tin cơ bản
        setVal('tencalamviec', data.TenCa);
        setVal('macalamviec', data.MaCa);
        setVal('congcuaca', data.TongCong); // Tổng công hiển thị ban đầu
        
        // Khóa mã ca khi update
        const codeInput = this.form.querySelector('input[name="macalamviec"]');
        if (codeInput) {
            codeInput.readOnly = true;
            codeInput.classList.add('bg-slate-100', 'cursor-not-allowed', 'text-slate-500');
        }

        const chkCheckout = this.form.querySelector('[name="khongcancheckout"]');
        if (chkCheckout) chkCheckout.checked = data.KhongCanCheckout;

        // 2. Chọn loại chấm công & Hiển thị Block/Mô tả tương ứng
        const typeRadio = this.form.querySelector(`input[name="loaichamcong"][value="${data.LoaiCa}"]`);
        if (typeRadio) { 
            typeRadio.checked = true;
            this.handleShiftTypeSwitch(data.LoaiCa); // Hàm này của BaseFormManager sẽ handle ẩn hiện block nhập liệu
        }
        // 3. Điền chi tiết theo từng loại ca
        if (data.LoaiCa === 'CO_DINH') {
            const count = (data.ChiTietKhungGio && data.ChiTietKhungGio.length > 0) ? data.ChiTietKhungGio.length : 1;
            
            // Check radio số khung giờ
            const countRadio = this.form.querySelector(`input[name="sokhunggio"][value="${count}"]`);
            if (countRadio) countRadio.checked = true;

            // Render lại DOM các khung giờ
            this.renderFixedSegments(count);
            this.renderTimekeepingOptions(count);
            this.checkLunchBreakVisibility();

            const soLan = data.SoLanChamCong || 1;
            const radioSoLan = this.form.querySelector(`input[name="solanchamcong"][value="${soLan}"]`);
            if (radioSoLan) radioSoLan.checked = true;

            if (data.ChiTietKhungGio) {
                data.ChiTietKhungGio.forEach((kg, idx) => {
                    const i = idx + 1;
                    setVal(`segment_${i}_start`, kg.GioBatDau);
                    setVal(`segment_${i}_end`, kg.GioKetThuc);
                    
                    // ✅ FIX: Điền Công thành phần (Quan trọng cho trường hợp nhiều khung giờ)
                    setVal(`segment_${i}_workday`, kg.Cong);
                    
                    // Điền các tham số phạt/cho phép
                    setVal(`segment_${i}_late_grace`, kg.DenMuonCP);
                    setVal(`segment_${i}_late_cutoff`, kg.KhongTinhCongNeuMuonHon);
                    setVal(`segment_${i}_early_in`, kg.CheckInSomNhat);
                    setVal(`segment_${i}_early_out_grace`, kg.VeSomCP);
                    setVal(`segment_${i}_early_cutoff`, kg.KhongTinhCongNeuSomHon);
                    setVal(`segment_${i}_late_out`, kg.CheckOutMuonNhat);
                });
                
                // ✅ FIX: Tính lại tổng công từ các thành phần để UI đồng bộ
                if (count > 1) {
                    this.calculateTotalWorkday(); 
                }
            }
            
            // Điền nghỉ trưa (chỉ có ở 1 khung giờ)
            if (data.NghiTrua && count === 1) {
                const lunchCheck = document.getElementById('has-lunch-break');
                if (lunchCheck) {
                    lunchCheck.checked = true;
                    document.getElementById('lunch-time-inputs').classList.remove('hidden');
                    setVal('batdaunghigiuaca', data.NghiTrua.BatDau);
                    setVal('ketthucnghigiuaca', data.NghiTrua.KetThuc);
                }
            }
        }
        else if (data.LoaiCa === 'LINH_DONG' && data.ChiTietKhungGio.length > 0) {
            const kg = data.ChiTietKhungGio[0];
            setVal('ld_batdau', kg.GioBatDau); 
            setVal('ld_ketthuc', kg.GioKetThuc);
            
            // Các trường settings linh động
            setVal('ld_late_cutoff', kg.KhongTinhCongNeuMuonHon);
            setVal('ld_early_in', kg.CheckInSomNhat);
            setVal('ld_early_cutoff', kg.KhongTinhCongNeuSomHon);
            setVal('ld_late_out', kg.CheckOutMuonNhat);
            
            // ✅ FIX: Điền thông tin Flex (Linh động đến muộn/về sớm)
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
            
            // Toggle Yêu cầu chấm công
            const todoCheck = document.getElementById('toggle-yeucau');
            if (todoCheck) { 
                todoCheck.checked = kg.YeuCauChamCong; 
                this.checkTuDoVisibility(); // Hàm này sẽ ẩn/hiện input min time
            }
        }

        // 4. Finalize UI
        this.timePicker.attachAll();      // Gắn lại time picker cho các input mới sinh ra
        this.calculateTotalWorkTime();    // Tính tổng giờ làm việc (xx giờ xx phút)
        this.updateNextDayBadges();       // ✅ FIX: Hiển thị badge "Hôm sau"

        const btnSave = document.getElementById('btn-save');
        if(btnSave) btnSave.innerHTML = '<i class="fas fa-save mr-2"></i>Cập nhật';
    }
}

// Init
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('ca-form')) {
        const controller = new CaFormController();
        controller.init();
    }
});