from django.conf import settings

# Tên cookie cũ của phần mềm lương trước khi đổi sang tp_sessionid / tp_csrftoken.
LEGACY_COOKIE_NAMES = ('sessionid', 'csrftoken')


class LegacyCookieCleanupMiddleware:
    """Xóa cookie sessionid/csrftoken cũ (path=/) còn sót trên trình duyệt.

    CO và Tính giá cũng dùng cookie tên sessionid/csrftoken nhưng nginx giới hạn
    chúng trong /co/ và /tinh-gia/. Nếu cookie cũ path=/ của phần mềm lương còn
    tồn tại, trình duyệt sẽ gửi cả hai cookie trùng tên và gây lỗi CSRF ở CO/Tính giá.
    Phần mềm lương chỉ nhận request ngoài /co/ và /tinh-gia/, nên mọi cookie trùng
    tên mà nó thấy đều là cookie cũ path=/.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        current_names = {settings.SESSION_COOKIE_NAME, settings.CSRF_COOKIE_NAME}
        for name in LEGACY_COOKIE_NAMES:
            if name in request.COOKIES and name not in current_names:
                response.delete_cookie(name, path='/', samesite='Lax')
        return response
