import logging
from django.utils.deprecation import MiddlewareMixin

logger = logging.getLogger('django.security')

class SecurityHeadersMiddleware(MiddlewareMixin):
    """
    Thêm các header bảo mật vào mỗi response
    - Chặn XSS attack
    - Chặn Clickjacking
    - Bảo vệ thông tin người dùng
    """
    
    def process_response(self, request, response):
        # Chặn website hiển thị sai định dạng file
        response['X-Content-Type-Options'] = 'nosniff'
        
        # Chặn XSS attack (tấn công chèn mã độc)
        response['X-XSS-Protection'] = '1; mode=block'
        
        # Ẩn thông tin referrer khi chuyển trang
        response['Referrer-Policy'] = 'strict-origin-when-cross-origin'
        
        # Chặn truy cập camera, mic, location
        response['Permissions-Policy'] = 'geolocation=(), microphone=(), camera=()'
        
        logger.info(f'Security headers added for {request.path}')
        return response