/**
 * ChamCongRenderHelper - Module hỗ trợ render HTML cho Bảng Chấm Công
 * Tách riêng để giảm độ phức tạp của ChamCongManager và tái sử dụng
 */
const ChamCongRenderHelper = (() => {
    // ===== TIME UTILITIES =====
    
    /**
     * Format chuỗi giờ từ API (07:30:00+00 -> 07:30)
     */
    const formatTimeDisplay = (timeStr) => {
        return AppUtils.TimeUtils.formatDisplay(timeStr);
    };

    /**
     * Parse JSON params an toàn
     */
    const parseParams = (data) => {
        try { 
            return typeof data === 'string' ? JSON.parse(data) : data || []; 
        } catch { 
            return []; 
        }
    };

    // ===== BADGE & UI COMPONENTS =====

    /**
     * Render badge phân tích giờ (Muộn/Sớm/OK)
     */
    const renderAnalysisBadge = (text, isOk) => {
        const cls = isOk 
            ? 'bg-green-50 text-green-600 border-green-100' 
            : 'bg-red-50 text-red-600 border-red-100';
        return `<span class="text-[10.5px] ${cls} px-1.5 py-0.5 rounded border font-medium">${text}</span>`;
    };

    /**
     * Render phân tích gọn gàng (compact) - chỉ hiển thị thông tin quan trọng
     */
    const renderCompactAnalysis = (analysis) => {
        if (!analysis) return '<span class="text-[10px] text-slate-300">-</span>';

        const { violations, warnings } = analysis;
        const items = [];

        // Violations (lỗi nghiêm trọng) - đỏ
        violations.forEach(v => {
            const icon = v.type === 'missing_in' || v.type === 'missing_out' ? '✗' : '⚠';
            items.push(`<span class="inline-flex items-center gap-0.5 text-[10px] text-red-600 bg-red-50 px-1.5 py-0.5 rounded border border-red-100 font-medium">${icon} ${v.label}</span>`);
        });

        // Warnings (cảnh báo nhẹ) - vàng, chỉ hiện label ngắn gọn
        warnings.forEach(w => {
            items.push(`<span class="inline-flex items-center gap-0.5 text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100">${w.label}</span>`);
        });

        // OK - xanh
        if (items.length === 0) {
            return '<span class="inline-flex items-center gap-0.5 text-[10px] text-green-600 bg-green-50 px-1.5 py-0.5 rounded border border-green-100 font-medium">✓ Đúng giờ</span>';
        }

        return `<div class="flex flex-wrap gap-1">${items.join('')}</div>`;
    };

    /**
     * Render chi tiết phân tích đầy đủ (cho SX hoặc khi cần detail)
     */
    const renderDetailedAnalysis = (analysis) => {
        if (!analysis) return '<span class="text-[10px] text-slate-300">-</span>';

        const { violations, warnings, info } = analysis;
        const parts = [];

        // Violations
        violations.forEach(v => parts.push(
            `<div class="text-[10px] text-red-600 bg-red-50 px-1.5 py-0.5 rounded border border-red-100 font-medium mb-0.5">
                <i class="fa-solid fa-circle-exclamation mr-0.5"></i>${v.label}
            </div>`
        ));

        // Warnings với info
        warnings.forEach(w => parts.push(
            `<div class="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100 mb-0.5">
                ${w.label}${w.info ? `<span class="text-[9px] text-amber-500 ml-1">${w.info}</span>` : ''}
            </div>`
        ));

        // Info - chỉ hiện 1 dòng tóm tắt quan trọng nhất
        if (parts.length === 0 && info.length > 0) {
            parts.push(`<div class="text-[9px] text-slate-500">${info[0].label}</div>`);
        }

        return parts.length > 0 ? parts.join('') : '<span class="text-[10px] text-slate-300">-</span>';
    };

    // ===== ROW RENDERING =====

    /**
     * Render các ô chung (Checkbox, Tên, Giờ vào/ra) cho cả VP và SX
     */
    const renderCommonCells = (emp, scheduleIn, scheduleOut, accent = 'blue') => {
        const s = emp.uiState;
        const isChecked = s.isActive !== false ? 'checked' : '';
        
        const subInfoHtml = `
            <span class="bg-slate-100 px-1 rounded border border-slate-200 text-slate-600 text-[11px]">${emp.manhanvien || '?'}</span>
            <span class="text-slate-400 mx-0.5">|</span>
            <span class="font-mono text-blue-600 font-semibold text-[11.5px]" title="Ca làm việc">${scheduleIn} - ${scheduleOut}</span>
        `;

        return `
            <td class="p-1 border-r border-slate-200 text-center sticky left-0 bg-white z-20 shadow-[2px_0_4px_rgba(0,0,0,0.03)]">
                <input type="checkbox" ${isChecked} class="row-cb accent-${accent}-600 w-3.5 h-3.5 cursor-pointer mt-1.5">
            </td>
            <td class="px-2 py-1.5 border-r border-slate-200">
                <div class="font-bold text-slate-700 text-[13px] truncate max-w-[160px]">${emp.hovaten}</div>
                <div class="text-[11px] truncate flex items-center mt-0.5">${subInfoHtml}</div>
            </td>
            <td class="p-0.5 border-r border-slate-200">
                <input type="time" value="${s.in || ''}" class="cell-input inp-in mt-1 !text-[13px]">
            </td>
            <td class="p-0.5 border-r border-slate-200">
                <input type="time" value="${s.out || ''}" class="cell-input inp-out mt-1 !text-[13px]">
            </td>`;
    };

    /**
     * Render các ô riêng cho tab Văn Phòng
     */
    const renderVPCells = (s) => `
        <td class="px-2 py-1 border-r border-slate-200">
            <div class="analysis-result flex flex-wrap gap-0.5 min-h-[16px] mt-1">
                <span class="text-[10px] text-slate-300">-</span>
            </div>
        </td>
        <td class="p-0.5 border-r border-slate-200 text-center">
            <input type="checkbox" class="chk-lunch w-3.5 h-3.5 cursor-pointer accent-blue-600 mt-1.5" ${s.lunch ? 'checked' : ''}>
        </td>
        <td class="p-0.5 border-r border-slate-200 text-center">
            <input type="checkbox" class="chk-ot w-3.5 h-3.5 accent-orange-500 cursor-pointer mt-1.5" ${s.ot ? 'checked' : ''}>
        </td>
        <td class="px-2 py-1">
            <input type="text" class="w-full text-xs border-b border-transparent focus:border-blue-300 outline-none bg-transparent placeholder-slate-300 mt-0.5" placeholder="...">
        </td>`;

    /**
     * Render các ô riêng cho tab Sản Xuất
     */
    const renderSXCells = (s, jobs) => {
        const jobOpts = jobs.map(j => `<option value="${j.id}">${j.tencongviec}</option>`);

        const jobListHtml = s.jobs.map((jobItem, index) => {
            const currentOpts = jobItem.jobId 
                ? jobOpts.join('').replace(`value="${jobItem.jobId}"`, `value="${jobItem.jobId}" selected`)
                : jobOpts.join('');
            
            const showDelete = index > 0 || s.jobs.length > 1 || jobItem.jobId;
            const deleteBtn = showDelete
                ? `<button class="btn-remove-job w-6 h-6 flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-all ml-auto shrink-0" data-index="${index}" title="Xóa"><i class="fa-solid fa-xmark text-xs"></i></button>` 
                : `<div class="w-6 h-6 ml-auto shrink-0"></div>`;

            return `
                <div class="job-row flex items-center gap-2 p-1.5 border-b border-dashed border-slate-200 last:border-0 hover:bg-orange-50/40 transition-colors group/job relative">
                    <div class="w-5 h-5 flex items-center justify-center bg-orange-100 text-orange-700 text-[10px] font-bold rounded-full border border-orange-200 shadow-sm select-none shrink-0">${index + 1}</div>
                    <div class="w-[150px] shrink-0">
                        <select class="job-select w-full text-xs font-medium text-slate-700 border border-slate-200 rounded py-0.5 px-1.5 focus:border-orange-500 outline-none bg-white shadow-sm h-[26px]" data-index="${index}">
                            <option value="">--</option>${currentOpts}
                        </select>
                    </div>
                    <div class="flex-1 flex flex-wrap items-center gap-2 min-h-[26px]">
                        ${renderJobParams(jobItem, index, jobs)}
                    </div>
                    ${deleteBtn}
                </div>`;
        }).join('');

        return `
            <td class="p-0 border-r border-slate-200 align-top">
                <div class="flex flex-col w-full">
                    ${jobListHtml}
                    <div class="flex justify-center py-1.5">
                        <button class="btn-add-job text-xs text-slate-400 hover:text-orange-500 font-medium transition-colors" title="Thêm">+ Thêm</button>
                    </div>
                </div>
            </td>
            <td class="p-0.5 border-r border-slate-200 text-center align-top pt-3">
                <input type="checkbox" class="chk-lunch w-3.5 h-3.5 cursor-pointer accent-blue-600" ${s.lunch ? 'checked' : ''}>
            </td>
            <td class="p-0.5 text-center align-top pt-3">
                <input type="checkbox" class="chk-ot w-3.5 h-3.5 accent-orange-500 cursor-pointer" ${s.ot ? 'checked' : ''}>
            </td>`;
    };

    /**
     * Render params cho một công việc trong SX
     */
    const renderJobParams = (jobItem, index, jobs) => {
        if (!jobItem.jobId) {
            return `<span class="text-[11px] text-slate-300 italic pl-1 select-none font-light">Chọn công việc...</span>`;
        }
        
        const jobDef = jobs.find(j => j.id == jobItem.jobId);
        if (!jobDef) return '';

        const paramsDef = parseParams(jobDef.danhsachthamso);
        return paramsDef.map(p => {
            const val = jobItem.params[p.ma] !== undefined ? jobItem.params[p.ma] : (p.giatri_macdinh || '');
            return `
                <div class="flex items-center bg-white border border-slate-200 rounded overflow-hidden h-[24px] shadow-sm hover:border-orange-300 transition-colors">
                    <div class="bg-slate-50 text-[9px] text-slate-500 font-bold px-1.5 h-full flex items-center border-r border-slate-100 uppercase tracking-wider select-none">${p.ma}</div>
                    <input type="text" class="param-val w-11 text-center text-xs font-semibold text-slate-700 bg-transparent border-none outline-none h-full focus:bg-orange-50 px-1" 
                        data-index="${index}" data-key="${p.ma}" value="${val}">
                </div>`;
        }).join('');
    };

    /**
     * Render params cho Master (áp dụng hàng loạt)
     */
    const renderMasterParams = (job) => {
        const params = parseParams(job.danhsachthamso);
        return params.map(p => `
            <div class="param-group bg-orange-50 border-orange-200">
                <label class="param-label text-orange-700">${p.ma}</label>
                <input type="text" class="param-val m-p-val text-orange-800" data-key="${p.ma}" value="${p.giatri_macdinh || ''}">
            </div>
        `).join('');
    };

    // ===== PUBLIC API =====
    return {
        formatTimeDisplay,
        parseParams,
        renderAnalysisBadge,
        renderCompactAnalysis,
        renderDetailedAnalysis,
        renderCommonCells,
        renderVPCells,
        renderSXCells,
        renderJobParams,
        renderMasterParams
    };
})();

// Export
window.ChamCongRenderHelper = ChamCongRenderHelper;
