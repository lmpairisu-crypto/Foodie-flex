
const express = require("express");
const OpenAI = require("openai");
const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  ChannelType
} = require("discord.js");

// =====================================================
// HEALTH SERVER
// =====================================================

const app = express();
const PORT = process.env.PORT || 10000;

app.get("/", (req, res) => {
  res.send("Kain Po Tayo Team Ryzza Bot is online!");
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Health server running on port ${PORT}`);
});

// =====================================================
// ENVIRONMENT VARIABLES
// =====================================================

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!DISCORD_TOKEN) {
  console.error("❌ DISCORD_TOKEN is missing.");
  process.exit(1);
}

if (!OPENAI_API_KEY) {
  console.error("❌ OPENAI_API_KEY is missing.");
  process.exit(1);
}

// =====================================================
// OPENAI
// =====================================================

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY
});

// =====================================================
// DISCORD CLIENT
// =====================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// =====================================================
// SETTINGS
// =====================================================

const FOOD_CHANNEL_ID = "1550189625954402314";

const TRIGGER = "kain po tayo team ryzza";

const AI_MODEL = "gpt-5.6-luna";

const AI_TIMEOUT_MS = 7000;

// Discord slowmode
const SLOWMODE_SECONDS = 5;

// =====================================================
// PARTY CHAT SETTINGS
// =====================================================

const PARTY_THREAD_NAME = "💬 Kain Po Tayo — Party Chat";

// The bot remembers the thread while running.
let partyThreadId = null;

// =====================================================
// FOOD EMOJIS
// =====================================================

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

// =====================================================
// GLOBAL FOOD QUEUE
// =====================================================

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

  console.log(
    `🍽️ Processing food submission. Remaining queue: ${foodQueue.length}`
  );

  try {
    await processFoodSubmission(job);
  } catch (error) {
    console.error(
      "❌ Food processing error:",
      error.message
    );

    try {
      await job.user.send(
        "❌ Something went wrong while checking your food picture. Please try again."
      );
    } catch {}
  }

  processingFood = false;

  console.log("✅ Food submission finished.");

  if (foodQueue.length > 0) {
    setImmediate(processFoodQueue);
  }
}

// =====================================================
// EXACT TRIGGER
// =====================================================

function hasExactTrigger(message) {
  return (
    message.content.trim().toLowerCase() === TRIGGER
  );
}

// =====================================================
// MEDIA
// =====================================================

function isImage(attachment) {
  const contentType = attachment.contentType || "";

  return (
    contentType.startsWith("image/") ||
    /\.(jpg|jpeg|png|webp|gif)$/i.test(
      attachment.name || ""
    )
  );
}

function isVideo(attachment) {
  const contentType = attachment.contentType || "";

  return (
    contentType.startsWith("video/") ||
    /\.(mp4|mov|webm|mkv)$/i.test(
      attachment.name || ""
    )
  );
}

function hasMedia(message) {
  return message.attachments.some(
    attachment =>
      isImage(attachment) ||
      isVideo(attachment)
  );
}

function getImageAttachment(message) {
  return message.attachments.find(
    attachment => isImage(attachment)
  );
}

// =====================================================
// SAFE DELETE
// =====================================================

async function safeDelete(message) {
  try {
    if (message.deletable) {
      await message.delete();
      return true;
    }
  } catch (error) {
    console.error(
      "❌ Failed to delete message:",
      error.message
    );
  }

  return false;
}

// =====================================================
// DOWNLOAD ATTACHMENT
// =====================================================

async function downloadAttachment(attachment) {
  const response = await fetch(attachment.url);

  if (!response.ok) {
    throw new Error(
      `Failed to download attachment: ${response.status}`
    );
  }

  const arrayBuffer = await response.arrayBuffer();

  return Buffer.from(arrayBuffer);
}

// =====================================================
// AI FOOD CHECK
// =====================================================

async function checkIfFood(
  imageBuffer,
  mimeType = "image/jpeg"
) {
  const base64Image =
    imageBuffer.toString("base64");

  const imageDataUrl =
    `data:${mimeType};base64,${base64Image}`;

  const aiRequest = openai.responses.create({
    model: AI_MODEL,

    input: [
      {
        role: "user",

        content: [
          {
            type: "input_text",

            text:
              "Look carefully at this image. " +
              "Return ONLY FOOD or NOT_FOOD.\n\n" +

              "Return FOOD if ANY clearly visible food OR drink " +
              "is present anywhere in the image.\n\n" +

              "People, pets, tables, restaurants, kitchens, " +
              "background objects, or other objects do NOT make " +
              "an image NOT_FOOD if food or drink is clearly visible.\n\n" +

              "Return NOT_FOOD only when there is no clearly " +
              "visible food or drink."
          },

          {
            type: "input_image",
            image_url: imageDataUrl
          }
        ]
      }
    ]
  });

  const timeoutPromise = new Promise(resolve => {
    setTimeout(
      () => resolve(null),
      AI_TIMEOUT_MS
    );
  });

  const firstResult = await Promise.race([
    aiRequest,
    timeoutPromise
  ]);

  let response;

  if (firstResult === null) {
    console.log(
      `⏳ AI is taking longer than ${AI_TIMEOUT_MS}ms. Waiting for actual result...`
    );

    response = await aiRequest;
  } else {
    response = firstResult;
  }

  const result =
    response.output_text?.trim().toUpperCase() || "";

  console.log("🤖 AI result:", result);

  return result === "FOOD";
}

// =====================================================
// CREATE / FIND ONE PUBLIC PARTY THREAD
// =====================================================

async function ensurePartyThread(channel) {
  try {
    // If we already know the thread ID, fetch it.
    if (partyThreadId) {
      try {
        const existing =
          await channel.threads.fetch(
            partyThreadId
          );

        if (existing) {
          // Re-open if archived.
          if (existing.archived) {
            try {
              await existing.setArchived(false);
            } catch {}
          }

          return existing;
        }
      } catch {
        partyThreadId = null;
      }
    }

    // Search active threads.
    const active =
      await channel.threads.fetchActive();

    let thread = active.threads.find(
      thread =>
        thread.name === PARTY_THREAD_NAME
    );

    // Search archived public threads too.
    if (!thread) {
      try {
        const archived =
          await channel.threads.fetchArchived({
            type: "public",
            limit: 100
          });

        thread = archived.threads.find(
          thread =>
            thread.name === PARTY_THREAD_NAME
        );
      } catch (error) {
        console.error(
          "⚠️ Could not search archived threads:",
          error.message
        );
      }
    }

    // If found, reuse it.
    if (thread) {
      partyThreadId = thread.id;

      if (thread.archived) {
        try {
          await thread.setArchived(false);
        } catch {}
      }

      console.log(
        `💬 Existing Party Chat found: ${thread.id}`
      );

      return thread;
    }

    // =================================================
    // CREATE THE ONE PUBLIC THREAD
    // =================================================

    thread = await channel.threads.create({
      name: PARTY_THREAD_NAME,

      type: ChannelType.PublicThread,

      autoArchiveDuration: 10080,

      reason:
        "Create the single public Foodie Party Chat"
    });

    partyThreadId = thread.id;

    await thread.send(
      "🍽️ **Kain Po Tayo Team Ryzza Party Chat**\n" +
      "Everyone can chat here about the food posts!"
    );

    console.log(
      `💬 Created one public Party Chat thread: ${thread.id}`
    );

    return thread;

  } catch (error) {
    console.error(
      "❌ Failed to create/find Party Chat:",
      error.message
    );

    return null;
  }
}

// =====================================================
// FOOD REMINDER
// =====================================================

async function ensureReminder(channel) {
  try {
    const messages =
      await channel.messages.fetch({
        limit: 100
      });

    const existingReminder =
      messages.find(message => {
        if (!message.author.bot) {
          return false;
        }

        return message.embeds.some(
          embed =>
            embed.title ===
            "🍽️ Foodie Reminder"
        );
      });

    if (existingReminder) {
      if (!existingReminder.pinned) {
        try {
          await existingReminder.pin();
        } catch {}
      }

      console.log(
        "🍽️ Existing Foodie Reminder found."
      );

      return;
    }

    const reminder =
      await channel.send({
        embeds: [
          {
            title: "🍽️ Foodie Reminder",

            description:
              "Post your food here with **Kain Po Tayo Team Ryzza** + a picture.",

            color: 0xf5a623
          }
        ]
      });

    try {
      await reminder.pin();
    } catch {}

    console.log(
      "📌 New Foodie Reminder created and pinned."
    );

  } catch (error) {
    console.error(
      "❌ Failed to ensure reminder:",
      error.message
    );
  }
}

// =====================================================
// ENABLE SLOWMODE
// =====================================================

async function ensureSlowmode(channel) {
  try {
    if (
      channel.rateLimitPerUser !==
      SLOWMODE_SECONDS
    ) {
      await channel.setRateLimitPerUser(
        SLOWMODE_SECONDS,
        "Foodie anti-spam slowmode"
      );

      console.log(
        `⏱️ Foodie slowmode set to ${SLOWMODE_SECONDS} seconds.`
      );
    } else {
      console.log(
        `⏱️ Foodie slowmode already set to ${SLOWMODE_SECONDS} seconds.`
      );
    }

  } catch (error) {
    console.error(
      "❌ Could not set Foodie slowmode:",
      error.message
    );
  }
}

// =====================================================
// PROCESS ONE FOOD SUBMISSION
// =====================================================

async function processFoodSubmission(job) {
  const {
    user,
    channel,
    imageBuffer,
    imageName,
    mimeType
  } = job;

  try {
    await user.send(
      "🔍 Checking your food picture..."
    );
  } catch {}

  // ===================================================
  // AI
  // ===================================================

  let isFood = false;

  try {
    isFood = await checkIfFood(
      imageBuffer,
      mimeType
    );

  } catch (error) {
    console.error(
      "❌ AI food check failed:",
      error.message
    );

    try {
      await user.send(
        "❌ I couldn't check the picture right now. Please try again."
      );
    } catch {}

    return;
  }

  // ===================================================
  // NOT FOOD
  // ===================================================

  if (!isFood) {
    try {
      await user.send(
        "❌ No food or drink was confirmed in the picture, so it wasn't posted."
      );
    } catch {}

    console.log(
      `❌ Non-food submission rejected for ${user.tag}`
    );

    return;
  }

  // ===================================================
  // APPROVED FOOD
  // ===================================================

  const emoji = getFoodEmoji();

  try {
    const foodPost =
      await channel.send({
        content:
          `**𝑲𝒂𝒊𝒏 𝑷𝒐 𝑻𝒂𝒚𝒐 𝑻𝒆𝒂𝒎 𝑹𝒚𝒛𝒛𝒂 ${emoji}**\n` +
          `👤 <@${user.id}>`,

        files: [
          {
            attachment: imageBuffer,
            name: imageName || "food.jpg"
          }
        ],

        allowedMentions: {
          users: [user.id]
        }
      });

    console.log(
      `🍕 Food approved and posted for ${user.tag}`
    );

    // =================================================
    // ENSURE ONE PUBLIC PARTY THREAD
    // =================================================

    const partyThread =
      await ensurePartyThread(channel);

    if (partyThread) {
      try {
        await partyThread.send(
          `🍽️ New food post from <@${user.id}>!`
        );
      } catch (error) {
        console.error(
          "❌ Could not notify Party Chat:",
          error.message
        );
      }
    }

    try {
      await user.send(
        "✅ Your food picture was approved and posted in the Foodie channel!"
      );
    } catch {}

  } catch (error) {
    console.error(
      "❌ Failed to post approved food:",
      error.message
    );

    try {
      await user.send(
        "❌ The food was approved, but I couldn't post it. Please try again."
      );
    } catch {}
  }
}

// =====================================================
// CLEANUP CHANNEL
// =====================================================

async function cleanupChannel(channel) {
  try {
    const messages =
      await channel.messages.fetch({
        limit: 100
      });

    let deleted = 0;

    for (const message of messages.values()) {
      const isReminder =
        message.embeds.some(
          embed =>
            embed.title ===
            "🍽️ Foodie Reminder"
        );

      if (isReminder && message.pinned) {
        continue;
      }

      try {
        if (message.deletable) {
          await message.delete();
          deleted++;
        }
      } catch {}
    }

    const confirmation =
      await channel.send(
        `🧹 Cleanup complete. Deleted **${deleted}** message(s).`
      );

    setTimeout(async () => {
      try {
        await confirmation.delete();
      } catch {}
    }, 5000);

  } catch (error) {
    console.error(
      "❌ Channel cleanup failed:",
      error.message
    );
  }
}

// =====================================================
// CLEANUP USER
// =====================================================

async function cleanupUser(channel, user) {
  try {
    const messages =
      await channel.messages.fetch({
        limit: 100
      });

    let deleted = 0;

    for (const message of messages.values()) {
      if (message.author.id !== user.id) {
        continue;
      }

      const isReminder =
        message.embeds.some(
          embed =>
            embed.title ===
            "🍽️ Foodie Reminder"
        );

      if (isReminder && message.pinned) {
        continue;
      }

      try {
        if (message.deletable) {
          await message.delete();
          deleted++;
        }
      } catch {}
    }

    const confirmation =
      await channel.send(
        `🧹 Deleted **${deleted}** message(s) from ${user}.`
      );

    setTimeout(async () => {
      try {
        await confirmation.delete();
      } catch {}
    }, 5000);

  } catch (error) {
    console.error(
      "❌ User cleanup failed:",
      error.message
    );
  }
}

// =====================================================
// BOT READY
// =====================================================

client.once("ready", async () => {
  console.log(
    `✅ Logged in as ${client.user.tag}`
  );

  console.log(
    `🍽️ Foodie channel: ${FOOD_CHANNEL_ID}`
  );

  try {
    const channel =
      await client.channels.fetch(
        FOOD_CHANNEL_ID
      );

    if (
      !channel ||
      !channel.isTextBased()
    ) {
      console.error(
        "❌ Foodie channel is not a text channel."
      );

      return;
    }

    // Enable Discord slowmode.
    await ensureSlowmode(channel);

    // Keep one pinned reminder.
    await ensureReminder(channel);

    // Create/find the ONE public Party Chat.
    await ensurePartyThread(channel);

    console.log(
      "🍕 Foodie system is ready."
    );

  } catch (error) {
    console.error(
      "❌ Foodie startup error:",
      error.message
    );
  }
});

// =====================================================
// MESSAGE HANDLER
// =====================================================

client.on(
  "messageCreate",
  async message => {

    // Bot posts stay visible.
    if (message.author.bot) return;

    // Only Foodie channel.
    if (
      message.channel.id !==
      FOOD_CHANNEL_ID
    ) {
      return;
    }

    // =================================================
    // CLEANUP COMMAND
    // =================================================

    if (
      message.content
        .toLowerCase()
        .startsWith("!cleanup")
    ) {

      if (
        !message.member?.permissions.has(
          PermissionsBitField.Flags.ManageMessages
        )
      ) {
        await safeDelete(message);
        return;
      }

      const mentionedUser =
        message.mentions.users.first();

      await safeDelete(message);

      if (mentionedUser) {
        await cleanupUser(
          message.channel,
          mentionedUser
        );
      } else {
        await cleanupChannel(
          message.channel
        );
      }

      return;
    }

    // =================================================
    // TRIGGER
    // =================================================

    const triggerUsed =
      hasExactTrigger(message);

    // =================================================
    // MEDIA
    // =================================================

    const imageAttachment =
      getImageAttachment(message);

    const hasAnyMedia =
      hasMedia(message);

    // =================================================
    // SUBMISSION ONLY
    // =================================================

    // Normal chat / emoji
    if (
      !triggerUsed &&
      !hasAnyMedia
    ) {
      await safeDelete(message);
      return;
    }

    // Picture/video without trigger
    if (
      !triggerUsed &&
      hasAnyMedia
    ) {
      await safeDelete(message);
      return;
    }

    // =================================================
    // TRIGGER WITHOUT MEDIA
    // =================================================

    if (
      triggerUsed &&
      !hasAnyMedia
    ) {
      await safeDelete(message);

      try {
        await message.author.send(
          "❌ Your Foodie submission was removed. Please send **Kain Po Tayo Team Ryzza** together with a food or drink picture."
        );
      } catch {}

      return;
    }

    // =================================================
    // VIDEO ONLY
    // =================================================

    if (!imageAttachment) {
      await safeDelete(message);

      try {
        await message.author.send(
          "❌ Your submission was removed. Please send a picture of the food or drink together with **Kain Po Tayo Team Ryzza**."
        );
      } catch {}

      return;
    }

    // =================================================
    // DOWNLOAD BEFORE DELETE
    // =================================================

    let imageBuffer;

    try {
      imageBuffer =
        await downloadAttachment(
          imageAttachment
        );

    } catch (error) {
      console.error(
        "❌ Could not download image:",
        error.message
      );

      await safeDelete(message);

      try {
        await message.author.send(
          "❌ I couldn't read the picture. Please try sending it again."
        );
      } catch {}

      return;
    }

    // =================================================
    // DELETE ORIGINAL
    // =================================================

    await safeDelete(message);

    // =================================================
    // ADD TO GLOBAL QUEUE
    // =================================================

    const queuePosition =
      foodQueue.length +
      (processingFood ? 2 : 1);

    addToFoodQueue({
      user: message.author,

      channel: message.channel,

      imageBuffer,

      imageName:
        imageAttachment.name ||
        "food.jpg",

      mimeType:
        imageAttachment.contentType ||
        "image/jpeg"
    });

    // =================================================
    // QUEUE NOTICE
    // =================================================

    if (
      processingFood ||
      foodQueue.length > 1
    ) {
      try {
        await message.author.send(
          `⏳ Your food picture is in the queue. You are approximately #${queuePosition} in line.`
        );
      } catch {}
    }
  }
);

// =====================================================
// DISCORD LOGIN
// =====================================================

client.login(DISCORD_TOKEN);
