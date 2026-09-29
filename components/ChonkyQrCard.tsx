import { useEffect, useState } from "preact/hooks";
import { generateChonkyQrSvg } from "@utils/chonkyQr.ts";
import { copyToClipboard, showToast } from "@utils/toast.ts";
import { soundBloom, soundTick } from "@utils/sound.ts";

interface ChonkyQrCardProps {
  url: string;
  title?: string;
  subtitle?: string;
  badge?: string;
  size?: number;
  compact?: boolean;
}

export default function ChonkyQrCard({
  url,
  title = "Scan to open on phone",
  subtitle = "No account needed — follow along live",
  badge,
  size = 220,
  compact = false,
}: ChonkyQrCardProps) {
  const [svgHtml, setSvgHtml] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    generateChonkyQrSvg(url, { width: size }).then((svg) => {
      if (!cancelled) setSvgHtml(svg);
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [url, size]);

  const handleCopy = async () => {
    soundTick();
    const ok = await copyToClipboard(url);
    if (ok) {
      soundBloom();
      showToast("Link copied!", "success");
    }
  };

  if (compact) {
    return (
      <div class="flex items-center gap-4 p-3 bg-[#fffef7] border-2 border-[#1e1714] rounded-2xl shadow-[3px_3px_0_#1e1714]">
        <div
          class="shrink-0 leading-none rounded-xl overflow-hidden border border-[#1e1714]/20 bg-white"
          style={{
            width: `${Math.min(size, 100)}px`,
            height: `${Math.min(size, 100)}px`,
          }}
          dangerouslySetInnerHTML={{ __html: svgHtml }}
        />
        <div class="flex-1 min-w-0">
          {badge && (
            <span class="inline-block text-[10px] font-black tracking-wider uppercase px-2 py-0.5 rounded-full bg-[#b8f0d8] border border-[#1e1714] text-[#1e1714] mb-1">
              {badge}
            </span>
          )}
          <h4 class="text-xs font-bold text-[#1e1714] truncate">{title}</h4>
          <p class="text-[11px] text-[#1e1714]/60 truncate">{subtitle}</p>
          <button
            type="button"
            onClick={handleCopy}
            class="mt-1.5 inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-lg bg-[#fff9f0] border border-[#1e1714] hover:bg-[#ffe5b4] active:scale-95 transition-transform"
          >
            <i class="fa fa-copy" aria-hidden="true"></i>
            <span>Copy link</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div class="flex flex-col items-center text-center p-5 bg-[#fffef7] border-[2.5px] border-[#1e1714] rounded-3xl shadow-[5px_5px_0_#1e1714] max-w-sm w-full mx-auto">
      {badge && (
        <span class="text-[11px] font-black tracking-widest uppercase px-3 py-1 rounded-full bg-[#b8f0d8] border-2 border-[#1e1714] text-[#1e1714] mb-3 shadow-[1px_1px_0_#1e1714]">
          {badge}
        </span>
      )}
      <div
        class="p-2.5 rounded-2xl border-2 border-[#1e1714] bg-white shadow-[2px_2px_0_#1e1714] leading-none mb-3"
        dangerouslySetInnerHTML={{ __html: svgHtml }}
      />
      <h3 class="font-extrabold text-sm text-[#1e1714] tracking-tight mb-1">
        {title}
      </h3>
      <p class="text-xs text-[#1e1714]/70 mb-3 max-w-xs">{subtitle}</p>
      <div class="flex items-center gap-2 w-full">
        <input
          type="text"
          readonly
          value={url}
          class="flex-1 text-[11px] font-mono px-2.5 py-1.5 rounded-xl border-2 border-[#1e1714] bg-[#fbf1e4] text-[#1e1714] truncate"
        />
        <button
          type="button"
          onClick={handleCopy}
          class="shrink-0 text-xs font-bold px-3 py-1.5 rounded-xl bg-[#ffd166] border-2 border-[#1e1714] shadow-[2px_2px_0_#1e1714] active:translate-y-0.5 active:shadow-none hover:bg-[#ffb3d1] transition-colors"
        >
          Copy
        </button>
      </div>
    </div>
  );
}
