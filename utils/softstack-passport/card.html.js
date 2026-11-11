/**
 * Passport card — the one markup builder.
 *
 * Pure function: passport identity + resolved skin + display options in, an HTML
 * string out. No framework, no DOM globals, no app services. Each app's thin
 * wrapper owns state, events and adapters; this file owns every pixel of the
 * card markup so the three surfaces cannot drift.
 *
 * The matching stylesheet is `card.css`. Keep the two together: a class added
 * here without a rule there is a silent visual break.
 */

import { maskPassphrase } from "./identity.js";
import { hexToRgba, mixHex } from "./palettes.js";

function escapeHtml(value) {
	return String(value ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

/**
 * Palette + skin axis custom properties for the card element. These change only
 * when the passport or skin changes; pointer vars are written by the wrapper.
 */
export function cardStyleFor(skin) {
	const palette = skin.palette;
	const isDarkSubstrate = skin.choices?.frame === "terminal";
	const ink = isDarkSubstrate ? "#e8fff0" : palette.ink;
	const inkSoft = isDarkSubstrate
		? "rgba(232, 255, 240, 0.66)"
		: palette.inkSoft;

	return [
		`--p-bg-1: ${palette.bg[0]}`,
		`--p-bg-2: ${palette.bg[1]}`,
		`--p-bg-3: ${palette.bg[2] || palette.bg[1]}`,
		`--p-accent: ${palette.accent}`,
		`--p-ink: ${ink}`,
		`--p-ink-soft: ${inkSoft}`,
		`--p-glow: ${palette.glow}`,
		// Pre-mixed glow/accent alphas (rgba, no CSS color-mix dependency) so the
		// whole card renders correctly on older Safari/Chrome.
		`--p-glow-16: ${hexToRgba(palette.glow, 0.16)}`,
		`--p-glow-20: ${hexToRgba(palette.glow, 0.2)}`,
		`--p-glow-22: ${hexToRgba(palette.glow, 0.22)}`,
		`--p-glow-24: ${hexToRgba(palette.glow, 0.24)}`,
		`--p-glow-28: ${hexToRgba(palette.glow, 0.28)}`,
		`--p-glow-32: ${hexToRgba(palette.glow, 0.32)}`,
		`--p-glow-38: ${hexToRgba(palette.glow, 0.38)}`,
		`--p-accent-18: ${hexToRgba(palette.accent, 0.18)}`,
		`--p-accent-22: ${hexToRgba(palette.accent, 0.22)}`,
		`--p-accent-40: ${hexToRgba(palette.accent, 0.4)}`,
		// Accent blended toward white (stripe pattern + ghost-mark tints).
		`--p-accent-w22: ${mixHex(palette.accent, 0.22)}`,
		`--p-accent-w42: ${mixHex(palette.accent, 0.42)}`,
		`--p-accent-w45: ${mixHex(palette.accent, 0.45)}`,
		`--p-accent-w86: ${mixHex(palette.accent, 0.86)}`,
		// Aliases kept for frame shadows defined in skins.js.
		`--f-glow-38: ${hexToRgba(palette.glow, 0.38)}`,
		`--f-glow-28: ${hexToRgba(palette.glow, 0.28)}`,
		`--f-glow-24: ${hexToRgba(palette.glow, 0.24)}`,
		`--f-glow-20: ${hexToRgba(palette.glow, 0.2)}`,
		`--f-glow-16: ${hexToRgba(palette.glow, 0.16)}`,
		// Skin axis vars (holo / frame / texture / type) — the modular layer.
		skin.varString,
	].join("; ");
}

const GHOST_SEAL = `<div class="ghost-seal" data-slot="qr-ghost" aria-hidden="true">
			<svg class="ghost-mark" viewBox="0 0 32 36" focusable="false" aria-hidden="true">
				<path d="M16 3c-7.1 0-12 5.4-12 13.1V32l3.5-2.2L11 32l3.5-2.2L18 32l3.5-2.2L25 32l3-1.9v-14C28 8.4 23.1 3 16 3Z" />
				<circle cx="11.5" cy="16" r="2.4" />
				<circle cx="20.5" cy="16" r="2.4" />
			</svg>
		</div>`;

/**
 * Render the card.
 *
 * @param {object} options
 * @param {object} options.identity  `{ name, phrase, memberId, initials, isFallback }`
 * @param {object} options.skin      Result of `selectSkin()` / `selectNamedSkin()`
 * @param {string} [options.appName] Word before "Passport" in the kicker
 * @param {boolean} [options.isPreview]
 * @param {string} [options.avatarUri]
 * @param {boolean} [options.customAvatar] Show the reset affordance
 * @param {string} [options.qrUrl] Anchor href for the sync stamp
 * @param {string} [options.qrImageUrl] Data-URI QR image; omit for the ghost seal
 * @param {boolean} [options.revealed] Show the 4 words instead of the resting mask
 * @param {boolean} [options.showQr] Show the pairing QR instead of the resting ghost seal
 * @param {boolean} [options.copied]
 * @param {boolean} [options.squishing]
 * @param {boolean} [options.reducedMotion]
 * @returns {string}
 */
export function renderMembershipCard({
	identity,
	skin,
	appName = "Passport",
	isPreview = false,
	avatarUri = "",
	customAvatar = false,
	qrUrl = "",
	qrImageUrl = "",
	qrSvg = "",
	revealed = false,
	showQr = true,
	copied = false,
	squishing = false,
	reducedMotion = false,
}) {
	const resolvedQrImage = qrImageUrl || qrSvg;
	const name = identity?.name || "Passport Pending";
	const phrase = identity?.phrase || "";
	const memberId = identity?.memberId || "";
	// A card with no supplied passkey holds only the public SS- code. Showing
	// hash-derived words here (and copying them) handed holders a passkey that
	// unlocked nothing; say Passport ID and show the code instead.
	const hasPasskey = Boolean(phrase);
	const displayPhrase = hasPasskey
		? revealed
			? phrase
			: maskPassphrase(phrase)
		: memberId;
	const initials = identity?.initials || "SS";
	const isPlaceholder = Boolean(identity?.isFallback);
	const kicker = isPreview ? "Passport Preview" : `${appName} Passport`;
	const passkeyLabel = isPreview
		? "Sample Passkey"
		: hasPasskey
			? "4-Word Passkey"
			: "Passport ID";
	const chipLabel = isPreview
		? "Passport preview (sample)"
		: hasPasskey
			? "Click to copy 4-word passkey"
			: "Click to copy Passport ID";
	const cardAria = isPlaceholder
		? `${escapeHtml(appName)} passport placeholder`
		: `${escapeHtml(appName)} passport${
				isPreview ? " preview" : ""
		  } for ${escapeHtml(name)}. Tap to cycle look.`;
	// Both live in the markup; CSS swaps them when the wrapper toggles
	// `.is-copied` on the card. That keeps a copy from re-rendering (and
	// replaying) the whole card.
	const copiedBadge = `<span class="passport-copied">Copied</span>`;
	const tapHint = isPreview
		? ""
		: `<span class="passport-tap-hint">tap to copy</span>`;
	const revealBtn = isPreview || !hasPasskey
		? ""
		: `<button type="button" class="passport-reveal-btn" data-passport-reveal aria-pressed="${
				revealed ? "true" : "false"
		  }">${revealed ? "Hide" : "Reveal"}</button>`;

	const avatar = avatarUri
		? `<img src="${escapeHtml(avatarUri)}" alt="" class="avatar-img" draggable="false" />`
		: `<span class="avatar-initials">${escapeHtml(initials)}</span>`;

	const reset = customAvatar && !isPreview
		? `<button type="button" class="avatar-reset" title="Reset to default avatar" aria-label="Reset custom Passport avatar">&times;</button>`
		: "";

	const qr = showQr && resolvedQrImage
		? !isPreview && qrUrl
			? `<a class="passport-qr-stamp" href="${escapeHtml(qrUrl)}" aria-label="Open ${escapeHtml(appName)} on another device">
				<img src="${escapeHtml(resolvedQrImage)}" alt="" decoding="async" referrerpolicy="no-referrer" loading="eager" />
				<span class="qr-tap-hint" aria-hidden="true">tap to sync</span>
			</a>`
			: `<div class="passport-qr-stamp passport-qr-stamp--preview" aria-hidden="true">
				<img src="${escapeHtml(resolvedQrImage)}" alt="" decoding="async" referrerpolicy="no-referrer" loading="eager" />
			</div>`
		: resolvedQrImage && !isPreview
			? `<button type="button" class="ghost-seal ghost-seal--interactive" data-slot="qr-ghost" data-passport-qr-toggle title="Pair a device" aria-label="Pair a device">
			<svg class="ghost-mark" viewBox="0 0 32 36" focusable="false" aria-hidden="true">
				<path d="M16 3c-7.1 0-12 5.4-12 13.1V32l3.5-2.2L11 32l3.5-2.2L18 32l3.5-2.2L25 32l3-1.9v-14C28 8.4 23.1 3 16 3Z" />
				<circle cx="11.5" cy="16" r="2.4" />
				<circle cx="20.5" cy="16" r="2.4" />
			</svg>
		</button>`
			: GHOST_SEAL;

	const classes = [
		"passport-card",
		isPlaceholder ? "is-placeholder" : "",
		copied ? "is-copied" : "",
		squishing ? "is-squishing" : "",
		reducedMotion ? "reduced-motion" : "",
	]
		.filter(Boolean)
		.join(" ");

	const phraseAttr = revealed
		? ` data-passport-phrase="${escapeHtml(phrase)}"`
		: ` data-passport-masked="true"`;

	return `<div class="${classes}" style="${escapeHtml(cardStyleFor(skin))}" role="button" tabindex="0" aria-label="${cardAria}" data-passport-card data-card-app="${escapeHtml(appName)}" data-passport-name="${escapeHtml(name)}"${phraseAttr} data-member-id="${escapeHtml(memberId)}" data-palette="${escapeHtml(skin.palette.name)}" data-holo="${escapeHtml(skin.choices.holo)}" data-frame="${escapeHtml(skin.choices.frame)}" data-texture="${escapeHtml(skin.choices.texture)}" data-type="${escapeHtml(skin.choices.type)}" data-avatar="${escapeHtml(skin.avatarStyle)}">
		<div class="passport-substrate" aria-hidden="true"></div>
		<div class="passport-glow" aria-hidden="true"></div>
		<div class="holofoil" aria-hidden="true"></div>
		<div class="passport-glare" aria-hidden="true"></div>
		<div class="passport-texture" aria-hidden="true"></div>
		<div class="passport-laminate" aria-hidden="true"></div>
		<div class="passport-pattern" aria-hidden="true"></div>
		<div class="passport-edge" aria-hidden="true"></div>

		<div class="passport-head">
			<div class="passport-head-text">
				<h3 class="passport-kicker">${escapeHtml(kicker)}</h3>
				<p class="passport-name">${escapeHtml(name)}</p>
			</div>

			<div class="avatar-chip-wrap">
				<input type="file" accept="image/*" class="avatar-input" tabindex="-1" aria-hidden="true" />
				<button type="button" class="avatar-chip"${
					isPreview ? " disabled" : ""
				} title="${
					isPreview ? "Passport preview avatar" : "Tap to upload custom avatar"
				}" aria-label="${
					isPreview ? "Passport preview avatar" : "Upload custom Passport avatar"
				}">${avatar}</button>
				${reset}
			</div>
		</div>

		<div class="passport-bottom">
			<div class="passport-id-chip" role="button" tabindex="0" title="${chipLabel}" aria-label="${chipLabel}">
				<p class="passport-label"><span>${passkeyLabel}</span>${revealBtn}${copiedBadge}${tapHint}</p>
				<p class="passport-member-id">${escapeHtml(displayPhrase)}</p>
			</div>

			${qr}
		</div>
	</div>`;
}

export const renderCardHtml = renderMembershipCard;
