function normalizeBasePathValue(basePath: string | undefined | null) {
  if (!basePath || basePath === "/") {
    return "";
  }

  const trimmed = basePath.trim();
  if (!trimmed || trimmed === "/") {
    return "";
  }

  return `/${trimmed.replace(/^\/+|\/+$/g, "")}`;
}

export const APP_BASE_PATH = normalizeBasePathValue(process.env.NEXT_PUBLIC_BASE_PATH);

export function withBasePath(path: string) {
  if (!path) {
    return APP_BASE_PATH || "/";
  }

  if (/^(?:[a-z][a-z\d+\-.]*:)?\/\//i.test(path) || path.startsWith("data:")) {
    return path;
  }

  if (!APP_BASE_PATH) {
    return path;
  }

  if (path === APP_BASE_PATH || path.startsWith(`${APP_BASE_PATH}/`)) {
    return path;
  }

  if (path === "/") {
    return `${APP_BASE_PATH}/`;
  }

  return path.startsWith("/") ? `${APP_BASE_PATH}${path}` : `${APP_BASE_PATH}/${path}`;
}
