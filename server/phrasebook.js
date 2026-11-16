// The dashboard's own phrase books (client/src/lib/i18n.ru.js and
// i18n.uz.js — one file a language since round 19, loaded by the page on
// demand), read by the server for the few sentences it says outside the page:
// the bot passing on a refusal the API gave a button press. One book for
// both, so a sentence is translated once and reads the same in the window
// and in the chat.
//
// Read on demand, a sentence at a time, and never kept: a book is close to
// half a megabyte, and a refusal is rare. The deploy copies client/ with the
// rest of the code; a server without the file simply speaks English.
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const BOOK = (lang) => join(dirname(fileURLToPath(import.meta.url)), '..', 'client', 'src', 'lib', `i18n.${lang}.js`)

// A book is one `export default {` holding one `    "English": "Translation",`
// a line — the shape the round-74 gate keeps.
export function phraseIn(lang, english) {
  const key = String(english ?? '')
  if (!key || (lang !== 'ru' && lang !== 'uz')) return key
  let book
  try { book = readFileSync(BOOK(lang), 'utf8').replace(/\r\n/g, '\n') } catch { return key }
  const at = book.indexOf(`\n    ${JSON.stringify(key)}: `)
  if (at < 0) return key
  const line = book.slice(at + 1, book.indexOf('\n', at + 1))
  const value = line.slice(line.indexOf('": ') + 3).replace(/,\s*$/, '')
  try { return JSON.parse(value) } catch { return key }
}
