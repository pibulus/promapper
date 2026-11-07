/**
 * ProMapper's Passport card wrapper.
 *
 * Visuals — markup, CSS, skins, palette, avatar, identity — come from
 * `utils/softstack-passport`. This file only owns Preact state, events and
 * ProMapper's adapters (clipboard, haptics, toast, restore QR, storage).
 */
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import QRCode from "npm:qrcode@1.5.4";
import {
  generateMemberIdentity,
  idInput,
} from "../utils/softstack-passport/index.js";
import {
  selectNamedSkin,
  selectSkin,
  shuffleSkinSeed,
} from "../utils/softstack-passport/skins.js";
import { renderMembershipCard } from "../utils/softstack-passport/card.html.js";
import {
  buildPassportAvatar,
  clearCustomPassportAvatar,
  compressAvatarImageFile,
  readCustomPassportAvatar,
  saveCustomPassportAvatar,
} from "../utils/softstack-passport/avatar.js";
import { hapticTap } from "../utils/haptics.ts";
import { showToast } from "../utils/toast.ts";

const AVATAR_KEY = "promapper:passport_avatar";
const PREVIEW_HASH =
  "9f1c2d3e4b5a69788796a5b4c3d2e1f00f1e2d3c4b5a69788796a5b4c3d2e1f0";

export interface PassportDetails {
  code: string;
  name: string;
  phrase: string;
}

export interface PassportMembershipCardProps {
  passport: PassportDetails | null;
  appName?: string;
  isPreview?: boolean;
  /** Short `/?passport=SS-...` link encoded in the QR stamp. */
  restoreUrl?: string;
  skinName?: string;
}

function sha256Hex(value: string): Promise<string> {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)).then(
    (digest) =>
      Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0"))
        .join(""),
  );
}

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "PM";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

export function PassportMembershipCard({
  passport,
  appName = "ProMapper",
  isPreview = false,
  restoreUrl = "",
  skinName = "",
}: PassportMembershipCardProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const pendingRef = useRef({ x: 50, y: 50 });
  const squishTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const qrTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [vaultHash, setVaultHash] = useState("");
  const [shuffleSeed, setShuffleSeed] = useState(0);
  const [customAvatarUri, setCustomAvatarUri] = useState("");
  const [copied, setCopied] = useState(false);
  const [squishing, setSquishing] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [qrImageUrl, setQrImageUrl] = useState("");

  useEffect(() => {
    let alive = true;
    const code = passport?.code?.trim() || "";
    if (!code) {
      setVaultHash(PREVIEW_HASH);
      return () => {
        alive = false;
      };
    }
    sha256Hex(idInput(code))
      .then((hash) => {
        if (alive) setVaultHash(hash);
      })
      .catch(() => {
        if (alive) setVaultHash("");
      });
    return () => {
      alive = false;
    };
  }, [passport?.code]);

  const identity = useMemo(() => {
    if (vaultHash) {
      return generateMemberIdentity(vaultHash, passport?.code, {
        phrase: passport?.phrase,
      });
    }
    const name = passport?.name || "Passport Pending";
    return {
      name,
      phrase: passport?.phrase || "",
      memberId: passport?.code || "",
      initials: initialsFor(name),
      isFallback: !passport?.code,
    };
  }, [vaultHash, passport?.code, passport?.name, passport?.phrase]);

  const skin = useMemo(
    () =>
      shuffleSeed > 0
        ? shuffleSkinSeed(shuffleSeed)
        : skinName
        ? selectNamedSkin(skinName, vaultHash)
        : selectSkin(vaultHash),
    [shuffleSeed, skinName, vaultHash],
  );

  useEffect(() => {
    setCustomAvatarUri(readCustomPassportAvatar(undefined, AVATAR_KEY));
  }, []);

  const avatarUri = useMemo(
    () =>
      customAvatarUri ||
      buildPassportAvatar(
        vaultHash || passport?.code || "promapper",
        skin.avatarStyle,
      ),
    [customAvatarUri, vaultHash, passport?.code, skin.avatarStyle],
  );

  useEffect(() => {
    let alive = true;
    if (!restoreUrl || isPreview) {
      setQrImageUrl("");
      return () => {
        alive = false;
      };
    }
    QRCode.toDataURL(restoreUrl, {
      margin: 1,
      width: 256,
      color: { dark: "#1e1714", light: "#fffef7" },
    })
      .then((url: string) => {
        if (alive) setQrImageUrl(url);
      })
      .catch((error: unknown) => {
        console.warn("[PassportCard] QR render failed:", error);
        if (alive) setQrImageUrl("");
      });
    return () => {
      alive = false;
    };
  }, [restoreUrl, isPreview]);

  const markup = useMemo(
    () =>
      renderMembershipCard({
        identity,
        skin,
        appName,
        isPreview,
        avatarUri,
        customAvatar: Boolean(customAvatarUri),
        qrUrl: restoreUrl,
        qrImageUrl,
        reducedMotion,
        revealed,
        showQr,
      }),
    [
      identity,
      skin,
      appName,
      isPreview,
      avatarUri,
      customAvatarUri,
      restoreUrl,
      qrImageUrl,
      reducedMotion,
      revealed,
      showQr,
    ],
  );

  useEffect(() => {
    setReducedMotion(
      globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ??
        false,
    );
  }, []);

  useEffect(() => {
    const card = hostRef.current?.querySelector(".passport-card");
    card?.classList.toggle("is-squishing", squishing);
    card?.classList.toggle("is-copied", copied);
    card?.classList.toggle("reduced-motion", reducedMotion);
  }, [markup, squishing, copied, reducedMotion]);

  useEffect(() => {
    const card = hostRef.current?.querySelector(".passport-card") as
      | HTMLElement
      | null;
    card?.style.setProperty("--hovered", hovered ? "1" : "0");
  }, [hovered, markup]);

  useEffect(() => {
    writePointerVars(50, 50);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (squishTimer.current !== null) clearTimeout(squishTimer.current);
      if (copyTimer.current !== null) clearTimeout(copyTimer.current);
      if (revealTimer.current !== null) clearTimeout(revealTimer.current);
      if (qrTimer.current !== null) clearTimeout(qrTimer.current);
    };
  }, []);

  function cardEl(): HTMLElement | null {
    return hostRef.current?.querySelector(".passport-card") || null;
  }

  function writePointerVars(x: number, y: number) {
    const card = cardEl();
    if (!card) return;
    const s = card.style;
    s.setProperty("--mx", `${x}%`);
    s.setProperty("--my", `${y}%`);
    s.setProperty("--pointer-x", `${x}%`);
    s.setProperty("--pointer-y", `${y}%`);
    s.setProperty("--bg-x", `${50 + (x - 50) * 0.5}%`);
    s.setProperty("--bg-y", `${50 + (y - 50) * 0.5}%`);
    s.setProperty(
      "--from-center",
      `${Math.min(1, Math.max(0, Math.hypot(y - 50, x - 50) / 50))}`,
    );
  }

  function commitPointer() {
    rafRef.current = null;
    writePointerVars(pendingRef.current.x, pendingRef.current.y);
  }

  function schedulePointer(x: number, y: number) {
    pendingRef.current = {
      x: Math.min(100, Math.max(0, x)),
      y: Math.min(100, Math.max(0, y)),
    };
    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(commitPointer);
    }
  }

  function handlePointerMove(e: PointerEvent) {
    const card = cardEl();
    if (!card || reducedMotion || e.pointerType !== "mouse") return;
    const rect = card.getBoundingClientRect();
    schedulePointer(
      ((e.clientX - rect.left) / rect.width) * 100,
      ((e.clientY - rect.top) / rect.height) * 100,
    );
  }

  function handlePointerOut(e: PointerEvent) {
    const host = hostRef.current;
    if (!host) return;
    const next = e.relatedTarget as Node | null;
    if (!next || !host.contains(next)) {
      setHovered(false);
      schedulePointer(50, 50);
    }
  }

  function cycleSkin() {
    setShuffleSeed((seed) => (seed + 1) % 50);
    hapticTap();
    setSquishing(true);
    if (squishTimer.current !== null) clearTimeout(squishTimer.current);
    squishTimer.current = setTimeout(() => setSquishing(false), 360);
  }

  async function copyPasskey() {
    const toCopy = identity.phrase || passport?.code || identity.memberId;
    if (!toCopy) return;
    try {
      await navigator.clipboard.writeText(toCopy);
      setCopied(true);
      hapticTap();
      showToast("4-word passkey copied", "success");
      if (copyTimer.current !== null) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2200);
    } catch (err) {
      console.warn("[PassportCard] Copy failed:", err);
      showToast("Copy unavailable — select the passkey", "warning");
    }
  }

  function handleAvatarClick() {
    if (isPreview) return;
    const input = hostRef.current?.querySelector(".avatar-input") as
      | HTMLInputElement
      | null;
    input?.click();
  }

  async function handleAvatarFile(input: HTMLInputElement) {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    try {
      const dataUri = await compressAvatarImageFile(file, 128);
      setCustomAvatarUri(
        saveCustomPassportAvatar(dataUri, undefined, AVATAR_KEY),
      );
      hapticTap();
    } catch (err) {
      console.warn("[PassportCard] Custom avatar upload failed:", err);
    }
  }

  function resetAvatar() {
    clearCustomPassportAvatar(undefined, AVATAR_KEY);
    setCustomAvatarUri("");
    hapticTap();
  }

  function toggleReveal() {
    if (isPreview) return;
    setRevealed((prev) => {
      const next = !prev;
      if (revealTimer.current !== null) clearTimeout(revealTimer.current);
      if (next) {
        revealTimer.current = setTimeout(() => setRevealed(false), 10000);
      }
      return next;
    });
  }

  function toggleQr() {
    if (isPreview) return;
    setShowQr((prev) => {
      const next = !prev;
      if (qrTimer.current !== null) clearTimeout(qrTimer.current);
      if (next) {
        qrTimer.current = setTimeout(() => setShowQr(false), 60000);
      }
      return next;
    });
  }

  function handleClick(e: MouseEvent) {
    const target = e.target;
    if (!(target instanceof Element)) return;
    if (target.closest(".avatar-reset")) {
      e.stopPropagation();
      resetAvatar();
      return;
    }
    if (target.closest(".avatar-chip")) {
      e.stopPropagation();
      handleAvatarClick();
      return;
    }
    if (target.closest(".avatar-input")) return;
    if (target.closest("[data-passport-qr-toggle]")) {
      e.stopPropagation();
      toggleQr();
      return;
    }
    if (target.closest("[data-passport-reveal]")) {
      e.stopPropagation();
      toggleReveal();
      return;
    }
    if (target.closest(".passport-qr-stamp")) return;
    if (target.closest(".passport-id-chip")) {
      e.stopPropagation();
      copyPasskey();
      return;
    }
    cycleSkin();
  }

  function handleChange(e: Event) {
    const target = e.target;
    if (target instanceof HTMLInputElement && target.matches(".avatar-input")) {
      handleAvatarFile(target);
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key !== "Enter" && e.key !== " ") return;
    const target = e.target;
    if (!(target instanceof Element)) return;
    if (target.matches("[data-passport-qr-toggle]")) {
      e.preventDefault();
      toggleQr();
    } else if (target.matches("[data-passport-reveal]")) {
      e.preventDefault();
      toggleReveal();
    } else if (target.matches(".passport-id-chip")) {
      e.preventDefault();
      copyPasskey();
    } else if (target.matches(".passport-card")) {
      e.preventDefault();
      cycleSkin();
    }
  }

  return (
    <div
      ref={hostRef}
      style={{ display: "contents" }}
      onClick={handleClick}
      onChange={handleChange}
      onKeyDown={handleKeydown}
      onPointerMove={handlePointerMove}
      onPointerOver={(e) => {
        if (e.pointerType === "mouse" && !reducedMotion) setHovered(true);
      }}
      onPointerOut={handlePointerOut}
      // deno-lint-ignore react-no-danger
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}
