/**
 * CustomYearPicker
 * Standalone year-only picker. Does NOT contain any business logic.
 *
 * Public API:
 *   setValue(year)
 *   getValue()
 *   setBounds(minYear, maxYear)
 *   open()
 *   close()
 *   destroy()
 *   onChange(callback)   — callback receives (year)
 */
class CustomYearPicker {
    constructor(options = {}) {
        this._triggerEl = typeof options.trigger === 'string'
            ? document.getElementById(options.trigger)
            : options.trigger;
        this._popoverEl = typeof options.popover === 'string'
            ? document.getElementById(options.popover)
            : options.popover;
        this._displayEl = typeof options.display === 'string'
            ? document.getElementById(options.display)
            : options.display;
        this._hiddenInput = typeof options.hiddenInput === 'string'
            ? document.getElementById(options.hiddenInput)
            : options.hiddenInput;
        this._gridEl = typeof options.grid === 'string'
            ? document.getElementById(options.grid)
            : options.grid;
        this._prevBtn = typeof options.prevBtn === 'string'
            ? document.getElementById(options.prevBtn)
            : options.prevBtn;
        this._nextBtn = typeof options.nextBtn === 'string'
            ? document.getElementById(options.nextBtn)
            : options.nextBtn;
        this._decadeLabel = typeof options.decadeLabel === 'string'
            ? document.getElementById(options.decadeLabel)
            : options.decadeLabel;

        let y = parseInt(options.initialYear, 10);
        if (isNaN(y) || y < 1900 || y > 2100) {
            y = new Date().getFullYear();
        }
        this._year = y;
        this._minYear = options.minYear || 2000;
        this._maxYear = options.maxYear || 2100;
        this._onChange = null;
        this._decadeStart = Math.floor(this._year / 10) * 10;
        this._isOpen = false;

        this._handleTriggerClick = (event) => {
            event.preventDefault();
            event.stopPropagation();
            this._isOpen ? this.close() : this.open();
        };
        this._handlePrevClick = (event) => {
            event.preventDefault();
            event.stopPropagation();
            this._decadeStart -= 10;
            this._renderGrid();
        };
        this._handleNextClick = (event) => {
            event.preventDefault();
            event.stopPropagation();
            this._decadeStart += 10;
            this._renderGrid();
        };
        this._init();
    }

    _init() {
        if (!this._triggerEl || !this._popoverEl) return;

        this._triggerEl.addEventListener('click', this._handleTriggerClick);

        if (this._prevBtn) {
            this._prevBtn.addEventListener('click', this._handlePrevClick);
        }
        if (this._nextBtn) {
            this._nextBtn.addEventListener('click', this._handleNextClick);
        }

        this._outsideClickHandler = (e) => {
            if (!this._popoverEl.contains(e.target) && !this._triggerEl.contains(e.target)) {
                this.close();
            }
        };

        this._renderGrid();
        this._updateDisplay();
    }

    _renderGrid() {
        if (!this._gridEl) return;
        if (this._decadeLabel) {
            this._decadeLabel.textContent = `${this._decadeStart} – ${this._decadeStart + 9}`;
        }

        // Update prev/next buttons disabled state
        if (this._prevBtn) {
            this._prevBtn.disabled = this._decadeStart - 1 < this._minYear;
            this._prevBtn.classList.toggle('opacity-30', this._prevBtn.disabled);
        }
        if (this._nextBtn) {
            this._nextBtn.disabled = this._decadeStart + 10 > this._maxYear;
            this._nextBtn.classList.toggle('opacity-30', this._nextBtn.disabled);
        }

        this._gridEl.innerHTML = '';
        for (let y = this._decadeStart; y <= this._decadeStart + 9; y++) {
            const isSelected = y === this._year;
            const isDisabled = y < this._minYear || y > this._maxYear;
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = String(y);
            btn.disabled = isDisabled;
            btn.className = [
                'rounded-lg py-1.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500',
                isDisabled ? 'text-slate-300 cursor-not-allowed' :
                isSelected ? 'bg-blue-600 text-white shadow-sm' :
                'text-slate-700 hover:bg-blue-50 hover:text-blue-600'
            ].join(' ');

            if (!isDisabled) {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.setValue(y);
                    this.close();
                });
            }
            this._gridEl.appendChild(btn);
        }
    }

    _updateDisplay() {
        if (this._displayEl) {
            this._displayEl.textContent = String(this._year);
        }
        if (this._hiddenInput) {
            this._hiddenInput.value = String(this._year);
        }
    }

    setValue(year, options = {}) {
        const y = parseInt(year, 10);
        if (isNaN(y)) return;
        const clamped = Math.max(this._minYear, Math.min(this._maxYear, y));
        this._year = clamped;
        this._decadeStart = Math.floor(clamped / 10) * 10;
        this._renderGrid();
        this._updateDisplay();
        if (!options.silent && this._onChange) this._onChange(this._year);
    }

    getValue() {
        return this._year;
    }

    setBounds(minYear, maxYear) {
        const min = parseInt(minYear, 10);
        const max = parseInt(maxYear, 10);
        if (!Number.isInteger(min) || !Number.isInteger(max) || min > max) return;
        this._minYear = min;
        this._maxYear = max;
        this.setValue(this._year, { silent: true });
    }

    open() {
        if (!this._popoverEl) return;
        this._popoverEl.classList.remove('hidden');
        this._isOpen = true;
        this._triggerEl?.setAttribute('aria-expanded', 'true');
        requestAnimationFrame(() => {
            document.addEventListener('click', this._outsideClickHandler);
        });
    }

    close() {
        if (!this._popoverEl) return;
        this._popoverEl.classList.add('hidden');
        this._isOpen = false;
        this._triggerEl?.setAttribute('aria-expanded', 'false');
        document.removeEventListener('click', this._outsideClickHandler);
    }

    onChange(callback) {
        this._onChange = callback;
        return this;
    }

    destroy() {
        this.close();
        document.removeEventListener('click', this._outsideClickHandler);
        this._triggerEl?.removeEventListener('click', this._handleTriggerClick);
        this._prevBtn?.removeEventListener('click', this._handlePrevClick);
        this._nextBtn?.removeEventListener('click', this._handleNextClick);
        this._onChange = null;
    }
}

window.CustomYearPicker = CustomYearPicker;
