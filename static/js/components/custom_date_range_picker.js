/**
 * Reusable date-range adapter for CustomDateComponents.CustomDatePicker.
 * Values are always ISO dates (YYYY-MM-DD), matching native date inputs and APIs.
 */
class CustomDateRangePicker {
    constructor(options = {}) {
        this._startInput = this._resolve(options.startInput);
        this._endInput = this._resolve(options.endInput);
        this._minDate = this._toISO(options.minDate);
        this._maxDate = this._toISO(options.maxDate);
        this._onChange = null;
        this._startPicker = null;
        this._endPicker = null;

        this._handleStartChange = () => this._handleChange('start');
        this._handleEndChange = () => this._handleChange('end');
        this._init();
    }

    _resolve(ref) {
        return typeof ref === 'string' ? document.getElementById(ref) : ref;
    }

    _toISO(value) {
        if (!value) return '';
        if (value instanceof Date && !Number.isNaN(value.getTime())) {
            const y = value.getFullYear();
            const m = String(value.getMonth() + 1).padStart(2, '0');
            const d = String(value.getDate()).padStart(2, '0');
            return `${y}-${m}-${d}`;
        }
        const raw = String(value).trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
        const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        return match ? `${match[3]}-${match[2]}-${match[1]}` : '';
    }

    _init() {
        if (!this._startInput || !this._endInput) {
            console.warn('CustomDateRangePicker: missing start or end input.');
            return;
        }
        const Picker = window.CustomDateComponents?.CustomDatePicker;
        if (!Picker) {
            console.error('CustomDateRangePicker requires CustomDateComponents.CustomDatePicker.');
            return;
        }

        this.setBounds(this._minDate, this._maxDate);
        this._startPicker = new Picker({ inputId: this._startInput.id, placeholder: 'Từ ngày' });
        this._endPicker = new Picker({ inputId: this._endInput.id, placeholder: 'Đến ngày' });
        this._startInput.addEventListener('change', this._handleStartChange);
        this._endInput.addEventListener('change', this._handleEndChange);
        this.sync();
    }

    _handleChange(changedSide) {
        const { start, end } = this.getRange();
        if (start && end && start > end) {
            if (changedSide === 'start') this._endPicker?.setValue('', { silent: true });
            else this._startPicker?.setValue('', { silent: true });
        }
        this.sync();
        this._onChange?.(this.getRange());
    }

    setRange(startDate, endDate, options = {}) {
        this._startPicker?.setValue(this._toISO(startDate), { silent: true });
        this._endPicker?.setValue(this._toISO(endDate), { silent: true });
        this.sync();
        if (!options.silent) this._onChange?.(this.getRange());
    }

    getRange() {
        return {
            start: this._startInput?.value || null,
            end: this._endInput?.value || null,
        };
    }

    setBounds(minDate, maxDate) {
        this._minDate = this._toISO(minDate);
        this._maxDate = this._toISO(maxDate);
        if (this._startInput) {
            this._startInput.min = this._minDate;
            this._startInput.max = this._maxDate;
        }
        if (this._endInput) {
            this._endInput.min = this._minDate;
            this._endInput.max = this._maxDate;
        }
        this.sync();
    }

    clear(options = {}) {
        this._startPicker?.setValue('', { silent: true });
        this._endPicker?.setValue('', { silent: true });
        if (!this._startPicker && this._startInput) this._startInput.value = '';
        if (!this._endPicker && this._endInput) this._endInput.value = '';
        this.sync();
        if (!options.silent) this._onChange?.({ start: null, end: null });
    }

    sync() {
        if (!this._startInput || !this._endInput) return;
        this._startInput.min = this._minDate;
        this._startInput.max = this._endInput.value || this._maxDate;
        this._endInput.min = this._startInput.value || this._minDate;
        this._endInput.max = this._maxDate;
        this._startPicker?.syncFromInput();
        this._endPicker?.syncFromInput();
    }

    onChange(callback) {
        this._onChange = typeof callback === 'function' ? callback : null;
        return this;
    }

    destroy() {
        this._startInput?.removeEventListener('change', this._handleStartChange);
        this._endInput?.removeEventListener('change', this._handleEndChange);
        this._onChange = null;
    }
}

window.CustomDateRangePicker = CustomDateRangePicker;
