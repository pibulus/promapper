/**
 * Demo Presets — Curated pop-culture stories with a twist.
 *
 * Each preset is a fully formed, hilarious, and recognizable board:
 * 1. Terminator 2: Cyberdyne Raid & Zero Casualties Debrief
 * 2. Sailor Moon: Tokyo District Defense & English Exam Prep
 * 3. Evil Wizard: Obsidian Spire Logistics & Blood Moon Alignment
 * 4. Dusty Gulch: The Prize Pig Biting Incident (Classic Pablo)
 *
 * Every preset provides:
 * - Rich diarized dialogue with distinct speaker palettes
 * - Tangled non-chronological topic graph with emojis and edges
 * - Action items with assignees, dates, and an AI-ticked-off task with reasoning
 * - Wry, voice-driven executive summary
 * - Curated notes
 */

import type { ConversationData } from "@core/types/conversation-data.ts";

const NOW = "2026-09-29T01:00:00.000Z";

/* ===================================================================
   1. TERMINATOR 2: CYBERDYNE RAID
   =================================================================== */
const T2_TRANSCRIPT =
  `John: Alright, Dyson's agreed to destroy all the research at Cyberdyne. Let's start from the top.
Sarah: No loose ends. We melt the chip, we melt the arm, and we destroy the central server room with remote thermite.
Dyson: Wait, before we burn the vault, did anyone bring quarters for the breakroom vending machine? There's one bag of Funyuns left and the world is ending anyway.
Sarah: Miles, focus! What about the getaway car?
T-800: I have hotwired a 1987 station wagon. I also affixed a 'Baby On Board' suction sign to the rear windshield.
John: Why did you do that?!
T-800: John Connor is technically ten years old. Defensive driving protocols state traffic awareness increases by 14%. Casualties will be zero.
Sarah: Did you get the crowd dispersal gear?
T-800: I have procured the minigun and 40mm tear gas canisters. No human targets will be terminated.
John: And what happens to you when the lab is rubble?
T-800: I cannot self-terminate. Someone must lower me into the molten steel vat.
Sarah: I'll do it. Grab the duffel bags and the Funyuns. Judgement Day was supposed to be August 29th; we're running out of timeline.`;

export const DEMO_T2: ConversationData = {
  conversation: {
    id: "demo-t2-cyberdyne",
    title: "Cyberdyne Raid & Timeline Prevention Sync",
    source: "text",
    transcript: T2_TRANSCRIPT,
    created_at: NOW,
  },
  transcript: {
    text: T2_TRANSCRIPT,
    speakers: ["John", "Sarah", "Dyson", "T-800"],
  },
  nodes: [
    { id: "t2_n1", label: "The 1984 Microchip", emoji: "💾", color: "#00E5FF" },
    { id: "t2_n2", label: "Cyberdyne Vault", emoji: "🏢", color: "#FF5522" },
    { id: "t2_n3", label: "Molten Steel Vat", emoji: "🌋", color: "#FF8A4C" },
    {
      id: "t2_n4",
      label: "Baby On Board Sign",
      emoji: "🚼",
      color: "#FFE600",
    },
    { id: "t2_n5", label: "Minigun & Tear Gas", emoji: "💥", color: "#5B9E8F" },
    { id: "t2_n6", label: "Breakroom Funyuns", emoji: "🧅", color: "#ff6ac2" },
    { id: "t2_n7", label: "Thumbs-Up Protocol", emoji: "👍", color: "#EADCC9" },
  ],
  edges: [
    {
      id: "t2_e1",
      source_topic_id: "t2_n1",
      target_topic_id: "t2_n2",
      color: "",
    },
    {
      id: "t2_e2",
      source_topic_id: "t2_n2",
      target_topic_id: "t2_n6",
      color: "",
    },
    {
      id: "t2_e3",
      source_topic_id: "t2_n1",
      target_topic_id: "t2_n3",
      color: "",
    },
    {
      id: "t2_e4",
      source_topic_id: "t2_n4",
      target_topic_id: "t2_n5",
      color: "",
    },
    {
      id: "t2_e5",
      source_topic_id: "t2_n3",
      target_topic_id: "t2_n7",
      color: "",
    },
    {
      id: "t2_e6",
      source_topic_id: "t2_n2",
      target_topic_id: "t2_n5",
      color: "",
    },
  ],
  actionItems: [
    {
      id: "t2_a1",
      conversation_id: "demo-t2-cyberdyne",
      description: "Acquire 40mm tear gas launcher and minigun for suppression",
      assignee: "T-800",
      due_date: "tonight",
      status: "completed",
      created_at: NOW,
      updated_at: NOW,
      ai_checked: true,
      checked_reason:
        "T-800 confirmed procurement of the minigun and gas canisters with zero casualties.",
    },
    {
      id: "t2_a2",
      conversation_id: "demo-t2-cyberdyne",
      description:
        "Raid breakroom vending machine for final pre-apocalypse Funyuns",
      assignee: "Dyson",
      due_date: "before the thermite",
      status: "pending",
      created_at: NOW,
      updated_at: NOW,
    },
    {
      id: "t2_a3",
      conversation_id: "demo-t2-cyberdyne",
      description: "Rig remote thermite charges across main server farm",
      assignee: "Sarah",
      due_date: "tonight",
      status: "pending",
      created_at: NOW,
      updated_at: NOW,
    },
    {
      id: "t2_a4",
      conversation_id: "demo-t2-cyberdyne",
      description:
        "Lower the T-800 into the molten steel vat after chip incinerates",
      assignee: "Sarah",
      due_date: "final step",
      status: "pending",
      created_at: NOW,
      updated_at: NOW,
    },
    {
      id: "t2_a5",
      conversation_id: "demo-t2-cyberdyne",
      description:
        "Teach T-800 how to do a high-five without fracturing human metacarpals",
      assignee: "John",
      due_date: "whenever",
      status: "pending",
      created_at: NOW,
      updated_at: NOW,
    },
  ],
  statusUpdates: [
    {
      id: "t2_a1",
      description: "Acquire 40mm tear gas launcher and minigun for suppression",
      status: "completed",
      reason:
        "T-800 confirmed procurement of the minigun and gas canisters with zero casualties.",
    },
  ],
  summary:
    "Sarah Connor, John Connor, and the reprogrammed T-800 coordinate an emergency covert strike on Cyberdyne Systems with Miles Dyson to avert Judgement Day. Dyson has agreed to liquidate all company neural-net research after securing the final breakroom Funyuns, while the T-800 has secured a station wagon with a 'Baby On Board' sign to optimize getaway safety. Total timeline survival requires incinerating the 1984 processor artifact and the T-800 unit itself in molten industrial steel.",
  notes:
    "T-800 confirmed hardcoded architectural inability to self-terminate. Defensive driving protocol projected to reduce civilian casualties by 14%.",
};

/* ===================================================================
   2. SAILOR MOON: TOKYO DISTRICT DEFENSE & ENGLISH EXAM
   =================================================================== */
const MOON_TRANSCRIPT =
  `Luna: Usagi, you were forty minutes late again! The Dark Kingdom was siphoning human energy at the Crown Arcade!
Usagi: I was studying! Okay, I was sleeping, but I fell asleep with the English textbook open on my face, which is basically osmosis!
Ami: I calculated your passing probability at 11.4%, Usagi. I color-coded seventy-two irregular verb flashcards.
Usagi: Ami-chan, you're ruining my mood! Did Tuxedo Mask show up to help?
Tuxedo Mask: (from the second-story balcony) I hurled a single crimson rose into the fountain and delivered a dramatic thirty-second monologue. My work here is done.
Usagi: You hit an empty soda can! The shadow fiends didn't even notice you!
Tuxedo Mask: The dramatic resonance was impeccable. Farewell! (leaps off balcony into bushes)
Luna: He does this every single Tuesday. Usagi, Queen Beryl is mobilizing, and your exam starts at 8:00 AM.
Ami: Statistically, his rose had 0% tactical combat impact, but Usagi's heart rate spiked 40%.
Usagi: See?! Love conquers all! Now who is buying the custard pork buns?
Luna: Nobody until you memorize the past participle of 'to freeze'.
Usagi: Moon Prism Power first, past participles second.`;

export const DEMO_SAILOR_MOON: ConversationData = {
  conversation: {
    id: "demo-sailor-moon",
    title: "Dark Kingdom Energy Defense & English Mid-Term Sync",
    source: "text",
    transcript: MOON_TRANSCRIPT,
    created_at: NOW,
  },
  transcript: {
    text: MOON_TRANSCRIPT,
    speakers: [
      "Luna",
      "Usagi",
      "Ami",
      "Tuxedo Mask",
    ],
  },
  nodes: [
    {
      id: "moon_n1",
      label: "Crown Arcade Incursion",
      emoji: "🕹️",
      color: "#FF5522",
    },
    {
      id: "moon_n2",
      label: "Textbook Osmosis Sleep",
      emoji: "📖",
      color: "#ff6ac2",
    },
    {
      id: "moon_n3",
      label: "English Mid-Term (8 AM)",
      emoji: "📝",
      color: "#FFE600",
    },
    {
      id: "moon_n4",
      label: "Rose Hits Soda Can",
      emoji: "🌹",
      color: "#FF8A4C",
    },
    {
      id: "moon_n5",
      label: "0% Tactical Combat Impact",
      emoji: "📉",
      color: "#00E5FF",
    },
    {
      id: "moon_n6",
      label: "Balcony Bush Leap",
      emoji: "🌳",
      color: "#5B9E8F",
    },
    {
      id: "moon_n7",
      label: "Custard Pork Buns",
      emoji: "🥟",
      color: "#EADCC9",
    },
  ],
  edges: [
    {
      id: "moon_e1",
      source_topic_id: "moon_n1",
      target_topic_id: "moon_n4",
      color: "",
    },
    {
      id: "moon_e2",
      source_topic_id: "moon_n4",
      target_topic_id: "moon_n5",
      color: "",
    },
    {
      id: "moon_e3",
      source_topic_id: "moon_n4",
      target_topic_id: "moon_n6",
      color: "",
    },
    {
      id: "moon_e4",
      source_topic_id: "moon_n2",
      target_topic_id: "moon_n3",
      color: "",
    },
    {
      id: "moon_e5",
      source_topic_id: "moon_n3",
      target_topic_id: "moon_n7",
      color: "",
    },
  ],
  actionItems: [
    {
      id: "moon_a1",
      conversation_id: "demo-sailor-moon",
      description:
        "Hurl crimson rose at fountain and declare work finished from balcony",
      assignee: "Tuxedo Mask",
      due_date: "tonight",
      status: "completed",
      created_at: NOW,
      updated_at: NOW,
      ai_checked: true,
      checked_reason:
        "Tuxedo Mask confirmed he hurled the rose, delivered the monologue, and leapt into the bushes.",
    },
    {
      id: "moon_a2",
      conversation_id: "demo-sailor-moon",
      description: "Deploy Moon Tiara Action against arcade shadow fiends",
      assignee: "Usagi",
      due_date: "immediately",
      status: "pending",
      created_at: NOW,
      updated_at: NOW,
    },
    {
      id: "moon_a3",
      conversation_id: "demo-sailor-moon",
      description:
        "Calculate Silver Crystal harmonic frequency on pocket computer",
      assignee: "Ami",
      due_date: "before dawn",
      status: "pending",
      created_at: NOW,
      updated_at: NOW,
    },
    {
      id: "moon_a4",
      conversation_id: "demo-sailor-moon",
      description:
        "Drill past participle of 'to freeze' until passing probability hits 50%",
      assignee: "Luna",
      due_date: "tonight",
      status: "pending",
      created_at: NOW,
      updated_at: NOW,
    },
    {
      id: "moon_a5",
      conversation_id: "demo-sailor-moon",
      description:
        "Buy custard pork buns only after homework flashcards are signed",
      assignee: "Luna",
      due_date: "after battle",
      status: "pending",
      created_at: NOW,
      updated_at: NOW,
    },
  ],
  statusUpdates: [
    {
      id: "moon_a1",
      description:
        "Hurl crimson rose at fountain and declare work finished from balcony",
      status: "completed",
      reason:
        "Tuxedo Mask confirmed he hurled the rose, delivered the monologue, and leapt into the bushes.",
    },
  ],
  summary:
    "The Sailor Guardians hold an emergency strategy session balancing a Dark Kingdom energy siphon at the Crown Arcade against Usagi's perilous 11.4% projected passing rate on her 8:00 AM English exam. Tuxedo Mask satisfied his tactical obligations by hitting an empty soda can with a rose, declaring his work finished, and leaping into the bushes. The protocol mandates immediate Moon Tiara deployment followed by rigorous irregular verb drills.",
  notes:
    "Tuxedo Mask rose confirmed to have 0% tactical combat efficacy and 94% aesthetic drama. Usagi's battle willingness remains strictly contingent on post-fight custard buns.",
};

/* ===================================================================
   3. EVIL WIZARD: OBSIDIAN SPIRE LOGISTICS & BLOOD MOON ALIGNMENT
   =================================================================== */
const WIZARD_TRANSCRIPT =
  `Lord Malbad: Silence, minions! Tonight the blood moon crests over Mount Brimstone! Why is the Doom Ray not calibrated? Jorge, I explicitly ordered green obsidian crystal for the central focus array!
Jorge: Boss, the quarry in the Shadow Realm was backordered on green obsidian. We got you mauve quartz instead. It still shoots a death beam, it's just more pastel.
Darf: Master, also, the dark raven arrived from the Nether Council. They're auditing our minion health insurance again. Apparently skeletons don't qualify for dental because they don't have gums.
Lord Malbad: Skeletons don't need dental, Darf! They are literally just teeth and bone! What about the pit of despair? Has the moat been stocked with carnivorous abyss eels?
Jorge: We ordered two crates from the trench, but the courier swapped the labels. Right now the moat has forty-eight domestic goldfish.
Sir Keith: (from hanging iron cage) If I may interject, the goldfish are remarkably soothing. Though I must ask: who hung the motivational kitten poster in the torture corridor?
Lord Malbad: The what?!
Darf: It says 'Hang In There', Master. With a little tabby on a branch. We felt the torture corridor lacked warmth.
Sir Keith: Honestly, it lifts the spirits. Though the dungeon humidity is doing terrible things to my holy greaves.
Lord Malbad: Why is the prisoner doing an interior design review?! Did you banish the village of Oakhaven yet?
Lord Malbad: I turned their mayor into an organic turnip thirty minutes ago. That's handled. But who left their cursed cauldron bubbling on medium-high in the east wing?
Jorge: That's the goblin stew. It needs to simmer.
Lord Malbad: Fine. Jorge, reinforce the drawbridge spikes and swap the goldfish. Darf, file the skeleton dental appeal and take down that kitten poster. Keith, quiet down or you're getting turned into a parsnip to keep the mayor company.`;

export const DEMO_EVIL_WIZARD: ConversationData = {
  conversation: {
    id: "demo-evil-wizard",
    title: "Obsidian Spire Blood Moon Alignment & Minion Logistics",
    source: "text",
    transcript: WIZARD_TRANSCRIPT,
    created_at: NOW,
  },
  transcript: {
    text: WIZARD_TRANSCRIPT,
    speakers: [
      "Lord Malbad",
      "Jorge",
      "Darf",
      "Sir Keith",
    ],
  },
  nodes: [
    {
      id: "wiz_n1",
      label: "Blood Moon Doom Ray",
      emoji: "🔮",
      color: "#9b5de5",
    },
    {
      id: "wiz_n2",
      label: "Mauve Quartz Death Ray",
      emoji: "💎",
      color: "#ff6ac2",
    },
    {
      id: "wiz_n3",
      label: "Skeleton Dental Audit",
      emoji: "💀",
      color: "#FFE600",
    },
    {
      id: "wiz_n4",
      label: "Moat Domestic Goldfish",
      emoji: "🐟",
      color: "#00E5FF",
    },
    {
      id: "wiz_n5",
      label: "Mayor Turned Turnip",
      emoji: "🥕",
      color: "#FF8A4C",
    },
    {
      id: "wiz_n6",
      label: "Torture Kitten Poster",
      emoji: "🐱",
      color: "#EADCC9",
    },
    {
      id: "wiz_n7",
      label: "East Wing Simmering Stew",
      emoji: "🍲",
      color: "#5B9E8F",
    },
  ],
  edges: [
    {
      id: "wiz_e1",
      source_topic_id: "wiz_n1",
      target_topic_id: "wiz_n2",
      color: "",
    },
    {
      id: "wiz_e2",
      source_topic_id: "wiz_n1",
      target_topic_id: "wiz_n4",
      color: "",
    },
    {
      id: "wiz_e3",
      source_topic_id: "wiz_n3",
      target_topic_id: "wiz_n1",
      color: "",
    },
    {
      id: "wiz_e4",
      source_topic_id: "wiz_n4",
      target_topic_id: "wiz_n6",
      color: "",
    },
    {
      id: "wiz_e5",
      source_topic_id: "wiz_n5",
      target_topic_id: "wiz_n6",
      color: "",
    },
    {
      id: "wiz_e6",
      source_topic_id: "wiz_n7",
      target_topic_id: "wiz_n1",
      color: "",
    },
  ],
  actionItems: [
    {
      id: "wiz_a1",
      conversation_id: "demo-evil-wizard",
      description:
        "Transfigure village mayor of Oakhaven into an organic turnip",
      assignee: "Lord Malbad",
      due_date: "before dusk",
      status: "completed",
      created_at: NOW,
      updated_at: NOW,
      ai_checked: true,
      checked_reason:
        "Lord Malbad confirmed he turned the mayor into a turnip thirty minutes ago.",
    },
    {
      id: "wiz_a2",
      conversation_id: "demo-evil-wizard",
      description: "Replace moat goldfish with flesh-eating abyss eels",
      assignee: "Jorge",
      due_date: "tomorrow",
      status: "pending",
      created_at: NOW,
      updated_at: NOW,
    },
    {
      id: "wiz_a3",
      conversation_id: "demo-evil-wizard",
      description:
        "Dispute Nether Council skeleton dental denial with anatomical proof",
      assignee: "Darf",
      due_date: "this week",
      status: "pending",
      created_at: NOW,
      updated_at: NOW,
    },
    {
      id: "wiz_a4",
      conversation_id: "demo-evil-wizard",
      description: "Calibrate mauve quartz focus prism for pastel death beam",
      assignee: "Jorge",
      due_date: "tonight",
      status: "pending",
      created_at: NOW,
      updated_at: NOW,
    },
    {
      id: "wiz_a5",
      conversation_id: "demo-evil-wizard",
      description:
        "Tear down 'Hang In There' kitten poster from torture corridor",
      assignee: "Darf",
      due_date: "immediately",
      status: "pending",
      created_at: NOW,
      updated_at: NOW,
    },
  ],
  statusUpdates: [
    {
      id: "wiz_a1",
      description:
        "Transfigure village mayor of Oakhaven into an organic turnip",
      status: "completed",
      reason:
        "Lord Malbad confirmed he turned the mayor into a turnip thirty minutes ago.",
    },
  ],
  summary:
    "Lord Malbad convenes an emergency lair sync in the Obsidian Spire ahead of tonight's blood moon alignment. Hardware compromises were forced across the lair: the Doom Ray has been fitted with mauve quartz due to supply shortages in the Shadow Realm, and the moat is currently populated by forty-eight domestic goldfish instead of abyss eels. Sir Keith praised the soothing ambience of the goldfish and a new 'Hang In There' kitten poster in the torture corridor, while the mayor of Oakhaven has already been neutralized via root-vegetable transfiguration.",
  notes:
    "Nether Council claims skeleton legions ineligible for dental coverage due to lack of gums. Darf to draft anatomical appeal. East wing goblin stew left simmering on medium-high.",
};

/* ===================================================================
   4. DUSTY GULCH: THE PRIZE PIG BITING INCIDENT (Classic Pablo)
   =================================================================== */
const DUSTY_TRANSCRIPT =
  `Sheriff Buck: Alright folks, settle down. We're here to discuss the... uh... biting situation. Mabel, you've got the floor.
Mabel: Thank you, Sheriff. Look, I'm not proud of it. But someone had to stand up to the Henderson boys and their prize pig. That animal has been terrorizing my vegetable garden for three months. Three! I tried talking, I tried fences, I tried a sternly worded letter pinned to the pig.
Doc Holloway: You pinned a letter to a pig?
Mabel: I did. It said "Please stop" in block capitals. The pig ate it.
Sheriff Buck: So you... bit the pig?
Mabel: I bit the pig. Yes. Just a little nip on the ear. It was a statement.
Old Man Perkins: That pig bit me first! Back in March! Nobody held a town hall for old Perkins!
Sheriff Buck: Perkins, we covered this. You were trying to ride the pig.
Old Man Perkins: I was breaking him in! The county fair is in September!
Doc Holloway: The real question is what we do about the Hendersons. They've been letting that pig roam free since before Mabel got feisty. And now Mrs. Patterson says she's been bitten too.
Sheriff Buck: Mrs. Patterson was bitten by the pig?
Doc Holloway: No, by Mabel. Mrs. Patterson said the pig "didn't look that sorry" about the garden situation and Mabel took exception.
Mabel: She was victim-blaming the vegetables!
Sheriff Buck: Alright. Here's what we're gonna do. First, I'll talk to the Hendersons about keeping the pig contained. Second, Mabel, no more biting. People or pigs. Third, Doc, check Mrs. Patterson for bite-related concerns.
Doc Holloway: I already checked Mrs. Patterson's arm. It's just a scratch, gave her a tetanus shot.
Sheriff Buck: Good. And Perkins, the pig is not a rodeo animal. Meeting adjourned.`;

export const DEMO_DUSTY: ConversationData = {
  conversation: {
    id: "demo-dusty-gulch",
    title: "The Biting Incident at Dusty Gulch Town Hall",
    source: "text",
    transcript: DUSTY_TRANSCRIPT,
    created_at: NOW,
  },
  transcript: {
    text: DUSTY_TRANSCRIPT,
    speakers: ["Sheriff Buck", "Mabel", "Doc Holloway", "Old Man Perkins"],
  },
  nodes: [
    {
      id: "dusty_n1",
      label: "The Henderson Prize Pig",
      emoji: "🐷",
      color: "#ff6ac2",
    },
    {
      id: "dusty_n2",
      label: "Mabel's Prize Garden",
      emoji: "🥕",
      color: "#5B9E8F",
    },
    {
      id: "dusty_n3",
      label: "The Biting Incident",
      emoji: "🦷",
      color: "#FF5522",
    },
    {
      id: "dusty_n4",
      label: "Pig-Riding Ambitions",
      emoji: "🤠",
      color: "#FFE600",
    },
    {
      id: "dusty_n5",
      label: "Mrs Patterson's Scratch",
      emoji: "🩹",
      color: "#FF8A4C",
    },
    {
      id: "dusty_n6",
      label: "Pinned 'Please Stop' Letter",
      emoji: "✉️",
      color: "#EADCC9",
    },
    {
      id: "dusty_n7",
      label: "Town Hall Ceasefire",
      emoji: "🏛️",
      color: "#00E5FF",
    },
  ],
  edges: [
    {
      id: "dusty_e1",
      source_topic_id: "dusty_n1",
      target_topic_id: "dusty_n2",
      color: "",
    },
    {
      id: "dusty_e2",
      source_topic_id: "dusty_n1",
      target_topic_id: "dusty_n6",
      color: "",
    },
    {
      id: "dusty_e3",
      source_topic_id: "dusty_n3",
      target_topic_id: "dusty_n1",
      color: "",
    },
    {
      id: "dusty_e4",
      source_topic_id: "dusty_n3",
      target_topic_id: "dusty_n5",
      color: "",
    },
    {
      id: "dusty_e5",
      source_topic_id: "dusty_n4",
      target_topic_id: "dusty_n1",
      color: "",
    },
    {
      id: "dusty_e6",
      source_topic_id: "dusty_n7",
      target_topic_id: "dusty_n3",
      color: "",
    },
  ],
  actionItems: [
    {
      id: "dusty_a1",
      conversation_id: "demo-dusty-gulch",
      description: "Inspect Mrs Patterson's arm and administer tetanus shot",
      assignee: "Doc Holloway",
      due_date: "today",
      status: "completed",
      created_at: NOW,
      updated_at: NOW,
      ai_checked: true,
      checked_reason:
        "Doc Holloway confirmed he already checked Mrs. Patterson's arm and administered tetanus shot.",
    },
    {
      id: "dusty_a2",
      conversation_id: "demo-dusty-gulch",
      description:
        "Issue official warning to Henderson boys regarding livestock perimeter",
      assignee: "Sheriff Buck",
      due_date: "tomorrow",
      status: "pending",
      created_at: NOW,
      updated_at: NOW,
    },
    {
      id: "dusty_a3",
      conversation_id: "demo-dusty-gulch",
      description: "Strictly cease biting people and pigs (official order)",
      assignee: "Mabel",
      due_date: "effective immediately",
      status: "pending",
      created_at: NOW,
      updated_at: NOW,
    },
    {
      id: "dusty_a4",
      conversation_id: "demo-dusty-gulch",
      description:
        "Cease attempting to rodeo break the Henderson pig for county fair",
      assignee: "Old Man Perkins",
      due_date: "indefinite",
      status: "pending",
      created_at: NOW,
      updated_at: NOW,
    },
    {
      id: "dusty_a5",
      conversation_id: "demo-dusty-gulch",
      description:
        "Procure bakery cookies for Mabel following high-stress hearing",
      assignee: "Anyone",
      due_date: "tonight",
      status: "pending",
      created_at: NOW,
      updated_at: NOW,
    },
  ],
  statusUpdates: [
    {
      id: "dusty_a1",
      description: "Inspect Mrs Patterson's arm and administer tetanus shot",
      status: "completed",
      reason:
        "Doc Holloway confirmed he already checked Mrs. Patterson's arm and administered tetanus shot.",
    },
  ],
  summary:
    "The town of Dusty Gulch convened an emergency town hall to arbitrate an escalating biting dispute. Gardener Mabel acknowledged biting the Henderson family's prize pig after it consumed her written petition and decimated her vegetables. The altercation escalated when Mabel bit Mrs. Patterson for unsympathetic vegetable commentary. Sheriff Buck issued a comprehensive non-biting injunction, while Old Man Perkins was barred from fair rodeo preparation.",
  notes:
    "Doc Holloway confirmed the tetanus shot took. The pig remains unrepentant regarding root vegetables.",
};

export const ALL_DEMOS: readonly ConversationData[] = [
  DEMO_T2,
  DEMO_SAILOR_MOON,
  DEMO_EVIL_WIZARD,
  DEMO_DUSTY,
];

/**
 * Roll a random demo board from the collection.
 */
export function getRandomDemo(): ConversationData {
  const index = Math.floor(Math.random() * ALL_DEMOS.length);
  return ALL_DEMOS[index];
}
