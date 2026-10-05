/**
 * Voice cast and direction for tools/voices_build.mjs. See docs/VOICES.md.
 *
 * Changing a speaker's voice or settings re-records only that speaker's
 * lines; changing a DIRECTION entry re-records only that line.
 */

export const MODEL = 'eleven_v4';
export const FORMAT = 'mp3_44100_96';
/** Integrated loudness every clip is normalised to (peaks stay under -0.5 dBFS). */
export const TARGET_LUFS = -20;

/**
 * One voice per Speaker in src/data/story.ts. Library voices are used by id
 * straight from the ElevenLabs Voice Library (no need to add them first).
 */
export const CAST = {
  wes: { name: 'Cyrien - The Charming Rogue', voice_id: 'AFkIMdmeB0MMrr1tgGds', settings: { stability: 0.45, similarity_boost: 0.8, speed: 1.0 } },
  liz: { name: 'Penelope - Teen, Joyous and Expressive', voice_id: 'tJx7PsKA0xKckfV0qHhK', settings: { stability: 0.4, similarity_boost: 0.8, speed: 1.05 } },
  'wes-kid': { name: 'Valf - Young, Playful & Sarcastic', voice_id: 'loY1uopAz31XyhAEhNSa', settings: { stability: 0.35, similarity_boost: 0.8, speed: 1.0 } },
  'liz-kid': { name: 'Candy - Young and Sweet', voice_id: 'Nggzl2QAXh3OijoXD116', settings: { stability: 0.35, similarity_boost: 0.8, speed: 1.05 } },
  michael: { name: 'Brayden - Cheery, Clear and Chill', voice_id: '3XOBzXhnDY98yeWQ3GdM', settings: { stability: 0.55, similarity_boost: 0.8, speed: 1.0 } },
  jocelyn: { name: 'Kathie - Sassy & Playful', voice_id: 'o9B86nZP8mMLaT5FBEzP', settings: { stability: 0.4, similarity_boost: 0.8, speed: 1.0 } },
  helena: { name: 'Yvonne - Sweet Natural unscripted', voice_id: 'lLdl3pjVr6svNgC2Nerx', settings: { stability: 0.5, similarity_boost: 0.8, speed: 1.0 } },
  noah: { name: 'Knox - Philosophical Gym Bro', voice_id: 'cgLpYGyXZhkyalKZ0xeZ', settings: { stability: 0.35, similarity_boost: 0.8, speed: 1.0 } },
  ryno: { name: 'Gaming Russell', voice_id: 'ZauUyVXAz5znrgRuElJ5', settings: { stability: 0.35, similarity_boost: 0.8, speed: 1.05 } },
  narrator: { name: 'Margot - Storyteller', voice_id: 'wnTuHlYPeBBHc2J3vMbA', settings: { stability: 0.5, similarity_boost: 0.8, speed: 1.0 } },
};

/** Audio tags for a line with this portrait mood and no DIRECTION entry. */
export const MOOD_TAGS = {
  happy: '[happy]',
  sad: '[sad]',
  mad: '[annoyed]',
};

/**
 * Performance direction: eleven_v4 audio tags put in front of a line.
 * Keys are "who|" + the start of the line's text (enough to be unique), so
 * small edits later in a line keep its direction. Tags are not spoken.
 */
export const DIRECTION = {
  // prologue
  'wes|Liz Buxbaum has always': '[amused]',
  'wes|But this story is not hers': '[mischievously]',
  "wes|I'm Wes Bennett, the boy next door": '[warmly]',
  'wes|To find out how we got here': '[playfully]',
  // level 1
  'wes|I have loved Libby since': '[warmly]',
  'wes|We had just finished watching': '[proudly]',
  "wes|I didn't consider that she": '[sheepishly]',
  'liz-kid|EWWW!': '[shrieking]',
  'wes-kid|He just wanted a kiss': '[innocently]',
  'liz-kid|That is NOT how': '[annoyed]',
  'wes-kid|Come on, little guy': '[encouraging]',
  // level 2
  'wes|I tried to make up for the frog': '[earnestly]',
  'wes|As you could imagine': '[dryly]',
  'liz-kid|*opens the little library*': '[screaming]',
  "wes-kid|It's a guardian gnome": '[proudly]',
  'narrator|Ten years later': '[warmly]',
  'wes-kid|They are too fast': '[frustrated]',
  // level 3
  'wes|About ten years after': '[casually]',
  "wes|What Liz didn't take into account": '[mischievously]',
  "wes|I don't want to say that I was happy": '[smugly]',
  'wes|Here. Sweats and my hoodie': '[gently]',
  'liz|Thanks, Wes. This is the worst': '[miserably]',
  'michael|Liz? Was that you': '[awkwardly]',
  "helena|Liz, honey, is that Wes's hoodie": '[warmly]',
  'wes|Too many people!': '[frustrated]',
  // level 4
  'wes|After Michael made a comment': '[dryly]',
  'wes|We spent hours picking out': '[warmly]',
  'wes|I decided to take this as a small step': '[mischievously]',
  'jocelyn|Okay, Bennett. I see you': '[impressed]',
  'jocelyn|You have my blessing': '[teasing]',
  'liz|Wait, what blessing?': '[confused]',
  "jocelyn|Hmm. That's not her": '[unimpressed]',
  // level 5
  'wes|My friend Noah tried passing': '[wincing]',
  'wes|Since her nose had swollen up': '[mischievously]',
  'liz|Ten rounds and not a scratch': '[excited]',
  'michael|Nice moves, Liz': '[politely]',
  'wes|Show-off.': '[teasing]',
  'noah|OH NO.': '[panicked]',
  "wes|I've got you. Come on": '[concerned]',
  'liz|Is it bad?': '[nervously]',
  'wes|You look great, Mrs. Potato Head': '[trying not to laugh]',
  'helena|Thank you for taking care of her': '[gratefully]',
  // level 6
  'wes|I took Liz to her favorite restaurant': '[proudly]',
  'wes|I joined her and we both had': '[hopeful]',
  'liz|Okay, that heart is actually adorable': '[playfully]',
  'wes|Ketchup is my medium': '[deadpan]',
  // boss
  "wes|Liz and I didn't end up going to homecoming": '[determined]',
  'wes|I was planning on telling her': '[tenderly]',
  'wes|I would tell her how much I love': '[warmly]',
  "wes|I feel like I'd do anything": '[softly]',
  'liz|Wes…': '[softly]',
  'liz|Just shut up and kiss me': '[breathless]',
  'wes|My palms are sweaty': '[nervously]',
  // side quest 1
  'wes|Liz has spent a lot of time': '[sincerely]',
  "wes|I'm taking her to dinner": '[confidently]',
  "wes|If Michael can't see": '[smugly]',
  'liz|You know what? You treated me': '[warmly]',
  "liz|I didn't have to be anybody else": '[warmly]',
  'liz|Wes, who ARE you right now?': '[exasperated]',
  // side quest 2
  "wes|Liz and Helena don't get along": '[gently]',
  'wes|I want to show Liz that the only way': '[sincerely]',
  "wes|Helena isn't trying to replace": '[softly]',
  "helena|I'm never going to replace her": '[gently]',
  'liz|I know. I think': '[tearfully]',
  "wes|Told you. I'm always right here": '[softly]',
  "liz|I can't do this right now": '[upset]',
  // side quest 3
  "wes|There's a thunderstorm": '[urgently]',
  "wes|So I'm going out there": '[dryly]',
  "liz|Wes? It's pouring!": '[shouting over the rain]',
  "wes|I just didn't want your moldy car": '[mischievously]',
  'narrator|Libby thought about what he said': '[softly]',
  'wes|Ugh, soaked.': '[groans]',
  // Chuck Taylors
  "wes|Wait, what's this in the back of my car": '[curious]',
  'wes|Chuck Taylors. With a note': '[touched]',
  'narrator|Wes found the hidden Chuck Taylors': '[excited]',
  // ending
  'narrator|Libby always waited for': '[warmly]',
  'narrator|What she never noticed': '[softly]',
  'narrator|That night in the parking spot': '[warmly]',
  "narrator|True love isn't like the movies": '[sincerely]',
  "narrator|It's better than the movies": '[warmly]',
};

/**
 * Lines the source scan can't see because the game builds them at runtime
 * (e.g. picked from an array by score). List every variant here.
 * { who: 'jocelyn', text: '…', mood?: 'happy' }
 */
export const EXTRA_LINES = [];
