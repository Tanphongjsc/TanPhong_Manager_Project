/**
 * CustomTimePicker Component
 * File: static/js/components/custom_time_picker.js
 * Mô tả: Component độc lập cho time picker (HH:MM format)
 * Usage: const picker = new CustomTimePicker(); picker.attach(inputElement);
 */

class CustomTimePicker {
    constructor() {
        this.activeInput = null;
        this.dropdown = null;
        this.isCreated = false;
        this.reposition = this.reposition.bind(this);
    }

    createDropdown() {
        if (this.isCreated) return;

        this.dropdown = document.createElement('div');
        this.dropdown.className = 'hidden fixed z-[9999] bg-white border border-slate-300 shadow-xl rounded-lg flex text-sm w-40 h-60 overflow-hidden font-mono select-none mt-1';
        
        // Cột Giờ
        const hourCol = document.createElement('div');
        hourCol.className = 'flex-1 overflow-y-auto custom-scrollbar border-r border-slate-100';
        for(let i=0; i<24; i++) {
            const div = document.createElement('div');
            div.className = 'px-2 py-2 hover:bg-green-50 cursor-pointer text-center text-slate-700 hover:text-green-700 transition-colors';
            div.textContent = i.toString(). padStart(2, '0');
            div.onmousedown = (e) => { e.preventDefault(); this.selectHour(div.textContent); };
            hourCol.appendChild(div);
        }

        // Cột Phút
        const minCol = document.createElement('div');
        minCol.className = 'flex-1 overflow-y-auto custom-scrollbar';
        for(let i=0; i<60; i++) { 
            const div = document.createElement('div');
            div.className = 'px-2 py-2 hover:bg-green-50 cursor-pointer text-center text-slate-700 hover:text-green-700 transition-colors';
            div.textContent = i.toString().padStart(2, '0');
            div.onmousedown = (e) => { e.preventDefault(); this.selectMinute(div. textContent); };
            minCol.appendChild(div);
        }

        this.dropdown.appendChild(hourCol);
        this.dropdown.appendChild(minCol);
        document.body.appendChild(this.dropdown);
        
        // Event click global để đóng dropdown
        document.addEventListener('mousedown', (e) => {
            if (this.dropdown && !this.dropdown. contains(e.target) && 
                this.activeInput && !this.activeInput. contains(e.target)) {
                this.hide();
            }
        });

        window.addEventListener('scroll', this.reposition, true);
        window.addEventListener('resize', this.reposition);
        this.isCreated = true;
    }

    attach(input) {
        if (! this.isCreated) this.createDropdown();
        if (input. dataset.pickerAttached === 'true') return;
        
        input.setAttribute('autocomplete', 'off');
        input.classList.add('bg-white'); 
        
        const openHandler = (e) => { 
            e.stopPropagation(); 
            this.show(input); 
        };
        
        input.addEventListener('click', openHandler);
        input.addEventListener('focus', openHandler);

        // Input Masking (Chặn chữ, Format HH:MM)
        input.addEventListener('input', (e) => {
            this.activeInput = input;
            let val = input.value. replace(/[^0-9]/g, '');
            if (val.length > 4) val = val.slice(0, 4);
            
            if (val.length > 2) {
                val = val.slice(0, 2) + ':' + val.slice(2);
            }
            input.value = val;
            
            // Validate giờ phút hợp lệ
            if (val.length === 5) {
                const [h, m] = val.split(':'). map(Number);
                if (h > 23 || m > 59) {
                    input.classList.add('border-red-500', 'text-red-600');
                } else {
                    input.classList.remove('border-red-500', 'text-red-600');
                }
            }
        });

        input.dataset.pickerAttached = 'true';
    }

    show(input) {
        this.activeInput = input;
        this.updatePosition();
        this.dropdown.classList.remove('hidden');
    }

    updatePosition() {
        if (!this.activeInput) return;
        const rect = this.activeInput.getBoundingClientRect();
        this.dropdown.style.top = (rect.bottom + 2) + 'px';
        this.dropdown.style.left = rect.left + 'px';
    }

    reposition() {
        if (!this.activeInput || this.dropdown.classList.contains('hidden')) return;
        this.updatePosition();
    }

    hide() {
        if(this.dropdown) this.dropdown.classList.add('hidden');
        this.activeInput = null;
    }

    selectHour(hour) {
        if(! this.activeInput) return;
        let current = this.activeInput.value || '00:00';
        const parts = current.includes(':') ? current.split(':') : [current, '00'];
        const m = parts[1] && parts[1].length === 2 ? parts[1] : '00';
        this.updateValue(`${hour}:${m}`);
    }

    selectMinute(minute) {
        if(! this.activeInput) return;
        let current = this.activeInput.value || '00:00';
        const parts = current.includes(':') ? current.split(':') : ['00', current];
        const h = parts[0] && parts[0].length === 2 ?  parts[0] : '00';
        this.updateValue(`${h}:${minute}`);
        this.hide();
    }

    updateValue(val) {
        if(this.activeInput) {
            this.activeInput.value = val;
            this.activeInput. classList.remove('border-red-500', 'text-red-600');
            this.activeInput.dispatchEvent(new Event('change', { bubbles: true }));
            this.activeInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }

    /**
     * Utility: Attach tất cả inputs có class 'time-input'
     */
    attachAll(container = document) {
        const inputs = container.querySelectorAll('.time-input');
        inputs.forEach(input => this.attach(input));
    }

    /**
     * Cleanup khi destroy
     */
    destroy() {
        if (this.dropdown) {
            this.dropdown.remove();
            this.isCreated = false;
        }
        window.removeEventListener('scroll', this.reposition, true);
        window.removeEventListener('resize', this.reposition);
    }
}

// Export global
window.CustomTimePicker = CustomTimePicker;