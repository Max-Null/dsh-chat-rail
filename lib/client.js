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
		const inject = ["slots", "sessions"];
		const STRINGS = {
			zh: {
				railLabel: "消息导航",
				roleUser: "用户",
				noText: "（无文本内容）",
				ariaJump: "跳转到消息",
				loading: "加载中…",
				timeJustNow: "刚刚",
				timeMinutes: "{n}分钟前",
				timeHours: "{n}小时前",
				timeDays: "{n}天前"
			},
			en: {
				railLabel: "Message rail",
				roleUser: "User",
				noText: "(no text)",
				ariaJump: "Jump to message",
				loading: "Loading…",
				timeJustNow: "just now",
				timeMinutes: "{n}m ago",
				timeHours: "{n}h ago",
				timeDays: "{n}d ago"
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
			".crl_nav{user-select:none;z-index:100;position:fixed;right:calc(var(--dsh-sidebar-width,0px) + 12px);top:calc((100vh - var(--dsh-sidebar-height,0px)) / 2);transform:translateY(-50%);width:36px;max-height:min(60vh,420px,calc(100vh - var(--dsh-sidebar-height,0px) - 40px));display:flex;flex-direction:column;align-items:center;box-sizing:border-box;padding:10px 0;border-radius:18px;overflow-y:hidden;overflow-x:hidden;background:rgba(255,255,255,.55);border:1px solid rgba(0,0,0,.07);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);scrollbar-width:thin;scrollbar-color:rgba(0,0,0,.18) transparent;transition:width .25s cubic-bezier(.4,0,.2,1),right var(--ds-transition-duration-slow,0.3s) var(--ds-ease-in-out,ease-in-out),top var(--ds-transition-duration-slow,0.3s) var(--ds-ease-in-out,ease-in-out),background .2s ease,border-color .2s ease,box-shadow .2s ease}",
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
			".crl_line{background-color:rgba(0,0,0,.45);border-radius:4px;flex-shrink:0;width:10px;height:3px;transition:background-color .2s ease,transform .2s ease}",
			".crl_item:hover .crl_line{background-color:rgba(0,0,0,.9)}",
			".crl_item.crl_active .crl_line{background-color:var(--dsw-alias-state-business-primary,#4d6bfe);transform-origin:50%;transform:scale(1.4);box-shadow:0 0 6px var(--dsw-alias-state-business-primary,#4d6bfe)}",
			"body[data-ds-dark-theme] .crl_line,[data-theme='dark'] .crl_line,.dark .crl_line{background-color:rgba(255,255,255,.5)}",
			"body[data-ds-dark-theme] .crl_item:hover .crl_line,[data-theme='dark'] .crl_item:hover .crl_line,.dark .crl_item:hover .crl_line{background-color:rgba(255,255,255,.95)}",
			"body[data-ds-dark-theme] .crl_item.crl_active .crl_line,[data-theme='dark'] .crl_item.crl_active .crl_line,.dark .crl_item.crl_active .crl_line{background-color:var(--dsw-alias-state-business-primary,#4d6bfe)}",
			".crl_tip{position:fixed;z-index:200;max-width:360px;max-height:70vh;overflow-y:auto;padding:10px 12px;font-size:12px;line-height:1.6;color:var(--dsw-alias-label-primary,var(--text-primary,rgba(0,0,0,.85)));background:var(--dsw-alias-surface-raised,var(--bg-elevated,rgba(255,255,255,.97)));border:1px solid var(--dsw-alias-border-l2,var(--border-default,rgba(0,0,0,.12)));border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.16);white-space:pre-wrap;word-break:break-word;pointer-events:none}",
			"body[data-ds-dark-theme] .crl_tip,[data-theme='dark'] .crl_tip,.dark .crl_tip{background:var(--dsw-alias-surface-raised,var(--bg-elevated,rgba(28,28,32,.97)));border-color:var(--dsw-alias-border-l2,var(--border-default,rgba(255,255,255,.14)))}",
			"@media (prefers-reduced-motion:reduce){.crl_nav,.crl_title,.crl_num,.crl_time,.crl_line{transition:none}}"
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
			loading: "crl_loading",
			loadingLabel: "crl_loadingLabel",
			tip: "crl_tip"
		};
		const NOOP_STORE = {
			getSnapshot: () => void 0,
			subscribe: () => () => {}
		};
		/** Extract preview text from a user message's ContentBlock list. */
		function userTextOf(content) {
			if (!Array.isArray(content)) return "";
			let out = "";
			for (const block of content) if (block !== null && typeof block === "object" && block.type === "text" && typeof block.text === "string") out += block.text;
			return out.trim().slice(0, 80);
		}
		/** Normalize one projection entry to a rail message. */
		function normalize(m) {
			if (m === null || typeof m !== "object") return null;
			const o = m;
			if (typeof o.seq !== "number") return null;
			const text = typeof o.text === "string" ? o.text : typeof o.preview === "string" ? o.preview : "";
			return {
				seq: o.seq,
				time: typeof o.time === "number" ? o.time : 0,
				text,
				...typeof o.key === "string" ? { key: o.key } : {},
				...typeof o.id === "string" ? { id: o.id } : {}
			};
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
				out.push({
					seq: typeof n.anchorSeq === "number" ? n.anchorSeq : 0,
					time: data.time,
					text: userTextOf(data.content),
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
		/** Resolve copy for the current UI language (document lang, DSH sets zh/en). */
		function langStrings() {
			const lang = typeof document !== "undefined" ? (document.documentElement.lang || "zh").toLowerCase() : "zh";
			return STRINGS[lang.startsWith("zh") ? "zh" : "en"];
		}
		function TimelineRail({ useProjection, sessionId, sessionsService }) {
			const t = langStrings();
			const projected = useProjection("chatRail");
			const session = sessionId === void 0 ? void 0 : sessionsService.binding(sessionId)?.session;
			const fallbackStore = session === void 0 ? NOOP_STORE : session;
			const nodeSnapshot = (0, react.useSyncExternalStore)((cb) => fallbackStore.subscribe(cb), () => fallbackStore.getSnapshot());
			let messages = [];
			if (Array.isArray(projected?.messages) && projected.messages.length > 0) messages = projected.messages.map(normalize).filter((m) => m !== null);
			if (messages.length === 0) messages = collectFromNodes(nodeSnapshot);
			const [activeIndex, setActiveIndex] = (0, react.useState)(-1);
			const [show, setShow] = (0, react.useState)(false);
			const [jumping, setJumping] = (0, react.useState)(false);
			const [tip, setTip] = (0, react.useState)(null);
			const navRef = (0, react.useRef)(null);
			const expandedRef = (0, react.useRef)(false);
			const jumpAbortRef = (0, react.useRef)(null);
			(0, react.useEffect)(() => () => jumpAbortRef.current?.abort(), []);
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
				const onTransitionEnd = (e) => {
					if (e.propertyName !== "width") return;
					expandedRef.current = true;
					el.removeEventListener("transitionend", onTransitionEnd);
				};
				el.addEventListener("transitionend", onTransitionEnd);
				return () => el.removeEventListener("transitionend", onTransitionEnd);
			}, [show]);
			/** Full text of a rail message from the loaded chat nodes (uncapped),
			*  falling back to the projection preview when the node is not mounted. */
			const fullTextOf = (m) => {
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
			};
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
				if (messages.length === 0) return;
				const indexByKey = /* @__PURE__ */ new Map();
				for (let i = 0; i < messages.length; i++) {
					const key = anchorKeyOf(messages[i]);
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
			}, [sessionId, messages.length]);
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
			const items = messages.map((m, i) => {
				const key = anchorKeyOf(m);
				return (0, react.createElement)("button", {
					type: "button",
					key: m.seq,
					"data-crl-index": String(i),
					className: S.item + (activeIndex === i ? ` ${S.itemActive}` : ""),
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
						(0, react.createElement)("span", { className: S.title }, m.text === "" ? t.noText : m.text),
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
				children: [jumping ? (0, react.createElement)("div", {
					className: S.loading,
					key: "loading"
				}, (0, react.createElement)("span", { className: S.loadingLabel }, t.loading)) : null, ...items]
			}), tip !== null && tip.index >= 0 && tip.index < messages.length ? (0, react.createElement)("div", {
				className: S.tip,
				style: {
					left: `${tip.x}px`,
					top: `${tip.y}px`,
					transform: "translateX(-100%)"
				}
			}, fullTextOf(messages[tip.index]) || t.noText) : null], document.body);
		}
		function apply(ctx) {
			ctx.slots.inject("conversation.input.dock", () => ctx.slots.register({
				name: "conversation.input.dock",
				id: "chat-rail",
				order: 40,
				inject: () => ({ sessionsService: ctx.sessions })
			}, TimelineRail));
		}
		//#endregion
		exports.TimelineRail = TimelineRail;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map