//#region src/index.ts
/**
* @max-null/dsh-chat-rail — host half.
*
* Registers the `chatRail` session projection unit: a complete, durable
* enumeration of the session's USER-sent messages (seq / time / preview /
* durable message id). The client rail only needs user turns; assistant
* replies are excluded so the rail stays compact.
*
* Compaction deliberately does not drop user messages: dsh renders a
* compaction marker row at the checkpoint position but keeps the transcript
* above it intact, so every user-sent message stays visible on the rail.
*
* Architecture reference: dsh-chat-timeline (MIT) — same projection shape.
*/
const name = "chat-rail";
const PROJECTION_KEY = "chatRail";
/** Cap preview text so projection payloads stay small (80 chars ≈ 1-2 lines). */
const MAX_TEXT_CHARS = 80;
/** Join the text blocks of a host-side ContentBlock list. */
function textOf(content) {
	if (!Array.isArray(content)) return "";
	let out = "";
	for (const block of content) if (block !== null && typeof block === "object" && block.type === "text" && typeof block.text === "string") out += block.text;
	return out.trim().slice(0, MAX_TEXT_CHARS);
}
/** Whether a ContentBlock list carries an image block (rc.8 多模态附件）。 */
function hasImageBlock(content) {
	if (!Array.isArray(content)) return false;
	return content.some((block) => block !== null && typeof block === "object" && block.type === "image");
}
/** Collect stored-image references from a ContentBlock list (reference form only:
*  inline base64 data stays out of the payload — it can be megabytes). */
function imageRefsOf(content) {
	if (!Array.isArray(content)) return [];
	const refs = [];
	for (const block of content) {
		if (block === null || typeof block !== "object") continue;
		const b = block;
		if (b.type !== "image") continue;
		const a = b.attachment;
		if (a === null || typeof a !== "object") continue;
		const ref = a;
		if (typeof ref.attachmentId !== "string" || ref.attachmentId === "") continue;
		refs.push({
			attachmentId: ref.attachmentId,
			mediaType: typeof ref.mediaType === "string" ? ref.mediaType : "image/png",
			width: typeof ref.width === "number" ? ref.width : 0,
			height: typeof ref.height === "number" ? ref.height : 0
		});
	}
	return refs;
}
const messageIndexProjectionDefinition = {
	key: PROJECTION_KEY,
	stateSchema: { parse: (val) => val },
	init: () => ({ messages: [] }),
	apply: (state, event) => {
		if (event.type === "user/message") {
			const data = event.data;
			if (data === null || typeof data !== "object" || data.source === null || typeof data.source !== "object" || data.source.kind !== "user") return state;
			const text = textOf(data.content);
			const hasImage = hasImageBlock(data.content);
			const id = typeof data.id === "string" ? data.id : "";
			if (!id) return state;
			return { messages: [...state.messages, {
				seq: event.seq,
				time: event.time,
				text,
				hasImage,
				images: imageRefsOf(data.content),
				id
			}] };
		}
		return state;
	},
	wire: {
		viewSchema: { parse: (val) => val },
		view: (state) => state
	},
	stateVersion: 6
};
const Config = { "~standard": {
	version: 1,
	vendor: "chat-rail",
	validate: (value) => ({ value: value ?? {} })
} };
function apply(ctx) {
	ctx.inject(["sessionProjections"], (projectionCtx) => {
		projectionCtx.sessionProjections.register(messageIndexProjectionDefinition);
	});
}
//#endregion
export { Config, apply, name };
