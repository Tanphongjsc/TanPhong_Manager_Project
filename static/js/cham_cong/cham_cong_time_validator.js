/**
 * ChamCongTimeValidator - Module xử lý ràng buộc giờ vào/ra cho Bảng Chấm Công
 * Tối ưu: Sử dụng AppUtils.TimeUtils
 */

// Bộ kiểm tra ràng buộc giờ vào/ra cho chấm công
class ChamCongTimeValidator {
    constructor() {
        // Các loại vi phạm
        this.VIOLATION_TYPES = {
            CHECK_IN_TOO_EARLY: 'check_in_too_early',
            CHECK_IN_TOO_LATE: 'check_in_too_late',
            CHECK_OUT_TOO_EARLY: 'check_out_too_early',
            CHECK_OUT_TOO_LATE: 'check_out_too_late',
            MISSING_CHECK_IN: 'missing_check_in',
            MISSING_CHECK_OUT: 'missing_check_out',
            INVALID_TIME_FORMAT: 'invalid_time_format'
        };
        // Nhãn mô tả vi phạm
        this.VIOLATION_LABELS = {
            check_in_too_early: 'Vào ca quá sớm',
            check_in_too_late: 'Vào ca quá muộn',
            check_out_too_early: 'Ra ca quá sớm',
            check_out_too_late: 'Ra ca quá muộn',
            missing_check_in: 'Thiếu giờ vào',
            missing_check_out: 'Thiếu giờ ra',
            invalid_time_format: 'Định dạng giờ không hợp lệ'
        };
    }

    // Chuyển chuỗi giờ (HH:mm hoặc HH:mm:ss+00) thành số phút
    toMinutes(timeStr) {
        if (!timeStr || typeof timeStr !== 'string') return null;
        return AppUtils.TimeUtils.toMinutes(timeStr.substring(0, 5));
    }

    // Chuyển số phút thành chuỗi HH:mm
    toTimeString(minutes) {
        if (minutes === null || minutes === undefined) return '--:--';
        const normalized = ((minutes % 1440) + 1440) % 1440;
        return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
    }

    // Parse giá trị số phút (dùng cho các trường như thoigianchophepdenmuon: 0, 15, 30...)
    _parseMinutesValue(value) {
        if (value === null || value === undefined || value === '') return null;
        const num = parseInt(value, 10);
        return isNaN(num) ? null : num;
    }

    /**
     * Chuẩn hóa khung giờ làm việc từ API
     * @param {Object} kglv - Dữ liệu khung giờ làm việc từ API
     * @returns {Object|null} - Schedule object đã chuẩn hóa
     */
    normalizeSchedule(kglv) {
        if (!kglv) return null;
        
        // === THỜI GIAN CƠ BẢN ===
        const startTime = this.toMinutes(kglv.thoigianbatdau);           // 13:00 = 780
        const endTime = this.toMinutes(kglv.thoigianketthuc);             // 17:00 = 1020
        
        // === RÀNG BUỘC GIỜ VÀO ===
        // Giờ chấm công sớm nhất (dạng thời gian "12:00:00+00")
        const earliestCheckIn = this.toMinutes(kglv.thoigianchophepchamcongsomnhat); // 12:00 = 720
        // Grace period cho phép đến muộn (số phút: 0, 15, 20...)
        const lateGraceMinutes = this._parseMinutesValue(kglv.thoigianchophepdenmuon); // 20
        // Ngưỡng đi muộn không tính công (số phút)
        const invalidLateInMinutes = this._parseMinutesValue(kglv.thoigiandimuonkhongtinhchamcong); // 60
        
        // === RÀNG BUỘC GIỜ RA ===
        // Giờ về muộn nhất cho phép (dạng thời gian "18:00:00+00")
        const latestCheckOut = this.toMinutes(kglv.thoigianchophepvemuonnhat); // 18:00 = 1080
        // Grace period cho phép về sớm (số phút)
        const earlyGraceMinutes = this._parseMinutesValue(kglv.thoigianchophepvesomnhat); // 45
        // Ngưỡng về sớm không tính công (số phút)
        const invalidEarlyOutMinutes = this._parseMinutesValue(kglv.thoigianvesomkhongtinhchamcong); // 120
        
        // Tính số phút được phép về muộn so với giờ kết thúc ca
        let allowedLateOutMinutes = null;
        if (latestCheckOut !== null && endTime !== null) {
            allowedLateOutMinutes = latestCheckOut - endTime; // 1080 - 1020 = 60
            if (allowedLateOutMinutes < 0) allowedLateOutMinutes = 0;
        }
        
        return {
            // Thời gian cơ bản
            startTime,                    // Giờ bắt đầu ca (phút trong ngày)
            endTime,                      // Giờ kết thúc ca (phút trong ngày)
            
            // Ràng buộc giờ vào
            earliestCheckIn,              // Giờ chấm công sớm nhất (phút trong ngày)
            lateGraceMinutes,             // Grace period đi muộn (số phút) - TRONG KHOẢNG NÀY = OK
            invalidLateInMinutes,         // Đi muộn quá mức này = không tính công
            
            // Ràng buộc giờ ra
            latestCheckOut,               // Giờ về muộn nhất (phút trong ngày)
            earlyGraceMinutes,            // Grace period về sớm (số phút) - TRONG KHOẢNG NÀY = OK
            invalidEarlyOutMinutes,       // Về sớm quá mức này = không tính công
            allowedLateOutMinutes,        // Số phút được về muộn hơn giờ kết thúc
            
            raw: kglv
        };
    }

    // Kiểm tra giờ vào/ra bắt buộc (missing check-in/out)
    validateMissingCheckTimes({ checkIn, checkOut, employee }) {
        const violations = [];
        
        if (!checkIn) {
            violations.push(this._createViolation(this.VIOLATION_TYPES.MISSING_CHECK_IN, employee, {}));
        }
        if (!checkOut) {
            violations.push(this._createViolation(this.VIOLATION_TYPES.MISSING_CHECK_OUT, employee, {}));
        }
        
        return violations;
    }

    /**
     * Kiểm tra giờ vào/ra của 1 nhân viên, trả về danh sách vi phạm
     * Logic mới: Tính toán dựa trên grace period
     */
    validate({ checkIn, checkOut, schedule, employee }) {
        const violations = [];
        if (!schedule) return { isValid: true, violations: [] };

        const inMin = this.toMinutes(checkIn);
        const outMin = this.toMinutes(checkOut);

        // === KIỂM TRA GIỜ VÀO ===
        if (checkIn) {
            if (inMin === null) {
                violations.push(this._createViolation(this.VIOLATION_TYPES.INVALID_TIME_FORMAT, employee, { field: 'checkIn', value: checkIn }));
            } else {
                // 1. Vào quá sớm (trước giờ cho phép chấm công)
                if (schedule.earliestCheckIn !== null && inMin < schedule.earliestCheckIn) {
                    const early = schedule.earliestCheckIn - inMin;
                    violations.push(this._createViolation(this.VIOLATION_TYPES.CHECK_IN_TOO_EARLY, employee, {
                        value: checkIn,
                        limit: this.toTimeString(schedule.earliestCheckIn),
                        diff: early,
                        suggestion: this.toTimeString(schedule.earliestCheckIn)
                    }));
                }
                
                // 2. Đi muộn quá ngưỡng không tính công
                if (schedule.startTime !== null && schedule.invalidLateInMinutes !== null) {
                    const lateFromStart = inMin - schedule.startTime;
                    // Chỉ vi phạm nếu muộn vượt quá ngưỡng invalidLateInMinutes
                    if (lateFromStart > schedule.invalidLateInMinutes) {
                        // Tính số phút muộn thực tế (đã trừ grace period nếu có)
                        const effectiveLate = schedule.lateGraceMinutes !== null 
                            ? lateFromStart - schedule.lateGraceMinutes 
                            : lateFromStart;
                        
                        violations.push(this._createViolation(this.VIOLATION_TYPES.CHECK_IN_TOO_LATE, employee, {
                            value: checkIn,
                            scheduleStart: this.toTimeString(schedule.startTime),
                            limit: schedule.invalidLateInMinutes,
                            diff: effectiveLate > 0 ? effectiveLate : lateFromStart,
                            rawLate: lateFromStart,
                            graceMinutes: schedule.lateGraceMinutes,
                            suggestion: this.toTimeString(schedule.startTime + schedule.invalidLateInMinutes),
                            note: `Đi muộn ${effectiveLate > 0 ? effectiveLate : lateFromStart}p (vượt ngưỡng ${schedule.invalidLateInMinutes}p)`
                        }));
                    }
                }
            }
        }

        // === KIỂM TRA GIỜ RA ===
        if (checkOut) {
            if (outMin === null) {
                violations.push(this._createViolation(this.VIOLATION_TYPES.INVALID_TIME_FORMAT, employee, { field: 'checkOut', value: checkOut }));
            } else {
                // 1. Về sớm quá ngưỡng không tính công
                if (schedule.endTime !== null && schedule.invalidEarlyOutMinutes !== null) {
                    const earlyFromEnd = schedule.endTime - outMin;
                    // Chỉ vi phạm nếu về sớm vượt quá ngưỡng invalidEarlyOutMinutes
                    if (earlyFromEnd > schedule.invalidEarlyOutMinutes) {
                        // Tính số phút về sớm thực tế (đã trừ grace period nếu có)
                        const effectiveEarly = schedule.earlyGraceMinutes !== null 
                            ? earlyFromEnd - schedule.earlyGraceMinutes 
                            : earlyFromEnd;
                        
                        violations.push(this._createViolation(this.VIOLATION_TYPES.CHECK_OUT_TOO_EARLY, employee, {
                            value: checkOut,
                            scheduleEnd: this.toTimeString(schedule.endTime),
                            limit: schedule.invalidEarlyOutMinutes,
                            diff: effectiveEarly > 0 ? effectiveEarly : earlyFromEnd,
                            rawEarly: earlyFromEnd,
                            graceMinutes: schedule.earlyGraceMinutes,
                            suggestion: this.toTimeString(schedule.endTime - schedule.invalidEarlyOutMinutes),
                            note: `Về sớm ${effectiveEarly > 0 ? effectiveEarly : earlyFromEnd}p (vượt ngưỡng ${schedule.invalidEarlyOutMinutes}p)`
                        }));
                    }
                }
                
                // 2. Về quá muộn (sau giờ về muộn nhất cho phép)
                if (schedule.latestCheckOut !== null && outMin > schedule.latestCheckOut) {
                    const exceed = outMin - schedule.latestCheckOut;
                    violations.push(this._createViolation(this.VIOLATION_TYPES.CHECK_OUT_TOO_LATE, employee, {
                        value: checkOut,
                        scheduleEnd: this.toTimeString(schedule.endTime),
                        latestAllowed: this.toTimeString(schedule.latestCheckOut),
                        diff: exceed,
                        suggestion: this.toTimeString(schedule.latestCheckOut),
                        note: `Về muộn ${exceed}p (sau ${this.toTimeString(schedule.latestCheckOut)})`
                    }));
                }
            }
        }

        return { isValid: violations.length === 0, violations };
    }

    // Validate toàn bộ danh sách chấm công, trả về tổng hợp vi phạm
    validateAll(records) {
        let validCount = 0, invalidCount = 0;
        const allViolations = [];
        records.forEach((record, index) => {
            const schedule = this.normalizeSchedule(record.employee?.khunggiolamviec);
            
            // Kiểm tra missing check-in/out trước
            const missingViolations = this.validateMissingCheckTimes({
                checkIn: record.checkIn,
                checkOut: record.checkOut,
                employee: { ...record.employee, rowIndex: index }
            });
            allViolations.push(...missingViolations);
            
            // Kiểm tra time constraints nếu có dữ liệu
            const result = this.validate({
                checkIn: record.checkIn,
                checkOut: record.checkOut,
                schedule,
                employee: { ...record.employee, rowIndex: index }
            });
            result.isValid && missingViolations.length === 0 ? validCount++ : invalidCount++;
            allViolations.push(...result.violations);
        });
        return {
            isValid: allViolations.length === 0,
            validCount,
            invalidCount,
            violations: allViolations,
            summary: this._generateSummary(allViolations)
        };
    }

    /**
     * Lấy chi tiết phân tích giờ cho 1 nhân viên (tái sử dụng cho cột phân tích)
     * Logic mới: Hiển thị đúng số phút muộn/sớm sau khi trừ grace period
     */
    getAnalysisDetails({ checkIn, checkOut, schedule, employee }) {
        const analysis = { violations: [], warnings: [], info: [], isValid: true };
        if (!schedule) return analysis;

        const addViolation = (type, label) => {
            analysis.violations.push({ type, label });
            analysis.isValid = false;
        };
        const addWarning = (label, info) => analysis.warnings.push({ label, info });
        const addInfo = (label) => analysis.info.push({ label });

        // Missing times
        if (!checkIn) addViolation('missing_in', 'Thiếu giờ vào');
        if (!checkOut) addViolation('missing_out', 'Thiếu giờ ra');
        if (!checkIn || !checkOut) return analysis;

        const inMin = this.toMinutes(checkIn);
        const outMin = this.toMinutes(checkOut);

        // === CHECK GIỜ VÀO ===
        if (inMin !== null && schedule.startTime !== null) {
            // 1. Vào sớm hơn giờ cho phép chấm công (violation)
            if (schedule.earliestCheckIn !== null && inMin < schedule.earliestCheckIn) {
                const early = schedule.earliestCheckIn - inMin;
                addViolation('check_in_too_early', `Vào sớm ${early}p (trước ${this.toTimeString(schedule.earliestCheckIn)})`);
            }
            // 2. Kiểm tra đi muộn
            else {
                const lateFromStart = inMin - schedule.startTime;
                
                if (lateFromStart > 0) {
                    const graceMinutes = schedule.lateGraceMinutes || 0;
                    const invalidThreshold = schedule.invalidLateInMinutes;
                    
                    // Tính số phút muộn thực tế (sau khi trừ grace period)
                    const effectiveLate = Math.max(0, lateFromStart - graceMinutes);
                    
                    // Vi phạm: Muộn vượt ngưỡng không tính công
                    if (invalidThreshold !== null && lateFromStart > invalidThreshold) {
                        addViolation('check_in_too_late', `Muộn ${effectiveLate}p (vượt ${invalidThreshold}p)`);
                    }
                    // Warning: Muộn vượt grace period nhưng chưa vượt ngưỡng vi phạm
                    else if (effectiveLate > 0) {
                        addWarning(`Muộn ${effectiveLate}p`, graceMinutes > 0 ? `Cho phép: ${graceMinutes}p` : null);
                    }
                    // Info: Muộn trong grace period (không bị phạt)
                    else if (lateFromStart > 0 && lateFromStart <= graceMinutes) {
                        // Không hiển thị gì - trong grace period = OK
                    }
                }
            }
        }

        // === CHECK GIỜ RA ===
        if (outMin !== null && schedule.endTime !== null) {
            const earlyFromEnd = schedule.endTime - outMin;
            const lateFromEnd = outMin - schedule.endTime;
            
            // 1. Về sớm
            if (earlyFromEnd > 0) {
                const graceMinutes = schedule.earlyGraceMinutes || 0;
                const invalidThreshold = schedule.invalidEarlyOutMinutes;
                
                // Tính số phút về sớm thực tế (sau khi trừ grace period)
                const effectiveEarly = Math.max(0, earlyFromEnd - graceMinutes);
                
                // Vi phạm: Về sớm vượt ngưỡng không tính công
                if (invalidThreshold !== null && earlyFromEnd > invalidThreshold) {
                    addViolation('check_out_too_early', `Về sớm ${effectiveEarly}p (vượt ${invalidThreshold}p)`);
                }
                // Warning: Về sớm vượt grace period nhưng chưa vượt ngưỡng vi phạm
                else if (effectiveEarly > 0) {
                    addWarning(`Về sớm ${effectiveEarly}p`, graceMinutes > 0 ? `Cho phép: ${graceMinutes}p` : null);
                }
                // Trong grace period = OK, không hiển thị
            }
            
            // 2. Về muộn
            if (lateFromEnd > 0) {
                // Vi phạm: Về quá giờ muộn nhất cho phép
                if (schedule.latestCheckOut !== null && outMin > schedule.latestCheckOut) {
                    const exceed = outMin - schedule.latestCheckOut;
                    addViolation('check_out_too_late', `Về muộn ${exceed}p (sau ${this.toTimeString(schedule.latestCheckOut)})`);
                }
                // Info: Về muộn trong khung cho phép
                else if (schedule.allowedLateOutMinutes !== null && lateFromEnd <= schedule.allowedLateOutMinutes) {
                    addInfo(`Về muộn ${lateFromEnd}p (OK)`);
                }
            }
        }

        // Status OK - chỉ hiển thị nếu không có vi phạm và warning
        if (analysis.violations.length === 0 && analysis.warnings.length === 0 && analysis.info.length === 0) {
            addInfo('✓ Đúng giờ');
        }

        return analysis;
    }

    _createViolation(type, employee, details) {
        return {
            type,
            label: this.VIOLATION_LABELS[type] || type,
            employee: {
                id: employee?.id,
                name: employee?.hovaten || 'N/A',
                code: employee?.manhanvien || '',
                rowIndex: employee?.rowIndex
            },
            details,
            timestamp: new Date().toISOString()
        };
    }

    // Tổng hợp số lượng vi phạm theo loại
    _generateSummary(violations) {
        return violations.reduce((acc, v) => {
            if (!acc[v.type]) acc[v.type] = { label: v.label, count: 0 };
            acc[v.type].count++;
            return acc;
        }, {});
    }

    /**
     * Gợi ý khung giờ vào/ra hợp lệ dựa trên ca làm việc
     * Cập nhật: Tính toán chính xác dựa trên grace period và thresholds
     */
    getSuggestedTimes(schedule) {
        if (!schedule) return { checkIn: null, checkOut: null };
        const s = schedule;
        
        // Giờ vào: từ earliestCheckIn đến (startTime + invalidLateInMinutes)
        const checkInEarliest = s.earliestCheckIn !== null 
            ? this.toTimeString(s.earliestCheckIn) 
            : this.toTimeString(s.startTime);
        
        const checkInLatest = s.invalidLateInMinutes !== null && s.startTime !== null
            ? this.toTimeString(s.startTime + s.invalidLateInMinutes)
            : (s.lateGraceMinutes !== null && s.startTime !== null 
                ? this.toTimeString(s.startTime + s.lateGraceMinutes) 
                : null);
        
        // Giờ ra: từ (endTime - invalidEarlyOutMinutes) đến latestCheckOut
        const checkOutEarliest = s.invalidEarlyOutMinutes !== null && s.endTime !== null
            ? this.toTimeString(s.endTime - s.invalidEarlyOutMinutes)
            : (s.earlyGraceMinutes !== null && s.endTime !== null
                ? this.toTimeString(s.endTime - s.earlyGraceMinutes)
                : this.toTimeString(s.endTime));
        
        const checkOutLatest = s.latestCheckOut !== null
            ? this.toTimeString(s.latestCheckOut)
            : (s.allowedLateOutMinutes !== null && s.endTime !== null
                ? this.toTimeString(s.endTime + s.allowedLateOutMinutes)
                : null);
        
        return {
            checkIn: {
                earliest: checkInEarliest,
                latest: checkInLatest,
                recommended: this.toTimeString(s.startTime),
                graceEnd: s.lateGraceMinutes !== null && s.startTime !== null 
                    ? this.toTimeString(s.startTime + s.lateGraceMinutes) 
                    : null
            },
            checkOut: {
                earliest: checkOutEarliest,
                latest: checkOutLatest,
                recommended: this.toTimeString(s.endTime),
                graceStart: s.earlyGraceMinutes !== null && s.endTime !== null
                    ? this.toTimeString(s.endTime - s.earlyGraceMinutes)
                    : null
            }
        };
    }

    // Render HTML cho modal vi phạm giờ vào/ra
    renderViolationsModal(validationResult, employees = []) {
        const { violations, invalidCount } = validationResult;
        // Gom nhóm vi phạm theo nhân viên
        const byEmployee = {};
        violations.forEach(v => {
            const key = v.employee.id;
            if (!byEmployee[key]) {
                const empData = employees.find(e => e.id === v.employee.id);
                const schedule = empData ? this.normalizeSchedule(empData.khunggiolamviec) : null;
                byEmployee[key] = {
                    employee: v.employee,
                    schedule,
                    suggested: this.getSuggestedTimes(schedule),
                    violations: [],
                    checkInValue: null,
                    checkOutValue: null
                };
            }
            byEmployee[key].violations.push(v);
            if (v.type.includes('check_in') || v.type === 'missing_check_in') {
                byEmployee[key].checkInValue = v.details?.value || null;
            }
            if (v.type.includes('check_out') || v.type === 'missing_check_out') {
                byEmployee[key].checkOutValue = v.details?.value || null;
            }
        });

        const rowsHtml = Object.values(byEmployee).map((g, idx) => {
            const { employee, suggested, violations: empVio, checkInValue, checkOutValue } = g;
            const hasInErr = empVio.some(v => v.type.includes('check_in') || v.type === 'missing_check_in');
            const hasOutErr = empVio.some(v => v.type.includes('check_out') || v.type === 'missing_check_out');
            
            // Thông báo lỗi ngắn gọn - hiển thị số phút đã trừ grace
            const errMsgs = empVio.map(v => {
                const d = v.details?.diff || 0;
                if (v.type === 'check_in_too_early') return `Vào sớm ${d}p`;
                if (v.type === 'check_in_too_late') return `Muộn ${d}p`;
                if (v.type === 'check_out_too_early') return `Về sớm ${d}p`;
                if (v.type === 'check_out_too_late') return `Về muộn ${d}p`;
                if (v.type === 'missing_check_in') return 'Thiếu vào';
                if (v.type === 'missing_check_out') return 'Thiếu ra';
                return v.label;
            });
            
            // Hiển thị khung giờ cho phép
            const inRange = suggested?.checkIn 
                ? `${suggested.checkIn.earliest || '--:--'} → ${suggested.checkIn.latest || suggested.checkIn.recommended || '--:--'}` 
                : '--:--';
            const outRange = suggested?.checkOut
                ? `${suggested.checkOut.earliest || suggested.checkOut.recommended || '--:--'} → ${suggested.checkOut.latest || '--:--'}`
                : '--:--';
            
            return `
                <tr class="border-b border-slate-100 hover:bg-slate-50/50">
                    <td class="py-2.5 px-3">
                        <div class="flex items-center gap-2">
                            <span class="w-5 h-5 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-[10px] font-bold shrink-0">${idx + 1}</span>
                            <div>
                                <div class="font-semibold text-slate-800 text-sm">${employee.name}</div>
                                <div class="text-[11px] text-slate-400">${employee.code}</div>
                            </div>
                        </div>
                    </td>
                    <td class="py-2.5 px-2 text-center">
                        <div class="font-mono text-sm ${hasInErr ? 'text-red-600 font-bold' : 'text-slate-600'}">${checkInValue || '--:--'}</div>
                        ${hasInErr ? `<div class="text-[10px] text-red-500 mt-0.5">${errMsgs.filter(m => m.includes('Vào') || m.includes('Muộn') || m.includes('vào')).join(', ')}</div>` : ''}
                    </td>
                    <td class="py-2.5 px-2 text-center">
                        <div class="font-mono text-sm ${hasOutErr ? 'text-red-600 font-bold' : 'text-slate-600'}">${checkOutValue || '--:--'}</div>
                        ${hasOutErr ? `<div class="text-[10px] text-red-500 mt-0.5">${errMsgs.filter(m => m.includes('Về') || m.includes('ra')).join(', ')}</div>` : ''}
                    </td>
                    <td class="py-2.5 px-2 text-center">
                        <div class="text-[11px] text-slate-500 font-mono">${suggested?.checkIn?.recommended || '--:--'}</div>
                    </td>
                    <td class="py-2.5 px-2 text-center">
                        <div class="text-[11px] text-slate-500 font-mono">${suggested?.checkOut?.recommended || '--:--'}</div>
                    </td>
                    <td class="py-2.5 px-2">
                        <div class="flex flex-col gap-1">
                            ${hasInErr ? `<div class="flex items-center gap-1.5 text-[11px]"><span class="text-slate-400 w-10">Vào:</span><span class="font-mono text-emerald-600 font-semibold bg-emerald-50 px-1.5 py-0.5 rounded">${inRange}</span></div>` : ''}
                            ${hasOutErr ? `<div class="flex items-center gap-1.5 text-[11px]"><span class="text-slate-400 w-10">Ra:</span><span class="font-mono text-emerald-600 font-semibold bg-emerald-50 px-1.5 py-0.5 rounded">${outRange}</span></div>` : ''}
                        </div>
                    </td>
                </tr>`;
        }).join('');

        return `
            <div class="violations-modal-content">
                <div class="flex items-center gap-3 mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <div class="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                        <i class="fa-solid fa-clock text-amber-600"></i>
                    </div>
                    <div class="flex-1">
                        <div class="font-semibold text-amber-800">Phát hiện ${violations.length} lỗi từ ${invalidCount} nhân viên</div>
                        <div class="text-xs text-amber-600 mt-0.5">Vui lòng kiểm tra giờ chấm công</div>
                    </div>
                </div>
                <div class="flex items-center gap-4 mb-3 text-[11px] text-slate-500">
                    <div class="flex items-center gap-1"><span class="w-3 h-3 rounded bg-red-100 border border-red-300"></span><span>Giờ không hợp lệ</span></div>
                    <div class="flex items-center gap-1"><span class="w-3 h-3 rounded bg-emerald-100 border border-emerald-300"></span><span>Khung giờ cho phép</span></div>
                </div>
                <div class="border border-slate-200 rounded-lg overflow-hidden">
                    <table class="w-full text-sm">
                        <thead class="bg-slate-50 border-b border-slate-200">
                            <tr>
                                <th class="py-2 px-3 text-left text-xs font-semibold text-slate-600 uppercase">Nhân viên</th>
                                <th class="py-2 px-2 text-center text-xs font-semibold text-slate-600 uppercase w-20">Giờ vào</th>
                                <th class="py-2 px-2 text-center text-xs font-semibold text-slate-600 uppercase w-20">Giờ ra</th>
                                <th class="py-2 px-2 text-center text-xs font-semibold text-slate-600 uppercase w-16">Chuẩn vào</th>
                                <th class="py-2 px-2 text-center text-xs font-semibold text-slate-600 uppercase w-16">Chuẩn ra</th>
                                <th class="py-2 px-2 text-left text-xs font-semibold text-slate-600 uppercase">Khung giờ cho phép</th>
                            </tr>
                        </thead>
                        <tbody>${rowsHtml}</tbody>
                    </table>
                </div>
                <div class="mt-3 text-[11px] text-slate-400 flex items-start gap-1.5">
                    <i class="fa-solid fa-info-circle mt-0.5"></i>
                    <span>Giờ cho phép được tính dựa trên khung giờ làm việc của từng nhân viên. Thời gian muộn/sớm đã trừ thời gian grace period.</span>
                </div>
            </div>`;
    }
}

// Export singleton
window.ChamCongTimeValidator = new ChamCongTimeValidator();