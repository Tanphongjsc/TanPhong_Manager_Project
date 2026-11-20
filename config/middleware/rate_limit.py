import logging
from django.utils.deprecation import MiddlewareMixin
from django.core.cache import cache
from django.http import HttpResponseForbidden

logger = logging.getLogger('django.security')

EXEMPT_PATHS = ('/health/', '/static/')

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

        # Health probe của Render và file static gọi liên tục, không được tính vào giới hạn
        if request.path.startswith(EXEMPT_PATHS):
            return None

        ip = self.get_client_ip(request)
        cache_key = f'rate_limit_{ip}'

        # Cửa sổ 60 giây tính từ request đầu tiên. Không gọi set() lại mỗi request,
        # vì set() làm mới thời gian sống và bộ đếm không bao giờ hết hạn.
        cache.add(cache_key, 0, 60)
        try:
            count = cache.incr(cache_key)
        except ValueError:
            cache.set(cache_key, 1, 60)
            count = 1

        # Nếu vượt quá 100 request/phút → CHẶN
        if count > 100:
            logger.warning(f'⚠️ Rate limit exceeded for IP: {ip}')
            return HttpResponseForbidden('Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau 1 phút.')
        return None

    def get_client_ip(self, request):
        """Lấy IP thật của người dùng (kể cả khi qua proxy)"""
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for:
            ip = x_forwarded_for.split(',')[0]
        else:
            ip = request.META.get('REMOTE_ADDR')
        return ip