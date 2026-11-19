from django.apps import AppConfig
from django.db.models.signals import post_migrate


class PortalConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.portal'
    verbose_name = 'Trang chủ phần mềm'

    def ready(self):
        from apps.portal.permissions import ensure_portal_permissions

        post_migrate.connect(
            ensure_portal_permissions,
            sender=self,
            dispatch_uid='apps.portal.ensure_portal_permissions',
        )
