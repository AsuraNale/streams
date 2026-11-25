// Building a library (1.1 W4): the conversation with the main agent, the library card, confirming it.
//   questions.mjs     the checks a question passes before the interface shows it (A1)
//   card.mjs          the card's eight parts and seven lines, the addresses it may carry, the Markdown people read (A2)
//   format.mjs        what the code fills into the build SOP: tools, budget, actions, the answer's format
//   conversation.mjs  createBuild: one build, turn by turn, with the web tools of the connection
//   proposals.mjs     proposal cards for the actions waiting for 确认, from the definition
//   store.mjs         _card/ and _state/ of a library; the handlers of create_library and edit_card (only after 确认, B3)
export { checkQuestion, answerText, QUESTION_LIMITS, QUESTION_KINDS } from './questions.mjs';
export { checkCard, cardUrls, urlKey, sameUrl, renderCard, cardChanges, CARD_PARTS, DEFINITION_LINES, MAX_DECISIONS, CARD_WORDS } from './card.mjs';
export { toolsText, budgetText, actionsText, OUTPUT_TEXT, BUILD_BUDGET } from './format.mjs';
export { createBuild, buildPrompt, problemText, MAX_BUILD_TURNS } from './conversation.mjs';
export { proposalCards } from './proposals.mjs';
export { writeCard, readCard, cardHandlers, splitVolume, CARD_DIR, STATE_DIR, CARD_JSON, CARD_MD } from './store.mjs';
// 1.1.2 (第 4、5 件): what the main agent is told of the library it talks about; how near its last update was to the limit
export { buildContext, volumeBlock, conversationsBlock, lastUpdateBlock, nearLimit, NOT_READ_FOR_LIMIT, CONTEXT_LIMITS } from './context.mjs';
export { VOLUME_WORDS, countLimitOf } from './card.mjs';
