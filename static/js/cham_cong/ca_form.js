/**
 * File: static/js/cham_cong/ca_form.js
 * Version: 3.0 Refactored (Sử dụng Base Enhanced + Component)
 * Mô tả: Logic nghiệp vụ Ca làm việc (Không thay đổi logic, chỉ tổ chức lại)
 */

class CaFormController extends BaseFormManager {
    constructor() {
        super({
            formId: 'ca-form',
            submitBtnId: 'btn-save',
            apiUrls: {
                create: '/hrm/cham-cong/api/ca-lam-viec/create/',
                update: (id) => `/hrm/cham-cong/api/ca-lam-viec/${id}/update/`,
                detail: (id) => `/hrm/cham-cong/api/ca-lam-viec/detail/${id}/`,
            },
            
            // ✅ Sử dụng Toggle Blocks Pattern
            toggleBlocks: {
                radioName: 'loaichamcong',
                blocks: {
                    'CO_DINH': 'block-co-dinh',
                    'LINH_DONG': 'block-linh-dong',
                    'TU_DO': 'block-tu-do'
                },
                onSwitch: (value) => {
                    this. handleShiftTypeSwitch(value);
                }
            },
            
            // ✅ Sử dụng Input Constraints Pattern
            inputConstraints: [
                { selector: 'input[name="macalamviec"]', type: 'uppercase' },
                { selector: 'input[type="number"]:not([name*="cong"])', type: 'number', maxLength: 4 }
            ],
            
            // Callbacks
            buildPayload: () => this.buildPayload(),
            validateLogic: (payload) => this.validateData(payload),
            fillFormData: (data) => this.fillData(data),
            onSuccess: () => {
                setTimeout(() => window.location.href = '/hrm/cham-cong/thiet-ke-lich/ca-lam-viec/', 1000);
            }
        });

        // DOM Elements
        this.segmentsContainer = document.getElementById('segments-container');
        this.totalWorkdayInput = document.getElementById('total-workday');
        
        // ✅ Sử dụng CustomTimePicker Component
        this.timePicker = new CustomTimePicker();
    }

    // ============================================================
    // LIFECYCLE HOOKS
    // ============================================================
    onAfterInit() {
        this.updateHeaderTitle();
        this.bindCaSpecificEvents();

        if (! this.state.isUpdateMode) {
            this.renderFixedSegments(1);
            this.renderTimekeepingOptions(1);
            this.checkTuDoVisibility();
            this.timePicker.attachAll();
        }
        
        this.checkLunchBreakVisibility();
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
            if (e.target.classList.contains('segment-workday')) this.calculateTotalWorkday();
        });
        
        this.form.addEventListener('change', (e) => {
            if (e.target.classList. contains('time-input') || e.target.type === 'time' || e.target.type === 'checkbox') {
                this.calculateTotalWorkTime();
            }
        });
    }

    // ============================================================
    // ✅ UI RENDERING (Sử dụng Base Pattern nhưng giữ logic HRM)
    // ============================================================
    renderFixedSegments(count) {
        // ✅ Sử dụng renderDynamicSegments từ Base (hoặc custom nếu quá phức tạp)
        // Giữ nguyên logic template của bạn
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
                        <input type="number" step="0.1" name="segment_${i}_workday" class="segment-workday w-24 px-3 py-1. 5 rounded border border-slate-300 text-right font-bold text-green-700" placeholder="0. 5">
                    </div>` : ''}
                </div>
            `;
            this. segmentsContainer.insertAdjacentHTML('beforeend', html);
        }
        
        this.timePicker.attachAll();
        
        // Khóa ô Tổng công nếu nhiều khung
        if (count > 1) {
            this.totalWorkdayInput.readOnly = true;
            this. totalWorkdayInput.classList. add('bg-slate-100', 'cursor-not-allowed');
            this.totalWorkdayInput. value = '';
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
    // TOGGLE HANDLERS (Sử dụng Base switchBlock)
    // ============================================================
    handleShiftTypeSwitch(type) {
        // Base đã ẩn/hiện blocks và toggle inputs
        // Chỉ cần xử lý logic riêng HRM
        
        if (type === 'CO_DINH') {
            if(! this.segmentsContainer.innerHTML) {
                this.renderFixedSegments(1);
                this. renderTimekeepingOptions(1);
            } else {
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
        else {
            // Linh động, Tự do
            this.totalWorkdayInput.readOnly = false;
            this.totalWorkdayInput.classList.remove('bg-slate-100', 'cursor-not-allowed');
            this.timePicker.attachAll();
            
            if (type === 'TU_DO') {
                this.checkTuDoVisibility();
            }
        }
        
        this.calculateTotalWorkTime();
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
    calculateTotalWorkTime() {
        let totalMinutes = 0;
        const type = document.querySelector('input[name="loaichamcong"]:checked').value;

        const getMin = (val) => {
            if (! val || val === '--:--' || val. length < 5) return null;
            const [h, m] = val.split(':'). map(Number);
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
                    if (end > start) {
                        totalMinutes += (end - start);
                    } else {
                        totalMinutes += (1440 - start + end);
                    }
                }
            }
            if (count === 1 && document.getElementById('has-lunch-break')?.checked) {
                const lStart = getMin(document.querySelector('input[name="batdaunghigiuaca"]')?.value);
                const lEnd = getMin(document. querySelector('input[name="ketthucnghigiuaca"]')?. value);
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

        this.updateNextDayBadges();
    }

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
            if (! input) return;
            const wrapper = input.parentElement; 
            let badge = wrapper.querySelector('.next-day-badge');

            if (offset > 0) {
                if (! badge) {
                    badge = document.createElement('span');
                    badge.className = 'next-day-badge absolute top-1/2 -translate-y-1/2 right-2 bg-green-100 text-green-700 text-[9px] font-bold px-1. 5 py-0.5 rounded border border-green-200 uppercase tracking-tight pointer-events-none z-10';
                    wrapper. appendChild(badge);
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

            if (startVal !== null) {
                if (previousStepMinutes !== -1 && startVal < previousStepMinutes) { dayOffset++; }
                previousStepMinutes = startVal;
                toggleBadge(startName, dayOffset);
            } else { toggleBadge(startName, 0); }

            if (endVal !== null) {
                const compareBase = (startVal !== null) ? startVal : previousStepMinutes;
                if (compareBase !== -1 && endVal <= compareBase) { dayOffset++; }
                previousStepMinutes = endVal;
                toggleBadge(endName, dayOffset);
            } else { toggleBadge(endName, 0); }
        }
    }

    calculateTotalWorkday() {
        const inputs = document.querySelectorAll('. segment-workday');
        let total = 0;
        inputs.forEach(input => { total += parseFloat(input.value || 0); });
        if (inputs.length > 0) {
            this.totalWorkdayInput.value = total > 0 ? total : '';
        }
    }

    // ============================================================
    buildPayload() {
        const formData = new FormData(this.form);
        const loaiCa = formData.get('loaichamcong');
        const solanchamcong = this.form.querySelector('input[name="solanchamcong"]:checked')?.value || 1;
        
        let soKhungGio = 1;
        let tongCong = parseFloat(formData.get('congcuaca') || 0);

        if (loaiCa === 'CO_DINH') {
            soKhungGio = parseInt(document.querySelector('input[name="sokhunggio"]:checked'). value);
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
            KhongCanCheckout: this.form.querySelector('[name="khongcancheckout"]').checked,
            SoLanChamCong: parseInt(solanchamcong),
            SoKhungGio: soKhungGio,
            ChiTietKhungGio: []
        };

        if (payload. LoaiCa === 'CO_DINH') {
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
                    KhongTinhCongNeuSomHon: parseInt(formData. get(`segment_${i}_early_cutoff`)||0),
                    CheckInSomNhat: formData.get(`segment_${i}_early_in`),
                    CheckOutMuonNhat: formData.get(`segment_${i}_late_out`),
                });
            }
            if(count === 1 && document.getElementById('has-lunch-break'). checked) {
                payload.NghiTrua = { BatDau: formData.get('batdaunghigiuaca'), KetThuc: formData.get('ketthucnghigiuaca') };
            }
        }
        else if (payload.LoaiCa === 'LINH_DONG') {
            payload.ChiTietKhungGio. push({
                GioBatDau: formData.get('ld_batdau'), GioKetThuc: formData.get('ld_ketthuc'),
                Cong: payload.TongCong,
                KhongTinhCongNeuMuonHon: parseInt(formData. get('ld_late_cutoff')||0),
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

    validateData(payload) {
        
        if (!payload.TenCa. trim()) return "Tên ca không được để trống";
        if (!payload.MaCa.trim()) return "Mã ca không được để trống";
        if (!this.state.isUpdateMode && payload.MaCa.toUpperCase() === 'CAHANHCHINH') {
            return "Mã 'CAHANHCHINH' là mã hệ thống, bạn không được phép sử dụng. ";
        }

        const toMin = (timeStr) => {
            if (!timeStr || timeStr. length < 5) return null;
            const [h, m] = timeStr.split(':').map(Number);
            return h * 60 + m;
        };

        let previousSlotLatestOutAbs = -1; 
        let currentDayOffset = 0; 

        for (let i = 0; i < payload.ChiTietKhungGio.length; i++) {
            const kg = payload.ChiTietKhungGio[i];
            const label = payload. LoaiCa === 'CO_DINH' && payload.ChiTietKhungGio. length > 1 ? `[Khung giờ ${i + 1}]` : 'Khung giờ:';

            if (! kg.GioBatDau || !kg.GioKetThuc) return `${label} Vui lòng nhập đủ giờ bắt đầu và kết thúc`;

            if (payload.LoaiCa === 'CO_DINH' && payload.ChiTietKhungGio.length > 1) {
                if (! kg.CheckInSomNhat) return `${label} Bắt buộc nhập 'Thời gian check-in sớm nhất'`;
                if (!kg.CheckOutMuonNhat) return `${label} Bắt buộc nhập 'Thời gian về muộn nhất'`;
            }

            let start = toMin(kg.GioBatDau);
            let end = toMin(kg.GioKetThuc);
            
            let startAbs = start + (currentDayOffset * 1440);
            if (previousSlotLatestOutAbs !== -1 && start < (previousSlotLatestOutAbs % 1440)) {
                currentDayOffset++;
                startAbs = start + (currentDayOffset * 1440);
            }

            let endAbs = end + (currentDayOffset * 1440);
            if (end <= start) endAbs += 1440;

            let earlyInAbs = null;
            if (kg.CheckInSomNhat) {
                let earlyIn = toMin(kg.CheckInSomNhat);
                earlyInAbs = earlyIn + (currentDayOffset * 1440);
                if (earlyIn > start && (start + 1440 - earlyIn) < (earlyIn - start)) earlyInAbs -= 1440;
            }

            let lateOutAbs = null;
            if (kg. CheckOutMuonNhat) {
                let lateOut = toMin(kg.CheckOutMuonNhat);
                lateOutAbs = lateOut + (Math.floor(endAbs / 1440) * 1440);
                if (lateOut < (endAbs % 1440)) lateOutAbs += 1440;
            }

            if (earlyInAbs !== null && earlyInAbs >= startAbs) return `${label} Thời gian check-in sớm nhất phải nhỏ hơn Giờ bắt đầu`;
            if (lateOutAbs !== null && lateOutAbs <= endAbs) return `${label} Thời gian check-out muộn nhất phải lớn hơn Giờ kết thúc`;

            if (previousSlotLatestOutAbs !== -1) {
                const currentSlotStartPoint = earlyInAbs !== null ? earlyInAbs : startAbs;
                if (currentSlotStartPoint <= previousSlotLatestOutAbs) return `${label} Thời gian bắt đầu bị chồng chéo với khung trước. `;
            }

            if (kg.KhongTinhCongNeuMuonHon > 0 && kg.DenMuonCP >= kg.KhongTinhCongNeuMuonHon) 
                return `${label} Thời gian cho phép đến muộn phải nhỏ hơn Thời gian không tính công`;
            if (kg.KhongTinhCongNeuSomHon > 0 && kg.VeSomCP >= kg.KhongTinhCongNeuSomHon) 
                return `${label} Thời gian cho phép về sớm phải nhỏ hơn Thời gian không tính công`;

            previousSlotLatestOutAbs = lateOutAbs !== null ? lateOutAbs : endAbs;
            currentDayOffset = Math.floor(endAbs / 1440);
        }
        
        if (payload.NghiTrua) {
            const breakStart = toMin(payload.NghiTrua.BatDau);
            const breakEnd = toMin(payload.NghiTrua.KetThuc);
            if (breakStart === null || breakEnd === null) return "Vui lòng nhập đầy đủ giờ nghỉ trưa";
            
            const kg = payload.ChiTietKhungGio[0];
            let workStart = toMin(kg.GioBatDau);
            let workEnd = toMin(kg. GioKetThuc);
            if (workEnd <= workStart) workEnd += 1440;

            let bs = breakStart;
            let be = breakEnd;
            if (be <= bs) be += 1440;
            if (bs < workStart) { bs += 1440; be += 1440; }

            if (bs < workStart || be > workEnd) return "Thời gian nghỉ trưa phải nằm trong khoảng thời gian làm việc của ca";
            if (be <= bs) return "Giờ kết thúc nghỉ trưa phải lớn hơn giờ bắt đầu";
        }

        return null;
    }

    // ============================================================
    fillData(data) {
        const setVal = (name, val) => {
            const el = this.form.querySelector(`[name="${name}"]`);
            if (el) { el.value = val !== null && val !== undefined ? val : ''; el.dispatchEvent(new Event('input')); }
        };
        
        setVal('tencalamviec', data.TenCa);
        setVal('macalamviec', data.MaCa);
        setVal('congcuaca', data.TongCong);
        
        const codeInput = this.form.querySelector('input[name="macalamviec"]');
        if (codeInput) {
            codeInput.readOnly = true;
            codeInput.classList.add('bg-slate-100', 'cursor-not-allowed', 'text-slate-500');
        }

        const chkCheckout = this.form.querySelector('[name="khongcancheckout"]');
        if (chkCheckout) chkCheckout.checked = data. KhongCanCheckout;

        const typeRadio = this.form.querySelector(`input[name="loaichamcong"][value="${data.LoaiCa}"]`);
        if (typeRadio) { 
            typeRadio.checked = true; 
            this.switchBlock(data.LoaiCa);  // ✅ Sử dụng base method
        }

        if (data. LoaiCa === 'CO_DINH') {
            const count = (data.ChiTietKhungGio && data.ChiTietKhungGio.length > 0) ? data.ChiTietKhungGio.length : 1;
            const countRadio = this.form.querySelector(`input[name="sokhunggio"][value="${count}"]`);
            if (countRadio) countRadio.checked = true;

            this.renderFixedSegments(count);
            this. renderTimekeepingOptions(count);
            this.checkLunchBreakVisibility();

            const soLan = data.SoLanChamCong || 1;
            const radioSoLan = this.form.querySelector(`input[name="solanchamcong"][value="${soLan}"]`);
            if (radioSoLan) radioSoLan.checked = true;

            if (data.ChiTietKhungGio) {
                data.ChiTietKhungGio.forEach((kg, idx) => {
                    const i = idx + 1;
                    setVal(`segment_${i}_start`, kg.GioBatDau);
                    setVal(`segment_${i}_end`, kg.GioKetThuc);
                    setVal(`segment_${i}_workday`, kg. Cong);
                    setVal(`segment_${i}_late_grace`, kg.DenMuonCP);
                    setVal(`segment_${i}_late_cutoff`, kg.KhongTinhCongNeuMuonHon);
                    setVal(`segment_${i}_early_in`, kg.CheckInSomNhat);
                    setVal(`segment_${i}_early_out_grace`, kg.VeSomCP);
                    setVal(`segment_${i}_early_cutoff`, kg.KhongTinhCongNeuSomHon);
                    setVal(`segment_${i}_late_out`, kg.CheckOutMuonNhat);
                });
            }
            
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
        else if (data. LoaiCa === 'LINH_DONG' && data.ChiTietKhungGio. length > 0) {
            const kg = data.ChiTietKhungGio[0];
            setVal('ld_batdau', kg. GioBatDau); setVal('ld_ketthuc', kg.GioKetThuc);
            setVal('ld_late_cutoff', kg.KhongTinhCongNeuMuonHon);
            setVal('ld_early_in', kg.CheckInSomNhat);
            setVal('ld_early_cutoff', kg.KhongTinhCongNeuSomHon);
            setVal('ld_late_out', kg. CheckOutMuonNhat);
            setVal('ld_flex_late', kg.LinhDongDenMuon); setVal('ld_flex_early', kg.LinhDongVeSom);
            if (data.NghiTrua) {
                const ldLunchCheck = document.getElementById('ld-has-lunch-break');
                if (ldLunchCheck) {
                    ldLunchCheck.checked = true;
                    document.getElementById('ld-lunch-time-inputs').classList.remove('hidden');
                    setVal('ld_batdaunghi', data.NghiTrua.BatDau); setVal('ld_ketthucnghi', data.NghiTrua.KetThuc);
                }
            }
        }
        else if (data.LoaiCa === 'TU_DO' && data.ChiTietKhungGio.length > 0) {
            const kg = data.ChiTietKhungGio[0];
            setVal('td_batdau', kg.GioBatDau); setVal('td_ketthuc', kg.GioKetThuc);
            setVal('thoigianlamviectoithieu', kg.MinPhutLamViec);
            const todoCheck = document.getElementById('toggle-yeucau');
            if (todoCheck) { todoCheck.checked = kg.YeuCauChamCong; this.checkTuDoVisibility(); }
        }

        this.timePicker.attachAll();
        this.calculateTotalWorkTime();
        this.updateNextDayBadges();
        
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