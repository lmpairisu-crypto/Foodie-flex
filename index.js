
const express = require("express");
const OpenAI = require("openai");
const {
  Client,
  GatewayIntentBits,
  PermissionsBitField
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
// FOODIE SETTINGS
// =====================================================

// Foodie channel
const FOOD_CHANNEL_ID = "1550189625954402314";

// Exact trigger
const TRIGGER = "kain po tayo team ryzza";

// AI model
const AI_MODEL = "gpt-5.6-luna";

// Maximum time before we stop waiting.
// IMPORTANT: timeout does NOT automatically mean NOT FOOD.
const AI_TIMEOUT_MS = 7000;

// Discord slowmode
const SLOWMODE_SECONDS = 5;

// Anti-spam settings
// Maximum approved user submissions that can enter processing
// within this time period.
const SPAM_WINDOW_MS = 15000;
const MAX_SUBMISSIONS_PER_WINDOW = 2;

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
// ANTI-SPAM TRACKER
// =====================================================

const userSubmissionTracker = new Map();

function isSpamming(userId) {
  const now = Date.now();

  let timestamps = userSubmissionTracker.get(userId) || [];

  // Remove old timestamps
  timestamps = timestamps.filter(
    timestamp => now - timestamp < SPAM_WINDOW_MS
  );

  if (timestamps.length >= MAX_SUBMISSIONS_PER_WINDOW) {
    userSubmissionTracker.set(userId, timestamps);
    return true;
  }

  timestamps.push(now);
  userSubmissionTracker.set(userId, timestamps);

  return false;
}

// Clean old users from memory occasionally
setInterval(() => {
  const now = Date.now();

  for (const [userId, timestamps] of userSubmissionTracker.entries()) {
    const recent = timestamps.filter(
      timestamp => now - timestamp < SPAM_WINDOW_MS
    );

    if (recent.length === 0) {
      userSubmissionTracker.delete(userId);
    } else {
      userSubmissionTracker.set(userId, recent);
    }
  }
}, 60000);

// =====================================================
// TRIGGER CHECK
// =====================================================

function hasExactTrigger(message) {
  return message.content.trim().toLowerCase() === TRIGGER;
}

// =====================================================
// MEDIA CHECK
// =====================================================

function isImage(attachment) {
  const contentType = attachment.contentType || "";

  return (
    contentType.startsWith("image/") ||
    /\.(jpg|jpeg|png|webp|gif)$/i.test(attachment.name || "")
  );
}

function isVideo(attachment) {
  const contentType = attachment.contentType || "";

  return (
    contentType.startsWith("video/") ||
    /\.(mp4|mov|webm|mkv)$/i.test(attachment.name || "")
  );
}

function hasMedia(message) {
  return message.attachments.some(
    attachment => isImage(attachment) || isVideo(attachment)
  );
}

function getImageAttachment(message) {
  return message.attachments.find(attachment =>
    isImage(attachment)
  );
}

function getVideoAttachment(message) {
  return message.attachments.find(attachment =>
    isVideo(attachment)
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
    console.error("❌ Failed to delete message:", error.message);
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

async function checkIfFood(imageBuffer, mimeType = "image/jpeg") {
  const base64Image = imageBuffer.toString("base64");

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

  // Do not turn a timeout into NOT_FOOD.
  // We simply stop racing the request and wait for the actual result.
  const timeoutPromise = new Promise(resolve => {
    setTimeout(() => resolve(null), AI_TIMEOUT_MS);
  });

  const firstResult = await Promise.race([
    aiRequest,
    timeoutPromise
  ]);

  let response;

  if (firstResult === null) {
    console.log(
      `⏳ AI is taking longer than ${AI_TIMEOUT_MS}ms. Waiting for result...`
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
// FOOD REMINDER
// =====================================================

async function ensureReminder(channel) {
  try {
    const messages = await channel.messages.fetch({
      limit: 100
    });

    const existingReminder = messages.find(message => {
      if (!message.author.bot) return false;

      return message.embeds.some(
        embed => embed.title === "🍽️ Foodie Reminder"
      );
    });

    if (existingReminder) {
      if (!existingReminder.pinned) {
        try {
          await existingReminder.pin();
          console.log("📌 Existing reminder pinned.");
        } catch (error) {
          console.error(
            "❌ Could not pin existing reminder:",
            error.message
          );
        }
      }

      console.log("🍽️ Existing Foodie Reminder found.");
      return;
    }

    const reminder = await channel.send({
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
    } catch (error) {
      console.error(
        "❌ Could not pin reminder:",
        error.message
      );
    }

    console.log("📌 New Foodie Reminder created and pinned.");
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
    if (channel.rateLimitPerUser !== SLOWMODE_SECONDS) {
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
// CLEANUP
// =====================================================

async function cleanupChannel(channel) {
  try {
    const messages = await channel.messages.fetch({
      limit: 100
    });

    let deleted = 0;

    for (const message of messages.values()) {
      // Never delete the pinned Foodie Reminder
      const isReminder = message.embeds.some(
        embed => embed.title === "🍽️ Foodie Reminder"
      );

      if (isReminder && message.pinned) {
        continue;
      }

      try {
        if (message.deletable) {
          await message.delete();
          deleted++;
        }
      } catch (error) {
        console.error(
          "❌ Cleanup delete error:",
          error.message
        );
      }
    }

    const confirmation = await channel.send(
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
    const messages = await channel.messages.fetch({
      limit: 100
    });

    let deleted = 0;

    for (const message of messages.values()) {
      if (message.author.id !== user.id) {
        continue;
      }

      // Never delete pinned reminder
      const isReminder = message.embeds.some(
        embed => embed.title === "🍽️ Foodie Reminder"
      );

      if (isReminder && message.pinned) {
        continue;
      }

      try {
        if (message.deletable) {
          await message.delete();
          deleted++;
        }
      } catch (error) {
        console.error(
          "❌ User cleanup delete error:",
          error.message
        );
      }
    }

    const confirmation = await channel.send(
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
  console.log(`✅ Logged in as ${client.user.tag}`);
  console.log(`🍽️ Foodie channel: ${FOOD_CHANNEL_ID}`);

  try {
    const channel = await client.channels.fetch(
      FOOD_CHANNEL_ID
    );

    if (!channel || !channel.isTextBased()) {
      console.error("❌ Foodie channel is not a text channel.");
      return;
    }

    await ensureSlowmode(channel);
    await ensureReminder(channel);

    console.log("🍕 Foodie system is ready.");
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

client.on("messageCreate", async message => {
  // Ignore bot messages.
  // This keeps the Foodie bot's own posts and reminder visible.
  if (message.author.bot) return;

  // Only work inside the Foodie channel.
  if (message.channel.id !== FOOD_CHANNEL_ID) return;

  // ===================================================
  // MODERATOR CLEANUP COMMAND
  // ===================================================

  if (message.content.toLowerCase().startsWith("!cleanup")) {
    if (
      !message.member?.permissions.has(
        PermissionsBitField.Flags.ManageMessages
      )
    ) {
      await safeDelete(message);
      return;
    }

    const mentionedUser = message.mentions.users.first();

    await safeDelete(message);

    if (mentionedUser) {
      await cleanupUser(
        message.channel,
        mentionedUser
      );
    } else {
      await cleanupChannel(message.channel);
    }

    return;
  }

  // ===================================================
  // EXACT TRIGGER
  // ===================================================

  const triggerUsed = hasExactTrigger(message);

  // ===================================================
  // ANTI-SPAM
  // ===================================================

  // Only count actual media submissions.
  if (hasMedia(message)) {
    if (isSpamming(message.author.id)) {
      console.log(
        `🚫 Spam submission removed from ${message.author.tag}`
      );

      await safeDelete(message);

      try {
        await message.author.send(
          "⚠️ Your extra Foodie submission was removed because you sent too many pictures/videos too quickly. Please wait for the slowmode before sending another."
        );
      } catch {}
      
      return;
    }
  }

  // ===================================================
  // SUBMISSION-ONLY CHANNEL
  // ===================================================

  // No trigger + no media
  // Normal chat / emoji / server emoji / Nitro emoji
  // → REMOVE
  if (!triggerUsed && !hasMedia(message)) {
    await safeDelete(message);
    return;
  }

  // No trigger + media
  // Picture/video without the required phrase
  // → REMOVE
  if (!triggerUsed && hasMedia(message)) {
    await safeDelete(message);
    return;
  }

  // ===================================================
  // TRIGGER WITHOUT MEDIA
  // ===================================================

  if (triggerUsed && !hasMedia(message)) {
    await safeDelete(message);

    try {
      await message.author.send(
        "❌ Your Foodie submission was removed. Please send **Kain Po Tayo Team Ryzza** together with a food or drink picture."
      );
    } catch {}

    return;
  }

  // ===================================================
  // TRIGGER + MEDIA
  // ===================================================

  const imageAttachment = getImageAttachment(message);
  const videoAttachment = getVideoAttachment(message);

  // Current AI checking supports images directly.
  // Videos are removed with a private notice rather than
  // incorrectly claiming that the AI checked the video.
  if (!imageAttachment) {
    await safeDelete(message);

    try {
      await message.author.send(
        "❌ Your submission was removed. Please send a picture of the food or drink together with **Kain Po Tayo Team Ryzza**."
      );
    } catch {}

    return;
  }

  // ===================================================
  // DOWNLOAD IMAGE BEFORE DELETING ORIGINAL
  // ===================================================

  let imageBuffer;

  try {
    imageBuffer = await downloadAttachment(
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

  // ===================================================
  // PRIVATE CHECKING MESSAGE
  // ===================================================

  try {
    await message.author.send(
      "🔍 Checking your food picture..."
    );
  } catch {}

  // ===================================================
  // DELETE ORIGINAL SUBMISSION
  // ===================================================

  await safeDelete(message);

  // ===================================================
  // AI CHECK
  // ===================================================

  let isFood = false;

  try {
    const mimeType =
      imageAttachment.contentType || "image/jpeg";

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
      await message.author.send(
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
      await message.author.send(
        "❌ No food or drink was confirmed in the picture, so it wasn't posted."
      );
    } catch {}

    console.log(
      `❌ Non-food submission rejected from ${message.author.tag}`
    );

    return;
  }

  // ===================================================
  // FOOD APPROVED
  // ===================================================

  const emoji = getFoodEmoji();

  try {
    await message.channel.send({
      content:
        `**𝑲𝒂𝒊𝒏 𝑷𝒐 𝑻𝒂𝒚𝒐 𝑻𝒆𝒂𝒎 𝑹𝒚𝒛𝒛𝒂 ${emoji}**\n` +
        `👤 <@${message.author.id}>`,

      files: [
        {
          attachment: imageBuffer,
          name: imageAttachment.name || "food.jpg"
        }
      ],

      allowedMentions: {
        users: [message.author.id]
      }
    });

    console.log(
      `🍕 Food approved and posted for ${message.author.tag}`
    );

    try {
      await message.author.send(
        "✅ Your food picture was approved and posted in the Foodie channel!"
      );
    } catch {}

  } catch (error) {
    console.error(
      "❌ Failed to post approved food:",
      error.message
    );

    try {
      await message.author.send(
        "❌ The food was approved, but I couldn't post it. Please try again."
      );
    } catch {}
  }
});

// =====================================================
// DISCORD LOGIN
// =====================================================

client.login(DISCORD_TOKEN);
