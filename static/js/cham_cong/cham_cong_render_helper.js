/**
 * ChamCongRenderHelper - Module hỗ trợ render HTML cho Bảng Chấm Công
 * Optimized: Trích xuất HTML trùng lặp, gọn hóa template
 */
const ChamCongRenderHelper = (() => {
    const formatTimeDisplay = (t) => AppUtils.TimeUtils.formatDisplay(t);
    const parseParams = (data) => { try { return typeof data === 'string' ? JSON.parse(data) : data || []; } catch { return []; } };

    const renderCompactAnalysis = (analysis) => {
        if (!analysis) return '<span class="text-[10px] text-slate-300">-</span>';
        const items = [
            ...analysis.violations.map(v => `<span class="inline-flex items-center gap-0.5 text-[10px] text-red-600 bg-red-50 px-1.5 py-0.5 rounded border border-red-100 font-medium">${v.type.includes('missing') ? '✗' : '⚠'} ${v.label}</span>`),
            ...analysis.warnings.map(w => `<span class="inline-flex items-center gap-0.5 text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100">${w.label}</span>`)
        ];
        return items.length ? `<div class="flex flex-wrap gap-1">${items.join('')}</div>`
            : '<span class="inline-flex items-center gap-0.5 text-[10px] text-green-600 bg-green-50 px-1.5 py-0.5 rounded border border-green-100 font-medium">✓ Đúng giờ</span>';
    };

    const renderDetailedAnalysis = (analysis) => {
        if (!analysis) return '<span class="text-[10px] text-slate-300">-</span>';
        const parts = [
            ...analysis.violations.map(v => `<div class="text-[10px] text-red-600 bg-red-50 px-1.5 py-0.5 rounded border border-red-100 font-medium mb-0.5"><i class="fa-solid fa-circle-exclamation mr-0.5"></i>${v.label}</div>`),
            ...analysis.warnings.map(w => `<div class="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100 mb-0.5">${w.label}${w.info ? `<span class="text-[9px] text-amber-500 ml-1">${w.info}</span>` : ''}</div>`)
        ];
        if (!parts.length && analysis.info.length > 0) parts.push(`<div class="text-[9px] text-slate-500">${analysis.info[0].label}</div>`);
        return parts.length ? parts.join('') : '<span class="text-[10px] text-slate-300">-</span>';
    };

    // Shared HTML fragments
    const _lunchOtHtml = (s, layout = 'inline') => {
        const otDisabled = s.ot ? '' : 'disabled';
        if (layout === 'labeled') {
            return `
            <td class="px-2 py-1 border-r border-slate-200 align-top">
                <div class="flex flex-col items-start gap-2">
                    <div class="flex items-center min-h-[22px] w-full">
                        <label class="inline-flex items-center gap-1.5 text-[11px] text-slate-600 leading-none">
                            <input type="checkbox" class="chk-lunch w-3.5 h-3.5 cursor-pointer accent-blue-600" ${s.lunch ? 'checked' : ''}>
                            <span>Ăn trưa</span>
                        </label>
                    </div>
                    <div class="w-full border-t border-slate-100"></div>
                    <div class="flex items-center justify-between gap-2 min-h-[24px] w-full">
                        <label class="inline-flex items-center gap-1.5 text-[11px] text-slate-600 leading-none">
                            <input type="checkbox" class="chk-ot w-3.5 h-3.5 accent-orange-500 cursor-pointer" ${s.ot ? 'checked' : ''}>
                            <span>OT</span>
                        </label>
                        <input type="number" min="0" step="1" class="ot-minutes w-14 text-[11px] text-center border border-slate-200 rounded px-1 py-0.5 focus:border-orange-400 focus:ring-1 focus:ring-orange-300 disabled:bg-slate-50" placeholder="phút" value="${s.otMinutes || ''}" ${otDisabled}>
                    </div>
                </div>
            </td>`;
        }
        // inline layout (VP/SX cells)
        return `
            <td class="p-0.5 border-r border-slate-200 text-center align-middle">
                <div class="inline-flex items-center justify-center w-full h-full py-1"><input type="checkbox" class="chk-lunch w-3.5 h-3.5 cursor-pointer accent-blue-600" ${s.lunch ? 'checked' : ''}></div></td>
            <td class="p-0.5 border-r border-slate-200 text-center align-middle">
                <div class="inline-flex items-center justify-center gap-1 w-full h-full py-1">
                    <input type="checkbox" class="chk-ot w-3.5 h-3.5 accent-blue-600 cursor-pointer" ${s.ot ? 'checked' : ''}>
                    <input type="number" min="0" step="1" class="ot-minutes w-14 text-[11px] text-center border border-slate-200 rounded px-1 py-0.5 focus:border-blue-400 focus:ring-1 focus:ring-blue-300 disabled:bg-slate-50" placeholder="phút" value="${s.otMinutes || ''}" ${otDisabled}>
                </div></td>`;
    };

    const _noteHtml = (s) => `<td class="px-2 py-1 note-cell"><input type="text" class="note-input w-full text-xs border-b border-transparent focus:border-blue-300 outline-none bg-transparent placeholder-slate-300 mt-0.5" placeholder="..." value="${s.note || ''}"></td>`;

    const _jobListHtml = (activeJobs, jobs, options = {}) => {
        // Lấy các thuộc tính từ options, thêm isVP (mặc định là false để an toàn cho các hàm khác)
        const { addText = '+ Thêm', addClass = 'text-slate-400 hover:text-blue-500 font-medium', isVP = false } = options;
        const jobOpts = jobs.map(j => `<option value="${j.id}">${j.tencongviec}</option>`).join('');

        // Khối Hành Chính mặc định (Chỉ render nếu là chế độ VP)
        let baseJobHtml = '';
        if (isVP) {
            baseJobHtml = `
            <div class="job-row flex items-center gap-2 p-1.5 border-b border-slate-200 bg-emerald-50/50 select-none">
                <div class="min-w-[16px] h-4 px-1 inline-flex items-center justify-center bg-emerald-100 text-emerald-700 text-[9px] font-bold rounded border border-emerald-200 shadow-sm shrink-0 leading-none" title="Công mặc định">✓</div>
                <div class="w-[150px] shrink-0">
                    <div class="w-full text-xs font-semibold text-emerald-700 border border-emerald-200 bg-emerald-50/80 rounded py-0.5 px-1.5 h-[26px] flex items-center justify-between cursor-not-allowed">
                        <span>Công Hành Chính</span>
                        <i class="fa-solid fa-building-user text-[10px] opacity-60"></i>
                    </div>
                </div>
                <div class="flex-1 flex flex-wrap items-center gap-2 min-h-[26px]">
                    <span class="text-[11px] text-slate-400 italic font-medium flex items-center gap-1.5">
                        <i class="fa-solid fa-clock-rotate-left text-[10px]"></i>
                    </span>
                </div>
                <div class="w-6 h-6 ml-auto shrink-0"></div>
            </div>`;
        }

        let renderedCount = 0;
        const rows = activeJobs.map((jobItem, index) => {
            // Ẩn job trống mặc định ở index 0 nếu là VP
            if (isVP && index === 0 && !jobItem.jobId) return '';

            renderedCount++;
            const currentOpts = jobItem.jobId ? jobOpts.replace(`value="${jobItem.jobId}"`, `value="${jobItem.jobId}" selected`) : jobOpts;
            const showDel = renderedCount > 1 || activeJobs.length > 1 || jobItem.jobId;
            const delBtn = showDel
                ? `<button class="btn-remove-job w-6 h-6 flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-all ml-auto shrink-0" data-index="${index}" title="Xóa"><i class="fa-solid fa-xmark text-xs"></i></button>`
                : '<div class="w-6 h-6 ml-auto shrink-0"></div>';
            
            // Chỉnh màu sắc + thứ tự: VP là phát sinh (+1, màu cam), SX là gốc (1, màu xanh)
            const badgeColor = isVP ? 'orange' : 'blue';
            const indexLabel = isVP ? `+${renderedCount}` : `${renderedCount}`;

            return `<div class="job-row flex items-center gap-2 p-1.5 border-b border-dashed border-slate-200 last:border-0 hover:bg-blue-50/40 transition-colors group/job relative">
                <div class="min-w-[16px] h-4 px-1 inline-flex items-center justify-center bg-${badgeColor}-100 text-${badgeColor}-700 text-[9px] font-bold rounded border border-${badgeColor}-200 shadow-sm select-none shrink-0 leading-none">${indexLabel}</div>
                <div class="w-[150px] shrink-0"><select class="job-select w-full text-xs font-medium text-slate-700 border border-slate-200 rounded py-0.5 px-1.5 focus:border-blue-500 outline-none bg-white shadow-sm h-[26px]" data-index="${index}"><option value="">--</option>${currentOpts}</select></div>
                <div class="flex-1 flex flex-wrap items-center gap-2 min-h-[26px]">${renderJobParams(jobItem, index, jobs)}</div>
                ${delBtn}</div>`;
        }).join('');

        return `<td class="p-0 border-r border-slate-200 align-top"><div class="flex flex-col w-full h-full bg-white">
                ${baseJobHtml}
                ${rows}
                <div class="flex justify-center py-1.5 mt-auto"><button class="btn-add-job text-xs ${addClass} transition-colors" title="${addText}">${addText}</button></div></div></td>`;
    };

    const renderCommonCells = (emp, scheduleIn, scheduleOut, accent = 'blue') => {
        const s = emp.uiState;
        const isChecked = s.isSelected === true ? 'checked' : '';
        const selectDisabled = s.isLeave === true ? 'disabled' : '';
        const selectExtraClass = s.isLeave === true ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer';
        const outDisabled = emp.cocancheckout === false ? 'disabled' : '';
        const outTitle = emp.cocancheckout === false ? 'Không yêu cầu checkout' : '';
        const outPlaceholder = emp.cocancheckout === false ? scheduleOut : '';
        const workHoursDisplay = s.workHours?.formatted || '-';
        const workHoursClass = s.workHours?.displayClass || 'text-slate-400';
        const stColor = s.shiftType === 'SX' ? 'emerald' : 'blue';
        const shiftTypeOpts = `<select class="shift-type-select text-[11px] font-bold border rounded shadow-sm px-1.5 py-0.5 outline-none cursor-pointer transition-all hover:brightness-95 bg-${stColor}-50 text-${stColor}-700 border-${stColor}-200 focus:ring-1 focus:ring-${stColor}-300" title="Loại chấm công" style="height: 22px;">
                                <option value="VP" ${s.shiftType === 'VP' ? 'selected' : ''}>VP</option>
                                <option value="SX" ${s.shiftType === 'SX' ? 'selected' : ''}>SX</option>
                            </select>`;

        return `<td class="p-1 border-r border-slate-200 text-center sticky left-0 bg-white z-20 shadow-[2px_0_4px_rgba(0,0,0,0.03)]">
                <input type="checkbox" ${isChecked} ${selectDisabled} class="row-cb row-checkbox accent-${accent}-600 w-3.5 h-3.5 mt-1.5 ${selectExtraClass}" title="Chọn để lưu chấm công"></td>
            <td class="px-2 py-1.5 border-r border-slate-200 employee-cell">
                <div class="flex items-start justify-between gap-2">
                    <div class="min-w-0 flex-1">
                        <div class="font-bold text-slate-700 text-[13px] truncate max-w-[170px]">${emp.hovaten}</div>
                        <div class="text-[11px] truncate flex items-center mt-0.5 gap-1">
                            ${shiftTypeOpts}
                            <span class="bg-slate-100 px-1 rounded border border-slate-200 text-slate-600 text-[11px] leading-[18px]">${emp.manhanvien || '?'}</span>
                            <span class="text-slate-400 mx-0.5">|</span>
                            <span class="font-mono text-blue-600 font-semibold text-[11px] leading-[18px]" title="Ca làm việc">${scheduleIn} - ${scheduleOut}</span>
                        </div>
                    </div>
                    <button type="button" class="leave-pill inline-flex items-center justify-center h-6 px-2.5 rounded-full border text-[11px] font-semibold whitespace-nowrap transition-colors ${s.isLeave ? 'bg-rose-600 border-rose-600 text-white shadow-sm' : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'}" title="Đánh dấu nghỉ" aria-pressed="${s.isLeave ? 'true' : 'false'}">
                        <span>Nghỉ</span>
                    </button>
                </div></td>
            <td class="p-1 border-r border-slate-200">
                <div class="flex flex-col gap-1">
                    <div class="flex items-center gap-1.5">
                        <span class="inline-flex items-center justify-center w-4 text-blue-600" title="Giờ vào"><i class="fa-solid fa-right-to-bracket text-[9px]"></i></span>
                        <input type="time" value="${s.in || ''}" class="cell-input inp-in !text-[13px] flex-1 min-w-0">
                    </div>
                    <div class="flex items-center gap-1.5">
                        <span class="inline-flex items-center justify-center w-4 text-blue-500" title="Giờ ra"><i class="fa-solid fa-right-from-bracket text-[9px]"></i></span>
                        <input type="time" value="${s.out || ''}" class="cell-input inp-out !text-[13px] flex-1 min-w-0" ${outDisabled} title="${outTitle}" placeholder="${outPlaceholder}">
                    </div>
                </div></td>
            <td class="p-0.5 border-r border-slate-200 text-center"><div class="work-hours-display text-[12px] font-mono px-1.5 py-0.5 rounded ${workHoursClass}" title="Số giờ làm thực tế">${workHoursDisplay}</div></td>`;
    };

    const renderVPCells = (s) => `
        <td class="px-2 py-1 border-r border-slate-200"><div class="analysis-result flex flex-wrap gap-0.5 min-h-[16px] mt-1"><span class="text-[10px] text-slate-300">-</span></div></td>
        ${_lunchOtHtml(s, 'inline')}
        ${_noteHtml(s)}`;

    const renderJobParams = (jobItem, index, jobs) => {
        if (!jobItem.jobId) return '<span class="text-[11px] text-slate-300 italic pl-1 select-none font-light">Chọn công việc...</span>';
        const jobDef = jobs.find(j => j.id == jobItem.jobId);
        if (!jobDef) return '';
        return parseParams(jobDef.danhsachthamso).map(p => {
            const val = jobItem.params[p.ma] !== undefined ? jobItem.params[p.ma] : (p.giatri_macdinh || '');
            const w = Math.max(String(val).length + 1, 3);
            return `<div class="flex items-center bg-white border border-slate-200 rounded overflow-hidden h-[24px] shadow-sm hover:border-blue-300 transition-colors">
                <div class="bg-slate-50 text-[9px] text-slate-500 font-bold px-1.5 h-full flex items-center border-r border-slate-100 uppercase tracking-wider select-none">${p.ma}</div>
                <input type="text" class="param-val text-center text-xs font-semibold text-slate-700 bg-transparent border-none outline-none h-full focus:bg-blue-50 px-1" style="min-width: 2.5rem; max-width: 15rem; width: ${w}ch;" data-index="${index}" data-key="${p.ma}" value="${val}" oninput="this.style.width = Math.max(this.value.length + 0.5, 3) + 'ch'">
            </div>`;
        }).join('');
    };

    const renderSXCells = (s, jobs) => `
        ${_jobListHtml(s.jobs, jobs)}
        ${_lunchOtHtml(s, 'inline')}
        ${_noteHtml(s)}`;

    const renderHybridCells = (emp, jobs) => {
        const s = emp.uiState;
        const isVP = s.shiftType === 'VP';
        
        // Cập nhật text và style cho nút thêm
        const addText = isVP ? '+ Thêm việc phát sinh' : '+ Thêm công việc';
        const addClass = isVP ? 'text-orange-500 hover:text-orange-600 font-bold' : 'text-slate-400 hover:text-blue-500 font-medium';

        return `
        <td class="px-2 py-1 border-r border-slate-200"><div class="analysis-result flex flex-wrap gap-0.5 min-h-[16px] mt-1"><span class="text-[10px] text-slate-300">-</span></div></td>
        ${_jobListHtml(s.jobs || [], jobs, { addText, addClass, isVP })}
        ${_lunchOtHtml(s, 'labeled')}
        ${_noteHtml(s)}`;
    };

    const renderMasterParams = (job) => parseParams(job.danhsachthamso).map(p => `
        <div class="param-group bg-blue-50 border-blue-200">
            <label class="param-label text-blue-700">${p.ma}</label>
            <input type="text" class="param-val m-p-val text-blue-800" data-key="${p.ma}" value="${p.giatri_macdinh || ''}">
        </div>`).join('');

    return { formatTimeDisplay, parseParams, renderCompactAnalysis, renderDetailedAnalysis, renderCommonCells, renderVPCells, renderSXCells, renderHybridCells, renderJobParams, renderMasterParams };
})();

window.ChamCongRenderHelper = ChamCongRenderHelper;
