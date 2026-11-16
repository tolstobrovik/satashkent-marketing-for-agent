// The words the Telegram bot says, in the reader's own language.
//
// Only the messages that survive the diet (see TG_KINDS in telegram.js), the
// buttons under them and the questions those buttons ask are here, and only
// their fixed words: titles, names and notes are the people's
// own and pass through tgEsc where they are joined in. The language is the
// one the person last chose in the dashboard (users.lang); nobody chose, or a
// language not listed here, reads English.
//
// Uzbek writes oʻ and gʻ with U+02BB, as the brand book asks everywhere.
const W = {
  en: {
    open: 'Open the task ↗',
    pravka: (t) => `📝 Pravka requested on: ${t}`,
    ready: (t) => `✅ Work ready for review: ${t}`,
    late: (t) => `🚨 LATE: ${t}`,
    footage: (t) => `🎞 Footage delivered: ${t}`,
    watch: 'Watch it',
    by: (name) => `by ${name}`,
    delivery: (n, of) => `Delivery ${n} of ${of}`,
    oneLeft: 'one pravka left',
    limit: (n, of) => `🔒 Delivery ${n}${n <= of ? ` of ${of}` : ''} — the pravka limit is reached, so it is approved as it stands.`,
    lastPravka: 'This is the last pravka — the next delivery is approved as it stands.',
    override: (name) => `Pushed past the pravka limit by ${name} (admin override).`,
    lateLine: (what, n) => `${what} is ${n} days late.`,
    what: { shoot: 'The shoot', edit: 'The edit', design: 'The artwork', release: 'The release' },
    footageNext: 'It is yours to edit.',
    footageHeld: 'It is waiting for you: add what editing needs (the TZ, who edits) and send it on.',
    btn: { accept: '✅ Accept', pravka: '📝 Pravka', yes: '✅ Yes, I can', no: '❌ I can’t' },
    askPravka: (t) => `${t}
📝 What should be fixed? Reply with text or a voice message.`,
    askNo: (t) => `${t}
What is in the way? Reply in a few words — the owner plans around it.`,
    hintPravka: 'What to fix…',
    hintNo: 'What is in the way…',
    sentPravka: '📝 Pravka sent.',
    accepted: '✅ Accepted.',
    saidYes: '✅ You said yes.',
    saidNo: 'Sent: you can’t make it.',
    voice: '🎤 Voice pravka — listen',
    voiceNo: '🎤 Voice answer — listen',
    stale: 'That question is no longer open — press the button under the task again.',
    failed: (why) => `Couldn’t do it from here: ${why}`,
    notLinked: 'This chat is not connected to the dashboard.',
    morning: (n) => `☀️ Good morning. While you slept (${n}):`,
    more: (n) => `…and ${n} more in the dashboard.`,
    // The four kinds' own messages. English is word for word what the bot
    // said before it spoke three languages, so the suites still read it.
    role: { owner: 'owner', operator: 'operator', editor: 'editor', designer: 'designer', reviewer: 'reviewer', and: ' & ' },
    newWork: (role, t, extra, from) => `📌 New work for you — you're the ${role}\n${t}${extra}\nFrom ${from}. Have a look and plan it in 👇`,
    at: { shoot: (d) => ` · shoot ${d}`, release: (d) => ` · release ${d}`, editDue: (d) => ` · edit due ${d}` },
    booking: { shoot: 'the shoot', edit: 'the edit deadline' },
    askBooking: (t, what, slot) => `🗓 ${t}\nCan you make ${what} on ${slot}?`,
    answer: {
      yes: (name, what, slot) => `${name} confirmed ${what} — ${slot}`,
      back: (name, what, slot, role, note) => `${name} handed back ${what} (${slot}) — it needs a new ${role} — “${note}”`,
      other: (name, what, slot, day, note) => `${name} can't make ${what} (${slot}) and asks for ${day} — “${note}”\nSay yes or no on the task 👇`,
      no: (name, what, slot, note) => `${name} can't make ${what} (${slot}) — “${note}”`,
    },
    mention: (name, t, said) => `💬 ${name} wrote on ${t}\n“${said}”\nAnswer where the task lives 👇`,
    voiceNote: (secs) => `🎤 a ${secs}s voice note`,
    roundNote: (n, t, name, said) => `📝 Round ${n} on ${t}\n${name}: “${said}”\nAnswer under the round 👇`,
    flag: {
      cant_take: (name, t, why) => `🙅 <b>${name}</b> cannot take this on\n${t}\n“${why}”\nSort it while there is still time 👇`,
      at_risk: (name, t, why) => `⏳ <b>${name}</b> says this will be late\n${t}\n“${why}”\nSort it while there is still time 👇`,
    },
    // The bot's own words about the link itself.
    connected: (name) => `Connected, ${name}! Dashboard notifications now land here too. Send /stop to turn them off.`,
    disconnected: 'Disconnected. Profile → Telegram → Connect brings it back.',
    adminUnlinked: 'The admin disconnected this chat from the dashboard. Profile → Telegram → Connect brings it back.',
    howToConnect: 'Open Profile → Telegram in the dashboard and press Connect — that button brings you here with the right code.',
    intro: 'I bring Satashkent dashboard notifications to your Telegram.\n\nTo connect: open the dashboard → Profile → Telegram → Connect. That button brings you back here with the right code.',
    works: '👋 The bridge works — this is your dashboard talking.',
    openDay: 'Open your day ↗',
    // The bot's profile in Telegram (setMyDescription, setMyCommands).
    about: 'The SATashkent marketing platform in your pocket: only what you have to act on — new work or a booking, a pravka, work to review, an @-mention. Accept, send a pravka or answer a booking right from the chat. Connect from Profile → Telegram.',
    aboutShort: 'Only what you have to act on, from the SATashkent platform.',
    commands: { help: 'What I send, and what my buttons do', stop: 'Turn these messages off' },
    listHead: (t, n) => `☑ What to fix — ${t}, round ${n}:`,
    listFoot: '✨ Gemini wrote this list from the pravka. Tick each change as you make it.',
    listDone: '✅ All done — hand the fix in on the task.',
    // Jarvis (jarvis.js): its alerts, and what it says while it thinks.
    jarvis: {
      head: (n) => `✨ Jarvis — ${n === 1 ? 'one thing needs you' : `${n} things need you`}:`,
      loop: (t, n, who) => `🔁 ${t} is on pravka round ${n} — the last one: the next delivery goes out as it stands${who ? `. Fixing it: ${who}` : ''}. Worth a word with them now, while it can still be put right.`,
      late: (who, n, titles, worst) => `⏰ ${who} holds ${n} late steps (the worst ${worst} days): ${titles}. Ask what is in the way, or hand some to somebody else.`,
      ux: (t) => `🧭 ${t}`,
      repeat: (issue, times, ch, rule) => `🔂 The same change keeps coming back: ${issue} — ${times} times${ch ? ` on ${ch}` : ''}. Add to the brief: ${rule}`,
      foot: 'Ask me about any of it — just write (or say) it here.',
      thinking: '✨ Looking at the board…',
      noKey: 'Jarvis wakes up when the Gemini key is set (GEMINI_API_KEY).',
      failed: (why) => `Jarvis could not answer just now: ${why}`,
    },
    help: (name) => `Hello, ${name}! I bring only what you have to act on: new work or a booking 📌, a pravka on your work 📝, work ready for your review ✅ — and when somebody names you with @ 💬.

The buttons under my messages work right here: accept, send a pravka (text or voice), answer a booking.

Quiet from 23:00 to 08:00: the night’s news comes in one message at 8.
/stop turns these messages off.`,
  },
  ru: {
    open: 'Открыть задачу ↗',
    pravka: (t) => `📝 Новая правка: ${t}`,
    ready: (t) => `✅ Работа готова к проверке: ${t}`,
    late: (t) => `🚨 ПРОСРОЧЕНО: ${t}`,
    footage: (t) => `🎞 Исходники сданы: ${t}`,
    watch: 'Смотреть',
    by: (name) => `сдал(а) ${name}`,
    delivery: (n, of) => `Сдача ${n} из ${of}`,
    oneLeft: 'осталась одна правка',
    limit: (n, of) => `🔒 Сдача ${n}${n <= of ? ` из ${of}` : ''} — лимит правок исчерпан, работа утверждена как есть.`,
    lastPravka: 'Это последняя правка — следующая сдача будет утверждена как есть.',
    override: (name) => `${name} добавил(а) правку сверх лимита (исключение админа).`,
    lateLine: (what, n) => `${what}: опоздание ${n} дн.`,
    what: { shoot: 'Съёмка', edit: 'Монтаж', design: 'Дизайн', release: 'Релиз' },
    footageNext: 'Можно монтировать.',
    footageHeld: 'Ждёт вас: добавьте, что нужно для монтажа (ТЗ, кто монтирует), и отправьте дальше.',
    btn: { accept: '✅ Принять', pravka: '📝 Правка', yes: '✅ Да, смогу', no: '❌ Не смогу' },
    askPravka: (t) => `${t}
📝 Что исправить? Ответьте текстом или голосовым сообщением.`,
    askNo: (t) => `${t}
Что мешает? Ответьте парой слов — по ним перепланируют.`,
    hintPravka: 'Что исправить…',
    hintNo: 'Что мешает…',
    sentPravka: '📝 Правка отправлена.',
    accepted: '✅ Принято.',
    saidYes: '✅ Вы подтвердили.',
    saidNo: 'Отправлено: вы не сможете.',
    voice: '🎤 Голосовая правка — слушать',
    voiceNo: '🎤 Голосовой ответ — слушать',
    stale: 'Этот вопрос уже закрыт — нажмите кнопку под задачей ещё раз.',
    failed: (why) => `Не получилось отсюда: ${why}`,
    notLinked: 'Этот чат не подключён к платформе.',
    morning: (n) => `☀️ Доброе утро. Пока вы спали (${n}):`,
    more: (n) => `…и ещё ${n} — на платформе.`,
    role: { owner: 'владелец', operator: 'оператор', editor: 'монтажёр', designer: 'дизайнер', reviewer: 'проверяющий', and: ' и ' },
    newWork: (role, t, extra, from) => `📌 Новая работа для вас: ${role}\n${t}${extra}\nОт кого: ${from}. Посмотрите и запланируйте 👇`,
    at: { shoot: (d) => ` · съёмка ${d}`, release: (d) => ` · выход ${d}`, editDue: (d) => ` · монтаж до ${d}` },
    booking: { shoot: 'съёмка', edit: 'срок монтажа' },
    askBooking: (t, what, slot) => `🗓 ${t}\nСможете? ${what[0].toUpperCase()}${what.slice(1)} — ${slot}`,
    answer: {
      yes: (name, what, slot) => `Подтверждено — ${what}, ${slot}: ${name}`,
      back: (name, what, slot, role, note) => `Отказ — ${what}, ${slot}. Нужен другой ${role}. ${name}: “${note}”`,
      other: (name, what, slot, day, note) => `Не получается — ${what}, ${slot}. Другое время: ${day}. ${name}: “${note}”\nОтветьте да или нет в задаче 👇`,
      no: (name, what, slot, note) => `Не получается — ${what}, ${slot}. ${name}: “${note}”`,
    },
    mention: (name, t, said) => `💬 ${t}\n${name}: “${said}”\nОтветьте в задаче 👇`,
    voiceNote: (secs) => `🎤 голосовое, ${secs} с`,
    roundNote: (n, t, name, said) => `📝 Правка, круг ${n}: ${t}\n${name}: “${said}”\nОтветьте под правкой 👇`,
    flag: {
      cant_take: (name, t, why) => `🙅 ${t}\nНе может взять: <b>${name}</b>\n“${why}”\nРешите, пока есть время 👇`,
      at_risk: (name, t, why) => `⏳ ${t}\nБудет опоздание: <b>${name}</b>\n“${why}”\nРешите, пока есть время 👇`,
    },
    connected: (name) => `Подключено, ${name}! Уведомления платформы теперь приходят и сюда. /stop — отключить.`,
    disconnected: 'Отключено. Профиль → Telegram → «Подключить Telegram» — вернуть.',
    adminUnlinked: 'Админ отключил этот чат от платформы. Профиль → Telegram → «Подключить Telegram» — вернуть.',
    howToConnect: 'Откройте на платформе Профиль → Telegram и нажмите «Подключить Telegram» — кнопка приведёт сюда с нужным кодом.',
    intro: 'Я приношу уведомления платформы Satashkent в ваш Telegram.\n\nЧтобы подключиться: платформа → Профиль → Telegram → «Подключить Telegram». Кнопка вернёт вас сюда с нужным кодом.',
    works: '👋 Связь работает — это пишет ваша платформа.',
    openDay: 'Открыть мой день ↗',
    about: 'Маркетинговая платформа SATashkent у вас в кармане: только то, что нужно сделать вам — новая работа или бронь, правка, работа на проверку, упоминание через @. Принимайте, отправляйте правки и отвечайте на брони прямо в чате. Подключение: Профиль → Telegram.',
    aboutShort: 'Только то, что нужно сделать вам, — с платформы SATashkent.',
    commands: { help: 'Что я присылаю и что делают кнопки', stop: 'Отключить эти сообщения' },
    listHead: (t, n) => `☑ Что исправить — ${t}, круг ${n}:`,
    listFoot: '✨ Gemini составил список по правке. Отмечайте каждое исправление.',
    listDone: '✅ Всё готово — сдайте исправление в задаче.',
    jarvis: {
      head: (n) => `✨ Jarvis — нужно ваше внимание${n === 1 ? '' : ` (${n})`}:`,
      loop: (t, n, who) => `🔁 ${t} — ${n}-й круг правок, последний: следующая сдача будет утверждена как есть${who ? `. Исправляет: ${who}` : ''}. Стоит поговорить сейчас, пока это ещё можно исправить.`,
      late: (who, n, titles, worst) => `⏰ Просроченных шагов: ${n} (до ${worst} дн.) — ${titles}. Ответственный: ${who}. Узнайте, что мешает, или передайте часть другому.`,
      ux: (t) => `🧭 ${t}`,
      repeat: (issue, times, ch, rule) => `🔂 Одна и та же правка повторяется: ${issue} — ${times} раз${ch ? ` (${ch})` : ''}. Добавьте в ТЗ: ${rule}`,
      foot: 'Спросите меня о любом пункте — просто напишите (или скажите) здесь.',
      thinking: '✨ Смотрю на доску…',
      noKey: 'Jarvis проснётся, когда будет задан ключ Gemini (GEMINI_API_KEY).',
      failed: (why) => `Jarvis сейчас не смог ответить: ${why}`,
    },
    help: (name) => `Здравствуйте, ${name}! Я приношу только то, что нужно сделать вам: новая работа или бронь съёмки 📌, правка по вашей работе 📝, работа на вашу проверку ✅ — и когда вас отмечают через @ 💬.

Кнопки под сообщениями работают прямо здесь: принять, отправить правку (текстом или голосом), ответить на бронь.

С 23:00 до 08:00 тишина: ночные новости придут одним сообщением в 8.
/stop отключает эти сообщения.`,
  },
  uz: {
    open: 'Vazifani ochish ↗',
    pravka: (t) => `📝 Tahrir soʻraldi: ${t}`,
    ready: (t) => `✅ Ish tekshirish uchun tayyor: ${t}`,
    late: (t) => `🚨 KECHIKDI: ${t}`,
    footage: (t) => `🎞 Material topshirildi: ${t}`,
    watch: 'Koʻrish',
    by: (name) => `${name} topshirdi`,
    delivery: (n, of) => `Topshirish ${n}/${of}`,
    oneLeft: 'bitta tahrir qoldi',
    limit: (n, of) => `🔒 Topshirish ${n}${n <= of ? `/${of}` : ''} — tahrir limiti tugadi, ish oʻz holicha tasdiqlandi.`,
    lastPravka: 'Bu oxirgi tahrir — keyingi topshiriq oʻz holicha tasdiqlanadi.',
    override: (name) => `${name} limitdan ortiq tahrir qoʻshdi (admin istisnosi).`,
    lateLine: (what, n) => `${what}: ${n} kun kechikdi.`,
    what: { shoot: 'Suratga olish', edit: 'Montaj', design: 'Dizayn', release: 'Chiqish' },
    footageNext: 'Montajga tayyor.',
    footageHeld: 'Sizni kutmoqda: montaj uchun kerakli narsalarni (TZ, kim montaj qiladi) qoʻshing va keyingi bosqichga yuboring.',
    btn: { accept: '✅ Qabul qilish', pravka: '📝 Tahrir', yes: '✅ Ha, qila olaman', no: '❌ Qila olmayman' },
    askPravka: (t) => `${t}
📝 Nimani tuzatish kerak? Matn yoki ovozli xabar bilan javob bering.`,
    askNo: (t) => `${t}
Nima xalaqit qilyapti? Bir-ikki soʻz bilan javob bering — shunga qarab qayta rejalashtiriladi.`,
    hintPravka: 'Nimani tuzatish…',
    hintNo: 'Nima xalaqit…',
    sentPravka: '📝 Tahrir yuborildi.',
    accepted: '✅ Qabul qilindi.',
    saidYes: '✅ Tasdiqladingiz.',
    saidNo: 'Yuborildi: qila olmaysiz.',
    voice: '🎤 Ovozli tahrir — tinglash',
    voiceNo: '🎤 Ovozli javob — tinglash',
    stale: 'Bu savol endi yopiq — vazifa ostidagi tugmani qayta bosing.',
    failed: (why) => `Bu yerdan boʻlmadi: ${why}`,
    notLinked: 'Bu chat platformaga ulanmagan.',
    morning: (n) => `☀️ Xayrli tong. Siz uxlaganingizda (${n}):`,
    more: (n) => `…yana ${n} ta — platformada.`,
    role: { owner: 'egasi', operator: 'operator', editor: 'montajchi', designer: 'dizayner', reviewer: 'tekshiruvchi', and: ' va ' },
    newWork: (role, t, extra, from) => `📌 Siz uchun yangi ish: ${role}\n${t}${extra}\nKimdan: ${from}. Koʻrib chiqing va rejalashtiring 👇`,
    at: { shoot: (d) => ` · suratga olish ${d}`, release: (d) => ` · chiqish ${d}`, editDue: (d) => ` · montaj ${d} gacha` },
    booking: { shoot: 'suratga olish', edit: 'montaj muddati' },
    askBooking: (t, what, slot) => `🗓 ${t}\nQila olasizmi? ${what[0].toUpperCase()}${what.slice(1)} — ${slot}`,
    answer: {
      yes: (name, what, slot) => `Tasdiqlandi — ${what}, ${slot}: ${name}`,
      back: (name, what, slot, role, note) => `Voz kechildi — ${what}, ${slot}. Boshqa ${role} kerak. ${name}: “${note}”`,
      other: (name, what, slot, day, note) => `Imkoni yoʻq — ${what}, ${slot}. Boshqa vaqt: ${day}. ${name}: “${note}”\nVazifada ha yoki yoʻq deb javob bering 👇`,
      no: (name, what, slot, note) => `Imkoni yoʻq — ${what}, ${slot}. ${name}: “${note}”`,
    },
    mention: (name, t, said) => `💬 ${t}\n${name}: “${said}”\nVazifada javob bering 👇`,
    voiceNote: (secs) => `🎤 ovozli xabar, ${secs} s`,
    roundNote: (n, t, name, said) => `📝 Tahrir, ${n}-bosqich: ${t}\n${name}: “${said}”\nTahrir ostida javob bering 👇`,
    flag: {
      cant_take: (name, t, why) => `🙅 ${t}\nOla olmaydi: <b>${name}</b>\n“${why}”\nVaqt borida hal qiling 👇`,
      at_risk: (name, t, why) => `⏳ ${t}\nKechikadi: <b>${name}</b>\n“${why}”\nVaqt borida hal qiling 👇`,
    },
    connected: (name) => `Ulandi, ${name}! Platforma bildirishnomalari endi bu yerga ham keladi. /stop — oʻchirish.`,
    disconnected: 'Uzildi. Profil → Telegram → «Telegramni ulash» — qaytarish.',
    adminUnlinked: 'Admin bu chatni platformadan uzdi. Profil → Telegram → «Telegramni ulash» — qaytarish.',
    howToConnect: 'Platformada Profil → Telegram ni oching va «Telegramni ulash» tugmasini bosing — u sizni toʻgʻri kod bilan shu yerga olib keladi.',
    intro: 'Men Satashkent platformasi bildirishnomalarini Telegramingizga olib kelaman.\n\nUlanish uchun: platforma → Profil → Telegram → «Telegramni ulash». Tugma sizni toʻgʻri kod bilan shu yerga qaytaradi.',
    works: '👋 Aloqa ishlayapti — bu platformangiz yozmoqda.',
    openDay: 'Kunimni ochish ↗',
    about: 'SATashkent marketing platformasi choʻntagingizda: faqat siz bajarishingiz kerak boʻlgan narsalar — yangi ish yoki band, tahrir, tekshiruvga ish, @ bilan belgilash. Qabul qiling, tahrir yuboring va bandlarga javob bering — toʻgʻridan-toʻgʻri chatda. Ulanish: Profil → Telegram.',
    aboutShort: 'Faqat siz bajarishingiz kerak boʻlgan ishlar — SATashkent platformasidan.',
    commands: { help: 'Nima yuboraman va tugmalar nima qiladi', stop: 'Bu xabarlarni oʻchirish' },
    listHead: (t, n) => `☑ Nimani tuzatish kerak — ${t}, ${n}-bosqich:`,
    listFoot: '✨ Gemini roʻyxatni tahrir asosida tuzdi. Har bir tuzatishni belgilang.',
    listDone: '✅ Hammasi tayyor — tuzatishni vazifada topshiring.',
    jarvis: {
      head: (n) => `✨ Jarvis — eʼtiboringiz kerak${n === 1 ? '' : ` (${n})`}:`,
      loop: (t, n, who) => `🔁 ${t} — ${n}-tahrir bosqichi, oxirgisi: keyingi topshiriq oʻz holicha tasdiqlanadi${who ? `. Tuzatmoqda: ${who}` : ''}. Hali tuzatish mumkinligida hozir gaplashib oling.`,
      late: (who, n, titles, worst) => `⏰ Kechikkan qadamlar: ${n} (eng koʻpi ${worst} kun) — ${titles}. Masʼul: ${who}. Nima xalaqit qilayotganini soʻrang yoki bir qismini boshqasiga bering.`,
      ux: (t) => `🧭 ${t}`,
      repeat: (issue, times, ch, rule) => `🔂 Bir xil tahrir takrorlanmoqda: ${issue} — ${times} marta${ch ? ` (${ch})` : ''}. TZga qoʻshing: ${rule}`,
      foot: 'Istalgan band haqida soʻrang — shu yerga yozing (yoki ayting).',
      thinking: '✨ Doskani koʻrib chiqyapman…',
      noKey: 'Jarvis Gemini kaliti (GEMINI_API_KEY) oʻrnatilganda uygʻonadi.',
      failed: (why) => `Jarvis hozir javob bera olmadi: ${why}`,
    },
    help: (name) => `Salom, ${name}! Men faqat siz bajarishingiz kerak boʻlgan narsalarni olib kelaman: yangi ish yoki suratga olish bandi 📌, ishingizga tahrir 📝, tekshirishingiz uchun tayyor ish ✅ — va kimdir sizni @ bilan belgilasa 💬.

Xabarlarim ostidagi tugmalar shu yerning oʻzida ishlaydi: qabul qilish, tahrir yuborish (matn yoki ovoz), bandga javob berish.

23:00 dan 08:00 gacha jimlik: tungi yangiliklar soat 8 da bitta xabarda keladi.
/stop bu xabarlarni oʻchiradi.`,
  },
}

export const tgWords = (lang) => W[lang] || W.en
export const TG_LANGS = Object.keys(W)

// A person's hats in their words: "owner & editor" → "владелец и монтажёр".
export const tgRole = (lang, roles) => {
  const w = tgWords(lang)
  return String(roles || '').split(' & ').map((r) => w.role[r] || r).join(w.role.and)
}

// The language Telegram says a chat's person reads, for whoever has not
// connected yet and so has no language chosen in the dashboard.
export const tgLangOf = (code) => {
  const c = String(code || '').toLowerCase()
  return TG_LANGS.find((l) => c === l || c.startsWith(`${l}-`)) || 'en'
}
