const express = require("express");
const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  MessageFlags
} = require("discord.js");
const OpenAI = require("openai");
const ffmpegPath = require("ffmpeg-static");

const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const { spawn } = require("child_process");

// ============================================================
// CONFIG
// ============================================================

const PORT = process.env.PORT || 10000;

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Food channel — hard-coded as requested
const FOOD_CHANNEL_ID = "1550189625954402314";

const TRIGGER = "kain po tayo team ryzza";

const AI_MODEL = "gpt-5.6-luna";

// ============================================================
// CHECK ENVIRONMENT VARIABLES
// ============================================================

if (!DISCORD_TOKEN) {
  console.error("❌ DISCORD_TOKEN is missing from Render Environment Variables.");
  process.exit(1);
}

if (!OPENAI_API_KEY) {
  console.error("❌ OPENAI_API_KEY is missing from Render Environment Variables.");
  process.exit(1);
}

console.log("✅ DISCORD_TOKEN found.");
console.log("✅ OPENAI_API_KEY found.");
console.log(`🍽️ Food channel: ${FOOD_CHANNEL_ID}`);

// ============================================================
// EXPRESS HEALTH SERVER
// ============================================================

const app = express();

app.get("/", (req, res) => {
  res.send("Kain Po Tayo Team Ryzza Bot is online!");
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🌐 Health server running on port ${PORT}`);
});

// ============================================================
// OPENAI
// ============================================================

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY
});

// ============================================================
// DISCORD CLIENT
// ============================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ============================================================
// TEMP DIRECTORY
// ============================================================

const TEMP_DIR = path.join(os.tmpdir(), "foodie-flex");

async function ensureTempDir() {
  await fsp.mkdir(TEMP_DIR, { recursive: true });
}

// ============================================================
// HELPER: TRIGGER CHECK
// ============================================================

function hasTrigger(message) {
  return message.content
    .toLowerCase()
    .includes(TRIGGER);
}

// ============================================================
// HELPER: ATTACHMENT TYPES
// ============================================================

function isImageAttachment(attachment) {
  const contentType = attachment.contentType || "";
  const name = attachment.name || "";

  return (
    contentType.startsWith("image/") ||
    /\.(jpg|jpeg|png|webp|gif)$/i.test(name)
  );
}

function isGifAttachment(attachment) {
  const contentType = attachment.contentType || "";
  const name = attachment.name || "";

  return (
    contentType === "image/gif" ||
    /\.gif$/i.test(name)
  );
}

function isVideoAttachment(attachment) {
  const contentType = attachment.contentType || "";
  const name = attachment.name || "";

  return (
    contentType.startsWith("video/") ||
    /\.(mp4|mov|webm|mkv|avi|m4v)$/i.test(name)
  );
}

function isAudioAttachment(attachment) {
  const contentType = attachment.contentType || "";
  const name = attachment.name || "";

  return (
    contentType.startsWith("audio/") ||
    /\.(mp3|wav|ogg|m4a|aac|flac|opus)$/i.test(name)
  );
}

// ============================================================
// HELPER: VOICE MESSAGE
// ============================================================

function isVoiceMessage(message) {
  // Native Discord Voice Message
  if (
    message.flags &&
    typeof message.flags.has === "function" &&
    message.flags.has(MessageFlags.IsVoiceMessage)
  ) {
    return true;
  }

  // Extra protection for Discord voice-message attachments
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

// ============================================================
// HELPER: MEDIA
// ============================================================

function getMediaAttachments(message) {
  return [...message.attachments.values()].filter((attachment) => {
    return (
      isImageAttachment(attachment) ||
      isVideoAttachment(attachment)
    );
  });
}

// ============================================================
// DELETE MESSAGE
// ============================================================

async function deleteMessage(message, reason) {
  try {
    console.log("========================================");
    console.log("🗑️ DELETE ACTION");
    console.log(`Message ID: ${message.id}`);
    console.log(`Author: ${message.author?.tag || "Unknown"}`);
    console.log(`Reason: ${reason}`);

    if (message.content) {
      console.log(`Content: ${message.content}`);
    }

    console.log("========================================");

    await message.delete();

    console.log(`✅ Message ${message.id} deleted successfully.`);

    return true;
  } catch (error) {
    console.error(`❌ Failed to delete message ${message.id}:`, error.message);

    return false;
  }
}

// ============================================================
// DOWNLOAD FILE
// ============================================================

async function downloadFile(url, extension = "bin") {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Download failed: HTTP ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  const filename =
    `${crypto.randomBytes(8).toString("hex")}.${extension}`;

  const filePath = path.join(TEMP_DIR, filename);

  await fsp.writeFile(filePath, buffer);

  return filePath;
}

// ============================================================
// FFMPEG FRAME EXTRACTION
// ============================================================

function extractFrames(inputPath, outputPrefix) {
  return new Promise((resolve, reject) => {
    const outputPattern = `${outputPrefix}-%02d.jpg`;

    const args = [
      "-y",
      "-i",
      inputPath,

      // Sample roughly 2 frames per second
      "-vf",
      "fps=2",

      // Maximum 4 frames
      "-frames:v",
      "4",

      "-q:v",
      "3",

      outputPattern
    ];

    console.log("🎞️ Extracting frames with FFmpeg...");

    const ffmpeg = spawn(ffmpegPath, args);

    let stderr = "";

    ffmpeg.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    ffmpeg.on("error", (error) => {
      reject(error);
    });

    ffmpeg.on("close", async (code) => {
      if (code !== 0) {
        reject(
          new Error(`FFmpeg failed with code ${code}: ${stderr}`)
        );
        return;
      }

      try {
        const files = await fsp.readdir(TEMP_DIR);

        const frames = files
          .filter((file) => file.startsWith(path.basename(outputPrefix)))
          .filter((file) => file.endsWith(".jpg"))
          .map((file) => path.join(TEMP_DIR, file))
          .sort();

        resolve(frames);
      } catch (error) {
        reject(error);
      }
    });
  });
}

// ============================================================
// AI FOOD CHECK — IMAGE
// ============================================================

async function checkImageWithAI(imageUrl) {
  console.log("🤖 AI checking image...");

  try {
    const response = await openai.responses.create({
      model: AI_MODEL,

      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text:
                "Determine whether this image clearly contains food or a meal. " +
                "Reply with ONLY FOOD or NOT_FOOD. " +
                "People eating food count as FOOD if food is clearly visible."
            },
            {
              type: "input_image",
              image_url: imageUrl
            }
          ]
        }
      ]
    });

    const result = response.output_text
      .trim()
      .toUpperCase();

    console.log(`🤖 AI result: ${result}`);

    return result.includes("FOOD");
  } catch (error) {
    console.error("❌ Image AI check failed:", error.message);

    // Fail closed: don't allow unverified media
    return false;
  }
}

// ============================================================
// AI FOOD CHECK — FRAMES
// ============================================================

async function checkFramesWithAI(framePaths) {
  console.log(`🤖 AI checking ${framePaths.length} frame(s)...`);

  const content = [
    {
      type: "input_text",
      text:
        "Determine whether these frames from one GIF/video contain food or a meal. " +
        "Reply with ONLY FOOD or NOT_FOOD. " +
        "If food is clearly visible in the frames, reply FOOD."
    }
  ];

  for (const framePath of framePaths) {
    const buffer = await fsp.readFile(framePath);

    const base64 = buffer.toString("base64");

    content.push({
      type: "input_image",
      image_url: `data:image/jpeg;base64,${base64}`
    });
  }

  try {
    const response = await openai.responses.create({
      model: AI_MODEL,

      input: [
        {
          role: "user",
          content
        }
      ]
    });

    const result = response.output_text
      .trim()
      .toUpperCase();

    console.log(`🤖 AI result: ${result}`);

    return result.includes("FOOD");
  } catch (error) {
    console.error("❌ Frame AI check failed:", error.message);

    return false;
  }
}

// ============================================================
// CHECK MEDIA WITH AI
// ============================================================

async function checkMediaWithAI(attachment) {
  const name = attachment.name || "unknown";
  const contentType = attachment.contentType || "";

  console.log(`🔎 Checking media: ${name}`);
  console.log(`Content type: ${contentType}`);

  // ----------------------------------------------------------
  // Normal image
  // ----------------------------------------------------------

  if (
    isImageAttachment(attachment) &&
    !isGifAttachment(attachment)
  ) {
    return await checkImageWithAI(attachment.url);
  }

  // ----------------------------------------------------------
  // GIF
  // ----------------------------------------------------------

  if (isGifAttachment(attachment)) {
    let inputPath = null;
    let frames = [];

    try {
      inputPath = await downloadFile(attachment.url, "gif");

      const prefix = path.join(
        TEMP_DIR,
        `gif-${crypto.randomBytes(6).toString("hex")}`
      );

      frames = await extractFrames(inputPath, prefix);

      if (frames.length === 0) {
        console.log("❌ No GIF frames extracted.");
        return false;
      }

      return await checkFramesWithAI(frames);
    } catch (error) {
      console.error("❌ GIF processing failed:", error.message);
      return false;
    } finally {
      if (inputPath) {
        await fsp.unlink(inputPath).catch(() => {});
      }

      for (const frame of frames) {
        await fsp.unlink(frame).catch(() => {});
      }
    }
  }

  // ----------------------------------------------------------
  // Video
  // ----------------------------------------------------------

  if (isVideoAttachment(attachment)) {
    let inputPath = null;
    let frames = [];

    try {
      let extension = "mp4";

      if (/\.(webm)$/i.test(name)) extension = "webm";
      if (/\.(mov)$/i.test(name)) extension = "mov";
      if (/\.(mkv)$/i.test(name)) extension = "mkv";

      inputPath = await downloadFile(
        attachment.url,
        extension
      );

      const prefix = path.join(
        TEMP_DIR,
        `video-${crypto.randomBytes(6).toString("hex")}`
      );

      frames = await extractFrames(inputPath, prefix);

      if (frames.length === 0) {
        console.log("❌ No video frames extracted.");
        return false;
      }

      return await checkFramesWithAI(frames);
    } catch (error) {
      console.error("❌ Video processing failed:", error.message);
      return false;
    } finally {
      if (inputPath) {
        await fsp.unlink(inputPath).catch(() => {});
      }

      for (const frame of frames) {
        await fsp.unlink(frame).catch(() => {});
      }
    }
  }

  return false;
}

// ============================================================
// REPOST APPROVED FOOD
// ============================================================

async function repostApprovedFood(message, attachment) {
  try {
    const sender = message.author;

    await message.delete();

    await message.channel.send({
      content:
        `Kain Po Tayo Team Ryzza 🍽️\n` +
        `👤 Sent by: ${sender}`
      ,
      files: [
        {
          attachment: attachment.url,
          name: attachment.name || "food"
        }
      ]
    });

    console.log(
      `✅ Approved food reposted. Original sender: ${sender.tag}`
    );

    return true;
  } catch (error) {
    console.error("❌ Failed to repost approved food:", error.message);

    return false;
  }
}

// ============================================================
// FOOD REMINDER
// ============================================================

async function sendFoodReminder(channel) {
  try {
    const messages = await channel.messages.fetch({
      limit: 50
    });

    const existingReminder = messages.find((msg) => {
      if (!msg.author?.bot) return false;

      return msg.embeds.some(
        (embed) => embed.title === "🍽️ Foodie Reminder"
      );
    });

    if (existingReminder) {
      if (!existingReminder.pinned) {
        await existingReminder.pin().catch(() => {});
        console.log("📌 Existing Foodie Reminder pinned.");
      } else {
        console.log("📌 Foodie Reminder already exists.");
      }

      return;
    }

    const reminder = await channel.send({
      embeds: [
        {
          title: "🍽️ Foodie Reminder",
          description:
            "To post your food picture:\n\n" +
            "**Say Kain Po Tayo Team Ryzza**\n" +
            "together with your food picture.\n\n" +
            "🤖 **The Bot**\n" +
            "will check your picture and only allow food pictures."
        }
      ]
    });

    await reminder.pin().catch(() => {});

    console.log("📌 New Foodie Reminder created and pinned.");
  } catch (error) {
    console.error("❌ Failed to create Foodie Reminder:", error.message);
  }
}

// ============================================================
// CLEANUP OLD MESSAGES
// ============================================================

async function cleanupFoodChannel(channel) {
  console.log("========================================");
  console.log("🧹 STARTING FULL FOOD CHANNEL CLEANUP");
  console.log(`Channel: ${channel.name}`);
  console.log(`Channel ID: ${channel.id}`);
  console.log("========================================");

  let scanned = 0;
  let deleted = 0;
  let foodKept = 0;

  let before = undefined;

  while (true) {
    let batch;

    try {
      const options = {
        limit: 100
      };

      if (before) {
        options.before = before;
      }

      batch = await channel.messages.fetch(options);
    } catch (error) {
      console.error(
        "❌ Failed to fetch message history:",
        error.message
      );

      break;
    }

    if (batch.size === 0) {
      break;
    }

    console.log(`📥 Fetched ${batch.size} messages.`);

    for (const message of batch.values()) {
      scanned++;

      // Never delete this bot's own messages
      if (message.author?.id === client.user.id) {
        continue;
      }

      // --------------------------------------------------------
      // VOICE MESSAGE
      // --------------------------------------------------------

      if (isVoiceMessage(message)) {
        if (await deleteMessage(message, "Voice message")) {
          deleted++;
        }

        continue;
      }

      // --------------------------------------------------------
      // STICKER
      // --------------------------------------------------------

      if (message.stickers && message.stickers.size > 0) {
        if (await deleteMessage(message, "Sticker / server sticker")) {
          deleted++;
        }

        continue;
      }

      // --------------------------------------------------------
      // AUDIO
      // --------------------------------------------------------

      const hasAudio = [...message.attachments.values()].some(
        isAudioAttachment
      );

      if (hasAudio) {
        if (await deleteMessage(message, "Audio message")) {
          deleted++;
        }

        continue;
      }

      // --------------------------------------------------------
      // MEDIA
      // --------------------------------------------------------

      const media = getMediaAttachments(message);

      // --------------------------------------------------------
      // NO MEDIA
      // --------------------------------------------------------

      if (media.length === 0) {
        if (await deleteMessage(
          message,
          "Text / emoji without food media"
        )) {
          deleted++;
        }

        continue;
      }

      // --------------------------------------------------------
      // MEDIA WITHOUT TRIGGER
      // --------------------------------------------------------

      if (!hasTrigger(message)) {
        if (await deleteMessage(
          message,
          "Image / GIF / video without trigger"
        )) {
          deleted++;
        }

        continue;
      }

      // --------------------------------------------------------
      // MEDIA + TRIGGER
      // --------------------------------------------------------

      let messageIsFood = false;

      for (const attachment of media) {
        const approved = await checkMediaWithAI(attachment);

        if (approved) {
          messageIsFood = true;
          break;
        }
      }

      if (messageIsFood) {
        foodKept++;

        console.log(
          `🍽️ Food kept: ${message.id} from ${message.author.tag}`
        );
      } else {
        if (await deleteMessage(
          message,
          "AI determined media is not food"
        )) {
          deleted++;
        }
      }
    }

    // Move backward in history
    const oldestMessage = batch.last();

    if (!oldestMessage) {
      break;
    }

    before = oldestMessage.id;

    // If fewer than 100 were returned, we've reached the beginning.
    if (batch.size < 100) {
      break;
    }

    // Small delay to reduce pressure on Discord API
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  console.log("========================================");
  console.log("🧹 CLEANUP FINISHED");
  console.log(`Scanned: ${scanned}`);
  console.log(`Deleted: ${deleted}`);
  console.log(`Food kept: ${foodKept}`);
  console.log("========================================");

  return {
    scanned,
    deleted,
    foodKept
  };
}

// ============================================================
// BOT READY
// ============================================================

client.once("ready", async () => {
  console.log("========================================");
  console.log(`🤖 Logged in as ${client.user.tag}`);
  console.log(`🆔 Bot ID: ${client.user.id}`);
  console.log("========================================");

  try {
    const channel = await client.channels.fetch(
      FOOD_CHANNEL_ID
    );

    if (!channel) {
      console.error("❌ Food channel not found.");
      return;
    }

    if (!channel.isTextBased()) {
      console.error("❌ Food channel is not a text channel.");
      return;
    }

    console.log(
      `🍽️ Food channel found: ${channel.name} (${channel.id})`
    );

    await sendFoodReminder(channel);
  } catch (error) {
    console.error(
      "❌ Failed to initialize food channel:",
      error.message
    );
  }
});

// ============================================================
// MESSAGE HANDLER
// ============================================================

client.on("messageCreate", async (message) => {
  try {
    // ----------------------------------------------------------
    // ONLY FOOD CHANNEL
    // ----------------------------------------------------------

    if (message.channel.id !== FOOD_CHANNEL_ID) {
      return;
    }

    // ----------------------------------------------------------
    // IGNORE THIS BOT'S OWN MESSAGES
    // ----------------------------------------------------------

    if (message.author.id === client.user.id) {
      return;
    }

    console.log("========================================");
    console.log("📨 MESSAGE RECEIVED");
    console.log(`Message ID: ${message.id}`);
    console.log(`Author: ${message.author.tag}`);
    console.log(`Channel ID: ${message.channel.id}`);
    console.log(`Content: ${message.content || "[NO TEXT]"}`);
    console.log(`Attachments: ${message.attachments.size}`);
    console.log(`Stickers: ${message.stickers.size}`);
    console.log("========================================");

    // ----------------------------------------------------------
    // !cleanup
    // ----------------------------------------------------------

    if (
      message.content.trim().toLowerCase() === "!cleanup"
    ) {
      const member = message.member;

      if (
        !member ||
        !member.permissions.has(
          PermissionsBitField.Flags.ManageMessages
        )
      ) {
        console.log("❌ !cleanup denied: no Manage Messages permission.");

        await message.reply(
          "❌ You need **Manage Messages** permission to use `!cleanup`."
        );

        return;
      }

      console.log("🧹 !cleanup command accepted.");

      // Delete command after we record its ID.
      const commandId = message.id;

      const result = await cleanupFoodChannel(
        message.channel
      );

      // Delete the command itself
      try {
        const commandMessage =
          await message.channel.messages.fetch(commandId);

        await commandMessage.delete();
      } catch (error) {
        console.log(
          "ℹ️ Cleanup command was already deleted or unavailable."
        );
      }

      const summary = await message.channel.send({
        content:
          `🧹 **Cleanup complete.**\n` +
          `Scanned: **${result.scanned}** messages\n` +
          `Deleted: **${result.deleted}** messages\n` +
          `Food kept: **${result.foodKept}** messages`
      });

      setTimeout(() => {
        summary.delete().catch(() => {});
      }, 15000);

      return;
    }

    // ----------------------------------------------------------
    // NATIVE DISCORD VOICE MESSAGE
    // ----------------------------------------------------------

    if (isVoiceMessage(message)) {
      await deleteMessage(
        message,
        "Voice message / VM is not allowed"
      );

      return;
    }

    // ----------------------------------------------------------
    // STICKERS
    // ----------------------------------------------------------

    if (message.stickers && message.stickers.size > 0) {
      await deleteMessage(
        message,
        "Sticker / server sticker is not allowed"
      );

      return;
    }

    // ----------------------------------------------------------
    // AUDIO
    // ----------------------------------------------------------

    const hasAudio = [...message.attachments.values()].some(
      isAudioAttachment
    );

    if (hasAudio) {
      await deleteMessage(
        message,
        "Audio / voice audio is not allowed"
      );

      return;
    }

    // ----------------------------------------------------------
    // MEDIA
    // ----------------------------------------------------------

    const media = getMediaAttachments(message);

    // ----------------------------------------------------------
    // TEXT / EMOJI WITHOUT MEDIA
    // ----------------------------------------------------------

    if (media.length === 0) {
      await deleteMessage(
        message,
        "Text / emoji without food media"
      );

      return;
    }

    // ----------------------------------------------------------
    // MEDIA WITHOUT TRIGGER
    // ----------------------------------------------------------

    if (!hasTrigger(message)) {
      await deleteMessage(
        message,
        "Image / GIF / video without trigger"
      );

      return;
    }

    // ----------------------------------------------------------
    // MEDIA + TRIGGER
    // ----------------------------------------------------------

    console.log("🍽️ Trigger + media detected.");
    console.log("🤖 Starting AI food check...");

    let approvedAttachment = null;

    for (const attachment of media) {
      const approved = await checkMediaWithAI(attachment);

      if (approved) {
        approvedAttachment = attachment;
        break;
      }
    }

    // ----------------------------------------------------------
    // FOOD APPROVED
    // ----------------------------------------------------------

    if (approvedAttachment) {
      console.log("✅ AI APPROVED: FOOD");

      await repostApprovedFood(
        message,
        approvedAttachment
      );

      return;
    }

    // ----------------------------------------------------------
    // NOT FOOD
    // ----------------------------------------------------------

    console.log("❌ AI REJECTED: NOT FOOD");

    await deleteMessage(
      message,
      "AI determined media is not food"
    );
  } catch (error) {
    console.error(
      "❌ Message handler error:",
      error
    );
  }
});

// ============================================================
// LOGIN
// ============================================================

ensureTempDir()
  .then(async () => {
    console.log("📁 Temporary directory ready.");

    await client.login(DISCORD_TOKEN);

    console.log("🔐 Discord login started.");
  })
  .catch((error) => {
    console.error("❌ Startup error:", error);
    process.exit(1);
  });
