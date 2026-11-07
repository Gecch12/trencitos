"use strict";
const { Profanity } = require('@2toad/profanity');

// A local vocabulary filter, not a judgement of intent. Keep whole words and
// Unicode boundaries: city names and ordinary words must not match substrings.
const filter = new Profanity({ languages: ['es', 'en'], wholeWord: true, unicodeWordBoundaries: true });
filter.addWords(['imbecil', 'imbécil', 'idiota', 'idiotas', 'estupido', 'estúpido', 'estupida', 'estúpida',
  'pendejo', 'pendeja', 'cabron', 'cabrón', 'mierda', 'gilipollas', 'conchetumare', 'ctm', 'hdp']);
// Some upstream lists include neutral anatomical/identity words. Identity alone
// is never an insult. Preserve the explicit compounds in the source dictionary.
filter.removeWords(['gay', 'lesbian', 'lesbiana', 'homosexual', 'negro', 'negra', 'black', 'sexo', 'sex']);
const substitutions = { '0':'o', '1':'i', '3':'e', '4':'a', '5':'s', '7':'t', '@':'a', '$':'s', '!':'i' };
function prohibited(text) {
  const normalized = text.normalize('NFKC').replace(/[\p{Cf}\p{Cc}]/gu, '').toLowerCase();
  const plain = normalized.normalize('NFD').replace(/\p{M}/gu, '');
  const decoded = plain.replace(/[013457@$!]/g, c => substitutions[c]);
  const variants = [normalized, plain, decoded, decoded.replace(/([a-z])\1{2,}/g, '$1')];
  // Join only sequences of isolated letters, not arbitrary words/sentences.
  for (const value of [...variants]) variants.push(value.replace(/\b(?:[a-z][\s._*-]+){2,}[a-z]\b/g, word => word.replace(/[^a-z]/g, '')));
  return variants.some(value => filter.exists(value));
}
module.exports = { prohibited };
