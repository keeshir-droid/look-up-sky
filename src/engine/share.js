// Share sheet and saving. Copied from the shared kit (shared-kit/engine/share.js), namespace UL -> LU, fallback file name "look-up".
//
//   LU.share.platform()      -> "ios" | "android" | "desktop"
//   LU.share.canShare(file)  -> boolean
//   LU.share.share(file)     -> Promise<"shared" | "cancelled" | "failed">          call directly inside a tap, file already made
//   LU.share.save(file)      -> Promise<"saved" | "shared" | "cancelled" | "failed">  on iPhone this opens the share sheet
//                                                                                     (Save Video / Save Image puts it in Photos)
(function () {
  const LU = (globalThis.LU = globalThis.LU || {});

  function platform() {
    try {
      const nav = (typeof navigator !== "undefined") ? navigator : null;
      if (!nav) return "desktop";
      const ua = nav.userAgent || "";
      if (/iPad|iPhone|iPod/.test(ua)) return "ios";
      if (nav.platform === "MacIntel" && nav.maxTouchPoints > 1) return "ios"; // iPad asking for the desktop site
      if (/Android/i.test(ua)) return "android";
    } catch (e) { /* fall through */ }
    return "desktop";
  }

  function canShare(file) {
    try { return !!(file && typeof navigator !== "undefined" && navigator.canShare && navigator.canShare({ files: [file] })); }
    catch (e) { return false; }
  }

  function isCancel(e) { return !!e && (e.name === "AbortError" || e.code === 20); }

  // The file only: some apps drop the file when text or a link comes with it.
  async function share(file) {
    if (!canShare(file) || typeof navigator.share !== "function") return "failed";
    try {
      await navigator.share({ files: [file] });
      return "shared";
    } catch (e) {
      return isCancel(e) ? "cancelled" : "failed";
    }
  }

  function download(file) {
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url; a.download = file.name || "look-up";
    a.style.display = "none";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
  }

  async function save(file) {
    // iPhone: a plain download lands in the Files app, which confuses people. The share sheet's Save Video / Save Image goes to Photos.
    if (platform() === "ios" && canShare(file)) {
      const r = await share(file);
      if (r !== "failed") return r;
      // the sheet would not open (for example the tap was too long ago): fall back to a download
    }
    try { download(file); return "saved"; }
    catch (e) { return "failed"; }
  }

  LU.share = { platform: platform, canShare: canShare, share: share, save: save };
})();
