'use strict';
/**
 * liang-mode-dsh — client 端插件（桌宠版）。
 *
 * 右下角浮着一个蓝发小人（lib/assets/pet.png，透明贴纸），行为像桌宠：
 *   - 会轻轻上下浮动；梁文峰模式多出一串飘起来的 z，梁文谷模式没有；
 *   - 悬停 / 点一下 → 冒出白色思考泡，小人开口就是当前模式名「梁文峰…」/「梁文谷…」，
 *     下面写着极简/正常、北京时间、开始时的模式；
 *   - 气泡里的按钮循环切换 自动（按时间）→ 手动梁文峰 → 手动梁文谷；
 *   - 按住可以拖动，位置存 localStorage；点一下（不拖）是钉住/取消气泡。
 *
 * 状态每 30 秒从 server（/liang-mode/state）拉取。
 * 对话开始模式记忆：每段对话（按 URL pathname 区分）首次加载时打点
 * （POST /liang-mode/conversation-start，服务端写 jsonl 长期记录），
 * 开始时的模式存入 sessionStorage，刷新页面不丢、不重复打点。
 */

window.__ModuleLoader__.load({
	id: 'liang-mode-dsh',
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;

		const React = require('react');
		const h = React.createElement;

		const NAVY = '#2b3568';
		const PAPER = '#fdfcfa';

		const MODE_COLORS = {
			feng: { accent: '#d9557a', tag: '梁文峰 · 极简', flavor: '极简模式' },
			gu: { accent: '#2f9e6b', tag: '梁文谷 · 正常', flavor: '正常模式' },
		};
		const MODE_SHORT = { feng: '梁文峰', gu: '梁文谷' };
		// 台词库（按模式分），每分钟换一句，跟「鲸鱼娘」人设走：
		// 极简 = 惜字如金；正常 = 摸鱼、干饭、探索未至之境
		const VOICE = {
			feng: ['说重点…', '结论。', '能省则省…', '不废话…'],
			gu: ['哦鲸鲸…', '吃口白饭先…', '探索未至之境…', '慢慢说…'],
		};
		const pickVoice = (mode) => {
			const lines = VOICE[mode] || VOICE.gu;
			return lines[Math.floor(Date.now() / 60000) % lines.length];
		};
		const OVERRIDE_LABELS = {
			auto: '自动（按时间）',
			feng: '手动：梁文峰',
			gu: '手动：梁文谷',
		};
		const OVERRIDE_NEXT = { auto: 'feng', feng: 'gu', gu: 'auto' };
		const START_KEY_PREFIX = 'liang-mode-start:';
		const POS_KEY = 'liang-mode-pet-pos';
		const STYLE_ID = 'liang-mode-pet-style';

		// 小人贴纸（340px 宽 WebP，带透明通道）直接内联，避免再依赖服务端静态路由
		const PET_IMAGE = 'data:image/webp;base64,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';

		async function fetchState() {
			const res = await fetch('/liang-mode/state', { cache: 'no-store' });
			if (!res.ok) throw new Error(`state ${res.status}`);
			return res.json();
		}

		async function postOverride(override) {
			const res = await fetch('/liang-mode/override', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ override }),
			});
			if (!res.ok) throw new Error(`override ${res.status}`);
			return res.json();
		}

		function readStoredStart(key) {
			try {
				const raw = sessionStorage.getItem(START_KEY_PREFIX + key);
				return raw ? JSON.parse(raw) : null;
			} catch {
				return null;
			}
		}

		function writeStoredStart(key, start) {
			try {
				sessionStorage.setItem(START_KEY_PREFIX + key, JSON.stringify(start));
			} catch {
				// sessionStorage 不可用时仅放弃展示，不影响打点
			}
		}

		// 每段对话首次加载打点；已有记录（刷新/重进）直接读取，不重复打点
		async function markConversationStart(key) {
			const stored = readStoredStart(key);
			if (stored) return { start: stored, fresh: false };
			const res = await fetch('/liang-mode/conversation-start', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ key }),
			});
			if (!res.ok) throw new Error(`conversation-start ${res.status}`);
			const data = await res.json();
			const start = data.start || { mode: data.mode, label: data.label, time: data.time };
			writeStoredStart(key, start);
			return { start, fresh: true };
		}

		// 桌宠位置：右下角偏移，拖动后存 localStorage
		function readPos() {
			try {
				const raw = JSON.parse(localStorage.getItem(POS_KEY) || 'null');
				if (raw && Number.isFinite(raw.right) && Number.isFinite(raw.bottom)) {
					const maxR = Math.max(4, window.innerWidth - 120);
					const maxB = Math.max(4, window.innerHeight - 120);
					return { right: Math.min(maxR, Math.max(4, raw.right)), bottom: Math.min(maxB, Math.max(4, raw.bottom)) };
				}
			} catch {
				// 读不到就用默认位置
			}
			return { right: 22, bottom: 118 };
		}

		function writePos(pos) {
			try {
				localStorage.setItem(POS_KEY, JSON.stringify(pos));
			} catch {
				// 存不了只是下次回到默认位置
			}
		}

		function ensureStyle() {
			if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
			const style = document.createElement('style');
			style.id = STYLE_ID;
			style.textContent = [
				'@keyframes lm-pet-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}',
				'@keyframes lm-pet-z{0%{opacity:0;transform:translate(0,0) scale(.6)}30%{opacity:.95}100%{opacity:0;transform:translate(10px,-18px) scale(1.15)}}',
				'@keyframes lm-pet-pop{0%{opacity:0;transform:translateY(6px) scale(.94)}100%{opacity:1;transform:translateY(0) scale(1)}}',
				'@keyframes lm-whale{0%,100%{transform:translate(0,2px) rotate(-2deg)}50%{transform:translate(-4px,-2px) rotate(2deg)}}',
				'.lm-pet-whale{transform-box:fill-box;animation:lm-whale 6.4s ease-in-out infinite;opacity:.92}',
				'.lm-pet-z{position:absolute;top:2px;right:-6px;font:700 13px/1 "Segoe UI",monospace;color:#cdd9ff;text-shadow:0 1px 4px rgba(0,0,0,.6);pointer-events:none;animation:lm-pet-z 3.2s ease-out infinite}',
				'.lm-pet-bubble{animation:lm-pet-pop .18s ease-out both}',
				'@media (prefers-reduced-motion: reduce){.lm-pet-z,.lm-pet-whale{animation:none;opacity:.8}.lm-pet-bob,.lm-pet-bubble{animation:none}}',
			].join('\n');
			document.head.appendChild(style);
		}

		function WhalePet() {
			const [s, setS] = React.useState(null);
			const [start, setStart] = React.useState(null);
			const [busy, setBusy] = React.useState(false);
			const [pinned, setPinned] = React.useState(false);
			const [hover, setHover] = React.useState(false);
			const [pos, setPos] = React.useState(readPos);
			const lastKeyRef = React.useRef(null);
			const dragRef = React.useRef(null);
			const hoverTimerRef = React.useRef(null);

			React.useEffect(() => {
				let alive = true;
				const pull = () => fetchState().then((data) => alive && setS(data)).catch(() => {});
				const checkStart = () => {
					const key = location.pathname || '/';
					if (key === lastKeyRef.current) return;
					lastKeyRef.current = key;
					markConversationStart(key)
						.then(({ start }) => alive && setStart(start))
						.catch(() => {});
				};
				pull();
				checkStart();
				const id = setInterval(() => {
					pull();
					checkStart(); // SPA 内切换对话（pathname 变化）时重新打点
				}, 30 * 1000);
				return () => {
					alive = false;
					clearInterval(id);
					clearTimeout(hoverTimerRef.current);
				};
			}, []);

			if (!s) return null;
			const c = MODE_COLORS[s.mode] || MODE_COLORS.gu;
			const startNote = start && start.mode ? `${MODE_SHORT[start.mode] || start.mode} ${String(start.time || '').slice(11)}` : '';
			const open = hover || pinned;
			const sleeping = s.mode === 'feng';

			const cycle = () => {
				if (busy) return;
				setBusy(true);
				postOverride(OVERRIDE_NEXT[s.override] || 'auto')
					.then(setS)
					.catch(() => {})
					.finally(() => setBusy(false));
			};

			const onPointerDown = (e) => {
				if (e.button !== 0) return;
				dragRef.current = { x: e.clientX, y: e.clientY, right: pos.right, bottom: pos.bottom, moved: false };
				if (e.currentTarget.setPointerCapture) e.currentTarget.setPointerCapture(e.pointerId);
			};

			const onPointerMove = (e) => {
				const d = dragRef.current;
				if (!d) return;
				const dx = e.clientX - d.x;
				const dy = e.clientY - d.y;
				if (!d.moved && Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
				if (!d.moved) return;
				const maxR = Math.max(4, window.innerWidth - 130);
				const maxB = Math.max(4, window.innerHeight - 130);
				setPos({ right: Math.min(maxR, Math.max(4, d.right - dx)), bottom: Math.min(maxB, Math.max(4, d.bottom - dy)) });
			};

			const endDrag = () => {
				const d = dragRef.current;
				dragRef.current = null;
				if (!d) return;
				if (d.moved) writePos(pos);
				else setPinned((v) => !v);
			};

			const bubble = h(
				'div',
				{
					className: 'lm-pet-bubble',
					style: {
						position: 'relative',
						background: PAPER,
						color: NAVY,
						border: `3px solid ${NAVY}`,
						borderRadius: '20px',
						padding: '10px 14px 10px',
						marginBottom: '12px',
						fontFamily: '"PingFang SC","Microsoft YaHei","Segoe UI",monospace',
						fontSize: '12px',
						lineHeight: 1.65,
						boxShadow: '0 12px 28px rgba(0,0,0,.5)',
						minWidth: '168px',
						textAlign: 'left',
					},
				},
				h('div', { style: { fontSize: '15px', fontWeight: 800, letterSpacing: '.5px', marginBottom: '2px' } }, `${MODE_SHORT[s.mode]}…`),
				h('div', { style: { color: c.accent, fontWeight: 700 } }, c.flavor),
				h(
					'div',
					{ style: { color: 'rgba(43,53,104,.5)', fontStyle: 'italic', fontSize: '11.5px', marginBottom: '2px' } },
					pickVoice(s.mode),
				),
				h('div', { style: { opacity: 0.62, fontSize: '11px' } }, `北京时间 ${s.time}`),
				startNote ? h('div', { style: { opacity: 0.62, fontSize: '11px' } }, `开始：${startNote}`) : null,
				s.remind ? h('div', { style: { color: '#b8762a', fontWeight: 700, fontSize: '11px' } }, '⚠️ 快到梁文峰时间了') : null,
				h(
					'div',
					{ style: { display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px' } },
					h(
						'button',
						{
							onClick: cycle,
							disabled: busy,
							title: '循环切换：自动 → 手动梁文峰 → 手动梁文谷',
							style: {
								background: NAVY,
								color: PAPER,
								border: 'none',
								borderRadius: '999px',
								padding: '4px 11px',
								fontSize: '11px',
								fontWeight: 700,
								fontFamily: 'inherit',
								cursor: busy ? 'wait' : 'pointer',
								opacity: busy ? 0.6 : 1,
								whiteSpace: 'nowrap',
							},
						},
						`${OVERRIDE_LABELS[s.override]} ⇄`,
					),
					pinned ? h('span', { style: { opacity: 0.45, fontSize: '11px' } }, '📌') : null,
				),
				// 气泡小尾巴，指向小人
				h('div', {
					style: {
						position: 'absolute',
						right: '34px',
						bottom: '-10px',
						width: '15px',
						height: '15px',
						background: PAPER,
						borderRight: `3px solid ${NAVY}`,
						borderBottom: `3px solid ${NAVY}`,
						transform: 'rotate(45deg)',
						borderBottomRightRadius: '4px',
					},
				}),
			);

			return h(
				'div',
				{
					style: {
						position: 'fixed',
						right: `${pos.right}px`,
						bottom: `${pos.bottom}px`,
						zIndex: 30,
						display: 'flex',
						flexDirection: 'column',
						alignItems: 'flex-end',
						userSelect: 'none',
					},
					onMouseEnter: () => {
						clearTimeout(hoverTimerRef.current);
						hoverTimerRef.current = setTimeout(() => setHover(true), 420);
					},
					onMouseLeave: () => {
						clearTimeout(hoverTimerRef.current);
						setHover(false);
					},
				},
				open ? bubble : null,
				h(
					'button',
					{
						onPointerDown,
						onPointerMove,
						onPointerUp: endDrag,
						onPointerCancel: endDrag,
						onContextMenu: (e) => e.preventDefault(),
						title: `${c.tag}｜北京时间 ${s.time}｜点一下展开，按住可拖动`,
						style: {
							position: 'relative',
							padding: 0,
							border: 'none',
							background: 'transparent',
							cursor: 'grab',
							touchAction: 'none',
							animation: sleeping ? 'lm-pet-bob 5.4s ease-in-out infinite' : 'lm-pet-bob 3.6s ease-in-out infinite',
							filter: 'drop-shadow(0 10px 18px rgba(0,0,0,.5))',
						},
					},
					// 身边游着的小鲸鱼（她的本体）
					h(
						'svg',
						{
							className: 'lm-pet-whale',
							viewBox: '0 0 40 28',
							width: 34,
							height: 24,
							'aria-hidden': 'true',
							style: { position: 'absolute', left: '-27px', bottom: '12px', pointerEvents: 'none' },
						},
						h('path', {
							d: 'M6 11 q3 -6 7 -3',
							stroke: '#8fd3ff',
							strokeWidth: 2,
							strokeLinecap: 'round',
							fill: 'none',
						}),
						h('path', { d: 'M28 11 L37 5 L36 21 L28 17 Z', fill: '#3b8cc0' }),
						h('ellipse', { cx: 17, cy: 16, rx: 12, ry: 8, fill: '#4fb3e0' }),
						h('ellipse', { cx: 15, cy: 20.5, rx: 7.5, ry: 3, fill: '#ffffff', opacity: 0.26 }),
						h('circle', { cx: 11, cy: 14.5, r: 1.8, fill: '#12242c' }),
					),
					h('img', {
						src: PET_IMAGE,
						alt: c.tag,
						draggable: false,
						style: {
							display: 'block',
							width: '104px',
							height: 'auto',
							pointerEvents: 'none',
							maskImage: 'linear-gradient(to bottom, #000 84%, rgba(0,0,0,.35) 96%, transparent 100%)',
							WebkitMaskImage: 'linear-gradient(to bottom, #000 84%, rgba(0,0,0,.35) 96%, transparent 100%)',
							opacity: sleeping ? 0.9 : 1,
						},
					}),
					sleeping
						? h(
								'span',
								{ style: { position: 'absolute', inset: 0, pointerEvents: 'none' } },
								h('span', { className: 'lm-pet-z', style: { animationDelay: '0s' } }, 'z'),
								h('span', { className: 'lm-pet-z', style: { animationDelay: '1s', right: '2px', top: '-6px' } }, 'z'),
								h('span', { className: 'lm-pet-z', style: { animationDelay: '2s', right: '10px', top: '-12px' } }, 'z'),
							)
						: null,
				),
			);
		}

		module.exports = {
			name: 'liang-mode-dsh-client',
			inject: ['slots'],
			apply(ctx) {
				ensureStyle();
				// 挂到对话输入区 dock 插槽；组件自身用 position:fixed 浮在右下角
				ctx.slots.inject('conversation.input.dock', () =>
					ctx.slots.register(
						{
							name: 'conversation.input.dock',
							id: 'liang-mode-banner',
							order: 1000,
						},
						WhalePet,
					),
				);
			},
		};
		return module.exports;
	},
});
