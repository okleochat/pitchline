import { i as __toESM } from "../_runtime.mjs";
import { b as require_jsx_runtime, q as require_react } from "../_libs/@tanstack/react-router+[...].mjs";
import { a as leagueName, i as isCup, o as leagueShort, r as formRate, s as shapePair, t as LEAGUES } from "./football-Cfxlhj-F.mjs";
import { a as Pause, c as ArrowLeftRight, i as Play, n as RotateCcw, o as Minus, r as Plus, s as ChevronDown } from "../_libs/lucide-react.mjs";
import { i as loadForm, n as Route, r as loadBoard } from "./router-DWVIEl4R.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/routes-Ba_uA7Wh.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var SIMS = 1e3;
var LEAGUE_AVG = 1.35;
/** Dixon–Coles low-score tie. Negative lifts 0–0 and 1–1. */
var DIXON_RHO = -.1;
var MARGIN_LABELS = [
	"≤−4",
	"−3",
	"−2",
	"−1",
	"0",
	"+1",
	"+2",
	"+3",
	"≥+4"
];
var TOTAL_LABELS = [
	"0",
	"1",
	"2",
	"3",
	"4",
	"5",
	"6",
	"7+"
];
function marginLabels() {
	return MARGIN_LABELS;
}
function totalLabels() {
	return TOTAL_LABELS;
}
function hashSeed(str) {
	let h = 2166136261;
	for (let i = 0; i < str.length; i++) {
		h ^= str.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return h >>> 0;
}
function mulberry32(seed) {
	let a = seed >>> 0;
	return () => {
		a = a + 1831565813 | 0;
		let t = Math.imul(a ^ a >>> 15, 1 | a);
		t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
		return ((t ^ t >>> 14) >>> 0) / 4294967296;
	};
}
function poisson(lambda, rng) {
	if (lambda <= 0) return 0;
	const limit = Math.exp(-lambda);
	let k = 0;
	let p = 1;
	do {
		k += 1;
		p *= rng();
		if (k > 40) break;
	} while (p > limit);
	return k - 1;
}
function clamp(n, lo, hi) {
	return Math.min(hi, Math.max(lo, n));
}
/** edge is a home scoring multiplier. 1 is a neutral pitch. */
function expectedGoals(home, away, edge) {
	const safe = clamp(edge, .7, 1.6);
	return {
		homeXg: clamp(home.attack * (away.defense / LEAGUE_AVG) * safe, .12, 4.8),
		awayXg: clamp(away.attack * (home.defense / LEAGUE_AVG) / Math.sqrt(safe), .08, 4.4)
	};
}
function poissonPmf(lambda, max) {
	const probs = [Math.exp(-lambda)];
	for (let k = 1; k <= max; k++) probs[k] = probs[k - 1] * lambda / k;
	return probs;
}
var DC_MAX = 12;
function dixonTau(homeGoals, awayGoals, homeXg, awayXg) {
	const rho = DIXON_RHO;
	let tau = 1;
	if (homeGoals === 0 && awayGoals === 0) tau = 1 - homeXg * awayXg * rho;
	else if (homeGoals === 0 && awayGoals === 1) tau = 1 + homeXg * rho;
	else if (homeGoals === 1 && awayGoals === 0) tau = 1 + awayXg * rho;
	else if (homeGoals === 1 && awayGoals === 1) tau = 1.1;
	return tau > 0 ? tau : 0;
}
function jointGrid(homeXg, awayXg) {
	const homeP = poissonPmf(homeXg, DC_MAX);
	const awayP = poissonPmf(awayXg, DC_MAX);
	const grid = [];
	let sum = 0;
	for (let homeGoals = 0; homeGoals <= DC_MAX; homeGoals++) {
		grid[homeGoals] = [];
		for (let awayGoals = 0; awayGoals <= DC_MAX; awayGoals++) {
			const p = homeP[homeGoals] * awayP[awayGoals] * dixonTau(homeGoals, awayGoals, homeXg, awayXg);
			grid[homeGoals][awayGoals] = p;
			sum += p;
		}
	}
	const scale = sum || 1;
	const cdf = [];
	let acc = 0;
	for (let homeGoals = 0; homeGoals <= DC_MAX; homeGoals++) for (let awayGoals = 0; awayGoals <= DC_MAX; awayGoals++) {
		grid[homeGoals][awayGoals] /= scale;
		acc += grid[homeGoals][awayGoals];
		cdf.push(acc);
	}
	return {
		grid,
		cdf
	};
}
function sampleGrid(cdf, rng) {
	const u = rng();
	let lo = 0;
	let hi = cdf.length - 1;
	while (lo < hi) {
		const mid = lo + hi >> 1;
		if (u <= cdf[mid]) hi = mid;
		else lo = mid + 1;
	}
	const span = 13;
	return {
		h: Math.floor(lo / span),
		a: lo % span
	};
}
function analyticalSplit(home, away, edge, model = "plain") {
	const { homeXg, awayXg } = expectedGoals(home, away, edge);
	if (model === "dixon") {
		const { grid } = jointGrid(homeXg, awayXg);
		let hw = 0;
		let dr = 0;
		let aw = 0;
		for (let h = 0; h <= DC_MAX; h++) for (let a = 0; a <= DC_MAX; a++) {
			const p = grid[h][a];
			if (h > a) hw += p;
			else if (h === a) dr += p;
			else aw += p;
		}
		return {
			homeXg,
			awayXg,
			home: hw,
			draw: dr,
			away: aw
		};
	}
	const hp = poissonPmf(homeXg, 12);
	const ap = poissonPmf(awayXg, 12);
	let hw = 0;
	let dr = 0;
	let aw = 0;
	for (let h = 0; h <= 12; h++) for (let a = 0; a <= 12; a++) {
		const p = hp[h] * ap[a];
		if (h > a) hw += p;
		else if (h === a) dr += p;
		else aw += p;
	}
	const sum = hw + dr + aw || 1;
	return {
		homeXg,
		awayXg,
		home: hw / sum,
		draw: dr / sum,
		away: aw / sum
	};
}
function marginBin(margin) {
	if (margin <= -4) return 0;
	if (margin >= 4) return 8;
	return margin + 4;
}
function simulate(home, away, edge, roll, model = "plain") {
	const { homeXg, awayXg } = expectedGoals(home, away, edge);
	const rng = mulberry32(model === "dixon" ? hashSeed(`${home.id}|${away.id}|${edge.toFixed(3)}|${roll}|dixon`) : hashSeed(`${home.id}|${away.id}|${edge.toFixed(3)}|${roll}|sims`));
	const dixon = model === "dixon" ? jointGrid(homeXg, awayXg) : null;
	const matrix = Array.from({ length: 6 }, () => Array.from({ length: 6 }, () => 0));
	const margins = Array.from({ length: 9 }, () => 0);
	const totals = Array.from({ length: 8 }, () => 0);
	const exact = /* @__PURE__ */ new Map();
	const scores = [];
	let homeWins = 0;
	let draws = 0;
	let awayWins = 0;
	let btts = 0;
	let homeClean = 0;
	let awayClean = 0;
	let over25 = 0;
	let sumH = 0;
	let sumA = 0;
	for (let i = 0; i < SIMS; i++) {
		const drawn = dixon ? sampleGrid(dixon.cdf, rng) : {
			h: poisson(homeXg, rng),
			a: poisson(awayXg, rng)
		};
		const h = drawn.h;
		const a = drawn.a;
		scores.push({
			h,
			a
		});
		sumH += h;
		sumA += a;
		matrix[Math.min(5, h)][Math.min(5, a)] += 1;
		margins[marginBin(h - a)] += 1;
		totals[Math.min(7, h + a)] += 1;
		if (h > a) homeWins += 1;
		else if (h === a) draws += 1;
		else awayWins += 1;
		if (h > 0 && a > 0) btts += 1;
		if (a === 0) homeClean += 1;
		if (h === 0) awayClean += 1;
		if (h + a > 2.5) over25 += 1;
		const key = `${h}-${a}`;
		const prev = exact.get(key);
		if (prev) prev.n += 1;
		else exact.set(key, {
			h,
			a,
			n: 1
		});
	}
	const ranked = [...exact.values()].sort((a, b) => b.n - a.n || b.h - a.h);
	const mode = ranked[0] ?? {
		h: 0,
		a: 0,
		n: 0
	};
	return {
		n: SIMS,
		homeXg,
		awayXg,
		homeWins,
		draws,
		awayWins,
		btts,
		homeClean,
		awayClean,
		over25,
		meanHome: sumH / SIMS,
		meanAway: sumA / SIMS,
		mode,
		top: ranked.slice(0, 5),
		matrix,
		margins,
		totals,
		scores
	};
}
function splitHandicap(scores, line) {
	let win = 0;
	let push = 0;
	let lose = 0;
	for (const score of scores) {
		const result = score.h - score.a + line;
		if (Math.abs(result) < 1e-9) push += 1;
		else if (result > 0) win += 1;
		else lose += 1;
	}
	return {
		win,
		push,
		lose
	};
}
function splitTotal(scores, line) {
	let over = 0;
	let push = 0;
	let under = 0;
	for (const score of scores) {
		const total = score.h + score.a;
		if (Math.abs(total - line) < 1e-9) push += 1;
		else if (total > line) over += 1;
		else under += 1;
	}
	return {
		over,
		push,
		under
	};
}
var CHANCE_LINES = [
	(player) => `${player} forces a save`,
	(player) => `${player} shoots wide`,
	(player) => `${player} heads over the bar`,
	(player) => `The cross finds ${player}, and the keeper holds it`
];
var GOAL_LINES = [
	(player) => `${player} finishes`,
	(player) => `${player} scores`,
	(player) => `${player} converts`
];
function pickPlayer(team, rng) {
	const bias = rng();
	if (bias < .5) return team.scorers[0];
	if (bias < .8) return team.scorers[1];
	return team.scorers[2];
}
function distinctMinutes(count, rng, taken) {
	const minutes = [];
	let guard = 0;
	while (minutes.length < count && guard < 240) {
		guard += 1;
		const minute = 1 + Math.floor(rng() * 90);
		if (taken.has(minute)) continue;
		taken.add(minute);
		minutes.push(minute);
	}
	return minutes;
}
function playOne(home, away, edge, roll, model = "plain") {
	const { homeXg, awayXg } = expectedGoals(home, away, edge);
	const rng = mulberry32(model === "dixon" ? hashSeed(`${home.id}|${away.id}|${edge.toFixed(3)}|tape|${roll}|dixon`) : hashSeed(`${home.id}|${away.id}|${edge.toFixed(3)}|tape|${roll}`));
	const drawn = model === "dixon" ? sampleGrid(jointGrid(homeXg, awayXg).cdf, rng) : {
		h: poisson(homeXg, rng),
		a: poisson(awayXg, rng)
	};
	const homeGoals = drawn.h;
	const awayGoals = drawn.a;
	const taken = /* @__PURE__ */ new Set();
	const raw = [];
	for (const minute of distinctMinutes(homeGoals, rng, taken)) {
		const player = pickPlayer(home, rng);
		raw.push({
			min: minute,
			kind: "goal",
			side: "home",
			text: GOAL_LINES[Math.floor(rng() * GOAL_LINES.length)](player)
		});
	}
	for (const minute of distinctMinutes(awayGoals, rng, taken)) {
		const player = pickPlayer(away, rng);
		raw.push({
			min: minute,
			kind: "goal",
			side: "away",
			text: GOAL_LINES[Math.floor(rng() * GOAL_LINES.length)](player)
		});
	}
	for (const minute of distinctMinutes(poisson(homeXg * 2.2, rng), rng, taken)) {
		const player = pickPlayer(home, rng);
		raw.push({
			min: minute,
			kind: "chance",
			side: "home",
			text: CHANCE_LINES[Math.floor(rng() * CHANCE_LINES.length)](player)
		});
	}
	for (const minute of distinctMinutes(poisson(awayXg * 2.2, rng), rng, taken)) {
		const player = pickPlayer(away, rng);
		raw.push({
			min: minute,
			kind: "chance",
			side: "away",
			text: CHANCE_LINES[Math.floor(rng() * CHANCE_LINES.length)](player)
		});
	}
	if (rng() < .62) {
		const side = rng() < .5 ? "home" : "away";
		const minute = distinctMinutes(1, rng, taken)[0];
		if (minute) raw.push({
			min: minute,
			kind: "card",
			side,
			text: "Booking for a late challenge"
		});
	}
	raw.sort((a, b) => a.min - b.min);
	const events = [];
	let h = 0;
	let a = 0;
	let half = false;
	events.push({
		min: 0,
		kind: "kick",
		side: "none",
		text: "Kick-off",
		score: [0, 0]
	});
	for (const item of raw) {
		if (!half && item.min > 45) {
			half = true;
			events.push({
				min: 45,
				kind: "half",
				side: "none",
				text: "Half-time",
				score: [h, a]
			});
		}
		if (item.kind === "goal") {
			if (item.side === "home") h += 1;
			else a += 1;
		}
		events.push({
			...item,
			score: [h, a]
		});
	}
	if (!half) events.push({
		min: 45,
		kind: "half",
		side: "none",
		text: "Half-time",
		score: [h, a]
	});
	events.push({
		min: 90,
		kind: "full",
		side: "none",
		text: "Full-time",
		score: [h, a]
	});
	return events;
}
function indexFor(team, peers) {
	const nets = peers.map((peer) => peer.attack - peer.defense);
	const min = Math.min(...nets);
	const max = Math.max(...nets);
	const net = team.attack - team.defense;
	if (max === min) return 50;
	return Math.round(38 + (net - min) / (max - min) * 58);
}
function pctLabel(count, total) {
	if (total <= 0) return "0%";
	return `${(count / total * 100).toFixed(1)}%`;
}
function shareLabel(share) {
	return `${(share * 100).toFixed(0)}%`;
}
/** Fair decimal odds from a share of the simulations. */
function fairDecimal(share) {
	if (!(share > .004)) return "—";
	const price = 1 / share;
	if (price >= 100) return price.toFixed(0);
	return price.toFixed(2);
}
function formatLine(n) {
	const body = Math.abs(n).toFixed(1);
	if (n > 0) return `+${body}`;
	if (n < 0) return `−${body}`;
	return "0.0";
}
function roundHalf(n) {
	return Math.round(n * 2) / 2;
}
var STORAGE_KEY = "pitchline-desk";
var PICK_LINE = .8;
function readDesk() {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return null;
		return JSON.parse(raw);
	} catch {
		return null;
	}
}
function Crest({ team, large = false }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
		className: large ? "inline-flex size-11 shrink-0 items-center justify-center rounded-full text-xs font-semibold tracking-tight" : "inline-flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold tracking-tight",
		style: {
			background: team.mark,
			color: team.ink
		},
		"aria-hidden": true,
		children: team.short
	});
}
function Mark() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", {
		viewBox: "0 0 24 24",
		className: "size-8 text-foreground",
		"aria-hidden": true,
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", {
				x: "1.5",
				y: "3.5",
				width: "21",
				height: "17",
				rx: "2",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: "1.5"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
				d: "M12 3.5v17",
				stroke: "currentColor",
				strokeWidth: "1.5"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", {
				cx: "12",
				cy: "12",
				r: "3",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: "1.5"
			})
		]
	});
}
function barWidth(share) {
	return `${(share * 100).toFixed(1)}%`;
}
function edgeCopy(pct) {
	const delta = pct - 100;
	if (delta === 0) return "Even pitch";
	return `${delta > 0 ? "+" : "−"}${Math.abs(delta)}% home scoring`;
}
function TeamSelect({ id, label, value, blockedId, teams, onChange }) {
	const [open, setOpen] = (0, import_react.useState)(false);
	const [query, setQuery] = (0, import_react.useState)("");
	const [cursor, setCursor] = (0, import_react.useState)(0);
	const rootRef = (0, import_react.useRef)(null);
	const selected = teams.find((team) => team.id === value);
	const options = (0, import_react.useMemo)(() => {
		const q = query.trim().toLowerCase();
		const list = [];
		for (const league of LEAGUES) {
			const rows = teams.filter((team) => team.league === league.id).filter((team) => {
				if (!q) return true;
				return team.name.toLowerCase().includes(q) || team.short.toLowerCase().includes(q) || league.name.toLowerCase().includes(q) || league.short.toLowerCase().includes(q);
			}).sort((a, b) => a.name.localeCompare(b.name));
			list.push(...rows);
		}
		return list;
	}, [teams, query]);
	(0, import_react.useEffect)(() => {
		if (!open) return;
		const onPointer = (event) => {
			if (!rootRef.current?.contains(event.target)) setOpen(false);
		};
		document.addEventListener("pointerdown", onPointer);
		return () => document.removeEventListener("pointerdown", onPointer);
	}, [open]);
	(0, import_react.useEffect)(() => {
		if (!open) return;
		const selectedIndex = options.findIndex((team) => team.id === value);
		setCursor(query.trim() ? 0 : Math.max(0, selectedIndex));
	}, [
		open,
		query,
		options,
		value
	]);
	(0, import_react.useEffect)(() => {
		if (!open) return;
		(rootRef.current?.querySelector("[data-cursor='true']"))?.scrollIntoView({ block: "nearest" });
	}, [cursor, open]);
	function choose(next) {
		onChange(next);
		setOpen(false);
		setQuery("");
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "relative min-w-0",
		ref: rootRef,
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "mb-2 block text-sm font-medium",
				id: `${id}-label`,
				children: label
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
				type: "button",
				id,
				"aria-haspopup": "listbox",
				"aria-expanded": open,
				"aria-labelledby": `${id}-label`,
				className: "press flex h-11 w-full items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 text-left text-base",
				onClick: () => {
					setOpen((current) => !current);
					setQuery("");
				},
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "truncate",
					children: selected?.name ?? "Choose a club"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChevronDown, { className: "size-4 shrink-0 text-muted" })]
			}),
			open ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "absolute z-30 mt-1 w-full overflow-hidden rounded-xl border border-border bg-card",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", {
						className: "sr-only",
						htmlFor: `${id}-search`,
						children: "Search clubs"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
						id: `${id}-search`,
						autoFocus: true,
						value: query,
						placeholder: "Search clubs",
						className: "h-11 w-full border-b border-border bg-card px-3 text-base outline-none",
						onChange: (event) => setQuery(event.target.value),
						onKeyDown: (event) => {
							if (event.key === "ArrowDown") {
								event.preventDefault();
								setCursor((current) => Math.min(options.length - 1, current + 1));
							} else if (event.key === "ArrowUp") {
								event.preventDefault();
								setCursor((current) => Math.max(0, current - 1));
							} else if (event.key === "Enter") {
								event.preventDefault();
								const team = options[cursor];
								if (team && team.id !== blockedId) choose(team.id);
							} else if (event.key === "Escape") setOpen(false);
						}
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						role: "listbox",
						"aria-labelledby": `${id}-label`,
						className: "max-h-64 overflow-y-auto",
						children: options.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "px-3 py-3 text-sm text-muted",
							children: "No club matches."
						}) : options.map((team, index) => {
							const blocked = team.id === blockedId;
							const active = index === cursor;
							return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
								type: "button",
								role: "option",
								"data-cursor": active ? "true" : "false",
								"aria-selected": team.id === value,
								disabled: blocked,
								className: `flex h-11 w-full items-center justify-between gap-2 px-3 text-left text-sm ${active ? "bg-sunken" : ""} disabled:opacity-40`,
								onMouseEnter: () => setCursor(index),
								onClick: () => choose(team.id),
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "truncate",
									children: team.name
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "shrink-0 text-xs text-muted",
									children: leagueShort(team.league)
								})]
							}, team.id);
						})
					})
				]
			}) : null
		]
	});
}
function Hist({ labels, values, total, toneAt }) {
	const max = Math.max(...values, 1);
	const toneClass = {
		home: "bg-primary",
		away: "bg-foreground",
		draw: "bg-draw",
		neutral: "bg-primary"
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "flex h-48 items-end gap-1",
		children: labels.map((label, index) => {
			const value = values[index] ?? 0;
			const height = Math.max(value === 0 ? 0 : 4, value / max * 100);
			return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex h-full min-w-0 flex-1 flex-col justify-end gap-1",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "flex h-36 items-end",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: `w-full rounded-sm ${toneClass[toneAt(index)]}`,
						style: { height: `${height}%` },
						title: `${label}: ${pctLabel(value, total)} · ${value} matches`
					})
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "truncate text-center text-xs text-muted tabular-nums",
					children: label
				})]
			}, label);
		})
	});
}
function ScoreMatrix({ report }) {
	const max = Math.max(...report.matrix.flat(), 1);
	const headers = [
		"0",
		"1",
		"2",
		"3",
		"4",
		"5+"
	];
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "matrix mb-1",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {}), headers.map((header) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "text-center text-xs text-muted tabular-nums",
				children: header
			}, header))]
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "matrix",
			role: "table",
			"aria-label": "Scoreline frequency, home goals across and away goals down",
			children: headers.map((awayGoals, awayIndex) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "contents",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "flex items-center text-xs text-muted tabular-nums",
					children: awayGoals
				}), headers.map((homeGoals, homeIndex) => {
					const count = report.matrix[homeIndex]?.[awayIndex] ?? 0;
					const intensity = count / max;
					const hot = intensity > .55;
					const isMode = report.mode.h === homeIndex && report.mode.a === awayIndex && homeIndex < 5 && awayIndex < 5;
					const modeOverflow = report.mode.h >= 5 && report.mode.a >= 5 && homeIndex === 5 && awayIndex === 5;
					return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: `flex h-10 items-center justify-center rounded-sm text-xs tabular-nums sm:h-11 ${isMode || modeOverflow ? "ring-2 ring-primary" : ""}`,
						style: {
							background: `color-mix(in oklab, var(--color-primary) ${Math.round(intensity * 88)}%, var(--color-sunken))`,
							color: hot ? "var(--color-primary-foreground)" : "var(--color-foreground)"
						},
						title: `Home ${homeGoals}, away ${awayGoals}: ${pctLabel(count, report.n)}`,
						children: count === 0 ? "" : (count / report.n * 100).toFixed(1)
					}, `${homeGoals}-${awayGoals}`);
				})]
			}, awayGoals))
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "mt-2 text-xs text-muted",
			children: "Home goals across. Away goals down. Cells are percent of 1,000."
		})
	] });
}
function minuteLabel(event) {
	if (event.kind === "half") return "HT";
	if (event.kind === "full") return "FT";
	return `${event.min}'`;
}
function MatchTape({ home, away, edge, roll, model }) {
	const events = (0, import_react.useMemo)(() => playOne(home, away, edge, roll, model), [
		home,
		away,
		edge,
		roll,
		model
	]);
	const [index, setIndex] = (0, import_react.useState)(0);
	const [playing, setPlaying] = (0, import_react.useState)(true);
	const listRef = (0, import_react.useRef)(null);
	const current = events[Math.min(index, events.length - 1)];
	(0, import_react.useEffect)(() => {
		setIndex(0);
		const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		setPlaying(!reduce);
		if (reduce) setIndex(events.length - 1);
	}, [events]);
	(0, import_react.useEffect)(() => {
		if (!playing) return;
		if (index >= events.length - 1) return;
		const timer = window.setInterval(() => {
			setIndex((value) => Math.min(events.length - 1, value + 1));
		}, 700);
		return () => window.clearInterval(timer);
	}, [
		playing,
		index,
		events.length
	]);
	(0, import_react.useEffect)(() => {
		(listRef.current?.querySelector("[data-current='true']"))?.scrollIntoView({ block: "nearest" });
	}, [index]);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex flex-wrap items-end justify-between gap-4",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-sm text-muted",
					children: "One simulated 90 minutes"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
					className: "score-figure mt-2",
					children: [
						current.score[0],
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "px-2 text-muted",
							children: "–"
						}),
						current.score[1]
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
					className: "mt-2 text-sm tabular-nums",
					children: [
						minuteLabel(current),
						" · ",
						home.short,
						" ",
						current.score[0],
						"–",
						current.score[1],
						" ",
						away.short
					]
				})
			] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-center gap-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					className: "press inline-flex size-11 items-center justify-center rounded-lg bg-primary text-primary-foreground",
					onClick: () => {
						if (index >= events.length - 1) {
							setIndex(0);
							setPlaying(true);
							return;
						}
						setPlaying((value) => !value);
					},
					"aria-label": playing && index < events.length - 1 ? "Pause match" : "Play match",
					children: playing && index < events.length - 1 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Pause, { className: "size-4" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Play, { className: "size-4" })
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					className: "press inline-flex h-11 items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium",
					onClick: () => {
						setPlaying(false);
						setIndex(events.length - 1);
					},
					children: "Full time"
				})]
			})]
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
			className: "mt-4 block",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "sr-only",
				children: "Scrub the match"
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
				className: "edge",
				type: "range",
				min: 0,
				max: events.length - 1,
				value: index,
				suppressHydrationWarning: true,
				onChange: (event) => {
					setPlaying(false);
					setIndex(Number(event.target.value));
				}
			})]
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			ref: listRef,
			className: "mt-4 max-h-72 space-y-1 overflow-y-auto pr-1",
			"aria-live": "polite",
			children: events.slice(0, index + 1).map((event, eventIndex) => {
				const active = eventIndex === index;
				return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					"data-current": active ? "true" : "false",
					className: `grid grid-cols-[2.5rem_1fr_auto] items-baseline gap-3 rounded-lg px-2 py-2 ${active ? "bg-sunken" : ""}`,
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "text-xs text-muted tabular-nums",
							children: minuteLabel(event)
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
							className: event.kind === "goal" ? "font-medium" : "text-foreground",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "mr-2 text-xs tracking-wide text-muted uppercase",
								children: event.kind === "goal" ? "Goal" : event.kind === "chance" ? "Chance" : event.kind === "card" ? "Card" : ""
							}), event.text]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
							className: "text-xs tabular-nums text-muted",
							children: [
								event.score[0],
								"–",
								event.score[1]
							]
						})
					]
				}, `${event.kind}-${event.min}-${eventIndex}`);
			})
		})
	] });
}
function weightLabel(league, weight) {
	const body = weight.toFixed(2);
	return league === "ch" ? `${body} estimate` : body;
}
function formSide(name, sample, take) {
	if (!sample) return `${name} stays on the season rate`;
	const count = sample.played < take ? `${sample.played} on the feed` : `${sample.played} matches`;
	return `${name} ${sample.attack.toFixed(2)} scored and ${sample.defense.toFixed(2)} conceded (${count})`;
}
function priceGap(share, text) {
	const price = Number(text.trim().replace(",", "."));
	if (!text.trim() || !Number.isFinite(price) || price < 1.01) return null;
	const implied = 1 / price;
	const gap = (share - implied) * 100;
	const relation = gap > .05 ? "above" : gap < -.05 ? "below" : "level with";
	const points = Math.abs(gap) < .05 ? "0.0" : Math.abs(gap).toFixed(1);
	return `Fair ${fairDecimal(share)} from ${(share * 100).toFixed(1)}%. Your ${price.toFixed(2)} implies ${(implied * 100).toFixed(1)}%. The count is ${points} points ${relation} that price.`;
}
function ModelBar({ model, formWindow, level, onModel, onForm, onLevel }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "grid gap-4 sm:grid-cols-3",
		children: [
			{
				label: "Rates",
				value: formWindow,
				options: [
					{
						id: "season",
						label: "Season"
					},
					{
						id: "5",
						label: "Last 5"
					},
					{
						id: "10",
						label: "Last 10"
					}
				],
				onPick: (id) => onForm(id)
			},
			{
				label: "Draws",
				value: model,
				options: [{
					id: "plain",
					label: "Independent"
				}, {
					id: "dixon",
					label: "Dixon–Coles"
				}],
				onPick: (id) => onModel(id)
			},
			{
				label: "Leagues",
				value: level ? "on" : "off",
				options: [{
					id: "off",
					label: "Raw"
				}, {
					id: "on",
					label: "UEFA scale"
				}],
				onPick: (id) => onLevel(id === "on")
			}
		].map((group) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "min-w-0",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mb-2 text-sm font-medium",
				children: group.label
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "flex flex-wrap gap-2",
				children: group.options.map((option) => {
					const pressed = group.value === option.id;
					return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						"aria-pressed": pressed,
						onClick: () => group.onPick(option.id),
						className: `press h-11 rounded-lg px-3 text-sm font-medium ${pressed ? "bg-primary text-primary-foreground" : "border border-border bg-card"}`,
						children: option.label
					}, option.id);
				})
			})]
		}, group.label))
	});
}
function marketsFor(home, away, edge, fixture, model) {
	const report = simulate(home, away, edge, 0, model);
	const over35 = report.scores.reduce((sum, score) => sum + (score.h + score.a >= 4 ? 1 : 0), 0);
	const under15 = report.scores.reduce((sum, score) => sum + (score.h + score.a <= 1 ? 1 : 0), 0);
	return [
		{
			kind: "result",
			label: `${home.name} to win`,
			count: report.homeWins
		},
		{
			kind: "result",
			label: "Draw",
			count: report.draws
		},
		{
			kind: "result",
			label: `${away.name} to win`,
			count: report.awayWins
		},
		{
			kind: "goals",
			label: "Over 2.5 goals",
			count: report.over25
		},
		{
			kind: "goals",
			label: "Under 2.5 goals",
			count: report.n - report.over25
		},
		{
			kind: "goals",
			label: "Over 3.5 goals",
			count: over35
		},
		{
			kind: "goals",
			label: "Under 1.5 goals",
			count: under15
		},
		{
			kind: "btts",
			label: "Both teams to score",
			count: report.btts
		},
		{
			kind: "btts",
			label: "Not both to score",
			count: report.n - report.btts
		}
	].map((row) => ({
		key: `${fixture.id}:${row.label}`,
		fixture,
		label: row.label,
		kind: row.kind,
		share: row.count / report.n
	}));
}
function Pitchline({ initial }) {
	const [board, setBoard] = (0, import_react.useState)(initial);
	const [league, setLeague] = (0, import_react.useState)("eng");
	const [homeId, setHomeId] = (0, import_react.useState)("eng-ars");
	const [awayId, setAwayId] = (0, import_react.useState)("eng-liv");
	const [edgePct, setEdgePct] = (0, import_react.useState)(118);
	const [roll, setRoll] = (0, import_react.useState)(0);
	const [spread, setSpread] = (0, import_react.useState)(-.5);
	const [totalLine, setTotalLine] = (0, import_react.useState)(2.5);
	const [running, setRunning] = (0, import_react.useState)(false);
	const [watching, setWatching] = (0, import_react.useState)(false);
	const [tapeRoll, setTapeRoll] = (0, import_react.useState)(0);
	const [sortKey, setSortKey] = (0, import_react.useState)("index");
	const [sortAsc, setSortAsc] = (0, import_react.useState)(false);
	const [ready, setReady] = (0, import_react.useState)(false);
	const [view, setView] = (0, import_react.useState)("desk");
	const [pickKind, setPickKind] = (0, import_react.useState)("all");
	const [pickLeague, setPickLeague] = (0, import_react.useState)("all");
	const [model, setModel] = (0, import_react.useState)("plain");
	const [formWindow, setFormWindow] = (0, import_react.useState)("season");
	const [level, setLevel] = (0, import_react.useState)(false);
	const [formPair, setFormPair] = (0, import_react.useState)(null);
	const [formNote, setFormNote] = (0, import_react.useState)("idle");
	const [priceMarket, setPriceMarket] = (0, import_react.useState)("home");
	const [priceText, setPriceText] = (0, import_react.useState)("");
	const tapeRef = (0, import_react.useRef)(null);
	const deskRef = (0, import_react.useRef)(null);
	const runTimer = (0, import_react.useRef)(null);
	(0, import_react.useEffect)(() => {
		setBoard(initial);
	}, [initial]);
	(0, import_react.useEffect)(() => {
		let stop = false;
		const pull = () => {
			loadBoard().then((next) => {
				if (!stop) setBoard(next);
			}).catch(() => {});
		};
		const timer = window.setInterval(pull, 9e5);
		const onVisible = () => {
			if (document.visibilityState !== "visible") return;
			if (Date.now() - new Date(board.updatedAt).getTime() > 9e5) pull();
		};
		document.addEventListener("visibilitychange", onVisible);
		return () => {
			stop = true;
			window.clearInterval(timer);
			document.removeEventListener("visibilitychange", onVisible);
		};
	}, [board.updatedAt]);
	(0, import_react.useEffect)(() => {
		const saved = readDesk();
		const known = (id) => Boolean(id && initial.teams.some((team) => team.id === id));
		if (saved) {
			if (saved.league && LEAGUES.some((item) => item.id === saved.league)) setLeague(saved.league);
			if (known(saved.homeId)) setHomeId(saved.homeId);
			if (known(saved.awayId)) setAwayId(saved.awayId);
			if (typeof saved.edgePct === "number") setEdgePct(Math.min(140, Math.max(85, Math.round(saved.edgePct))));
			if (typeof saved.spread === "number") setSpread(roundHalf(saved.spread));
			if (typeof saved.totalLine === "number") setTotalLine(roundHalf(saved.totalLine));
			if (saved.view === "picks" || saved.view === "desk") setView(saved.view);
			if (saved.model === "plain" || saved.model === "dixon") setModel(saved.model);
			if (saved.form === "season" || saved.form === "5" || saved.form === "10") setFormWindow(saved.form);
			if (typeof saved.level === "boolean") setLevel(saved.level);
		}
		setReady(true);
		return () => {
			if (runTimer.current) window.clearTimeout(runTimer.current);
		};
	}, [initial.teams]);
	(0, import_react.useEffect)(() => {
		if (!ready) return;
		const known = (id) => board.teams.some((team) => team.id === id);
		let homeNext = homeId;
		let awayNext = awayId;
		if (!known(homeNext)) homeNext = board.teams.find((team) => team.league === league)?.id ?? board.teams[0]?.id ?? homeNext;
		if (!known(awayNext) || awayNext === homeNext) awayNext = board.teams.find((team) => team.league === league && team.id !== homeNext)?.id ?? board.teams.find((team) => team.id !== homeNext)?.id ?? awayNext;
		if (homeNext !== homeId) setHomeId(homeNext);
		if (awayNext !== awayId) setAwayId(awayNext);
	}, [
		ready,
		board.teams,
		homeId,
		awayId,
		league
	]);
	(0, import_react.useEffect)(() => {
		if (!ready) return;
		const payload = {
			league,
			homeId,
			awayId,
			edgePct,
			spread,
			totalLine,
			view,
			model,
			form: formWindow,
			level
		};
		localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
	}, [
		ready,
		league,
		homeId,
		awayId,
		edgePct,
		spread,
		totalLine,
		view,
		model,
		formWindow,
		level
	]);
	const teamBy = (id) => board.teams.find((team) => team.id === id);
	const home = teamBy(homeId) ?? board.teams.find((team) => team.league === "eng") ?? board.teams[0];
	const away = teamBy(awayId) ?? board.teams.find((team) => team.id !== home.id) ?? board.teams[0];
	const edge = edgePct / 100;
	const same = home.id === away.id;
	(0, import_react.useEffect)(() => {
		if (formWindow === "season") {
			setFormPair(null);
			setFormNote("idle");
			return;
		}
		const homeEspn = home.espnId ?? "";
		const awayEspn = away.espnId ?? "";
		if (!homeEspn && !awayEspn) {
			setFormPair(null);
			setFormNote("missing");
			return;
		}
		let stop = false;
		setFormPair(null);
		setFormNote("loading");
		loadForm({ data: {
			homeSlug: home.feedSlug ?? "",
			homeEspn,
			awaySlug: away.feedSlug ?? "",
			awayEspn
		} }).then((result) => {
			if (stop) return;
			setFormPair(result);
			setFormNote("ready");
		}).catch(() => {
			if (stop) return;
			setFormPair(null);
			setFormNote("error");
		});
		return () => {
			stop = true;
		};
	}, [
		formWindow,
		home.id,
		away.id,
		home.espnId,
		home.feedSlug,
		away.espnId,
		away.feedSlug
	]);
	const take = formWindow === "5" ? 5 : 10;
	const desk = (0, import_react.useMemo)(() => {
		const homeSample = formWindow === "season" || formNote !== "ready" ? null : formRate(formPair?.home?.games, take);
		const awaySample = formWindow === "season" || formNote !== "ready" ? null : formRate(formPair?.away?.games, take);
		return {
			...shapePair(home, away, board.teams, level, homeSample, awaySample),
			homeSample,
			awaySample
		};
	}, [
		home,
		away,
		board.teams,
		level,
		formWindow,
		formNote,
		formPair,
		take
	]);
	const report = (0, import_react.useMemo)(() => same ? null : simulate(desk.home, desk.away, edge, roll, model), [
		same,
		desk.home,
		desk.away,
		edge,
		roll,
		model
	]);
	const handicap = report ? splitHandicap(report.scores, spread) : null;
	const totals = report ? splitTotal(report.scores, totalLine) : null;
	const table = (0, import_react.useMemo)(() => {
		const peers = board.teams.filter((team) => team.league === league);
		const rows = peers.map((team) => ({
			team,
			net: team.attack - team.defense,
			index: indexFor(team, peers)
		}));
		const dir = sortAsc ? 1 : -1;
		rows.sort((a, b) => {
			if (sortKey === "name") return a.team.name.localeCompare(b.team.name) * dir;
			if (sortKey === "attack") return (a.team.attack - b.team.attack) * dir;
			if (sortKey === "defense") return (a.team.defense - b.team.defense) * dir;
			return (a.index - b.index) * dir;
		});
		return rows;
	}, [
		league,
		sortKey,
		sortAsc,
		board.teams
	]);
	const fixtures = board.fixtures.filter((fixture) => fixture.league === league);
	const visiblePicks = (0, import_react.useMemo)(() => {
		if (view !== "picks") return [];
		const byId = new Map(board.teams.map((team) => [team.id, team]));
		const ranked = [];
		for (const fixture of board.fixtures) {
			const homeTeam = byId.get(fixture.homeId);
			const awayTeam = byId.get(fixture.awayId);
			if (!homeTeam || !awayTeam || homeTeam.id === awayTeam.id) continue;
			const shapedFixture = shapePair(homeTeam, awayTeam, board.teams, level, null, null);
			ranked.push(...marketsFor(shapedFixture.home, shapedFixture.away, edge, fixture, model));
		}
		ranked.sort((a, b) => b.share - a.share || a.label.localeCompare(b.label));
		return ranked;
	}, [
		view,
		board.fixtures,
		board.teams,
		edge,
		model,
		level
	]).filter((pick) => {
		if (pickKind !== "all" && pick.kind !== pickKind) return false;
		if (pickLeague !== "all" && pick.fixture.league !== pickLeague) return false;
		return true;
	});
	const hotPicks = visiblePicks.filter((pick) => pick.share >= PICK_LINE);
	const shownPicks = hotPicks.length ? hotPicks : visiblePicks.slice(0, 5);
	function toggleSort(next) {
		if (sortKey === next) {
			setSortAsc((value) => !value);
			return;
		}
		setSortKey(next);
		setSortAsc(next === "defense" || next === "name");
	}
	function loadFixture(homeNext, awayNext, leagueNext) {
		setLeague(leagueNext);
		setHomeId(homeNext);
		setAwayId(awayNext);
	}
	function openPick(pick) {
		setRoll(0);
		loadFixture(pick.fixture.homeId, pick.fixture.awayId, pick.fixture.league);
		setView("desk");
		window.setTimeout(() => {
			const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
			deskRef.current?.scrollIntoView({
				behavior: reduce ? "auto" : "smooth",
				block: "start"
			});
		}, 40);
	}
	function rerun() {
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
			setRoll((value) => value + 1);
			return;
		}
		setRunning(true);
		if (runTimer.current) window.clearTimeout(runTimer.current);
		runTimer.current = window.setTimeout(() => {
			setRoll((value) => value + 1);
			setRunning(false);
		}, 280);
	}
	function openTape() {
		setWatching(true);
		setTapeRoll((value) => value + 1);
		window.setTimeout(() => {
			const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
			tapeRef.current?.scrollIntoView({
				behavior: reduce ? "auto" : "smooth",
				block: "start"
			});
		}, 30);
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
		className: "mx-auto min-h-screen max-w-6xl px-4 pt-4 pb-16 sm:px-6",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("header", {
				className: "sticky top-0 z-10 -mx-4 mb-6 border-b border-border bg-background px-4 py-3 sm:-mx-6 sm:px-6",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex flex-wrap items-center justify-between gap-3",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex items-center gap-3",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Mark, {}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
							className: "font-display text-3xl leading-none tracking-tight",
							children: "Pitchline"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "mt-1 text-sm text-muted",
							children: ["Football match simulator · ", board.season]
						})] })]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "max-w-xs text-sm text-muted",
						children: "A thousand matches from attack and defense. Not a tip — a counting model you can rerun."
					})]
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mb-4 flex gap-2",
				role: "tablist",
				"aria-label": "View",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					role: "tab",
					"aria-selected": view === "desk",
					onClick: () => setView("desk"),
					className: `press h-11 rounded-lg px-4 text-sm font-medium ${view === "desk" ? "bg-primary text-primary-foreground" : "border border-border bg-card text-foreground"}`,
					children: "Match desk"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					role: "tab",
					"aria-selected": view === "picks",
					onClick: () => setView("picks"),
					className: `press h-11 rounded-lg px-4 text-sm font-medium ${view === "picks" ? "bg-primary text-primary-foreground" : "border border-border bg-card text-foreground"}`,
					children: "Best picks"
				})]
			}),
			view === "picks" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "mb-6",
				"aria-label": "Best picks",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mb-4 flex flex-wrap items-end justify-between gap-3",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
							className: "font-display text-2xl tracking-tight",
							children: "Best upcoming picks"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-1 max-w-xl text-sm text-muted",
							children: "Markets that hit in at least 80% of 1,000 simulated matches. Season rates, not last-5 form. Not a tip — a count."
						})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-sm text-muted tabular-nums",
							children: hotPicks.length ? `${hotPicks.length} clear 80%` : "None at 80%"
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "panel mb-4",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex items-baseline justify-between gap-3",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", {
									htmlFor: "picks-edge",
									className: "text-sm font-medium",
									children: "Home edge"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "font-display text-xl tabular-nums",
									children: edgeCopy(edgePct)
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								id: "picks-edge",
								className: "edge mt-2",
								type: "range",
								min: 85,
								max: 140,
								step: 1,
								value: edgePct,
								suppressHydrationWarning: true,
								onChange: (event) => setEdgePct(Number(event.target.value))
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "mt-5",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ModelBar, {
									model,
									formWindow,
									level,
									onModel: setModel,
									onForm: setFormWindow,
									onLevel: setLevel
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
									className: "mt-3 text-xs text-muted",
									children: [
										"Last 5 and last 10 change the open match only. Dixon–Coles (ρ = ",
										DIXON_RHO.toFixed(2),
										") and the UEFA scale apply to this list when they are on. Championship is a 0.60 estimate. Saudi, MLS, Brazil, Liga MX and unmatched European clubs stay at 1.00."
									]
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "mt-4 flex flex-wrap gap-2",
								children: [
									["all", "All"],
									["result", "Result"],
									["goals", "Goals"],
									["btts", "Both score"]
								].map(([id, label]) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									type: "button",
									"aria-pressed": pickKind === id,
									onClick: () => setPickKind(id),
									className: `press h-11 rounded-lg px-3 text-sm font-medium ${pickKind === id ? "bg-primary text-primary-foreground" : "border border-border bg-card"}`,
									children: label
								}, id))
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
								className: "mt-4 block text-sm font-medium",
								htmlFor: "picks-league",
								children: ["Competition", /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
									className: "relative mt-2 block",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
										id: "picks-league",
										value: pickLeague,
										onChange: (event) => setPickLeague(event.target.value),
										className: "h-11 w-full appearance-none rounded-lg border border-border bg-card pr-10 pl-3 text-base",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
											value: "all",
											children: "All competitions"
										}), LEAGUES.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
											value: item.id,
											children: item.name
										}, item.id))]
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChevronDown, { className: "pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted" })]
								})]
							})
						]
					}),
					shownPicks.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("section", {
						className: "panel",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-sm",
							children: "No fixtures in this filter yet."
						})
					}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "space-y-2",
						children: [!hotPicks.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mb-2 text-sm text-muted",
							children: "Nothing clears 80% here. Closest calls:"
						}) : null, shownPicks.map((pick) => {
							const homeTeam = teamBy(pick.fixture.homeId);
							const awayTeam = teamBy(pick.fixture.awayId);
							if (!homeTeam || !awayTeam) return null;
							return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
								type: "button",
								onClick: () => openPick(pick),
								className: "press flex w-full items-center gap-3 rounded-3xl border border-border bg-card p-4 text-left",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
									className: "w-16 shrink-0",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
										className: "block font-display text-2xl tabular-nums",
										children: [(pick.share * 100).toFixed(1), "%"]
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "block text-xs text-muted tabular-nums",
										children: fairDecimal(pick.share)
									})]
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
									className: "min-w-0 flex-1",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: "block truncate font-medium",
											children: pick.label
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
											className: "mt-1 block truncate text-sm text-muted",
											children: [
												leagueShort(pick.fixture.league),
												" · ",
												pick.fixture.when
											]
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
											className: "mt-1 block truncate text-sm",
											children: [
												awayTeam.name,
												" at ",
												homeTeam.name
											]
										})
									]
								})]
							}, pick.key);
						})]
					})
				]
			}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "mb-4 flex max-w-full gap-2 overflow-x-auto pb-1",
					role: "tablist",
					"aria-label": "League",
					children: LEAGUES.map((item) => {
						const selected = item.id === league;
						return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							role: "tab",
							"aria-selected": selected,
							onClick: () => setLeague(item.id),
							className: `press h-11 shrink-0 rounded-lg px-4 text-sm font-medium ${selected ? "bg-primary text-primary-foreground" : "border border-border bg-card text-foreground"}`,
							children: item.short
						}, item.id);
					})
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
					className: "mb-6",
					"aria-label": "Matchweek",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mb-3 flex items-baseline justify-between gap-3",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
							className: "font-display text-2xl tracking-tight",
							children: "Up next"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "text-sm text-muted",
							children: [board.weekends[league], " · refreshes on its own"]
						})]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "rail -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6",
						children: [fixtures.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-sm text-muted",
							children: "No fixtures in this window. The board below is still live."
						}) : null, fixtures.map((fixture) => {
							const homeTeam = teamBy(fixture.homeId);
							const awayTeam = teamBy(fixture.awayId);
							if (!homeTeam || !awayTeam) return null;
							const shapedFixture = shapePair(homeTeam, awayTeam, board.teams, level, null, null);
							const split = analyticalSplit(shapedFixture.home, shapedFixture.away, edge, model);
							const active = homeTeam.id === home.id && awayTeam.id === away.id;
							return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
								type: "button",
								"data-active": active ? "true" : "false",
								onClick: () => loadFixture(homeTeam.id, awayTeam.id, fixture.league),
								className: "fixture w-60 shrink-0 snap-start rounded-3xl border border-border bg-card p-4 text-left",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "text-xs text-muted",
										children: fixture.when
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "mt-3 flex items-center gap-2",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Crest, { team: homeTeam }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: "truncate text-sm font-medium",
											children: homeTeam.name
										})]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "mt-2 flex items-center gap-2",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Crest, { team: awayTeam }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: "truncate text-sm font-medium",
											children: awayTeam.name
										})]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
										className: "mt-3 font-display text-xl tabular-nums",
										children: [
											split.homeXg.toFixed(2),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
												className: "px-1 text-muted",
												children: "–"
											}),
											split.awayXg.toFixed(2)
										]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "mt-2 flex h-1.5 overflow-hidden rounded-full bg-sunken",
										children: [
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
												className: "bg-primary",
												style: { width: barWidth(split.home) }
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
												className: "bg-draw",
												style: { width: barWidth(split.draw) }
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
												className: "bg-foreground",
												style: { width: barWidth(split.away) }
											})
										]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
										className: "mt-2 text-xs text-muted tabular-nums",
										children: [
											shareLabel(split.home),
											" · ",
											shareLabel(split.draw),
											" · ",
											shareLabel(split.away)
										]
									})
								]
							}, fixture.id);
						})]
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
					className: "panel mb-4",
					id: "match-desk",
					ref: deskRef,
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "mb-4 flex flex-wrap items-end justify-between gap-3",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
								className: "font-display text-2xl tracking-tight",
								children: "Predict the match"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "mt-1 text-sm text-muted",
								children: "Home and away can come from any league."
							})] })
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "grid items-end gap-3 sm:grid-cols-[1fr_auto_1fr]",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TeamSelect, {
									id: "home-club",
									label: "Home",
									value: home.id,
									blockedId: away.id,
									teams: board.teams,
									onChange: setHomeId
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									type: "button",
									className: "press inline-flex size-11 items-center justify-center rounded-lg border border-border",
									"aria-label": "Swap home and away",
									onClick: () => {
										setHomeId(away.id);
										setAwayId(home.id);
									},
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArrowLeftRight, { className: "size-4" })
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TeamSelect, {
									id: "away-club",
									label: "Away",
									value: away.id,
									blockedId: home.id,
									teams: board.teams,
									onChange: setAwayId
								})
							]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "mt-5",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "flex items-baseline justify-between gap-3",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", {
										htmlFor: "home-edge",
										className: "text-sm font-medium",
										children: "Home edge"
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "font-display text-xl tabular-nums",
										children: edgeCopy(edgePct)
									})]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
									id: "home-edge",
									className: "edge mt-2",
									type: "range",
									min: 85,
									max: 140,
									step: 1,
									value: edgePct,
									suppressHydrationWarning: true,
									onChange: (event) => setEdgePct(Number(event.target.value))
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "mt-1 flex justify-between text-xs text-muted",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Away favored" }),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Even" }),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Home favored" })
									]
								})
							]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "mt-5",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ModelBar, {
								model,
								formWindow,
								level,
								onModel: setModel,
								onForm: setFormWindow,
								onLevel: setLevel
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
								className: "mt-3 text-xs text-muted",
								children: [
									"Independent Poisson is the default. Dixon–Coles (ρ = ",
									DIXON_RHO.toFixed(2),
									") lifts 0–0 and 1–1. The UEFA scale is the 5 Nov 2026 coefficients divided by England. Same weight on both sides cancels."
								]
							})]
						}),
						formWindow !== "season" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-3 text-sm text-muted",
							children: formNote === "loading" ? "Reading recent matches…" : formNote === "missing" ? "Recent form needs the live tables. Season rates stay on." : formNote === "error" ? "Recent matches did not load. Season rates stay on." : `Last ${take}: ${formSide(home.short, desk.homeSample, take)}. ${formSide(away.short, desk.awaySample, take)}.`
						}) : null,
						desk.homeLeague !== desk.awayLeague ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-3 text-sm text-muted",
							children: !level ? `${leagueName(desk.homeLeague)} against ${leagueName(desk.awayLeague)}. League scale is off, so a goal a game counts the same in both.` : desk.leveled ? `${leagueName(desk.homeLeague)} ${weightLabel(desk.homeLeague, desk.homeWeight)} against ${leagueName(desk.awayLeague)} ${weightLabel(desk.awayLeague, desk.awayWeight)}. Attack is multiplied by that weight. Defense is divided by it.` : `${leagueName(desk.homeLeague)} and ${leagueName(desk.awayLeague)} both sit at ${desk.homeWeight.toFixed(2)}, so the scale cancels.`
						}) : null,
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "mt-5 flex flex-wrap gap-2",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
								type: "button",
								className: "press inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-40",
								onClick: rerun,
								disabled: same || running,
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(RotateCcw, { className: "size-4" }), running ? "Simulating…" : "Run 1,000 again"]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
								type: "button",
								className: "press inline-flex h-11 items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium disabled:opacity-40",
								onClick: openTape,
								disabled: same,
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Play, { className: "size-4" }), "Play one match"]
							})]
						})
					]
				}),
				same || !report ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("section", {
					className: "panel mb-4",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-sm",
						children: "Pick two different clubs."
					})
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: running ? "opacity-60" : void 0,
					"aria-busy": running,
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
							className: "panel mb-4",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "grid items-center gap-6 md:grid-cols-[1.2fr_1fr]",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
											className: "text-sm text-muted",
											children: "Expected goals"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "mt-4 flex items-center justify-between gap-3",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
												className: "flex min-w-0 items-center gap-2",
												children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Crest, {
													team: home,
													large: true
												}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
													className: "truncate text-sm font-medium sm:text-base",
													children: home.name
												})]
											}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
												className: "flex min-w-0 items-center justify-end gap-2",
												children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
													className: "truncate text-sm font-medium sm:text-base",
													children: away.name
												}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Crest, {
													team: away,
													large: true
												})]
											})]
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
											className: "score-figure mt-4 text-center",
											children: [
												report.homeXg.toFixed(2),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
													className: "px-2 text-muted",
													children: "–"
												}),
												report.awayXg.toFixed(2)
											]
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
											className: "mt-3 text-center text-sm text-muted tabular-nums",
											children: [
												"Sim mean ",
												report.meanHome.toFixed(2),
												"–",
												report.meanAway.toFixed(2),
												" · most likely ",
												report.mode.h,
												"–",
												report.mode.a,
												" (",
												pctLabel(report.mode.n, report.n),
												")"
											]
										})
									] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "flex h-2 overflow-hidden rounded-full bg-sunken",
										"aria-hidden": true,
										children: [
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
												className: "bg-primary",
												style: { width: barWidth(report.homeWins / report.n) }
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
												className: "bg-draw",
												style: { width: barWidth(report.draws / report.n) }
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
												className: "bg-foreground",
												style: { width: barWidth(report.awayWins / report.n) }
											})
										]
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("dl", {
										className: "mt-4 grid grid-cols-3 gap-2",
										children: [
											/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("dt", {
													className: "text-xs text-muted",
													children: "Home"
												}),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("dd", {
													className: "font-display text-2xl tabular-nums",
													children: pctLabel(report.homeWins, report.n)
												}),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("dd", {
													className: "text-xs text-muted tabular-nums",
													children: fairDecimal(report.homeWins / report.n)
												})
											] }),
											/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("dt", {
													className: "text-xs text-muted",
													children: "Draw"
												}),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("dd", {
													className: "font-display text-2xl tabular-nums",
													children: pctLabel(report.draws, report.n)
												}),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("dd", {
													className: "text-xs text-muted tabular-nums",
													children: fairDecimal(report.draws / report.n)
												})
											] }),
											/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("dt", {
													className: "text-xs text-muted",
													children: "Away"
												}),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("dd", {
													className: "font-display text-2xl tabular-nums",
													children: pctLabel(report.awayWins, report.n)
												}),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("dd", {
													className: "text-xs text-muted tabular-nums",
													children: fairDecimal(report.awayWins / report.n)
												})
											] })
										]
									})] })]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("dl", {
									className: "mt-6 grid grid-cols-3 gap-3 border-t border-border pt-4",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("dt", {
												className: "text-xs text-muted",
												children: "Both score"
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("dd", {
												className: "text-lg font-medium tabular-nums",
												children: pctLabel(report.btts, report.n)
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("dd", {
												className: "text-xs text-muted tabular-nums",
												children: fairDecimal(report.btts / report.n)
											})
										] }),
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("dt", {
												className: "text-xs text-muted",
												children: "Over 2.5"
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("dd", {
												className: "text-lg font-medium tabular-nums",
												children: pctLabel(report.over25, report.n)
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("dd", {
												className: "text-xs text-muted tabular-nums",
												children: fairDecimal(report.over25 / report.n)
											})
										] }),
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
											/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("dt", {
												className: "text-xs text-muted",
												children: [home.short, " clean sheet"]
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("dd", {
												className: "text-lg font-medium tabular-nums",
												children: pctLabel(report.homeClean, report.n)
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("dd", {
												className: "text-xs text-muted tabular-nums",
												children: fairDecimal(report.homeClean / report.n)
											})
										] })
									]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "mt-3 text-xs text-muted",
									children: "Small figures are fair decimal odds from the count. Not a price."
								})
							]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "mb-4 grid gap-4 lg:grid-cols-2",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
								className: "panel",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
										className: "font-display text-2xl tracking-tight",
										children: "Scorelines"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "mt-1 mb-4 text-sm text-muted",
										children: "Share of the 1,000 matches. The ring marks the mode inside 0–4."
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ScoreMatrix, { report }),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ol", {
										className: "mt-4 space-y-1",
										children: report.top.map((line) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
											className: "flex items-baseline justify-between gap-3 text-sm",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
												className: "tabular-nums",
												children: [
													home.short,
													" ",
													line.h,
													"–",
													line.a,
													" ",
													away.short
												]
											}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
												className: "text-muted tabular-nums",
												children: pctLabel(line.n, report.n)
											})]
										}, `${line.h}-${line.a}`))
									})
								]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "grid gap-4",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
									className: "panel",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
											className: "font-display text-2xl tracking-tight",
											children: "Margin"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
											className: "mt-1 mb-4 text-sm text-muted",
											children: "Home goals minus away goals. The dark bars are away wins."
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Hist, {
											labels: marginLabels(),
											values: report.margins,
											total: report.n,
											toneAt: (index) => index < 4 ? "away" : index === 4 ? "draw" : "home"
										})
									]
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
									className: "panel",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
											className: "font-display text-2xl tracking-tight",
											children: "Total goals"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
											className: "mt-1 mb-4 text-sm text-muted",
											children: "Both teams combined. The last bar is 7 or more."
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Hist, {
											labels: totalLabels(),
											values: report.totals,
											total: report.n,
											toneAt: () => "neutral"
										})
									]
								})]
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
							className: "panel mb-4",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
									className: "font-display text-2xl tracking-tight",
									children: "Your lines"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "mt-1 mb-5 text-sm text-muted",
									children: "A price you saw, a home handicap, or a goals total. Whole numbers can push. Still a count, not a tip."
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "mb-6",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
											className: "text-sm font-medium",
											children: "A price you saw"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "mt-3 grid gap-3 sm:grid-cols-[1fr_8rem]",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
												className: "block min-w-0 text-sm",
												htmlFor: "price-market",
												children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
													className: "sr-only",
													children: "Market"
												}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
													className: "relative block",
													children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
														id: "price-market",
														value: priceMarket,
														onChange: (event) => setPriceMarket(event.target.value),
														className: "h-11 w-full appearance-none rounded-lg border border-border bg-card pr-10 pl-3 text-base",
														children: [
															/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("option", {
																value: "home",
																children: [home.name, " to win"]
															}),
															/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
																value: "draw",
																children: "Draw"
															}),
															/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("option", {
																value: "away",
																children: [away.name, " to win"]
															}),
															/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
																value: "btts",
																children: "Both teams to score"
															}),
															/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
																value: "over",
																children: "Over 2.5 goals"
															}),
															/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
																value: "under",
																children: "Under 2.5 goals"
															})
														]
													}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChevronDown, { className: "pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted" })]
												})]
											}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
												className: "block text-sm",
												htmlFor: "price-decimal",
												children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
													className: "sr-only",
													children: "Decimal price"
												}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
													id: "price-decimal",
													inputMode: "decimal",
													placeholder: "1.80",
													value: priceText,
													onChange: (event) => setPriceText(event.target.value),
													className: "h-11 w-full rounded-lg border border-border bg-card px-3 text-base tabular-nums"
												})]
											})]
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
											className: "mt-3 text-sm text-muted",
											children: priceGap(priceMarket === "home" ? report.homeWins / report.n : priceMarket === "draw" ? report.draws / report.n : priceMarket === "away" ? report.awayWins / report.n : priceMarket === "btts" ? report.btts / report.n : priceMarket === "over" ? report.over25 / report.n : (report.n - report.over25) / report.n, priceText) ?? "Type a decimal above 1.01 to compare it with the fair price."
										})
									]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "grid gap-6 md:grid-cols-2",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "flex items-baseline justify-between gap-3",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
												className: "text-sm font-medium",
												children: "Home handicap"
											}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
												className: "font-display text-2xl tabular-nums",
												children: formatLine(spread)
											})]
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "mt-3 flex items-center gap-2",
											children: [
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
													type: "button",
													className: "press inline-flex size-11 items-center justify-center rounded-lg border border-border",
													"aria-label": "Decrease home handicap",
													onClick: () => setSpread((value) => roundHalf(Math.max(-3.5, value - .5))),
													disabled: spread <= -3.5,
													children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Minus, { className: "size-4" })
												}),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
													className: "edge",
													type: "range",
													min: -3.5,
													max: 3.5,
													step: .5,
													value: spread,
													"aria-label": "Home handicap",
													suppressHydrationWarning: true,
													onChange: (event) => setSpread(roundHalf(Number(event.target.value)))
												}),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
													type: "button",
													className: "press inline-flex size-11 items-center justify-center rounded-lg border border-border",
													"aria-label": "Increase home handicap",
													onClick: () => setSpread((value) => roundHalf(Math.min(3.5, value + .5))),
													disabled: spread >= 3.5,
													children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, { className: "size-4" })
												})
											]
										}),
										handicap ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
											className: "mt-3 text-sm",
											children: [
												home.short,
												" ",
												formatLine(spread),
												" covers in",
												" ",
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
													className: "font-medium tabular-nums",
													children: pctLabel(handicap.win, report.n)
												}),
												handicap.push > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
													" ",
													"· push ",
													/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
														className: "tabular-nums",
														children: pctLabel(handicap.push, report.n)
													})
												] }) : null,
												" ",
												"· fails ",
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
													className: "tabular-nums",
													children: pctLabel(handicap.lose, report.n)
												})
											]
										}) : null
									] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "flex items-baseline justify-between gap-3",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
												className: "text-sm font-medium",
												children: "Total goals"
											}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
												className: "font-display text-2xl tabular-nums",
												children: formatLine(totalLine)
											})]
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "mt-3 flex items-center gap-2",
											children: [
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
													type: "button",
													className: "press inline-flex size-11 items-center justify-center rounded-lg border border-border",
													"aria-label": "Decrease total",
													onClick: () => setTotalLine((value) => roundHalf(Math.max(.5, value - .5))),
													disabled: totalLine <= .5,
													children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Minus, { className: "size-4" })
												}),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
													className: "edge",
													type: "range",
													min: .5,
													max: 6.5,
													step: .5,
													value: totalLine,
													"aria-label": "Total goals line",
													suppressHydrationWarning: true,
													onChange: (event) => setTotalLine(roundHalf(Number(event.target.value)))
												}),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
													type: "button",
													className: "press inline-flex size-11 items-center justify-center rounded-lg border border-border",
													"aria-label": "Increase total",
													onClick: () => setTotalLine((value) => roundHalf(Math.min(6.5, value + .5))),
													disabled: totalLine >= 6.5,
													children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, { className: "size-4" })
												})
											]
										}),
										totals ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
											className: "mt-3 text-sm",
											children: [
												"Over ",
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
													className: "font-medium tabular-nums",
													children: pctLabel(totals.over, report.n)
												}),
												totals.push > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
													" ",
													"· push ",
													/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
														className: "tabular-nums",
														children: pctLabel(totals.push, report.n)
													})
												] }) : null,
												" ",
												"· under ",
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
													className: "tabular-nums",
													children: pctLabel(totals.under, report.n)
												})
											]
										}) : null
									] })]
								})
							]
						})
					]
				}),
				watching && !same ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
					className: "panel mb-4",
					ref: tapeRef,
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mb-4 flex items-center justify-between gap-3",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
							className: "font-display text-2xl tracking-tight",
							children: "Match tape"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							className: "press h-11 rounded-lg px-3 text-sm font-medium text-muted",
							onClick: () => setWatching(false),
							children: "Close"
						})]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MatchTape, {
						home: desk.home,
						away: desk.away,
						edge,
						roll: tapeRoll,
						model
					})]
				}) : null,
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
					className: "panel mb-4",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mb-4 flex flex-wrap items-end justify-between gap-3",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h2", {
							className: "font-display text-2xl tracking-tight",
							children: [leagueName(league), " board"]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "mt-1 text-sm text-muted",
							children: [isCup(league) ? "European clubs take their domestic scoring into the tie. Sides from leagues we don't carry are rated on their European games, pulled toward average when the sample is short. Index ranks net goals inside this competition. " : "Attack is goals scored per match this season, defense is goals conceded. Lower defense is tighter. Index ranks net goals inside this league. ", board.source === "live" ? `Tables refresh on their own — last update ${board.updatedLabel}.` : `Live tables were unreachable, so this is the saved board from ${board.updatedLabel}. It will try again.`]
						})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-sm text-muted",
							children: "Tap a club for home. Away sets the other side."
						})]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "overflow-x-auto",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", {
							className: "w-full min-w-full text-left text-sm",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", {
								className: "border-b border-border text-xs text-muted",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
										className: "py-2 pr-2 font-medium",
										children: "#"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
										className: "py-2 pr-2 font-medium",
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
											type: "button",
											className: "h-11",
											onClick: () => toggleSort("name"),
											children: "Club"
										})
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
										className: "py-2 pr-2 text-right font-medium",
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
											type: "button",
											className: "h-11",
											onClick: () => toggleSort("attack"),
											children: "Att"
										})
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
										className: "py-2 pr-2 text-right font-medium",
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
											type: "button",
											className: "h-11",
											onClick: () => toggleSort("defense"),
											children: "Def"
										})
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
										className: "hidden py-2 pr-2 text-right font-medium sm:table-cell",
										children: "Net"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
										className: "py-2 pr-2 text-right font-medium",
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
											type: "button",
											className: "h-11",
											onClick: () => toggleSort("index"),
											children: "Index"
										})
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
										className: "py-2 font-medium",
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: "sr-only",
											children: "Set away"
										})
									})
								]
							}) }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", { children: table.map((row, index) => {
								const selected = row.team.id === home.id || row.team.id === away.id;
								return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", {
									className: selected ? "bg-sunken" : void 0,
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
											className: "py-1 pr-2 text-muted tabular-nums",
											children: index + 1
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
											className: "py-1 pr-2",
											children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
												type: "button",
												className: "inline-flex h-11 max-w-48 items-center gap-2 text-left font-medium disabled:opacity-40",
												disabled: row.team.id === away.id,
												onClick: () => setHomeId(row.team.id),
												children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Crest, { team: row.team }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
													className: "truncate",
													children: row.team.name
												})]
											})
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
											className: "py-1 pr-2 text-right tabular-nums",
											children: row.team.attack.toFixed(2)
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
											className: "py-1 pr-2 text-right tabular-nums",
											children: row.team.defense.toFixed(2)
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", {
											className: "hidden py-1 pr-2 text-right tabular-nums sm:table-cell",
											children: [row.net > 0 ? "+" : "", row.net.toFixed(2)]
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
											className: "py-1 pr-2 text-right font-medium tabular-nums",
											children: row.index
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
											className: "py-1 text-right",
											children: row.team.id === away.id ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
												className: "text-xs text-muted",
												children: "Away"
											}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
												type: "button",
												className: "h-11 px-2 text-sm text-muted disabled:opacity-40",
												disabled: row.team.id === home.id,
												onClick: () => setAwayId(row.team.id),
												children: row.team.id === home.id ? "Home" : "Away"
											})
										})
									]
								}, row.team.id);
							}) })]
						})
					})]
				})
			] }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("footer", {
				className: "px-1 text-sm text-muted",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { children: [
					"Expected goals equal a side’s attack times the opponent’s defense, scaled to a league average of 1.35, then moved by the home edge.",
					" ",
					model === "dixon" ? `Dixon–Coles (ρ = ${DIXON_RHO.toFixed(2)}) ties the low scorelines, then each of the ${SIMS.toLocaleString("en-GB")} matches is drawn from that table.` : `Each of the ${SIMS.toLocaleString("en-GB")} matches draws the two goal totals independently from those rates.`,
					" ",
					formWindow !== "season" ? "Last 5 and last 10 replace the season rates on the open match only. " : "",
					level ? "The UEFA scale is on for clubs rated from different leagues. " : "",
					board.source === "live" ? `Ratings are this season’s scoring, refreshed from the league tables (${board.updatedLabel}), not a betting line.` : `Live tables were unreachable, so ratings are the saved board from ${board.updatedLabel}. Not a betting line.`
				] })
			})
		]
	});
}
function Home() {
	const board = Route.useLoaderData();
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Pitchline, { initial: board });
}
//#endregion
export { Home as component };
