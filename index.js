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
  console.error("DISCORD_TOKEN is missing!");
  process.exit(1);
}

if (!FOOD_CHANNEL_ID) {
  console.error("FOOD_CHANNEL_ID is missing!");
  process.exit(1);
}

if (!OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY is missing!");
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
// DELETE MESSAGE
// ==================================================

async function deleteMessage(message, reason) {
  console.log("========================================");
  console.log("DELETE ACTION");
  console.log(`Message ID: ${message.id}`);
  console.log(`Author: ${message.author.tag}`);
  console.log(`Author ID: ${message.author.id}`);
  console.log(`Webhook ID: ${message.webhookId || "NONE"}`);
  console.log(`Message Type: ${message.type}`);
  console.log(`Reason: ${reason}`);
  console.log("========================================");

  try {
    await message.delete();

    console.log(
      `Message ${message.id} deleted successfully.`
    );

  } catch (error) {
    console.error(
      `MESSAGE DELETE FAILED (${message.id}):`,
      error.message
    );
  }
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
// EXTRACT FRAMES FROM VIDEO/GIF
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
    // Extract up to 4 frames spread through the media.
    // For short videos/GIFs, FFmpeg will simply produce
    // however many frames are available.

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

    // If the media was very short, try to get at least
    // one frame.
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
// CONVERT IMAGE TO DATA URL
// ==================================================

function fileToDataUrl(filePath) {
  const buffer = fs.readFileSync(filePath);

  return `data:image/jpeg;base64,${buffer.toString(
    "base64"
  )}`;
}

// ==================================================
// AI CHECK MULTIPLE FRAMES
// ==================================================

async function isFoodFrames(framePaths) {
  if (!framePaths || framePaths.length === 0) {
    console.log("No frames available for AI check.");
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

    console.log(
      `AI RESULT: ${result}`
    );

    return result === "YES";

  } catch (error) {
    console.error(
      "AI FOOD CHECK FAILED:",
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

  const extension = isGif
    ? "gif"
    : "image";

  let actualExtension = extension;

  if (!isGif) {
    const match = name.match(
      /\.(jpg|jpeg|png|webp)$/i
    );

    if (match) {
      actualExtension = match[1].toLowerCase();
    } else {
      actualExtension = "jpg";
    }
  }

  console.log(
    `Checking ${isGif ? "GIF" : "IMAGE"} for food...`
  );

  const extracted = await extractFrames(
    url,
    actualExtension
  );

  try {
    const result = await isFoodFrames(
      extracted.framePaths
    );

    return result;

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
    "Checking VIDEO frames for food..."
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
      `Extracted ${extracted.framePaths.length} video frame(s).`
    );

    const result = await isFoodFrames(
      extracted.framePaths
    );

    return result;

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
        "Food channel not found."
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
        "Foodie Reminder already exists."
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
      `Foodie Reminder sent and pinned. Message ID: ${reminder.id}`
    );

  } catch (error) {
    console.error(
      "Reminder error:",
      error.message
    );
  }
}

// ==================================================
// BOT READY
// ==================================================

client.once("ready", async () => {
  console.log("========================================");
  console.log(
    `Logged in as: ${client.user.tag}`
  );
  console.log(
    `Bot ID: ${client.user.id}`
  );
  console.log(
    `Watching food channel: ${FOOD_CHANNEL_ID}`
  );
  console.log("========================================");

  await sendFoodReminder();
});

// ==================================================
// MESSAGE HANDLER
// ==================================================

client.on(
  "messageCreate",
  async (message) => {

    // ==================================================
    // DETAILED MESSAGE LOG
    // ==================================================

    console.log("========================================");
    console.log("[MESSAGE RECEIVED]");
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
      `Content: ${message.content || "[NO TEXT]"}`
    );
    console.log(
      `Attachments: ${message.attachments.size}`
    );
    console.log(
      `Stickers: ${message.stickers.size}`
    );
    console.log("========================================");

    try {

      // ==================================================
      // ONLY FOOD CHANNEL
      // ==================================================

      if (
        message.channel.id !==
        FOOD_CHANNEL_ID
      ) {
        console.log(
          `Ignored: different channel (${message.channel.id}).`
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
          "Ignored: Foodie Flex's own message."
        );

        return;
      }

      // ==================================================
      // DELETE OTHER BOT MESSAGES
      // ==================================================

      if (message.author.bot) {
        await deleteMessage(
          message,
          "bot message not allowed"
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
      // STICKER / SERVER STICKER
      // ==================================================

      const hasSticker =
        message.stickers &&
        message.stickers.size > 0;

      // ==================================================
      // LOG CONTENT CHECK
      // ==================================================

      console.log("========================================");
      console.log("[CONTENT CHECK]");
      console.log(
        `Message ID: ${message.id}`
      );
      console.log(
        `Trigger: ${hasTrigger}`
      );
      console.log(
        `Image/GIF: ${!!image}`
      );
      console.log(
        `Video: ${!!video}`
      );
      console.log(
        `Audio/Voice: ${!!audio}`
      );
      console.log(
        `Sticker: ${hasSticker}`
      );
      console.log("========================================");

      // ==================================================
      // NO TRIGGER = DELETE
      // ==================================================

      if (!hasTrigger) {

        await deleteMessage(
          message,
          "trigger missing"
        );

        return;
      }

      // ==================================================
      // AUDIO / VOICE = DELETE
      // ==================================================

      if (audio) {

        await deleteMessage(
          message,
          "voice/audio not allowed"
        );

        return;
      }

      // ==================================================
      // STICKER = DELETE
      // ==================================================

      if (hasSticker) {

        await deleteMessage(
          message,
          "sticker/server sticker not allowed"
        );

        return;
      }

      // ==================================================
      // TRIGGER WITHOUT MEDIA = DELETE
      // ==================================================

      if (!image && !video) {

        await deleteMessage(
          message,
          "trigger found but no image or video"
        );

        return;
      }

      // ==================================================
      // VIDEO CHECK
      // ==================================================

      if (video) {

        console.log(
          `Checking food video from ${message.author.tag}...`
        );

        let foodVideo = false;

        try {
          foodVideo = await checkVideo(
            video
          );

        } catch (error) {

          console.error(
            "VIDEO FOOD CHECK FAILED:",
            error.message
          );

          foodVideo = false;
        }

        if (!foodVideo) {

          await deleteMessage(
            message,
            "video is not food"
          );

          return;
        }

        // ==================================================
        // FOOD VIDEO APPROVED
        // ==================================================

        const originalMessageId =
          message.id;

        try {

          await message.delete();

          console.log(
            `Original food video ${originalMessageId} deleted successfully.`
          );

        } catch (error) {

          console.error(
            "Original video delete failed:",
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

        console.log(
          "========================================"
        );
        console.log(
          "FOOD VIDEO APPROVED"
        );
        console.log(
          `Original Message ID: ${originalMessageId}`
        );
        console.log(
          `New Message ID: ${reposted.id}`
        );
        console.log(
          "========================================"
        );

        return;
      }

      // ==================================================
      // IMAGE / GIF CHECK
      // ==================================================

      if (image) {

        console.log(
          `Checking food image/GIF from ${message.author.tag}...`
        );

        let foodImage = false;

        try {

          foodImage =
            await checkImageOrGif(
              image
            );

        } catch (error) {

          console.error(
            "IMAGE/GIF FOOD CHECK FAILED:",
            error.message
          );

          foodImage = false;
        }

        // ==================================================
        // NOT FOOD = DELETE
        // ==================================================

        if (!foodImage) {

          await deleteMessage(
            message,
            "image/GIF is not food"
          );

          return;
        }

        // ==================================================
        // FOOD IMAGE/GIF APPROVED
        // ==================================================

        const originalMessageId =
          message.id;

        try {

          await message.delete();

          console.log(
            `Original food image ${originalMessageId} deleted successfully.`
          );

        } catch (error) {

          console.error(
            "Original image delete failed:",
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

        console.log(
          "========================================"
        );
        console.log(
          "FOOD IMAGE/GIF APPROVED"
        );
        console.log(
          `Original Message ID: ${originalMessageId}`
        );
        console.log(
          `New Message ID: ${reposted.id}`
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
        "unsupported content"
      );

    } catch (error) {

      console.error(
        "MESSAGE HANDLER ERROR:",
        error
      );
    }
  }
);

// ==================================================
// LOGIN
// ==================================================

client.login(DISCORD_TOKEN);
