//<! -- utils.js - Các hàm tiện ích chung -->

// Hàm loại bỏ dấu tiếng Việt
function removeVietnameseAccents(str) {
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
}

// Hàm tạo mã chức vụ từ tên vị trí
function generatePositionCode(name) {
    if (!name) return '';
    let normalized = removeVietnameseAccents(name);
    normalized = normalized.replace(/\s+/g, '_');
    normalized = normalized.replace(/[^a-zA-Z0-9_]/g, '');
    return normalized.toUpperCase();
}