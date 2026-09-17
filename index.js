const express = require("express");
const OpenAI = require("openai");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFile } = require("child_process");
const ffmpegPath = require("ffmpeg-static");

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder
} = require("discord.js");

// ==================================================
// HEALTH SERVER
// ==================================================

const app = express();
const PORT = process.env.PORT || 10000;

app.get("/", (req, res) => {
  res.send("Kain Po Tayo Team Ryzza Bot is online!");
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Health server running on port ${PORT}`);
});

// ==================================================
// VARIABLES
// ==================================================

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const FOOD_CHANNEL_ID = process.env.FOOD_CHANNEL_ID;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!DISCORD_TOKEN) {
  console.error("❌ DISCORD_TOKEN is missing!");
  process.exit(1);
}

if (!FOOD_CHANNEL_ID) {
  console.error("❌ FOOD_CHANNEL_ID is missing!");
  process.exit(1);
}

if (!OPENAI_API_KEY) {
  console.error("❌ OPENAI_API_KEY is missing!");
  process.exit(1);
}

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY
});

// ==================================================
// DISCORD CLIENT
// ==================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const TRIGGER = "kain po tayo team ryzza";

// ==================================================
// LOG HELPERS
// ==================================================

function printSection(title) {
  console.log("");
  console.log("========================================");
  console.log(title);
  console.log("========================================");
}

function getMessageContent(message) {
  if (message.content && message.content.trim()) {
    return message.content;
  }

  return "[NO TEXT]";
}

function getAttachmentNames(message) {
  const attachments = [...message.attachments.values()];

  if (attachments.length === 0) {
    return "NONE";
  }

  return attachments
    .map((attachment) => {
      return attachment.name || attachment.contentType || "UNKNOWN";
    })
    .join(", ");
}

function getContentType(message) {
  const content = (message.content || "").trim();

  const attachments = [...message.attachments.values()];

  const hasSticker =
    message.stickers &&
    message.stickers.size > 0;

  const hasImage = attachments.some((attachment) => {
    const type = attachment.contentType || "";
    const name = (attachment.name || "").toLowerCase();

    return (
      type.startsWith("image/") ||
      /\.(jpg|jpeg|png|webp|gif)$/i.test(name)
    );
  });

  const hasVideo = attachments.some((attachment) => {
    const type = attachment.contentType || "";
    const name = (attachment.name || "").toLowerCase();

    return (
      type.startsWith("video/") ||
      /\.(mp4|mov|webm|mkv|avi)$/i.test(name)
    );
  });

  const hasAudio = attachments.some((attachment) => {
    const type = attachment.contentType || "";
    const name = (attachment.name || "").toLowerCase();

    return (
      type.startsWith("audio/") ||
      /\.(mp3|wav|ogg|m4a|aac|flac|opus)$/i.test(name)
    );
  });

  if (hasSticker) {
    return "STICKER";
  }

  if (hasAudio) {
    return "VOICE / AUDIO";
  }

  if (hasVideo) {
    return "VIDEO";
  }

  if (hasImage) {
    const isGif = attachments.some((attachment) => {
      const type = attachment.contentType || "";
      const name = (attachment.name || "").toLowerCase();

      return (
        type === "image/gif" ||
        name.endsWith(".gif")
      );
    });

    return isGif ? "GIF" : "IMAGE";
  }

  if (content) {
    return "TEXT / EMOJI";
  }

  return "EMPTY";
}

function logDeletion(message, type, reason) {
  printSection("🗑️ MESSAGE DELETED");

  console.log(`Author: ${message.author.tag}`);
  console.log(`Author ID: ${message.author.id}`);
  console.log(`Message ID: ${message.id}`);
  console.log(`Channel ID: ${message.channel.id}`);
  console.log(`Type: ${type}`);
  console.log(`Content: ${getMessageContent(message)}`);
  console.log(`Attachments: ${getAttachmentNames(message)}`);
  console.log(`Stickers: ${message.stickers.size}`);
  console.log(`Reason: ${reason}`);

  console.log("========================================");
}

async function deleteMessage(message, type, reason) {
  logDeletion(message, type, reason);

  try {
    await message.delete();

    console.log(
      `✅ DELETE SUCCESS — ${message.id}`
    );

  } catch (error) {
    console.error(
      `❌ DELETE FAILED — ${message.id}`
    );

    console.error(
      `Error: ${error.message}`
    );
  }

  console.log("========================================");
}

// ==================================================
// DOWNLOAD FILE
// ==================================================

async function downloadFile(url, outputPath) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Download failed: ${response.status} ${response.statusText}`
    );
  }

  const buffer = Buffer.from(
    await response.arrayBuffer()
  );

  fs.writeFileSync(outputPath, buffer);

  return outputPath;
}

// ==================================================
// RUN FFMPEG
// ==================================================

function runFFmpeg(args) {
  return new Promise((resolve, reject) => {
    execFile(
      ffmpegPath,
      args,
      {
        windowsHide: true
      },
      (error, stdout, stderr) => {
        if (error) {
          console.error("FFmpeg error:", stderr);
          reject(error);
          return;
        }

        resolve({
          stdout,
          stderr
        });
      }
    );
  });
}

// ==================================================
// EXTRACT FRAMES
// ==================================================

async function extractFrames(mediaUrl, extension) {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "foodie-flex-")
  );

  const inputPath = path.join(
    tempDir,
    `input.${extension}`
  );

  await downloadFile(
    mediaUrl,
    inputPath
  );

  const outputPattern = path.join(
    tempDir,
    "frame-%02d.jpg"
  );

  try {
    await runFFmpeg([
      "-y",
      "-i",
      inputPath,
      "-vf",
      "fps=1/2,scale=768:-2",
      "-frames:v",
      "4",
      "-q:v",
      "5",
      outputPattern
    ]);

    let files = fs
      .readdirSync(tempDir)
      .filter((file) =>
        /^frame-\d+\.jpg$/i.test(file)
      )
      .sort();

    if (files.length === 0) {
      const singleFrame = path.join(
        tempDir,
        "single.jpg"
      );

      await runFFmpeg([
        "-y",
        "-i",
        inputPath,
        "-frames:v",
        "1",
        "-q:v",
        "5",
        singleFrame
      ]);

      if (fs.existsSync(singleFrame)) {
        files = ["single.jpg"];
      }
    }

    const framePaths = files.map(
      (file) => path.join(tempDir, file)
    );

    return {
      tempDir,
      inputPath,
      framePaths
    };

  } catch (error) {
    cleanupDirectory(tempDir);
    throw error;
  }
}

// ==================================================
// CLEAN TEMP DIRECTORY
// ==================================================

function cleanupDirectory(directory) {
  try {
    if (fs.existsSync(directory)) {
      fs.rmSync(directory, {
        recursive: true,
        force: true
      });
    }
  } catch (error) {
    console.error(
      "Temporary file cleanup failed:",
      error.message
    );
  }
}

// ==================================================
// FILE → DATA URL
// ==================================================

function fileToDataUrl(filePath) {
  const buffer = fs.readFileSync(filePath);

  return `data:image/jpeg;base64,${buffer.toString(
    "base64"
  )}`;
}

// ==================================================
// AI FOOD CHECK
// ==================================================

async function isFoodFrames(framePaths) {
  if (!framePaths || framePaths.length === 0) {
    console.log("❌ No frames available for AI check.");
    return false;
  }

  try {
    const content = [
      {
        type: "input_text",
        text:
          "Check these frames from one Discord media post. " +
          "Reply ONLY YES if the media clearly shows food or a food/drink item " +
          "as a main subject in at least one frame. " +
          "Reply ONLY NO if it does not clearly show food. " +
          "People, animals, scenery, screenshots, memes, logos, documents, " +
          "ordinary objects, and unrelated content are NOT food."
      }
    ];

    for (const framePath of framePaths) {
      content.push({
        type: "input_image",
        image_url: fileToDataUrl(framePath)
      });
    }

    const response = await openai.responses.create({
      model: "gpt-5.6-luna",
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

    console.log(`🤖 AI FOOD RESULT: ${result}`);

    return result === "YES";

  } catch (error) {
    console.error(
      "❌ AI FOOD CHECK FAILED:",
      error.message
    );

    return false;
  }
}

// ==================================================
// CHECK IMAGE / GIF
// ==================================================

async function checkImageOrGif(attachment) {
  const url = attachment.url;

  const name = (
    attachment.name || ""
  ).toLowerCase();

  const isGif =
    attachment.contentType === "image/gif" ||
    name.endsWith(".gif") ||
    url.toLowerCase().includes(".gif");

  let actualExtension = "jpg";

  if (isGif) {
    actualExtension = "gif";
  } else {
    const match = name.match(
      /\.(jpg|jpeg|png|webp)$/i
    );

    if (match) {
      actualExtension = match[1].toLowerCase();
    }
  }

  console.log(
    `🔎 AI CHECK STARTED — ${isGif ? "GIF" : "IMAGE"}`
  );

  const extracted = await extractFrames(
    url,
    actualExtension
  );

  try {
    console.log(
      `Frames extracted: ${extracted.framePaths.length}`
    );

    return await isFoodFrames(
      extracted.framePaths
    );

  } finally {
    cleanupDirectory(
      extracted.tempDir
    );
  }
}

// ==================================================
// CHECK VIDEO
// ==================================================

async function checkVideo(attachment) {
  console.log(
    "🎥 AI CHECK STARTED — VIDEO"
  );

  const name = (
    attachment.name || ""
  ).toLowerCase();

  let extension = "mp4";

  const match = name.match(
    /\.(mp4|mov|webm|mkv|avi)$/i
  );

  if (match) {
    extension = match[1].toLowerCase();
  }

  const extracted = await extractFrames(
    attachment.url,
    extension
  );

  try {
    console.log(
      `Video frames extracted: ${extracted.framePaths.length}`
    );

    return await isFoodFrames(
      extracted.framePaths
    );

  } finally {
    cleanupDirectory(
      extracted.tempDir
    );
  }
}

// ==================================================
// FOODIE REMINDER
// ==================================================

async function sendFoodReminder() {
  try {
    const channel = await client.channels.fetch(
      FOOD_CHANNEL_ID
    );

    if (!channel || !channel.isTextBased()) {
      console.error(
        "❌ Food channel not found."
      );
      return;
    }

    const messages = await channel.messages.fetch({
      limit: 50
    });

    const existingReminder = messages.find(
      (msg) =>
        msg.author.id === client.user.id &&
        msg.embeds.length > 0 &&
        msg.embeds[0].title ===
          "🍽️ Foodie Reminder"
    );

    if (existingReminder) {
      if (!existingReminder.pinned) {
        await existingReminder
          .pin()
          .catch(() => {});
      }

      console.log(
        "🍽️ Foodie Reminder already exists."
      );

      return;
    }

    const embed = new EmbedBuilder()
      .setTitle("🍽️ Foodie Reminder")
      .setDescription(
        "\u200B\n" +
        "**To post your food picture:**\n\n" +
        "Say **Kain Po Tayo Team Ryzza**\n" +
        "together with your food picture.\n\n" +
        "\u200B\n" +
        "🤖 **The Bot**\n\n" +
        "will check your picture and only allow food pictures."
      );

    const reminder = await channel.send({
      embeds: [embed]
    });

    await reminder.pin();

    console.log(
      `🍽️ Foodie Reminder sent and pinned. Message ID: ${reminder.id}`
    );

  } catch (error) {
    console.error(
      "❌ Reminder error:",
      error.message
    );
  }
}

// ==================================================
// BOT READY
// ==================================================

client.once("ready", async () => {
  printSection("🤖 FOODIE FLEX ONLINE");

  console.log(
    `Logged in as: ${client.user.tag}`
  );

  console.log(
    `Bot ID: ${client.user.id}`
  );

  console.log(
    `Food Channel ID: ${FOOD_CHANNEL_ID}`
  );

  console.log(
    "Message moderation: ENABLED"
  );

  console.log(
    "AI food checking: ENABLED"
  );

  console.log(
    "========================================"
  );

  await sendFoodReminder();
});

// ==================================================
// MESSAGE HANDLER
// ==================================================

client.on(
  "messageCreate",
  async (message) => {

    // ==================================================
    // BASIC MESSAGE LOG
    // ==================================================

    printSection("📨 MESSAGE RECEIVED");

    console.log(
      `Message ID: ${message.id}`
    );

    console.log(
      `Channel ID: ${message.channel.id}`
    );

    console.log(
      `Author: ${message.author.tag}`
    );

    console.log(
      `Author ID: ${message.author.id}`
    );

    console.log(
      `Webhook ID: ${message.webhookId || "NONE"}`
    );

    console.log(
      `Message Type: ${message.type}`
    );

    console.log(
      `Bot Author: ${message.author.bot}`
    );

    console.log(
      `Content: ${getMessageContent(message)}`
    );

    console.log(
      `Attachments: ${message.attachments.size}`
    );

    console.log(
      `Attachment Names: ${getAttachmentNames(message)}`
    );

    console.log(
      `Stickers: ${message.stickers.size}`
    );

    try {

      // ==================================================
      // ONLY FOOD CHANNEL
      // ==================================================

      if (
        message.channel.id !==
        FOOD_CHANNEL_ID
      ) {
        console.log(
          `⏭️ IGNORED — Different channel`
        );

        console.log(
          `Channel: ${message.channel.id}`
        );

        return;
      }

      // ==================================================
      // IGNORE FOODIE FLEX'S OWN MESSAGES
      // ==================================================

      if (
        message.author.id ===
        client.user.id
      ) {
        console.log(
          "⏭️ IGNORED — Foodie Flex's own message"
        );

        return;
      }

      // ==================================================
      // DELETE OTHER BOT MESSAGES
      // ==================================================

      if (message.author.bot) {

        await deleteMessage(
          message,
          "BOT MESSAGE",
          "Other bot messages are not allowed in the food channel"
        );

        return;
      }

      // ==================================================
      // CONTENT
      // ==================================================

      const content = (
        message.content || ""
      )
        .toLowerCase()
        .trim();

      const hasTrigger =
        content.includes(TRIGGER);

      // ==================================================
      // ATTACHMENTS
      // ==================================================

      const attachments = [
        ...message.attachments.values()
      ];

      // ==================================================
      // IMAGE / GIF
      // ==================================================

      const image = attachments.find(
        (attachment) => {

          const type =
            attachment.contentType || "";

          const name =
            attachment.name || "";

          const url =
            attachment.url || "";

          return (
            type.startsWith("image/") ||
            /\.(jpg|jpeg|png|webp|gif)$/i.test(
              name
            ) ||
            /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(
              url
            )
          );
        }
      );

      // ==================================================
      // VIDEO
      // ==================================================

      const video = attachments.find(
        (attachment) => {

          const type =
            attachment.contentType || "";

          const name =
            attachment.name || "";

          const url =
            attachment.url || "";

          return (
            type.startsWith("video/") ||
            /\.(mp4|mov|webm|mkv|avi)$/i.test(
              name
            ) ||
            /\.(mp4|mov|webm|mkv|avi)(\?|$)/i.test(
              url
            )
          );
        }
      );

      // ==================================================
      // AUDIO / VOICE
      // ==================================================

      const audio = attachments.find(
        (attachment) => {

          const type =
            attachment.contentType || "";

          const name =
            attachment.name || "";

          return (
            type.startsWith("audio/") ||
            /\.(mp3|wav|ogg|m4a|aac|flac|opus)$/i.test(
              name
            )
          );
        }
      );

      // ==================================================
      // STICKER
      // ==================================================

      const hasSticker =
        message.stickers &&
        message.stickers.size > 0;

      // ==================================================
      // CONTENT CHECK LOG
      // ==================================================

      printSection("🔍 CONTENT CHECK");

      console.log(
        `Trigger: ${hasTrigger ? "YES" : "NO"}`
      );

      console.log(
        `Image: ${image ? "YES" : "NO"}`
      );

      console.log(
        `GIF: ${
          image &&
          (
            image.contentType === "image/gif" ||
            (image.name || "")
              .toLowerCase()
              .endsWith(".gif")
          )
            ? "YES"
            : "NO"
        }`
      );

      console.log(
        `Video: ${video ? "YES" : "NO"}`
      );

      console.log(
        `Audio / Voice: ${audio ? "YES" : "NO"}`
      );

      console.log(
        `Sticker: ${hasSticker ? "YES" : "NO"}`
      );

      console.log(
        `Text: ${
          content
            ? "YES"
            : "NO"
        }`
      );

      console.log(
        "========================================"
      );

      // ==================================================
      // NO TRIGGER
      // ==================================================

      if (!hasTrigger) {

        let reason =
          "Required trigger is missing";

        let type =
          getContentType(message);

        // Small text / emoji
        if (
          content &&
          !image &&
          !video &&
          !audio &&
          !hasSticker
        ) {

          reason =
            "Small words / normal text / emojis are not allowed";

          type =
            "SMALL TEXT / EMOJI";
        }

        if (hasSticker) {

          reason =
            "Sticker/server sticker is not allowed without the trigger";

          type =
            "STICKER";
        }

        if (image) {

          const isGif =
            image.contentType === "image/gif" ||
            (image.name || "")
              .toLowerCase()
              .endsWith(".gif");

          type =
            isGif
              ? "GIF"
              : "IMAGE";

          reason =
            `Trigger missing — ${type.toLowerCase()} posts require "Kain Po Tayo Team Ryzza"`;
        }

        if (video) {

          type =
            "VIDEO";

          reason =
            'Trigger missing — video posts require "Kain Po Tayo Team Ryzza"';
        }

        if (audio) {

          type =
            "VOICE / AUDIO";

          reason =
            "Voice/audio messages are not allowed";
        }

        await deleteMessage(
          message,
          type,
          reason
        );

        return;
      }

      // ==================================================
      // AUDIO / VOICE
      // ==================================================

      if (audio) {

        await deleteMessage(
          message,
          "VOICE / AUDIO",
          "Voice/audio messages are not allowed, even with the trigger"
        );

        return;
      }

      // ==================================================
      // STICKER
      // ==================================================

      if (hasSticker) {

        await deleteMessage(
          message,
          "STICKER",
          "Stickers/server stickers are not allowed"
        );

        return;
      }

      // ==================================================
      // TRIGGER WITHOUT MEDIA
      // ==================================================

      if (!image && !video) {

        await deleteMessage(
          message,
          "TEXT ONLY",
          'Trigger found, but no food image/GIF/video was attached'
        );

        return;
      }

      // ==================================================
      // VIDEO
      // ==================================================

      if (video) {

        console.log("");
        console.log("🎥 VIDEO FOOD CHECK");
        console.log(
          `Author: ${message.author.tag}`
        );
        console.log(
          "AI is checking video frames..."
        );

        let foodVideo = false;

        try {

          foodVideo =
            await checkVideo(video);

        } catch (error) {

          console.error(
            "❌ VIDEO FOOD CHECK FAILED:",
            error.message
          );

          foodVideo = false;
        }

        if (!foodVideo) {

          await deleteMessage(
            message,
            "VIDEO",
            "AI check says the video does not clearly show food"
          );

          return;
        }

        // ==================================================
        // FOOD VIDEO APPROVED
        // ==================================================

        console.log(
          "✅ AI APPROVED — VIDEO IS FOOD"
        );

        const originalMessageId =
          message.id;

        try {

          await message.delete();

          console.log(
            `Original video ${originalMessageId} deleted successfully.`
          );

        } catch (error) {

          console.error(
            "❌ Original video delete failed:",
            error.message
          );

          return;
        }

        const reposted =
          await message.channel.send({
            content:
              "Kain Po Tayo Team Ryzza 🍽️",
            files: [video.url]
          });

        printSection("✅ FOOD VIDEO APPROVED");

        console.log(
          `Original Message ID: ${originalMessageId}`
        );

        console.log(
          `Reposted Message ID: ${reposted.id}`
        );

        console.log(
          "Result: FOOD VIDEO ALLOWED"
        );

        console.log(
          "========================================"
        );

        return;
      }

      // ==================================================
      // IMAGE / GIF
      // ==================================================

      if (image) {

        const isGif =
          image.contentType === "image/gif" ||
          (image.name || "")
            .toLowerCase()
            .endsWith(".gif");

        const mediaType =
          isGif
            ? "GIF"
            : "IMAGE";

        console.log("");
        console.log(
          `🖼️ ${mediaType} FOOD CHECK`
        );

        console.log(
          `Author: ${message.author.tag}`
        );

        console.log(
          "AI is checking media..."
        );

        let foodImage = false;

        try {

          foodImage =
            await checkImageOrGif(
              image
            );

        } catch (error) {

          console.error(
            `❌ ${mediaType} FOOD CHECK FAILED:`,
            error.message
          );

          foodImage = false;
        }

        // ==================================================
        // NOT FOOD
        // ==================================================

        if (!foodImage) {

          await deleteMessage(
            message,
            mediaType,
            `AI check says the ${mediaType.toLowerCase()} does not clearly show food`
          );

          return;
        }

        // ==================================================
        // FOOD APPROVED
        // ==================================================

        console.log(
          `✅ AI APPROVED — ${mediaType} IS FOOD`
        );

        const originalMessageId =
          message.id;

        try {

          await message.delete();

          console.log(
            `Original ${mediaType.toLowerCase()} ${originalMessageId} deleted successfully.`
          );

        } catch (error) {

          console.error(
            `❌ Original ${mediaType.toLowerCase()} delete failed:`,
            error.message
          );

          return;
        }

        const reposted =
          await message.channel.send({
            content:
              "Kain Po Tayo Team Ryzza 🍽️",
            files: [image.url]
          });

        printSection(
          `✅ FOOD ${mediaType} APPROVED`
        );

        console.log(
          `Original Message ID: ${originalMessageId}`
        );

        console.log(
          `Reposted Message ID: ${reposted.id}`
        );

        console.log(
          `Result: FOOD ${mediaType} ALLOWED`
        );

        console.log(
          "========================================"
        );

        return;
      }

      // ==================================================
      // FALLBACK
      // ==================================================

      await deleteMessage(
        message,
        getContentType(message),
        "Unsupported content"
      );

    } catch (error) {

      console.error("");
      console.error(
        "❌ MESSAGE HANDLER ERROR"
      );

      console.error(
        error
      );

      console.error(
        "========================================"
      );
    }
  }
);

// ==================================================
// LOGIN
// ==================================================

client.login(DISCORD_TOKEN);
