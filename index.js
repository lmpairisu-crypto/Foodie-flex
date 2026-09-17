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
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// FOOD CHANNEL ID IS BUILT DIRECTLY INTO THE CODE
const FOOD_CHANNEL_ID = "1550189625954402314";

const TRIGGER = "kain po tayo team ryzza";

if (!DISCORD_TOKEN) {
  console.error("❌ DISCORD_TOKEN is missing!");
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

// ==================================================
// LOG HELPERS
// ==================================================

function section(title) {
  console.log("");
  console.log("========================================");
  console.log(title);
  console.log("========================================");
}

function messageText(message) {
  return message.content && message.content.trim()
    ? message.content
    : "[NO TEXT]";
}

function attachmentNames(message) {
  const files = [...message.attachments.values()];

  if (!files.length) {
    return "NONE";
  }

  return files
    .map((file) =>
      file.name || file.contentType || "UNKNOWN"
    )
    .join(", ");
}

function deleteLog(message, type, reason) {
  section("🗑️ MESSAGE DELETED");

  console.log(`Author: ${message.author.tag}`);
  console.log(`Author ID: ${message.author.id}`);
  console.log(`Message ID: ${message.id}`);
  console.log(`Channel ID: ${message.channel.id}`);
  console.log(`Type: ${type}`);
  console.log(`Content: ${messageText(message)}`);
  console.log(`Attachments: ${attachmentNames(message)}`);
  console.log(`Stickers: ${message.stickers.size}`);
  console.log(`Reason: ${reason}`);
}

async function deleteMessage(message, type, reason) {
  deleteLog(message, type, reason);

  try {
    await message.delete();

    console.log(
      `✅ DELETE SUCCESS: ${message.id}`
    );

  } catch (error) {
    console.error(
      `❌ DELETE FAILED: ${message.id}`
    );

    console.error(
      error.message
    );
  }

  console.log("========================================");
}

// ==================================================
// DOWNLOAD MEDIA
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
// FFMPEG
// ==================================================

function runFFmpeg(args) {
  return new Promise((resolve, reject) => {
    execFile(
      ffmpegPath,
      args,
      { windowsHide: true },
      (error, stdout, stderr) => {
        if (error) {
          console.error("FFmpeg:", stderr);
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
// CLEAN TEMP FILES
// ==================================================

function cleanup(directory) {
  try {
    if (fs.existsSync(directory)) {
      fs.rmSync(directory, {
        recursive: true,
        force: true
      });
    }
  } catch (error) {
    console.error(
      "Cleanup failed:",
      error.message
    );
  }
}

// ==================================================
// EXTRACT MEDIA FRAMES
// ==================================================

async function extractFrames(url, extension) {
  const tempDir = fs.mkdtempSync(
    path.join(
      os.tmpdir(),
      "foodie-flex-"
    )
  );

  const inputPath = path.join(
    tempDir,
    `input.${extension}`
  );

  await downloadFile(
    url,
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

    if (!files.length) {
      const fallback = path.join(
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
        fallback
      ]);

      if (fs.existsSync(fallback)) {
        files = ["single.jpg"];
      }
    }

    return {
      tempDir,
      framePaths: files.map(
        (file) =>
          path.join(tempDir, file)
      )
    };

  } catch (error) {
    cleanup(tempDir);
    throw error;
  }
}

// ==================================================
// IMAGE → DATA URL
// ==================================================

function imageDataUrl(filePath) {
  const buffer =
    fs.readFileSync(filePath);

  return (
    "data:image/jpeg;base64," +
    buffer.toString("base64")
  );
}

// ==================================================
// AI FOOD CHECK
// ==================================================

async function aiFoodCheck(framePaths) {
  if (!framePaths.length) {
    console.log(
      "❌ No frames available."
    );

    return false;
  }

  try {
    const content = [
      {
        type: "input_text",
        text:
          "Check these frames from one Discord media post. " +
          "Reply ONLY YES if food or a food/drink item " +
          "is clearly shown as a main subject in at least one frame. " +
          "Reply ONLY NO otherwise. " +
          "People, animals, scenery, screenshots, memes, logos, " +
          "documents and ordinary objects are not food."
      }
    ];

    for (const frame of framePaths) {
      content.push({
        type: "input_image",
        image_url: imageDataUrl(frame)
      });
    }

    console.log(
      "🤖 Sending media to AI..."
    );

    const response =
      await openai.responses.create({
        model: "gpt-5.6-luna",
        input: [
          {
            role: "user",
            content
          }
        ]
      });

    const result =
      response.output_text
        .trim()
        .toUpperCase();

    console.log(
      `🤖 AI RESULT: ${result}`
    );

    return result === "YES";

  } catch (error) {
    console.error(
      "❌ AI CHECK FAILED:",
      error.message
    );

    return false;
  }
}

// ==================================================
// CHECK IMAGE / GIF
// ==================================================

async function checkImage(attachment) {
  const name =
    (attachment.name || "")
      .toLowerCase();

  const isGif =
    attachment.contentType === "image/gif" ||
    name.endsWith(".gif");

  const extension =
    isGif
      ? "gif"
      : (
          name.match(
            /\.(jpg|jpeg|png|webp)$/i
          )?.[1] || "jpg"
        );

  console.log(
    `🔎 Checking ${isGif ? "GIF" : "IMAGE"} with AI...`
  );

  const extracted =
    await extractFrames(
      attachment.url,
      extension
    );

  try {
    return await aiFoodCheck(
      extracted.framePaths
    );
  } finally {
    cleanup(
      extracted.tempDir
    );
  }
}

// ==================================================
// CHECK VIDEO
// ==================================================

async function checkVideo(attachment) {
  console.log(
    "🎥 Checking VIDEO with AI..."
  );

  const name =
    (attachment.name || "")
      .toLowerCase();

  const extension =
    name.match(
      /\.(mp4|mov|webm|mkv|avi)$/i
    )?.[1] || "mp4";

  const extracted =
    await extractFrames(
      attachment.url,
      extension
    );

  try {
    return await aiFoodCheck(
      extracted.framePaths
    );
  } finally {
    cleanup(
      extracted.tempDir
    );
  }
}

// ==================================================
// FOODIE REMINDER
// ==================================================

async function sendFoodReminder() {
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
        "❌ Food channel not found."
      );

      return;
    }

    const messages =
      await channel.messages.fetch({
        limit: 50
      });

    const existing =
      messages.find(
        (message) =>
          message.author.id ===
            client.user.id &&
          message.embeds.length > 0 &&
          message.embeds[0].title ===
            "🍽️ Foodie Reminder"
      );

    if (existing) {
      if (!existing.pinned) {
        await existing.pin()
          .catch(() => {});
      }

      console.log(
        "🍽️ Foodie Reminder already exists."
      );

      return;
    }

    const embed =
      new EmbedBuilder()
        .setTitle(
          "🍽️ Foodie Reminder"
        )
        .setDescription(
          "\u200B\n" +
          "**To post your food picture:**\n\n" +
          "Say **Kain Po Tayo Team Ryzza**\n" +
          "together with your food picture.\n\n" +
          "\u200B\n" +
          "🤖 **The Bot**\n\n" +
          "will check your picture and only allow food pictures."
        );

    const reminder =
      await channel.send({
        embeds: [embed]
      });

    await reminder.pin();

    console.log(
      `🍽️ Reminder sent and pinned: ${reminder.id}`
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

client.once(
  "ready",
  async () => {

    section(
      "🤖 FOODIE FLEX ONLINE"
    );

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
      "AI food checking: ENABLED"
    );

    console.log(
      "Fast deletion: ENABLED"
    );

    console.log(
      "========================================"
    );

    await sendFoodReminder();
  }
);

// ==================================================
// MESSAGE HANDLER
// ==================================================

client.on(
  "messageCreate",
  async (message) => {

    // --------------------------------------------------
    // IGNORE MESSAGES FROM OTHER CHANNELS
    // --------------------------------------------------

    if (
      message.channel.id !==
      FOOD_CHANNEL_ID
    ) {
      return;
    }

    // --------------------------------------------------
    // IGNORE FOODIE FLEX'S OWN MESSAGES
    // --------------------------------------------------

    if (
      message.author.id ===
      client.user.id
    ) {
      return;
    }

    section(
      "📨 MESSAGE RECEIVED"
    );

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
      `Content: ${messageText(message)}`
    );

    console.log(
      `Attachments: ${message.attachments.size}`
    );

    console.log(
      `Attachment Names: ${attachmentNames(message)}`
    );

    console.log(
      `Stickers: ${message.stickers.size}`
    );

    try {

      // --------------------------------------------------
      // OTHER BOT
      // --------------------------------------------------

      if (message.author.bot) {

        await deleteMessage(
          message,
          "BOT MESSAGE",
          "Other bot messages are not allowed"
        );

        return;
      }

      // --------------------------------------------------
      // BASIC CONTENT
      // --------------------------------------------------

      const content =
        (message.content || "")
          .trim();

      const lowerContent =
        content.toLowerCase();

      const hasTrigger =
        lowerContent.includes(
          TRIGGER
        );

      const attachments =
        [...message.attachments.values()];

      // --------------------------------------------------
      // STICKER
      // --------------------------------------------------

      const hasSticker =
        message.stickers.size > 0;

      // --------------------------------------------------
      // AUDIO
      // --------------------------------------------------

      const audio =
        attachments.find(
          (attachment) => {

            const type =
              attachment.contentType || "";

            const name =
              (attachment.name || "")
                .toLowerCase();

            return (
              type.startsWith("audio/") ||
              /\.(mp3|wav|ogg|m4a|aac|flac|opus)$/i
                .test(name)
            );
          }
        );

      // --------------------------------------------------
      // IMAGE / GIF
      // --------------------------------------------------

      const image =
        attachments.find(
          (attachment) => {

            const type =
              attachment.contentType || "";

            const name =
              (attachment.name || "")
                .toLowerCase();

            return (
              type.startsWith("image/") ||
              /\.(jpg|jpeg|png|webp|gif)$/i
                .test(name)
            );
          }
        );

      // --------------------------------------------------
      // VIDEO
      // --------------------------------------------------

      const video =
        attachments.find(
          (attachment) => {

            const type =
              attachment.contentType || "";

            const name =
              (attachment.name || "")
                .toLowerCase();

            return (
              type.startsWith("video/") ||
              /\.(mp4|mov|webm|mkv|avi)$/i
                .test(name)
            );
          }
        );

      // ==================================================
      // FAST DELETE SECTION
      // ==================================================

      // TEXT / EMOJI WITHOUT MEDIA
      if (
        !image &&
        !video &&
        !audio &&
        !hasSticker
      ) {

        await deleteMessage(
          message,
          "TEXT / EMOJI",
          "Text and emojis are not allowed in the food channel"
        );

        return;
      }

      // STICKER
      if (hasSticker) {

        await deleteMessage(
          message,
          "STICKER",
          "Stickers are not allowed"
        );

        return;
      }

      // AUDIO / VOICE
      if (audio) {

        await deleteMessage(
          message,
          "VOICE / AUDIO",
          "Voice/audio messages are not allowed"
        );

        return;
      }

      // ==================================================
      // NO TRIGGER
      // ==================================================

      if (!hasTrigger) {

        if (image) {

          const isGif =
            image.contentType ===
              "image/gif" ||
            (image.name || "")
              .toLowerCase()
              .endsWith(".gif");

          await deleteMessage(
            message,
            isGif ? "GIF" : "IMAGE",
            "Trigger missing — media posts require Kain Po Tayo Team Ryzza"
          );

          return;
        }

        if (video) {

          await deleteMessage(
            message,
            "VIDEO",
            "Trigger missing — video posts require Kain Po Tayo Team Ryzza"
          );

          return;
        }

        await deleteMessage(
          message,
          "UNSUPPORTED",
          "Trigger missing"
        );

        return;
      }

      // ==================================================
      // TRIGGER BUT NO MEDIA
      // ==================================================

      if (!image && !video) {

        await deleteMessage(
          message,
          "TEXT ONLY",
          "Trigger was found, but no image/GIF/video was attached"
        );

        return;
      }

      // ==================================================
      // VIDEO + TRIGGER
      // ==================================================

      if (video) {

        console.log(
          "🎥 Trigger found."
        );

        console.log(
          "🤖 Starting video AI check..."
        );

        let isFood = false;

        try {
          isFood =
            await checkVideo(video);
        } catch (error) {
          console.error(
            "Video check failed:",
            error.message
          );
        }

        if (!isFood) {

          await deleteMessage(
            message,
            "VIDEO",
            "AI determined that the video is not food"
          );

          return;
        }

        console.log(
          "✅ AI APPROVED — FOOD VIDEO"
        );

        const originalId =
          message.id;

        await message.delete();

        const reposted =
          await message.channel.send({
            content:
              "Kain Po Tayo Team Ryzza 🍽️",
            files: [video.url]
          });

        section(
          "✅ FOOD VIDEO APPROVED"
        );

        console.log(
          `Original: ${originalId}`
        );

        console.log(
          `Reposted: ${reposted.id}`
        );

        return;
      }

      // ==================================================
      // IMAGE / GIF + TRIGGER
      // ==================================================

      if (image) {

        const isGif =
          image.contentType ===
            "image/gif" ||
          (image.name || "")
            .toLowerCase()
            .endsWith(".gif");

        console.log(
          `🖼️ ${isGif ? "GIF" : "IMAGE"} + TRIGGER`
        );

        console.log(
          "🤖 Starting AI food check..."
        );

        let isFood = false;

        try {
          isFood =
            await checkImage(image);
        } catch (error) {
          console.error(
            "Image check failed:",
            error.message
          );
        }

        if (!isFood) {

          await deleteMessage(
            message,
            isGif ? "GIF" : "IMAGE",
            `AI determined that the ${isGif ? "GIF" : "image"} is not food`
          );

          return;
        }

        console.log(
          `✅ AI APPROVED — FOOD ${isGif ? "GIF" : "IMAGE"}`
        );

        const originalId =
          message.id;

        await message.delete();

        const reposted =
          await message.channel.send({
            content:
              "Kain Po Tayo Team Ryzza 🍽️",
            files: [image.url]
          });

        section(
          `✅ FOOD ${isGif ? "GIF" : "IMAGE"} APPROVED`
        );

        console.log(
          `Original: ${originalId}`
        );

        console.log(
          `Reposted: ${reposted.id}`
        );

        return;
      }

      // ==================================================
      // FALLBACK
      // ==================================================

      await deleteMessage(
        message,
        "UNKNOWN",
        "Unsupported content"
      );

    } catch (error) {

      console.error(
        "❌ MESSAGE HANDLER ERROR:"
      );

      console.error(
        error
      );
    }
  }
);

// ==================================================
// MANUAL OLD MESSAGE CLEANUP
// ==================================================

const CLEANUP_COMMAND = "!cleanup";

async function cleanupOldMessages(message) {
  // Only allow moderators with Manage Messages
  if (!message.member.permissions.has("ManageMessages")) {
    await message.reply(
      "❌ You need the **Manage Messages** permission to use this command."
    ).catch(() => {});

    return;
  }

  section("🧹 MANUAL CLEANUP STARTED");

  console.log(
    `Requested by: ${message.author.tag}`
  );

  console.log(
    `Channel: ${message.channel.id}`
  );

  // Fetch up to 100 recent messages at a time.
  let lastId = undefined;
  let totalScanned = 0;
  let totalDeleted = 0;

  try {
    while (true) {

      const options = {
        limit: 100
      };

      if (lastId) {
        options.before = lastId;
      }

      const messages =
        await message.channel.messages.fetch(
          options
        );

      if (messages.size === 0) {
        break;
      }

      lastId =
        messages.last().id;

      for (const oldMessage of messages.values()) {

        // Don't delete Foodie Flex's own messages
        if (
          oldMessage.author.id ===
          client.user.id
        ) {
          continue;
        }

        totalScanned++;

        const content =
          (oldMessage.content || "")
            .trim();

        const lowerContent =
          content.toLowerCase();

        const hasTrigger =
          lowerContent.includes(
            TRIGGER
          );

        const attachments =
          [...oldMessage.attachments.values()];

        const hasSticker =
          oldMessage.stickers.size > 0;

        // ------------------------------
        // AUDIO
        // ------------------------------

        const audio =
          attachments.find(
            (attachment) => {

              const type =
                attachment.contentType || "";

              const name =
                (attachment.name || "")
                  .toLowerCase();

              return (
                type.startsWith("audio/") ||
                /\.(mp3|wav|ogg|m4a|aac|flac|opus)$/i
                  .test(name)
              );
            }
          );

        // ------------------------------
        // IMAGE / GIF
        // ------------------------------

        const image =
          attachments.find(
            (attachment) => {

              const type =
                attachment.contentType || "";

              const name =
                (attachment.name || "")
                  .toLowerCase();

              return (
                type.startsWith("image/") ||
                /\.(jpg|jpeg|png|webp|gif)$/i
                  .test(name)
              );
            }
          );

        // ------------------------------
        // VIDEO
        // ------------------------------

        const video =
          attachments.find(
            (attachment) => {

              const type =
                attachment.contentType || "";

              const name =
                (attachment.name || "")
                  .toLowerCase();

              return (
                type.startsWith("video/") ||
                /\.(mp4|mov|webm|mkv|avi)$/i
                  .test(name)
              );
            }
          );

        // ------------------------------
        // TEXT / EMOJI
        // ------------------------------

        if (
          !image &&
          !video &&
          !audio &&
          !hasSticker
        ) {

          try {
            await oldMessage.delete();

            totalDeleted++;

            console.log(
              `🗑️ OLD DELETE — TEXT / EMOJI — ${oldMessage.id}`
            );

          } catch (error) {
            console.error(
              `❌ Could not delete ${oldMessage.id}:`,
              error.message
            );
          }

          continue;
        }

        // ------------------------------
        // STICKER
        // ------------------------------

        if (hasSticker) {

          try {
            await oldMessage.delete();

            totalDeleted++;

            console.log(
              `🗑️ OLD DELETE — STICKER — ${oldMessage.id}`
            );

          } catch (error) {
            console.error(
              `❌ Could not delete ${oldMessage.id}:`,
              error.message
            );
          }

          continue;
        }

        // ------------------------------
        // AUDIO / VOICE
        // ------------------------------

        if (audio) {

          try {
            await oldMessage.delete();

            totalDeleted++;

            console.log(
              `🗑️ OLD DELETE — VOICE / AUDIO — ${oldMessage.id}`
            );

          } catch (error) {
            console.error(
              `❌ Could not delete ${oldMessage.id}:`,
              error.message
            );
          }

          continue;
        }

        // ------------------------------
        // MEDIA WITHOUT TRIGGER
        // ------------------------------

        if (!hasTrigger) {

          const type =
            video
              ? "VIDEO"
              : image
                ? (
                    image.contentType ===
                      "image/gif" ||
                    (image.name || "")
                      .toLowerCase()
                      .endsWith(".gif")
                      ? "GIF"
                      : "IMAGE"
                  )
                : "UNKNOWN";

          try {
            await oldMessage.delete();

            totalDeleted++;

            console.log(
              `🗑️ OLD DELETE — ${type} — TRIGGER MISSING — ${oldMessage.id}`
            );

          } catch (error) {
            console.error(
              `❌ Could not delete ${oldMessage.id}:`,
              error.message
            );
          }

          continue;
        }

        // ------------------------------
        // TRIGGER + VIDEO
        // ------------------------------

        if (video) {

          console.log(
            `🤖 OLD VIDEO AI CHECK — ${oldMessage.id}`
          );

          let isFood = false;

          try {
            isFood =
              await checkVideo(video);
          } catch (error) {
            console.error(
              `❌ Old video AI check failed:`,
              error.message
            );
          }

          if (!isFood) {

            try {
              await oldMessage.delete();

              totalDeleted++;

              console.log(
                `🗑️ OLD DELETE — VIDEO NOT FOOD — ${oldMessage.id}`
              );

            } catch (error) {
              console.error(
                `❌ Could not delete ${oldMessage.id}:`,
                error.message
              );
            }

          } else {

            console.log(
              `✅ OLD VIDEO ALLOWED — FOOD — ${oldMessage.id}`
            );
          }

          continue;
        }

        // ------------------------------
        // TRIGGER + IMAGE / GIF
        // ------------------------------

        if (image) {

          const isGif =
            image.contentType ===
              "image/gif" ||
            (image.name || "")
              .toLowerCase()
              .endsWith(".gif");

          console.log(
            `🤖 OLD ${isGif ? "GIF" : "IMAGE"} AI CHECK — ${oldMessage.id}`
          );

          let isFood = false;

          try {
            isFood =
              await checkImage(image);
          } catch (error) {
            console.error(
              `❌ Old image AI check failed:`,
              error.message
            );
          }

          if (!isFood) {

            try {
              await oldMessage.delete();

              totalDeleted++;

              console.log(
                `🗑️ OLD DELETE — ${isGif ? "GIF" : "IMAGE"} NOT FOOD — ${oldMessage.id}`
              );

            } catch (error) {
              console.error(
                `❌ Could not delete ${oldMessage.id}:`,
                error.message
              );
            }

          } else {

            console.log(
              `✅ OLD ${isGif ? "GIF" : "IMAGE"} ALLOWED — FOOD — ${oldMessage.id}`
            );
          }

          continue;
        }
      }

      // If fewer than 100 were returned,
      // there are no more messages to scan.
      if (messages.size < 100) {
        break;
      }
    }

    section("✅ MANUAL CLEANUP COMPLETE");

    console.log(
      `Messages scanned: ${totalScanned}`
    );

    console.log(
      `Messages deleted: ${totalDeleted}`
    );

    await message.channel.send(
      `🧹 **Cleanup complete.**\n` +
      `Scanned: **${totalScanned}** messages\n` +
      `Deleted: **${totalDeleted}** messages`
    );

  } catch (error) {

    console.error(
      "❌ CLEANUP FAILED:",
      error
    );

    await message.channel.send(
      "❌ Cleanup failed. Check the Render logs."
    ).catch(() => {});
  }
}

// ==================================================
// CLEANUP COMMAND LISTENER
// ==================================================

client.on(
  "messageCreate",
  async (message) => {

    // Only Foodie Flex's food channel
    if (
      message.channel.id !==
      FOOD_CHANNEL_ID
    ) {
      return;
    }

    // Don't process bot commands
    if (message.author.bot) {
      return;
    }

    const content =
      (message.content || "")
        .trim()
        .toLowerCase();

    if (
      content !==
      CLEANUP_COMMAND
    ) {
      return;
    }

    // Delete the command itself
    await message.delete()
      .catch(() => {});

    await cleanupOldMessages(
      message
    );
  }
);

// ==================================================
// LOGIN
// ==================================================

client.login(
  DISCORD_TOKEN
);
