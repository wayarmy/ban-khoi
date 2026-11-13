// Vietnamese words the child can build from letter cards.
// letters = cards needed (base letters of the Vietnamese alphabet, tone marks are shown on the finished board).
export const WORDS = [
  { id: 'bo',    text: 'BỐ',    say: 'bố',    emoji: '👨', letters: ['B', 'Ô'] },
  { id: 'me',    text: 'MẸ',    say: 'mẹ',    emoji: '👩', letters: ['M', 'E'] },
  { id: 'ba',    text: 'BÀ',    say: 'bà',    emoji: '👵', letters: ['B', 'A'] },
  { id: 'ong',   text: 'ÔNG',   say: 'ông',   emoji: '👴', letters: ['Ô', 'N', 'G'] },
  { id: 'anh',   text: 'ANH',   say: 'anh',   emoji: '👦', letters: ['A', 'N', 'H'] },
  { id: 'chi',   text: 'CHỊ',   say: 'chị',   emoji: '👧', letters: ['C', 'H', 'I'] },
  { id: 'em',    text: 'EM',    say: 'em',    emoji: '👶', letters: ['E', 'M'] },
  { id: 'chuoi', text: 'CHUỐI', say: 'chuối', emoji: '🍌', letters: ['C', 'H', 'U', 'Ô', 'I'] },
  { id: 'dua',   text: 'DỨA',   say: 'dứa',   emoji: '🍍', letters: ['D', 'Ư', 'A'] },
  { id: 'ca',    text: 'CÁ',    say: 'cá',    emoji: '🐟', letters: ['C', 'A'] },
  { id: 'meo',   text: 'MÈO',   say: 'mèo',   emoji: '🐱', letters: ['M', 'E', 'O'] },
  { id: 'ga',    text: 'GÀ',    say: 'gà',    emoji: '🐔', letters: ['G', 'A'] },
  { id: 'tho',   text: 'THỎ',   say: 'thỏ',   emoji: '🐰', letters: ['T', 'H', 'O'] },
];

// speech names of the Vietnamese letters
export const LETTER_SAY = {
  A: 'a', 'Ă': 'á', 'Â': 'ớ', B: 'bê', C: 'xê', D: 'dê', 'Đ': 'đê', E: 'e', 'Ê': 'ê', G: 'giê', H: 'hát',
  I: 'i', K: 'ca', L: 'e lờ', M: 'em mờ', N: 'en nờ', O: 'o', 'Ô': 'ô', 'Ơ': 'ơ', P: 'pê', Q: 'quy',
  R: 'e rờ', S: 'ét xì', T: 'tê', U: 'u', 'Ư': 'ư', V: 'vê', X: 'ích xì', Y: 'i dài',
};
export const DIGIT_SAY = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
