from __future__ import annotations

from django.urls import reverse
from django.urls.exceptions import NoReverseMatch

from config.authz.constants import ACL_MENU_PERMISSIONS, LANDING_ROUTE_PERMISSIONS


def build_acl_context(user) -> dict[str, bool]:
    acl = {key: False for key in ACL_MENU_PERMISSIONS}
    if not user or not user.is_authenticated:
        return acl
    if user.is_superuser:
        return {key: True for key in acl}

    for acl_key, permissions in ACL_MENU_PERMISSIONS.items():
        acl[acl_key] = any(user.has_perm(perm) for perm in permissions)
    return acl


def access_control_context(request):
    user = getattr(request, "user", None)
    return {"acl": build_acl_context(user)}


def get_first_allowed_url(user) -> str | None:
    if not user or not user.is_authenticated:
        return None
    if user.is_superuser:
        return reverse("dashboard:dashboard")

    for perm_code, route_name in LANDING_ROUTE_PERMISSIONS:
        if not user.has_perm(perm_code):
            continue
        try:
            return reverse(route_name)
        except NoReverseMatch:
            continue
    return None
