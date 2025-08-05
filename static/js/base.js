document.addEventListener('DOMContentLoaded', function() {
    const toggleBtn = document.getElementById('toggle-sidebar');
    const sidebar = document.querySelector('.sidebar');
    const mainContent = document.querySelector('.main-content');

    toggleBtn.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
        if (sidebar.classList.contains('collapsed')) {
            sidebar.style.width = '60px';
            mainContent.style.marginLeft = '60px';
        } else {
            sidebar.style.width = '240px';
            mainContent.style.marginLeft = '0';
        }
    });
});
