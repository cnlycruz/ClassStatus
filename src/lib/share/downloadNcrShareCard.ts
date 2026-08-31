const DEFAULT_FILENAME = "class-status-ncr.png";

export interface NcrShareCardDownloadOptions {
  effectiveDate?: string;
}

export interface NcrShareCardDownloadResult {
  mode: "download" | "fallback";
  url: string;
  filename?: string;
}

interface DownloadDependencies {
  fetchImpl?: typeof fetch;
  createObjectUrl?: (blob: Blob) => string;
  revokeObjectUrl?: (url: string) => void;
  triggerDownload?: (url: string, filename: string) => void;
  openFallback?: (url: string) => boolean;
  scheduleCleanup?: (cleanup: () => void) => void;
}

export function buildNcrShareCardUrl(effectiveDate?: string): string {
  if (!effectiveDate) return "/api/share/ncr";

  const params = new URLSearchParams({ date: effectiveDate });
  return `/api/share/ncr?${params.toString()}`;
}

export function getShareCardFilename(contentDisposition: string | null): string {
  if (!contentDisposition) return DEFAULT_FILENAME;

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  const plainMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
  const encodedFilename = utf8Match?.[1] ?? plainMatch?.[1];

  if (!encodedFilename) return DEFAULT_FILENAME;

  try {
    const decodedFilename = decodeURIComponent(encodedFilename.trim());
    const safeFilename = decodedFilename.split(/[\\/]/).pop()?.replace(/[<>:"|?*]/g, "");
    return safeFilename || DEFAULT_FILENAME;
  } catch {
    return DEFAULT_FILENAME;
  }
}

function triggerBrowserDownload(url: string, filename: string): void {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function openInNewTab(url: string): boolean {
  return window.open(url, "_blank", "noopener,noreferrer") !== null;
}

export async function downloadNcrShareCard(
  options: NcrShareCardDownloadOptions = {},
  dependencies: DownloadDependencies = {},
): Promise<NcrShareCardDownloadResult> {
  const url = buildNcrShareCardUrl(options.effectiveDate);
  const fetchImpl = dependencies.fetchImpl ?? window.fetch.bind(window);
  const response = await fetchImpl(url, { cache: "no-store" });

  if (!response.ok) throw new Error("SHARE_CARD_REQUEST_FAILED");

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("image/png")) throw new Error("SHARE_CARD_RESPONSE_NOT_PNG");

  const blob = await response.blob();
  const filename = getShareCardFilename(response.headers.get("content-disposition"));
  const createObjectUrl = dependencies.createObjectUrl ?? URL.createObjectURL.bind(URL);
  const revokeObjectUrl = dependencies.revokeObjectUrl ?? URL.revokeObjectURL.bind(URL);
  const triggerDownload = dependencies.triggerDownload ?? triggerBrowserDownload;
  const scheduleCleanup = dependencies.scheduleCleanup ?? ((cleanup) => window.setTimeout(cleanup, 1_000));
  let objectUrl: string | null = null;

  try {
    objectUrl = createObjectUrl(blob);
    triggerDownload(objectUrl, filename);
    const downloadableUrl = objectUrl;
    scheduleCleanup(() => revokeObjectUrl(downloadableUrl));
    return { mode: "download", url, filename };
  } catch {
    if (objectUrl) revokeObjectUrl(objectUrl);

    const openFallback = dependencies.openFallback ?? openInNewTab;
    if (openFallback(url)) return { mode: "fallback", url };
    throw new Error("SHARE_CARD_DOWNLOAD_FAILED");
  }
}

export function createNcrShareCardDownloadController(
  runDownload: typeof downloadNcrShareCard = downloadNcrShareCard,
) {
  let inFlight: Promise<NcrShareCardDownloadResult> | null = null;

  return {
    isBusy: () => inFlight !== null,
    run(options: NcrShareCardDownloadOptions = {}, dependencies?: DownloadDependencies) {
      if (inFlight) return inFlight;

      inFlight = runDownload(options, dependencies).finally(() => {
        inFlight = null;
      });
      return inFlight;
    },
  };
}
