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


    // Chuyển chuỗi giờ (HH:mm) thành số phút
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

    // Parse số phút từ API (có thể null)
    _parseMinutes(value) {
        if (value === null || value === undefined) return null;
        const num = parseInt(value, 10);
        return isNaN(num) ? null : num;
    }

    // Chuẩn hóa khung giờ làm việc từ API
    normalizeSchedule(kglv) {
        if (!kglv) return null;
        return {
            startTime: this.toMinutes(kglv.thoigianbatdau),
            endTime: this.toMinutes(kglv.thoigianketthuc),
            allowedLateMinutes: this._parseMinutes(kglv.thoigianchophepdenmuon),
            allowedEarlyOutMinutes: this._parseMinutes(kglv.thoigianchophepvesomnhat),
            allowedLateOutMinutes: this._parseMinutes(kglv.thoigianchophepvemuonnhat),
            earliestCheckIn: this.toMinutes(kglv.thoigianchophepchamcongsomnhat),
            invalidEarlyOutMinutes: this._parseMinutes(kglv.thoigianvesomkhongtinhchamcong),
            invalidLateInMinutes: this._parseMinutes(kglv.thoigiandimuonkhongtinhchamcong),
            raw: kglv
        };
    }

    // Kiểm tra giờ vào/ra của 1 nhân viên, trả về danh sách vi phạm
    validate({ checkIn, checkOut, schedule, employee }) {
        const violations = [];
        if (!schedule) return { isValid: true, violations: [] };

        const inMin = this.toMinutes(checkIn);
        const outMin = this.toMinutes(checkOut);

        // Kiểm tra giờ vào
        if (checkIn) {
            if (inMin === null) {
                violations.push(this._createViolation(this.VIOLATION_TYPES.INVALID_TIME_FORMAT, employee, { field: 'checkIn', value: checkIn }));
            } else {
                // Vào ca quá sớm
                if (schedule.earliestCheckIn !== null && inMin < schedule.earliestCheckIn) {
                    violations.push(this._createViolation(this.VIOLATION_TYPES.CHECK_IN_TOO_EARLY, employee, {
                        value: checkIn,
                        limit: this.toTimeString(schedule.earliestCheckIn),
                        diff: schedule.earliestCheckIn - inMin,
                        suggestion: this.toTimeString(schedule.earliestCheckIn)
                    }));
                }
                // Đi muộn vượt quá cho phép
                if (schedule.startTime !== null && schedule.invalidLateInMinutes !== null) {
                    const late = inMin - schedule.startTime;
                    if (late > schedule.invalidLateInMinutes) {
                        violations.push(this._createViolation(this.VIOLATION_TYPES.CHECK_IN_TOO_LATE, employee, {
                            value: checkIn,
                            scheduleStart: this.toTimeString(schedule.startTime),
                            limit: schedule.invalidLateInMinutes,
                            diff: late,
                            suggestion: this.toTimeString(schedule.startTime + schedule.invalidLateInMinutes),
                            note: `Đi muộn ${late} phút (vượt quá ${schedule.invalidLateInMinutes} phút)`
                        }));
                    }
                }
            }
        }

        // Kiểm tra giờ ra
        if (checkOut) {
            if (outMin === null) {
                violations.push(this._createViolation(this.VIOLATION_TYPES.INVALID_TIME_FORMAT, employee, { field: 'checkOut', value: checkOut }));
            } else {
                // Ra ca quá sớm
                if (schedule.endTime !== null && schedule.invalidEarlyOutMinutes !== null) {
                    const early = schedule.endTime - outMin;
                    if (early > schedule.invalidEarlyOutMinutes) {
                        violations.push(this._createViolation(this.VIOLATION_TYPES.CHECK_OUT_TOO_EARLY, employee, {
                            value: checkOut,
                            scheduleEnd: this.toTimeString(schedule.endTime),
                            limit: schedule.invalidEarlyOutMinutes,
                            diff: early,
                            suggestion: this.toTimeString(schedule.endTime - schedule.invalidEarlyOutMinutes),
                            note: `Về sớm ${early} phút (vượt quá ${schedule.invalidEarlyOutMinutes} phút)`
                        }));
                    }
                }
                // Ra ca quá muộn
                if (schedule.endTime !== null && schedule.allowedLateOutMinutes !== null) {
                    const lateOut = outMin - schedule.endTime;
                    if (lateOut > schedule.allowedLateOutMinutes) {
                        violations.push(this._createViolation(this.VIOLATION_TYPES.CHECK_OUT_TOO_LATE, employee, {
                            value: checkOut,
                            scheduleEnd: this.toTimeString(schedule.endTime),
                            limit: schedule.allowedLateOutMinutes,
                            diff: lateOut,
                            suggestion: this.toTimeString(schedule.endTime + schedule.allowedLateOutMinutes),
                            note: `Về muộn ${lateOut} phút (vượt quá ${schedule.allowedLateOutMinutes} phút)`
                        }));
                    }
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
            const result = this.validate({
                checkIn: record.checkIn,
                checkOut: record.checkOut,
                schedule,
                employee: { ...record.employee, rowIndex: index }
            });
            result.isValid ? validCount++ : invalidCount++;
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

    // Tạo object mô tả 1 vi phạm
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

    // Gợi ý khung giờ vào/ra hợp lệ dựa trên ca làm việc
    getSuggestedTimes(schedule) {
        if (!schedule) return { checkIn: null, checkOut: null };
        const s = schedule;
        return {
            checkIn: {
                earliest: s.earliestCheckIn !== null ? this.toTimeString(s.earliestCheckIn) : this.toTimeString(s.startTime),
                latest: s.invalidLateInMinutes !== null && s.startTime !== null
                    ? this.toTimeString(s.startTime + s.invalidLateInMinutes) : null,
                recommended: this.toTimeString(s.startTime)
            },
            checkOut: {
                earliest: s.invalidEarlyOutMinutes !== null && s.endTime !== null
                    ? this.toTimeString(s.endTime - s.invalidEarlyOutMinutes) : this.toTimeString(s.endTime),
                latest: s.allowedLateOutMinutes !== null && s.endTime !== null
                    ? this.toTimeString(s.endTime + s.allowedLateOutMinutes) : null,
                recommended: this.toTimeString(s.endTime)
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
            if (v.type.includes('check_in')) byEmployee[key].checkInValue = v.details.value;
            else if (v.type.includes('check_out')) byEmployee[key].checkOutValue = v.details.value;
        });

        const rowsHtml = Object.values(byEmployee).map((g, idx) => {
            const { employee, suggested, violations: empVio, checkInValue, checkOutValue } = g;
            const hasInErr = empVio.some(v => v.type.includes('check_in'));
            const hasOutErr = empVio.some(v => v.type.includes('check_out'));
            // Thông báo lỗi ngắn gọn
            const errMsgs = empVio.map(v => {
                const d = v.details.diff || 0;
                if (v.type === 'check_in_too_early') return `Vào sớm ${d}p`;
                if (v.type === 'check_in_too_late') return `Vào muộn ${d}p`;
                if (v.type === 'check_out_too_early') return `Ra sớm ${d}p`;
                if (v.type === 'check_out_too_late') return `Ra muộn ${d}p`;
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
                        ${hasInErr ? `<div class="text-[10px] text-red-500 mt-0.5">${errMsgs.filter(m => m.includes('Vào')).join(', ')}</div>` : ''}
                    </td>
                    <td class="py-2.5 px-2 text-center">
                        <div class="font-mono text-sm ${hasOutErr ? 'text-red-600 font-bold' : 'text-slate-600'}">${checkOutValue || '--:--'}</div>
                        ${hasOutErr ? `<div class="text-[10px] text-red-500 mt-0.5">${errMsgs.filter(m => m.includes('Ra')).join(', ')}</div>` : ''}
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
                        <div class="text-xs text-amber-600 mt-0.5">Vui lòng kiểm tra và điều chỉnh giờ chấm công theo khung giờ cho phép</div>
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
                    <span>Giờ cho phép được tính dựa trên khung giờ làm việc của từng nhân viên.</span>
                </div>
            </div>`;
    }
}

// Export singleton
window.ChamCongTimeValidator = new ChamCongTimeValidator();
