// Proposal cards from the definition (1.1 W4; moved here from W1, contract 「W1 交付后补记」): every action the user has
// to confirm that is waiting (actions.mjs pending records) becomes a card for the interface. Its name and whether it
// needs confirming come from the definition file; an action the definition no longer has gives no card.
//
// proposalCards(pending, definition, { language, cardOf }) -> [{ id, action, name, at, actor, params, before?, after?,
//   canConfirm, problems }]
//   create_library  after = the card; canConfirm = the card is whole (checkCard; its addresses were checked when it was
//                   proposed, from the build's reads)
//   edit_card       before = cardOf(params.library) (the card the library has now), after = the new card; canConfirm as above
//   others          canConfirm true (their parameters were checked against the definition when they were proposed)
import { checkCard } from './card.mjs';

const CARD_ACTIONS = new Set(['create_library', 'edit_card', 'convert_library']);

export function proposalCards(pending, definition, { language = 'zh-CN', cardOf = () => null } = {}) {
  const lang = language === 'en' ? 'en' : 'zh';
  const out = [];
  for (const rec of Array.isArray(pending) ? pending : []) {
    const def = definition?.actions?.[rec?.action];
    if (!def || def.confirm !== true) continue;
    const card = {
      id: rec.id,
      action: rec.action,
      name: def.names?.[lang] ?? rec.action,
      at: rec.at,
      actor: rec.actor,
      params: rec.params,
      canConfirm: true,
      problems: [],
    };
    if (CARD_ACTIONS.has(rec.action)) {
      const c = checkCard(rec.params?.card, { reads: null });
      card.after = rec.params?.card ?? null;
      card.canConfirm = c.ok;
      card.problems = c.problems;
      if (rec.action !== 'create_library') card.before = cardOf(rec.params?.library) ?? null;
    }
    out.push(card);
  }
  return out;
}
