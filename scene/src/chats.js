// Little conversations Barry and Nom have every so often.
//
// Each line: [who, words, Barry's face, Nom's face]
//   who:   'B' (Barry) or 'N' (Nom). Words can be '' for a reaction with no bubble.
//   Barry: normal, happy, sleepy, wonder
//   Nom:   normal, happy, giggle, curious, wonder, groan, sleepy, o   (Nom always laughs at Barry's jokes)
// Optional:
//   when(c): only use this chat when it fits the moment. c has { hour, day (0 = Sunday), month, date, activeMin }
//   then:    an activity to do straight afterwards (e.g. 'stretch', 'refill')
// Keep every bubble short: about 30 characters, two lines at most.

const morning = (c) => c.hour >= 5 && c.hour < 10;
const arvo = (c) => c.hour >= 14 && c.hour < 17;
const evening = (c) => c.hour >= 18 && c.hour < 22;
const late = (c) => c.hour >= 22 || c.hour < 5;
const weekday = (c) => c.day >= 1 && c.day <= 5;
const busy = (c) => c.activeMin >= 50;            // you've been working for a while without a break
const festive = (c) => (c.month === 11) || (c.month === 0 && c.date <= 6);   // 1 Dec - 6 Jan
const xmasDay = (c) => c.month === 11 && c.date === 25;
const nye = (c) => c.month === 11 && c.date === 31;
const newYearsDay = (c) => c.month === 0 && c.date === 1;

export const CHATS = [
  // ---------------- Barry's dad jokes (Nom always laughs) ----------------
  { lines: [['B', 'Why did the coffee call the police?', 'normal', 'curious'], ['N', 'Why?', 'normal', 'curious'],
            ['B', 'It got mugged.', 'happy', 'normal'], ['N', 'Hahaha! Mugged!', 'happy', 'giggle']] },
  { lines: [['B', 'I only drink coffee on days ending in "y".', 'normal', 'normal'], ['N', '…that\'s every day.', 'normal', 'o'],
            ['B', 'Exactly.', 'happy', 'normal'], ['N', 'Hehehe!', 'happy', 'giggle']] },
  { lines: [['B', 'What do you call a bear with no teeth?', 'normal', 'curious'], ['N', 'Hmm?', 'normal', 'curious'],
            ['B', 'A gummy bear!', 'happy', 'normal'], ['N', 'Hehehe!', 'happy', 'giggle']] },
  { lines: [['B', 'I told Greg a crocodile joke.', 'normal', 'normal'], ['N', 'Did he laugh?', 'normal', 'curious'],
            ['B', 'No. Tough crowd. Very snappy.', 'happy', 'normal'], ['N', 'Snappy! Hahaha!', 'happy', 'giggle']] },
  { lines: [['B', 'How do you throw a party in space?', 'normal', 'curious'], ['N', 'Ooh! How?', 'normal', 'wonder'],
            ['B', 'You planet.', 'happy', 'normal'], ['N', 'Hehe! I love space.', 'happy', 'giggle']] },
  { lines: [['B', 'I\'ve bean thinking about decaf.', 'normal', 'normal'], ['N', 'And?', 'normal', 'curious'],
            ['B', 'Not my cup of tea.', 'happy', 'normal'], ['N', 'Hahaha! Bean!', 'happy', 'giggle']] },
  { lines: [['B', 'I\'m reading a book on anti-gravity.', 'normal', 'normal'], ['N', 'Is it good?', 'normal', 'curious'],
            ['B', 'I can\'t put it down!', 'happy', 'normal'], ['N', 'Hehehe!', 'happy', 'giggle']] },
  { lines: [['B', 'Why don\'t eggs tell jokes?', 'normal', 'curious'], ['N', 'Why?', 'normal', 'curious'],
            ['B', 'They\'d crack each other up.', 'happy', 'normal'], ['N', 'Hahaha! Like me!', 'happy', 'giggle']] },
  { lines: [['B', 'What do you call a sleepy dinosaur?', 'normal', 'curious'], ['N', 'What?', 'normal', 'curious'],
            ['B', 'A dino-snore.', 'happy', 'normal'], ['N', 'Hehehe! Zzz…', 'happy', 'giggle']] },
  { lines: [['B', 'Why are teddy bears never hungry?', 'normal', 'curious'], ['N', 'Why?', 'normal', 'curious'],
            ['B', 'They\'re always stuffed.', 'happy', 'normal'], ['N', 'Hahaha! Barry!', 'happy', 'giggle']] },
  { lines: [['B', 'What\'s an alien\'s favourite drink?', 'normal', 'curious'], ['N', 'Ooh, what?', 'normal', 'wonder'],
            ['B', 'Gravi-tea.', 'happy', 'normal'], ['N', 'Hehehe! Accurate.', 'happy', 'giggle']] },
  { lines: [['B', 'What do you call a lazy kangaroo?', 'normal', 'curious'], ['N', 'What?', 'normal', 'curious'],
            ['B', 'A pouch potato!', 'happy', 'normal'], ['N', 'Hahaha!', 'happy', 'giggle']] },
  { lines: [['B', 'I\'d tell you a coffee joke…', 'normal', 'curious'], ['N', '…but?', 'normal', 'curious'],
            ['B', 'It might be a latte to handle.', 'happy', 'normal'], ['N', 'Hehe! A latte!', 'happy', 'giggle']] },
  { lines: [['B', 'Why did the biscuit see a doctor?', 'normal', 'curious'], ['N', 'Why?', 'normal', 'curious'],
            ['B', 'It was feeling crumby.', 'happy', 'normal'], ['N', 'Hahaha!', 'happy', 'giggle']] },
  { lines: [['B', 'How does the moon cut its hair?', 'normal', 'curious'], ['N', 'How?', 'normal', 'curious'],
            ['B', 'Eclipse it.', 'happy', 'normal'], ['N', 'Hehehe! Eclipse!', 'happy', 'giggle']] },
  { lines: [['B', 'The Trash is my favourite app.', 'normal', 'o'], ['N', 'Why??', 'normal', 'o'],
            ['B', 'It\'s always rubbish. Reliable.', 'happy', 'normal'], ['N', 'Hahaha!', 'happy', 'giggle']] },
  { lines: [['B', 'Why did the scarecrow get an award?', 'normal', 'curious'], ['N', 'Why?', 'normal', 'curious'],
            ['B', 'Outstanding in his field.', 'happy', 'normal'], ['N', 'Hehehe!', 'happy', 'giggle']] },

  // ---------------- Nom's big questions ----------------
  { lines: [['N', 'Barry… where do Zzzs go?', 'normal', 'wonder'], ['B', 'To the Zzz bank. For later.', 'sleepy', 'curious'],
            ['N', 'Smart.', 'happy', 'happy']] },
  { lines: [['N', 'If the universe is expanding…', 'normal', 'wonder'], ['N', '…is my mug getting bigger?', 'normal', 'curious'],
            ['B', 'Only if you believe.', 'happy', 'happy']] },
  { lines: [['N', 'Do stars drink coffee?', 'normal', 'wonder'], ['B', 'That\'s how they stay up all night.', 'happy', 'o'],
            ['N', 'Ohhh.', 'happy', 'o']] },
  { lines: [['N', 'What\'s at the end of the Dock?', 'normal', 'wonder'], ['B', 'The Trash. Don\'t go there.', 'normal', 'o'],
            ['N', 'Noted.', 'normal', 'normal']] },
  { lines: [['N', 'Do you think Greg dreams?', 'normal', 'wonder'], ['B', 'Of very small fish, probably.', 'happy', 'happy'],
            ['N', 'Awww.', 'happy', 'happy']] },
  { lines: [['N', 'Barry, are we inside a computer?', 'normal', 'wonder'], ['B', '…we\'re ON one.', 'wonder', 'o'],
            ['N', 'Whoa.', 'normal', 'o']] },
  { lines: [['N', 'If I\'m an alien here…', 'normal', 'wonder'], ['N', 'are you an alien on my planet?', 'wonder', 'curious'],
            ['B', 'A very cuddly one.', 'happy', 'giggle']] },
  { lines: [['N', 'How many stars are there?', 'normal', 'wonder'], ['B', 'More than all the sand on all the beaches.', 'wonder', 'o'],
            ['N', 'That\'s a lot of sand.', 'normal', 'o']] },
  { lines: [['N', 'Why is coffee better with a friend?', 'normal', 'wonder'], ['B', 'Science can\'t explain it.', 'happy', 'happy'],
            ['N', '', 'happy', 'happy']] },
  { lines: [['N', 'What came first, the mug or the coffee?', 'normal', 'wonder'], ['B', 'Deep. Very deep.', 'wonder', 'normal'],
            ['N', 'Like my thoughts.', 'happy', 'happy']] },
  { lines: [['N', 'Is a hot dog a sandwich?', 'normal', 'curious'], ['B', 'We don\'t talk about that.', 'sleepy', 'o'],
            ['N', '…fair.', 'normal', 'normal']] },
  { lines: [['N', 'Do clouds get tired of floating?', 'normal', 'wonder'], ['B', 'That\'s why it rains. They sit down.', 'happy', 'o'],
            ['N', 'Ohhh.', 'happy', 'happy']] },
  { lines: [['N', 'I counted to infinity once.', 'normal', 'happy'], ['B', 'Really?', 'wonder', 'happy'],
            ['N', 'Twice, actually.', 'happy', 'giggle']] },
  { lines: [['N', 'Does the moon know we\'re looking?', 'normal', 'wonder'], ['B', 'It waves every night.', 'happy', 'curious'],
            ['N', '', 'happy', 'happy']] },
  { lines: [['N', 'Barry, what\'s the meaning of life?', 'normal', 'wonder'], ['B', 'Good coffee and good company.', 'happy', 'curious'],
            ['N', 'And Greg.', 'happy', 'happy'], ['B', 'And Greg.', 'happy', 'happy']] },

  // ---------------- little check-ins with you ----------------
  { when: busy, then: 'stretch',
    lines: [['N', 'Psst… they\'ve been at it a while.', 'normal', 'curious'], ['B', 'Stretch break, everyone!', 'happy', 'happy']] },
  { when: busy,
    lines: [['B', 'Remember to drink some water!', 'normal', 'normal'], ['N', '…and coffee.', 'normal', 'happy'],
            ['B', 'Water first.', 'happy', 'groan']] },
  { when: busy,
    lines: [['N', 'Your eyes might like a little rest.', 'normal', 'curious'], ['B', 'Look out a window for a bit?', 'happy', 'happy']] },
  { lines: [['B', 'You\'re doing great, by the way.', 'happy', 'normal'], ['N', 'The best!', 'happy', 'giggle']] },
  { lines: [['N', 'Shoulders down… deep breath.', 'normal', 'sleepy'], ['B', 'Ahhh. Better.', 'sleepy', 'happy']] },
  { when: weekday,
    lines: [['N', 'We believe in you!', 'normal', 'happy'], ['B', 'Even on Mondays.', 'happy', 'giggle']] },
  { when: (c) => busy(c) && c.hour >= 11 && c.hour < 14, then: 'refill',
    lines: [['B', 'Long morning. Top-up time?', 'normal', 'curious'], ['N', 'On it!', 'normal', 'happy']] },

  // ---------------- time and day ----------------
  { when: morning, lines: [['B', 'Morning! First coffee of the day.', 'happy', 'normal'], ['N', 'The best one.', 'happy', 'happy']] },
  { when: morning, lines: [['N', 'Good morning, sunshine!', 'normal', 'giggle'], ['B', 'Too early for sunshine.', 'sleepy', 'giggle']] },
  { when: (c) => c.day === 1, lines: [['B', 'Monday again.', 'sleepy', 'normal'], ['N', 'Mondays need extra coffee.', 'sleepy', 'curious'],
                                        ['B', 'Agreed.', 'happy', 'happy']] },
  { when: (c) => c.day === 3, lines: [['N', 'Is it Wednesday?', 'normal', 'curious'], ['B', 'Halfway there!', 'happy', 'giggle']] },
  { when: (c) => c.day === 5, lines: [['N', 'It\'s Friday!!', 'normal', 'giggle'], ['B', 'Weekend mode: loading…', 'happy', 'giggle']] },
  { when: (c) => c.day === 5 && c.hour >= 15, lines: [['B', 'Is it the weekend yet?', 'normal', 'curious'], ['N', 'Almost!!', 'happy', 'giggle']] },
  { when: (c) => c.day === 0 || c.day === 6, lines: [['N', 'Why are we up on the weekend?', 'normal', 'curious'],
                                                     ['B', 'We\'re not working. Just vibing.', 'happy', 'happy']] },
  { when: arvo, lines: [['B', 'Ah, the 3 o\'clock slump.', 'sleepy', 'normal'], ['N', 'Coffee to the rescue!', 'sleepy', 'giggle']] },
  { when: evening, lines: [['N', 'The sky\'s going all orange.', 'normal', 'wonder'], ['B', 'Best time of the day.', 'happy', 'happy']] },
  { when: evening, lines: [['B', 'Long day, hey?', 'sleepy', 'normal'], ['N', 'A good one though.', 'happy', 'happy']] },
  { when: late, lines: [['B', 'Shouldn\'t we all be asleep?', 'sleepy', 'normal'], ['N', 'Five more minutes…', 'sleepy', 'sleepy']] },
  { when: late, lines: [['N', 'It\'s very late…', 'normal', 'sleepy'], ['B', 'Bed soon? We\'ll keep watch.', 'happy', 'sleepy']] },
  // ---------------- weather (from the app) ----------------
  { when: (c) => c.rain, lines: [['N', 'Is the sky… leaking?', 'normal', 'wonder'], ['B', 'It\'s rain. Perfect cocoa weather.', 'happy', 'happy']] },
  { when: (c) => c.rain, lines: [['B', 'Hear that rain?', 'normal', 'normal'], ['N', 'Cosy.', 'happy', 'happy']] },
  { when: (c) => c.hot, lines: [['B', 'Phew. It\'s a scorcher.', 'sleepy', 'normal'], ['N', 'Iced coffee?', 'normal', 'giggle'],
                                 ['B', 'Now you\'re talking.', 'happy', 'happy']] },
  { when: (c) => c.hot, lines: [['N', 'Do I look cool in these?', 'normal', 'happy'], ['B', 'Coolest alien on the Dock.', 'happy', 'giggle']] },
  { when: (c) => c.cold, lines: [['N', 'Brrr… it\'s chilly.', 'normal', 'sleepy'], ['B', 'Good thing we\'re fluffy.', 'happy', 'giggle']] },

  // ---------------- the festive season ----------------
  { when: festive, lines: [['N', 'Is it nearly Christmas?', 'normal', 'giggle'], ['B', 'Only a few more sleeps!', 'happy', 'giggle']] },
  { when: festive, lines: [['B', 'Santa hats in summer.', 'happy', 'normal'], ['N', 'The Aussie way!', 'normal', 'giggle']] },
  { when: festive, lines: [['N', 'What should I get Greg?', 'normal', 'wonder'], ['B', 'A tiny Santa hat?', 'happy', 'happy'],
                           ['N', 'PERFECT.', 'happy', 'giggle']] },
  { when: festive, lines: [['B', 'Why does Santa have a garden?', 'normal', 'curious'], ['N', 'Why?', 'normal', 'curious'],
                           ['B', 'He loves to hoe, hoe, hoe!', 'happy', 'normal'], ['N', 'Hahaha!', 'happy', 'giggle']] },
  { when: festive, lines: [['B', 'What do snowmen eat for brekkie?', 'normal', 'curious'], ['N', 'What?', 'normal', 'curious'],
                           ['B', 'Frosted flakes.', 'happy', 'normal'], ['N', 'Hehehe!', 'happy', 'giggle']] },
  { when: festive, lines: [['N', 'Look at the tree lights!', 'normal', 'wonder'], ['B', 'Twinkly.', 'happy', 'happy']] },
  { when: xmasDay, lines: [['N', 'Merry Christmas, Barry!', 'normal', 'giggle'], ['B', 'Merry Christmas, Nom!', 'happy', 'happy']] },
  { when: nye, lines: [['B', 'Any New Year\'s resolutions?', 'normal', 'curious'], ['N', 'More coffee.', 'normal', 'happy'],
                       ['B', 'Excellent plan.', 'happy', 'giggle']] },
  { when: newYearsDay, lines: [['N', 'Happy New Year!', 'normal', 'giggle'], ['B', 'Same coffee, brand new year.', 'happy', 'happy']] },

  { when: (c) => c.month === 9 && c.date >= 24, lines: [['N', 'What are you meant to be?', 'normal', 'curious'], ['B', 'I vant to drink your… coffee.', 'happy', 'o'],
                                                       ['N', 'Hahaha! Scary!', 'happy', 'giggle']] },
  { when: (c) => c.month === 9 && c.date >= 24, lines: [['B', 'Nice wings, Nom.', 'happy', 'normal'], ['N', 'I\'m your bat. Flap flap.', 'normal', 'happy']] },
  { when: (c) => c.month === 9 && c.date >= 24, lines: [['N', 'Barry… the pumpkin is looking at me.', 'normal', 'o'],
                                                        ['B', 'It\'s friendly. Mostly.', 'happy', 'o']] },
];

// Little surprises, once in a while. `fx` makes them move to match.
export const SURPRISES = [
  { fx: 'hiccup', lines: [['N', 'hic!', 'normal', 'o'], ['N', 'hic!', 'curious', 'o'], ['B', 'Hold your breath!', 'normal', 'curious'],
                          ['N', '', 'normal', 'sleepy'], ['N', '…hic!', 'happy', 'o'], ['B', 'Ah well.', 'happy', 'giggle']] },
  { fx: 'sneeze', lines: [['N', 'Ah… ah…', 'normal', 'o'], ['N', 'ACHOO!', 'normal', 'sleepy'], ['B', 'Bless you!', 'happy', 'normal'],
                          ['N', 'Thank you.', 'happy', 'happy']] },
  { fx: 'search', then: 'croc', lines: [['N', 'Where\'s Greg?!', 'normal', 'curious'], ['B', 'Behind you.', 'happy', 'curious'],
                                       ['N', 'GREG!', 'happy', 'giggle']] },
];
