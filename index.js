
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
// FOODIE SETTINGS
// ======================================================

// Main Foodie channel
const FOOD_CHANNEL_ID = "1550189625954402314";

// Exact trigger
const FOOD_TRIGGER = "Kain Po Tayo Team Ryzza";

// AI model
const AI_MODEL = "gpt-5.6-luna";

// Maximum time we wait for the AI response
const AI_TIMEOUT_MS = 7000;

// Slowmode for the main Foodie channel
const FOOD_SLOWMODE_SECONDS = 5;

// One public Party Chat thread for the whole Foodie channel
const PARTY_THREAD_NAME = "💬 Kain Po Tayo — Party Chat";

// Cached Party Chat thread ID
let partyThreadId = null;

// ======================================================
// FOOD EMOJIS
// ======================================================

const FOOD_EMOJIS = [
  "🍞", "🥖", "🥐", "🍳", "🥚", "🧀", "🥨", "🫓",
  "🧈", "🥓", "🥩", "🥞", "🧇", "🍤", "🍗", "🍖",
  "🦴", "🍕", "🌭", "🍟", "🥙", "🧆", "🌮", "🌯",
  "🫔", "🥘", "🍝", "🍜", "🍲", "🍥", "🥯", "🥮",
  "🍣", "🍱", "🍛", "🍚", "🍘", "🥧", "🍦", "🍨",
  "🍧", "🍡", "🍢", "🥠", "🧁", "🍰", "🎂", "🍮",
  "🍭", "🍬", "🍫", "🥛", "🍯", "🍪", "🦪", "🥟",
  "🍩", "🍿", "☕", "🍵", "🧋", "🥤", "🧃"
];

function getFoodEmoji() {
  return FOOD_EMOJIS[
    Math.floor(Math.random() * FOOD_EMOJIS.length)
  ];
}

// ======================================================
// FOOD QUEUE
// ======================================================

// Only ONE food submission is AI-checked at a time.
const foodQueue = [];
let processingFood = false;

function addToFoodQueue(job) {
  foodQueue.push(job);
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
    console.error("❌ Food processing error:", error);

    try {
      await job.user.send(
        "❌ Something went wrong while checking your food picture. Please try again."
      );
    } catch {
      // Ignore DM errors
    }
  }

  processingFood = false;

  // Process the next person in line.
  setImmediate(processFoodQueue);
}

// ======================================================
// DOWNLOAD DISCORD ATTACHMENT
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
// CHECK FOOD WITH AI
// ======================================================

async function checkFoodWithAI(buffer, contentType) {
  const base64 = buffer.toString("base64");

  const result = await Promise.race([
    openai.responses.create({
      model: AI_MODEL,

      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text:
                "You are a food image checker for a Discord food channel. " +
                "Return ONLY the word YES or NO. " +
                "Return YES if ANY clearly visible food or drink is present anywhere in the image. " +
                "People, pets, tables, restaurants, backgrounds, packaging, or other objects do NOT make it NO. " +
                "If food or a drink is clearly visible, return YES. " +
                "Return NO only when there is no clearly visible food or drink."
            }
          ]
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: "Is there clearly visible food or drink in this image?"
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

  // A timeout is NOT treated as NO.
  // This prevents good food pictures from being rejected
  // just because the AI response took longer than expected.
  if (!result) {
    return null;
  }

  const text =
    result.output_text?.trim().toUpperCase() || "";

  return text.startsWith("YES");
}

// ======================================================
// SEND PRIVATE DM
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
// PROCESS ONE FOOD SUBMISSION
// ======================================================

async function processFoodSubmission({
  user,
  buffer,
  contentType
}) {
  console.log(`🔎 Checking food submission from ${user.tag}`);

  const isFood = await checkFoodWithAI(
    buffer,
    contentType
  );

  if (isFood === null) {
    console.log("⚠️ AI check timed out.");

    await sendPrivateDM(
      user,
      "⚠️ Your food picture is still being checked. Please try again in a moment."
    );

    return;
  }

  if (!isFood) {
    console.log(`❌ No food detected for ${user.tag}`);

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
    throw new Error("Food channel could not be found.");
  }

  const emoji = getFoodEmoji();

  const messageContent =
    `**𝑲𝒂𝒊𝒏 𝑷𝒐 𝑻𝒂𝒚𝒐 𝑻𝒆𝒂𝒎 𝑹𝒚𝒛𝒛𝒂 ${emoji}**\n` +
    `👤 <@${user.id}>`;

  const sentMessage = await channel.send({
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
    `✅ Food approved and posted for ${user.tag}`
  );

  // ====================================================
  // PARTY CHAT NOTIFICATION
  // ====================================================

  try {
    const partyThread = await ensurePartyThread(channel);

    if (partyThread) {
      await partyThread.send({
        content:
          `🍽️ New food post from <@${user.id}>!`,

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

  return sentMessage;
}

// ======================================================
// ENSURE PARTY CHAT EXISTS
// ======================================================

async function ensurePartyThread(channel) {
  // ----------------------------------------------------
  // Check cached thread
  // ----------------------------------------------------

  if (partyThreadId) {
    try {
      const cachedThread =
        await client.channels.fetch(partyThreadId);

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
  // Search active threads
  // ----------------------------------------------------

  try {
    const activeThreads =
      await channel.threads.fetchActive();

    const existingActive =
      activeThreads.threads.find(
        (thread) =>
          thread.name === PARTY_THREAD_NAME
      );

    if (existingActive) {
      partyThreadId = existingActive.id;
      return existingActive;
    }
  } catch (error) {
    console.error(
      "⚠️ Could not fetch active threads:",
      error.message
    );
  }

  // ----------------------------------------------------
  // Search archived public threads
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
      "⚠️ Could not fetch archived threads:",
      error.message
    );
  }

  // ----------------------------------------------------
  // Create Party Chat
  // ----------------------------------------------------

  try {
    const thread = await channel.threads.create({
      name: PARTY_THREAD_NAME,
      type: ChannelType.PublicThread,
      autoArchiveDuration: 10080,
      reason:
        "Create the single public Kain Po Tayo Party Chat"
    });

    partyThreadId = thread.id;

    await thread.send(
      "💬 **Welcome to the Kain Po Tayo Party Chat!**\nEveryone can chat, send pictures, videos, GIFs, emojis, and stickers here."
    );

    console.log(
      `✅ Party Chat created: ${thread.name}`
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
// ENSURE FOODIE REMINDER
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

    const reminder = await channel.send({
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
// CLEANUP COMMAND
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
      // Never delete the pinned Foodie Reminder.
      const isReminder =
        msg.author.id === client.user.id &&
        msg.embeds.some(
          (embed) =>
            embed.title === "🍽️ Foodie Reminder"
        );

      if (isReminder) {
        continue;
      }

      // If a user was mentioned, only delete
      // that user's messages.
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

    // Set slowmode
    try {
      await channel.setRateLimitPerUser(
        FOOD_SLOWMODE_SECONDS,
        "Kain Po Tayo Foodie submission slowmode"
      );

      console.log(
        `✅ Food channel slowmode: ${FOOD_SLOWMODE_SECONDS}s`
      );
    } catch (error) {
      console.log(
        `⚠️ Could not set slowmode: ${error.message}`
      );
    }

    // Reminder
    await ensureReminder(channel);

    // Single Party Chat
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
// MESSAGE HANDLER
// ======================================================

client.on("messageCreate", async (message) => {
  // ----------------------------------------------------
  // IGNORE ALL BOT MESSAGES
  // ----------------------------------------------------

  // This is VERY important.
  // Bot-generated approved food posts,
  // the reminder, and Party Chat messages
  // must stay visible.
  if (message.author.bot) {
    return;
  }

  // ----------------------------------------------------
  // ONLY MODERATE THE MAIN FOODIE CHANNEL
  // ----------------------------------------------------

  if (message.channel.id !== FOOD_CHANNEL_ID) {
    return;
  }

  // ----------------------------------------------------
  // CLEANEST POSSIBLE FOODIE CHANNEL
  // ----------------------------------------------------
  //
  // Every member message is deleted.
  //
  // This includes:
  // Text
  // Emoji
  // Stickers
  // GIFs
  // Files
  // Pictures
  // Videos
  // Invalid submissions
  //
  // For a valid food submission, the attachment
  // is downloaded FIRST, then the original message
  // is deleted.
  // ----------------------------------------------------

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

  // ----------------------------------------------------
  // VALID FOOD SUBMISSION
  // ----------------------------------------------------

  if (
    isExactTrigger &&
    imageAttachment
  ) {
    // Download BEFORE deleting.
    try {
      const buffer =
        await downloadAttachment(
          imageAttachment.url
        );

      // Tell user privately that their submission
      // entered the queue.
      await sendPrivateDM(
        message.author,
        "🔎 Checking your food picture..."
      );

      // Delete original message immediately.
      await message.delete();

      // Put the submission into the ONE-at-a-time queue.
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

  // ----------------------------------------------------
  // VIDEO SUBMISSION
  // ----------------------------------------------------
  //
  // Videos are currently NOT sent to AI.
  // They are removed to keep the main channel clean.
  // ----------------------------------------------------

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

  // ----------------------------------------------------
  // EVERYTHING ELSE = DELETE
  // ----------------------------------------------------

  try {
    await message.delete();
  } catch (error) {
    console.error(
      `⚠️ Could not delete message from ${message.author.tag}:`,
      error.message
    );
  }

  // ----------------------------------------------------
  // PRIVATE HELP FOR INVALID SUBMISSIONS
  // ----------------------------------------------------

  if (!isExactTrigger && hasAttachment) {
    await sendPrivateDM(
      message.author,
      "❌ Please use **Kain Po Tayo Team Ryzza** with your food picture when posting in the Foodie channel."
    );

    return;
  }

  if (isExactTrigger && !hasAttachment) {
    await sendPrivateDM(
      message.author,
      "❌ Please send a food picture together with **Kain Po Tayo Team Ryzza**."
    );

    return;
  }

  // Normal chat, emoji, sticker, etc.
  // Message is simply deleted to keep the channel clean.
});

// ======================================================
// CLEANUP COMMAND LISTENER
// ======================================================

client.on("messageCreate", async (message) => {
  if (message.author.bot) {
    return;
  }

  if (!message.content.startsWith("!cleanup")) {
    return;
  }

  // Only allow cleanup in the Foodie channel.
  if (message.channel.id !== FOOD_CHANNEL_ID) {
    return;
  }

  // Delete command immediately.
  try {
    await message.delete();
  } catch {
    // Ignore
  }

  await cleanupChannel(message);
});

// ======================================================
// LOGIN
// ======================================================

client.login(DISCORD_TOKEN);
