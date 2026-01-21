/**
 * File: static/js/lich_lam_viec/schedule_validator.js
 * Version: 1.0 - Refactored từ lich_form.js
 * Description: Validation logic cho conflict detection
 */

const ScheduleValidator = (() => {
    /**
     * Kiểm tra xung đột cross-day cho lịch Fixed (Weekly)
     */
    function checkWeeklyCrossDayOverlap(weeklyData) {
        const weeklyIntervals = [];

        weeklyData.forEach(day => {
            if (! day.isChecked || !day.shifts || day.shifts.length === 0) return;

            const dayBaseMinutes = day.dayIndex * 1440;

            day.shifts.forEach(shift => {
                const absIntervals = AppUtils.Time.getAbsoluteIntervals(shift);
                
                absIntervals.forEach(interval => {
                    weeklyIntervals.push({
                        start: dayBaseMinutes + interval.start,
                        end: dayBaseMinutes + interval.end,
                        dayName: day.dayName,
                        shiftName: shift.TenCa,
                        rawText: interval.rawText
                    });
                });
            });
        });

        if (weeklyIntervals.length < 2) return null;

        weeklyIntervals.sort((a, b) => a.start - b.start);

        for (let i = 0; i < weeklyIntervals.length - 1; i++) {
            const current = weeklyIntervals[i];
            const next = weeklyIntervals[i + 1];

            if (current.end > next.start) {
                const getDayNameFromMinutes = (mins) => {
                    const dayIdx = Math.floor(mins / 1440);
                    const days = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'CN', 'Thứ 2 tuần sau'];
                    return days[dayIdx] || `Ngày +${dayIdx}`;
                };

                const day1 = getDayNameFromMinutes(current.start);
                const day2 = getDayNameFromMinutes(next.start);
                
                let dayInfo = day1;
                if (day1 !== day2) dayInfo = `${day1} và ${day2}`;

                return `Xung đột thời gian (${dayInfo}): "${current.shiftName}" [${current.rawText}] trùng với "${next.shiftName}" [${next.rawText}].`;
            }
        }

        return null;
    }

    /**
     * Tự động giải quyết conflicts cho Weekly schedule
     */
    function autoResolveWeeklyConflicts(weeklyData) {
        const validIntervals = [];
        const removedDays = [];

        weeklyData.forEach(day => {
            if (!day.isChecked || !day.shifts || day.shifts.length === 0) return;

            const dayOffset = day.dayIndex * 1440;
            let isConflict = false;
            const currentDayIntervals = [];

            day.shifts.forEach(shift => {
                const absIntervals = AppUtils.Time.getAbsoluteIntervals(shift);
                absIntervals.forEach(i => {
                    currentDayIntervals.push({
                        start: dayOffset + i.start,
                        end: dayOffset + i.end
                    });
                });
            });

            for (const cur of currentDayIntervals) {
                for (const valid of validIntervals) {
                    if (cur.start < valid.end && cur.end > valid.start) {
                        isConflict = true;
                        break;
                    }
                }
                if (isConflict) break;
            }

            if (isConflict) {
                day.isChecked = false;
                day.shifts = [];
                removedDays.push(day.dayName);
            } else {
                validIntervals.push(...currentDayIntervals);
            }
        });

        return removedDays;
    }

    /**
     * Kiểm tra xung đột trong cùng 1 ngày (Lịch trình)
     */
    function checkLTShiftConflictInDay(existingShifts, newShift) {
        if (existingShifts.length === 0) return null;
    
        // ✅ CÁCH 1: Gọi hàm chung (Recommended)
        const allShifts = [... existingShifts, newShift];
        const error = checkMultipleShiftsOverlap(allShifts);
        
        if (error) {
            // Simplify message cho context này
            return `Xung đột:  "${newShift.TenCa}" trùng với ca đã chọn`;
        }
        
        return null;
    }

    /**
     * Kiểm tra xung đột cross-day (Lịch trình)
     */
    function checkLTCrossDayConflict(empId, year, month, targetDay, newShift, scheduleData) {
        const daysInMonth = new Date(year, month, 0).getDate();
        
        // Kiểm tra với ngày trước đó
        if (targetDay > 1) {
            const prevKey = `${empId}_${year}_${month}_${targetDay - 1}`;
            const prevShifts = scheduleData.get(prevKey) || [];
            
            for (const prevShift of prevShifts) {
                const prevIntervals = AppUtils.Time.getAbsoluteIntervals(prevShift);
                const newIntervals = AppUtils.Time.getAbsoluteIntervals(newShift);
                
                for (const prevInt of prevIntervals) {
                    if (prevInt.end > 1440) {
                        const overflowEnd = prevInt.end - 1440;
                        
                        for (const newInt of newIntervals) {
                            if (newInt.start < overflowEnd) {
                                return `Xung đột: Ca ngày ${targetDay - 1} (${prevShift.TenCa}) kéo dài sang ngày ${targetDay}`;
                            }
                        }
                    }
                }
            }
        }
        
        // Kiểm tra với ngày sau
        if (targetDay < daysInMonth) {
            const nextKey = `${empId}_${year}_${month}_${targetDay + 1}`;
            const nextShifts = scheduleData.get(nextKey) || [];
            
            const newIntervals = AppUtils.Time.getAbsoluteIntervals(newShift);
            
            for (const newInt of newIntervals) {
                if (newInt.end > 1440) {
                    const overflowEnd = newInt.end - 1440;
                    
                    for (const nextShift of nextShifts) {
                        const nextIntervals = AppUtils.Time.getAbsoluteIntervals(nextShift);
                        
                        for (const nextInt of nextIntervals) {
                            if (nextInt.start < overflowEnd) {
                                return `Xung đột: Ca "${newShift.TenCa}" sẽ tràn sang ngày ${targetDay + 1} và trùng với "${nextShift.TenCa}"`;
                            }
                        }
                    }
                }
            }
        }
        
        return null;
    }

    /**
     * Kiểm tra xung đột trong ngày của Cycle
     */
    function checkCycleShiftConflictInDay(dayIndex, newShift, cycleFormState) {
        if (newShift.id === 0) return null;
        
        const existingShifts = (cycleFormState[dayIndex] || []).filter(s => s.id !== 0);
        if (existingShifts.length === 0) return null;

        const newIntervals = AppUtils.Time.getAbsoluteIntervals(newShift);
        
        for (const existing of existingShifts) {
            const existingIntervals = AppUtils.Time.getAbsoluteIntervals(existing);
            
            for (const newInt of newIntervals) {
                for (const existInt of existingIntervals) {
                    if (newInt.start < existInt.end && newInt.end > existInt.start) {
                        return `Xung đột trong Ngày ${dayIndex}: "${newShift.TenCa}" [${newInt.rawText}] trùng với "${existing.TenCa}" [${existInt.rawText}]`;
                    }
                }
            }
        }
        
        return null;
    }

    /**
     * Kiểm tra xung đột cross-day của Cycle (bao gồm circular)
     */
    function checkCycleShiftConflictCrossDay(targetDayIndex, newShift, cycleFormState, numDays) {
        if (newShift.id === 0) return null;
        if (numDays <= 1) return null;
        
        const cycleLength = numDays * 1440;
        const allIntervals = [];
        
        const collectIntervalsForDay = (dayIndex, shifts, dayOffset) => {
            shifts.filter(s => s.id !== 0).forEach(shift => {
                const intervals = AppUtils.Time.getAbsoluteIntervals(shift);
                intervals.forEach(int => {
                    allIntervals.push({
                        start: dayOffset + int.start,
                        end: dayOffset + int.end,
                        dayIndex: dayIndex,
                        shiftName: shift.TenCa,
                        rawText:  int.rawText
                    });
                });
            });
        };
        
        // Thu thập từ các ngày khác
        for (let dayIndex = 1; dayIndex <= numDays; dayIndex++) {
            if (dayIndex === targetDayIndex) continue;
            
            const dayShifts = cycleFormState[dayIndex] || [];
            const dayOffset = (dayIndex - 1) * 1440;
            collectIntervalsForDay(dayIndex, dayShifts, dayOffset);
        }
        
        // Thu thập từ ngày target
        const targetDayOffset = (targetDayIndex - 1) * 1440;
        const existingTargetShifts = (cycleFormState[targetDayIndex] || []).filter(s => s.id !== 0);
        
        const newIntervals = AppUtils.Time.getAbsoluteIntervals(newShift);
        const newAbsoluteIntervals = newIntervals.map(int => ({
            start: targetDayOffset + int.start,
            end: targetDayOffset + int.end,
            dayIndex: targetDayIndex,
            shiftName:  newShift.TenCa,
            rawText: int.rawText
        }));
        
        // Kiểm tra trong chu kỳ
        for (const newInt of newAbsoluteIntervals) {
            for (const existing of allIntervals) {
                if (newInt.start < existing.end && newInt.end > existing.start) {
                    return `Xung đột giữa Ngày ${targetDayIndex} và Ngày ${existing.dayIndex}: "${newShift.TenCa}" [${newInt.rawText}] trùng với "${existing.shiftName}" [${existing.rawText}]`;
                }
            }
        }
        
        // Kiểm tra circular
        const allWithNew = [...allIntervals, ...newAbsoluteIntervals];
        collectIntervalsForDay(targetDayIndex, existingTargetShifts, targetDayOffset);
        
        for (const interval of allWithNew) {
            if (interval.end > cycleLength) {
                const overflowStart = 0;
                const overflowEnd = interval.end - cycleLength;
                
                for (const day1Interval of allWithNew) {
                    if (day1Interval.dayIndex !== 1) continue;
                    
                    if (overflowStart < day1Interval.end && overflowEnd > day1Interval.start) {
                        const overflowDayIndex = interval.dayIndex;
                        return `Xung đột vòng lặp:  Ngày ${overflowDayIndex} (${interval.shiftName}) kết thúc lúc ${AppUtils.Time.formatTime(interval.end % 1440)} sang ngày hôm sau, trùng với Ngày 1 (${day1Interval.shiftName}) bắt đầu lúc ${AppUtils.Time.formatTime(day1Interval.start % 1440)}`;
                    }
                }
            }
        }
        
        // Kiểm tra ngược
        if (targetDayIndex === 1) {
            const lastDayShifts = cycleFormState[numDays] || [];
            const lastDayOffset = (numDays - 1) * 1440;
            
            lastDayShifts.filter(s => s.id !== 0).forEach(shift => {
                const intervals = AppUtils.Time.getAbsoluteIntervals(shift);
                intervals.forEach(int => {
                    const absEnd = lastDayOffset + int.end;
                    
                    if (absEnd > cycleLength) {
                        const overflowEnd = absEnd - cycleLength;
                        
                        for (const newInt of newAbsoluteIntervals) {
                            if (0 < newInt.end && overflowEnd > newInt.start) {
                                return `Xung đột vòng lặp: Ngày ${numDays} (${shift.TenCa}) kéo dài sang ngày hôm sau, trùng với ca bạn đang thêm vào Ngày 1`;
                            }
                        }
                    }
                });
            });
        }
        
        return null;
    }

    /**
     * Validate toàn bộ chu kỳ trước khi submit
     */
    function validateCycleBeforeSubmit(cycleFormState, numDays) {
        if (numDays <= 1) return null;
        
        const cycleLength = numDays * 1440;
        const allIntervals = [];
        
        for (let dayIndex = 1; dayIndex <= numDays; dayIndex++) {
            const dayShifts = cycleFormState[dayIndex] || [];
            const dayOffset = (dayIndex - 1) * 1440;
            
            dayShifts.filter(s => s.id !== 0).forEach(shift => {
                const intervals = AppUtils.Time.getAbsoluteIntervals(shift);
                intervals.forEach(int => {
                    allIntervals.push({
                        start: dayOffset + int.start,
                        end: dayOffset + int.end,
                        dayIndex: dayIndex,
                        shiftName:  shift.TenCa,
                        rawText: int.rawText
                    });
                });
            });
        }
        
        allIntervals.sort((a, b) => a.start - b.start);
        
        for (let i = 0; i < allIntervals.length - 1; i++) {
            const current = allIntervals[i];
            const next = allIntervals[i + 1];
            
            if (current.end > next.start) {
                return `Xung đột:  Ngày ${current.dayIndex} (${current.shiftName}) trùng với Ngày ${next.dayIndex} (${next.shiftName})`;
            }
        }
        
        for (const interval of allIntervals) {
            if (interval.end > cycleLength) {
                const overflowEnd = interval.end - cycleLength;
                
                const day1Intervals = allIntervals.filter(i => i.dayIndex === 1);
                for (const day1Int of day1Intervals) {
                    if (overflowEnd > day1Int.start) {
                        return `Xung đột vòng lặp: Ngày ${interval.dayIndex} (${interval.shiftName}) kéo dài sang ngày hôm sau (kết thúc lúc ${AppUtils.Time.formatTime(interval.end % 1440)}), trùng với Ngày 1 (${day1Int.shiftName}) bắt đầu lúc ${AppUtils.Time.formatTime(day1Int.start % 1440)}.Vui lòng điều chỉnh ca làm việc hoặc đặt Ngày 1 là Ngày nghỉ.`;
                    }
                }
            }
        }
        
        return null;
    }

    function checkMultipleShiftsOverlap(shifts) {
        if (! shifts || shifts.length < 2) return null;

        let allIntervals = [];
        
        // Thu thập tất cả intervals
        shifts.forEach(shift => {
            const intervals = AppUtils.Time.getAbsoluteIntervals(shift);
            intervals.forEach(interval => {
                allIntervals.push({
                    ...interval,
                    shiftName: shift.TenCa
                });
            });
        });

        // Sort theo thời gian bắt đầu
        allIntervals.sort((a, b) => a.start - b.start);

        // Kiểm tra overlap
        for (let i = 0; i < allIntervals.length - 1; i++) {
            const current = allIntervals[i];
            const next = allIntervals[i + 1];
            
            // ✅ LOGIC CHUẨN: Overlap khi end > start (không bao gồm điểm chạm)
            if (current.end > next.start) {
                return `Xung đột thời gian: "${current.shiftName}" (${current.rawText}) trùng với "${next.shiftName}" (${next.rawText}).`;
            }
        }
        
        return null;
    }

    return {
        checkWeeklyCrossDayOverlap,
        autoResolveWeeklyConflicts,
        checkLTShiftConflictInDay,
        checkLTCrossDayConflict,
        checkCycleShiftConflictInDay,
        checkCycleShiftConflictCrossDay,
        validateCycleBeforeSubmit,
        checkMultipleShiftsOverlap
    };
})();

window.ScheduleValidator = ScheduleValidator;