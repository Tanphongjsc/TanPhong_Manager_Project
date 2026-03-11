/**
 * ChamCongTimeValidator - Module xử lý ràng buộc giờ vào/ra cho Bảng Chấm Công
 * Tối ưu: Tận dụng AppUtils.TimeUtils, giảm code trùng lặp
 */
class ChamCongTimeValidator {
    constructor() {
        this.VIOLATION_TYPES = {
            CHECK_IN_TOO_EARLY: 'check_in_too_early',
            CHECK_IN_TOO_LATE: 'check_in_too_late',
            CHECK_OUT_TOO_EARLY: 'check_out_too_early',
            CHECK_OUT_TOO_LATE: 'check_out_too_late',
            MISSING_CHECK_IN: 'missing_check_in',
            MISSING_CHECK_OUT: 'missing_check_out',
            INVALID_TIME_FORMAT: 'invalid_time_format',
            WORK_TIME_TOO_SHORT: 'work_time_too_short'
        };
        this.VIOLATION_LABELS = {
            check_in_too_early: 'Vào ca quá sớm',
            check_in_too_late: 'Vào ca quá muộn',
            check_out_too_early: 'Ra ca quá sớm',
            check_out_too_late: 'Ra ca quá muộn',
            missing_check_in: 'Thiếu giờ vào',
            missing_check_out: 'Thiếu giờ ra',
            invalid_time_format: 'Định dạng giờ không hợp lệ',
            work_time_too_short: 'Thời gian làm việc chưa đủ'
        };
    }

    // Shorthand - tận dụng AppUtils
    toMinutes(t) { return AppUtils.TimeUtils.toMinutesSafe(t); }
    toTimeString(m) { return AppUtils.TimeUtils.toTimeString(m); }
    _parseMinutes(v) { const n = parseInt(v, 10); return isNaN(n) ? null : n; }

    isOvernightShift(s) { return s && s.endTime !== null && s.startTime !== null && s.endTime < s.startTime; }

    normalizeTimeForOvernight(mins, schedule, type) {
        if (mins === null || !this.isOvernightShift(schedule)) return mins;
        return (type === 'checkIn' || type === 'checkOut') && mins <= schedule.endTime ? mins + 1440 : mins;
    }

    normalizeSchedule(kglv) {
        if (!kglv) return null;
        const startTime = this.toMinutes(kglv.thoigianbatdau);
        const endTime = this.toMinutes(kglv.thoigianketthuc);
        const earliestCheckIn = this.toMinutes(kglv.thoigianchophepchamcongsomnhat);
        const lateGraceMinutes = this._parseMinutes(kglv.thoigianchophepdenmuon);
        const invalidLateInMinutes = this._parseMinutes(kglv.thoigiandimuonkhongtinhchamcong);
        const latestCheckOut = this.toMinutes(kglv.thoigianchophepvemuonnhat);
        const earlyGraceMinutes = this._parseMinutes(kglv.thoigianchophepvesomnhat);
        const invalidEarlyOutMinutes = this._parseMinutes(kglv.thoigianvesomkhongtinhchamcong);
        let allowedLateOutMinutes = null;
        if (latestCheckOut !== null && endTime !== null) {
            allowedLateOutMinutes = Math.max(0, latestCheckOut - endTime);
        }
        return {
            startTime, endTime, earliestCheckIn, lateGraceMinutes, invalidLateInMinutes,
            latestCheckOut, earlyGraceMinutes, invalidEarlyOutMinutes, allowedLateOutMinutes,
            minWorkTime: this._parseMinutes(kglv.thoigianlamviectoithieu), raw: kglv
        };
    }

    validateMissingCheckTimes({ checkIn, checkOut, employee }) {
        const violations = [];
        if (!checkIn) violations.push(this._createViolation(this.VIOLATION_TYPES.MISSING_CHECK_IN, employee, {}));
        if (!checkOut && employee?.cocancheckout === true) 
            violations.push(this._createViolation(this.VIOLATION_TYPES.MISSING_CHECK_OUT, employee, {}));
        return violations;
    }

    // Tính thời gian nghỉ trưa giao với khoảng làm việc
    _calcLunchMinutes(inMin, outMin, lunchBreaks, schedule) {
        if (!Array.isArray(lunchBreaks)) return 0;
        const isOvernight = this.isOvernightShift(schedule);
        return lunchBreaks.reduce((total, lb) => {
            if (!lb?.giobatdau || !lb?.gioketthuc) return total;
            let lbStart = this.toMinutes(lb.giobatdau), lbEnd = this.toMinutes(lb.gioketthuc);
            if (lbStart === null || lbEnd === null) return total;
            if (isOvernight) {
                if (lbEnd < lbStart) lbEnd += 1440;
                if (lbEnd <= schedule.endTime) { lbStart += 1440; lbEnd += 1440; }
            }
            const overlap = Math.min(outMin, lbEnd) - Math.max(inMin, lbStart);
            return total + (overlap > 0 ? overlap : 0);
        }, 0);
    }

    validate({ checkIn, checkOut, schedule, employee }) {
        const violations = [];
        if (!schedule) return { isValid: true, violations };

        let inMin = this.toMinutes(checkIn), outMin = this.toMinutes(checkOut);
        const isOvernight = this.isOvernightShift(schedule);
        if (isOvernight) {
            inMin = this.normalizeTimeForOvernight(inMin, schedule, 'checkIn');
            outMin = this.normalizeTimeForOvernight(outMin, schedule, 'checkOut');
        }

        // Check giờ vào
        if (checkIn) {
            if (inMin === null) {
                violations.push(this._createViolation(this.VIOLATION_TYPES.INVALID_TIME_FORMAT, employee, { field: 'checkIn', value: checkIn }));
            } else {
                if (schedule.earliestCheckIn !== null && inMin < schedule.earliestCheckIn) {
                    const early = schedule.earliestCheckIn - inMin;
                    violations.push(this._createViolation(this.VIOLATION_TYPES.CHECK_IN_TOO_EARLY, employee, {
                        value: checkIn, limit: this.toTimeString(schedule.earliestCheckIn), diff: early, suggestion: this.toTimeString(schedule.earliestCheckIn)
                    }));
                }
                if (schedule.startTime !== null && schedule.invalidLateInMinutes !== null) {
                    const lateFromStart = inMin - schedule.startTime;
                    if (lateFromStart > schedule.invalidLateInMinutes) {
                        violations.push(this._createViolation(this.VIOLATION_TYPES.CHECK_IN_TOO_LATE, employee, {
                            value: checkIn, scheduleStart: this.toTimeString(schedule.startTime), limit: schedule.invalidLateInMinutes,
                            diff: lateFromStart, rawLate: lateFromStart, graceMinutes: schedule.lateGraceMinutes,
                            suggestion: this.toTimeString(schedule.startTime + schedule.invalidLateInMinutes),
                            note: `Đi muộn ${lateFromStart}p (vượt ngưỡng ${schedule.invalidLateInMinutes}p)`
                        }));
                    }
                }
            }
        }

        // Check giờ ra
        if (checkOut) {
            if (outMin === null) {
                violations.push(this._createViolation(this.VIOLATION_TYPES.INVALID_TIME_FORMAT, employee, { field: 'checkOut', value: checkOut }));
            } else {
                if (schedule.endTime !== null && schedule.invalidEarlyOutMinutes !== null) {
                    const earlyFromEnd = schedule.endTime - outMin;
                    if (earlyFromEnd > schedule.invalidEarlyOutMinutes) {
                        violations.push(this._createViolation(this.VIOLATION_TYPES.CHECK_OUT_TOO_EARLY, employee, {
                            value: checkOut, scheduleEnd: this.toTimeString(schedule.endTime), limit: schedule.invalidEarlyOutMinutes,
                            diff: earlyFromEnd, rawEarly: earlyFromEnd, graceMinutes: schedule.earlyGraceMinutes,
                            suggestion: this.toTimeString(schedule.endTime - schedule.invalidEarlyOutMinutes),
                            note: `Về sớm ${earlyFromEnd}p (vượt ngưỡng ${schedule.invalidEarlyOutMinutes}p)`
                        }));
                    }
                }
                if (schedule.latestCheckOut !== null && outMin > schedule.latestCheckOut) {
                    const exceed = outMin - schedule.latestCheckOut;
                    violations.push(this._createViolation(this.VIOLATION_TYPES.CHECK_OUT_TOO_LATE, employee, {
                        value: checkOut, scheduleEnd: this.toTimeString(schedule.endTime), latestAllowed: this.toTimeString(schedule.latestCheckOut),
                        diff: exceed, suggestion: this.toTimeString(schedule.latestCheckOut), note: `Về muộn ${exceed}p (sau ${this.toTimeString(schedule.latestCheckOut)})`
                    }));
                }
            }
        }

        // Check thời gian làm việc tối thiểu
        if (checkIn && schedule.minWorkTime !== null && schedule.minWorkTime > 0) {
            let effectiveOutMin = (!employee?.cocancheckout || outMin === null) ? schedule.endTime : outMin;
            if (isOvernight) effectiveOutMin = this.normalizeTimeForOvernight(effectiveOutMin, schedule, 'checkOut');
            if (inMin !== null && effectiveOutMin !== null) {
                const lunchMinutes = this._calcLunchMinutes(inMin, effectiveOutMin, employee?.khunggionghitrua, schedule);
                const actualWorkMinutes = Math.max(0, effectiveOutMin - inMin - lunchMinutes);
                if (actualWorkMinutes < schedule.minWorkTime) {
                    violations.push(this._createViolation('work_time_too_short', employee, {
                        actual: actualWorkMinutes, required: schedule.minWorkTime, diff: schedule.minWorkTime - actualWorkMinutes,
                        note: `Thời gian làm việc ${actualWorkMinutes}p < tối thiểu ${schedule.minWorkTime}p`
                    }));
                }
            }
        }

        return { isValid: violations.length === 0, violations };
    }

    validateAll(records) {
        let validCount = 0, invalidCount = 0;
        const allViolations = [];
        records.forEach((record, index) => {
            const schedule = this.normalizeSchedule(record.employee?.khunggiolamviec);
            const emp = { ...record.employee, rowIndex: index };
            const missingViolations = this.validateMissingCheckTimes({ checkIn: record.checkIn, checkOut: record.checkOut, employee: emp });
            allViolations.push(...missingViolations);
            const result = this.validate({ checkIn: record.checkIn, checkOut: record.checkOut, schedule, employee: emp });
            result.isValid && missingViolations.length === 0 ? validCount++ : invalidCount++;
            allViolations.push(...result.violations);
        });
        return { isValid: allViolations.length === 0, validCount, invalidCount, violations: allViolations, summary: this._generateSummary(allViolations) };
    }

    getAnalysisDetails({ checkIn, checkOut, schedule, employee }) {
        const analysis = { violations: [], warnings: [], info: [], isValid: true };
        let inMin = this.toMinutes(checkIn), outMin = this.toMinutes(checkOut);
        const isOvernight = this.isOvernightShift(schedule);
        if (isOvernight && schedule) {
            inMin = this.normalizeTimeForOvernight(inMin, schedule, 'checkIn');
            outMin = this.normalizeTimeForOvernight(outMin, schedule, 'checkOut');
        }
        if (!schedule) return analysis;

        const addV = (type, label) => { analysis.violations.push({ type, label }); analysis.isValid = false; };
        const addW = (label, info) => analysis.warnings.push({ label, info });
        const addI = (label) => analysis.info.push({ label });

        if (!checkIn) addV('missing_in', 'Thiếu giờ vào');
        if (!checkOut && employee?.cocancheckout === true) addV('missing_out', 'Thiếu giờ ra');
        if (!checkIn || (!checkOut && employee?.cocancheckout === true)) return analysis;

        if (!employee?.cocancheckout && outMin === null) outMin = schedule.endTime;
        if (isOvernight && outMin !== null) outMin = this.normalizeTimeForOvernight(outMin, schedule, 'checkOut');

        // Check thời gian làm việc tối thiểu
        if (inMin !== null && outMin !== null && schedule.minWorkTime > 0) {
            const lunchMinutes = this._calcLunchMinutes(inMin, outMin, employee?.khunggionghitrua, schedule);
            const actualWorkMinutes = Math.max(0, outMin - inMin - lunchMinutes);
            if (actualWorkMinutes < schedule.minWorkTime) addV('work_time_too_short', `Chưa đủ ${schedule.minWorkTime}p (hiện: ${actualWorkMinutes}p)`);
        }

        // Check giờ vào
        if (inMin !== null && schedule.startTime !== null) {
            if (schedule.earliestCheckIn !== null && inMin < schedule.earliestCheckIn) {
                addV('check_in_too_early', `Vào sớm ${schedule.earliestCheckIn - inMin}p (trước ${this.toTimeString(schedule.earliestCheckIn)})`);
            } else {
                const lateFromStart = inMin - schedule.startTime;
                if (lateFromStart > 0) {
                    const grace = schedule.lateGraceMinutes || 0;
                    const effectiveLate = Math.max(0, lateFromStart - grace);
                    if (schedule.invalidLateInMinutes !== null && lateFromStart > schedule.invalidLateInMinutes) {
                        addV('check_in_too_late', `Muộn ${lateFromStart}p (vượt ${schedule.invalidLateInMinutes}p)`);
                    } else if (effectiveLate > 0) {
                        addW(`Muộn ${effectiveLate}p`, grace > 0 ? `Cho phép: ${grace}p` : null);
                    }
                }
            }
        }

        // Check giờ ra
        if (outMin !== null && schedule.endTime !== null) {
            const earlyFromEnd = schedule.endTime - outMin;
            const lateFromEnd = outMin - schedule.endTime;
            if (earlyFromEnd > 0) {
                const grace = schedule.earlyGraceMinutes || 0;
                const effectiveEarly = Math.max(0, earlyFromEnd - grace);
                if (schedule.invalidEarlyOutMinutes !== null && earlyFromEnd > schedule.invalidEarlyOutMinutes) {
                    addV('check_out_too_early', `Về sớm ${earlyFromEnd}p (vượt ${schedule.invalidEarlyOutMinutes}p)`);
                } else if (effectiveEarly > 0) {
                    addW(`Về sớm ${effectiveEarly}p`, grace > 0 ? `Cho phép: ${grace}p` : null);
                }
            }
            if (lateFromEnd > 0) {
                if (schedule.latestCheckOut !== null && outMin > schedule.latestCheckOut) {
                    addV('check_out_too_late', `Về muộn ${outMin - schedule.latestCheckOut}p (sau ${this.toTimeString(schedule.latestCheckOut)})`);
                } else if (schedule.allowedLateOutMinutes !== null && lateFromEnd <= schedule.allowedLateOutMinutes) {
                    addI(`Về muộn ${lateFromEnd}p (OK)`);
                }
            }
        }

        if (analysis.violations.length === 0 && analysis.warnings.length === 0 && analysis.info.length === 0) addI('✓ Đúng giờ');

        if (checkIn) {
            analysis.workHours = this.calculateActualWorkHours({
                checkIn, checkOut, schedule, requiresCheckout: employee?.cocancheckout === true, lunchBreaks: employee?.khunggionghitrua || []
            });
        }
        return analysis;
    }

    _createViolation(type, employee, details) {
        return {
            type, label: this.VIOLATION_LABELS[type] || type,
            employee: { id: employee?.id, name: employee?.hovaten || 'N/A', code: employee?.manhanvien || '', rowIndex: employee?.rowIndex },
            details, timestamp: new Date().toISOString()
        };
    }

    _generateSummary(violations) {
        return violations.reduce((acc, v) => {
            if (!acc[v.type]) acc[v.type] = { label: v.label, count: 0 };
            acc[v.type].count++;
            return acc;
        }, {});
    }

    getSuggestedTimes(schedule) {
        if (!schedule) return { checkIn: null, checkOut: null };
        const s = schedule;
        const checkInEarliest = s.earliestCheckIn !== null ? this.toTimeString(s.earliestCheckIn) : this.toTimeString(s.startTime);
        const checkInLatest = s.invalidLateInMinutes !== null && s.startTime !== null
            ? this.toTimeString(s.startTime + s.invalidLateInMinutes)
            : (s.lateGraceMinutes !== null && s.startTime !== null ? this.toTimeString(s.startTime + s.lateGraceMinutes) : null);
        const checkOutEarliest = s.invalidEarlyOutMinutes !== null && s.endTime !== null
            ? this.toTimeString(s.endTime - s.invalidEarlyOutMinutes)
            : (s.earlyGraceMinutes !== null && s.endTime !== null ? this.toTimeString(s.endTime - s.earlyGraceMinutes) : this.toTimeString(s.endTime));
        const checkOutLatest = s.latestCheckOut !== null
            ? this.toTimeString(s.latestCheckOut)
            : (s.allowedLateOutMinutes !== null && s.endTime !== null ? this.toTimeString(s.endTime + s.allowedLateOutMinutes) : null);
        return {
            checkIn: { earliest: checkInEarliest, latest: checkInLatest, recommended: this.toTimeString(s.startTime),
                graceEnd: s.lateGraceMinutes !== null && s.startTime !== null ? this.toTimeString(s.startTime + s.lateGraceMinutes) : null },
            checkOut: { earliest: checkOutEarliest, latest: checkOutLatest, recommended: this.toTimeString(s.endTime),
                graceStart: s.earlyGraceMinutes !== null && s.endTime !== null ? this.toTimeString(s.endTime - s.earlyGraceMinutes) : null }
        };
    }

    calculateActualWorkHours({ checkIn, checkOut, schedule, requiresCheckout = true, lunchBreaks = [] }) {
        const isOvernight = this.isOvernightShift(schedule);
        const defaultResult = { actualMinutes: 0, lunchMinutes: 0, formatted: '0.0h', displayClass: 'text-red-600 font-bold' };
        if (!checkIn) return defaultResult;

        let inMin = this.toMinutes(checkIn), outMin = this.toMinutes(checkOut);
        if (!requiresCheckout || outMin === null) outMin = schedule?.endTime || null;
        if (inMin === null || outMin === null) return defaultResult;

        if (isOvernight) {
            inMin = this.normalizeTimeForOvernight(inMin, schedule, 'checkIn');
            outMin = this.normalizeTimeForOvernight(outMin, schedule, 'checkOut');
        }

        const lunchMinutes = this._calcLunchMinutes(inMin, outMin, lunchBreaks, schedule);
        let rawWorkMinutes = outMin - inMin;
        if (rawWorkMinutes < 0) rawWorkMinutes += 1440;
        const actualMinutes = Math.max(0, rawWorkMinutes - lunchMinutes);
        const hours = (actualMinutes / 60).toFixed(1);

        let shiftEndNorm = schedule?.endTime || 0, shiftStartNorm = schedule?.startTime || 0;
        if (isOvernight && shiftEndNorm < shiftStartNorm) shiftEndNorm += 1440;
        const totalShiftMinutes = Math.max(0, shiftEndNorm - shiftStartNorm);
        const shiftLunchOverlap = this._calcLunchMinutes(shiftStartNorm, shiftEndNorm, lunchBreaks, schedule);
        const expectedWorkMinutes = Math.max(0, totalShiftMinutes - shiftLunchOverlap);
        const minWorkTime = schedule?.minWorkTime || 0;

        let displayClass = 'text-green-600 font-bold';
        if (actualMinutes === 0 || (minWorkTime > 0 && actualMinutes < minWorkTime) || (expectedWorkMinutes > 0 && actualMinutes < expectedWorkMinutes * 0.8)) {
            displayClass = 'text-red-600 font-bold';
        } else if (expectedWorkMinutes > 0 && actualMinutes < expectedWorkMinutes) {
            displayClass = 'text-amber-600 font-bold';
        }

        return { actualMinutes, lunchMinutes, rawWorkMinutes, totalShiftMinutes, formatted: `${hours}h`, displayClass };
    }

    renderViolationsModal(validationResult, employees = []) {
        const { violations, invalidCount } = validationResult;
        const byEmployee = {};
        violations.forEach(v => {
            const key = v.employee.id;
            if (!byEmployee[key]) {
                const empData = employees.find(e => e.id === v.employee.id);
                const schedule = empData ? this.normalizeSchedule(empData.khunggiolamviec) : null;
                byEmployee[key] = { employee: v.employee, schedule, suggested: this.getSuggestedTimes(schedule), violations: [], checkInValue: null, checkOutValue: null };
            }
            byEmployee[key].violations.push(v);
            if (v.type.includes('check_in') || v.type === 'missing_check_in') byEmployee[key].checkInValue = v.details?.value || null;
            if (v.type.includes('check_out') || v.type === 'missing_check_out') byEmployee[key].checkOutValue = v.details?.value || null;
        });

        const rowsHtml = Object.values(byEmployee).map((g, idx) => {
            const { employee: emp, suggested, violations: vio, checkInValue, checkOutValue } = g;
            const hasInErr = vio.some(v => v.type.includes('check_in') || v.type === 'missing_check_in');
            const hasOutErr = vio.some(v => v.type.includes('check_out') || v.type === 'missing_check_out');
            const workTimeErr = vio.find(v => v.type === 'work_time_too_short');
            const workTimeMsg = workTimeErr ? (workTimeErr.details?.note || `Thiếu ${workTimeErr.details?.diff ?? 0}p (yêu cầu ${workTimeErr.details?.required ?? 0}p)`) : null;
            
            const errMsgs = vio.map(v => {
                const d = v.details?.diff || 0;
                const msgMap = { check_in_too_early: `Vào sớm ${d}p`, check_in_too_late: `Muộn ${d}p`, check_out_too_early: `Về sớm ${d}p`, check_out_too_late: `Về muộn ${d}p`,
                    missing_check_in: 'Thiếu vào', missing_check_out: 'Thiếu ra', work_time_too_short: workTimeMsg || 'Chưa đủ giờ tối thiểu' };
                return msgMap[v.type] || v.label;
            });
            
            const inRange = suggested?.checkIn ? `${suggested.checkIn.earliest || '--:--'} → ${suggested.checkIn.latest || suggested.checkIn.recommended || '--:--'}` : '--:--';
            const outRange = suggested?.checkOut ? `${suggested.checkOut.earliest || suggested.checkOut.recommended || '--:--'} → ${suggested.checkOut.latest || '--:--'}` : '--:--';
            const inCls = hasInErr ? 'text-red-600 font-bold' : 'text-slate-600';
            const outCls = hasOutErr ? 'text-red-600 font-bold' : 'text-slate-600';
            
            return `<tr class="border-b border-slate-100 hover:bg-slate-50/50">
                <td class="py-2.5 px-3"><div class="flex items-center gap-2">
                    <span class="w-5 h-5 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-[10px] font-bold shrink-0">${idx + 1}</span>
                    <div><div class="font-semibold text-slate-800 text-sm">${emp.name}</div><div class="text-[11px] text-slate-400">${emp.code}</div></div>
                </div></td>
                <td class="py-2.5 px-2 text-center"><div class="font-mono text-sm ${inCls}">${checkInValue || '--:--'}</div>
                    ${hasInErr ? `<div class="text-[10px] text-red-500 mt-0.5">${errMsgs.filter(m => m.includes('Vào') || m.includes('Muộn') || m.includes('vào')).join(', ')}</div>` : ''}</td>
                <td class="py-2.5 px-2 text-center"><div class="font-mono text-sm ${outCls}">${checkOutValue || '--:--'}</div>
                    ${hasOutErr ? `<div class="text-[10px] text-red-500 mt-0.5">${errMsgs.filter(m => m.includes('Về') || m.includes('ra')).join(', ')}</div>` : ''}</td>
                <td class="py-2.5 px-2 text-center"><div class="text-[11px] text-slate-500 font-mono">${suggested?.checkIn?.recommended || '--:--'}</div></td>
                <td class="py-2.5 px-2 text-center"><div class="text-[11px] text-slate-500 font-mono">${suggested?.checkOut?.recommended || '--:--'}</div></td>
                <td class="py-2.5 px-2"><div class="flex flex-col gap-1">
                    ${hasInErr ? `<div class="flex items-center gap-1.5 text-[11px]"><span class="text-slate-400 w-10">Vào:</span><span class="font-mono text-emerald-600 font-semibold bg-emerald-50 px-1.5 py-0.5 rounded">${inRange}</span></div>` : ''}
                    ${hasOutErr ? `<div class="flex items-center gap-1.5 text-[11px]"><span class="text-slate-400 w-10">Ra:</span><span class="font-mono text-emerald-600 font-semibold bg-emerald-50 px-1.5 py-0.5 rounded">${outRange}</span></div>` : ''}
                    ${workTimeMsg ? `<div class="flex items-center gap-1.5 text-[11px] text-red-600"><i class="fa-solid fa-hourglass-half"></i><span>${workTimeMsg}</span></div>` : ''}
                </div></td></tr>`;
        }).join('');

        return `<div class="violations-modal-content">
            <div class="flex items-center gap-3 mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <div class="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0"><i class="fa-solid fa-clock text-amber-600"></i></div>
                <div class="flex-1"><div class="font-semibold text-amber-800">Phát hiện ${violations.length} lỗi từ ${invalidCount} nhân viên</div>
                    <div class="text-xs text-amber-600 mt-0.5">Vui lòng kiểm tra giờ chấm công</div></div></div>
            <div class="flex items-center gap-4 mb-3 text-[11px] text-slate-500">
                <div class="flex items-center gap-1"><span class="w-3 h-3 rounded bg-red-100 border border-red-300"></span><span>Giờ không hợp lệ</span></div>
                <div class="flex items-center gap-1"><span class="w-3 h-3 rounded bg-emerald-100 border border-emerald-300"></span><span>Khung giờ cho phép</span></div></div>
            <div class="border border-slate-200 rounded-lg overflow-hidden">
                <table class="w-full text-sm"><thead class="bg-slate-50 border-b border-slate-200"><tr>
                    <th class="py-2 px-3 text-left text-xs font-semibold text-slate-600 uppercase">Nhân viên</th>
                    <th class="py-2 px-2 text-center text-xs font-semibold text-slate-600 uppercase w-20">Giờ vào</th>
                    <th class="py-2 px-2 text-center text-xs font-semibold text-slate-600 uppercase w-20">Giờ ra</th>
                    <th class="py-2 px-2 text-center text-xs font-semibold text-slate-600 uppercase w-16">Chuẩn vào</th>
                    <th class="py-2 px-2 text-center text-xs font-semibold text-slate-600 uppercase w-16">Chuẩn ra</th>
                    <th class="py-2 px-2 text-left text-xs font-semibold text-slate-600 uppercase">Khung giờ cho phép</th>
                </tr></thead><tbody>${rowsHtml}</tbody></table></div>
            <div class="mt-3 text-[11px] text-slate-400 flex items-start gap-1.5">
                <i class="fa-solid fa-info-circle mt-0.5"></i>
                <span>Giờ cho phép được tính dựa trên khung giờ làm việc của từng nhân viên. Thời gian muộn/sớm đã trừ thời gian grace period.</span></div></div>`;
    }
}

window.ChamCongTimeValidator = new ChamCongTimeValidator();
