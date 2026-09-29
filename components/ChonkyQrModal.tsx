import { RefObject } from "preact";
import Modal from "./Modal.tsx";
import ChonkyQrCard from "./ChonkyQrCard.tsx";

interface ChonkyQrModalProps {
  open: boolean;
  onClose: () => void;
  url: string;
  title?: string;
  subtitle?: string;
  badge?: string;
  roomCode?: string;
  initialFocusRef?: RefObject<HTMLElement>;
}

export default function ChonkyQrModal({
  open,
  onClose,
  url,
  title = "Scan to Join Live Room",
  subtitle =
    "Attendees & non-contributors can follow the live transcript and mind map without logging in.",
  badge = "SPECTATOR PASS",
  roomCode,
  initialFocusRef,
}: ChonkyQrModalProps) {
  const qrbuddyUrl = `https://qrbuddy.app/q?d=${
    encodeURIComponent(url)
  }&s=candy`;

  return (
    <Modal
      open={open}
      onClose={onClose}
      titleId="chonky-qr-title"
      panelClass="max-w-md bg-[#fffef7] border-[3px] border-[#1e1714] rounded-3xl shadow-[6px_6px_0_#1e1714]"
      initialFocusRef={initialFocusRef}
    >
      <div class="relative flex flex-col items-center">
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          class="absolute -top-1 -right-1 w-8 h-8 rounded-full border-2 border-[#1e1714] bg-[#ffd166] flex items-center justify-center text-xs font-black shadow-[2px_2px_0_#1e1714] hover:bg-[#ffb3d1] active:translate-y-0.5 active:shadow-none transition-transform"
          aria-label="Close QR Modal"
        >
          <i class="fa fa-times" aria-hidden="true"></i>
        </button>

        {/* Room Code Badge if present */}
        {roomCode && (
          <div class="mb-2 text-center">
            <span class="text-[11px] font-mono font-black uppercase tracking-widest px-2.5 py-1 bg-[#fbf1e4] border-2 border-[#1e1714] rounded-xl shadow-[1px_1px_0_#1e1714]">
              ROOM: {roomCode}
            </span>
          </div>
        )}

        {/* Main Card */}
        <div class="w-full">
          <ChonkyQrCard
            url={url}
            title={title}
            subtitle={subtitle}
            badge={badge}
            size={240}
          />
        </div>

        {/* QRBuddy Cartridge Deep Link */}
        <div class="mt-4 pt-3 border-t-2 border-dashed border-[#1e1714]/20 w-full flex items-center justify-between text-xs">
          <span class="text-[#1e1714]/60 font-medium">Powered by QRBuddy</span>
          <a
            href={qrbuddyUrl}
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-1 font-bold text-[#1e1714] hover:text-[#d9480f] underline decoration-2 underline-offset-2"
          >
            <span>Customize / Print</span>
            <i
              class="fa fa-arrow-up-right-from-square text-[10px]"
              aria-hidden="true"
            >
            </i>
          </a>
        </div>
      </div>
    </Modal>
  );
}
