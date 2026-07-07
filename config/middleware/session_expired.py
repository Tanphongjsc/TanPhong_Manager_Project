"""
SessionExpiredMiddleware

Phát hiện AJAX/API request khi session đã hết hạn và trả về JSON 401
thay vì redirect sang trang login (HTML) gây lỗi parse JSON phía client.

Đặt SAU AuthenticationMiddleware trong MIDDLEWARE list.
"""

from django.http import JsonResponse


def _is_api_request(request):
    """Kiểm tra request có phải là AJAX/API request không."""
    # URL chứa /api/
    if '/api/' in request.path:
        return True

    # Accept header yêu cầu JSON
    accept = request.headers.get('Accept', '')
    if 'application/json' in accept:
        return True

    # XMLHttpRequest header (AJAX truyền thống)
    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        return True

    # Content-Type là JSON (POST/PUT request)
    content_type = request.content_type or ''
    if 'application/json' in content_type:
        return True

    return False


# Các URL không cần kiểm tra (login, static, ...)
_EXEMPT_PREFIXES = (
    '/login',
    '/logout',
    '/accounts/login',
    '/accounts/logout',
    '/static/',
    '/favicon.ico',
    '/health/',
)


class SessionExpiredMiddleware:
    """
    Trả JSON 401 cho AJAX/API request khi user chưa đăng nhập (session hết hạn).

    Khi session Django hết hạn, @login_required sẽ redirect về trang login (HTML).
    Với AJAX request, điều này gây lỗi parse JSON phía client.
    Middleware này chặn sớm và trả JSON response rõ ràng.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # Bỏ qua các URL exempt (login, static, ...)
        path = request.path
        if any(path.startswith(prefix) for prefix in _EXEMPT_PREFIXES):
            return self.get_response(request)

        # Chỉ can thiệp khi: user CHƯA đăng nhập + request là AJAX/API
        user = getattr(request, 'user', None)
        if user and not user.is_authenticated and _is_api_request(request):
            return JsonResponse({
                'success': False,
                'message': 'Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.',
                'code': 'SESSION_EXPIRED',
            }, status=401)

        return self.get_response(request)
