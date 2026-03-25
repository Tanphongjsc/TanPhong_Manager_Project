from __future__ import annotations

import re

from config.authz.constants import EXEMPT_PATH_PREFIXES, ROUTE_PERMISSION_RULES, SAFE_METHODS


def get_feature_key_from_path(path: str) -> str | None:
    for rule in ROUTE_PERMISSION_RULES:
        if path.startswith(rule.prefix):
            return rule.feature_key
    return None


def infer_required_action(path: str, method: str) -> str:
    method = (method or "GET").upper()
    if method not in SAFE_METHODS:
        return "write"

    if any(part in path for part in ("/create/", "/update/", "/delete/")):
        return "write"
    return "view"


def build_permission_codename(feature_key: str, action: str) -> str:
    return f"access_control.{action}_{feature_key}"


def _extract_api_resource_slug(path: str) -> str | None:
    parts = [p for p in path.strip("/").split("/") if p]
    if "api" not in parts:
        return None

    after_api = parts[parts.index("api") + 1 :]
    if after_api and re.fullmatch(r"v\d+", after_api[0]):
        after_api = after_api[1:]
    return after_api[0] if after_api else None


def _resource_slug_to_codename(resource_slug: str) -> str:
    return re.sub(r"[^a-zA-Z0-9]", "", resource_slug).lower()


def _infer_model_action_from_api(path: str, method: str) -> str:
    method = (method or "GET").upper()
    lowered_path = path.lower()

    if method == "POST":
        if any(token in lowered_path for token in ("/update/", "/toggle-status/", "/chuyen-cong-tac/")):
            return "change"
        if "/delete/" in lowered_path:
            return "delete"
        return "add"
    if method in {"PUT", "PATCH"}:
        return "change"
    if method == "DELETE":
        return "delete"
    return "view"


def _candidate_app_labels_for_api(path: str) -> tuple[str, ...]:
    if path.startswith("/hrm/"):
        return ("__core__",)
    if path.startswith("/dichvudiennuoc/"):
        return ("dich_vu_dien_nuoc",)
    if path.startswith("/dashboard/"):
        return ("dashboard",)
    return tuple()


def get_required_permissions(path: str, method: str) -> tuple[str, ...]:
    if path.startswith("/hrm/to-chuc-nhan-su/api/"):
        feature_action = infer_required_action(path=path, method=method)
        module_permission = build_permission_codename("to_chuc_nhan_su", feature_action)

        resource_slug = _extract_api_resource_slug(path)
        app_labels = _candidate_app_labels_for_api(path)
        if not resource_slug or not app_labels:
            return (module_permission,)

        codename_base = _resource_slug_to_codename(resource_slug)
        if not codename_base:
            return (module_permission,)

        model_action = _infer_model_action_from_api(path=path, method=method)
        inferred = tuple(f"{app_label}.{model_action}_{codename_base}" for app_label in app_labels)
        return inferred + (module_permission,)

    feature_key = get_feature_key_from_path(path)
    if not feature_key:
        return tuple()
    return (build_permission_codename(feature_key, infer_required_action(path, method)),)


def is_exempt_path(path: str) -> bool:
    return path == "/" or any(path.startswith(prefix) for prefix in EXEMPT_PATH_PREFIXES)
