/**
 * VerticalTabManager
 * Quản lý logic chuyển tab cho sidebar dọc.
 * Hỗ trợ nhiều menu trên cùng một trang.
 */
class VerticalTabManager {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        if (!this.container) return;

        // Cấu hình Class Style (BLUE THEME)
        this.activeClasses = ['active', 'border-blue-600', 'bg-blue-50', 'text-blue-700'];
        this.inactiveClasses = ['border-transparent', 'text-slate-600', 'hover:bg-slate-50', 'hover:text-slate-900'];

        this.init();
    }

    init() {
        this.buttons = this.container.querySelectorAll('.vertical-tab-btn');
        
        this.buttons.forEach(btn => {
            // Clone node để remove event listener cũ (nếu có) tránh bị duplicate khi gọi init nhiều lần
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
            
            newBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.handleSwitch(newBtn);
            });
        });
        
        // Cập nhật lại list buttons sau khi clone
        this.buttons = this.container.querySelectorAll('.vertical-tab-btn');
    }

    handleSwitch(clickedBtn) {
        const targetId = clickedBtn.dataset.target;
        if (!targetId) return;

        // 1. Reset Style tất cả các button TRONG CONTAINER NÀY
        this.buttons.forEach(btn => {
            btn.classList.remove(...this.activeClasses);
            btn.classList.add(...this.inactiveClasses);
        });

        // 2. Active button được click
        clickedBtn.classList.remove(...this.inactiveClasses);
        clickedBtn.classList.add(...this.activeClasses);

        // Scroll button vào vùng nhìn thấy (UX cho Mobile)
        clickedBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });

        // 3. Xử lý hiển thị Content Pane
        // Tìm tất cả pane liên quan (Logic: Các pane nằm trong cùng context cha hoặc document)
        this.buttons.forEach(btn => {
            const paneId = btn.dataset.target;
            const pane = document.querySelector(paneId);
            if (pane) pane.classList.add('hidden');
        });

        const targetPane = document.querySelector(targetId);
        if (targetPane) {
            targetPane.classList.remove('hidden');
            targetPane.classList.add('animate-fade-in'); // Thêm hiệu ứng fade
        }
    }
}

// Export để dùng ở file khác nếu cần
window.VerticalTabManager = VerticalTabManager;