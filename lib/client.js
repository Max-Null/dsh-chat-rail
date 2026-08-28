window.__ModuleLoader__.load({
	id: "@max-null/dsh-chat-rail",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_dom = require("react-dom");
		//#region src/client/index.tsx
		/**
		* @max-null/dsh-chat-rail — web client half.
		*
		* Right-edge conversation navigation rail: one indicator per user message,
		* scroll-spy highlight of the reading position, hover preview, click to jump.
		*
		* Two deliberate fixes over the dsh-chat-timeline reference:
		*
		* 1. ANIMATION SYNC with dsh-better-sidebar. better-sidebar drives its layout
		*    push through the `--dsh-sidebar-width` CSS variable on `:root` (the
		*    `#root` margin-right transition reads the same variable). The rail's
		*    `right` is `calc(var(--dsh-sidebar-width, 0px) + 12px)` with the same
		*    transition timing, so rail and scrollport move together while the panel
		*    expands — no "panel first, scrollbar later" lag.
		*
		* 2. VISIBILITY. The reference rail is 34px wide with 8×2px rgba(0,0,0,.16)
		*    lines — nearly invisible on a light background. Here the rail keeps a
		*    constant translucent capsule, thicker/darker indicator lines, and an
		*    always-visible collapsed state (no "reveal on pointer proximity").
		*
		* Data: host `chatRail` projection first, loaded chat nodes fallback, then a
		* background loadOlder loop (stopped as soon as the projection delivers).
		* Mounted in conversation.input.dock, portal-rendered to body.
		*/
		const inject = [
			"slots",
			"sessions",
			"conversation"
		];
		const STRINGS = {
			zh: {
				railLabel: "消息导航",
				roleUser: "用户",
				noText: "（无文本内容）",
				ariaJump: "跳转到消息",
				hasImage: "含图片",
				loading: "加载中…",
				timeJustNow: "刚刚",
				timeMinutes: "{n}分钟前",
				timeHours: "{n}小时前",
				timeDays: "{n}天前",
				fav: "收藏消息",
				unfav: "取消收藏",
				fill: "填充到输入框",
				filled: "已填入输入框",
				favOnly: "只显示收藏"
			},
			en: {
				railLabel: "Message rail",
				roleUser: "User",
				noText: "(no text)",
				ariaJump: "Jump to message",
				hasImage: "Has image",
				loading: "Loading…",
				timeJustNow: "just now",
				timeMinutes: "{n}m ago",
				timeHours: "{n}h ago",
				timeDays: "{n}d ago",
				fav: "Bookmark message",
				unfav: "Remove bookmark",
				fill: "Fill into input",
				filled: "Filled into input",
				favOnly: "Bookmarks only"
			}
		};
		/** Compact relative time for a message timestamp (zh/en via template). */
		function relativeTime(ts, s) {
			const diff = Date.now() - ts;
			if (diff < 6e4) return s.timeJustNow;
			if (diff < 36e5) return s.timeMinutes.replace("{n}", String(Math.floor(diff / 6e4)));
			if (diff < 864e5) return s.timeHours.replace("{n}", String(Math.floor(diff / 36e5)));
			if (diff < 6048e5) return s.timeDays.replace("{n}", String(Math.floor(diff / 864e5)));
			const d = new Date(ts);
			return `${d.getMonth() + 1}/${d.getDate()}`;
		}
		const css = [
			".crl_nav{user-select:none;z-index:100;position:fixed;right:calc(var(--dsh-sidebar-width,0px) + 3px);top:calc((100vh - var(--dsh-sidebar-height,0px)) / 2);transform:translateY(-50%);width:36px;max-height:min(60vh,420px,calc(100vh - var(--dsh-sidebar-height,0px) - 40px));display:flex;flex-direction:column;align-items:center;box-sizing:border-box;padding:10px 0;border-radius:18px;overflow-y:hidden;overflow-x:hidden;background:rgba(255,255,255,.55);border:1px solid rgba(0,0,0,.07);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);scrollbar-width:thin;scrollbar-color:rgba(0,0,0,.18) transparent;transition:width .25s cubic-bezier(.4,0,.2,1),right var(--ds-transition-duration-slow,0.3s) var(--ds-ease-in-out,ease-in-out),top var(--ds-transition-duration-slow,0.3s) var(--ds-ease-in-out,ease-in-out),background .2s ease,border-color .2s ease,box-shadow .2s ease}",
			"body[data-ds-dark-theme] .crl_nav,[data-theme='dark'] .crl_nav,.dark .crl_nav{background:rgba(28,28,32,.6);border-color:rgba(255,255,255,.09);scrollbar-color:rgba(255,255,255,.25) transparent}",
			".crl_nav.crl_show{width:280px;overflow-y:auto;align-items:stretch;background:rgba(255,255,255,.94);border-color:rgba(0,0,0,.08);box-shadow:0 10px 30px rgba(0,0,0,.10),0 2px 8px rgba(0,0,0,.05)}",
			"body[data-ds-dark-theme] .crl_nav.crl_show,[data-theme='dark'] .crl_nav.crl_show,.dark .crl_nav.crl_show{background:rgba(28,28,32,.96);border-color:rgba(255,255,255,.09);box-shadow:0 10px 30px rgba(0,0,0,.5),0 2px 8px rgba(0,0,0,.28)}",
			".crl_nav::-webkit-scrollbar{width:4px}",
			".crl_nav::-webkit-scrollbar-thumb{background:rgba(0,0,0,.18);border-radius:4px}",
			".crl_loading{position:sticky;top:0;z-index:2;flex-shrink:0;width:100%;padding:4px 0;font-size:10px;line-height:1;text-align:center;color:var(--dsw-alias-label-secondary,var(--text-muted,rgba(0,0,0,.5)));background:inherit;pointer-events:none}",
			".crl_loading::before{content:\"\";display:inline-block;width:8px;height:8px;margin-right:4px;border:1.5px solid var(--dsw-alias-state-business-primary,#4d6bfe);border-top-color:transparent;border-radius:50%;vertical-align:-1px;animation:crl-spin .8s linear infinite}",
			".crl_loading .crl_loadingLabel{display:none}",
			".crl_show .crl_loading .crl_loadingLabel{display:inline}",
			"@keyframes crl-spin{to{transform:rotate(360deg)}}",
			".crl_item{cursor:pointer;flex-shrink:0;height:32px;min-height:32px;display:flex;justify-content:flex-end;align-items:center;width:100%;box-sizing:border-box;padding:0 9px;line-height:20px;background:none;border:none;font:inherit;text-align:left;color:rgba(0,0,0,.68);transition:padding .25s cubic-bezier(.4,0,.2,1),color .15s ease}",
			".crl_show .crl_item{padding:0 14px}",
			".crl_item:hover{color:rgba(0,0,0,.95)}",
			".crl_item.crl_active{color:var(--dsw-alias-state-business-primary,#4d6bfe)}",
			"body[data-ds-dark-theme] .crl_item,[data-theme='dark'] .crl_item,.dark .crl_item{color:rgba(255,255,255,.68)}",
			"body[data-ds-dark-theme] .crl_item:hover,[data-theme='dark'] .crl_item:hover,.dark .crl_item:hover{color:rgba(255,255,255,.95)}",
			".crl_title{display:none;font-size:13px;line-height:20px;text-overflow:ellipsis;white-space:nowrap;margin-right:8px;flex:1;min-width:0;text-align:left;overflow:hidden;color:inherit}",
			".crl_show .crl_title{display:block;animation:crl-fade .18s ease}",
			".crl_item.crl_active .crl_title{color:var(--dsw-alias-state-business-primary,#4d6bfe);font-weight:500}",
			".crl_num{display:none;flex-shrink:0;width:28px;font-size:10px;line-height:20px;color:rgba(0,0,0,.35);margin-right:8px;text-align:right;user-select:none}",
			".crl_show .crl_num{display:block;animation:crl-fade .18s ease}",
			"body[data-ds-dark-theme] .crl_num,[data-theme='dark'] .crl_num,.dark .crl_num{color:rgba(255,255,255,.35)}",
			".crl_time{display:none;flex-shrink:0;font-size:10px;line-height:20px;color:rgba(0,0,0,.28);margin-right:10px;user-select:none;white-space:nowrap}",
			".crl_show .crl_time{display:block;animation:crl-fade .18s ease}",
			"body[data-ds-dark-theme] .crl_time,[data-theme='dark'] .crl_time,.dark .crl_time{color:rgba(255,255,255,.28)}",
			"@keyframes crl-fade{from{opacity:0}to{opacity:1}}",
			".crl_ind{flex-shrink:0;display:flex;justify-content:center;align-items:center;width:18px;height:20px}",
			".crl_show .crl_ind{margin-left:8px}",
			".crl_img{display:none;flex-shrink:0;align-items:center;justify-content:center;width:14px;height:14px;margin-left:6px;color:rgba(0,0,0,.38)}",
			".crl_show .crl_img{display:inline-flex;animation:crl-fade .18s ease}",
			"body[data-ds-dark-theme] .crl_img,[data-theme='dark'] .crl_img,.dark .crl_img{color:rgba(255,255,255,.38)}",
			".crl_line{background-color:rgba(0,0,0,.45);border-radius:4px;flex-shrink:0;width:10px;height:3px;transition:background-color .2s ease,transform .2s ease}",
			".crl_item:hover .crl_line{background-color:rgba(0,0,0,.9)}",
			".crl_item.crl_active .crl_line{background-color:var(--dsw-alias-state-business-primary,#4d6bfe);transform-origin:50%;transform:scale(1.4);box-shadow:0 0 6px var(--dsw-alias-state-business-primary,#4d6bfe)}",
			"body[data-ds-dark-theme] .crl_line,[data-theme='dark'] .crl_line,.dark .crl_line{background-color:rgba(255,255,255,.5)}",
			"body[data-ds-dark-theme] .crl_item:hover .crl_line,[data-theme='dark'] .crl_item:hover .crl_line,.dark .crl_item:hover .crl_line{background-color:rgba(255,255,255,.95)}",
			"body[data-ds-dark-theme] .crl_item.crl_active .crl_line,[data-theme='dark'] .crl_item.crl_active .crl_line,.dark .crl_item.crl_active .crl_line{background-color:var(--dsw-alias-state-business-primary,#4d6bfe)}",
			".crl_tip{position:fixed;z-index:200;max-width:360px;max-height:70vh;overflow-y:auto;padding:10px 12px;font-size:12px;line-height:1.6;color:var(--dsw-alias-label-primary,var(--text-primary,rgba(0,0,0,.85)));background:var(--dsw-alias-surface-raised,var(--bg-elevated,rgba(255,255,255,.97)));border:1px solid var(--dsw-alias-border-l2,var(--border-default,rgba(0,0,0,.12)));border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.16);white-space:pre-wrap;word-break:break-word;pointer-events:none}",
			"body[data-ds-dark-theme] .crl_tip,[data-theme='dark'] .crl_tip,.dark .crl_tip{background:var(--dsw-alias-surface-raised,var(--bg-elevated,rgba(28,28,32,.97)));border-color:var(--dsw-alias-border-l2,var(--border-default,rgba(255,255,255,.14)))}",
			".crl_tipImgs{display:flex;flex-direction:column;gap:6px;margin-bottom:8px}",
			".crl_tipImgWrap{position:relative;width:fit-content;max-width:100%;max-height:150px}",
			".crl_tipImg{display:block;max-width:100%;max-height:150px;width:auto;height:auto;object-fit:contain;border-radius:8px;border:1px solid var(--dsw-alias-border-l2,var(--border-default,rgba(0,0,0,.12)))}",
			".crl_tipImgCount{position:absolute;right:6px;bottom:6px;padding:0 6px;font-size:10px;line-height:16px;border-radius:9px;background:rgba(0,0,0,.55);color:rgba(255,255,255,.95);pointer-events:none}",
			".crl_tipImgPh{flex-shrink:0;height:56px;border-radius:8px;background:var(--dsw-alias-surface-sunken,var(--bg-muted,rgba(0,0,0,.05)));animation:crl-pulse 1.2s ease-in-out infinite}",
			"body[data-ds-dark-theme] .crl_tipImg,[data-theme='dark'] .crl_tipImg,.dark .crl_tipImg{border-color:var(--dsw-alias-border-l2,var(--border-default,rgba(255,255,255,.14)))}",
			".crl_tipBadge{display:inline-block;margin-bottom:8px;padding:0 7px;font-size:10px;line-height:16px;border-radius:9px;background:var(--dsw-alias-surface-sunken,var(--bg-muted,rgba(0,0,0,.06)));color:var(--dsw-alias-label-secondary,var(--text-muted,rgba(0,0,0,.45)))}",
			"@keyframes crl-pulse{0%,100%{opacity:.45}50%{opacity:.85}}",
			".crl_msgAct{position:relative;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;margin:0;padding:6px;border:none;border-radius:28px;background:transparent;color:var(--dsw-alias-label-tertiary,rgba(0,0,0,.42));cursor:pointer;transition:background .15s ease,color .15s ease}",
			".crl_msgAct:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06));color:var(--dsw-alias-label-secondary,rgba(0,0,0,.72))}",
			".crl_msgAct:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#4d6bfe);outline-offset:2px}",
			".crl_msgAct[data-tip]:hover::after{content:attr(data-tip);position:absolute;left:50%;bottom:calc(100% + 8px);transform:translateX(-50%);padding:5px 10px;border-radius:8px;background:rgba(24,28,36,.94);color:rgba(255,255,255,.95);font-size:12px;line-height:1.4;white-space:nowrap;pointer-events:none;opacity:0;animation:crl-tip-in .12s ease .55s forwards;z-index:3000}",
			".crl_msgAct[data-tip]:hover::before{content:\"\";position:absolute;left:50%;bottom:calc(100% + 3px);transform:translateX(-50%);border-left:5px solid transparent;border-right:5px solid transparent;border-top:5px solid rgba(24,28,36,.94);pointer-events:none;opacity:0;animation:crl-tip-in .12s ease .55s forwards;z-index:3000}",
			"@keyframes crl-tip-in{to{opacity:1}}",
			".crl_msgAct.crl_fav.crl_on{color:#ffd166}",
			".crl_msgAct.crl_fav.crl_on svg{fill:currentColor}",
			".crl_msgAct.crl_fav.crl_on:hover{color:#ffd166}",
			".crl_favStar{display:none;flex-shrink:0;align-items:center;justify-content:center;width:14px;height:14px;margin-right:6px;color:#ffd166}",
			".crl_show .crl_favStar{display:inline-flex;animation:crl-fade .18s ease}",
			".crl_item.crl_favItem .crl_line{background-color:#ffd166}",
			"body[data-ds-dark-theme] .crl_item.crl_favItem .crl_line,[data-theme='dark'] .crl_item.crl_favItem .crl_line,.dark .crl_item.crl_favItem .crl_line{background-color:#ffd166}",
			".crl_item.crl_favItem.crl_active .crl_line{background-color:#ffd166;box-shadow:0 0 6px #ffd166}",
			".crl_favToggle{position:sticky;top:-10px;z-index:3;flex-shrink:0;display:flex;align-items:center;justify-content:center;gap:6px;width:26px;height:26px;margin:0 0 6px;padding:0;border:none;border-radius:13px;background:inherit;color:rgba(0,0,0,.4);cursor:pointer;font-size:11px;line-height:1;white-space:nowrap;transition:background .15s ease,color .15s ease}",
			".crl_favToggle:hover{background:rgba(0,0,0,.07);color:rgba(0,0,0,.75)}",
			".crl_favToggle.crl_on{color:#ffd166;background:rgba(255,209,102,.14)}",
			".crl_show .crl_favToggle{width:auto;height:26px;margin:0 6px 8px;padding:0 11px;border-radius:13px;align-self:flex-start;text-align:left}",
			".crl_favToggleLabel{display:none}",
			".crl_show .crl_favToggleLabel{display:inline-block;min-width:0;overflow:hidden;text-overflow:ellipsis;vertical-align:middle}",
			"body[data-ds-dark-theme] .crl_favToggle,[data-theme='dark'] .crl_favToggle,.dark .crl_favToggle{color:rgba(255,255,255,.4)}",
			"body[data-ds-dark-theme] .crl_favToggle:hover,[data-theme='dark'] .crl_favToggle:hover,.dark .crl_favToggle:hover{background:rgba(255,255,255,.1);color:rgba(255,255,255,.85)}",
			"body[data-ds-dark-theme] .crl_favToggle.crl_on,[data-theme='dark'] .crl_favToggle.crl_on,.dark .crl_favToggle.crl_on{color:#ffd166;background:rgba(255,209,102,.18)}",
			"@media (prefers-reduced-motion:reduce){.crl_nav,.crl_title,.crl_num,.crl_time,.crl_line{transition:none}.crl_tipImgPh{animation:none}}"
		].join("");
		const STYLE_ID = "@max-null/dsh-chat-rail/styles.module.css";
		if (typeof document !== "undefined" && document.querySelector(`style[data-plugin-css="${STYLE_ID}"]`) === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-chat-rail";
			tag.dataset.pluginCss = STYLE_ID;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		const S = {
			nav: "crl_nav",
			navShow: "crl_show",
			item: "crl_item",
			itemActive: "crl_active",
			title: "crl_title",
			num: "crl_num",
			time: "crl_time",
			ind: "crl_ind",
			line: "crl_line",
			img: "crl_img",
			loading: "crl_loading",
			loadingLabel: "crl_loadingLabel",
			tip: "crl_tip",
			tipImgs: "crl_tipImgs",
			tipImgWrap: "crl_tipImgWrap",
			tipImg: "crl_tipImg",
			tipImgCount: "crl_tipImgCount",
			tipImgPh: "crl_tipImgPh",
			tipBadge: "crl_tipBadge",
			favStar: "crl_favStar",
			favItem: "crl_favItem",
			favToggle: "crl_favToggle",
			favToggleLabel: "crl_favToggleLabel"
		};
		const NOOP_STORE = {
			getSnapshot: () => void 0,
			subscribe: () => () => {}
		};
		const FAVORITES_KEY = "@max-null/dsh-chat-rail:favorites";
		const FAVORITES_API = "/chat-rail/api/favorites";
		/** 模块级快照缓存（host 加载后充当源 truth）+ 订阅者集合。 */
		let favoritesCache = null;
		const favoritesListeners = /* @__PURE__ */ new Set();
		/** 从 localStorage 读旧数据（迁移用/离线兜底）。 */
		function readFavoritesLocal() {
			if (typeof localStorage === "undefined") return {};
			try {
				const raw = localStorage.getItem(FAVORITES_KEY);
				if (raw === null) return {};
				const value = JSON.parse(raw);
				return value !== null && typeof value === "object" && !Array.isArray(value) ? value : {};
			} catch {
				return {};
			}
		}
		async function fetchFavoritesMap() {
			try {
				const res = await fetch(FAVORITES_API, { headers: { Accept: "application/json" } });
				if (!res.ok) return {};
				const value = (await res.json())?.value;
				return value !== null && typeof value === "object" && !Array.isArray(value) ? value : {};
			} catch {
				return {};
			}
		}
		/** 模块加载时同步 host；旧 localStorage 数据迁移一次（host 为空且本地有值）。 */
		(async () => {
			const host = await fetchFavoritesMap();
			if (typeof window !== "undefined" && typeof localStorage !== "undefined") {
				const legacy = readFavoritesLocal();
				if (Object.keys(host).length === 0 && Object.keys(legacy).length > 0) await fetch(FAVORITES_API, {
					method: "PUT",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ favorites: legacy })
				}).catch(() => {});
				try {
					localStorage.removeItem(FAVORITES_KEY);
				} catch {}
				favoritesCache = Object.keys(host).length === 0 ? legacy : host;
				for (const listener of favoritesListeners) listener();
			} else favoritesCache = host;
		})();
		/** Read the favorites map（内存镜像；未加载完成时回退 localStorage）。 */
		function readFavorites() {
			if (favoritesCache !== null) return favoritesCache;
			return readFavoritesLocal();
		}
		/** Write the favorites map；更新内存并 fire-and-forget 持久化到 host（host-only）。 */
		function writeFavorites(map) {
			favoritesCache = map;
			fetch(FAVORITES_API, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ favorites: map })
			}).catch(() => {});
		}
		/** Normalized id list for one session (drops non-string entries). */
		function favoriteIdsOf(map, sessionId) {
			const list = map[sessionId];
			return Array.isArray(list) ? list.filter((id) => typeof id === "string") : [];
		}
		/** Toggle one id in a list (stable new array; no in-place mutation). */
		function toggleFavoriteId(list, id) {
			return list.includes(id) ? list.filter((candidate) => candidate !== id) : [...list, id];
		}
		/** Whether one message is favorited in one session. */
		function isFavorite(map, sessionId, messageId) {
			return favoriteIdsOf(map, sessionId).includes(messageId);
		}
		/** Stable snapshot for useSyncExternalStore (loaded once, cached until toggle). */
		function favoritesSnapshot() {
			if (favoritesCache === null) favoritesCache = readFavorites();
			return favoritesCache;
		}
		/** Subscribe to favorites changes; returns the unsubscribe. */
		function subscribeFavorites(listener) {
			favoritesListeners.add(listener);
			return () => {
				favoritesListeners.delete(listener);
			};
		}
		/** Toggle one message's favorite state: snapshot → new map → persist → notify. */
		function toggleFavorite(sessionId, messageId) {
			const next = { ...favoritesSnapshot() };
			next[sessionId] = toggleFavoriteId(favoriteIdsOf(favoritesSnapshot(), sessionId), messageId);
			favoritesCache = next;
			writeFavorites(next);
			for (const listener of [...favoritesListeners]) listener();
		}
		/** Remember the messageId read off a DOM anchor key (`13:input-message<id>`). */
		function messageIdOfAnchorKey(key) {
			return key.startsWith("13:input-message") ? key.slice(16) : key;
		}
		/** The favorite key of one rail message: the durable id when present (host
		*  projection), otherwise the id reconstructed from the node anchor (the
		*  loaded-node fallback path). */
		function favoriteIdOfMessage(m) {
			if (typeof m.id === "string" && m.id !== "") return m.id;
			if (typeof m.key === "string") return messageIdOfAnchorKey(m.key);
			return "";
		}
		const actionCtx = {
			sessionId: void 0,
			onToggleFavorite: () => {},
			onFill: () => {}
		};
		/** aria-label values of the copy button across shipped locales (button sits
		*  in the user row's IconActions; its parent is the row's action host). */
		const COPY_ARIA_LABELS = /* @__PURE__ */ new Set([
			"复制",
			"Copy",
			"已复制",
			"Copied"
		]);
		/** The copy button inside one user message row (null until rendered). */
		function copyButtonOf(row) {
			for (const button of row.querySelectorAll("button")) {
				const label = button.getAttribute("aria-label");
				if (label !== null && COPY_ARIA_LABELS.has(label)) return button;
			}
			return null;
		}
		/** Star SVG path (milestone-compatible glyph, 24-unit viewBox). */
		const STAR_PATH = "m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z";
		/** Build the favorite (star) button for one user message row. */
		function favoriteButtonOf(messageId, lang) {
			const button = document.createElement("button");
			button.type = "button";
			button.className = "crl_msgAct crl_fav";
			button.dataset.crlStar = messageId;
			const initialLabel = isFavorite(favoritesSnapshot(), actionCtx.sessionId ?? "", messageId) ? lang.unfav : lang.fav;
			button.setAttribute("aria-pressed", String(isFavorite(favoritesSnapshot(), actionCtx.sessionId ?? "", messageId)));
			button.dataset.starred = isFavorite(favoritesSnapshot(), actionCtx.sessionId ?? "", messageId) ? "true" : void 0;
			button.classList.toggle("crl_on", isFavorite(favoritesSnapshot(), actionCtx.sessionId ?? "", messageId));
			button.setAttribute("data-tip", initialLabel);
			button.setAttribute("aria-label", initialLabel);
			button.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="${STAR_PATH}"/></svg>`;
			button.addEventListener("click", (event) => {
				event.preventDefault();
				event.stopPropagation();
				const id = button.dataset.crlStar;
				if (id !== void 0) {
					actionCtx.onToggleFavorite(id);
					refreshFavoriteButton(button, lang);
				}
			});
			return button;
		}
		/** Build the fill-to-input (plus) button for one user message row. */
		function fillButtonOf(messageId, lang) {
			const button = document.createElement("button");
			button.type = "button";
			button.className = "crl_msgAct crl_fill";
			button.dataset.crlFill = messageId;
			button.setAttribute("data-tip", lang.fill);
			button.setAttribute("aria-label", lang.fill);
			button.innerHTML = "<svg width=\"16\" height=\"16\" viewBox=\"0 0 16 16\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" aria-hidden=\"true\"><path d=\"M8 3.5v9M3.5 8h9\"/></svg>";
			button.addEventListener("click", (event) => {
				event.preventDefault();
				event.stopPropagation();
				const id = button.dataset.crlFill;
				if (id !== void 0) actionCtx.onFill(id);
			});
			return button;
		}
		/** Sync one star button to its message's current favorite state. */
		function refreshFavoriteButton(button, lang) {
			const id = button.dataset.crlStar;
			if (id === void 0) return;
			const starred = isFavorite(favoritesSnapshot(), actionCtx.sessionId ?? "", id);
			button.setAttribute("aria-pressed", String(starred));
			button.dataset.starred = starred ? "true" : void 0;
			button.classList.toggle("crl_on", starred);
			const label = starred ? lang.unfav : lang.fav;
			button.setAttribute("data-tip", label);
			button.setAttribute("aria-label", label);
		}
		/** Refresh every injected star button (session switch / external toggle). */
		function refreshAllFavoriteButtons(lang) {
			for (const button of document.querySelectorAll("[data-crl-star]")) refreshFavoriteButton(button, lang);
		}
		/** Inject star + plus buttons into one user message row (idempotent). */
		function injectMessageActions(row, lang) {
			if (row.dataset.crlActions === "1") {
				if (row.querySelector("[data-crl-star]") !== null && row.querySelector("[data-crl-fill]") !== null) return;
			}
			const copy = copyButtonOf(row);
			const messageId = messageIdOfAnchorKey(row.getAttribute("data-chat-anchor-key") ?? "");
			if (copy === null || messageId === "") return;
			const star = favoriteButtonOf(messageId, lang);
			star.dataset.starred = isFavorite(favoritesSnapshot(), actionCtx.sessionId ?? "", messageId) ? "true" : void 0;
			star.classList.toggle("crl_on", isFavorite(favoritesSnapshot(), actionCtx.sessionId ?? "", messageId));
			const fill = fillButtonOf(messageId, lang);
			copy.before(star, fill);
			row.dataset.crlActions = "1";
		}
		/** Start observing new user rows so injected actions follow history paging. */
		function startActionInjector(lang) {
			const scan = () => {
				for (const row of document.querySelectorAll("[data-chat-anchor-key^=\"13:input-message\"]")) injectMessageActions(row, lang);
			};
			const observer = new MutationObserver(scan);
			if (typeof document !== "undefined" && document.body !== null) observer.observe(document.body, {
				childList: true,
				subtree: true
			});
			scan();
			return () => observer.disconnect();
		}
		/** Extract stored-image references from a ContentBlock list (reference form). */
		function nodeImagesOf(content) {
			if (!Array.isArray(content)) return [];
			const out = [];
			for (const block of content) {
				if (block === null || typeof block !== "object") continue;
				const b = block;
				if (b.type !== "image") continue;
				const a = b.attachment;
				if (a === null || typeof a !== "object") continue;
				const ref = a;
				if (typeof ref.attachmentId !== "string" || ref.attachmentId === "") continue;
				out.push({
					attachmentId: ref.attachmentId,
					mediaType: typeof ref.mediaType === "string" ? ref.mediaType : "image/png",
					width: typeof ref.width === "number" ? ref.width : 0,
					height: typeof ref.height === "number" ? ref.height : 0
				});
			}
			return out;
		}
		/** Convert a ContentBlock list to displayable image specs; inline base64
		*  blocks (rare in replayed history) become data URLs on the spot. */
		function imageSpecsOfContent(content) {
			const specs = [];
			if (!Array.isArray(content)) return specs;
			for (const block of content) {
				if (block === null || typeof block !== "object") continue;
				const b = block;
				if (b.type !== "image") continue;
				const a = b.attachment;
				if (a !== null && typeof a === "object") {
					const ref = a;
					if (typeof ref.attachmentId === "string" && ref.attachmentId !== "") {
						specs.push({
							kind: "ref",
							attachmentId: ref.attachmentId,
							mediaType: typeof ref.mediaType === "string" ? ref.mediaType : "image/png"
						});
						continue;
					}
				}
				if (typeof b.data === "string" && b.data !== "") specs.push({
					kind: "data",
					src: `data:${typeof b.mediaType === "string" ? b.mediaType : "image/png"};base64,${b.data}`
				});
			}
			return specs;
		}
		/** Normalize one projection entry to a rail message. */
		function normalize(m) {
			if (m === null || typeof m !== "object") return null;
			const o = m;
			if (typeof o.seq !== "number") return null;
			const text = typeof o.text === "string" ? o.text : typeof o.preview === "string" ? o.preview : "";
			const images = Array.isArray(o.images) ? o.images.map(nodeImagesOfEntry).filter((i) => i !== null) : void 0;
			return {
				seq: o.seq,
				time: typeof o.time === "number" ? o.time : 0,
				text,
				hasImage: o.hasImage === true,
				...images !== void 0 && images.length > 0 ? { images } : {},
				...typeof o.key === "string" ? { key: o.key } : {},
				...typeof o.id === "string" ? { id: o.id } : {}
			};
		}
		/** Normalize one projection entry of the `images` array (wire form). */
		function nodeImagesOfEntry(v) {
			if (v === null || typeof v !== "object") return null;
			const o = v;
			if (typeof o.attachmentId !== "string" || o.attachmentId === "") return null;
			return {
				attachmentId: o.attachmentId,
				mediaType: typeof o.mediaType === "string" ? o.mediaType : "image/png",
				width: typeof o.width === "number" ? o.width : 0,
				height: typeof o.height === "number" ? o.height : 0
			};
		}
		/** Extract preview text from a user message's ContentBlock list. */
		function userTextOf(content) {
			if (!Array.isArray(content)) return "";
			let out = "";
			for (const block of content) if (block !== null && typeof block === "object" && block.type === "text" && typeof block.text === "string") out += block.text;
			return out.trim().slice(0, 80);
		}
		/** Whether a ContentBlock list carries an image block (rc.8 attachments). */
		function userHasImage(content) {
			if (!Array.isArray(content)) return false;
			return content.some((block) => block !== null && typeof block === "object" && block.type === "image");
		}
		/** Fallback collector: enumerate user messages from the loaded chat nodes. */
		function collectFromNodes(snapshot) {
			const out = [];
			if (snapshot === void 0 || snapshot.chat === void 0) return out;
			const chat = snapshot.chat;
			if (!chat.nodes) return out;
			for (const node of chat.nodes.values()) {
				if (node === null || typeof node !== "object") continue;
				const n = node;
				if (n.kind !== "user") continue;
				const data = n.data;
				if (data === null || typeof data !== "object") continue;
				if (typeof data.time !== "number" || !Array.isArray(data.content)) continue;
				const key = typeof n.key === "string" ? n.key : void 0;
				if (key === void 0) continue;
				const images = nodeImagesOf(data.content);
				out.push({
					seq: typeof n.anchorSeq === "number" ? n.anchorSeq : 0,
					time: data.time,
					text: userTextOf(data.content),
					hasImage: userHasImage(data.content),
					...images.length > 0 ? { images } : {},
					key
				});
			}
			out.sort((a, b) => a.seq - b.seq);
			return out;
		}
		/** Resolve the chat node's data-chat-anchor-key (direct key or id-reconstructed). */
		function anchorKeyOf(m) {
			if (typeof m.key === "string" && m.key !== "") return m.key;
			if (typeof m.id === "string" && m.id !== "") return "13:input-message" + m.id;
		}
		/** Full text of a rail message from the loaded chat nodes (uncapped),
		*  falling back to the projection preview when the node is not mounted. */
		function fullTextOf(m, nodeSnapshot) {
			const key = anchorKeyOf(m);
			const nodes = nodeSnapshot?.chat?.nodes;
			const content = (key === void 0 ? void 0 : nodes?.get(key))?.data?.content;
			if (Array.isArray(content)) {
				let out = "";
				for (const block of content) if (block !== null && typeof block === "object" && block.type === "text" && typeof block.text === "string") out += block.text;
				const full = out.trim();
				if (full !== "") return full;
			}
			return m.text;
		}
		/** Displayable tip images for one rail message: host projection references
		*  first (works even before the node window covers the message), then the
		*  loaded chat node's content blocks. */
		function tipImagesOf(m, nodeSnapshot) {
			if (Array.isArray(m.images) && m.images.length > 0) return m.images.map((img) => ({
				kind: "ref",
				attachmentId: img.attachmentId,
				mediaType: img.mediaType
			}));
			const key = anchorKeyOf(m);
			const nodes = nodeSnapshot?.chat?.nodes;
			return imageSpecsOfContent((key === void 0 ? void 0 : nodes?.get(key))?.data?.content);
		}
		const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
		/**
		* Ensure the message node is loaded into the visible window, then scroll to it.
		* loadOlder pages 50 messages at a time (DSH PAGE_MESSAGES), so a jump far back
		* in a long session needs many pages. Report page count through onProgress so
		* the UI can show a loading state instead of appearing frozen.
		*
		* The paged-in data lands in the session snapshot synchronously with
		* loadOlder's resolution, but the chat rows render through React — the DOM row
		* for the target key appears a beat later. We therefore poll for the row (with
		* a timeout) instead of querying once and giving up; otherwise a multi-page
		* jump would "finish loading" without scrolling and need a second click.
		*/
		async function jumpToMessage(sessionsService, sessionId, key, onProgress, signal) {
			const session = sessionsService.binding(sessionId)?.session;
			if (session === void 0) return false;
			let pages = 0;
			let guard = 0;
			let loaded = false;
			while (guard++ < 120) {
				if (signal?.aborted) return false;
				const snapshot = session.getSnapshot();
				if (snapshot?.chat?.nodes?.get(key) !== void 0) {
					loaded = true;
					break;
				}
				if (snapshot?.hasMore !== true) break;
				if (snapshot.loadingOlder === true) {
					await delay(50);
					continue;
				}
				await session.loadOlder();
				pages++;
				onProgress?.(pages);
			}
			if (!loaded) {
				console.warn(`[chat-rail] jumpToMessage: node "${key}" not loaded after ${pages} page(s)`);
				return false;
			}
			const scrollport = typeof document !== "undefined" ? document.querySelector("[data-conversation-scroll]") : null;
			if (scrollport === null) return false;
			let row = null;
			let waited = 0;
			while (waited++ < 100) {
				if (signal?.aborted) return false;
				row = scrollport.querySelector(`[data-chat-anchor-key="${CSS.escape(key)}"]`);
				if (row !== null) break;
				await delay(50);
			}
			if (row === null) return false;
			const reducedMotion = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
			row.scrollIntoView({
				behavior: reducedMotion ? "auto" : "smooth",
				block: "center"
			});
			return true;
		}
		/** Session-scoped browser URL cache for resolved attachment bytes (one entry
		*  per session:attachment; a failed load evicts itself so the next hover
		*  retries instead of showing a permanently broken thumbnail). */
		const thumbUrls = /* @__PURE__ */ new Map();
		/** Fallback data URL when the browser cannot mint object URLs. */
		function bytesToDataUrl(data, mediaType) {
			let binary = "";
			const chunk = 32768;
			for (let offset = 0; offset < data.length; offset += chunk) binary += String.fromCharCode(...data.subarray(offset, offset + chunk));
			return `data:${mediaType};base64,${btoa(binary)}`;
		}
		/** Resolve (and cache) one stored image to a displayable URL. */
		function resolveThumb(sessionId, read, image) {
			const key = `${sessionId}:${image.attachmentId}`;
			let pending = thumbUrls.get(key);
			if (pending === void 0) {
				pending = read(image.attachmentId).then((result) => {
					if (!result.ok || result.value === void 0) throw new Error(result.error?.message ?? result.error?.code ?? "readAttachment failed");
					const data = result.value.data;
					if (data === void 0) throw new Error("readAttachment resolved no bytes");
					const mediaType = result.value.attachment?.mediaType ?? image.mediaType;
					if (typeof URL.createObjectURL === "function") return URL.createObjectURL(new Blob([data], { type: mediaType }));
					return bytesToDataUrl(data, mediaType);
				});
				pending.catch(() => {
					thumbUrls.delete(key);
				});
				thumbUrls.set(key, pending);
			}
			return pending;
		}
		/** One tip thumbnail: resolves its attachment lazily, shows a pulsing
		*  placeholder while loading, and removes itself on failure. */
		function TipThumb({ spec, sessionId, read }) {
			const [src, setSrc] = (0, react.useState)(null);
			const [failed, setFailed] = (0, react.useState)(false);
			const specKey = spec.kind === "ref" ? `ref:${spec.attachmentId}` : "data";
			(0, react.useEffect)(() => {
				let alive = true;
				setSrc(null);
				setFailed(false);
				if (spec.kind === "data") {
					setSrc(spec.src);
					return () => {
						alive = false;
					};
				}
				resolveThumb(sessionId, read, spec).then((url) => {
					if (alive) setSrc(url);
				}).catch(() => {
					if (alive) setFailed(true);
				});
				return () => {
					alive = false;
				};
			}, [
				specKey,
				sessionId,
				read
			]);
			if (failed) return null;
			if (src === null) return (0, react.createElement)("div", {
				className: S.tipImgPh,
				"aria-hidden": true
			});
			return (0, react.createElement)("img", {
				className: S.tipImg,
				src,
				alt: "",
				draggable: false
			});
		}
		/** Resolve copy for the current UI language (document lang, DSH sets zh/en). */
		function langStrings() {
			const lang = typeof document !== "undefined" ? (document.documentElement.lang || "zh").toLowerCase() : "zh";
			return STRINGS[lang.startsWith("zh") ? "zh" : "en"];
		}
		function TimelineRail({ useProjection, sessionId, sessionsService, inputActions, conversation }) {
			const t = langStrings();
			const projected = useProjection("chatRail");
			const session = sessionId === void 0 ? void 0 : sessionsService.binding(sessionId)?.session;
			const fallbackStore = session === void 0 ? NOOP_STORE : session;
			const nodeSnapshot = (0, react.useSyncExternalStore)((cb) => fallbackStore.subscribe(cb), () => fallbackStore.getSnapshot());
			let messages = [];
			if (Array.isArray(projected?.messages) && projected.messages.length > 0) messages = projected.messages.map(normalize).filter((m) => m !== null);
			if (messages.length === 0) messages = collectFromNodes(nodeSnapshot);
			const favorites = (0, react.useSyncExternalStore)(subscribeFavorites, favoritesSnapshot);
			const [favOnly, setFavOnly] = (0, react.useState)(false);
			const showFavToggle = (sessionId === void 0 ? 0 : messages.filter((m) => isFavorite(favorites, sessionId, favoriteIdOfMessage(m))).length) > 0;
			const effectiveMessages = favOnly ? messages.filter((m) => sessionId !== void 0 && isFavorite(favorites, sessionId, favoriteIdOfMessage(m))) : messages;
			(0, react.useEffect)(() => {
				if (favOnly && !showFavToggle) setFavOnly(false);
			}, [favOnly, showFavToggle]);
			const [activeIndex, setActiveIndex] = (0, react.useState)(-1);
			const [show, setShow] = (0, react.useState)(false);
			const [jumping, setJumping] = (0, react.useState)(false);
			const [tip, setTip] = (0, react.useState)(null);
			const navRef = (0, react.useRef)(null);
			const expandedRef = (0, react.useRef)(false);
			const lastPointerRef = (0, react.useRef)(null);
			const jumpAbortRef = (0, react.useRef)(null);
			(0, react.useEffect)(() => () => jumpAbortRef.current?.abort(), []);
			(0, react.useEffect)(() => {
				const el = navRef.current;
				if (el === null) return;
				const onMove = (e) => {
					lastPointerRef.current = {
						x: e.clientX,
						y: e.clientY
					};
				};
				el.addEventListener("pointermove", onMove, { passive: true });
				return () => el.removeEventListener("pointermove", onMove);
			}, []);
			/** Position the tip against the item's CURRENT (post-expand) rect. */
			const positionTip = (index) => {
				if (index < 0) return;
				const el = navRef.current?.querySelector(`[data-crl-index="${index}"]`);
				if (el === null || el === void 0) return;
				const rect = el.getBoundingClientRect();
				setTip({
					index,
					x: rect.left - 12,
					y: rect.top
				});
			};
			/** Handle item hover: the collapsed state only expands the rail; the tip
			*  only triggers once the expand animation has settled (item rects are then
			*  stable, so the tip is positioned correctly). */
			const handleItemEnter = (index) => {
				if (!expandedRef.current) {
					setShow(true);
					return;
				}
				positionTip(index);
			};
			const handleItemLeave = (index) => {
				setTip((prev) => prev?.index === index ? null : prev);
			};
			(0, react.useEffect)(() => {
				if (!show) {
					expandedRef.current = false;
					return;
				}
				const el = navRef.current;
				if (el === null) return;
				let settled = false;
				const settle = () => {
					if (settled) return;
					settled = true;
					expandedRef.current = true;
					el.removeEventListener("transitionend", onTransitionEnd);
					clearTimeout(timer);
					const p = lastPointerRef.current;
					if (p !== null) {
						const hit = document.elementFromPoint(p.x, p.y);
						const item = hit === null ? null : hit.closest("[data-crl-index]");
						const idx = item === null ? -1 : Number(item.getAttribute("data-crl-index"));
						if (Number.isInteger(idx) && idx >= 0) positionTip(idx);
					}
				};
				const onTransitionEnd = (e) => {
					if (e.propertyName !== "width") return;
					settle();
				};
				el.addEventListener("transitionend", onTransitionEnd);
				const timer = setTimeout(settle, 300);
				return () => {
					el.removeEventListener("transitionend", onTransitionEnd);
					clearTimeout(timer);
				};
			}, [show]);
			const readThumb = (0, react.useMemo)(() => {
				if (sessionId === void 0) return void 0;
				const s = sessionsService.binding(sessionId)?.session;
				return s?.readAttachment === void 0 ? void 0 : (id) => s.readAttachment(id);
			}, [sessionId, sessionsService]);
			const fillToInput = (0, react.useCallback)((messageId) => {
				const m = messages.find((candidate) => favoriteIdOfMessage(candidate) === messageId);
				if (m === void 0 || inputActions === void 0 || sessionId === void 0) return;
				const text = fullTextOf(m, nodeSnapshot) || m.text;
				if (inputActions.setDraft !== void 0) inputActions.setDraft(text);
				const specs = tipImagesOf(m, nodeSnapshot).filter((spec) => spec.kind === "ref");
				if (specs.length === 0 || conversation === void 0 || readThumb === void 0) return;
				(async () => {
					const files = [];
					for (const spec of specs) try {
						const result = await readThumb(spec.attachmentId);
						if (result?.ok !== true || result.value?.data === void 0) continue;
						const mediaType = result.value.attachment?.mediaType ?? spec.mediaType;
						files.push(new File([result.value.data], `attachment-${spec.attachmentId}${mediaType.includes("jpeg") ? ".jpg" : ".png"}`, { type: mediaType }));
					} catch {}
					if (files.length === 0) return;
					const ids = conversation.createDraftImages(files).map((draft) => draft.id).filter((id) => id !== void 0);
					if (ids.length > 0) try {
						inputActions.addImages?.(ids);
					} catch {}
				})();
			}, [
				conversation,
				inputActions,
				messages,
				nodeSnapshot,
				readThumb,
				sessionId
			]);
			(0, react.useEffect)(() => {
				actionCtx.sessionId = sessionId;
				actionCtx.onToggleFavorite = (messageId) => {
					if (sessionId !== void 0) toggleFavorite(sessionId, messageId);
				};
				actionCtx.onFill = fillToInput;
				refreshAllFavoriteButtons(t);
				return () => {
					if (actionCtx.sessionId === sessionId) actionCtx.sessionId = void 0;
				};
			}, [
				sessionId,
				fillToInput,
				t
			]);
			(0, react.useEffect)(() => {
				refreshAllFavoriteButtons(t);
			}, [favorites, t]);
			(0, react.useEffect)(() => {
				if (typeof document === "undefined" || document.body === null) return;
				return startActionInjector(t);
			}, [t]);
			(0, react.useEffect)(() => {
				if (session === void 0) return;
				if (Array.isArray(projected?.messages) && projected.messages.length > 0) return;
				let cancelled = false;
				const run = async () => {
					let guard = 0;
					while (!cancelled && guard++ < 120) {
						if (Array.isArray(projected?.messages) && projected.messages.length > 0) return;
						const snap = session.getSnapshot();
						if (snap?.hasMore !== true) return;
						if (snap.loadingOlder === true) {
							await delay(50);
							continue;
						}
						await session.loadOlder();
					}
				};
				run().catch(() => {});
				return () => {
					cancelled = true;
				};
			}, [
				sessionId,
				session === void 0 ? "none" : "ready",
				Array.isArray(projected?.messages) && projected.messages.length > 0 ? "have" : "none"
			]);
			(0, react.useEffect)(() => {
				if (effectiveMessages.length === 0) return;
				const indexByKey = /* @__PURE__ */ new Map();
				for (let i = 0; i < effectiveMessages.length; i++) {
					const key = anchorKeyOf(effectiveMessages[i]);
					if (key !== void 0) indexByKey.set(key, i);
				}
				const updateActive = () => {
					const sp = document.querySelector("[data-conversation-scroll]");
					if (sp === null) return;
					const rect = sp.getBoundingClientRect();
					if (rect.height === 0) return;
					const line = rect.top + rect.height * .4;
					const rows = sp.querySelectorAll("[data-chat-anchor-key^=\"13:input-message\"]");
					let best = -1;
					let bestDist = Infinity;
					for (const row of rows) {
						const key = row.getAttribute("data-chat-anchor-key");
						if (key === null) continue;
						const idx = indexByKey.get(key) ?? -1;
						if (idx === -1) continue;
						const r = row.getBoundingClientRect();
						const dist = Math.abs(r.top + r.height / 2 - line);
						if (dist < bestDist) {
							bestDist = dist;
							best = idx;
						}
					}
					setActiveIndex(best);
				};
				updateActive();
				const el = document.querySelector("[data-conversation-scroll]");
				let scrollTimer = null;
				const onScroll = () => {
					if (scrollTimer !== null) return;
					scrollTimer = setTimeout(() => {
						scrollTimer = null;
						updateActive();
					}, 60);
				};
				el?.addEventListener("scroll", onScroll, { passive: true });
				const timer = window.setInterval(updateActive, 2e3);
				return () => {
					el?.removeEventListener("scroll", onScroll);
					window.clearInterval(timer);
					if (scrollTimer !== null) clearTimeout(scrollTimer);
				};
			}, [sessionId, effectiveMessages.length]);
			(0, react.useEffect)(() => {
				if (activeIndex < 0) return;
				const el = navRef.current;
				if (el === null) return;
				const item = el.querySelector(`[data-crl-index="${activeIndex}"]`);
				if (item === null) return;
				const target = item.offsetTop - el.clientHeight / 2 + item.clientHeight / 2;
				el.scrollTo({
					top: Math.max(0, target),
					behavior: "smooth"
				});
			}, [activeIndex]);
			if (sessionId === void 0 || messages.length < 2) return null;
			const tipIndex = tip === null ? -1 : favOnly ? messages.findIndex((m) => effectiveMessages[tip.index] !== void 0 && favoriteIdOfMessage(m) === favoriteIdOfMessage(effectiveMessages[tip.index])) : tip.index;
			const items = effectiveMessages.map((m, i) => {
				const key = anchorKeyOf(m);
				const starred = favoriteIdOfMessage(m) !== "" && isFavorite(favorites, sessionId, favoriteIdOfMessage(m));
				return (0, react.createElement)("button", {
					type: "button",
					key: m.seq,
					"data-crl-index": String(i),
					className: S.item + (activeIndex === i ? ` ${S.itemActive}` : "") + (starred ? ` ${S.favItem}` : ""),
					"aria-label": `${t.roleUser}: ${m.text.slice(0, 60) || t.noText} (${t.ariaJump})`,
					"aria-current": activeIndex === i ? "location" : void 0,
					disabled: jumping,
					onClick: () => {
						if (key === void 0 || jumping) return;
						jumpAbortRef.current?.abort();
						const controller = new AbortController();
						jumpAbortRef.current = controller;
						setJumping(true);
						jumpToMessage(sessionsService, sessionId, key, void 0, controller.signal).finally(() => setJumping(false));
					},
					onMouseEnter: () => handleItemEnter(i),
					onMouseLeave: () => handleItemLeave(i),
					children: [
						(0, react.createElement)("span", { className: S.num }, `#${i + 1}`),
						starred ? (0, react.createElement)("span", {
							className: S.favStar,
							role: "img",
							"aria-label": t.fav,
							"aria-hidden": void 0
						}, (0, react.createElement)("svg", {
							viewBox: "0 0 24 24",
							width: 13,
							height: 13,
							fill: "currentColor",
							stroke: "none",
							"aria-hidden": true
						}, (0, react.createElement)("path", {
							d: STAR_PATH,
							"aria-hidden": true
						}))) : null,
						(0, react.createElement)("span", { className: S.title }, m.text === "" ? t.noText : m.text),
						m.hasImage ? (0, react.createElement)("span", {
							className: S.img,
							role: "img",
							"aria-label": t.hasImage
						}, (0, react.createElement)("svg", {
							viewBox: "0 0 16 16",
							width: 12,
							height: 12,
							fill: "none",
							stroke: "currentColor",
							strokeWidth: 1.4,
							strokeLinecap: "round",
							strokeLinejoin: "round",
							"aria-hidden": true
						}, (0, react.createElement)("rect", {
							x: 1.7,
							y: 2.7,
							width: 12.6,
							height: 10.6,
							rx: 2.2
						}), (0, react.createElement)("circle", {
							cx: 5.6,
							cy: 6.4,
							r: 1.15,
							fill: "currentColor",
							stroke: "none"
						}), (0, react.createElement)("path", { d: "M2.5 11.6l3.6-3.1 2.6 2.2 2.1-1.9 3.3 2.8" }))) : null,
						(0, react.createElement)("span", { className: S.time }, relativeTime(m.time, t)),
						(0, react.createElement)("span", {
							className: S.ind,
							"aria-hidden": true
						}, (0, react.createElement)("span", { className: S.line }))
					]
				});
			});
			return (0, react_dom.createPortal)([(0, react.createElement)("div", {
				ref: navRef,
				className: S.nav + (show ? ` ${S.navShow}` : ""),
				role: "navigation",
				"aria-label": t.railLabel,
				onMouseEnter: () => setShow(true),
				onMouseLeave: () => setShow(false),
				children: [
					showFavToggle ? (0, react.createElement)("button", {
						type: "button",
						key: "favToggle",
						className: S.favToggle + (favOnly ? " crl_on" : ""),
						"aria-pressed": favOnly,
						"aria-label": t.favOnly,
						title: t.favOnly,
						onMouseEnter: (e) => e.stopPropagation(),
						onClick: () => setFavOnly((v) => !v),
						children: [(0, react.createElement)("svg", {
							viewBox: "0 0 24 24",
							width: 14,
							height: 14,
							fill: favOnly ? "currentColor" : "none",
							stroke: "currentColor",
							strokeWidth: 2,
							strokeLinejoin: "round",
							"aria-hidden": true
						}, (0, react.createElement)("path", { d: STAR_PATH })), (0, react.createElement)("span", { className: S.favToggleLabel }, t.favOnly)]
					}) : null,
					jumping ? (0, react.createElement)("div", {
						className: S.loading,
						key: "loading"
					}, (0, react.createElement)("span", { className: S.loadingLabel }, t.loading)) : null,
					...items
				]
			}), tip !== null && tipIndex >= 0 && tipIndex < messages.length ? (0, react.createElement)("div", {
				className: S.tip,
				style: {
					left: `${tip.x}px`,
					top: `${tip.y}px`,
					transform: "translateX(-100%)"
				}
			}, (() => {
				const m = messages[tipIndex];
				const specs = tipImagesOf(m, nodeSnapshot);
				const children = [];
				if (specs.length > 0 && readThumb !== void 0) children.push((0, react.createElement)("div", {
					className: S.tipImgs,
					key: "imgs"
				}, (0, react.createElement)("div", {
					className: S.tipImgWrap,
					key: "img"
				}, (0, react.createElement)(TipThumb, {
					spec: specs[0],
					sessionId,
					read: readThumb
				}), specs.length > 1 ? (0, react.createElement)("span", {
					className: S.tipImgCount,
					"aria-hidden": true
				}, `+${specs.length - 1}`) : null)));
				else if (m.hasImage) children.push((0, react.createElement)("span", {
					className: S.tipBadge,
					key: "badge"
				}, t.hasImage));
				children.push((0, react.createElement)("span", { key: "text" }, fullTextOf(m, nodeSnapshot) || t.noText));
				return children;
			})()) : null], document.body);
		}
		function apply(ctx) {
			ctx.slots.inject("conversation.input.dock", () => ctx.slots.register({
				name: "conversation.input.dock",
				id: "chat-rail",
				order: 40,
				inject: () => ({
					sessionsService: ctx.sessions,
					conversation: ctx.conversation
				})
			}, TimelineRail));
		}
		//#endregion
		exports.TimelineRail = TimelineRail;
		exports.apply = apply;
		exports.favoriteIdsOf = favoriteIdsOf;
		exports.imageSpecsOfContent = imageSpecsOfContent;
		exports.inject = inject;
		exports.isFavorite = isFavorite;
		exports.messageIdOfAnchorKey = messageIdOfAnchorKey;
		exports.normalize = normalize;
		exports.readFavorites = readFavorites;
		exports.toggleFavoriteId = toggleFavoriteId;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map