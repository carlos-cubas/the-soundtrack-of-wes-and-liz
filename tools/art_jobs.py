"""Art manifest: every image the game ships, with its prompt and post-processing.

Job name = output path under public/ without extension (e.g. "img/sprites/frog").
Raw generations land in art-src/raw/<name>.png; `tools/art_make.py post` turns
them into the shipped files.

Fields
  out     shipped file (relative to public/)
  aspect  generation aspect ratio; size 1K/2K
  refs    reference images (paths relative to repo root, or "raw:<job>" for another raw)
  prompt  text after the style prefix
  kind    opaque | cut | portrait | circle | crop
  key     chroma key colour for cut-outs (green | magenta | blue)
  max     (w, h) downscale box for the shipped file
  src     for kind=crop: the raw sheet job + figure index
"""
from __future__ import annotations

SHEET = "art-src/ref/character-sheet-line.png"
KIDS = "art-src/ref/kids-sheet-line.png"
COVER = "art-src/ref/book-cover-crop.png"

# The cover's figures (art-src/ref/book-cover-full.png) are clean line art: thin even dark outlines,
# flat solid fills, no shading or texture, slender realistic proportions, small simple faces.
STYLE = (
    "Clean digital line-art illustration in the exact style of the figures on the Better Than the Movies book cover "
    "by Lynn Painter: thin, even, dark ink outlines like a fine-liner, flat solid color fills with no shading, no "
    "hatching, no gradients and no texture, slender realistic proportions, simple delicate faces with tiny features, "
    "like a modern webtoon line drawing. Palette: sunny lemon yellow, sky blue, cobalt, coral pink, mint and warm "
    "cream, with navy and black accents. No text, no letters, no watermark."
)
STYLE_CUT = STYLE
# Every generated image also gets the real cover as a style reference (see art_make.resolve_refs).
COVER_FULL = "art-src/ref/book-cover-full.png"
STYLE_REF_TEXT = ("Match the line and color style of the figures on the attached Better Than the Movies book cover; "
                  "ignore that cover's title, letters, background color and layout.")
KEY_TEXT = {
    "green": "pure chroma green #00FF00",
    "magenta": "pure magenta #FF00FF",
    "blue": "pure blue #0000FF",
}

CAST = (
    "Character reference: the attached character sheet shows, left to right, Wes, Liz, Michael, Jocelyn and Helena. "
    "Match their faces, hair, skin tones and outfits exactly."
)
KIDCAST = (
    "Character reference: the attached kids sheet shows 7-year-old Wes (left: messy dark hair, blue t-shirt with a white "
    "stripe, khaki shorts) and 7-year-old Libby (right: long wavy copper-red hair with a small PINK bow, freckles, peach rose-print "
    "sundress). Match them exactly."
)
WES = "Wes: 18-year-old athletic boy, dark messy black hair, brown eyes, light tan skin, a mischievous smirk"
LIZ = "Liz: 17-year-old girl, long wavy bright copper-red hair, clearly visible freckles across her nose and cheeks, fair skin, vintage floral style"
MICHAEL = "Michael: clean-cut teen boy, neat light-brown (medium brown, not blond) side-parted hair, navy preppy polo shirt"
JOCELYN = "Jocelyn: Black teen girl, curly black hair in a high puff, big gold hoop earrings, denim jacket over a white tee"
HELENA = ("Helena: Liz's stepmom, a mature adult woman about 45 years old (clearly a mom, not a teen: fuller face, "
          "soft smile lines), friendly, blond bob, cream cable-knit sweater, warm smile")
HOUSES = (
    "Liz's house is pale sage green, two stories, dark grey roof, blue shutters, a red front door; "
    "Wes's house next door is white with a black roof and black shutters"
)

JOBS: dict[str, dict] = {}


def job(name: str, **kw) -> None:
    kw.setdefault("out", name + (".png" if kw.get("kind") in ("cut", "circle", "crop") else ".webp"))
    kw.setdefault("refs", [])
    kw.setdefault("size", "1K")
    JOBS[name] = kw


# --------------------------------------------------------------------------------------------
# Character line-ups re-keyed onto flat colour, then split into full-body sprites
# --------------------------------------------------------------------------------------------
job(
    "sheets/adults",
    kind="sheet",
    aspect="16:9",
    size="2K",
    refs=[SHEET],
    key="magenta",
    prompt_raw=(
        "Reproduce the attached character sheet exactly: the same five characters, identical faces, hair, clothes, "
        "poses, proportions, spacing and positions, in the same clean line-art style with the same thin outlines and flat colors. The ONLY change: replace the "
        "yellow background with a perfectly flat solid pure magenta #FF00FF background, uniform edge to edge, with no "
        "shadows, no floor and no paper texture. Keep the characters separated with clear background between them. No text other than the "
        "jersey lettering."
    ),
)
job(
    "sheets/kids",
    kind="sheet",
    aspect="16:9",
    size="2K",
    refs=[KIDS],
    key="green",
    prompt_raw=(
        "Reproduce the attached kids character sheet exactly: the same two children, identical faces, hair, clothes, "
        "poses and proportions, in the same clean line-art style with the same thin outlines and flat colors. The ONLY change: replace the yellow background with "
        "a perfectly flat solid pure chroma green #00FF00 background, uniform edge to edge, no shadows, no floor, no paper texture. No text."
    ),
)
for i, who in enumerate(["wes", "liz", "michael", "jocelyn", "helena"]):
    job(f"img/sprites/{who}", kind="crop", src=("sheets/adults", i, 5), max=(512, 512),
        note="full body, front view, from the canonical character sheet")
for i, who in enumerate(["wes-kid", "liz-kid"]):
    job(f"img/sprites/{who}", kind="crop", src=("sheets/kids", i, 2), max=(512, 512),
        note="full body, front view, from the kids sheet")

# --------------------------------------------------------------------------------------------
# Sprites
# --------------------------------------------------------------------------------------------
job("img/sprites/frog", kind="cut", key="magenta", aspect="1:1", max=(512, 512),
    prompt="A cute small green cartoon frog sitting, seen from the side in profile, facing RIGHT (its head and eyes on "
           "the right side of the image), big round friendly eyes on top of its head, a little smile, tiny pink cheek, "
           "lime and mint green body with a pale yellow belly. Centered, full body.",
    note="faces RIGHT, sitting; anchor bottom-centre")
job("img/sprites/frog-jump", kind="cut", key="magenta", aspect="1:1", max=(512, 512), refs=["raw:img/sprites/frog"],
    prompt="The same cute green cartoon frog as the attached image, same colors and style, now mid-leap in the air seen "
           "from the side, facing RIGHT: body stretched diagonally up and to the right, front legs reaching forward to "
           "the right, long back legs extended behind to the left. Centered, whole frog visible.",
    note="faces RIGHT, mid-leap")
job("img/sprites/barbie", kind="cut", key="green", aspect="3:4", max=(512, 512),
    prompt="A generic blond fashion doll (an unbranded toy doll, no logos), full body, front view, long straight blond "
           "hair, bright pink party dress, pink heels, both arms raised high above her head with hands together as if "
           "about to throw a ball downward, cheerful face. Standing, centered.",
    note="arms raised (throwing pose), front view; no logo")
job("img/sprites/beachball", kind="circle", key="green", aspect="1:1", max=(256, 256),
    prompt="A classic inflatable beach ball seen straight on from the front, a perfect circle, six curved segments in "
           "alternating red, yellow, blue and white meeting at a small white cap in the middle, one soft white shine "
           "highlight. Centered, filling most of the frame.",
    note="perfect circle (masked)")
job("img/sprites/gnome", kind="cut", key="green", aspect="3:4", max=(512, 512),
    prompt="A cheerful ceramic garden gnome statue, cartoon, full body, front view, tall red pointy hat, big fluffy white "
           "beard, rosy nose and cheeks, a cobalt BLUE shirt, brown belt with a gold buckle, brown pants and little black "
           "boots, hands on his belly. Standing, centered. Nothing green.",
    note="full body front; pops out of holes in L2")
job("img/sprites/gnome-head", kind="cut", key="green", aspect="1:1", max=(384, 384), refs=["raw:img/sprites/gnome"],
    prompt="Only the head of the same garden gnome as the attached image: red pointy hat, rosy face with a cheeky "
           "expression, big fluffy white beard, with a clean flat bottom where it popped off like a ceramic toy (cartoon, "
           "not gory, no neck). Centered. Nothing green.",
    note="cartoon head only")
job("img/sprites/little-library", kind="cut", key="magenta", aspect="3:4", max=(512, 512),
    prompt="A little free library: a small wooden book box shaped like a tiny house with a pitched coral-red roof, a "
           "small glass-paned front door showing colorful books inside, painted cream and cobalt blue, mounted on a "
           "single wooden post. Front view, the whole thing from the roof to the bottom of the post, centered, no ground, no sign, no plaque, no lettering anywhere.",
    note="box on a post; anchor bottom-centre")
job("img/sprites/basketball", kind="circle", key="green", aspect="1:1", max=(256, 256),
    prompt="An orange basketball seen straight on, a perfect circle, classic dark seam lines, subtle pebbled texture, "
           "one soft highlight. Centered, filling most of the frame.",
    note="perfect circle (masked)")
job("img/sprites/ketchup", kind="cut", key="green", aspect="9:16", max=(256, 512),
    prompt="A red plastic ketchup squeeze bottle held UPSIDE DOWN: the bottle body is at the top of the image and the "
           "white cap with its narrow nozzle points straight DOWN at the bottom. Plain red bottle with a blank cream label "
           "(no writing), side view, perfectly vertical, centered.",
    note="upside down, nozzle at the bottom-centre of the image (ketchup comes out of the bottom middle)")
job("img/sprites/napkin", kind="cut", key="green", aspect="1:1", max=(512, 512),
    prompt="A single plain white square paper napkin lying flat, seen from directly above, square and unfolded, with "
           "soft subtle fold creases and slightly curled corners, pure white with only a few thin light grey crease lines, "
           "no colored marks, no pattern. Centered, filling most of "
           "the frame.",
    note="top-down, square")
job("img/sprites/wes-run", kind="cut", key="magenta", aspect="1:1", max=(512, 512), refs=[SHEET],
    prompt=CAST + " Draw only Wes, full body, running fast, seen from the side in profile facing LEFT (his face and "
           "chest toward the left edge of the image), mid-stride with one leg forward and one back, arms pumping. He "
           "wears a plain grey hoodie with the hood UP over his head, blue jeans and black high-top sneakers. Dark messy hair, determined face. Centered.",
    note="faces LEFT, mid-stride; anchor bottom-centre")
job("img/sprites/wes-reach", kind="cut", key="magenta", aspect="1:1", max=(512, 512),
    refs=["raw:img/sprites/wes-run", SHEET],
    prompt="The same Wes as the attached running image: identical grey hoodie with the hood UP, blue jeans, black "
           "high-top sneakers, dark messy hair, same line-art style. Now standing still with both feet planted "
           "apart (not walking, not running), seen from the side in profile facing LEFT (face and chest toward the left "
           "edge). His torso is bent forward at the waist, and his front arm is stretched out straight ahead and a little "
           "upward, fully extended, with an open hand gripping something, as if reaching through an open car window to "
           "turn the window crank. His back hand rests on his knee. "
           "Soaked from the rain: wet hoodie, damp hair, a few water drips. Full body, centered, no car.",
    note="faces LEFT, reaching forward (sq3 window crank); anchor bottom-centre")
job("img/sprites/liz-car", kind="cut", key="magenta", aspect="16:9", max=(512, 512),
    prompt="A small cute compact hatchback car seen exactly from the side, facing LEFT (the front bumper and headlight "
           "are on the left side of the image), sky blue paint, cream roof, round headlights, a thin dark outline around the "
           "whole car, the driver's side window rolled fully DOWN and open, showing the seat inside; the rear side "
           "window has pale blue glass. Centered, whole car visible, no road, no shadow.",
    note="faces LEFT; driver window open")
job("img/sprites/hoodie", kind="cut", key="green", aspect="1:1", max=(384, 384),
    prompt="Exactly two pieces of clothing and nothing else: a neatly folded plain heather-grey hoodie stacked on top of "
           "folded heather-grey sweatpants, both the same grey, three-quarter view from above, soft folds, drawstrings "
           "visible. No other clothes, no colors besides grey. Centered.",
    note="Wes's spare clothes (L3 goal)")
job("img/sprites/rose", kind="cut", key="blue", aspect="3:4", max=(384, 512),
    prompt="A single long-stem red rose with two green leaves on the stem, upright, side view. Centered.",
    note="upright")

# --------------------------------------------------------------------------------------------
# Inventory items (chunky icons)
# --------------------------------------------------------------------------------------------
ICON = ("Chunky game inventory icon in the same clean line-art style: bold simple "
        "silhouette, thick friendly shapes, slightly bolder outlines, slight three-quarter angle, centered and filling most of the frame. ")
job("img/items/cap", kind="cut", key="green", aspect="1:1", max=(256, 256),
    prompt=ICON + "A cobalt blue baseball cap with a curved brim, plain, no logo.")
job("img/items/bat", kind="cut", key="green", aspect="1:1", max=(256, 256),
    prompt=ICON + "A plain wooden baseball bat lying diagonally from bottom-left to top-right. The whole barrel is one "
                  "single natural honey-wood color with a few thin grain lines; only the handle has black grip tape, "
                  "with a round knob. No stripes, no colored bands, no rings, no logo, no face, no markings or cracks on the wood.")
job("img/items/boombox", kind="cut", key="green", aspect="1:1", max=(256, 256),
    prompt=ICON + "A retro silver 1980s boombox with two big round black speakers, a cassette deck in the middle, a few "
                  "colorful buttons and a carrying handle on top. No printed labels, no words, no numbers on the device.")
job("img/items/jersey", kind="cut", key="green", aspect="1:1", max=(256, 256),
    prompt=ICON + "A white baseball jersey laid flat with short sleeves, grey-blue piping and buttons down the front, and "
                  "a big cobalt blue number 32 on the front. Only the jersey, no person, no other objects. The number 32 is "
                  "the only text.",
    note="'32' is the only text")
job("img/items/chucks", kind="cut", key="green", aspect="1:1", max=(256, 256),
    prompt=ICON + "A pair of white high-top canvas sneakers side by side, white rubber toe caps, white laces, a thin "
                  "blue and red stripe on the sole, no logos.")

# --------------------------------------------------------------------------------------------
# Gameplay backgrounds
# --------------------------------------------------------------------------------------------
job("img/bg/l1-dreamhouse", kind="opaque", aspect="16:9", size="2K", max=(2048, 1152),
    prompt="Front cross-section of the inside of a giant, very WIDE pink toy dreamhouse, like a dollhouse with its "
           "front wall removed, seen straight on. The house is wider than it is tall and spans the full width of the "
           "image from the left edge to the right edge, each floor a row of three rooms side by side; no sky, no "
           "background, no blur, no copies of the house: four stacked floors of cute rooms (bottom: kitchen; second: bedroom; "
           "third: bathroom; top: a rooftop terrace with a small pool under a pale sky). Wallpaper, windows, furniture "
           "placed against the back walls. Soft muted pastel pinks, lilac and cream, low contrast and slightly hazy so "
           "game sprites stand out. Floors are separated only by thin soft lines: NO thick floor beams, platforms or "
           "girders running across. No people, no dolls.",
    note="the game draws pink girders and ladders on top")
job("img/bg/l2-yard", kind="opaque", aspect="16:9", size="2K", max=(2048, 1152),
    prompt="A sunny suburban front lawn seen from slightly above. The bottom of the white picket fence sits at 40% of "
           "the image height, and below it the lawn fills the entire bottom 60% of the image: plain, open, empty, "
           "freshly mowed bright green grass with soft straight mowing stripes and nothing on it: no dirt patches, no "
           "bare spots, no holes, no paths. Above the fence, in the top 40% only: round bushes behind the fence, two "
           "cozy houses and a blue sky with a few clouds. No little library, no mailbox, "
           "no signs and no objects anywhere on the lawn or by the fence. Cheerful daytime.",
    ground_at=0.45,
    note="lawn starts at 45% height (moved in post by ground_at), empty (game draws 9 holes and the little-library sprite)")
job("img/bg/l4-mall", kind="opaque", aspect="16:9", size="2K", max=(2048, 1152),
    prompt="Interior of a bright, airy clothing boutique at the mall. On the far left: clothing racks with colorful "
           "dresses and a big standing mirror. The center-left of the image is open, uncluttered floor and plain pastel "
           "wall (space for a character). Right side: soft shelves with folded clothes, a potted plant. Soft pastel "
           "pink, mint and cream, gentle light, no people, no mannequins, no shop signs.",
    note="centre-left clear for the paper doll")
job("img/bg/l5-court", kind="opaque", aspect="16:9", size="2K", max=(2048, 1152),
    prompt="A top-down view looking straight down onto a full indoor high school basketball court that fills the frame "
           "edge to edge: honey-colored wood floor planks running horizontally, crisp white painted boundary lines, center "
           "circle, cobalt blue painted keys and three-point arcs at the left and right ends, a plain center circle with "
           "no logo and no letters. The wood floor fills the entire image edge to edge, no border, no objects. Orthographic, flat, no people, no balls, no hoops, no bleachers.",
    note="top-down, no people")
job("img/bg/l6-table", kind="opaque", aspect="16:9", size="2K", max=(2048, 1152),
    prompt="A top-down view looking straight down onto a retro diner table at a burger restaurant: a warm cream "
           "tabletop with a thin red-and-white checkered border. In the top-left corner a plate with a burger and fries; "
           "in the bottom-right corner a strawberry milkshake in a tall glass with a straw; salt and pepper shakers in "
           "the top-right corner. The CENTER 60% of the table is completely EMPTY plain cream tabletop.",
    note="centre 60% empty (napkin + drawing go there)")
job("img/bg/boss-night", kind="opaque", aspect="16:9", size="2K", max=(2048, 1152),
    prompt="Night on a quiet suburban street between two houses with warm glowing porch lights (" + HOUSES + "). An "
           "empty curb parking spot marked with painted lines in the center foreground. Starry deep indigo sky, a thin "
           "crescent moon. Moody, romantic, quite dark overall with soft cobalt and violet tones. No people, no cars.",
    note="dark, for UI tiles on top")
job("img/bg/sq1-diner", kind="opaque", aspect="16:9", size="2K", max=(2048, 1152),
    prompt="A cozy casual small-town diner at night seen from inside: an empty coral vinyl booth with a table holding a "
           "basket of fries and two milkshakes, warm pink and blue neon glow through the window (neon shapes only: a star and a heart, no "
           "words, no letters), a retro jukebox, checkered floor. Inviting, simple, not fancy. No people.")
job("img/bg/sq2-kitchen", kind="opaque", aspect="16:9", size="2K", max=(2048, 1152),
    prompt="A warm family kitchen in golden afternoon light: mint and cream cabinets, a wooden shelf full of vinyl "
           "records (plain colored sleeves, no faces, no words) with a record player, family photos and magnets on the fridge, potted plants on the windowsill, a "
           "table with a teapot and a plate of cookies. Cozy and lived-in. No people.")
job("img/bg/sq3-storm", kind="opaque", aspect="21:9", size="2K", max=(2048, 878),
    prompt="Side view of two neighboring front yards at night in a thunderstorm. A flat, level wet lawn runs along the "
           "bottom 25% of the image, edge to edge, with a perfectly straight horizontal ground line. Behind it, two "
           "large houses filling the width: on the left, Liz's house (pale sage green, two stories, dark roof, blue shutters, a lit window) and on the right "
           "Wes's house (white with a black roof and black shutters). Heavy diagonal rain, a dramatic dark navy and "
           "violet sky with a bright lightning bolt. No people, no cars.",
    note="21:9; ground line ~75% down; Liz's house left, Wes's right")

# --------------------------------------------------------------------------------------------
# Portraits (waist-up, facing the dialogue box on the right)
# --------------------------------------------------------------------------------------------
FRAME = ("Waist-up portrait, three-quarter view: body and face turned slightly toward the RIGHT side of the image, eyes "
         "looking toward the right. The top of the head is just below the top edge, the bottom edge cuts across the "
         "waist, arms relaxed and inside the frame. Centered.")


def portrait(name: str, who_desc: str, expr: str, refs: list[str], key: str = "green", base: str | None = None,
             note: str = "") -> None:
    if base:
        prompt = (f"The same character as the attached portrait: identical face, hair, outfit, framing, scale and pose "
                  f"direction (turned toward the right). Change only the expression and arm pose: {expr}. {FRAME}")
        refs = ["raw:" + base] + refs
    else:
        prompt = f"{who_desc}. Expression: {expr}. {FRAME}"
    job(f"img/portraits/{name}", kind="portrait", key=key, aspect="3:4", refs=refs, max=(675, 900), prompt=prompt,
        note=note or "675x900 canvas, faces right")


portrait("wes", CAST + " Draw only Wes. " + WES + ", wearing his white #32 baseball jersey from the sheet (the number 32 is the only "
         "text)", "confident, mischievous one-sided smirk", [SHEET])
portrait("wes-happy", "", "a big warm genuine grin, eyes bright", [SHEET], base="img/portraits/wes")
portrait("liz", CAST + " Draw only Liz. " + LIZ + ", wearing the cream rose-print sundress and pink cardigan from the sheet",
         "pleasant, dreamy soft smile", [SHEET])
portrait("liz-happy", "", "beaming, delighted big smile, cheeks a little pink", [SHEET], base="img/portraits/liz")
portrait("liz-sad", "", "sad and miserable: eyebrows tilted up, small frown, eyes glossy", [SHEET],
         base="img/portraits/liz")
portrait("liz-mad", "", "annoyed and mad: furrowed brows, pursed lips, arms crossed", [SHEET], base="img/portraits/liz")
portrait("wes-kid", KIDCAST + " Draw 7-year-old Wes from the kids sheet", "cheeky gap-toothed grin", [KIDS])
portrait("liz-kid", KIDCAST + " Draw 7-year-old Libby from the kids sheet", "sweet shy smile", [KIDS])
portrait("liz-kid-mad", "", "furious little-kid anger: scrunched face, puffed red cheeks, fists clenched", [KIDS],
         base="img/portraits/liz-kid")
portrait("michael", CAST + " Draw only Michael. " + MICHAEL + ", from the sheet", "polite, charming easy smile", [SHEET])
portrait("jocelyn", CAST + " Draw only Jocelyn. " + JOCELYN + ", from the sheet", "sharp, skeptical, one eyebrow slightly raised",
         [SHEET])
portrait("jocelyn-happy", "", "approving big smile, impressed", [SHEET], base="img/portraits/jocelyn")
portrait("jocelyn-mad", "", "unimpressed glare, arms crossed, lips pressed", [SHEET], base="img/portraits/jocelyn")
portrait("helena", CAST + " Draw only Helena. " + HELENA + ", from the sheet. Frame her close like a portrait photo: "
         "head and shoulders large in the frame, the bottom edge cuts across her stomach above the belt, her pants are "
         "NOT visible", "kind, gentle smile", [SHEET], key="magenta")
portrait("helena-happy", "", "radiant, warm open smile, eyes crinkled", [SHEET], key="magenta",
         base="img/portraits/helena")
portrait("noah", "Draw one character only. Noah: friendly teen boy, buzzcut dark-blond hair, medium-brown skin, cobalt blue varsity jacket "
         "with cream sleeves over a white tee (no letters on the jacket). Same style as the attached sheet",
         "friendly, a bit sheepish open smile", [SHEET])
portrait("ryno", "Draw one character only. Ryno: big goofy teen boy, broad shoulders, round cheerful face, backwards coral-red baseball cap, "
         "oversized yellow t-shirt (no print). Same style as the attached sheet", "goofy huge grin", [SHEET])

# --------------------------------------------------------------------------------------------
# Narration scenes
# --------------------------------------------------------------------------------------------
SC = dict(kind="opaque", aspect="16:9", size="2K", max=(2048, 1152))
job("img/scenes/prologue", refs=[SHEET], **SC,
    prompt=CAST + " A quiet suburban street in Omaha on a warm golden evening: two neighboring houses side by side ("
           + HOUSES + "). Teen Wes in his white #32 jersey leans against his small raspberry-colored car parked at the "
           "curb, looking up with a soft smile at Liz's lit upstairs window, where Liz with her copper-red hair sits "
           "reading. Warm sunset sky, trees, lawns.")
job("img/scenes/l1", refs=[KIDS], **SC,
    prompt=KIDCAST + " A girl's pink bedroom. 7-year-old Wes kneels on the carpet, grinning mischievously, sneaking a "
           "little green frog into a big pink toy dreamhouse (a dollhouse) with an unbranded blond fashion doll on its "
           "roof. Toys, a canopy bed, fairy lights. Libby is not in the room.")
job("img/scenes/l2", refs=[KIDS], **SC,
    prompt=KIDCAST + " A sunny front yard. 7-year-old Wes proudly holds up a cartoon garden gnome's head (red pointy "
           "hat, white beard, cute and not gory) next to a little free library box on a wooden post. 7-year-old Libby "
           "stands beside it, horrified, hands on her cheeks, mouth open. No signs, no lettering, no words, no sound-effect text anywhere.")
job("img/scenes/l3", refs=[SHEET], **SC,
    prompt=CAST + " A crowded teen house party at night with string lights and silhouettes of dancing teens. In front, "
           "Liz looks miserable with a gross cartoon greenish stain splattered down her shirt. Wes, wearing a grey "
           "hoodie and jeans, holds out a folded grey hoodie to her with a kind look. In the background Michael holds a "
           "red plastic cup, oblivious. Cartoonish and funny, not gross.")
job("img/scenes/l4", refs=[SHEET], **SC,
    prompt=CAST + " A bright mall clothing boutique. Liz holds up two colorful outfits on hangers, excited. Wes, in a "
           "grey hoodie, smiles at her while secretly hiding a plain cardboard shoebox (no logo, no letters, no brand marks) with both hands BEHIND his back, out of her sight; from the viewer's side only a corner of the box peeks out behind him, Liz cannot see it. Jocelyn stands to the "
           "side judging with arms crossed and a raised eyebrow. Racks of clothes, a big mirror, pastel colors.")
job("img/scenes/l5", refs=[SHEET], **SC,
    prompt=CAST + " A high school gym with wood floor and bleachers. An orange basketball flies straight toward Liz's "
           "face, she flinches. In the background Michael and Noah (a buzzcut teen boy in a cobalt varsity jacket) gasp "
           "with hands on their heads. Wes, in a grey hoodie, sprints toward Liz to help. Dynamic, comedic.")
job("img/scenes/l6", refs=[SHEET], **SC,
    prompt=CAST + " Inside Stella's, a retro burger diner with pink and cream decor. Liz and Wes sit across from each "
           "other in a red vinyl booth, laughing, each squeezing a red ketchup bottle to draw hearts on white paper "
           "napkins. Burgers, fries and milkshakes on the table. Warm, sweet, nostalgic.")
job("img/scenes/boss", refs=[SHEET], **SC,
    prompt=CAST + " Night between the two neighboring houses (" + HOUSES + "). Wes, in a grey hoodie, stands nervously "
           "by the empty curb parking spot between the houses, hands in his pockets, as the bright headlights of Liz's "
           "small sky-blue car pull up the street. Starry indigo sky, warm porch lights, romantic and tense.")
job("img/scenes/sq1", refs=[SHEET], **SC,
    prompt=CAST + " Wes (grey hoodie) and Liz (copper-red hair, casual cardigan) laughing together in a cozy casual "
           "diner booth, sharing a basket of fries and a plain red ketchup bottle with no label, relaxed and genuine. Simple, warm, no fancy decorations, "
           "soft neon glow in the window. No signs, no lettering, no words, no sound-effect text anywhere.")
job("img/scenes/sq2", refs=[SHEET], **SC,
    prompt=CAST + " A warm family kitchen in afternoon light. Liz and her stepmom Helena sit side by side at the table "
           "looking through a crate of vinyl records and a stack of old photographs together, starting to smile. Wes "
           "leans casually in the doorway in a grey hoodie, watching with a soft smile.")
job("img/scenes/sq3", refs=[SHEET], **SC,
    prompt=CAST + " A night thunderstorm in the front yard between the two houses (" + HOUSES + "). Wes, soaked, in a "
           "grey hoodie, leans into Liz's small sky-blue car parked in the driveway to roll up its open window. "
           "Lightning cracks across a dark violet sky, heavy rain. Liz watches from her porch under the light, wrapped "
           "in a cardigan, surprised.")
job("img/scenes/chucks", **SC,
    prompt="The open back door of a car at golden hour, looking into the back seat: on the seat sits a pair of white "
           "high-top canvas sneakers (no logos) with a folded handwritten note tucked in the laces (only illegible "
           "scribbles, no readable words) and a small heart doodle. Cozy warm light, dust motes, nostalgic.")
job("img/scenes/ending", refs=[SHEET], **SC,
    prompt=CAST + " Night in the street parking spot between the two houses. Wes and Liz kiss under strings of warm "
           "lights and a sky full of stars, Liz on tiptoe, her copper-red hair flowing. Floating music notes and little "
           "hearts around them. Joyful, romantic, magical. No signs, no lettering, no words, no sound-effect text anywhere.")
job("img/title", refs=[SHEET], kind="opaque", aspect="21:9", size="2K", max=(2048, 878),
    prompt=CAST + " Key art on a sunny lemon-yellow background. On the LEFT 45% of the frame: Wes in his white #32 "
           "jersey holds a retro boombox high over his head, grinning, and next to him Liz with her long copper-red "
           "hair, wearing a cream rose-print sundress, headphones around her neck, laughing. Around them float music "
           "notes, little hearts and a spinning black vinyl record. The RIGHT half of the image is mostly empty plain "
           "sunny yellow (space for the title), with only a few faint music notes.",
    note="characters left 45%; right half empty for the title")

# --------------------------------------------------------------------------------------------
# Side quest 2 puzzles
# --------------------------------------------------------------------------------------------
job("img/puzzles/family-photo", refs=[SHEET], kind="opaque", aspect="1:1", size="1K", max=(1024, 1024),
    prompt=CAST + " A cozy family photo on a front porch with flower pots, EXACTLY THREE people and nobody else: Liz in the "
           "middle, her dad on one side (kind man in his forties with glasses and short brown hair, a cobalt sweater) "
           "and Helena on the other side, all three smiling, arms around each other. Wes, Michael and Jocelyn are NOT "
           "in this picture. No doormat text, no words. Warm afternoon light.",
    note="jigsaw image")
CARD = ("A single simple centered hand-drawn icon on a plain warm cream (#fdfbf3) paper background, chunky, generous margin, "
        "for a memory card game: ")
for name, desc in {
    "vinyl": "a black vinyl record with a coral center label (no text)",
    "mixtape": "a retro cassette mixtape with a blank cream label and a little heart",
    "cookies": "a small stack of chocolate chip cookies",
    "teacup": "a mint teacup on a saucer with a little steam swirl",
    "photo": "a polaroid photo of a sunny house (no text)",
    "flowers": "a small bouquet of pink and yellow flowers tied with a ribbon",
    "headphones": "a pair of silver over-ear headphones",
    "recipe": "an index recipe card covered only in wavy scribble lines (no letters, no words, no title) and a little whisk drawing",
}.items():
    job(f"img/puzzles/cards/{name}", kind="opaque", aspect="1:1", max=(512, 512), prompt=CARD + desc, paper_trim=False)

# --------------------------------------------------------------------------------------------
# UI scrapbook pieces
# --------------------------------------------------------------------------------------------
job("img/ui/paper-blue", kind="paper", aspect="16:9", size="2K", max=(2048, 1152),
    prompt_raw="A flat scan of plain sky-blue (#7ed2fe) textured scrapbook paper filling the entire frame, very subtle "
               "crumple and fibre texture, soft and even lighting, no objects, no edges, no shadows, no text, "
               "no watermark.",
    note="tinted to mean #7ed2fe and cross-faded to tile")
job("img/ui/cd-playlist", kind="circle", key="green", aspect="1:1", max=(768, 768), hole=0.13,
    refs=["art-src/ref/playlist-cd-crop.png", "art-src/ref/deck-p01-title.png"],
    prompt_raw="Recreate the hand-drawn CD from the attached images (the one at the bottom center of the title page): a "
               "silver-white compact disc seen straight on, a perfect circle with a center hole, decorated by hand in "
               "pen. Handwritten at the top in neat marker: 'The Liz and Wes Playlist'. Below it two columns of small "
               "handwritten track names (Public Service Announcement, Enter Sandman, Monkey Wrench, Lovers, Electric, "
               "We Are Young, Paradise, River, Bad Liar, Paper Rings), little red hearts drawn around the rim, a small "
               "music note doodle. The center hole and the area outside the disc are a perfectly flat solid pure chroma "
               "green #00FF00. No other text.",
    note="handwritten text allowed; centre hole transparent")
job("img/ui/vinyl", kind="circle", key="green", aspect="1:1", max=(512, 512), hole=0.03,
    prompt="A black vinyl record seen straight on from above, a perfect circle with fine concentric grooves and a soft "
           "light sheen, a coral and cream center label with no text, a tiny center hole showing the background.",
    note="perfect circle, tiny hole")
job("img/ui/napkin-lw", kind="cut", key="green", aspect="1:1", max=(512, 512), refs=["art-src/ref/deck-p10-ketchup.png"],
    prompt_raw="A white paper napkin seen from above, slightly crumpled with soft fold creases, like the one in the top "
               "right of the attached image: on it, a big heart OUTLINE drawn in red ketchup, and inside the heart the "
               "letters 'L+W' also in ketchup; the heart surrounds the letters completely. Drippy hand-drawn ketchup lines. Clean line-art illustration with thin dark outlines and flat colors, on a perfectly flat solid pure chroma green "
               "#00FF00 background, no shadow. The only text is L+W.",
    note="'L+W' in a ketchup heart")
job("img/ui/tape", kind="cut", key="green", aspect="16:9", max=(512, 256), alpha=0.82,
    prompt="Only one object and nothing else: a single short horizontal strip of washi tape with torn zig-zag "
           "ends, pale pastel pink with tiny white polka dots, flat, centered. No people, no figures, no other objects.",
    note="alpha x0.82 for translucency")
job("img/ui/newspaper-1", kind="cut", key="green", aspect="4:3", max=(768, 768), out="img/ui/newspaper-1.webp",
    prompt_raw="A torn scrap of old newspaper with rough torn edges, slightly yellowed paper, filled with columns of "
               "tiny illegible fake text (gibberish squiggles, no real words) and a small blurry grey photo block, "
               "flat scan, slightly tilted, on a perfectly flat solid pure chroma green #00FF00 background, no shadow.",
    note="RGBA WebP")
job("img/ui/flower-pink", kind="cut", key="blue", aspect="1:1", max=(256, 256),
    prompt="A simple hand-drawn flower sticker with five rounded coral-pink petals, a pale yellow center and two small "
           "green leaves on a short stem, like a scrapbook sticker.")
job("img/ui/flower-blue", kind="cut", key="magenta", aspect="1:1", max=(256, 256),
    prompt="A simple hand-drawn flower sticker with five rounded periwinkle-blue petals, a darker violet center and two "
           "small green leaves on a short stem, like a scrapbook sticker.")
job("img/ui/headphones", kind="cut", key="green", aspect="1:1", max=(384, 384),
    prompt="A pair of realistic silver-grey over-ear headphones with black cushions and a padded headband, "
           "three-quarter front view. Plain ear cups with no faces, no eyes, no logos. No sticker border.")

# --------------------------------------------------------------------------------------------
# App icon
# --------------------------------------------------------------------------------------------
job("icons/icon-1024", kind="icon", refs=[SHEET], aspect="1:1", max=(1024, 1024), out="icons/icon-1024.png",
    prompt=CAST + " App icon artwork, bold and simple, readable when tiny. Composition: both faces close together in the exact "
           "CENTER of the square, chest-up, with a generous margin of plain sunny lemon-yellow background on all four "
           "sides (nothing important in the outer 12% of the image). Wes (dark messy hair, smirk, white jersey) holds a "
           "small retro silver boombox on his shoulder; Liz (copper-red wavy hair, freckles) leans her head against his "
           "shoulder, smiling. A couple of small coral hearts and music notes. No text, no numbers, no border.",
    note="opaque 1024x1024")
