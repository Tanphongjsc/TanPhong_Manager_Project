import logging
from django.utils.deprecation import MiddlewareMixin
from django.core.cache import cache
from django.http import HttpResponseForbidden

logger = logging.getLogger('django.security')

class RateLimitMiddleware(MiddlewareMixin):
    """
    Giới hạn số lượng request mỗi phút
    - Chặn spam
    - Chặn DDoS attack
    """
    
    def process_request(self, request):
        # Bỏ qua nếu đã đăng nhập (người dùng hợp lệ)
        if request.user.is_authenticated:
            return None
            
        # Lấy IP của người dùng
        ip = self.get_client_ip(request)
        cache_key = f'rate_limit_{ip}'
        
        # Đếm số request từ IP này
        requests = cache.get(cache_key, 0)
        
        # Nếu vượt quá 100 request/phút → CHẶN
        if requests > 100:
            logger.warning(f'⚠️ Rate limit exceeded for IP: {ip}')
            return HttpResponseForbidden('Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau 1 phút.')
        
        # Tăng bộ đếm và lưu trong 60 giây
        cache.set(cache_key, requests + 1, 60)
        return None
    
    def get_client_ip(self, request):
        """Lấy IP thật của người dùng (kể cả khi qua proxy)"""
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for:
            ip = x_forwarded_for.split(',')[0]
        else:
            ip = request.META.get('REMOTE_ADDR')
        return ip