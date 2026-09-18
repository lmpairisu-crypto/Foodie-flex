const express = require("express");
const {
  Client,
  GatewayIntentBits,
  MessageFlags,
} = require("discord.js");
const OpenAI = require("openai");

// ==========================================
// CONFIG
// ==========================================

const PORT = process.env.PORT || 10000;
const FOOD_CHANNEL_ID = "1550189625954402314";

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// ==========================================
// ENVIRONMENT
// ==========================================

if (!DISCORD_TOKEN) {
  console.error("❌ DISCORD_TOKEN is missing.");
  process.exit(1);
}

if (!OPENAI_API_KEY) {
  console.error("❌ OPENAI_API_KEY is missing.");
  process.exit(1);
}

// ==========================================
// HEALTH SERVER
// ==========================================

const app = express();

app.get("/", (req, res) => {
  res.send("Kain Po Tayo Team Ryzza Bot is online!");
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🌐 Health server running on port ${PORT}`);
});

// ==========================================
// OPENAI
// ==========================================

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

// ==========================================
// DISCORD
// ==========================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// ==========================================
// ONLY TRIGGER
// ==========================================

const TRIGGER = "kain";

function hasTrigger(message) {
  return message.content
    .toLowerCase()
    .includes(TRIGGER);
}

// ==========================================
// FOOD EMOJI SET
// ==========================================

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

// ==========================================
// ATTACHMENT TYPES
// ==========================================

function isImage(attachment) {
  const type = attachment.contentType || "";
  const name = attachment.name || "";

  return (
    type.startsWith("image/") ||
    /\.(jpg|jpeg|png|webp|gif)$/i.test(name)
  );
}

function isVideo(attachment) {
  const type = attachment.contentType || "";
  const name = attachment.name || "";

  return (
    type.startsWith("video/") ||
    /\.(mp4|mov|webm|mkv|avi|m4v)$/i.test(name)
  );
}

function isAudio(attachment) {
  const type = attachment.contentType || "";
  const name = attachment.name || "";

  return (
    type.startsWith("audio/") ||
    /\.(mp3|wav|ogg|m4a|aac|flac|opus)$/i.test(name)
  );
}

function isVoiceMessage(message) {
  try {
    if (
      typeof MessageFlags !== "undefined" &&
      MessageFlags.IsVoiceMessage !== undefined &&
      message.flags?.has(MessageFlags.IsVoiceMessage)
    ) {
      return true;
    }
  } catch {
    // Use attachment fallback below.
  }

  for (const attachment of message.attachments.values()) {
    if (
      attachment.duration_secs !== undefined ||
      attachment.waveform !== undefined
    ) {
      return true;
    }
  }

  return false;
}

function getFoodMedia(message) {
  return [...message.attachments.values()].filter(
    (attachment) =>
      isImage(attachment) || isVideo(attachment)
  );
}

// ==========================================
// AI FOOD CHECK
// ==========================================

async function isFood(mediaUrl, video = false) {
  try {
    const prompt = video
      ? `
Check this media for a food channel.

Does the media clearly show food or a meal?

Reply with ONLY:
YES
or
NO
`
      : `
Check this image for a food channel.

Does the image clearly show food or a meal?

Reply with ONLY:
YES
or
NO
`;

    const response = await openai.responses.create({
      model: "gpt-5.6-luna",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: prompt,
            },
            {
              type: "input_image",
              image_url: mediaUrl,
            },
          ],
        },
      ],
    });

    const answer = response.output_text
      .trim()
      .toUpperCase();

    console.log(`🤖 AI: ${answer}`);

    return answer.includes("YES");
  } catch (error) {
    console.error("❌ AI check failed:", error.message);
    return false;
  }
}

// ==========================================
// PRIVATE DM
// ==========================================

async function sendDM(user, text) {
  try {
    await user.send(text);
  } catch (error) {
    console.log(
      `⚠️ Could not DM ${user.tag}: ${error.message}`
    );
  }
}

// ==========================================
// SAFE DELETE
// ==========================================

async function safeDelete(message) {
  try {
    if (!message.deletable) {
      return false;
    }

    await message.delete();
    return true;
  } catch (error) {
    console.error(
      `❌ Delete failed for ${message.id}:`,
      error.message
    );

    return false;
  }
}

// ==========================================
// FOOD REMINDER
// ==========================================

function isFoodReminder(message) {
  if (!message.pinned) return false;
  if (!message.author?.bot) return false;
  if (!message.embeds?.length) return false;

  return message.embeds.some(
    (embed) => embed.title === "🍽️ Foodie Reminder"
  );
}

async function ensureFoodReminder(channel) {
  try {
    const messages = await channel.messages.fetch({
      limit: 100,
    });

    const existing = messages.find(
      (message) => isFoodReminder(message)
    );

    if (existing) {
      console.log("📌 Foodie Reminder already exists.");
      return;
    }

    const reminder = await channel.send({
      embeds: [
        {
          title: "🍽️ Foodie Reminder",
          description:
            "Post your food here with **kain** + a picture, GIF, or video.",
        },
      ],
    });

    await reminder.pin().catch(() => {});

    console.log("📌 Foodie Reminder created and pinned.");
  } catch (error) {
    console.error(
      "❌ Foodie Reminder error:",
      error.message
    );
  }
}

// ==========================================
// CLEANUP
// ==========================================

async function cleanup(channel, commandId) {
  console.log("🧹 Starting cleanup...");

  let scanned = 0;
  let deleted = 0;
  let kept = 0;
  let failed = 0;

  let before;

  while (true) {
    const options = {
      limit: 100,
    };

    if (before) {
      options.before = before;
    }

    let messages;

    try {
      messages = await channel.messages.fetch(options);
    } catch (error) {
      console.error(
        "❌ Could not fetch messages:",
        error.message
      );
      break;
    }

    if (messages.size === 0) {
      break;
    }

    for (const message of messages.values()) {
      scanned++;

      // Don't process the cleanup command itself.
      if (message.id === commandId) {
        continue;
      }

      // Keep the current pinned Foodie Reminder.
      if (isFoodReminder(message)) {
        kept++;
        continue;
      }

      // IMPORTANT:
      // Old bot messages are also deleted.
      if (await safeDelete(message)) {
        deleted++;
      } else {
        failed++;
      }
    }

    before = messages.last().id;

    if (messages.size < 100) {
      break;
    }
  }

  console.log(
    `🧹 Cleanup complete | Scanned ${scanned} | Deleted ${deleted} | Kept ${kept} | Failed ${failed}`
  );

  return {
    scanned,
    deleted,
    kept,
    failed,
  };
}

// ==========================================
// READY
// ==========================================

client.once("clientReady", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  console.log("🍽️ Kain Po Tayo Team Ryzza Bot is online!");

  const channel = await client.channels
    .fetch(FOOD_CHANNEL_ID)
    .catch(() => null);

  if (!channel) {
    console.error(
      `❌ Food channel ${FOOD_CHANNEL_ID} not found.`
    );
    return;
  }

  console.log(`🍽️ Food channel: #${channel.name}`);

  await ensureFoodReminder(channel);
});

// ==========================================
// MESSAGE HANDLER
// ==========================================

client.on("messageCreate", async (message) => {
  try {
    // Ignore all bots during normal live processing.
    if (message.author.bot) {
      return;
    }

    // Only food channel.
    if (message.channel.id !== FOOD_CHANNEL_ID) {
      return;
    }

    // ========================================
    // !CLEANUP
    // ========================================

    if (
      message.content.trim().toLowerCase() === "!cleanup"
    ) {
      const result = await cleanup(
        message.channel,
        message.id
      );

      await safeDelete(message);

      const summary = await message.channel.send(
        `🧹 **Cleanup complete!**\n` +
        `Scanned: **${result.scanned}**\n` +
        `Deleted: **${result.deleted}**\n` +
        `Kept reminder: **${result.kept}**\n` +
        `Failed: **${result.failed}**`
      );

      setTimeout(() => {
        safeDelete(summary).catch(() => {});
      }, 15000);

      return;
    }

    // ========================================
    // VOICE
    // ========================================

    if (isVoiceMessage(message)) {
      await safeDelete(message);
      return;
    }

    // ========================================
    // STICKERS
    // ========================================

    if (message.stickers?.size > 0) {
      await safeDelete(message);
      return;
    }

    // ========================================
    // AUDIO
    // ========================================

    const attachments = [
      ...message.attachments.values(),
    ];

    if (attachments.some(isAudio)) {
      await safeDelete(message);
      return;
    }

    // ========================================
    // FOOD MEDIA
    // ========================================

    const media = getFoodMedia(message);

    // Text / emoji only.
    if (media.length === 0) {
      await safeDelete(message);
      return;
    }

    // Media without "kain".
    if (!hasTrigger(message)) {
      await safeDelete(message);
      return;
    }

    // ========================================
    // AI CHECK
    // ========================================

    const sender = message.author;

    // Remove public submission immediately.
    await safeDelete(message);

    // Private status.
    await sendDM(
      sender,
      "🔎 Your food submission is being checked. Please wait..."
    );

    let approvedMedia = null;

    for (const attachment of media) {
      const video = isVideo(attachment);

      if (
        await isFood(
          attachment.url,
          video
        )
      ) {
        approvedMedia = attachment;
        break;
      }
    }

    // ========================================
    // REJECTED
    // ========================================

    if (!approvedMedia) {
      await sendDM(
        sender,
        "❌ Your submission wasn't approved because the media was not identified as food."
      );

      console.log(
        `❌ Rejected food submission from ${sender.tag}`
      );

      return;
    }

    // ========================================
    // APPROVED
    // ========================================

    const emoji = getFoodEmoji();

    const content =
      `**𝑲𝒂𝒊𝒏 𝑷𝒐 𝑻𝒂𝒚𝒐 𝑻𝒆𝒂𝒎 𝑹𝒚𝒛𝒛𝒂 ${emoji}**\n` +
      `👤 ${sender}`;

    try {
      await message.channel.send({
        content,
        files: [
          {
            attachment: approvedMedia.url,
          },
        ],
        allowedMentions: {
          users: [sender.id],
        },
      });

      await sendDM(
        sender,
        "✅ Your food submission was approved and posted!"
      );

      console.log(
        `✅ Approved food submission from ${sender.tag}`
      );
    } catch (error) {
      console.error(
        "❌ Could not publish approved food:",
        error.message
      );

      // Fallback if Discord cannot attach the deleted
      // attachment URL again.
      try {
        await message.channel.send({
          content:
            `${content}\n${approvedMedia.url}`,
          allowedMentions: {
            users: [sender.id],
          },
        });

        await sendDM(
          sender,
          "✅ Your food submission was approved and posted!"
        );
      } catch (fallbackError) {
        console.error(
          "❌ Fallback publish failed:",
          fallbackError.message
        );

        await sendDM(
          sender,
          "⚠️ Your submission passed the food check, but I couldn't publish the media."
        );
      }
    }
  } catch (error) {
    console.error(
      "❌ Message handler error:",
      error
    );
  }
});

// ==========================================
// LOGIN
// ==========================================

client.login(DISCORD_TOKEN);
