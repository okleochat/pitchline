import { n as TSS_SERVER_FUNCTION, t as createServerFn } from "./ssr.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/board-Dc_Lzow8.js
var createServerRpc = (serverFnMeta, splitImportFn) => {
	const url = "/_serverFn/" + serverFnMeta.id;
	return Object.assign(splitImportFn, {
		url,
		serverFnMeta,
		[TSS_SERVER_FUNCTION]: true
	});
};
var loadBoard_createServerFn_handler = createServerRpc({
	id: "b6c7657f9edf9e8ba4170b84e0472b57147f9874e60783bbd6658adbe0c6a897",
	name: "loadBoard",
	filename: "src/lib/board.ts"
}, (opts) => loadBoard.__executeServer(opts));
var loadBoard = createServerFn({ method: "GET" }).handler(loadBoard_createServerFn_handler, async () => {
	const { getLiveBoard } = await import("./live-board.server-T58bVkXQ.mjs");
	return getLiveBoard();
});
var loadForm_createServerFn_handler = createServerRpc({
	id: "ca1e3dc473af2b33799ee9f02797f738cf405c01edbea628af256c873703d73b",
	name: "loadForm",
	filename: "src/lib/board.ts"
}, (opts) => loadForm.__executeServer(opts));
var loadForm = createServerFn({ method: "GET" }).validator((input) => {
	const body = input ?? {};
	const slug = (value) => typeof value === "string" ? value.slice(0, 40) : "";
	const id = (value) => typeof value === "string" && /^\d{0,12}$/.test(value) ? value : "";
	return {
		homeSlug: slug(body.homeSlug),
		homeEspn: id(body.homeEspn),
		awaySlug: slug(body.awaySlug),
		awayEspn: id(body.awayEspn)
	};
}).handler(loadForm_createServerFn_handler, async ({ data }) => {
	const { getRecentForm } = await import("./live-board.server-T58bVkXQ.mjs");
	return getRecentForm(data);
});
//#endregion
export { loadBoard_createServerFn_handler, loadForm_createServerFn_handler };
