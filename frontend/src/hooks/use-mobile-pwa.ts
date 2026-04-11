import { useEffect, useState } from "react";

type NavigatorWithStandalone = Navigator & {
  standalone?: boolean;
};

const MOBILE_MEDIA_QUERY = "(max-width: 1023px)";
const PWA_MEDIA_QUERY = "(display-mode: standalone)";

function detectStandalonePwa(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const displayModeStandalone = window.matchMedia(PWA_MEDIA_QUERY).matches;
  const iOSStandalone = (window.navigator as NavigatorWithStandalone).standalone === true;
  const androidTwa = typeof document !== "undefined" && document.referrer.startsWith("android-app://");

  return displayModeStandalone || iOSStandalone || androidTwa;
}

export function useIsMobilePwaMode() {
  const [isMobilePwaMode, setIsMobilePwaMode] = useState<boolean>(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return window.matchMedia(MOBILE_MEDIA_QUERY).matches && detectStandalonePwa();
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const mobileMedia = window.matchMedia(MOBILE_MEDIA_QUERY);
    const pwaMedia = window.matchMedia(PWA_MEDIA_QUERY);

    const updateMode = () => {
      setIsMobilePwaMode(mobileMedia.matches && detectStandalonePwa());
    };

    updateMode();
    mobileMedia.addEventListener("change", updateMode);
    pwaMedia.addEventListener("change", updateMode);
    window.addEventListener("resize", updateMode);

    return () => {
      mobileMedia.removeEventListener("change", updateMode);
      pwaMedia.removeEventListener("change", updateMode);
      window.removeEventListener("resize", updateMode);
    };
  }, []);

  return isMobilePwaMode;
}