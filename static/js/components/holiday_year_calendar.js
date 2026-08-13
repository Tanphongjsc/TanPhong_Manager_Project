/**
 * HolidayYearCalendar
 * Renders a 12-month year grid for holiday management.
 *
 * Responsibilities:
 *   - Render grid (12 months × up to 37 day columns)
 *   - Color-code cells based on day type
 *   - Emit cell click events
 *   - Update individual day states
 *   - Accessibility (aria-label, keyboard nav)
 *
 * Does NOT:
 *   - Call APIs
 *   - Open sidebars
 *   - Validate business rules
 *   - Expand recurrence rules
 *
 * Public API:
 *   setYear(year)
 *   setMinDate(minDate)     — Date object or 'YYYY-MM-DD'
 *   setDays(days)           — Array of day objects { Ngay, LoaiLichNghi, TenNgayNghi, ... }
 *   upsertDay(day)          — Add or update a single day
 *   removeDay(dateStr)      — Remove by 'YYYY-MM-DD'
 *   render()
 *   destroy()
 *   onCellClick(callback)   — callback({ date, item, isPast, isToday })
 */
class HolidayYearCalendar {
    constructor(containerId, options = {}) {
        this._container = typeof containerId === 'string'
            ? document.getElementById(containerId)
            : containerId;
        this._year = options.year || new Date().getFullYear();
        this._minDate = null;
        this._days = new Map(); // key: 'YYYY-MM-DD', value: day object
        this._onCellClick = null;
        this._today = this._toISO(new Date());

        if (options.minDate) this.setMinDate(options.minDate);
        if (options.days) this.setDays(options.days);
    }

    // ── Utilities ────────────────────────────────────────────────

    _toISO(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    _parseISO(str) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(str || '')) return null;
        const [year, month, day] = str.split('-').map(Number);
        const parsed = new Date(year, month - 1, day);
        if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) {
            return null;
        }
        return parsed;
    }

    _getDaysInMonth(year, month) {
        return new Date(year, month + 1, 0).getDate();
    }

    /** 0=Mon … 6=Sun (ISO weekday, Mon=0) */
    _getWeekdayISO(year, month, day) {
        const d = new Date(year, month, day);
        return (d.getDay() + 6) % 7; // convert Sun=0 to Sun=6
    }

    _formatVietnamese(dateStr) {
        const d = this._parseISO(dateStr);
        if (!d) return dateStr;
        const dow = ['Chủ Nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
        return `${dow[d.getDay()]}, ${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
    }

    // ── Public API ───────────────────────────────────────────────

    setYear(year) {
        this._year = parseInt(year, 10);
        this.render();
    }

    setMinDate(minDate) {
        if (typeof minDate === 'string') {
            this._minDate = minDate;
        } else if (minDate instanceof Date) {
            this._minDate = this._toISO(minDate);
        }
    }

    setDays(days) {
        this._days.clear();
        if (Array.isArray(days)) {
            days.forEach(d => {
                const date = d.Ngay || d.ngay;
                if (date) this._days.set(date, d);
            });
        }
    }

    upsertDay(day) {
        if (day && day.Ngay) {
            this._days.set(day.Ngay, day);
            this._refreshCell(day.Ngay);
        }
    }

    removeDay(dateStr) {
        this._days.delete(dateStr);
        this._refreshCell(dateStr);
    }

    onCellClick(callback) {
        this._onCellClick = callback;
        return this;
    }

    render() {
        if (!this._container) return;
        this._container.innerHTML = '';

        const MONTH_NAMES = ['Tháng 1','Tháng 2','Tháng 3','Tháng 4',
                             'Tháng 5','Tháng 6','Tháng 7','Tháng 8',
                             'Tháng 9','Tháng 10','Tháng 11','Tháng 12'];
        const DAY_LABELS = ['T2','T3','T4','T5','T6','T7','CN'];

        // Build the header row (day labels)
        // We need to figure out max columns = max(31 + offset) across months
        // Use 37 columns for safety (max offset=6 + 31 days)
        const TOTAL_COLS = 37;

        const table = document.createElement('table');
        table.className = 'border-collapse text-sm select-none';
        table.style.tableLayout = 'fixed';
        table.style.width = '1812px';
        table.style.minWidth = '1812px';
        table.setAttribute('role', 'grid');
        table.setAttribute('aria-label', `Lịch nghỉ năm ${this._year}`);

        // ── HEADER ──
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        headerRow.className = 'bg-slate-100 border-b border-slate-200';

        // Month label cell
        const thMonth = document.createElement('th');
        thMonth.className = 'sticky left-0 z-10 bg-slate-100 px-3 py-2.5 text-left font-semibold text-slate-600 whitespace-nowrap border-r border-slate-200';
        thMonth.style.width = '110px';
        thMonth.style.minWidth = '110px';
        thMonth.textContent = '';
        headerRow.appendChild(thMonth);

        // Day-of-week label cells
        for (let col = 0; col < TOTAL_COLS; col++) {
            const th = document.createElement('th');
            const dowLabel = DAY_LABELS[col % 7];
            th.className = [
                'py-2.5 font-semibold text-slate-500 border-r border-slate-100',
                (col % 7 === 5 || col % 7 === 6) ? 'text-blue-500' : ''
            ].join(' ').trim();
            th.style.width = '46px';
            th.style.minWidth = '46px';
            th.textContent = dowLabel;
            th.setAttribute('scope', 'col');
            headerRow.appendChild(th);
        }
        thead.appendChild(headerRow);
        table.appendChild(thead);

        // ── BODY ──
        const tbody = document.createElement('tbody');

        for (let monthIdx = 0; monthIdx < 12; monthIdx++) {
            const tr = document.createElement('tr');
            tr.className = 'border-b border-slate-100 hover:bg-slate-50/50 transition-colors';
            tr.setAttribute('data-month', monthIdx + 1);

            // Month label cell
            const tdLabel = document.createElement('td');
            tdLabel.className = 'sticky left-0 z-10 bg-white px-3 py-2 text-slate-700 font-semibold whitespace-nowrap border-r border-slate-200 text-sm';
            tdLabel.style.background = 'white';
            tdLabel.textContent = MONTH_NAMES[monthIdx];
            tr.appendChild(tdLabel);

            const daysInMonth = this._getDaysInMonth(this._year, monthIdx);
            const firstWeekday = this._getWeekdayISO(this._year, monthIdx, 1); // 0=Mon
            for (let col = 0; col < TOTAL_COLS; col++) {
                const td = document.createElement('td');
                td.className = 'p-0 border-r border-slate-100';

                const dayNum = col - firstWeekday + 1;
                const isValidDay = dayNum >= 1 && dayNum <= daysInMonth;

                if (!isValidDay) {
                    td.setAttribute('aria-hidden', 'true');
                    tr.appendChild(td);
                    continue;
                }

                const dateStr = `${this._year}-${String(monthIdx + 1).padStart(2,'0')}-${String(dayNum).padStart(2,'0')}`;
                const item = this._days.get(dateStr) || null;
                const isPast = this._minDate ? dateStr < this._minDate : false;
                const isToday = dateStr === this._today;

                const btn = this._buildCell(dateStr, dayNum, col, item, isPast, isToday);
                td.setAttribute('data-date', dateStr);
                td.appendChild(btn);
                tr.appendChild(td);
            }

            tbody.appendChild(tr);
        }

        table.appendChild(tbody);
        this._container.appendChild(table);
    }

    _buildCell(dateStr, dayNum, col, item, isPast, isToday) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = String(dayNum).padStart(2, '0');
        btn.setAttribute('data-date', dateStr);
        btn.setAttribute('aria-label', this._buildAriaLabel(dateStr, item));

        this._applyStyle(btn, col, item, isPast, isToday);

        btn.addEventListener('click', () => {
            if (this._onCellClick) {
                this._onCellClick({ date: dateStr, item, isPast, isToday });
            }
        });

        return btn;
    }

    _applyStyle(btn, col, item, isPast, isToday) {
        let classes = 'w-full h-11 text-center text-sm font-medium rounded-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400 focus:z-10 relative';

        const isWeekend = col % 7 === 5 || col % 7 === 6;

        if (item) {
            const loai = item.LoaiLichNghi || item.loailichnghi || '';
            if (loai === 'NGHI_LE') {
                classes += ' bg-red-100 text-red-700 hover:bg-red-200 border border-red-200';
            } else {
                classes += ' bg-slate-200 text-slate-500 hover:bg-slate-300 border border-slate-300';
            }
        } else if (isPast) {
            classes += ' text-slate-300 bg-slate-50 cursor-default';
        } else {
            // Working day
            classes += ' bg-green-50 text-slate-600 hover:bg-green-100 border border-green-100';
            if (isWeekend) classes += ' text-blue-500';
        }

        if (isToday) {
            classes += ' ring-2 ring-blue-500 ring-offset-0 font-bold';
        }

        btn.className = classes;
        btn.disabled = false; // Allow click even on past (for view-only)
    }

    _refreshCell(dateStr) {
        const td = this._container ? this._container.querySelector(`td[data-date="${dateStr}"]`) : null;
        if (!td) return;

        const item = this._days.get(dateStr) || null;
        const isPast = this._minDate ? dateStr < this._minDate : false;
        const isToday = dateStr === this._today;
        const parts = dateStr.split('-');
        const year = parseInt(parts[0]), monthIdx = parseInt(parts[1]) - 1, dayNum = parseInt(parts[2]);

        // Recalculate col
        const firstWeekday = this._getWeekdayISO(year, monthIdx, 1);
        const col = firstWeekday + (dayNum - 1);

        const nextButton = this._buildCell(dateStr, dayNum, col, item, isPast, isToday);
        td.replaceChildren(nextButton);
    }

    _buildAriaLabel(dateStr, item) {
        const base = this._formatVietnamese(dateStr);
        if (!item) return base;
        const type = (item.LoaiLichNghi || item.loailichnghi) === 'NGHI_LE'
            ? 'ngày nghỉ lễ'
            : 'ngày nghỉ';
        const name = item.TenNgayNghi || item.tenngaynghi || '';
        return [base, type, name].filter(Boolean).join(', ');
    }

    destroy() {
        if (this._container) this._container.innerHTML = '';
    }
}
