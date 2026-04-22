/**
 * Reusable date picker components:
 * - CustomMonthYearPicker
 * - CustomDatePicker
 */
(function () {
    const pickerRegistry = new Set();

    function autoPlacePopover(popover) {
        if (!popover) return;

        const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
        const safeMargin = 12;

        popover.style.left = '0';
        popover.style.right = 'auto';
        popover.style.transform = '';

        let rect = popover.getBoundingClientRect();

        if (rect.right > viewportWidth - safeMargin) {
            popover.style.left = 'auto';
            popover.style.right = '0';
            popover.style.transform = '';
            rect = popover.getBoundingClientRect();
        }

        if (rect.left < safeMargin) {
            const shiftRight = safeMargin - rect.left;
            popover.style.transform = `translateX(${shiftRight}px)`;
            rect = popover.getBoundingClientRect();
        }

        if (rect.right > viewportWidth - safeMargin) {
            const shiftLeft = rect.right - (viewportWidth - safeMargin);
            const currentTransform = popover.style.transform || '';
            popover.style.transform = `${currentTransform} translateX(${-shiftLeft}px)`.trim();
        }
    }

    function closeAllPickers(exceptInstance) {
        pickerRegistry.forEach((instance) => {
            if (instance !== exceptInstance && typeof instance.close === 'function') {
                instance.close();
            }
        });
    }

    function getElement(ref) {
        if (!ref) return null;
        if (ref instanceof HTMLElement) return ref;
        return document.getElementById(ref);
    }

    function pad(value) {
        return String(value).padStart(2, '0');
    }

    function parseInputDate(value) {
        if (!value) return null;
        const date = new Date(`${value}T00:00:00`);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    function toInputValue(date) {
        if (!date || Number.isNaN(date.getTime())) return '';
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    }

    function formatDateDisplay(date) {
        if (!date || Number.isNaN(date.getTime())) return '';
        return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
    }

    function isSameDay(first, second) {
        if (!first || !second) return false;
        return first.getFullYear() === second.getFullYear()
            && first.getMonth() === second.getMonth()
            && first.getDate() === second.getDate();
    }

    function isOutOfRange(date, minDate, maxDate) {
        if (!date) return true;
        if (minDate && date < minDate) return true;
        if (maxDate && date > maxDate) return true;
        return false;
    }

    class CustomMonthYearPicker {
        constructor(options) {
            this.options = Object.assign({
                triggerId: null,
                popoverId: null,
                displayId: null,
                pickerYearId: null,
                prevYearId: null,
                nextYearId: null,
                monthGridId: null,
                selectedMonth: null,
                selectedYear: null,
                monthGridColumns: 4,
                placeholder: '-- Chọn tháng --',
                displayFormatter: (year, month) => `${pad(month)}/${year}`,
                monthLabelFormatter: (month) => `Thg ${pad(month)}`,
                selectedClass: 'bg-blue-500 text-white font-bold',
                currentClass: 'bg-blue-100 text-blue-700 font-medium ring-1 ring-blue-300',
                defaultClass: 'hover:bg-blue-50 hover:text-blue-600 text-slate-700',
                buttonBaseClass: 'py-2 text-sm rounded transition-colors cursor-pointer',
                canOpen: () => true,
                onOpenDenied: null,
                onChange: null
            }, options || {});

            this.elements = {
                trigger: getElement(this.options.triggerId),
                popover: getElement(this.options.popoverId),
                display: getElement(this.options.displayId),
                pickerYear: getElement(this.options.pickerYearId),
                prevYearBtn: getElement(this.options.prevYearId),
                nextYearBtn: getElement(this.options.nextYearId),
                monthGrid: getElement(this.options.monthGridId)
            };

            if (!this.elements.trigger || !this.elements.popover || !this.elements.display || !this.elements.monthGrid || !this.elements.pickerYear) {
                return;
            }

            pickerRegistry.add(this);

            const now = new Date();
            this.state = {
                selectedMonth: Number.isInteger(this.options.selectedMonth) ? this.options.selectedMonth : null,
                selectedYear: Number.isInteger(this.options.selectedYear) ? this.options.selectedYear : null,
                viewYear: Number.isInteger(this.options.selectedYear) ? this.options.selectedYear : now.getFullYear(),
                currentMonth: now.getMonth() + 1,
                currentYear: now.getFullYear()
            };

            this.handleDocumentClick = this.handleDocumentClick.bind(this);
            this.handleWindowResize = this.handleWindowResize.bind(this);
            this.bindEvents();
            this.renderMonthGrid();
            this.updateDisplay();
        }

        bindEvents() {
            this.elements.trigger.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();

                if (!this.options.canOpen()) {
                    if (typeof this.options.onOpenDenied === 'function') {
                        this.options.onOpenDenied();
                    }
                    return;
                }

                this.toggle();
            });

            if (this.elements.prevYearBtn) {
                this.elements.prevYearBtn.addEventListener('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    this.state.viewYear -= 1;
                    this.renderMonthGrid();
                });
            }

            if (this.elements.nextYearBtn) {
                this.elements.nextYearBtn.addEventListener('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    this.state.viewYear += 1;
                    this.renderMonthGrid();
                });
            }

            this.elements.monthGrid.addEventListener('click', (event) => {
                const monthButton = event.target.closest('button[data-month]');
                if (!monthButton) return;

                event.preventDefault();
                event.stopPropagation();

                const selectedMonth = parseInt(monthButton.dataset.month, 10);
                if (!Number.isInteger(selectedMonth)) return;

                this.setValue(this.state.viewYear, selectedMonth);
                this.close();

                if (typeof this.options.onChange === 'function') {
                    this.options.onChange({
                        year: this.state.selectedYear,
                        month: this.state.selectedMonth
                    });
                }
            });

            document.addEventListener('click', this.handleDocumentClick);
            window.addEventListener('resize', this.handleWindowResize);
        }

        handleWindowResize() {
            if (!this.isOpen()) return;
            this.positionPopover();
        }

        handleDocumentClick(event) {
            if (!this.isOpen()) return;

            if (this.elements.trigger.contains(event.target) || this.elements.popover.contains(event.target)) {
                return;
            }

            this.close();
        }

        renderMonthGrid() {
            this.elements.pickerYear.textContent = String(this.state.viewYear);
            const columnClass = this.options.monthGridColumns === 3 ? 'grid-cols-3' : 'grid-cols-4';
            this.elements.monthGrid.className = `grid gap-2 ${columnClass}`;

            const isCurrentYear = this.state.viewYear === this.state.currentYear;
            let html = '';

            for (let month = 1; month <= 12; month += 1) {
                const isSelected = this.state.selectedYear === this.state.viewYear
                    && this.state.selectedMonth === month;
                const isCurrentMonth = isCurrentYear && month === this.state.currentMonth;

                let className = this.options.buttonBaseClass;
                if (isSelected) {
                    className += ` ${this.options.selectedClass}`;
                } else if (isCurrentMonth) {
                    className += ` ${this.options.currentClass}`;
                } else {
                    className += ` ${this.options.defaultClass}`;
                }

                html += `
                    <button type="button" class="${className}" data-month="${month}">
                        ${this.options.monthLabelFormatter(month)}
                    </button>
                `;
            }

            this.elements.monthGrid.innerHTML = html;
        }

        updateDisplay() {
            if (!Number.isInteger(this.state.selectedYear) || !Number.isInteger(this.state.selectedMonth)) {
                this.elements.display.textContent = this.options.placeholder;
                return;
            }

            this.elements.display.textContent = this.options.displayFormatter(
                this.state.selectedYear,
                this.state.selectedMonth
            );
        }

        setValue(year, month, config) {
            const options = Object.assign({ silent: false }, config || {});

            if (!Number.isInteger(year) || !Number.isInteger(month)) {
                this.clear(options);
                return;
            }

            this.state.selectedYear = year;
            this.state.selectedMonth = month;
            this.state.viewYear = year;
            this.updateDisplay();
            this.renderMonthGrid();

            if (!options.silent && typeof this.options.onChange === 'function') {
                this.options.onChange({ year, month });
            }
        }

        clear(config) {
            const options = Object.assign({ silent: false }, config || {});
            this.state.selectedYear = null;
            this.state.selectedMonth = null;
            this.updateDisplay();
            this.renderMonthGrid();

            if (!options.silent && typeof this.options.onChange === 'function') {
                this.options.onChange({ year: null, month: null });
            }
        }

        isOpen() {
            return !this.elements.popover.classList.contains('hidden');
        }

        open() {
            closeAllPickers(this);
            this.renderMonthGrid();
            this.elements.popover.classList.remove('hidden');
            this.positionPopover();
        }

        positionPopover() {
            autoPlacePopover(this.elements.popover);
        }

        close() {
            this.elements.popover.classList.add('hidden');
        }

        toggle() {
            if (this.isOpen()) {
                this.close();
            } else {
                this.open();
            }
        }
    }

    class CustomDatePicker {
        constructor(options) {
            this.options = Object.assign({
                inputId: null,
                compact: false,
                showIcon: true,
                placeholder: 'Chọn ngày',
                weekdayLabels: ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'],
                monthLabels: [
                    'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
                    'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'
                ],
                triggerClass: '',
                popoverClass: '',
                selectedDayClass: 'bg-blue-500 text-white border-blue-500',
                todayDayClass: 'border-blue-300 text-blue-700',
                normalDayClass: 'text-slate-700 hover:bg-blue-50 hover:border-blue-200',
                adjacentMonthDayClass: 'text-slate-300 hover:text-slate-500 hover:bg-slate-50 hover:border-slate-200',
                onChange: null
            }, options || {});

            this.input = getElement(this.options.inputId);
            if (!this.input || this.input.dataset.customDatePickerReady === 'true') {
                return;
            }

            this.input.dataset.customDatePickerReady = 'true';
            pickerRegistry.add(this);

            const selectedDate = parseInputDate(this.input.value);
            const now = new Date();
            this.state = {
                selectedDate,
                viewDate: selectedDate || new Date(now.getFullYear(), now.getMonth(), 1)
            };

            this.handleDocumentClick = this.handleDocumentClick.bind(this);
            this.handleWindowResize = this.handleWindowResize.bind(this);

            this.buildUI();
            this.bindEvents();
            this.syncFromInput();
        }

        buildUI() {
            const mount = this.input.parentElement;
            this.mount = mount;
            this.mount.classList.add('relative');

            this.input.classList.add('absolute', 'opacity-0', 'pointer-events-none', 'w-0', 'h-0', '-z-10');
            this.input.setAttribute('tabindex', '-1');

            this.trigger = document.createElement('button');
            this.trigger.type = 'button';

            const triggerBaseClass = this.options.compact
                ? 'inline-flex items-center justify-between gap-1.5 px-1 py-0.5 text-xs rounded text-slate-700 hover:text-blue-600 transition-colors min-w-[90px]'
                : 'w-full px-4 py-2 border border-slate-300 rounded-lg bg-white text-left flex items-center justify-between gap-2 focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all';

            this.trigger.className = `${triggerBaseClass} ${this.options.triggerClass}`.trim();

            this.displayEl = document.createElement('span');
            this.displayEl.className = this.options.compact
                ? 'truncate text-slate-700'
                : 'text-slate-900 truncate';
            this.trigger.appendChild(this.displayEl);

            if (this.options.showIcon) {
                const icon = document.createElement('i');
                icon.className = this.options.compact
                    ? 'far fa-calendar text-slate-400 text-[10px]'
                    : 'far fa-calendar-alt text-slate-400';
                this.trigger.appendChild(icon);
            }

            this.popover = document.createElement('div');
            this.popover.className = `hidden absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl z-50 p-3 w-72 ${this.options.popoverClass}`.trim();

            this.popover.innerHTML = `
                <div class="flex items-center justify-between mb-3 border-b border-slate-100 pb-2">
                    <button type="button" data-action="prev" class="p-1.5 hover:bg-slate-100 rounded text-slate-500 transition-colors">
                        <i class="fas fa-chevron-left text-[11px]"></i>
                    </button>
                    <span data-role="month-label" class="text-sm font-semibold text-slate-700"></span>
                    <button type="button" data-action="next" class="p-1.5 hover:bg-slate-100 rounded text-slate-500 transition-colors">
                        <i class="fas fa-chevron-right text-[11px]"></i>
                    </button>
                </div>
                <div class="grid grid-cols-7 gap-1 mb-1" data-role="weekday-row"></div>
                <div class="grid grid-cols-7 gap-1" data-role="day-grid"></div>
            `;

            this.mount.appendChild(this.trigger);
            this.mount.appendChild(this.popover);

            this.monthLabelEl = this.popover.querySelector('[data-role="month-label"]');
            this.weekdayRowEl = this.popover.querySelector('[data-role="weekday-row"]');
            this.dayGridEl = this.popover.querySelector('[data-role="day-grid"]');

            this.renderWeekdays();
        }

        renderWeekdays() {
            this.weekdayRowEl.innerHTML = this.options.weekdayLabels.map((label) => (
                `<div class="h-6 flex items-center justify-center text-[10px] font-semibold text-slate-400">${label}</div>`
            )).join('');
        }

        bindEvents() {
            this.trigger.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                this.toggle();
            });

            this.popover.addEventListener('click', (event) => {
                const actionButton = event.target.closest('button[data-action]');
                if (actionButton) {
                    event.preventDefault();
                    event.stopPropagation();
                    const action = actionButton.dataset.action;
                    this.changeMonth(action === 'next' ? 1 : -1);
                    return;
                }

                const dayButton = event.target.closest('button[data-date]');
                if (!dayButton || dayButton.disabled) {
                    return;
                }

                event.preventDefault();
                event.stopPropagation();

                const selectedDate = parseInputDate(dayButton.dataset.date);
                if (!selectedDate) return;

                this.state.selectedDate = selectedDate;
                this.input.value = dayButton.dataset.date;
                this.input.dispatchEvent(new Event('change', { bubbles: true }));

                if (typeof this.options.onChange === 'function') {
                    this.options.onChange(dayButton.dataset.date);
                }

                this.syncFromInput();
                this.close();
            });

            this.input.addEventListener('change', () => {
                this.syncFromInput();
            });

            document.addEventListener('click', this.handleDocumentClick);
            window.addEventListener('resize', this.handleWindowResize);
        }

        handleWindowResize() {
            if (!this.isOpen()) return;
            this.positionPopover();
        }

        handleDocumentClick(event) {
            if (!this.isOpen()) return;
            if (this.mount.contains(event.target)) return;
            this.close();
        }

        changeMonth(step) {
            const viewDate = this.state.viewDate || new Date();
            this.state.viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() + step, 1);
            this.renderCalendar();
        }

        renderCalendar() {
            const viewDate = this.state.viewDate || new Date();
            const year = viewDate.getFullYear();
            const month = viewDate.getMonth();

            this.monthLabelEl.textContent = `${this.options.monthLabels[month]} ${year}`;

            const firstDayOfMonth = new Date(year, month, 1);
            const startOffset = firstDayOfMonth.getDay();
            const gridStartDate = new Date(year, month, 1 - startOffset);

            const selectedDate = this.state.selectedDate;
            const today = new Date();
            const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
            const minDate = parseInputDate(this.input.min);
            const maxDate = parseInputDate(this.input.max);

            let html = '';

            for (let index = 0; index < 42; index += 1) {
                const candidate = new Date(gridStartDate);
                candidate.setDate(gridStartDate.getDate() + index);
                const candidateValue = toInputValue(candidate);
                const disabled = isOutOfRange(candidate, minDate, maxDate);
                const isSelected = selectedDate && isSameDay(candidate, selectedDate);
                const isToday = isSameDay(candidate, todayDate);
                const isCurrentMonth = candidate.getMonth() === month;

                let className = 'h-8 w-8 rounded-md border border-transparent text-xs font-medium flex items-center justify-center transition-colors ';

                if (disabled) {
                    className += 'text-slate-300 border-transparent cursor-not-allowed';
                } else if (isSelected) {
                    className += this.options.selectedDayClass;
                } else if (!isCurrentMonth) {
                    className += this.options.adjacentMonthDayClass;
                } else if (isToday) {
                    className += ` ${this.options.todayDayClass} ${this.options.normalDayClass}`;
                } else {
                    className += this.options.normalDayClass;
                }

                html += `
                    <button type="button" class="${className}" data-date="${candidateValue}" ${disabled ? 'disabled' : ''}>
                        ${candidate.getDate()}
                    </button>
                `;
            }

            this.dayGridEl.innerHTML = html;
        }

        syncFromInput() {
            const selectedDate = parseInputDate(this.input.value);
            this.state.selectedDate = selectedDate;

            if (selectedDate) {
                this.state.viewDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
                this.displayEl.textContent = formatDateDisplay(selectedDate);
            } else {
                this.displayEl.textContent = this.options.placeholder;
            }

            this.renderCalendar();
        }

        setValue(value, config) {
            const options = Object.assign({ silent: false }, config || {});
            this.input.value = value || '';
            this.syncFromInput();

            if (!options.silent) {
                this.input.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }

        isOpen() {
            return !this.popover.classList.contains('hidden');
        }

        open() {
            closeAllPickers(this);
            this.renderCalendar();
            this.popover.classList.remove('hidden');
            this.positionPopover();
        }

        positionPopover() {
            autoPlacePopover(this.popover);
        }

        close() {
            this.popover.classList.add('hidden');
        }

        toggle() {
            if (this.isOpen()) {
                this.close();
            } else {
                this.open();
            }
        }
    }

    window.CustomDateComponents = window.CustomDateComponents || {};
    window.CustomDateComponents.CustomMonthYearPicker = CustomMonthYearPicker;
    window.CustomDateComponents.CustomDatePicker = CustomDatePicker;
})();
