// ── ISAMO i18n string catalogue ───────────────────────────────────────────────
// Three supported languages: English (default), Italian, French.
// All user-visible prose lives here; labels / proper nouns stay in-file.

export type Lang = 'en' | 'it' | 'fr' | 'jp';
export const LANGS: Lang[] = ['en', 'it', 'fr', 'jp'];

export interface LangStrings {
  // ── SplashScreen ────────────────────────────────────────────────────────────
  pressPrefix: string;           // "Press " / "Premi " / "Appuyez "
  pressOr: string;               // " or " / " o " / " ou "
  pressSuffix: string;           // " to start" / " per iniziare" / " pour commencer"
  navHint1: string;              // keyboard nav hint — first line
  navHintUse: string;            // "Use" / "Usa" / "Utilisez"
  navHintExplore: string;        // "to explore." / "per esplorare." / "pour explorer."

  // ── Home — welcome intro ─────────────────────────────────────────────────────
  welcomeText: string;
  ttsPhrases: readonly string[];  // used as TTS test / demo sentences

  // ── Home — upload panels ─────────────────────────────────────────────────────
  uploadText: string;             // Library upload panel
  boardUploadText: string;        // Board upload panel

  // ── Home — sound player hint ─────────────────────────────────────────────────
  soundPlayerHintSuffix: string;     // keyboard variant  (no leading space)
  soundPlayerHintSuffixCtrl: string; // controller variant (leading space)

  // ── Home — account section ───────────────────────────────────────────────────
  accountWip: string;

  // ── Home — Online "..." info panel ───────────────────────────────────────────
  onlineInfoText: string;

  // ── Home — artist bios ────────────────────────────────────────────────────────
  artistBios: Record<string, string>;

  // ── Home — Effects panel hover explanations (keyed by canonical FX_GROUP_LABELS) ──
  fxExplanations: Record<string, string>;

  // ── Home — navigation explanations (keyed by canonical CATEGORIES labels) ─────
  // Shown top-left while browsing categories / sub-categories.
  navExplanations: Record<string, string>;

  // ── Home — Sound Player effects-mode hint (around the ⏎ / Esc glyphs) ─────────
  fxEnterHint: string; // "…to enter effects mode"
  fxEscHint:   string; // "…to return to sound selection"

  // ── Logo hover reveal — ISAMO = Intelligent Sound And Motion Organiser ────────
  isamoWords: readonly string[];
}

// ─────────────────────────────────────────────────────────────────────────────
const EN: LangStrings = {
  pressPrefix:  'Press ',
  pressOr:      ' or ',
  pressSuffix:  ' to start',
  navHint1:     '(ISAMO !) is primarily designed for keyboard navigation.',
  navHintUse:   'Use',
  navHintExplore: 'to explore.',

  welcomeText:
    "(ISAMO !) (Intelligent Sound And Motion Organiser) is an open-source sound library " +
    "aimed at graphic designers, motion designers and visual artists.",

  ttsPhrases: [
    "(ISAMO !) invites the user to explore the sound bank, categorised on the basis of " +
      "movements and archetypes derived directly from the field of motion graphics. " +
      "Each sound has been meticulously crafted to best represent these characteristics.",
    'FUCK BENJAMIN NETHANYAHU !!!!!!!',
    "I'm sorry. I had to.",
    "(ISAMO !) allows users to play, edit and download the sounds available " +
      "directly in-app. The Library section implies no copyright restrictions.",
    "You can upload your own videos in the Sound Player section in order to get " +
      "a preview of the sound applied to your work.",
    "(ISAMO !) is still in development. It will be freely available when it's ready.",
    'hope so lol',
    'enough',
    'please',
    'turn up the volume, coward',
    'NOG7 14 JUNE 2026 !',
    "I have nothing more to tell you in this version of (ISAMO !); enjoy using the app!",
  ],

  uploadText:      "Upload your clip,\nThe playback will be sync to the sound you've chosen.",
  boardUploadText: "Upload your clip,\n(ISAMO !) will recognize and categorize it for the Board.",

  soundPlayerHintSuffix:     'to open the Sound Player.',
  soundPlayerHintSuffixCtrl: ' to open the Sound Player.',

  accountWip: 'The account section is still a work in progress!',

  onlineInfoText:
    "In its final version, (ISAMO !) will feature, in the community section, the Board: a moodboard " +
    "showing a mix of videos uploaded by users using the sounds available in the app, alongside " +
    "a selection of videos by previously selected artists and designers.",

  artistBios: {
    '...': "In its final version, (ISAMO !) will feature sound packs created by various artists. This section therefore offers an example of what the Artists section will provide.",
    Egemonia:  'Sound designer and visual artist. His work explores the relationship between sound and moving image, developing sonic textures built to inhabit graphic spaces in constant transformation.',
    'Kay Yoko': 'Composer and sound researcher. Her packs move between minimalism and density, offering material suited to sustain slow or frantic visual sequences with equal coherence.',
    Maclow:    'Producer and sound artist. His sounds grow from field recordings elaborated until they become abstract elements, conceived to be applied to motion graphics.',
    Rusowsky:  'Musician and producer. His sonic research spans genres and formats, producing packs capable of adapting to heterogeneous graphic contexts while keeping a recognisable centre.',
    Sampha:    'Artist and composer. The sounds selected for (ISAMO !) reflect his ability to build interior landscapes through essential elements, suited to accompany images in motion.',
  },

  fxExplanations: {
    Equalizer:    'Adjusts the balance of low, mid and high frequencies in the sound.',
    Reverb:       'Adds a sense of space, as if the sound were playing in a room or hall.',
    'Left/Right': 'Moves the sound between the left and right speakers.',
    Delay:        'Repeats the sound in echoes, spaced out over time.',
    Flanger:      'Sweeps the sound through a moving comb-filter, for a jet-like swooshing effect.',
    Arpeggiator:  'Chops the sound into a rhythmic, pulsing pattern.',
  },

  navExplanations: {
    Library:   "(ISAMO !)'s sound library, organised by motion-design movements and archetypes.",
    Community: "(ISAMO !)'s community space: the Board and contributions from its users.",
    Artists:   'Sound packs crafted by a selection of invited artists and designers.',
    Settings:  '(ISAMO !) settings: audio, display, language and account.',
    // Library X
    Movement: 'Sounds tied to an element moving through space.',
    Camera:   'Sounds tied to camera moves and cuts.',
    Effects:  'Sounds for visual effects like glitch and strobe.',
    Backing:  'Beds and background voices to sit under the image.',
    // Library Z
    Rotation: 'Sounds for elements that spin and rotate.',
    Space:    'Sounds for translations and shifts through space.',
    Zoom:     'Sounds for the camera moving in and out.',
    Depth:    'Sounds tied to depth of field and focus.',
    Cuts:     'Sounds for cuts and editing transitions.',
    Glitch:   'Sounds of digital noise and malfunction.',
    Strobe:   'Pulsing, stroboscopic sounds.',
    Ambient:  'Ambient atmospheres and sonic beds.',
    Voices:   'Background voices and vocal textures.',
    // Community X
    Board:  'A moodboard of clips uploaded by the community using (ISAMO !) sounds.',
    Upload: 'Upload your own clip to add it to the Board.',
    // Settings X
    Audio:    'Audio settings and the synthetic voice (TTS).',
    Display:  'Colour and appearance settings.',
    Language: 'Change the interface language.',
    Account:  'Account management (coming soon).',
  },

  fxEnterHint: 'to enter effects mode.',
  fxEscHint:   'to return to sound selection.',

  isamoWords: ['Intelligent', 'Sound', 'And', 'Motion', 'Organiser'],
};

// ─────────────────────────────────────────────────────────────────────────────
const IT: LangStrings = {
  pressPrefix:  'Premi ',
  pressOr:      ' o ',
  pressSuffix:  ' per iniziare',
  navHint1:     "(ISAMO !) preferisce l'utilizzazione principale della tastiera per la navigazione.",
  navHintUse:   'Usa',
  navHintExplore: 'per esplorare.',

  welcomeText:
    "(ISAMO !) (Intelligent Sound And Motion Organiser) è una sound library open-source " +
    "indirizzata a designer grafici, motion designers e visual artists.",

  ttsPhrases: [
    "(ISAMO !) propone all'utente di esplorare la banca suoni, categorizzata sulla base di " +
      "movimenti e archetipi derivanti direttamente dall'ambito della grafica animata. " +
      "Ogni suono è stato meticolosamente realizzato allo scopo di rappresentare al meglio " +
      "tali caratteristiche.",
    'FUCK BENJAMIN NETHANYAHU !!!!!!!',
    'Scusami. Dovevo.',
    "(ISAMO !) permette agli utenti di riprodurre, modificare e scaricare i suoni presenti " +
      "direttamente in-app. La sezione Libreria non implica limiti di diritti d'autore.",
    "È possibile uplodare i propri video nella sezione Sound Player allo scopo di avere " +
      "un anteprima del suono applicato ai lavori dell'utente.",
    '(ISAMO !) è ancora in sviluppo. Sarà disponibile liberamente quando sarà pronto.',
    'spero lol',
    'basta',
    'ti prego',
    'alza il volume, codardo',
    'NOG7 14 JUIN 2026 !',
    "Non ho più nulla da raccontarti in questa versione di (ISAMO !); divertiti a utilizzare l'app!",
  ],

  uploadText:      "Carica il tuo clip,\nLa riproduzione sarà sincronizzata al suono che hai scelto.",
  boardUploadText: "Carica il tuo clip,\n(ISAMO !) lo riconoscerà e lo categorizzerà per la Board.",

  soundPlayerHintSuffix:     'per aprire il Sound Player.',
  soundPlayerHintSuffixCtrl: ' per aprire il Sound Player.',

  accountWip: 'La sezione account è ancora un work in progress!',

  onlineInfoText:
    "(ISAMO !), nella sua versione finale, presenterà nella sezione community la Board, un moodboard " +
    "presentante un mix di video caricati dagli utenti utilizzanti i suoni disponibili " +
    "nell'applicazione e una selezione di video di artisti e designer selezionati in precedenza.",

  artistBios: {
    '...': '(ISAMO !), nella versione finale, presenterà dei sound packs realizzati da diversi artisti. In questa sezione trovi dunque un esempio di ciò che la sezione Artists proporrà.',
    Egemonia:  'Sound designer e visual artist. Il suo lavoro esplora la relazione tra suono e immagine in movimento, sviluppando texture sonore costruite per abitare spazi grafici in continua trasformazione.',
    'Kay Yoko': 'Compositrice e ricercatrice del suono. I suoi pack si muovono tra minimalismo e densità, offrendo materiale adatto a sostenere sequenze visive lente o frenetiche con la stessa coerenza.',
    Maclow:    'Produttore e sound artist. I suoi suoni nascono da registrazioni sul campo elaborate fino a diventare elementi astratti, pensati per essere applicati su supporti grafici in movimento.',
    Rusowsky:  'Musicista e producer. La sua ricerca sonora attraversa generi e formati, producendo pack capaci di adattarsi a contesti grafici eterogenei mantenendo un centro riconoscibile.',
    Sampha:    'Artista e compositore. I suoni selezionati per (ISAMO !) riflettono la sua capacità di costruire paesaggi interni attraverso elementi essenziali, adatti ad accompagnare immagini in movimento.',
  },

  fxExplanations: {
    Equalizer:    'Regola il bilanciamento tra frequenze basse, medie e alte del suono.',
    Reverb:       'Aggiunge un senso di spazio, come se il suono risuonasse in una stanza o in una sala.',
    'Left/Right': 'Sposta il suono tra l\'altoparlante sinistro e quello destro.',
    Delay:        'Ripete il suono in eco, distanziate nel tempo.',
    Flanger:      'Fa scorrere il suono attraverso un filtro a pettine in movimento, per un effetto "swoosh" simile a un jet.',
    Arpeggiator:  'Spezzetta il suono in un pattern ritmico e pulsante.',
  },

  navExplanations: {
    Library:   'La libreria di suoni di (ISAMO !), organizzata per movimenti e archetipi del motion design.',
    Community: 'Lo spazio community di (ISAMO !): la Board e i contributi degli utenti.',
    Artists:   'Sound pack realizzati da una selezione di artisti e designer invitati.',
    Settings:  'Le impostazioni di (ISAMO !): audio, schermo, lingua e account.',
    // Library X
    Movement: 'Suoni legati al movimento di un elemento nello spazio.',
    Camera:   'Suoni legati ai movimenti e ai tagli di camera.',
    Effects:  'Suoni per effetti visivi come glitch e strobo.',
    Backing:  'Tappeti sonori e voci di sottofondo per accompagnare le immagini.',
    // Library Z
    Rotation: 'Suoni per elementi che ruotano.',
    Space:    'Suoni per spostamenti e traslazioni nello spazio.',
    Zoom:     'Suoni per avvicinamenti e allontanamenti della camera.',
    Depth:    'Suoni legati alla profondità di campo e al fuoco.',
    Cuts:     'Suoni per stacchi e tagli di montaggio.',
    Glitch:   'Suoni di disturbo e malfunzionamento digitale.',
    Strobe:   'Suoni pulsanti e stroboscopici.',
    Ambient:  'Atmosfere e tappeti sonori ambientali.',
    Voices:   'Voci e texture vocali di sottofondo.',
    // Community X
    Board:  'Una moodboard di video caricati dalla community con i suoni di (ISAMO !).',
    Upload: 'Carica un tuo video per aggiungerlo alla Board.',
    // Settings X
    Audio:    'Impostazioni audio e della voce sintetica (TTS).',
    Display:  'Impostazioni dei colori e dell\'aspetto.',
    Language: 'Cambia la lingua dell\'interfaccia.',
    Account:  'Gestione dell\'account (in arrivo).',
  },

  fxEnterHint: 'per entrare in modalità effetti.',
  fxEscHint:   'per ritornare alla selezione del suono.',

  // Riordinate per senso logico (non più in ordine acronimo):
  // "Organizzatore Intelligente di Suono e Movimento"
  isamoWords: ['Organizzatore', 'Intelligente', 'Suono', 'E', 'Movimento'],
};

// ─────────────────────────────────────────────────────────────────────────────
const FR: LangStrings = {
  pressPrefix:  'Appuyez ',
  pressOr:      ' ou ',
  pressSuffix:  ' pour commencer',
  navHint1:     '(ISAMO !) est conçu principalement pour une navigation au clavier.',
  navHintUse:   'Utilisez',
  navHintExplore: 'pour explorer.',

  welcomeText:
    "(ISAMO !) (Intelligent Sound And Motion Organiser) est une bibliothèque sonore open-source " +
    "destinée aux designers graphiques, motion designers et artistes visuels.",

  ttsPhrases: [
    "(ISAMO !) propose à l'utilisateur d'explorer la banque de sons, catégorisée selon des " +
      "mouvements et archétypes issus directement du domaine du motion design. Chaque son " +
      "a été méticuleusement réalisé pour représenter au mieux ces caractéristiques.",
    'FUCK BENJAMIN NETHANYAHU !!!!!!!',
    "Désolé. Je devais le faire.",
    "(ISAMO !) permet aux utilisateurs d'écouter, modifier et télécharger les sons disponibles " +
      "directement dans l'application. La section Bibliothèque n'implique aucune limite de " +
      "droits d'auteur.",
    "Il est possible d'importer vos propres vidéos dans la section Sound Player afin " +
      "d'avoir un aperçu du son appliqué à vos travaux.",
    "(ISAMO !) est encore en développement. Il sera disponible gratuitement quand il sera prêt.",
    "j'espère lol",
    'stop',
    "je t'en supplie",
    'monte le son, lâche',
    'NOG7 14 JUIN 2026 !',
    "Je n'ai plus rien à te raconter dans cette version d'(ISAMO !) ; amuse-toi bien avec l'app !",
  ],

  uploadText:      "Importez votre clip,\nLa lecture sera synchronisée au son que vous avez choisi.",
  boardUploadText: "Importez votre clip,\n(ISAMO !) le reconnaîtra et le catégorisera pour le Board.",

  soundPlayerHintSuffix:     'pour ouvrir le Sound Player.',
  soundPlayerHintSuffixCtrl: ' pour ouvrir le Sound Player.',

  accountWip: "La section compte est encore en cours de développement !",

  onlineInfoText:
    "Dans sa version finale, (ISAMO !) proposera, dans la section communauté, la Board : un moodboard " +
    "présentant un mélange de vidéos publiées par les utilisateurs utilisant les sons disponibles " +
    "dans l'application, ainsi qu'une sélection de vidéos d'artistes et de designers sélectionnés " +
    "au préalable.",

  artistBios: {
    '...': "Dans sa version finale, (ISAMO !) proposera des sound packs réalisés par différents artistes. Cette section présente donc un exemple de ce que proposera la section Artists.",
    Egemonia:  "Sound designer et artiste visuel. Son travail explore la relation entre le son et l'image en mouvement, développant des textures sonores conçues pour habiter des espaces graphiques en transformation constante.",
    'Kay Yoko': "Compositrice et chercheuse en son. Ses packs oscillent entre minimalisme et densité, offrant un matériau adapté pour soutenir des séquences visuelles lentes ou frénétiques avec la même cohérence.",
    Maclow:    "Producteur et sound artist. Ses sons naissent d'enregistrements de terrain retravaillés jusqu'à devenir des éléments abstraits, conçus pour être appliqués à des supports graphiques en mouvement.",
    Rusowsky:  "Musicien et producteur. Sa recherche sonore traverse les genres et les formats, produisant des packs capables de s'adapter à des contextes graphiques hétérogènes tout en conservant un centre reconnaissable.",
    Sampha:    "Artiste et compositeur. Les sons sélectionnés pour (ISAMO !) reflètent sa capacité à construire des paysages intérieurs à travers des éléments essentiels, adaptés pour accompagner des images en mouvement.",
  },

  fxExplanations: {
    Equalizer:    "Ajuste l'équilibre entre les fréquences graves, médiums et aiguës du son.",
    Reverb:       "Ajoute une sensation d'espace, comme si le son résonnait dans une pièce ou une salle.",
    'Left/Right': "Déplace le son entre le haut-parleur gauche et le droit.",
    Delay:        "Répète le son en échos, espacés dans le temps.",
    Flanger:      "Fait balayer le son par un filtre en peigne mouvant, pour un effet de souffle façon réacteur.",
    Arpeggiator:  "Découpe le son en un motif rythmique et pulsé.",
  },

  navExplanations: {
    Library:   "La bibliothèque sonore d'(ISAMO !), organisée par mouvements et archétypes du motion design.",
    Community: "L'espace communauté d'(ISAMO !) : le Board et les contributions des utilisateurs.",
    Artists:   "Des sound packs réalisés par une sélection d'artistes et de designers invités.",
    Settings:  "Les réglages d'(ISAMO !) : audio, affichage, langue et compte.",
    // Library X
    Movement: "Sons liés au déplacement d'un élément dans l'espace.",
    Camera:   "Sons liés aux mouvements et aux coupes de caméra.",
    Effects:  "Sons pour des effets visuels comme le glitch et le stroboscope.",
    Backing:  "Nappes et voix de fond pour accompagner l'image.",
    // Library Z
    Rotation: "Sons pour des éléments qui tournent.",
    Space:    "Sons pour des déplacements et translations dans l'espace.",
    Zoom:     "Sons pour les rapprochements et éloignements de caméra.",
    Depth:    "Sons liés à la profondeur de champ et à la mise au point.",
    Cuts:     "Sons pour les coupes et transitions de montage.",
    Glitch:   "Sons de bruit et de dysfonctionnement numérique.",
    Strobe:   "Sons pulsés et stroboscopiques.",
    Ambient:  "Atmosphères et nappes sonores d'ambiance.",
    Voices:   "Voix et textures vocales de fond.",
    // Community X
    Board:  "Une moodboard de clips publiés par la communauté avec les sons d'(ISAMO !).",
    Upload: "Importez votre clip pour l'ajouter au Board.",
    // Settings X
    Audio:    "Réglages audio et de la voix de synthèse (TTS).",
    Display:  "Réglages des couleurs et de l'apparence.",
    Language: "Changez la langue de l'interface.",
    Account:  "Gestion du compte (à venir).",
  },

  fxEnterHint: "pour passer en mode effets.",
  fxEscHint:   "pour revenir à la sélection du son.",

  // Réordonné pour un sens logique : "Organisateur Intelligent de Son et Mouvement"
  isamoWords: ['Organisateur', 'Intelligent', 'Son', 'Et', 'Mouvement'],
};

// ─────────────────────────────────────────────────────────────────────────────
const JP: LangStrings = {
  pressPrefix:  '',
  pressOr:      ' または ',
  pressSuffix:  ' を押してスタート',
  navHint1:     '(ISAMO !)は主にキーボード操作向けに設計されています。',
  navHintUse:   '',
  navHintExplore: 'で探索できます。',

  welcomeText:
    '(ISAMO !)（インテリジェント・サウンド・アンド・モーション・オーガナイザー）は、' +
    'グラフィックデザイナー、モーションデザイナー、ビジュアルアーティストに向けた' +
    'オープンソースのサウンドライブラリです。',

  ttsPhrases: [
    '(ISAMO !)は、モーショングラフィックスの分野から直接派生した動きとアーキタイプに' +
      '基づいて分類されたサウンドバンクを探索することをユーザーに提案します。' +
      '各サウンドは、その特性を最大限に表現するために緻密に制作されています。',
    'FUCK BENJAMIN NETHANYAHU !!!!!!!',
    'ごめん。仕方なかった。',
    '(ISAMO !)では、アプリ内で直接サウンドを再生、編集、ダウンロードできます。' +
      'ライブラリセクションには著作権の制限はありません。',
    'サウンドプレーヤーセクションでは、自分の動画をアップロードして、作品に' +
      '適用したサウンドのプレビューを確認できます。',
    '(ISAMO !)はまだ開発中です。準備が整い次第、無料で公開されます。',
    'そう願う（笑）',
    'もう十分だ',
    '頼むから',
    '音量を上げろ、意気地なし',
    'NOG7 2026年6月14日！',
    'このバージョンの(ISAMO !)ではもう話すことがありません。アプリを楽しんでください！',
  ],

  uploadText:      'クリップをアップロード\n選んだ音に再生が同期されます。',
  boardUploadText: 'クリップをアップロード\n(ISAMO !)が認識してボード用に分類します。',

  soundPlayerHintSuffix:     'を押してサウンドプレーヤーを開く。',
  soundPlayerHintSuffixCtrl: ' を押してサウンドプレーヤーを開く。',

  accountWip: 'アカウントセクションはまだ開発中です！',

  onlineInfoText:
    '(ISAMO !)は最終版において、コミュニティセクションにBoardを搭載する予定です。Boardは、' +
    'アプリ内で利用可能なサウンドを使用したユーザーによるアップロード動画と、事前に選定された' +
    'アーティストやデザイナーの動画を組み合わせたムードボードです。',

  artistBios: {
    '...': '(ISAMO !)は最終版において、さまざまなアーティストによるサウンドパックを提供する予定です。このセクションは、Artistsセクションが提供する内容の一例です。',
    Egemonia:  'サウンドデザイナー兼ビジュアルアーティスト。音と動く映像の関係を探求し、絶えず変化するグラフィック空間に宿るために作られた音のテクスチャを生み出す。',
    'Kay Yoko': '作曲家でありサウンドの研究者。彼女のパックはミニマリズムと密度の間を行き来し、緩やかな映像も激しい映像も同じ一貫性で支える素材を提供する。',
    Maclow:    'プロデューサー兼サウンドアーティスト。フィールド録音を抽象的な要素になるまで加工し、動くグラフィックに適用するために構想された音を生み出す。',
    Rusowsky:  'ミュージシャン兼プロデューサー。彼の音響探求はジャンルと形式を横断し、認識できる中心を保ちながら多様なグラフィック文脈に適応するパックを生み出す。',
    Sampha:    'アーティスト兼作曲家。(ISAMO !)のために選ばれた音は、本質的な要素を通して内面的な風景を構築する彼の能力を反映し、動く映像に寄り添う。',
  },

  fxExplanations: {
    Equalizer:    '音の低音・中音・高音のバランスを調整します。',
    Reverb:       '部屋やホールで鳴っているかのような空間の響きを加えます。',
    'Left/Right': '音を左右のスピーカーの間で移動させます。',
    Delay:        '音を時間差のあるエコーとして繰り返します。',
    Flanger:      '動くくし形フィルターを通して音を揺らし、ジェット機のようなシュワッという効果を生みます。',
    Arpeggiator:  '音をリズミカルに脈打つパターンに切り刻みます。',
  },

  navExplanations: {
    Library:   'モーションデザインの動きとアーキタイプで分類された、(ISAMO !)のサウンドライブラリ。',
    Community: '(ISAMO !)のコミュニティ空間：Boardとユーザーによる投稿。',
    Artists:   '招かれたアーティストやデザイナーが手がけたサウンドパック。',
    Settings:  '(ISAMO !)の設定：オーディオ、ディスプレイ、言語、アカウント。',
    // Library X
    Movement: '空間を動く要素にまつわる音。',
    Camera:   'カメラの動きやカットにまつわる音。',
    Effects:  'グリッチやストロボなどの視覚効果のための音。',
    Backing:  '映像の下に敷く背景の音や声。',
    // Library Z
    Rotation: '回転する要素のための音。',
    Space:    '空間内の移動や平行移動のための音。',
    Zoom:     'カメラの寄り引きのための音。',
    Depth:    '被写界深度やフォーカスにまつわる音。',
    Cuts:     'カットや編集のつなぎのための音。',
    Glitch:   'デジタルなノイズや誤作動の音。',
    Strobe:   '脈打つストロボのような音。',
    Ambient:  'アンビエントな空気感や音のベッド。',
    Voices:   '背景の声やボーカルのテクスチャ。',
    // Community X
    Board:  '(ISAMO !)の音を使ってコミュニティが投稿した動画のムードボード。',
    Upload: '自分の動画をアップロードしてBoardに追加します。',
    // Settings X
    Audio:    'オーディオと合成音声（TTS）の設定。',
    Display:  '色と外観の設定。',
    Language: 'インターフェースの言語を変更します。',
    Account:  'アカウント管理（近日公開）。',
  },

  fxEnterHint: 'でエフェクトモードに入ります。',
  fxEscHint:   'で音の選択に戻ります。',

  isamoWords: ['インテリジェント', 'サウンド', 'アンド', 'モーション', 'オーガナイザー'],
};

// ─────────────────────────────────────────────────────────────────────────────
export const STRINGS: Record<Lang, LangStrings> = { en: EN, it: IT, fr: FR, jp: JP };
export function getStrings(lang: Lang): LangStrings { return STRINGS[lang]; }

// ── XMB navigation labels (categories + sub-categories) ──────────────────────
// Keyed by the English label used in CATEGORIES (Home.tsx). Only languages that
// actually localise the nav labels need an entry; missing → original English.
// NB: Board stays "Board" in every language (no entry). Community / Backing keep
// their English spelling everywhere EXCEPT Japanese (entry only under `jp`).
// The TTS setting is labelled "TTS" everywhere (no entry → fallback).
const NAV_LABELS: Partial<Record<Lang, Record<string, string>>> = {
  jp: {
    // Y categories
    Community: 'コミュニティ', Library: 'ライブラリ', Settings: '設定', Artists: 'アーティスト',
    // Community
    Upload: 'アップロード',
    // Library X
    Movement: '動き', Camera: 'カメラ', Effects: 'エフェクト', Backing: 'バッキング',
    // Library Z
    Rotation: '回転', Space: '空間', Zoom: 'ズーム', Depth: '深度', Cuts: 'カット',
    Glitch: 'グリッチ', Strobe: 'ストロボ', Ambient: 'アンビエント', Voices: 'ボイス',
    // Settings X
    Audio: 'オーディオ', Display: 'ディスプレイ', Language: '言語', Account: 'アカウント',
    // Settings W (titles)
    'UI Sounds': 'UIサウンド', 'Color 1': 'カラー1', 'Color 2': 'カラー2',
    // TTS param labels
    On: 'オン', Off: 'オフ', Pitch: 'ピッチ', Speed: '速度', Quality: '品質',
    Tone: 'トーン', Accent: 'アクセント', 'Inton.': '抑揚', Lang: '言語',
    // Colours
    Black: 'ブラック', Pink: 'ピンク', Red: 'レッド', Orange: 'オレンジ', Green: 'グリーン', Purple: 'パープル',
    // Artist sound level
    Sounds: 'サウンド', 'Sound player': 'サウンドプレーヤー',
    // Library Z (axis sublevels)
    'X-Axis': 'X軸', 'Y-Axis': 'Y軸', 'Z-Axis': 'Z軸',
    // FX panel — group labels
    Equalizer: 'イコライザー', Reverb: 'リバーブ', 'Left/Right': '左/右', Delay: 'ディレイ',
    Flanger: 'フランジャー', Arpeggiator: 'アルペジエーター',
    // FX panel — delay division (qualitative)
    LITTLE: '少し', MEDIUM: '普通', 'A LOT': '多い', MAX: '最大',
    // FX panel — arpeggiator on/off
    YES: 'はい', NO: 'いいえ',
  },
  it: {
    Library: 'Libreria', Settings: 'Impostazioni', Artists: 'Artisti',
    Upload: 'Carica',
    Movement: 'Movimento', Camera: 'Camera', Effects: 'Effetti',
    Rotation: 'Rotazione', Space: 'Spazio', Zoom: 'Zoom', Depth: 'Profondità', Cuts: 'Tagli',
    Glitch: 'Glitch', Strobe: 'Strobo', Ambient: 'Ambiente', Voices: 'Voci',
    Audio: 'Audio', Display: 'Schermo', Language: 'Lingua', Account: 'Account',
    'UI Sounds': 'Suoni UI', 'Color 1': 'Colore 1', 'Color 2': 'Colore 2',
    On: 'On', Off: 'Off', Pitch: 'Altezza', Speed: 'Velocità', Quality: 'Qualità',
    Tone: 'Timbro', Accent: 'Accento', 'Inton.': 'Inton.', Lang: 'Lingua',
    Black: 'Nero', Pink: 'Rosa', Red: 'Rosso', Orange: 'Arancione', Green: 'Verde', Purple: 'Viola',
    Sounds: 'Suoni', 'Sound player': 'Lettore audio',
    'X-Axis': 'Asse X', 'Y-Axis': 'Asse Y', 'Z-Axis': 'Asse Z',
    // FX panel — group labels
    Equalizer: 'Equalizzatore', Reverb: 'Riverbero', 'Left/Right': 'Sinistra/Destra',
    Arpeggiator: 'Arpeggiatore',
    // FX panel — delay division (qualitative)
    LITTLE: 'POCO', MEDIUM: 'MEDIO', 'A LOT': 'TANTO',
    // FX panel — arpeggiator on/off
    YES: 'SI', NO: 'NO',
  },
  fr: {
    Library: 'Bibliothèque', Settings: 'Réglages', Artists: 'Artistes',
    Upload: 'Importer',
    Movement: 'Mouvement', Camera: 'Caméra', Effects: 'Effets',
    Rotation: 'Rotation', Space: 'Espace', Zoom: 'Zoom', Depth: 'Profondeur', Cuts: 'Coupes',
    Glitch: 'Glitch', Strobe: 'Strobe', Ambient: 'Ambiance', Voices: 'Voix',
    Audio: 'Audio', Display: 'Affichage', Language: 'Langue', Account: 'Compte',
    'UI Sounds': 'Sons UI', 'Color 1': 'Couleur 1', 'Color 2': 'Couleur 2',
    On: 'On', Off: 'Off', Pitch: 'Hauteur', Speed: 'Vitesse', Quality: 'Qualité',
    Tone: 'Timbre', Accent: 'Accent', 'Inton.': 'Inton.', Lang: 'Langue',
    Black: 'Noir', Pink: 'Rose', Red: 'Rouge', Orange: 'Orange', Green: 'Vert', Purple: 'Violet',
    Sounds: 'Sons', 'Sound player': 'Lecteur audio',
    'X-Axis': 'Axe X', 'Y-Axis': 'Axe Y', 'Z-Axis': 'Axe Z',
    // FX panel — group labels
    Equalizer: 'Égaliseur', Reverb: 'Réverbération', 'Left/Right': 'Gauche/Droite',
    Arpeggiator: 'Arpégiateur',
    // FX panel — delay division (qualitative)
    LITTLE: 'PEU', MEDIUM: 'MID', 'A LOT': 'WOW',
    // FX panel — arpeggiator on/off
    YES: 'OUI', NO: 'NON',
  },
};

/** Localise an XMB nav label; falls back to the original when untranslated. */
export function tLabel(label: string, lang: Lang): string {
  return NAV_LABELS[lang]?.[label] ?? label;
}
