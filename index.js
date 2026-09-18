const express = require("express");
const {
  Client,
  GatewayIntentBits,
  ChannelType,
  EmbedBuilder
} = require("discord.js");
const OpenAI = require("openai");

// ======================================================
// RENDER HEALTH SERVER
// ======================================================

const app = express();
const PORT = process.env.PORT || 10000;

app.get("/", (req, res) => {
  res.send("Kain Po Tayo Team Ryzza Bot is online!");
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Health server running on port ${PORT}`);
});

// ======================================================
// ENVIRONMENT VARIABLES
// ======================================================

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!DISCORD_TOKEN) {
  console.error("❌ DISCORD_TOKEN is missing!");
  process.exit(1);
}

if (!OPENAI_API_KEY) {
  console.error("❌ OPENAI_API_KEY is missing!");
  process.exit(1);
}

// ======================================================
// OPENAI
// ======================================================

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY
});

// ======================================================
// DISCORD CLIENT
// ======================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ======================================================
// SETTINGS
// ======================================================

// Main Kain Po Tayo Team Ryzza channel
const FOOD_CHANNEL_ID = "1550189625954402314";

// Exact trigger
const FOOD_TRIGGER = "Kain Po Tayo Team Ryzza";

// AI model
const AI_MODEL = "gpt-5.6-luna";

// Maximum AI wait time
const AI_TIMEOUT_MS = 7000;

// Main channel slowmode
const FOOD_SLOWMODE_SECONDS = 30;

// One single public Party Chat
const PARTY_THREAD_NAME = "💬 Kain Po Tayo — Party Chat";

let partyThreadId = null;

// ======================================================
// ALLOWED FOOD EMOJIS
// ======================================================

const FOOD_EMOJI_LIST = [
  "🍞", // bread
  "🥖", // baguette
  "🥐", // croissant
  "🍳", // cooked egg
  "🥚", // egg
  "🧀", // cheese
  "🥨", // pretzel
  "🫓", // flatbread
  "🧈", // butter
  "🥓", // bacon
  "🥩", // steak
  "🥞", // pancakes
  "🧇", // waffle
  "🍤", // shrimp
  "🍗", // chicken
  "🍖", // meat
  "🍕", // pizza
  "🌭", // hot dog
  "🍟", // fries
  "🥙", // stuffed flatbread
  "🧆", // falafel
  "🌮", // taco
  "🌯", // burrito
  "🫔", // tamale
  "🥘", // pan of food
  "🍝", // spaghetti / pasta
  "🍜", // ramen / noodles
  "🍲", // soup / stew
  "🍥", // fish cake
  "🥯", // bagel
  "🥮", // mooncake
  "🍣", // sushi
  "🍱", // bento
  "🍛", // curry
  "🍚", // rice
  "🍘", // rice cracker
  "🥧", // pie
  "🍦", // ice cream
  "🍨", // ice cream
  "🍧", // shaved ice
  "🍡", // dango
  "🍢", // oden
  "🥠", // fortune cookie
  "🧁", // cupcake
  "🍰", // cake
  "🎂", // birthday cake
  "🍮", // pudding
  "🍭", // lollipop
  "🍬", // candy
  "🍫", // chocolate
  "🥛", // milk
  "🍯", // honey
  "🍪", // cookie
  "🦪", // oyster
  "🥟", // dumpling
  "🍩", // donut
  "🍿", // popcorn
  "☕", // coffee
  "🍵", // tea
  "🧋", // bubble tea
  "🥤", // soft drink
  "🧃"  // juice
];

// ======================================================
// AI FOOD + EMOJI DETECTION
// ======================================================

async function checkFoodWithAI(buffer, contentType) {
  const base64 = buffer.toString("base64");

  const prompt = `
You are the food detector for a Discord food channel.

Look carefully at the entire image.

Your job:

1. Decide whether ANY clearly visible food or drink exists anywhere in the image.
2. People, pets, tables, restaurants, plates, backgrounds, packaging, or other objects do NOT make the image invalid.
3. If clearly visible food or drink exists, the result is YES.
4. If there is no clearly visible food or drink, the result is NO.
5. If YES, identify the MAIN clearly visible food or drink.
6. Select EXACTLY ONE emoji from this allowed list:

${FOOD_EMOJI_LIST.join(" ")}

Return ONLY valid JSON in exactly this format:

{
  "food": true,
  "emoji": "🍝"
}

or

{
  "food": false,
  "emoji": null
}

Do not include markdown.
Do not include explanations.
Do not use an emoji outside the allowed list.
`;

  const result = await Promise.race([
    openai.responses.create({
      model: AI_MODEL,

      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: prompt
            }
          ]
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: "Analyze this food picture."
            },
            {
              type: "input_image",
              image_url: `data:${contentType};base64,${base64}`
            }
          ]
        }
      ]
    }),

    new Promise((resolve) => {
      setTimeout(() => resolve(null), AI_TIMEOUT_MS);
    })
  ]);

  // Do NOT treat timeout as "not food".
  if (!result) {
    return null;
  }

  const raw = result.output_text?.trim() || "";

  try {
    const parsed = JSON.parse(raw);

    if (parsed.food !== true) {
      return {
        food: false,
        emoji: null
      };
    }

    // Only accept an emoji from our approved list.
    if (!FOOD_EMOJI_LIST.includes(parsed.emoji)) {
      console.log(
        `⚠️ AI returned unsupported emoji: ${parsed.emoji}`
      );

      // Safe fallback based on food approval.
      return {
        food: true,
        emoji: "🍽️"
      };
    }

    return {
      food: true,
      emoji: parsed.emoji
    };
  } catch (error) {
    console.error(
      "❌ Could not parse AI response:",
      raw
    );

    return null;
  }
}

// ======================================================
// DOWNLOAD ATTACHMENT
// ======================================================

async function downloadAttachment(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Failed to download attachment: ${response.status}`
    );
  }

  const arrayBuffer = await response.arrayBuffer();

  return Buffer.from(arrayBuffer);
}

// ======================================================
// PRIVATE DM
// ======================================================

async function sendPrivateDM(user, text) {
  try {
    await user.send(text);
  } catch (error) {
    console.log(
      `⚠️ Could not DM ${user.tag}: ${error.message}`
    );
  }
}

// ======================================================
// FOOD QUEUE
// ======================================================

// Only ONE submission is processed at a time.
const foodQueue = [];
let processingFood = false;

function addToFoodQueue(job) {
  foodQueue.push(job);

  console.log(
    `📥 Food submission queued. Queue size: ${foodQueue.length}`
  );

  processFoodQueue();
}

async function processFoodQueue() {
  if (processingFood) return;
  if (foodQueue.length === 0) return;

  processingFood = true;

  const job = foodQueue.shift();

  try {
    await processFoodSubmission(job);
  } catch (error) {
    console.error(
      "❌ Food processing error:",
      error
    );

    await sendPrivateDM(
      job.user,
      "❌ Something went wrong while checking your food picture. Please try again."
    );
  }

  processingFood = false;

  // Process the next submission.
  setImmediate(processFoodQueue);
}

// ======================================================
// PROCESS FOOD SUBMISSION
// ======================================================

async function processFoodSubmission({
  user,
  buffer,
  contentType
}) {
  console.log(
    `🔎 Checking food picture from ${user.tag}`
  );

  const result = await checkFoodWithAI(
    buffer,
    contentType
  );

  // AI timeout/error
  if (result === null) {
    console.log(
      `⚠️ AI check did not finish for ${user.tag}`
    );

    await sendPrivateDM(
      user,
      "⚠️ I couldn't finish checking your food picture. Please try again."
    );

    return;
  }

  // ====================================================
  // NO FOOD
  // ====================================================

  if (!result.food) {
    console.log(
      `❌ No food detected for ${user.tag}`
    );

    await sendPrivateDM(
      user,
      "❌ No food or drink was confirmed in the picture, so it wasn't posted."
    );

    return;
  }

  // ====================================================
  // FOOD APPROVED
  // ====================================================

  const channel = await client.channels.fetch(
    FOOD_CHANNEL_ID
  );

  if (!channel || !channel.isTextBased()) {
    throw new Error(
      "Food channel could not be found."
    );
  }

  const emoji = result.emoji;

  console.log(
    `✅ Food detected for ${user.tag} — Emoji: ${emoji}`
  );

  // Exact public post format
  const messageContent =
    `**𝑲𝒂𝒊𝒏 𝑷𝒐 𝑻𝒂𝒚𝒐 𝑻𝒆𝒂𝒎 𝑹𝒚𝒛𝒛𝒂 ${emoji}**\n` +
    `👤 <@${user.id}>`;

  await channel.send({
    content: messageContent,

    files: [
      {
        attachment: buffer,
        name: `food-${Date.now()}.jpg`
      }
    ],

    allowedMentions: {
      users: [user.id]
    }
  });

  console.log(
    `🍽️ Approved food post sent for ${user.tag}`
  );

  // ====================================================
  // PARTY CHAT NOTIFICATION
  // ====================================================

  try {
    const partyThread =
      await ensurePartyThread(channel);

    if (partyThread) {
      await partyThread.send({
        content:
          `**Kain Po Tayo**\n🍽️ New food post from <@${user.id}>!`,

        allowedMentions: {
          users: [user.id]
        }
      });
    }
  } catch (error) {
    console.error(
      "⚠️ Could not notify Party Chat:",
      error.message
    );
  }
}

// ======================================================
// PARTY CHAT
// ======================================================

async function ensurePartyThread(channel) {
  // ----------------------------------------------------
  // Cached thread
  // ----------------------------------------------------

  if (partyThreadId) {
    try {
      const cachedThread =
        await client.channels.fetch(
          partyThreadId
        );

      if (cachedThread) {
        if (
          cachedThread.isThread() &&
          cachedThread.archived
        ) {
          await cachedThread.setArchived(false);
        }

        return cachedThread;
      }
    } catch {
      partyThreadId = null;
    }
  }

  // ----------------------------------------------------
  // Active threads
  // ----------------------------------------------------

  try {
    const activeThreads =
      await channel.threads.fetchActive();

    const existing =
      activeThreads.threads.find(
        (thread) =>
          thread.name === PARTY_THREAD_NAME
      );

    if (existing) {
      partyThreadId = existing.id;

      return existing;
    }
  } catch (error) {
    console.error(
      "⚠️ Could not fetch active Party Chat:",
      error.message
    );
  }

  // ----------------------------------------------------
  // Archived public threads
  // ----------------------------------------------------

  try {
    const archived =
      await channel.threads.fetchArchived({
        type: "public"
      });

    const existingArchived =
      archived.threads.find(
        (thread) =>
          thread.name === PARTY_THREAD_NAME
      );

    if (existingArchived) {
      await existingArchived.setArchived(false);

      partyThreadId = existingArchived.id;

      return existingArchived;
    }
  } catch (error) {
    console.error(
      "⚠️ Could not fetch archived Party Chat:",
      error.message
    );
  }

  // ----------------------------------------------------
  // Create Party Chat
  // ----------------------------------------------------

  try {
    const thread =
      await channel.threads.create({
        name: PARTY_THREAD_NAME,
        type: ChannelType.PublicThread,
        autoArchiveDuration: 10080,
        reason:
          "Create the single Kain Po Tayo Party Chat"
      });

    partyThreadId = thread.id;

    await thread.send(
      "💬 **Welcome to the Kain Po Tayo Party Chat!**\nEveryone can chat, send pictures, videos, GIFs, emojis, and stickers here."
    );

    console.log(
      "✅ Party Chat created."
    );

    return thread;
  } catch (error) {
    console.error(
      "❌ Could not create Party Chat:",
      error.message
    );

    return null;
  }
}

// ======================================================
// FOODIE REMINDER
// ======================================================

async function ensureReminder(channel) {
  try {
    const messages =
      await channel.messages.fetch({
        limit: 100
      });

    const existingReminder =
      messages.find(
        (message) =>
          message.author.id === client.user.id &&
          message.embeds.some(
            (embed) =>
              embed.title === "🍽️ Foodie Reminder"
          )
      );

    if (existingReminder) {
      console.log(
        "✅ Existing Foodie Reminder found."
      );

      if (!existingReminder.pinned) {
        await existingReminder.pin(
          "Keep the Foodie Reminder visible"
        );
      }

      return existingReminder;
    }

    const embed = new EmbedBuilder()
      .setTitle("🍽️ Foodie Reminder")
      .setDescription(
        "Post your food here with **Kain Po Tayo Team Ryzza** + a picture."
      );

    const reminder =
      await channel.send({
        embeds: [embed]
      });

    await reminder.pin(
      "Keep the Foodie Reminder visible"
    );

    console.log(
      "✅ Foodie Reminder created and pinned."
    );

    return reminder;
  } catch (error) {
    console.error(
      "❌ Could not ensure Foodie Reminder:",
      error.message
    );

    return null;
  }
}

// ======================================================
// CLEANUP
// ======================================================

async function cleanupChannel(message) {
  const channel = message.channel;

  const mentionedUser =
    message.mentions.users.first();

  let deletedCount = 0;

  try {
    const messages =
      await channel.messages.fetch({
        limit: 100
      });

    for (const msg of messages.values()) {
      // Never delete the Foodie Reminder.
      const isReminder =
        msg.author.id === client.user.id &&
        msg.embeds.some(
          (embed) =>
            embed.title === "🍽️ Foodie Reminder"
        );

      if (isReminder) {
        continue;
      }

      // Never delete bot-generated messages.
      if (msg.author.bot) {
        continue;
      }

      // If a user was mentioned,
      // only delete their messages.
      if (
        mentionedUser &&
        msg.author.id !== mentionedUser.id
      ) {
        continue;
      }

      try {
        await msg.delete();
        deletedCount++;
      } catch {
        // Ignore messages that cannot be deleted.
      }
    }

    const confirmation =
      await channel.send(
        `🧹 Cleanup complete. Deleted **${deletedCount}** message(s).`
      );

    setTimeout(async () => {
      try {
        await confirmation.delete();
      } catch {
        // Ignore
      }
    }, 5000);
  } catch (error) {
    console.error(
      "❌ Cleanup error:",
      error.message
    );
  }
}

// ======================================================
// BOT READY
// ======================================================

client.once("ready", async () => {
  console.log(
    `✅ Logged in as ${client.user.tag}`
  );

  try {
    const channel =
      await client.channels.fetch(
        FOOD_CHANNEL_ID
      );

    if (!channel || !channel.isTextBased()) {
      console.error(
        "❌ Food channel is invalid."
      );

      return;
    }

    // --------------------------------------------------
    // 30 SECOND SLOWMODE
    // --------------------------------------------------

    try {
      await channel.setRateLimitPerUser(
        FOOD_SLOWMODE_SECONDS,
        "Kain Po Tayo Team Ryzza Foodie slowmode"
      );

      console.log(
        `✅ Food channel slowmode: ${FOOD_SLOWMODE_SECONDS} seconds`
      );
    } catch (error) {
      console.error(
        "⚠️ Could not set slowmode:",
        error.message
      );
    }

    // --------------------------------------------------
    // REMINDER
    // --------------------------------------------------

    await ensureReminder(channel);

    // --------------------------------------------------
    // SINGLE PARTY CHAT
    // --------------------------------------------------

    await ensurePartyThread(channel);

    console.log(
      "🍽️ Kain Po Tayo Team Ryzza Foodie system is ready."
    );
  } catch (error) {
    console.error(
      "❌ Ready setup error:",
      error
    );
  }
});

// ======================================================
// MAIN MESSAGE HANDLER
// ======================================================

client.on("messageCreate", async (message) => {
  // Ignore all bot messages.
  //
  // This keeps:
  // - approved food posts
  // - Foodie Reminder
  // - Party Chat notifications
  // visible.
  if (message.author.bot) {
    return;
  }

  // Only moderate the MAIN Foodie channel.
  //
  // Party Chat has a different channel/thread ID,
  // so normal chatting there is allowed.
  if (message.channel.id !== FOOD_CHANNEL_ID) {
    return;
  }

  // ====================================================
  // CLEANUP COMMAND
  // ====================================================

  if (message.content.startsWith("!cleanup")) {
    try {
      await message.delete();
    } catch {
      // Ignore
    }

    await cleanupChannel(message);

    return;
  }

  // ====================================================
  // READ SUBMISSION
  // ====================================================

  const content =
    message.content.trim();

  const isExactTrigger =
    content.toLowerCase() ===
    FOOD_TRIGGER.toLowerCase();

  const imageAttachment =
    message.attachments.find(
      (attachment) =>
        attachment.contentType?.startsWith(
          "image/"
        )
    );

  const videoAttachment =
    message.attachments.find(
      (attachment) =>
        attachment.contentType?.startsWith(
          "video/"
        )
    );

  const hasAttachment =
    message.attachments.size > 0;

  // ====================================================
  // VALID FOOD PICTURE
  // ====================================================

  if (
    isExactTrigger &&
    imageAttachment
  ) {
    try {
      // Download FIRST.
      // Discord attachment URLs can stop working
      // after the original message is deleted.
      const buffer =
        await downloadAttachment(
          imageAttachment.url
        );

      // Tell the user privately.
      await sendPrivateDM(
        message.author,
        "🔎 Checking your food picture..."
      );

      // Delete original immediately.
      await message.delete();

      // Add to one-at-a-time queue.
      addToFoodQueue({
        user: message.author,
        buffer,
        contentType:
          imageAttachment.contentType ||
          "image/jpeg"
      });

      return;
    } catch (error) {
      console.error(
        "❌ Could not download food image:",
        error.message
      );

      try {
        await message.delete();
      } catch {
        // Ignore
      }

      await sendPrivateDM(
        message.author,
        "❌ I couldn't read that picture. Please try sending it again."
      );

      return;
    }
  }

  // ====================================================
  // VIDEO
  // ====================================================

  if (
    isExactTrigger &&
    videoAttachment
  ) {
    try {
      await message.delete();
    } catch {
      // Ignore
    }

    await sendPrivateDM(
      message.author,
      "❌ Please send a food picture with **Kain Po Tayo Team Ryzza**. Video food checking is not enabled yet."
    );

    return;
  }

  // ====================================================
  // EVERYTHING ELSE IS DELETED
  // ====================================================

  try {
    await message.delete();
  } catch (error) {
    console.error(
      `⚠️ Could not delete message from ${message.author.tag}:`,
      error.message
    );
  }

  // ====================================================
  // PRIVATE HELP
  // ====================================================

  // Picture/file without the trigger
  if (!isExactTrigger && hasAttachment) {
    await sendPrivateDM(
      message.author,
      "❌ Please use **Kain Po Tayo Team Ryzza** with your food picture when posting in the Foodie channel."
    );

    return;
  }

  // Trigger without a picture
  if (isExactTrigger && !hasAttachment) {
    await sendPrivateDM(
      message.author,
      "❌ Please send a food picture together with **Kain Po Tayo Team Ryzza**."
    );

    return;
  }

  // Normal text, emoji, sticker, GIF, etc.
  // is simply deleted to keep the channel clean.
});

// ======================================================
// LOGIN
// ======================================================

client.login(DISCORD_TOKEN);
